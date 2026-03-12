// ─────────────────────────────────────────────────────────────
//  platforms/index.js — Platform registry
//
//  To add a new platform:
//  1. Create platforms/yourplatform/ with the full structure
//  2. Add one entry to PLATFORMS below
//  3. Add YOUR_BOT_TOKEN and YOUR_CHAT_ID to root .env
//  Nothing else needs changing.
// ─────────────────────────────────────────────────────────────

export const PLATFORMS = {
  naukri: {
    name: 'Naukri',
    description: 'Naukri.com — Indian job market, React/Node roles',
    modes: {
      live: () => import('./naukri/src/modes/live.js'),
      quick: () => import('./naukri/src/modes/quick.js'),
    },
  },

  yc: {
    name: 'YC / Work at a Startup',
    description: 'workatastartup.com — YC-backed startups, remote-only',
    modes: {
      live: () => import('./yc/src/modes/live.js'),
      quick: () => import('./yc/src/modes/quick.js'),
    },
  },

  // ── Add new platforms here ────────────────────────────────
  // linkedin: {
  //   name: 'LinkedIn',
  //   description: 'LinkedIn — broad market, all seniorities',
  //   modes: {
  //     live: () => import('./linkedin/src/modes/live.js'),
  //     quick: () => import('./linkedin/src/modes/quick.js'),
  //   },
  // },
};

/** Get all registered platform names */
export const PLATFORM_NAMES = Object.keys(PLATFORMS);
