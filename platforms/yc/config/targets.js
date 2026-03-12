// ─────────────────────────────────────────────────────────────
//  platforms/yc/config/targets.js
//  YC / workatastartup.com job search targets
//  Remote-only, React/Node/FullStack focused
// ─────────────────────────────────────────────────────────────

// workatastartup.com URL format:
//   /jobs                    → all jobs
//   /jobs?role=eng           → engineering only  (most relevant)
//   /jobs?role=eng&remote=1  → engineering, remote
//
// One target is enough — the page loads all engineering jobs,
// keyword filter + AI handles React/Node selection from there.

export const JOB_TARGETS = [
  {
    type: 'engineering',
    mustHave: [
      'react', 'reactjs', 'react.js', 'next.js', 'nextjs',
      'node.js', 'nodejs', 'express', 'nestjs',
      'full stack', 'fullstack', 'frontend', 'front-end',
      'javascript', 'typescript', 'mern',
    ],
    keywords: [
      // React / Frontend
      'react', 'reactjs', 'react.js', 'next.js', 'nextjs',
      'redux', 'zustand', 'context api', 'react query',
      'tailwind', 'typescript', 'javascript', 'es6',
      'frontend', 'front-end', 'ui engineer',
      // Node / Backend
      'node.js', 'nodejs', 'express', 'nestjs',
      'mern', 'full stack', 'fullstack',
      'mongodb', 'postgresql', 'mysql',
      'rest api', 'graphql', 'jwt',
      // React Native
      'react native', 'expo',
    ],
    url: 'https://www.workatastartup.com/jobs?role=eng',
  },
];
