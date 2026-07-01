require('dotenv').config();
const http = require('http');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const path = require('path');
const db = require('./db');
const { startBotInBackground, getBotState } = require('./bot');

const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const APP_VERSION = '1.0.5-baileys-puro-portfix';

let migrationsReady = false;
let migrationsError = null;
let sessionStoreMode = 'memory';
let startupStarted = false;

function toBool(value, fallback = false) {
  if (typeof value === 'undefined') return fallback;
  return ['true', '1', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

function normalizePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

function portsToListen() {
  // Railway normalmente injeta PORT. Também escutamos 3000 e 8080 para sobreviver
  // quando PORT foi criado manualmente ou quando o proxy espera a porta comum do Docker.
  const candidates = [process.env.PORT, 3000, 8080]
    .map(normalizePort)
    .filter(Boolean);
  return [...new Set(candidates)];
}

function buildSessionConfig() {
  const config = {
    name: 'paranapop_empregos_sid',
    secret: process.env.SESSION_SECRET || 'troque-esta-chave',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  };

  const wantsPgSession = toBool(process.env.USE_PG_SESSION, false) || String(process.env.SESSION_STORE || '').toLowerCase() === 'postgres';
  if (wantsPgSession) {
    try {
      config.store = new PgSession({
        pool: db.getSessionPool(),
        tableName: 'session',
        createTableIfMissing: true
      });
      sessionStoreMode = 'postgres';
    } catch (error) {
      sessionStoreMode = 'memory-fallback';
      console.warn('Sessão PostgreSQL indisponível. Usando sessão em memória para manter o app online:', error.message);
    }
  }

  return config;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({ contentSecurityPolicy: false }));

// Rotas sem session e sem banco: precisam responder mesmo se tudo falhar.
app.get('/healthz', (req, res) => res.status(200).send('ok'));
app.get('/saude', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'ParanáPOP Empregos Bot',
    version: APP_VERSION,
    whatsappEngine: getBotState().engine,
    whatsappStatus: getBotState().status,
    sessionStoreMode,
    database: db.getDatabaseStatus(),
    migrationsReady,
    migrationsError: migrationsError ? migrationsError.message : null,
    portEnv: process.env.PORT || null,
    listeningPorts: portsToListen(),
    time: new Date().toISOString()
  });
});

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });
  next();
});

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use(session(buildSessionConfig()));

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.adminUser = req.session?.adminUser;
  res.locals.migrationsReady = migrationsReady;
  res.locals.migrationsError = migrationsError;
  res.locals.sessionStoreMode = sessionStoreMode;
  next();
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/webhooks', webhookRoutes);

app.use((req, res) => {
  res.status(404).render('public/404');
});

app.use((error, req, res, next) => {
  console.error('Erro HTTP capturado:', error);
  res.status(500).send(process.env.NODE_ENV === 'production' ? 'Erro interno.' : `<pre>${error.stack}</pre>`);
});

async function runStartupTasks() {
  if (startupStarted) return;
  startupStarted = true;

  try {
    if (toBool(process.env.RUN_MIGRATIONS, true)) {
      await db.runMigrations();
    }
    migrationsReady = true;
    migrationsError = null;
    console.log('Migrations prontas.');
  } catch (error) {
    migrationsReady = false;
    migrationsError = error;
    console.error('Falha nas migrations, mas o servidor continuará online para evitar 502:', error.message);
  }

  const startOnBoot = toBool(process.env.WA_START_ON_BOOT, false) &&
    toBool(process.env.WA_ALLOW_BOOT_START, false) &&
    toBool(process.env.WA_UNSAFE_START_ON_BOOT, false);

  if (startOnBoot) {
    startBotInBackground();
  } else {
    if (toBool(process.env.WA_START_ON_BOOT, false)) {
      console.warn('WA_START_ON_BOOT=true detectado, mas início automático bloqueado. Use /admin/qr para iniciar.');
    }
    console.log('WhatsApp aguardando início manual em /admin/qr.');
  }
}

function listenOnPort(port, primary = false) {
  const server = http.createServer(app);
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Porta ${port} já está em uso, ignorando listener extra.`);
      return;
    }
    console.error(`Erro ao abrir porta ${port}:`, error);
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`ParanáPOP Empregos ouvindo em 0.0.0.0:${port}${primary ? ' (principal)' : ''}`);
    if (primary) {
      console.log('VERSAO DO PROJETO: 1.0.5 BAILEYS PURO SEM OPENWA PORTFIX');
      console.log(`Motor WhatsApp configurado: ${getBotState().engine}`);
      console.log(`Session store: ${sessionStoreMode}`);
      runStartupTasks();
    }
  });
  return server;
}

function bootstrap() {
  const ports = portsToListen();
  if (!ports.length) ports.push(3000);
  ports.forEach((port, index) => listenOnPort(port, index === 0));
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection capturada:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception capturada:', error);
});

bootstrap();
