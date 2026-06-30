const fs = require('fs');
const path = require('path');
const { handleIncomingMessage } = require('./flows');

let openWa = null;
let client = null;
let starting = false;
let backgroundPromise = null;

const state = {
  enabled: String(process.env.ENABLE_WHATSAPP || 'true') === 'true',
  sessionId: process.env.WA_SESSION_ID || 'paranapop-empregos',
  ready: false,
  qr: null,
  status: String(process.env.WA_START_ON_BOOT || 'false') === 'true' ? 'Não iniciado' : 'Aguardando início manual pelo painel',
  lastError: null,
  startedAt: null,
  connectedAt: null,
  launchAttempts: 0
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
  const dataPath = process.env.WA_SESSION_DATA_PATH || '';
  const baseDir = dataPath ? path.resolve(process.cwd(), dataPath) : process.cwd();

  await removeIfExists(path.join(baseDir, `_IGNORE_${sessionId}`));
  await removeIfExists(path.join(baseDir, `${sessionId}.data.json`));
  await removeIfExists(sessionPath(`_IGNORE_${sessionId}`));
  await removeIfExists(sessionPath(`${sessionId}.data.json`));
}

async function stopBot() {
  try {
    if (client) {
      if (typeof client.kill === 'function') await client.kill();
      else if (typeof client.close === 'function') await client.close();
    }
  } catch (error) {
    console.warn('Erro ao encerrar OpenWA:', error.message);
  } finally {
    client = null;
    starting = false;
    state.ready = false;
    state.qr = null;
    state.status = 'WhatsApp parado';
  }
}

function setupQrListener() {
  if (!openWa?.ev || setupQrListener.done) return;
  setupQrListener.done = true;

  openWa.ev.on('qr.**', async (qrcode, sessionId) => {
    if (sessionId && sessionId !== state.sessionId) return;
    state.qr = qrcode;
    state.ready = false;
    state.status = 'Aguardando leitura do QR Code';
    state.lastError = null;
  });
}

function getOpenWaConfig() {
  const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const customUserAgent = process.env.WA_CUSTOM_USER_AGENT ||
    'WhatsApp/2.2412.54 Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

async function startBot(options = {}) {
  if (!state.enabled) {
    state.status = 'Desativado por ENABLE_WHATSAPP=false';
    return null;
  }
  if (client) return client;
  if (starting && backgroundPromise) return backgroundPromise;

  starting = true;
  state.startedAt = new Date();
  state.launchAttempts += 1;
  state.status = 'Iniciando OpenWA';
  state.lastError = null;

  if (options.cleanSession || boolEnv('WA_CLEAN_SESSION_ON_START', false)) {
    await cleanSessionArtifacts();
  }

  backgroundPromise = (async () => {
    try {
      openWa = require('@open-wa/wa-automate');
      setupQrListener();

      client = await openWa.create({
        ...getOpenWaConfig(),
        restartOnCrash: async () => {
          state.ready = false;
          state.status = 'Reiniciando depois de falha';
          client = null;
          starting = false;
          return startBot();
        }
      });

      state.ready = true;
      state.qr = null;
      state.status = 'Conectado';
      state.connectedAt = new Date();
      state.lastError = null;

      client.onMessage(async (message) => {
        try {
          await handleIncomingMessage(client, message);
        } catch (error) {
          console.error('Erro no fluxo do bot:', error);
          try {
            if (message?.from) {
              await client.sendText(message.from, 'Tive um erro interno ao processar sua mensagem. Envie *MENU* para tentar novamente.');
            }
          } catch (sendError) {
            console.error('Erro ao avisar usuário:', sendError.message);
          }
        }
      });

      if (typeof client.onStateChanged === 'function') {
        client.onStateChanged((waState) => {
          state.status = `WhatsApp: ${waState}`;
          if (String(waState).toUpperCase() === 'CONNECTED') {
            state.ready = true;
            state.qr = null;
            state.connectedAt = new Date();
          }
        });
      }

      return client;
    } catch (error) {
      state.ready = false;
      state.status = 'Erro ao iniciar OpenWA';
      state.lastError = error.message;
      client = null;
      console.error('Erro ao iniciar OpenWA:', error);

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
    state.status = 'Erro ao iniciar OpenWA';
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
    starting,
    qrAvailable: Boolean(state.qr),
    uptimeSeconds: state.startedAt ? Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000) : 0
  };
}

async function sendText(to, text) {
  if (!client) throw new Error('Bot ainda não conectado. Abra /admin/qr e conecte o WhatsApp primeiro.');
  return client.sendText(to, text);
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
