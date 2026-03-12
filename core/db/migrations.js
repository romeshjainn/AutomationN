// ─────────────────────────────────────────────────────────────
//  core/db/migrations.js — Creates all tables on first run
//
//  Safe to run multiple times — uses IF NOT EXISTS.
//  `platform` column added so multi-platform jobs are distinct.
// ─────────────────────────────────────────────────────────────

import db from './client.js';

export function runMigrations() {
  // ── Jobs ────────────────────────────────────────────────────
  // Every job from every platform — link is unique (dedup)
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      platform    TEXT    DEFAULT 'unknown',
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id             TEXT PRIMARY KEY,
      platform       TEXT    DEFAULT 'unknown',
      mode           TEXT,
      started_at     TEXT    DEFAULT (datetime('now','localtime')),
      finished_at    TEXT,
      jobs_scraped   INTEGER DEFAULT 0,
      jobs_qualified INTEGER DEFAULT 0,
      jobs_sent      INTEGER DEFAULT 0
    )
  `);

  // ── Actions ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     INTEGER REFERENCES jobs(id),
      action     TEXT,
      timestamp  TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // ── Settings ────────────────────────────────────────────────
  // Keys are prefixed with platform: "naukri_MIN_SCORE", "yc_MIN_SCORE"
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  console.log('✅ DB migrations done');
}
