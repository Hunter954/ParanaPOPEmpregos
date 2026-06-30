const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');
const { handleIncomingMessage } = require('./flows');

let openWa = null;
let client = null;
let starting = false;
let backgroundPromise = null;
let baileysSocket = null;
let baileysSaveCreds = null;

const state = {
  enabled: String(process.env.ENABLE_WHATSAPP || 'true') === 'true',
  sessionId: process.env.WA_SESSION_ID || 'paranapop-empregos',
  engine: String(process.env.WHATSAPP_ENGINE || 'baileys').toLowerCase(),
  ready: false,
  qr: null,
  status: 'Aguardando início manual pelo painel',
  lastError: null,
  startedAt: null,
  connectedAt: null,
  launchAttempts: 0,
  lastQrAt: null
};

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (typeof value === 'undefined') return fallback;
  return ['true', '1', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getEngine() {
  const engine = String(process.env.WHATSAPP_ENGINE || state.engine || 'baileys').toLowerCase();
  if (['openwa', 'open-wa', 'wa-automate'].includes(engine)) return 'openwa';
  return 'baileys';
}

function sessionBaseDir() {
  const custom = process.env.WA_SESSION_DATA_PATH || '';
  return custom ? path.resolve(process.cwd(), custom) : process.cwd();
}

function sessionPath(...parts) {
  return path.join(process.cwd(), ...parts);
}

async function removeIfExists(target) {
  try {
    if (fs.existsSync(target)) {
      await fs.promises.rm(target, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(`Não foi possível limpar ${target}:`, error.message);
  }
}

async function cleanSessionArtifacts() {
  const sessionId = state.sessionId;
  const baseDir = sessionBaseDir();

  await removeIfExists(path.join(baseDir, `_IGNORE_${sessionId}`));
  await removeIfExists(path.join(baseDir, `${sessionId}.data.json`));
  await removeIfExists(path.join(baseDir, `baileys-${sessionId}`));
  await removeIfExists(sessionPath(`_IGNORE_${sessionId}`));
  await removeIfExists(sessionPath(`${sessionId}.data.json`));
  await removeIfExists(sessionPath(`baileys-${sessionId}`));
}

function normalizeToBaileysJid(jid) {
  const value = String(jid || '');
  if (!value) return value;
  if (value.endsWith('@s.whatsapp.net') || value.endsWith('@g.us')) return value;
  const phone = value.replace(/@.+$/, '').replace(/\D/g, '');
  return phone ? `${phone}@s.whatsapp.net` : value;
}

function normalizeToOpenWaJid(jid) {
  const value = String(jid || '');
  if (!value) return value;
  if (value.endsWith('@c.us') || value.endsWith('@g.us')) return value;
  const phone = value.replace(/@.+$/, '').replace(/\D/g, '');
  return phone ? `${phone}@c.us` : value;
}

async function stopBot() {
  try {
    if (client) {
      if (typeof client.kill === 'function') await client.kill();
      else if (typeof client.close === 'function') await client.close();
    }
  } catch (error) {
    console.warn('Erro ao encerrar OpenWA:', error.message);
  }

  try {
    if (baileysSocket) {
      baileysSocket.ev.removeAllListeners('connection.update');
      baileysSocket.ev.removeAllListeners('creds.update');
      baileysSocket.ev.removeAllListeners('messages.upsert');
      if (baileysSocket.ws?.close) baileysSocket.ws.close();
      if (typeof baileysSocket.logout === 'function' && boolEnv('WA_LOGOUT_ON_STOP', false)) {
        await baileysSocket.logout();
      }
    }
  } catch (error) {
    console.warn('Erro ao encerrar Baileys:', error.message);
  } finally {
    client = null;
    baileysSocket = null;
    baileysSaveCreds = null;
    starting = false;
    backgroundPromise = null;
    state.ready = false;
    state.qr = null;
    state.status = 'WhatsApp parado';
  }
}

function setupOpenWaQrListener() {
  if (!openWa?.ev || setupOpenWaQrListener.done) return;
  setupOpenWaQrListener.done = true;

  openWa.ev.on('qr.**', async (qrcode, sessionId) => {
    if (sessionId && sessionId !== state.sessionId) return;
    state.qr = qrcode;
    state.lastQrAt = new Date();
    state.ready = false;
    state.status = 'Aguardando leitura do QR Code';
    state.lastError = null;
  });
}

function getOpenWaConfig() {
  const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const customUserAgent = process.env.WA_CUSTOM_USER_AGENT ||
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  return {
    sessionId: state.sessionId,
    sessionDataPath: process.env.WA_SESSION_DATA_PATH || undefined,
    headless: true,
    useChrome: true,
    executablePath: chromePath,
    customUserAgent,
    qrTimeout: intEnv('WA_QR_TIMEOUT', 0),
    authTimeout: intEnv('WA_AUTH_TIMEOUT', 0),
    qrLogSkip: boolEnv('WA_QR_LOG_SKIP', true),
    killProcessOnTimeout: false,
    killProcessOnBan: false,
    multiDevice: boolEnv('WA_MULTI_DEVICE', true),
    cacheEnabled: boolEnv('WA_CACHE_ENABLED', false),
    autoRefresh: boolEnv('WA_AUTO_REFRESH', true),
    blockCrashLogs: true,
    blockAssets: false,
    skipUpdateCheck: true,
    disableSpins: true,
    logDebugInfoAsObject: true,
    screenshotOnInitializationBrowserError: boolEnv('WA_SCREENSHOT_ON_ERROR', true),
    timeout: intEnv('WA_BROWSER_TIMEOUT_MS', 120000),
    protocolTimeout: intEnv('WA_PROTOCOL_TIMEOUT_MS', 120000),
    chromiumArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-features=site-per-process',
      '--disable-web-security',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--window-size=1440,900',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  };
}

async function startOpenWa() {
  openWa = require('@open-wa/wa-automate');
  setupOpenWaQrListener();

  const openWaClient = await openWa.create({
    ...getOpenWaConfig(),
    restartOnCrash: async () => {
      state.ready = false;
      state.status = 'Reiniciando depois de falha';
      client = null;
      starting = false;
      return startBot();
    }
  });

  client = openWaClient;
  state.ready = true;
  state.qr = null;
  state.status = 'Conectado via OpenWA';
  state.connectedAt = new Date();
  state.lastError = null;

  client.onMessage(async (message) => {
    try {
      await handleIncomingMessage(client, message);
    } catch (error) {
      console.error('Erro no fluxo do bot:', error);
      try {
        if (message?.from) await client.sendText(message.from, 'Tive um erro interno ao processar sua mensagem. Envie *MENU* para tentar novamente.');
      } catch (sendError) {
        console.error('Erro ao avisar usuário:', sendError.message);
      }
    }
  });

  if (typeof client.onStateChanged === 'function') {
    client.onStateChanged((waState) => {
      state.status = `WhatsApp/OpenWA: ${waState}`;
      if (String(waState).toUpperCase() === 'CONNECTED') {
        state.ready = true;
        state.qr = null;
        state.connectedAt = new Date();
      }
    });
  }

  return client;
}

function getBaileysAuthDir() {
  const baseDir = sessionBaseDir();
  return path.join(baseDir, `baileys-${state.sessionId}`);
}

function getMessageBody(message) {
  const content = message?.message || {};
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.buttonsResponseMessage?.selectedButtonId ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

async function startBaileys() {
  const qrcode = require('qrcode');
  const baileys = require('@whiskeysockets/baileys');
  const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState
  } = baileys;

  const authDir = getBaileysAuthDir();
  await fs.promises.mkdir(authDir, { recursive: true });
  const auth = await useMultiFileAuthState(authDir);
  baileysSaveCreds = auth.saveCreds;

  const versionResult = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    version: versionResult.version,
    auth: auth.state,
    printQRInTerminal: false,
    browser: ['ParanáPOP Empregos', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: boolEnv('WA_MARK_ONLINE', false),
    generateHighQualityLinkPreview: false,
    defaultQueryTimeoutMs: intEnv('WA_QUERY_TIMEOUT_MS', 120000),
    connectTimeoutMs: intEnv('WA_CONNECT_TIMEOUT_MS', 120000)
  });

  baileysSocket = sock;
  client = {
    engine: 'baileys',
    sendText: async (jid, text) => sock.sendMessage(normalizeToBaileysJid(jid), { text })
  };

  sock.ev.on('creds.update', baileysSaveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.qr = await qrcode.toDataURL(qr, { margin: 1, scale: 8 });
      state.lastQrAt = new Date();
      state.ready = false;
      state.status = 'Aguardando leitura do QR Code';
      state.lastError = null;
    }

    if (connection === 'connecting') {
      state.status = state.qr ? 'Aguardando leitura do QR Code' : 'Conectando ao WhatsApp';
    }

    if (connection === 'open') {
      state.ready = true;
      state.qr = null;
      state.status = 'Conectado via Baileys';
      state.connectedAt = new Date();
      state.lastError = null;
    }

    if (connection === 'close') {
      state.ready = false;
      const reason = lastDisconnect?.error ? new Boom(lastDisconnect.error)?.output?.statusCode : undefined;
      const shouldReconnect = reason !== DisconnectReason.loggedOut && boolEnv('WA_AUTO_RECONNECT', true);
      state.status = shouldReconnect ? 'Conexão caiu, tentando reconectar' : 'WhatsApp desconectado';
      state.lastError = lastDisconnect?.error?.message || null;
      baileysSocket = null;
      client = null;
      if (shouldReconnect) {
        setTimeout(() => startBotInBackground(), intEnv('WA_RECONNECT_DELAY_MS', 5000));
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        const from = msg.key?.remoteJid;
        const body = getMessageBody(msg);
        const normalizedMessage = {
          from,
          body,
          caption: body,
          isGroupMsg: String(from || '').endsWith('@g.us'),
          fromMe: Boolean(msg.key?.fromMe),
          raw: msg
        };
        await handleIncomingMessage(client, normalizedMessage);
      } catch (error) {
        console.error('Erro no fluxo do bot:', error);
      }
    }
  });

  state.status = 'Conectando ao WhatsApp';
  return client;
}

async function startBot(options = {}) {
  if (!state.enabled) {
    state.status = 'Desativado por ENABLE_WHATSAPP=false';
    return null;
  }
  if (client || baileysSocket) return client;
  if (starting && backgroundPromise) return backgroundPromise;

  starting = true;
  state.startedAt = new Date();
  state.launchAttempts += 1;
  state.engine = getEngine();
  state.status = `Iniciando WhatsApp (${state.engine})`;
  state.lastError = null;

  if (options.cleanSession || boolEnv('WA_CLEAN_SESSION_ON_START', false)) {
    await cleanSessionArtifacts();
  }

  backgroundPromise = (async () => {
    try {
      if (state.engine === 'openwa') {
        return await startOpenWa();
      }
      return await startBaileys();
    } catch (error) {
      state.ready = false;
      state.status = 'Erro ao iniciar WhatsApp';
      state.lastError = error.message;
      client = null;
      baileysSocket = null;
      console.error('Erro ao iniciar WhatsApp:', error);

      if (boolEnv('WA_RETRY_CLEAN_SESSION', true) && state.launchAttempts < intEnv('WA_MAX_LAUNCH_ATTEMPTS', 2)) {
        state.status = 'Tentando novamente com sessão limpa';
        await cleanSessionArtifacts();
        starting = false;
        backgroundPromise = null;
        return startBot();
      }

      return null;
    } finally {
      starting = false;
      backgroundPromise = null;
    }
  })();

  return backgroundPromise;
}

function startBotInBackground(options = {}) {
  startBot(options).catch((error) => {
    state.ready = false;
    state.status = 'Erro ao iniciar WhatsApp';
    state.lastError = error.message;
    console.error('Falha ao iniciar bot em segundo plano:', error);
  });
}

function getBotClient() {
  return client;
}

function getBotState() {
  return {
    ...state,
    engine: getEngine(),
    starting,
    qrAvailable: Boolean(state.qr),
    uptimeSeconds: state.startedAt ? Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000) : 0
  };
}

async function sendText(to, text) {
  if (!client) throw new Error('Bot ainda não conectado. Abra /admin/qr e conecte o WhatsApp primeiro.');
  const target = getEngine() === 'openwa' ? normalizeToOpenWaJid(to) : normalizeToBaileysJid(to);
  return client.sendText(target, text);
}

module.exports = {
  startBot,
  startBotInBackground,
  stopBot,
  cleanSessionArtifacts,
  getBotClient,
  getBotState,
  sendText
};
