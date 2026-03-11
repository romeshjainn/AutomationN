# Naukri Bot

Automated job application bot for Naukri.com with a local admin dashboard.

## Features

- Logs into Naukri.com and saves session (handles OTP on first run)
- Refreshes profile visibility on every run
- Searches jobs by configurable keywords, experience, salary, and job type
- Auto-applies to new jobs with configurable delay and daily limit
- Deduplicates jobs — never applies to the same job twice
- Cron-based scheduler (daily, twice a day, hourly, or custom)
- Local admin dashboard at `http://localhost:4000`

---

## Quick Start

### 1. Install dependencies

```bash
cd naukri-bot
npm install
npx playwright install chromium
```

### 2. Configure credentials

```bash
cp .env.example .env
# Edit .env and fill in NAUKRI_EMAIL and NAUKRI_PASSWORD
```

### 3. First run (headed — handles OTP if needed)

```bash
npm run run-bot:headed
```

Complete any OTP prompt in the browser window. Session is saved after login.

### 4. Start the dashboard server

```bash
npm start
```

Open **http://localhost:4000** in your browser.

---

## PM2 Setup (24/7)

```bash
npm install pm2 -g
pm2 start ecosystem.config.js
pm2 startup   # Follow the printed command to enable auto-start on reboot
pm2 save
pm2 status
pm2 logs naukri-bot
```

---

## Dashboard Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Stat cards, recent jobs, recent logs. Auto-refreshes every 15s. |
| **Jobs** | All scraped jobs with filters (All / New / Applied / Skipped). Mark applied or skip. |
| **Settings** | Edit all bot settings without touching code. |
| **Logs** | Full activity log with colour-coded levels. |
| **Run History** | Table of all past bot runs with duration and status. |

---

## Project Structure

```
naukri-bot/
├── src/
│   ├── automation/naukri.js   # Playwright: login, profile refresh, scrape, apply
│   ├── db/database.js         # SQLite: schema, all query functions
│   ├── scheduler/index.js     # node-cron: run management
│   ├── api/server.js          # Express: REST API + static file server
│   └── run.js                 # Standalone bot runner script
├── dashboard/
│   └── index.html             # Full admin UI (single file, no framework)
├── data/                      # Auto-created: naukri.db + session.json
├── .env                       # Your credentials (never commit this)
├── .env.example               # Template
├── ecosystem.config.js        # PM2 config
└── package.json
```

---

## Selectors

Naukri's UI can change. If the bot stops scraping correctly, update the `SEL` object at the top of `src/automation/naukri.js`.

---

## Anti-Detection Guidelines

| Rule | Safe Limit |
|------|-----------|
| Max applies per run | 20–30 |
| Delay between applies | ≥ 3000 ms |
| Run frequency | 1–2× per day |
| Session reuse | Always (avoid repeated logins) |
