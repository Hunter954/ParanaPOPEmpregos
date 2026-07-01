require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const path = require('path');
const { pool, runMigrations } = require('./db');
const { startBotInBackground, getBotState } = require('./bot');

const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const port = Number(process.env.PORT || 3000);

let migrationsReady = false;
let migrationsError = null;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false
}));

// Rotas de saúde antes do session/db pesado. Isso evita 502 em healthcheck do Railway.
app.get('/saude', (req, res) => {
  res.json({
    ok: true,
    service: 'ParanáPOP Empregos Bot',
    version: '1.0.4-baileys-puro-502fix',
    whatsappEngine: getBotState().engine,
    migrationsReady,
    migrationsError: migrationsError ? migrationsError.message : null,
    time: new Date().toISOString()
  });
});
app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  name: 'paranapop_empregos_sid',
  secret: process.env.SESSION_SECRET || 'troque-esta-chave',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.adminUser = req.session?.adminUser;
  res.locals.migrationsReady = migrationsReady;
  res.locals.migrationsError = migrationsError;
  next();
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/webhooks', webhookRoutes);

app.use((req, res) => {
  res.status(404).render('public/404');
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send(process.env.NODE_ENV === 'production' ? 'Erro interno.' : `<pre>${error.stack}</pre>`);
});

async function runStartupTasks() {
  try {
    if (String(process.env.RUN_MIGRATIONS || 'true') === 'true') {
      await runMigrations();
    }
    migrationsReady = true;
    console.log('Migrations prontas.');
  } catch (error) {
    migrationsReady = false;
    migrationsError = error;
    console.error('Falha nas migrations, mas o servidor continuará online para evitar 502:', error);
  }

  const startOnBoot = String(process.env.WA_START_ON_BOOT || 'false') === 'true' &&
    String(process.env.WA_ALLOW_BOOT_START || 'false') === 'true' &&
    String(process.env.WA_UNSAFE_START_ON_BOOT || 'false') === 'true';

  if (startOnBoot) {
    startBotInBackground();
  } else {
    if (String(process.env.WA_START_ON_BOOT || 'false') === 'true') {
      console.warn('WA_START_ON_BOOT=true detectado, mas o início automático foi bloqueado por segurança. Use o painel /admin/qr ou defina também WA_ALLOW_BOOT_START=true e WA_UNSAFE_START_ON_BOOT=true.');
    }
    console.log('WhatsApp aguardando início manual em /admin/qr.');
  }
}

function bootstrap() {
  app.listen(port, '0.0.0.0', () => {
    console.log(`ParanáPOP Empregos rodando na porta ${port}`);
    console.log('VERSAO DO PROJETO: 1.0.4 BAILEYS PURO SEM OPENWA 502 FIX');
    console.log(`Motor WhatsApp configurado: ${getBotState().engine}`);
    runStartupTasks();
  });
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection capturada:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception capturada:', error);
});

bootstrap();
