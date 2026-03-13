// ─────────────────────────────────────────────────────────────
//  core/telegram/base.js
//
//  Raw Telegram utilities ONLY.
//  No job formatting, no buttons, no platform logic here.
//  Every platform imports these and builds on top.
// ─────────────────────────────────────────────────────────────

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Core send functions ───────────────────────────────────────

/**
 * Send a plain text or HTML message.
 * All other send functions build on this.
 */
export async function sendMessage(tg, text, extra = {}) {
  const res = await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: tg.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    }),
  });
  if (!res.ok) console.error('❌ Telegram sendMessage error:', await res.text());
  return res.ok;
}

/**
 * Edit buttons on an existing message.
 * Used to update button state after tap (e.g. Applied → ✅ Applied!)
 */
export async function editMessageButtons(tg, messageId, inlineKeyboard) {
  const res = await fetch(`https://api.telegram.org/bot${tg.token}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: tg.chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: inlineKeyboard },
    }),
  });
  if (!res.ok) console.error('❌ Telegram editButtons error:', await res.text());
  return res.ok;
}

/**
 * Answer a callback query — removes loading spinner on button tap.
 * Always call this after handling any button tap.
 */
export async function answerCallback(tg, callbackQueryId, text = '') {
  await fetch(`https://api.telegram.org/bot${tg.token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
}

/**
 * Quick notify — send a plain text alert.
 * Use for errors, status updates, daily cap hits etc.
 */
export async function notify(tg, text) {
  await sendMessage(tg, `ℹ️ ${text}`);
}

/**
 * Send with inline keyboard buttons.
 * Pass fully built inline_keyboard array — platform decides the buttons.
 */
export async function sendWithButtons(tg, text, inlineKeyboard) {
  return sendMessage(tg, text, {
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}
