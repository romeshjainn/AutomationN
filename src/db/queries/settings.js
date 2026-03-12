// ─────────────────────────────────────────────────────────────
//  Settings — DB first, config/filters.js fallback
//  Dashboard writes to DB later, script picks up changes live
// ─────────────────────────────────────────────────────────────

import db from '../client.js';
import { FILTERS } from '../../../config/filters.js';

// Flat map of all defaults from filters.js
const DEFAULTS = {
  DAILY_TARGET: FILTERS.DAILY_TARGET,
  MAX_PAGES_PER_TYPE: FILTERS.MAX_PAGES_PER_TYPE,
  DEAD_PAGES_LIMIT: FILTERS.DEAD_PAGES_LIMIT,
  MAX_DAYS_OLD: FILTERS.MAX_DAYS_OLD,
  MAX_APPLICANTS: FILTERS.MAX_APPLICANTS,
  MAX_EXP_YEARS: FILTERS.MAX_EXP_YEARS,
  MIN_SALARY_LPA: FILTERS.MIN_SALARY_LPA,
  MIN_SCORE: FILTERS.MIN_SCORE,
  HOT_SCORE: FILTERS.HOT_SCORE,
};

/**
 * Get a setting value.
 * Checks DB first — if found returns it (cast to number if numeric).
 * Falls back to config/filters.js default.
 */
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) {
    // cast to number if default is a number
    return typeof DEFAULTS[key] === 'number' ? Number(row.value) : row.value;
  }
  return DEFAULTS[key];
}

/**
 * Set a setting value from dashboard or CLI.
 */
export function setSetting(key, value) {
  db.prepare(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `,
  ).run(key, String(value));
}

/**
 * Get all current settings (DB overrides merged with defaults).
 * Used by dashboard to show current state.
 */
export function getAllSettings() {
  const dbRows = db.prepare('SELECT key, value FROM settings').all();
  const dbMap = Object.fromEntries(dbRows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...dbMap };
}
