// ─────────────────────────────────────────────────────────────
//  platforms/naukri/config/targets.js
//  Job search targets — URLs + keyword sets
//  Add/remove targets here without touching any other file
// ─────────────────────────────────────────────────────────────

export const JOB_TARGETS = [
  {
    type: 'react',
    mustHave: [
      'react', 'reactjs', 'react.js', 'react js',
      'next.js', 'nextjs', 'next js',
      'frontend', 'front end', 'front-end',
      'ui developer', 'ui engineer',
      'javascript', 'typescript',
    ],
    keywords: [
      // Core React
      'react', 'react.js', 'reactjs', 'react js',
      'nextjs', 'next.js', 'next js',
      // State management
      'redux', 'zustand', 'context api', 'react query', 'tanstack',
      // Styling
      'tailwind', 'tailwindcss', 'shadcn', 'styled components', 'material ui', 'mui',
      // Build tools
      'vite', 'webpack',
      // Languages
      'typescript', 'javascript', 'es6',
      // Frontend general
      'frontend', 'front end', 'front-end',
      'html', 'css', 'sass', 'scss',
      'ui developer', 'ui engineer',
      // APIs
      'rest api', 'graphql', 'axios',
    ],
    url: 'https://www.naukri.com/react-dot-js-react-js-developer-react-js-frontend-developer-react-developer-nextjs-typescript-javascript-jobs?k=react.js%2C%20react%20js%20developer%2C%20react%20js%20frontend%20developer%2C%20react%20developer%2C%20nextjs%2C%20typescript%2C%20javascript&nignbevent_src=jobsearchDeskGNB',
  },

  {
    type: 'mern',
    mustHave: [
      'mern', 'mern stack',
      'node.js', 'nodejs', 'node js',
      'backend', 'back end', 'back-end',
      'full stack', 'fullstack', 'full-stack',
      'express', 'expressjs', 'nestjs',
    ],
    keywords: [
      'mern', 'mern stack',
      'node.js', 'nodejs', 'node js',
      'express', 'expressjs', 'nestjs',
      'react', 'reactjs',
      'mongodb', 'mongoose', 'postgresql', 'postgres', 'mysql',
      'full stack', 'fullstack', 'full-stack',
      'backend', 'back end', 'back-end',
      'rest api', 'graphql', 'api development',
      'jwt', 'oauth', 'redis',
      'javascript', 'typescript',
    ],
    url: 'https://www.naukri.com/mern-stack-mern-stack-developer-mern-full-stack-developer-frontend-development-frontend-software-developer-node-dot-js-backend-mern-stack-mern-express-nestjs-jobs?k=mern%20stack%2C%20mern%20stack%20developer%2C%20mern%20full%20stack%20developer%2C%20frontend%20development%2C%20frontend%20software%20developer%2C%20node.js%2C%20backend%2C%20mern%20stack%2C%20mern%2C%20express%2C%20nestjs&nignbevent_src=jobsearchDeskGNB',
  },

  {
    type: 'reactnative-node',
    mustHave: [
      'react native', 'reactnative', 'react-native',
      'mobile developer', 'mobile application',
      'android', 'ios',
    ],
    keywords: [
      'react native', 'reactnative', 'react-native',
      'expo', 'expo go',
      'ios', 'android', 'mobile', 'mobile app',
      'navigation', 'react navigation',
      'redux', 'zustand', 'context api',
      'node.js', 'nodejs', 'express', 'nestjs', 'backend', 'rest api',
      'javascript', 'typescript',
    ],
    url: 'https://www.naukri.com/react-native-react-native-developer-react-native-mobile-application-developer-node-dot-js-node-js-backend-developer-node-js-developer-backend-development-backend-react-native-jobs?k=react%20native%2C%20react%20native%20developer%2C%20react%20native%20mobile%20application%20developer%2C%20node.js%2C%20node%20js%20backend%20developer%2C%20node%20js%20developer%2C%20backend%20development%2C%20backend%2C%20react%20native&nignbevent_src=jobsearchDeskGNB',
  },
];
