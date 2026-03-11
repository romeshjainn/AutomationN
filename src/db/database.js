'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'naukri.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS keywords (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword    TEXT UNIQUE NOT NULL,
    enabled    INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id            TEXT UNIQUE NOT NULL,
    title             TEXT,
    company           TEXT,
    location          TEXT,
    salary            TEXT,
    experience        TEXT,
    url               TEXT,
    easy_apply        INTEGER DEFAULT 0,
    status            TEXT DEFAULT 'new',
    found_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    applied_at        DATETIME,
    had_questionnaire INTEGER DEFAULT 0,
    questions_count   INTEGER DEFAULT 0,
    questions_data    TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id               INTEGER,
    level                TEXT DEFAULT 'info',
    event                TEXT,
    message              TEXT,
    questionnaire_status TEXT,
    application_status   TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS run_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at  DATETIME,
    jobs_found   INTEGER DEFAULT 0,
    jobs_applied INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'running',
    error        TEXT
  );
`);

// ─── Migrations for existing databases ────────────────────────────────────────

const migrations = [
  `ALTER TABLE jobs ADD COLUMN easy_apply INTEGER DEFAULT 0`,
  `ALTER TABLE logs ADD COLUMN job_id INTEGER`,
  `ALTER TABLE logs ADD COLUMN event TEXT`,
  `ALTER TABLE logs ADD COLUMN questionnaire_status TEXT`,
  `ALTER TABLE logs ADD COLUMN application_status TEXT`,
  `ALTER TABLE jobs ADD COLUMN had_questionnaire INTEGER DEFAULT 0`,
  `ALTER TABLE jobs ADD COLUMN questions_count INTEGER DEFAULT 0`,
  `ALTER TABLE jobs ADD COLUMN questions_data TEXT DEFAULT NULL`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// ─── Default settings ─────────────────────────────────────────────────────────

const DEFAULTS = {
  keywords:
    'React Frontend, Frontend Developer, Node.js Developer, React Native Developer, Next.js Developer, Full Stack Developer, JavaScript Developer, MERN Stack Developer, Frontend Engineer, UI Developer',
  daily_apply_limit: '10',
  auto_apply: 'true',
  delay_between_apply: '3000',
  run_frequency: 'daily',
  cron_time: '0 6 * * *',
  cron_enabled: 'true',
  headless: 'true',
  experience_min: '1',
  experience_max: '4',
  salary_min: '500000',
  job_type: 'any',
  resume_upload_times: '09:00,18:00',
  resume_path: 'RomeshJain_10March_Resume.pdf',
  resume_last_uploaded: '',
  profile_last_refreshed: '',
  telegram_token: '',
  telegram_chat_id: '',
  telegram_approval_enabled: 'false',
};

const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULTS)) insertDefault.run(k, v);

// ─── Migrate keywords from settings into keywords table ───────────────────────

(function migrateKeywords() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM keywords').get().c;
  if (count > 0) return;

  const kwSetting = db.prepare("SELECT value FROM settings WHERE key = 'keywords'").get();
  if (!kwSetting || !kwSetting.value) return;

  const insert = db.prepare('INSERT OR IGNORE INTO keywords (keyword, enabled) VALUES (?, 1)');
  const tx = db.transaction(() => {
    const parts = kwSetting.value.split(',').map(k => k.trim()).filter(Boolean);
    for (const kw of parts) insert.run(kw);
  });
  tx();
  console.log('[DB] Keywords migrated from settings to keywords table');
})();

// ─── Settings ─────────────────────────────────────────────────────────────────

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  // Merge defaults for any missing keys
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (!(k in out)) out[k] = v;
  }
  return out;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : (DEFAULTS[key] ?? null);
}

function saveSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value == null ? '' : value));
}

function saveSettings(obj) {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((o) => {
    for (const [k, v] of Object.entries(o)) upsert.run(k, String(v == null ? '' : v));
  });
  tx(obj);
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

function getKeywords() {
  return db.prepare('SELECT * FROM keywords ORDER BY created_at ASC').all();
}

function getEnabledKeywords() {
  return db.prepare("SELECT keyword FROM keywords WHERE enabled = 1 ORDER BY created_at ASC").all().map(r => r.keyword);
}

function addKeyword(keyword) {
  try {
    const result = db.prepare('INSERT INTO keywords (keyword, enabled) VALUES (?, 1)').run(keyword.trim());
    return result.lastInsertRowid;
  } catch (e) {
    throw new Error(`Keyword already exists or invalid: ${e.message}`);
  }
}

function updateKeyword(id, enabled) {
  db.prepare('UPDATE keywords SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

function deleteKeyword(id) {
  db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

function jobExists(jobId) {
  return !!db.prepare('SELECT id FROM jobs WHERE job_id = ?').get(String(jobId));
}

function saveJob(job) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO jobs (job_id, title, company, location, salary, experience, url, easy_apply)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.jobId,
      job.title,
      job.company,
      job.location,
      job.salary,
      job.experience,
      job.url,
      job.easyApply ? 1 : 0
    );
    return true;
  } catch {
    return false;
  }
}

function getJob(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

function getJobByJobId(jobId) {
  return db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(String(jobId));
}

function updateJobStatus(id, status, appliedAt) {
  if (appliedAt) {
    db.prepare('UPDATE jobs SET status = ?, applied_at = ? WHERE id = ?').run(status, appliedAt, id);
  } else {
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
  }
}

function updateJobQuestionnaire(id, hadQ, count, data) {
  db.prepare('UPDATE jobs SET had_questionnaire = ?, questions_count = ?, questions_data = ? WHERE id = ?')
    .run(hadQ ? 1 : 0, count || 0, data ? JSON.stringify(data) : null, id);
}

// Legacy compat helpers
function markJobApplied(id) {
  db.prepare(`UPDATE jobs SET status = 'applied', applied_at = CURRENT_TIMESTAMP WHERE job_id = ? OR CAST(id AS TEXT) = ?`)
    .run(String(id), String(id));
}

function markJobSkipped(id) {
  db.prepare(`UPDATE jobs SET status = 'skipped' WHERE job_id = ? OR CAST(id AS TEXT) = ?`)
    .run(String(id), String(id));
}

function getJobs({ page = 1, limit = 20, status = 'all' } = {}) {
  const offset = (page - 1) * limit;
  const where  = status !== 'all' ? 'WHERE status = ?' : '';
  const params = status !== 'all' ? [status] : [];

  const jobs  = db.prepare(`SELECT * FROM jobs ${where} ORDER BY found_at DESC LIMIT ? OFFSET ?`)
                   .all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM jobs ${where}`).get(...params).c;

  const raw    = db.prepare(`SELECT status, COUNT(*) AS c FROM jobs GROUP BY status`).all();
  const counts = { all: 0, new: 0, applied: 0, skipped: 0, pending: 0, pending_apply: 0, manual_review: 0, failed: 0 };
  for (const r of raw) {
    counts[r.status] = r.c;
    counts.all += r.c;
  }

  return { jobs, total, page, limit, totalPages: Math.ceil(total / limit), counts };
}

function getManualReviewJobs() {
  return db.prepare("SELECT * FROM jobs WHERE status = 'manual_review' ORDER BY found_at DESC").all();
}

function getPendingJobs() {
  return db.prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY found_at ASC").all();
}

function getJobsAppliedToday() {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'applied' AND date(applied_at) = ?").get(today);
  return row ? row.c : 0;
}

function getRecentJobs(limit = 5) {
  return db.prepare('SELECT * FROM jobs ORDER BY found_at DESC LIMIT ?').all(limit);
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

const _insertLog = db.prepare(
  'INSERT INTO logs (job_id, level, event, message, questionnaire_status, application_status) VALUES (?, ?, ?, ?, ?, ?)'
);
const _pruneLog = db.prepare(
  'DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 1000)'
);

function addLog({ jobId, level, event, message, questionnaireStatus, applicationStatus } = {}) {
  const lvl = level || 'info';
  const msg = message || '';
  console.log(`[${lvl.toUpperCase()}]${event ? '[' + event + ']' : ''} ${msg}`);
  _insertLog.run(jobId || null, lvl, event || null, msg, questionnaireStatus || null, applicationStatus || null);
  _pruneLog.run();
}

// Legacy alias
function log(level, message) {
  addLog({ level, message });
}

function getLogs(limit = 200) {
  return db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?').all(limit);
}

function clearLogs() {
  db.prepare('DELETE FROM logs').run();
}

// ─── Run History ──────────────────────────────────────────────────────────────

function startRun() {
  return db.prepare("INSERT INTO run_history (status) VALUES ('running')").run().lastInsertRowid;
}

function finishRun(id, { jobsFound = 0, jobsApplied = 0, status = 'success', error = null } = {}) {
  db.prepare(`
    UPDATE run_history
    SET finished_at = CURRENT_TIMESTAMP, jobs_found = ?, jobs_applied = ?, status = ?, error = ?
    WHERE id = ?
  `).run(jobsFound, jobsApplied, status, error, id);
}

function getRunHistory() {
  return db.prepare('SELECT * FROM run_history ORDER BY started_at DESC LIMIT 100').all();
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats() {
  const today = new Date().toISOString().split('T')[0];
  return {
    total:        db.prepare('SELECT COUNT(*) AS c FROM jobs').get().c,
    applied:      db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'applied'").get().c,
    pending:      db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status IN ('pending','pending_apply')").get().c,
    manualReview: db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'manual_review'").get().c,
    todayApplied: db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'applied' AND date(applied_at) = ?").get(today).c,
    foundToday:   db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE date(found_at) = ?").get(today).c,
    new:          db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'new'").get().c,
  };
}

module.exports = {
  // Settings
  getSettings, getSetting, saveSetting, saveSettings,
  // Keywords
  getKeywords, getEnabledKeywords, addKeyword, updateKeyword, deleteKeyword,
  // Jobs
  jobExists, saveJob, getJob, getJobByJobId, updateJobStatus, updateJobQuestionnaire,
  markJobApplied, markJobSkipped,
  getJobs, getManualReviewJobs, getPendingJobs, getJobsAppliedToday,
  getRecentJobs,
  // Logs
  addLog, log, getLogs, clearLogs,
  // Run history
  startRun, finishRun, getRunHistory,
  // Stats
  getStats,
};
