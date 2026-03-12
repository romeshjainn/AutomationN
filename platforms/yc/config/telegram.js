// ─────────────────────────────────────────────────────────────
//  platforms/yc/config/telegram.js
//  YC bot credentials — reads YC_* from root .env
//  Completely separate from Naukri bot
// ─────────────────────────────────────────────────────────────

export const YC_TELEGRAM = {
  token: process.env.YC_BOT_TOKEN,
  chatId: process.env.YC_CHAT_ID,
};
