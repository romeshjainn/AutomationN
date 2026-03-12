// ─────────────────────────────────────────────────────────────
//  Telegram notifier
//  Filters 200 scraped jobs → sends top 20 with inline buttons
// ─────────────────────────────────────────────────────────────

const TELEGRAM_API = 'https://api.telegram.org';

// ── Low-level send ────────────────────────────────────────────

async function sendMessage(token, chatId, text, extra = {}) {
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  const res = await fetch(url, {
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
}

// ── Super filter ──────────────────────────────────────────────

/**
 * Filters and ranks jobs from a large pool.
 *
 * Scoring weights:
 *  - keyword score (from scraper)   → 50%
 *  - recency (posted today/1day)    → 30%
 *  - experience match (1-2.5 yrs)   → 20%
 *
 * Hard filters:
 *  - drops score < MIN_COMBINED
 *  - drops experience clearly outside 0-4 yr range
 */
function superFilter(allJobs, topN = 20) {
  const now = new Date();

  const scored = allJobs.map((job) => {
    // ── 1. Keyword score (already 0–10) → normalize to 0–5
    const kwScore = (job.score / 10) * 5;

    // ── 2. Recency score (0–3)
    let recencyScore = 0;
    const hl = (job.how_long || '').toLowerCase();
    if (/hour|just now|today/.test(hl)) recencyScore = 3;
    else if (/1 day|yesterday/.test(hl)) recencyScore = 2;
    else if (/2 day/.test(hl)) recencyScore = 1.5;
    else if (/3 day/.test(hl)) recencyScore = 1;
    else if (/week/.test(hl)) recencyScore = 0.3;
    // also parse posted_on date as fallback
    else if (job.posted_on) {
      const daysAgo = Math.floor((now - new Date(job.posted_on)) / 864e5);
      if (daysAgo === 0) recencyScore = 3;
      else if (daysAgo === 1) recencyScore = 2;
      else if (daysAgo <= 3) recencyScore = 1;
      else if (daysAgo <= 7) recencyScore = 0.3;
    }

    // ── 3. Experience score (0–2)
    // Target: 1–3 years. Penalise if exp clearly says 5+ yrs or 0 yrs
    let expScore = 1; // neutral default
    const expStr = (job.experience || '').toLowerCase();
    const nums = expStr.match(/\d+(\.\d+)?/g)?.map(Number) || [];
    if (nums.length >= 2) {
      const [min, max] = [nums[0], nums[1]];
      if (max <= 4 && min <= 3)
        expScore = 2; // perfect range
      else if (max <= 6 && min <= 4)
        expScore = 1; // acceptable
      else expScore = 0; // too senior
    } else if (nums.length === 1) {
      expScore = nums[0] <= 4 ? 1.5 : 0;
    }

    // ── Combined score (max ~10)
    const combined = parseFloat((kwScore + recencyScore + expScore).toFixed(2));

    return { ...job, combined };
  });

  // Hard drop: experience too senior (expScore = 0 means combined is low anyway)
  // and combined score too low
  const filtered = scored
    .filter((j) => j.combined >= 2)
    .sort((a, b) => b.combined - a.combined)
    .slice(0, topN);

  return filtered;
}

// ── Formatters ────────────────────────────────────────────────

function getTimeOfDay() {
  const hour = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false,
  });
  const h = parseInt(hour);
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function formatHeader(totalSent) {
  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const greeting = getTimeOfDay();

  return (
    `🌅 <b>Good ${greeting}, Romeh!</b>\n` +
    `Here's your Naukri Job Report 🔥\n\n` +
    `📅 <b>${now}</b>\n` +
    `📊 Showing top <b>${totalSent} jobs</b> from Naukri\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function formatJob(job, index) {
  const stars = '⭐'.repeat(Math.min(5, Math.round(job.score / 2)));
  const applyTag = job.is_auto_apply_available ? '✅ Easy Apply' : '📝 Manual';
  const posted = job.how_long || (job.posted_on ? `Posted ${job.posted_on}` : 'Date unknown');

  const skills = job.skills_needed
    ? job.skills_needed.slice(0, 180) + (job.skills_needed.length > 180 ? '…' : '')
    : 'N/A';

  // Applicants — highlight if high competition
  let applicantsLine = '';
  if (job.applicants_count) {
    const isHot = /100\+|200\+|500\+/i.test(job.applicants_count);
    applicantsLine = `\n👥 ${isHot ? '🔥 ' : ''}${job.applicants_count}`;
  }

  const openingsLine = job.openings ? `  |  📋 ${job.openings}` : '';
  const salaryLine = job.salary ? `\n💰 ${job.salary}` : '';

  return (
    `<b>${index}. ${job.title}</b>\n` +
    `🏢 ${job.city || 'Location N/A'}\n` +
    `💼 Exp: ${job.experience || 'N/A'}   |   ${applyTag}\n` +
    `⏰ ${posted}${applicantsLine}${openingsLine}${salaryLine}\n` +
    `🎯 Match: <b>${job.score}/10</b>  ${stars}\n` +
    `🛠 <i>${skills}</i>`
  );
}

/** Inline keyboard: Check | Apply | Skip */
function jobButtons(job) {
  return {
    inline_keyboard: [
      [
        { text: '🔍 Check', url: job.link },
        { text: '✅ Apply', url: job.link },
        { text: '⏭ Skip', callback_data: `skip_${job.link.slice(-20)}` },
      ],
    ],
  };
}

function formatFooter(totalJobs) {
  return (
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>That's all ${totalJobs} jobs!</b>\n` +
    `👆 Apply to <b>score 7+</b> jobs first.\n` +
    `💡 Tip: Easy Apply = faster response\n` +
    `Good luck today! 🚀`
  );
}

// ── Main export ───────────────────────────────────────────────

/**
 * Filter 200 scraped jobs → pick best 20 → send to Telegram
 * with inline Check / Apply / Skip buttons per job.
 */
export async function notifyTelegram(token, chatId, allJobs, topN = 20) {
  console.log(`\n🔬 Super-filtering ${allJobs.length} jobs → picking top ${topN}...`);

  const top = superFilter(allJobs, topN);
  console.log(`✅ ${top.length} jobs passed super filter`);

  // ── Header
  await sendMessage(token, chatId, formatHeader(top.length));
  await delay(400);

  // ── Each job with buttons
  for (let i = 0; i < top.length; i++) {
    await sendMessage(token, chatId, formatJob(top[i], i + 1), {
      reply_markup: jobButtons(top[i]),
    });
    await delay(350); // stay under Telegram rate limit
  }

  // ── Footer separator
  await sendMessage(token, chatId, formatFooter(top.length));

  console.log('📱 Telegram notifications sent!');
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
