// ─────────────────────────────────────────────────────────────
//  Telegram — format, send, handle button callbacks
// ─────────────────────────────────────────────────────────────

import { updateStatus } from '../db/queries/jobs.js';
import { getTodayStats } from '../db/queries/jobs.js';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ── Low level send ────────────────────────────────────────────

async function sendMessage(chatId, text, extra = {}) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    }),
  });
  if (!res.ok) console.error('❌ Telegram error:', await res.text());
  return res.ok;
}

// ── Format one job ────────────────────────────────────────────

function formatJob(job, index) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const hotFlag = job.priority === 'hot' ? '🔥 ' : '';
  const stars = '⭐'.repeat(Math.min(5, Math.round(job.score / 20)));

  // Applicants line
  let applicantLine = '';
  if (job.applicants !== null && job.applicants !== undefined) {
    const hot = job.applicants < 10 ? '🔥 ' : '';
    applicantLine = `👥 ${hot}${job.applicants} Applicants`;
  } else {
    applicantLine = '👥 Applicants: Not Disclosed';
  }

  const openingLine = job.openings
    ? `  |  📋 ${job.openings} Opening${job.openings > 1 ? 's' : ''}`
    : '';
  const salaryLine = job.salary ? `\n💰 ${job.salary}` : '\n💰 Salary: Not Disclosed';
  const easyApply = job.easy_apply ? '✅ Easy Apply' : '📝 Manual Apply';
  const posted = job.how_long || job.posted_on || 'Unknown';

  const skills =
    (job.skills_needed || 'N/A').split(',').slice(0, 8).join(', ') + // max 8 skills shown
    ((job.skills_needed || '').split(',').length > 8 ? '…' : '');

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

// ── Inline buttons ────────────────────────────────────────────

function jobButtons(job) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Apply', url: job.link },
        { text: '🔖 Save', callback_data: `save_${job.id}` },
        { text: '⏭ Skip', callback_data: `skip_${job.id}` },
      ],
    ],
  };
}

// ── Send one job to Telegram ──────────────────────────────────

export async function sendJob(job, index) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const text = formatJob(job, index);
  await sendMessage(chatId, text, { reply_markup: jobButtons(job) });
  await sleep(350);
}

// ── Send header ───────────────────────────────────────────────

export async function sendHeader(totalJobs, mode) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
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
    chatId,
    `🌅 <b>Good ${greeting}, Romeh!</b>\n\n` +
      `${modeTag} — ${now}\n` +
      `📊 Sending <b>${totalJobs} best jobs</b> today\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  );
}

// ── Send footer ───────────────────────────────────────────────

export async function sendFooter(stats) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  await sendMessage(
    chatId,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <b>That's all ${stats.total} jobs!</b>\n\n` +
      `👆 Apply to <b>score 80+</b> and <b>Easy Apply</b> first\n` +
      `🔥 Hot jobs = less than 10 applicants\n` +
      `💡 Tip: Less applicants = faster callback\n\n` +
      `Good luck today! 🚀`,
  );
}

// ── Daily report ──────────────────────────────────────────────

export async function sendDailyReport() {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const stats = getTodayStats();
  const total = stats.sent + stats.applied + stats.skipped + stats.saved;

  await sendMessage(
    chatId,
    `📊 <b>Daily Report</b>\n` +
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

// ── Handle Telegram webhook callbacks ────────────────────────

export async function handleCallback(body) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const callback = body?.callback_query;
  if (!callback) return;

  const data = callback.data || '';
  const msgId = callback.message?.message_id;

  const [action, jobId] = data.split('_');
  const id = parseInt(jobId);

  const statusMap = { save: 'saved', skip: 'skipped' };
  const status = statusMap[action];

  if (status && id) {
    updateStatus(id, status);
    const emoji = status === 'saved' ? '🔖 Saved!' : '⏭ Skipped!';
    await sendMessage(chatId, `${emoji} Job #${id} marked as ${status}.`);
  }

  // Answer callback to remove loading spinner on button
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callback.id }),
  });
}

// ── Plain message helper ──────────────────────────────────────

export async function notify(text) {
  await sendMessage(process.env.TELEGRAM_CHAT_ID, text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
