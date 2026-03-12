// ─────────────────────────────────────────────────────────────
//  All job DB operations — only file that touches jobs table
// ─────────────────────────────────────────────────────────────

import db from '../client.js';

// ── Write ────────────────────────────────────────────────────

/**
 * Insert a job. If link already exists → silently ignored (dedup).
 * Returns true if inserted, false if duplicate.
 */
export function insertJob(job, runId) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO jobs
      (link, title, city, experience, salary, skills,
       easy_apply, applicants, openings, posted_on, how_long,
       type, score, priority, matched_kws, status, run_id)
    VALUES
      (@link, @title, @city, @experience, @salary, @skills,
       @easy_apply, @applicants, @openings, @posted_on, @how_long,
       @type, @score, @priority, @matched_kws, 'queued', @run_id)
  `);

  const result = stmt.run({
    link: job.link,
    title: job.title,
    city: job.city || null,
    experience: job.experience || null,
    salary: job.salary || null,
    skills: job.skills_needed || null,
    easy_apply: job.easy_apply ? 1 : 0,
    applicants: job.applicants ?? null,
    openings: job.openings ?? null,
    posted_on: job.posted_on || null,
    how_long: job.how_long || null,
    type: job.type || null,
    score: job.score ?? null,
    priority: job.priority || 'normal',
    matched_kws: Array.isArray(job.matched_keywords)
      ? job.matched_keywords.join(', ')
      : job.matched_keywords || null,
    run_id: runId || null,
  });

  return result.changes > 0; // true = new job, false = duplicate
}

/**
 * Update job status.
 * status: 'queued' | 'sent' | 'applied' | 'skipped' | 'saved'
 */
export function updateStatus(id, status) {
  const col = status === 'sent' ? 'sent_at' : 'acted_at';
  db.prepare(
    `
    UPDATE jobs
    SET status = ?, ${col} = datetime('now','localtime')
    WHERE id = ?
  `,
  ).run(status, id);
}

// ── Read ─────────────────────────────────────────────────────

/** Check if link already exists in DB */
export function isNewJob(link) {
  const row = db.prepare('SELECT id FROM jobs WHERE link = ?').get(link);
  return !row; // true = new, false = seen before
}

/** Get all unsent qualified jobs sorted by score desc */
export function getQueuedJobs() {
  return db
    .prepare(
      `
    SELECT * FROM jobs
    WHERE status = 'queued'
    ORDER BY
      CASE priority WHEN 'hot' THEN 0 ELSE 1 END,
      score DESC
  `,
    )
    .all();
}

/** Get single job by id */
export function getJobById(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

/** How many jobs sent today */
export function getSentTodayCount() {
  return db
    .prepare(
      `
    SELECT COUNT(*) as count FROM jobs
    WHERE status IN ('sent','applied','skipped','saved')
    AND DATE(sent_at) = DATE('now','localtime')
  `,
    )
    .get().count;
}

/** Today's full stats for report */
export function getTodayStats() {
  return db
    .prepare(
      `
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent')    as sent,
      COUNT(*) FILTER (WHERE status = 'applied') as applied,
      COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
      COUNT(*) FILTER (WHERE status = 'saved')   as saved,
      COUNT(*) FILTER (WHERE score >= 85)        as hot_jobs
    FROM jobs
    WHERE DATE(found_at) = DATE('now','localtime')
  `,
    )
    .get();
}

/** Get last N sent jobs today — for quality comparison */
export function getRecentlySent(n = 3) {
  return db
    .prepare(
      `
    SELECT score FROM jobs
    WHERE status = 'sent'
    AND DATE(sent_at) = DATE('now', 'localtime')
    ORDER BY sent_at DESC
    LIMIT ?
  `,
    )
    .all(n);
}

/** Get last N sent jobs today by score — for daily report */
export function getTopJobsToday(n = 3) {
  return db
    .prepare(
      `
    SELECT * FROM jobs
    WHERE DATE(found_at) = DATE('now','localtime')
    ORDER BY score DESC
    LIMIT ?
  `,
    )
    .all(n);
}
