// ─────────────────────────────────────────────────────────────
//  core/utils/helpers.js — Shared utility functions
//  All platforms import from here
// ─────────────────────────────────────────────────────────────

/** Promise-based sleep */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse "X hours/days/weeks ago" → YYYY-MM-DD string.
 * Falls back to the raw string if no time pattern found.
 */
export function parsePostedOn(how_long) {
  if (!how_long) return '';
  const now = new Date();
  const m = how_long.match(/(\d+)\s*(minute|hour|day|week|month)/i);
  if (!m) return how_long;
  const n = parseInt(m[1]);
  const unit = m[2].toLowerCase();
  const msMap = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6 };
  return new Date(now - n * (msMap[unit] || 0)).toISOString().split('T')[0];
}
