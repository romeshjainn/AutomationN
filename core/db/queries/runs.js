// ─────────────────────────────────────────────────────────────
//  core/db/queries/runs.js — Run tracking
//  `platform` column tracks which platform each run belongs to
// ─────────────────────────────────────────────────────────────

import db from '../client.js';

export function insertRun(runId, mode, platform = 'unknown') {
  db.prepare(
    `INSERT INTO runs (id, mode, platform) VALUES (?, ?, ?)`,
  ).run(runId, mode, platform);
}

export function updateRun(runId, { jobsScraped, jobsQualified, jobsSent }) {
  db.prepare(
    `UPDATE runs SET
      finished_at    = datetime('now','localtime'),
      jobs_scraped   = ?,
      jobs_qualified = ?,
      jobs_sent      = ?
     WHERE id = ?`,
  ).run(jobsScraped, jobsQualified, jobsSent, runId);
}

export function getRecentRuns(n = 5, platform = null) {
  const platformFilter = platform ? `WHERE platform = '${platform}'` : '';
  return db
    .prepare(
      `SELECT * FROM runs
       ${platformFilter}
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(n);
}
