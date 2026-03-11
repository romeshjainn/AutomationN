'use strict';

let bot = null;
let _chatId = null;
let _enabled = false;
let _callbackHandler = null;

function onCallback(fn) {
  _callbackHandler = fn;
}

function initialize(token, chatId) {
  // Stop existing bot
  if (bot) {
    try { bot.stopPolling(); } catch {}
    bot = null;
  }
  _enabled = false;

  if (!token || !chatId) return;

  try {
    const TelegramBot = require('node-telegram-bot-api');
    bot = new TelegramBot(token, { polling: true });
    _chatId = chatId;
    _enabled = true;

    bot.on('callback_query', (query) => {
      if (_callbackHandler) _callbackHandler(query.data, query.id);
    });

    bot.on('polling_error', (err) => {
      if (!err.message.includes('ETELEGRAM')) {
        console.error('[Telegram] Polling error:', err.code);
      }
    });

    console.log('[Telegram] Bot initialized and polling');
  } catch (e) {
    console.error('[Telegram] Init failed:', e.message);
    bot = null;
    _enabled = false;
  }
}

async function sendJobNotification(job) {
  if (!_enabled || !bot || !_chatId) return false;
  try {
    const msg = `\u{1F195} *New Job*\n*${esc(job.title)}*\n\u{1F3E2} ${esc(job.company)}\n\u{1F4CD} ${esc(job.location || 'N/A')}\n\u{1F4B0} ${esc(job.salary || 'Not disclosed')}\n\u26A1 ${job.easy_apply ? 'Easy Apply \u2705' : 'External Apply'}\n[View Job](${job.url})`;
    await bot.sendMessage(_chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '\u2705 Apply', callback_data: `apply_${job.id}` },
          { text: '\u274C Skip',  callback_data: `skip_${job.id}` },
        ]],
      },
    });
    return true;
  } catch (e) {
    console.error('[Telegram] sendJobNotification failed:', e.message);
    return false;
  }
}

async function sendMessage(text) {
  if (!_enabled || !bot || !_chatId) return false;
  try {
    await bot.sendMessage(_chatId, text, { parse_mode: 'Markdown' });
    return true;
  } catch (e) {
    console.error('[Telegram] sendMessage failed:', e.message);
    return false;
  }
}

async function answerCallbackQuery(queryId, text) {
  if (!bot) return;
  try {
    await bot.answerCallbackQuery(queryId, { text: text || 'Done' });
  } catch {}
}

function esc(t) {
  if (!t) return '';
  return String(t).replace(/[_*[\]()~`>#+=|{}.!\-]/g, '\\$&');
}

function isReady() {
  return _enabled && !!bot && !!_chatId;
}

function stop() {
  if (bot) {
    try { bot.stopPolling(); } catch {}
    bot = null;
    _enabled = false;
  }
}

module.exports = { initialize, onCallback, sendJobNotification, sendMessage, answerCallbackQuery, isReady, stop };
