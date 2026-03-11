'use strict';

const cron = require('node-cron');
const db   = require('../db/database');

let currentTask = null;
let resumeTask1 = null;
let resumeTask2 = null;
let _isRunning  = false;
let lastError   = null;

function cronFromFrequency(frequency, customCron) {
  switch (frequency) {
    case 'twice':  return '0 6,18 * * *';
    case 'hourly': return '0 * * * *';
    case 'custom': return customCron || '0 6 * * *';
    default:       return '0 6 * * *'; // daily at 6 AM
  }
}

function scheduleResumeUploads() {
  if (resumeTask1) { resumeTask1.stop(); resumeTask1 = null; }
  if (resumeTask2) { resumeTask2.stop(); resumeTask2 = null; }

  const times = (db.getSetting('resume_upload_times') || '09:00,18:00')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  for (let i = 0; i < Math.min(times.length, 2); i++) {
    const time  = times[i];
    const parts = time.split(':');
    if (parts.length < 2) continue;
    const [hour, minute] = parts;
    const cronExpr = `${minute} ${hour} * * *`;
    if (!cron.validate(cronExpr)) {
      db.log('warn', `Invalid resume upload cron expression: "${cronExpr}" for time "${time}"`);
      continue;
    }

    const task = cron.schedule(cronExpr, async () => {
      if (_isRunning) {
        db.log('warn', 'Resume upload skipped — bot running');
        return;
      }
      db.log('info', `Scheduled resume upload triggered (${time})`);
      try {
        const { uploadResumeStandalone } = require('../automation/naukri');
        await uploadResumeStandalone();
      } catch (e) {
        db.log('error', `Scheduled resume upload failed: ${e.message}`);
      }
    });

    if (i === 0) resumeTask1 = task;
    else          resumeTask2 = task;
    db.log('info', `Resume upload scheduled at ${time} (cron: ${cronExpr})`);
  }
}

function startScheduler() {
  const settings = db.getSettings();

  stopScheduler(); // Always stop existing task first

  if (settings.cron_enabled !== 'true') {
    db.log('info', 'Scheduler disabled — not starting');
    scheduleResumeUploads();
    return null;
  }

  const cronTime = cronFromFrequency(settings.run_frequency, settings.cron_time);

  if (!cron.validate(cronTime)) {
    db.log('error', `Invalid cron expression: "${cronTime}" — scheduler not started`);
    scheduleResumeUploads();
    return null;
  }

  currentTask = cron.schedule(cronTime, async () => {
    if (_isRunning) {
      db.log('warn', 'Scheduler tick skipped — bot already running');
      return;
    }

    _isRunning = true;
    lastError  = null;

    db.log('info', 'Scheduler triggered bot run');
    try {
      const { runBot } = require('../automation/naukri');
      await runBot();
    } catch (err) {
      lastError = err.message;
      db.log('error', `Scheduled run failed: ${err.message}`);
    } finally {
      _isRunning = false;
    }
  });

  db.log('info', `Scheduler started — cron: ${cronTime}`);
  scheduleResumeUploads();
  return cronTime;
}

function stopScheduler() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    db.log('info', 'Scheduler stopped');
  }
}

function getStatus() {
  const settings = db.getSettings();
  const cronTime = cronFromFrequency(settings.run_frequency, settings.cron_time);
  return {
    isRunning:        _isRunning,
    schedulerEnabled: settings.cron_enabled === 'true',
    schedulerActive:  !!currentTask,
    cronTime,
    lastError,
  };
}

async function triggerManualRun() {
  if (_isRunning) throw new Error('Bot is already running');

  _isRunning = true;
  lastError  = null;

  const { runBot } = require('../automation/naukri');
  runBot()
    .catch(err => {
      lastError = err.message;
      db.log('error', `Manual run failed: ${err.message}`);
    })
    .finally(() => { _isRunning = false; });

  return { started: true };
}

async function triggerScrapeOnly() {
  if (_isRunning) throw new Error('Bot is already running');

  _isRunning = true;
  lastError  = null;

  const { runScrapeOnly } = require('../automation/naukri');
  runScrapeOnly()
    .catch(err => {
      lastError = err.message;
      db.log('error', `Scrape-only run failed: ${err.message}`);
    })
    .finally(() => { _isRunning = false; });

  return { started: true };
}

async function triggerResumeUpload() {
  try {
    const { uploadResumeStandalone } = require('../automation/naukri');
    uploadResumeStandalone().catch(e => db.log('error', `Resume upload failed: ${e.message}`));
    return { started: true };
  } catch (e) {
    throw e;
  }
}

async function triggerProfileRefresh() {
  try {
    const { refreshProfileOnly } = require('../automation/naukri');
    refreshProfileOnly().catch(e => db.log('error', `Profile refresh failed: ${e.message}`));
    return { started: true };
  } catch (e) {
    throw e;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  getStatus,
  triggerManualRun,
  triggerScrapeOnly,
  triggerResumeUpload,
  triggerProfileRefresh,
  scheduleResumeUploads,
};
