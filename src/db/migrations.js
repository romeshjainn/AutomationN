// ─────────────────────────────────────────────────────────────
//  Creates all tables on first run
//  Safe to run multiple times — uses IF NOT EXISTS
//  Import this once at app startup in index.js
// ─────────────────────────────────────────────────────────────

import db from './client.js';

export function runMigrations() {
  // ── Jobs ────────────────────────────────────────────────────
  // Every job ever found — link is unique so dupes auto-ignored
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      link        TEXT    UNIQUE NOT NULL,
      title       TEXT,
      city        TEXT,
      experience  TEXT,
      salary      TEXT,
      skills      TEXT,
      easy_apply  INTEGER DEFAULT 0,
      applicants  INTEGER,
      openings    INTEGER,
      posted_on   TEXT,
      how_long    TEXT,
      type        TEXT,
      score       INTEGER,
      priority    TEXT,
      matched_kws TEXT,
      status      TEXT DEFAULT 'queued',
      found_at    TEXT DEFAULT (datetime('now','localtime')),
      sent_at     TEXT,
      acted_at    TEXT,
      run_id      TEXT
    )
  `);

  // ── Runs ────────────────────────────────────────────────────
  // Every scrape run — for reporting and debugging
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id            TEXT PRIMARY KEY,
      mode          TEXT,
      started_at    TEXT DEFAULT (datetime('now','localtime')),
      finished_at   TEXT,
      jobs_scraped  INTEGER DEFAULT 0,
      jobs_qualified INTEGER DEFAULT 0,
      jobs_sent     INTEGER DEFAULT 0
    )
  `);

  // ── Actions ─────────────────────────────────────────────────
  // Every button tap from Telegram (applied/skipped/saved)
  db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     INTEGER REFERENCES jobs(id),
      action     TEXT,
      timestamp  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // ── Settings ────────────────────────────────────────────────
  // Live config overrides — dashboard writes here later
  // Script reads these first, falls back to config/filters.js
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  console.log('✅ DB migrations done');
}
