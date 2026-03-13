// ─────────────────────────────────────────────────────────────
//  platforms/naukri/src/utils/telegram.js
//
//  Naukri-specific Telegram logic.
//  Formatting, buttons, report all live here.
//  Uses core/telegram/base.js for raw sending.
// ─────────────────────────────────────────────────────────────

import { getTodayStats, updateStatus } from '#core/db/queries/jobs.js';

import {
  answerCallback,
  notify as coreNotify,
  editMessageButtons,
  sendMessage,
  sendWithButtons,
  sleep,
} from '#core/telegram/base.js';

export const NAUKRI_TELEGRAM = {
  token: process.env.NAUKRI_BOT_TOKEN,
  chatId: process.env.NAUKRI_CHAT_ID,
};

// ── Format job message ────────────────────────────────────────

function formatJob(job, index) {
  const hotFlag = job.priority === 'hot' ? '🔥 ' : '';
  const stars = '⭐'.repeat(Math.min(5, Math.round(job.score / 20)));

  const applicantLine =
    job.applicants != null
      ? `👥 ${job.applicants < 10 ? '🔥 ' : ''}${job.applicants} Applicants`
      : '👥 Applicants: Not Disclosed';

  const openingLine = job.openings
    ? `  |  📋 ${job.openings} Opening${job.openings > 1 ? 's' : ''}`
    : '';

  const salaryLine = job.salary ? `\n💰 ${job.salary}` : '\n💰 Salary: Not Disclosed';

  const easyApply = job.easy_apply ? '✅ Easy Apply' : '📝 Manual Apply';
  const posted = job.how_long || job.posted_on || 'Unknown';

  const skillsList = (job.skills_needed || 'N/A').split(',');
  const skills = skillsList.slice(0, 8).join(', ') + (skillsList.length > 8 ? '…' : '');

  const matched = Array.isArray(job.matched_keywords)
    ? job.matched_keywords.join(', ')
    : job.matched_keywords || '';

  return (
    `${hotFlag}<b>${index}. ${job.title}</b>\n\n` +
    `🏢 ${job.city || 'Location N/A'}\n` +
    `💼 Experience: ${job.experience || 'N/A'}\n` +
    `${easyApply}${salaryLine}\n` +
    `⏰ Posted: ${posted}\n` +
    `${applicantLine}${openingLine}\n\n` +
    `🎯 Score: <b>${job.score}/100</b>  ${stars}\n` +
    `🛠 <b>Skills:</b> <i>${skills}</i>\n` +
    `🔑 <b>Matched:</b> ${matched}`
  );
}

// ── Buttons ───────────────────────────────────────────────────

function jobButtons(job) {
  return [
    [
      { text: '🔗 Open & Apply', url: job.link },
      { text: '✅ Mark Applied', callback_data: `applied_${job.id}` },
    ],
    [
      { text: '🔖 Save', callback_data: `save_${job.id}` },
      { text: '⏭ Skip', callback_data: `skip_${job.id}` },
    ],
  ];
}

function appliedButtons(job) {
  // Replaces buttons after Applied is tapped
  return [
    [
      { text: '✅ Applied!', callback_data: 'noop' },
      { text: '🔗 Open Job', url: job.link },
    ],
  ];
}

// ── Public send functions ─────────────────────────────────────

export async function sendJob(job, index) {
  await sendWithButtons(NAUKRI_TELEGRAM, formatJob(job, index), jobButtons(job));
  await sleep(350);
}

export async function sendHeader(totalJobs, mode) {
  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const modeTag = mode === 'quick' ? '⚡ Quick Run' : '🔄 Live Mode';

  await sendMessage(
    NAUKRI_TELEGRAM,
    `🌅 <b>Good ${greeting}!</b>\n\n` +
      `${modeTag} — ${now}\n` +
      `📊 Sending <b>${totalJobs} best jobs</b> today\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  );
}

export async function sendFooter(totalSent) {
  await sendMessage(
    NAUKRI_TELEGRAM,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <b>That's all ${totalSent} jobs!</b>\n\n` +
      `👆 Apply to <b>score 80+</b> and <b>Easy Apply</b> first\n` +
      `🔥 Hot jobs = less than 10 applicants\n` +
      `💡 Tip: Less applicants = faster callback\n\n` +
      `Good luck today! 🚀`,
  );
}

export async function sendDailyReport() {
  const stats = getTodayStats();
  const total = stats.sent + stats.applied + stats.skipped + stats.saved;

  await sendMessage(
    NAUKRI_TELEGRAM,
    `📊 <b>Naukri Daily Report</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔍 Sent to you:  <b>${total}</b>\n` +
      `✅ Applied:      <b>${stats.applied}</b>\n` +
      `⏭  Skipped:     <b>${stats.skipped}</b>\n` +
      `🔖 Saved:        <b>${stats.saved}</b>\n` +
      `🔥 Hot jobs:     <b>${stats.hot_jobs}</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Good work today! 💪`,
  );
}

export async function notify(text) {
  await coreNotify(NAUKRI_TELEGRAM, text);
}

// ── Button tap handler ────────────────────────────────────────

export async function handleCallback(body) {
  const callback = body?.callback_query;
  if (!callback) return;

  const data = callback.data || '';
  const messageId = callback.message?.message_id;
  const [action, jobId] = data.split('_');
  const id = parseInt(jobId);

  if (action === 'noop') {
    // already actioned — just clear spinner
  } else if (action === 'applied') {
    updateStatus(id, 'applied');
    // swap buttons to show applied state
    await editMessageButtons(
      NAUKRI_TELEGRAM,
      messageId,
      appliedButtons({
        link: callback.message?.reply_markup?.inline_keyboard?.[0]?.[0]?.url || '',
      }),
    );
    await coreNotify(NAUKRI_TELEGRAM, '✅ Marked as applied!');
  } else if (action === 'save') {
    updateStatus(id, 'saved');
    await coreNotify(NAUKRI_TELEGRAM, '🔖 Saved!');
  } else if (action === 'skip') {
    updateStatus(id, 'skipped');
    await coreNotify(NAUKRI_TELEGRAM, '⏭ Skipped!');
  }

  await answerCallback(NAUKRI_TELEGRAM, callback.id);
}
