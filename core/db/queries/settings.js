// ─────────────────────────────────────────────────────────────
//  core/db/queries/settings.js — Platform-isolated settings
//
//  Keys are prefixed by platform: "naukri_MIN_SCORE"
//  Each platform passes its own FILTERS as defaults.
//
//  Don't call this directly — use your platform's
//  src/utils/settings.js wrapper instead.
// ─────────────────────────────────────────────────────────────

import db from '../client.js';

/**
 * Get a setting value.
 * Checks DB first (platform-prefixed key), falls back to defaults.
 *
 * @param {string} key       - setting name e.g. 'MIN_SCORE'
 * @param {object} defaults  - platform's FILTERS object
 * @param {string} platform  - platform name e.g. 'naukri'
 */
export function getSetting(key, defaults = {}, platform = '') {
  const dbKey = platform ? `${platform}_${key}` : key;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(dbKey);
  if (row) {
    return typeof defaults[key] === 'number' ? Number(row.value) : row.value;
  }
  return defaults[key] ?? null;
}

/**
 * Set a setting value (from dashboard or CLI).
 * Stored with platform prefix.
 */
export function setSetting(key, value, platform = '') {
  const dbKey = platform ? `${platform}_${key}` : key;
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(dbKey, String(value));
}

/**
 * Get all settings for a platform (DB overrides merged with defaults).
 * Used by dashboard to show current state.
 */
export function getAllSettings(defaults = {}, platform = '') {
  const prefix = platform ? `${platform}_` : '';
  const dbRows = db
    .prepare(`SELECT key, value FROM settings WHERE key LIKE ?`)
    .all(`${prefix}%`);

  // Strip prefix from keys for clean output
  const dbMap = Object.fromEntries(
    dbRows.map((r) => [r.key.replace(prefix, ''), r.value]),
  );
  return { ...defaults, ...dbMap };
}
