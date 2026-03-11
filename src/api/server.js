'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express   = require('express');
const path      = require('path');
const db        = require('../db/database');
const scheduler = require('../scheduler');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dashboard')));

// ─── Status & Stats ───────────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json(scheduler.getStatus());
});

app.get('/api/stats', (_req, res) => {
  const settings = db.getSettings();
  res.json({
    ...db.getStats(),
    recentJobs: db.getRecentJobs(5),
    resumeLastUploaded:    settings.resume_last_uploaded    || null,
    profileLastRefreshed:  settings.profile_last_refreshed  || null,
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  try {
    db.saveSettings(req.body);
    scheduler.startScheduler(); // Restart with new config

    // Reinitialize Telegram if credentials changed
    const settings = db.getSettings();
    try {
      const telegram = require('../services/telegramService');
      if (settings.telegram_token && settings.telegram_chat_id) {
        telegram.initialize(settings.telegram_token, settings.telegram_chat_id);
      } else {
        telegram.stop();
      }
    } catch {}

    res.json({ success: true, message: 'Settings saved and scheduler restarted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Keywords ─────────────────────────────────────────────────────────────────

app.get('/api/keywords', (_req, res) => {
  res.json(db.getKeywords());
});

app.post('/api/keywords', (req, res) => {
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ error: 'Keyword is required' });
  }
  try {
    const id = db.addKeyword(keyword.trim());
    res.json({ success: true, id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/keywords/:id', (req, res) => {
  const { enabled } = req.body;
  db.updateKeyword(parseInt(req.params.id), !!enabled);
  res.json({ success: true });
});

app.delete('/api/keywords/:id', (req, res) => {
  db.deleteKeyword(parseInt(req.params.id));
  res.json({ success: true });
});

// ─── Jobs ─────────────────────────────────────────────────────────────────────

app.get('/api/jobs', (req, res) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const status = req.query.status          || 'all';
  res.json(db.getJobs({ page, limit, status }));
});

app.get('/api/jobs/manual-review', (_req, res) => {
  res.json(db.getManualReviewJobs());
});

// Mark job as applied (manual record-keeping, no automation)
app.post('/api/jobs/:id/apply', (req, res) => {
  db.updateJobStatus(parseInt(req.params.id), 'applied', new Date().toISOString());
  res.json({ success: true });
});

// Skip a job
app.post('/api/jobs/:id/skip', (req, res) => {
  db.updateJobStatus(parseInt(req.params.id), 'skipped');
  res.json({ success: true });
});

// Trigger automation to apply to this specific job
app.post('/api/jobs/:id/auto-apply', async (req, res) => {
  try {
    const { applyToJobById } = require('../automation/naukri');
    const result = await applyToJobById(parseInt(req.params.id));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Move a manual-review job to manual_apply (user applied externally)
app.post('/api/jobs/:id/manual-apply', (req, res) => {
  db.updateJobStatus(parseInt(req.params.id), 'applied', new Date().toISOString());
  res.json({ success: true });
});

// ─── Logs ─────────────────────────────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  res.json(db.getLogs(limit));
});

app.delete('/api/logs', (_req, res) => {
  db.clearLogs();
  res.json({ success: true });
});

// ─── Run history ──────────────────────────────────────────────────────────────

app.get('/api/history', (_req, res) => {
  res.json(db.getRunHistory());
});

// ─── Bot run triggers ─────────────────────────────────────────────────────────

app.post('/api/run', async (_req, res) => {
  try {
    const result = await scheduler.triggerManualRun();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/run/scrape', async (_req, res) => {
  try {
    const result = await scheduler.triggerScrapeOnly();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/profile/refresh', async (_req, res) => {
  try {
    const result = await scheduler.triggerProfileRefresh();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/resume/upload', async (_req, res) => {
  try {
    const result = await scheduler.triggerResumeUpload();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Scheduler control ────────────────────────────────────────────────────────

app.post('/api/scheduler/start', (_req, res) => {
  db.saveSetting('cron_enabled', 'true');
  const cronTime = scheduler.startScheduler();
  res.json({ success: true, cronTime });
});

app.post('/api/scheduler/stop', (_req, res) => {
  db.saveSetting('cron_enabled', 'false');
  scheduler.stopScheduler();
  res.json({ success: true });
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Naukri Bot dashboard → http://localhost:${PORT}\n`);
  db.log('info', `Server started on port ${PORT}`);
  scheduler.startScheduler();

  // Initialize Telegram bot if configured
  try {
    const telegram = require('../services/telegramService');
    const settings = db.getSettings();
    if (settings.telegram_token && settings.telegram_chat_id) {
      telegram.initialize(settings.telegram_token, settings.telegram_chat_id);

      // Register callback handler for inline keyboard buttons
      telegram.onCallback(async (data, queryId) => {
        try {
          if (data.startsWith('apply_')) {
            const jobId = parseInt(data.split('_')[1]);
            const { applyToJobById } = require('../automation/naukri');
            applyToJobById(jobId)
              .then(() => telegram.answerCallbackQuery(queryId, 'Applying...'))
              .catch(e => telegram.answerCallbackQuery(queryId, 'Failed: ' + e.message));

          } else if (data.startsWith('skip_')) {
            const jobId = parseInt(data.split('_')[1]);
            db.updateJobStatus(jobId, 'skipped');
            telegram.answerCallbackQuery(queryId, 'Skipped');

          } else if (data === 'apply_all') {
            const pending = db.getPendingJobs();
            telegram.answerCallbackQuery(queryId, `Queuing ${pending.length} jobs...`);
            for (const job of pending) db.updateJobStatus(job.id, 'pending_apply');

          } else if (data === 'skip_all') {
            const pending = db.getPendingJobs();
            for (const job of pending) db.updateJobStatus(job.id, 'skipped');
            telegram.answerCallbackQuery(queryId, 'All skipped');

          } else {
            telegram.answerCallbackQuery(queryId, 'Unknown action');
          }
        } catch (e) {
          console.error('[Telegram callback error]', e.message);
        }
      });
    }
  } catch (e) {
    console.error('[Telegram init error]', e.message);
  }
});

module.exports = app;
