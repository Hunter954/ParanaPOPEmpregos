const { handleIncomingMessage } = require('./flows');

let openWa = null;
let client = null;
let starting = false;

const state = {
  enabled: String(process.env.ENABLE_WHATSAPP || 'true') === 'true',
  sessionId: process.env.WA_SESSION_ID || 'paranapop-empregos',
  ready: false,
  qr: null,
  status: 'Não iniciado',
  lastError: null,
  startedAt: null,
  connectedAt: null
};

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

async function startBot() {
  if (!state.enabled) {
    state.status = 'Desativado por ENABLE_WHATSAPP=false';
    return null;
  }
  if (client || starting) return client;

  starting = true;
  state.startedAt = new Date();
  state.status = 'Iniciando OpenWA';

  try {
    openWa = require('@open-wa/wa-automate');
    setupQrListener();

    const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    client = await openWa.create({
      sessionId: state.sessionId,
      headless: true,
      qrTimeout: 0,
      authTimeout: 0,
      qrLogSkip: false,
      useChrome: true,
      executablePath: chromePath,
      puppeteerOptions: {
        executablePath: chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-features=site-per-process',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions'
        ]
      },
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
    return null;
  } finally {
    starting = false;
  }
}

function getBotClient() {
  return client;
}

function getBotState() {
  return {
    ...state,
    qrAvailable: Boolean(state.qr),
    uptimeSeconds: state.startedAt ? Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000) : 0
  };
}

async function sendText(to, text) {
  if (!client) throw new Error('Bot ainda não conectado.');
  return client.sendText(to, text);
}

module.exports = {
  startBot,
  getBotClient,
  getBotState,
  sendText
};
