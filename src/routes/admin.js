const express = require('express');
const { getBotState, startBotInBackground, stopBot, cleanSessionArtifacts, sendText } = require('../bot');
const {
  getDashboardStats,
  query,
  updateJobStatus,
  getJobById,
  updateUser,
  logMessage
} = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session?.adminLoggedIn) return next();
  return res.redirect('/admin/login');
}

function safeReturn(path) {
  if (!path || typeof path !== 'string') return '/admin';
  return path.startsWith('/admin') ? path : '/admin';
}

router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

  if (username === adminUser && password === adminPassword) {
    req.session.adminLoggedIn = true;
    req.session.adminUser = username;
    return res.redirect('/admin');
  }

  return res.status(401).render('admin/login', { error: 'Usuário ou senha inválidos.' });
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const stats = await getDashboardStats();
    const bot = getBotState();
    const recentUsers = await query('SELECT * FROM users ORDER BY created_at DESC LIMIT 8');
    const recentJobs = await query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 8');
    res.render('admin/dashboard', { stats, bot, recentUsers: recentUsers.rows, recentJobs: recentJobs.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/bot/start', requireAuth, async (req, res) => {
  startBotInBackground();
  res.redirect('/admin/qr');
});

router.post('/bot/restart-clean', requireAuth, async (req, res) => {
  await stopBot();
  await cleanSessionArtifacts();
  startBotInBackground({ cleanSession: true });
  res.redirect('/admin/qr');
});

router.get('/qr', requireAuth, (req, res) => {
  const bot = getBotState();
  res.render('admin/qr', { bot });
});

router.get('/users', requireAuth, async (req, res, next) => {
  try {
    const role = req.query.role || '';
    const q = req.query.q || '';
    const params = [];
    const where = [];
    if (role) {
      params.push(role);
      where.push(`role = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(name ILIKE $${params.length} OR company_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR city ILIKE $${params.length})`);
    }
    const result = await query(
      `SELECT * FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.render('admin/users', { users: result.rows, role, q });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/premium', requireAuth, async (req, res, next) => {
  try {
    const days = Number(req.body.days || 90);
    await query(
      `UPDATE users
       SET subscription_plan = 'premium', subscription_status = 'active', premium_until = NOW() + ($2 || ' days')::interval, updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, days]
    );
    res.redirect(safeReturn(req.body.returnTo));
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/company-premium', requireAuth, async (req, res, next) => {
  try {
    await updateUser(req.params.id, { company_plan: 'premium' });
    res.redirect(safeReturn(req.body.returnTo));
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/send', requireAuth, async (req, res, next) => {
  try {
    const user = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const target = user.rows[0];
    if (target?.whatsapp_jid && req.body.message) {
      await sendText(target.whatsapp_jid, req.body.message);
      await logMessage({ userId: target.id, whatsappJid: target.whatsapp_jid, direction: 'out', body: req.body.message });
    }
    res.redirect(safeReturn(req.body.returnTo));
  } catch (error) {
    next(error);
  }
});

router.get('/jobs', requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status || '';
    const params = [];
    const where = [];
    if (status) {
      params.push(status);
      where.push(`j.status = $${params.length}`);
    }
    const result = await query(
      `SELECT j.*, u.whatsapp_jid, u.phone AS company_phone
       FROM jobs j
       LEFT JOIN users u ON u.id = j.company_user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY j.created_at DESC
       LIMIT 300`,
      params
    );
    res.render('admin/jobs', { jobs: result.rows, status });
  } catch (error) {
    next(error);
  }
});

router.post('/jobs/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['active', 'paused', 'deleted'].includes(status)) {
      return res.status(400).send('Status inválido');
    }
    await updateJobStatus(req.params.id, status);
    res.redirect(safeReturn(req.body.returnTo));
  } catch (error) {
    next(error);
  }
});

router.get('/applications', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.*, j.title AS job_title, j.company_name, u.name AS candidate_name, u.phone, u.city, u.experience
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN users u ON u.id = a.candidate_user_id
       ORDER BY a.created_at DESC
       LIMIT 300`
    );
    res.render('admin/applications', { applications: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/broadcast', requireAuth, (req, res) => {
  res.render('admin/broadcast', { result: null });
});

router.post('/broadcast', requireAuth, async (req, res, next) => {
  try {
    const target = req.body.target || 'candidate';
    const message = req.body.message;
    if (!message || message.length < 3) {
      return res.render('admin/broadcast', { result: 'Digite uma mensagem válida.' });
    }

    const params = [];
    let where = "whatsapp_jid IS NOT NULL";
    if (target !== 'all') {
      params.push(target);
      where += ` AND role = $${params.length}`;
    }

    const users = await query(`SELECT * FROM users WHERE ${where} ORDER BY last_interaction_at DESC LIMIT 500`, params);
    let sent = 0;
    for (const user of users.rows) {
      try {
        await sendText(user.whatsapp_jid, message);
        await logMessage({ userId: user.id, whatsappJid: user.whatsapp_jid, direction: 'out', body: message });
        sent += 1;
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (error) {
        console.error('Erro broadcast:', user.whatsapp_jid, error.message);
      }
    }
    res.render('admin/broadcast', { result: `Mensagem enviada para ${sent} contato(s).` });
  } catch (error) {
    next(error);
  }
});

router.get('/notes', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT n.*, u.name, u.company_name, u.phone, u.role
       FROM admin_notes n
       LEFT JOIN users u ON u.id = n.user_id
       ORDER BY n.created_at DESC
       LIMIT 200`
    );
    res.render('admin/notes', { notes: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
