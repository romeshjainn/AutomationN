// ─────────────────────────────────────────────────────────────
//  Run tracking — logs every scrape run to DB
// ─────────────────────────────────────────────────────────────

import db from '../client.js';

export function insertRun(runId, mode) {
  db.prepare(
    `
    INSERT INTO runs (id, mode) VALUES (?, ?)
  `,
  ).run(runId, mode);
}

export function updateRun(runId, { jobsScraped, jobsQualified, jobsSent }) {
  db.prepare(
    `
    UPDATE runs SET
      finished_at    = datetime('now','localtime'),
      jobs_scraped   = ?,
      jobs_qualified = ?,
      jobs_sent      = ?
    WHERE id = ?
  `,
  ).run(jobsScraped, jobsQualified, jobsSent, runId);
}

export function getRecentRuns(n = 5) {
  return db
    .prepare(
      `
    SELECT * FROM runs
    ORDER BY started_at DESC
    LIMIT ?
  `,
    )
    .all(n);
}
