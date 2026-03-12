// ─────────────────────────────────────────────────────────────
//  platforms/naukri/config/telegram.js
//  Naukri bot credentials — reads NAUKRI_* from root .env
//  This object is passed to every core/telegram/base.js call
// ─────────────────────────────────────────────────────────────

export const NAUKRI_TELEGRAM = {
  token: process.env.NAUKRI_BOT_TOKEN,
  chatId: process.env.NAUKRI_CHAT_ID,
};
