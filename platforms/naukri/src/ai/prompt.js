// ─────────────────────────────────────────────────────────────
//  platforms/naukri/src/ai/prompt.js
//  Naukri-specific AI evaluation — fully personalized
//
//  Input:  enriched job object (after detail page visit)
//  Output: { score, pass, reason, highlights, concerns, ai_used }
//
//  Fallback: static scoring if Ollama is down
// ─────────────────────────────────────────────────────────────

import { askAI } from '#core/ai/client.js';
import { scoreJob } from '../pipeline/scorer.js';
import { getSetting } from '../utils/settings.js';

// ── Naukri-specific prompt ─────────────────────────────────
// Tailored for Indian job market — Naukri listings, LPA salary, location

function buildPrompt(job) {
  const skills = job.skills_needed || 'Not listed';
  const applicants = job.applicants != null ? `${job.applicants} applicants` : 'Not disclosed';
  const salary = job.salary || 'Not disclosed';
  const easyApply = job.easy_apply ? 'Yes' : 'No';
  const posted = job.how_long || 'Unknown';

  return `
You are a strict job filter for a specific developer. Your job is to REJECT irrelevant jobs aggressively.

DEVELOPER PROFILE:
- Experience: 2.4 years
- Languages: JavaScript (ES6+), TypeScript
- Frontend: React.js, Next.js (SSR/SSG/ISR), Redux Toolkit, Tailwind CSS, NativeWind, HTML5, CSS3, Formik, Yup
- Mobile: React Native, Ionic Capacitor, Android Deployment
- Backend: Node.js, Express.js, NestJS, REST APIs, JWT, Firebase (Auth, FCM, Firestore)
- Database: MySQL, MongoDB
- Integrations: Stripe, Google Maps API, WebSockets, Social Login
- Tools: Git, GitHub, Vercel, Netlify, Figma, CI/CD, Agile/Scrum
- Location preference: Pune, Remote or anywhere in India
- LEAST preferred: React Native / Mobile (only send if score is exceptional 80+)

HARD REJECT RULES — if ANY of these match, return pass: false and score below 40, no exceptions:
1. Job primarily requires Java, Spring Boot, Hibernate, J2EE, Core Java
2. Job primarily requires .NET, C#, ASP.NET, WPF, WCF
3. Job primarily requires Python, Django, Flask, FastAPI (as primary skill)
4. Job primarily requires PHP, Laravel, CodeIgniter, Symfony
5. Job primarily requires Ruby, Ruby on Rails
6. Job primarily requires Android (native Java/Kotlin), iOS (Swift/Objective-C) without React Native
7. Job primarily requires Angular, Vue.js, Backbone (NOT React)
8. Job requires SAP, Salesforce, ServiceNow, Mainframe, COBOL
9. Job requires DevOps/Cloud only roles (AWS DevOps, Azure Admin etc)
10. Job requires QA, Testing, Automation (Selenium, Appium, Cypress tester role)
11. Job requires Data Science, Machine Learning, AI Engineering, Data Engineering
12. Job requires Blockchain, Solidity, Smart Contracts
13. Experience minimum required is more than 3 years
14. Salary is below 5.5 LPA
15. BPO, KPO, customer support, voice/non-voice process, email support, chat support, data entry
16. Title or description mentions: "non voice", "voice process", "BPO", "KPO", "back office", "telecaller", "data entry"

ACCEPT CRITERIA — job should pass if:
1. Primarily uses React.js / Next.js / React Native
2. Primarily uses Node.js / Express.js / NestJS backend
3. MERN / Full Stack JavaScript
4. Frontend role with React as main framework
5. Mobile role with React Native
6. Full Stack role requiring JavaScript/TypeScript on both ends
7. Title says "Frontend Developer" or "UI Developer" — PASS if React/JS is in skills
8. Title says "Software Engineer" — PASS if React/Node is in skills

SCORING GUIDE:
- 90-100: Perfect — React/Next/Node, TypeScript, low applicants, good salary, just posted
- 75-89:  Great — React or Node focused, relevant stack, acceptable conditions
- 60-74:  Good — mostly relevant, minor mismatches
- 40-59:  Weak — only partial match, mixed stack
- 0-39:   Reject — irrelevant tech, wrong stack, hard reject triggered

JOB DETAILS:
- Title: ${job.title}
- Experience Required: ${job.experience || 'Not specified'}
- Salary: ${salary}
- Location: ${job.city || 'Not specified'}
- Posted: ${posted}
- Applicants: ${applicants}
- Easy Apply: ${easyApply}
- Skills Required: ${skills}

Return ONLY this JSON, nothing else, no extra text:
{
  "score": <number 0-100>,
  "pass": <true if score >= 60, false otherwise>,
  "reason": "<one line — why pass or reject>",
  "highlights": "<key matching skills if passing>",
  "concerns": "<red flags or mismatches>"
}
`.trim();
}

// ── Parse AI response ─────────────────────────────────────────

function parseResponse(raw) {
  if (!raw) return null;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.score !== 'number') return null;
    if (typeof parsed.pass !== 'boolean') parsed.pass = parsed.score >= 60;

    return {
      score: Math.min(100, Math.max(0, Math.round(parsed.score))),
      pass: parsed.pass,
      reason: parsed.reason || '',
      highlights: parsed.highlights || '',
      concerns: parsed.concerns || '',
    };
  } catch {
    return null;
  }
}

// ── Static fallback ───────────────────────────────────────────

function staticFallback(job, keywords) {
  const MIN_SCORE = getSetting('MIN_SCORE');
  const { score, matched_keywords } = scoreJob(job, keywords);
  return {
    score,
    pass: score >= MIN_SCORE,
    reason: `Static score (AI unavailable) — matched: ${matched_keywords?.join(', ')}`,
    highlights: '',
    concerns: '',
    ai_used: false,
  };
}

// ── Main evaluator ────────────────────────────────────────────

/**
 * Evaluate a Naukri job using AI.
 * Falls back to static scoring if AI is unavailable.
 */
export async function evaluateJob(job, type, keywords, aiAvailable = true) {
  if (!aiAvailable) return staticFallback(job, keywords);

  const prompt = buildPrompt(job);
  const raw = await askAI(prompt);

  if (!raw) {
    console.log(`    ⚠️  AI unavailable — using static score for: ${job.title}`);
    return staticFallback(job, keywords);
  }

  const result = parseResponse(raw);

  if (!result) {
    console.log(`    ⚠️  AI response unparseable — using static score for: ${job.title}`);
    return staticFallback(job, keywords);
  }

  return { ...result, ai_used: true };
}
