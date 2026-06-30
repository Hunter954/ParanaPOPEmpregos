require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const path = require('path');
const { pool, runMigrations } = require('./db');
const { startBot } = require('./bot');

const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const port = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false
}));
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

async function bootstrap() {
  if (String(process.env.RUN_MIGRATIONS || 'true') === 'true') {
    await runMigrations();
  }

  app.listen(port, () => {
    console.log(`ParanáPOP Empregos rodando na porta ${port}`);
  });

  // Inicia sem bloquear o painel. Se der erro, o QR/status aparece no admin.
  startBot().catch((error) => console.error('Falha ao iniciar bot:', error));
}

bootstrap().catch((error) => {
  console.error('Falha crítica ao iniciar aplicação:', error);
  process.exit(1);
});
