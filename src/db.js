const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL não configurada. Configure o PostgreSQL antes de iniciar em produção.');
}

const shouldUseSsl = process.env.PGSSLMODE === 'require' || /sslmode=require/i.test(connectionString || '');

const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function runMigrations() {
  const dir = path.join(__dirname, '..', 'migrations');
  const migrationDir = fs.existsSync(dir) ? dir : path.join(process.cwd(), 'migrations');
  const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();

  await query(`CREATE TABLE IF NOT EXISTS app_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  for (const file of files) {
    const already = await query('SELECT 1 FROM app_migrations WHERE filename = $1', [file]);
    if (already.rowCount > 0) continue;

    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO app_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migration aplicada: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function jidToPhone(jid) {
  if (!jid) return null;
  return String(jid).replace(/@.+$/, '').replace(/\D/g, '');
}

async function getUserByJid(whatsappJid) {
  const result = await query('SELECT * FROM users WHERE whatsapp_jid = $1', [whatsappJid]);
  return result.rows[0] || null;
}

async function getOrCreateUser(whatsappJid) {
  const existing = await getUserByJid(whatsappJid);
  if (existing) {
    await query('UPDATE users SET last_interaction_at = NOW(), updated_at = NOW() WHERE id = $1', [existing.id]);
    return existing;
  }

  const result = await query(
    `INSERT INTO users (whatsapp_jid, phone, onboarding_step)
     VALUES ($1, $2, 'role_selection')
     RETURNING *`,
    [whatsappJid, jidToPhone(whatsappJid)]
  );
  return result.rows[0];
}

async function updateUser(userId, fields) {
  const keys = Object.keys(fields).filter((key) => typeof fields[key] !== 'undefined');
  if (keys.length === 0) {
    const current = await query('SELECT * FROM users WHERE id = $1', [userId]);
    return current.rows[0];
  }

  const values = [];
  const sets = keys.map((key, index) => {
    values.push(fields[key]);
    return `${key} = $${index + 1}`;
  });
  values.push(userId);

  const result = await query(
    `UPDATE users SET ${sets.join(', ')}, updated_at = NOW(), last_interaction_at = NOW()
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
  return result.rows[0];
}

async function mergeUserData(user, patch) {
  const current = user.onboarding_data || {};
  return updateUser(user.id, { onboarding_data: { ...current, ...patch } });
}

async function clearUserFlow(userId, step) {
  return updateUser(userId, { onboarding_step: step, onboarding_data: {} });
}

async function createJob(data) {
  const result = await query(
    `INSERT INTO jobs (
      company_user_id, title, company_name, city, area, modality, salary,
      requirements, benefits, contact_info, status, published_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $11 = 'active' THEN NOW() ELSE NULL END)
    RETURNING *`,
    [
      data.company_user_id,
      data.title,
      data.company_name,
      data.city,
      data.area,
      data.modality,
      data.salary,
      data.requirements,
      data.benefits,
      data.contact_info,
      data.status || 'active'
    ]
  );
  return result.rows[0];
}

async function getJobById(id) {
  const result = await query('SELECT * FROM jobs WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function updateJobStatus(id, status) {
  const result = await query(
    `UPDATE jobs
     SET status = $2,
         published_at = CASE WHEN $2 = 'active' AND published_at IS NULL THEN NOW() ELSE published_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  return result.rows[0] || null;
}

async function listCompanyJobs(companyUserId, includeDeleted = false) {
  const result = await query(
    `SELECT * FROM jobs
     WHERE company_user_id = $1 ${includeDeleted ? '' : "AND status <> 'deleted'"}
     ORDER BY created_at DESC
     LIMIT 50`,
    [companyUserId]
  );
  return result.rows;
}

async function countCompanyActiveJobs(companyUserId) {
  const result = await query(
    "SELECT COUNT(*)::int AS count FROM jobs WHERE company_user_id = $1 AND status IN ('active', 'paused')",
    [companyUserId]
  );
  return result.rows[0].count;
}

async function listRecentJobs(limit = 10) {
  const result = await query(
    `SELECT * FROM jobs
     WHERE status = 'active'
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function listActiveJobsForMatching(limit = 100) {
  const result = await query(
    `SELECT * FROM jobs
     WHERE status = 'active'
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function listCandidatesForAlerts(limit = 1000) {
  const result = await query(
    `SELECT * FROM users
     WHERE role = 'candidate'
       AND alerts_enabled = TRUE
       AND GREATEST(COALESCE(trial_until, '1970-01-01'::timestamptz), COALESCE(premium_until, '1970-01-01'::timestamptz)) >= NOW()
     ORDER BY last_interaction_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function createApplication(jobId, candidateUserId, message = null) {
  const result = await query(
    `INSERT INTO applications (job_id, candidate_user_id, message)
     VALUES ($1, $2, $3)
     ON CONFLICT (job_id, candidate_user_id)
     DO UPDATE SET message = COALESCE(EXCLUDED.message, applications.message)
     RETURNING *`,
    [jobId, candidateUserId, message]
  );
  return result.rows[0];
}

async function listApplicationsForJob(jobId) {
  const result = await query(
    `SELECT a.*, u.name, u.phone, u.city, u.experience, u.whatsapp_jid
     FROM applications a
     JOIN users u ON u.id = a.candidate_user_id
     WHERE a.job_id = $1
     ORDER BY a.created_at DESC`,
    [jobId]
  );
  return result.rows;
}

async function logMessage({ userId, whatsappJid, direction, body, raw }) {
  try {
    await query(
      'INSERT INTO message_logs (user_id, whatsapp_jid, direction, body, raw) VALUES ($1,$2,$3,$4,$5)',
      [userId || null, whatsappJid, direction, body || null, raw || null]
    );
  } catch (error) {
    console.error('Erro ao gravar log de mensagem:', error.message);
  }
}

async function getDashboardStats() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE role = 'candidate') AS candidates,
      (SELECT COUNT(*)::int FROM users WHERE role = 'company') AS companies,
      (SELECT COUNT(*)::int FROM jobs WHERE status = 'active') AS active_jobs,
      (SELECT COUNT(*)::int FROM applications) AS applications,
      (SELECT COUNT(*)::int FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS new_users_7d
  `);
  return result.rows[0];
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  runMigrations,
  closePool,
  jidToPhone,
  getUserByJid,
  getOrCreateUser,
  updateUser,
  mergeUserData,
  clearUserFlow,
  createJob,
  getJobById,
  updateJobStatus,
  listCompanyJobs,
  countCompanyActiveJobs,
  listRecentJobs,
  listActiveJobsForMatching,
  listCandidatesForAlerts,
  createApplication,
  listApplicationsForJob,
  logMessage,
  getDashboardStats
};
