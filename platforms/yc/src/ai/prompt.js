// ─────────────────────────────────────────────────────────────
//  platforms/yc/src/ai/prompt.js
//  YC / workatastartup.com AI evaluation — startup-focused
//
//  Different from Naukri prompt:
//  - No salary LPA filter (USD salaries)
//  - Remote-work emphasis
//  - Startup culture fit matters
//  - YC-backed companies = higher quality signal
// ─────────────────────────────────────────────────────────────

import { askAI } from '../../../../core/ai/client.js';
import { scoreJob } from '../pipeline/scorer.js';
import { getSetting } from '../utils/settings.js';

function buildPrompt(job) {
  const skills = job.skills_needed || 'Not listed';
  const applicants = job.applicants != null ? `${job.applicants} applicants` : 'Not disclosed';
  const salary = job.salary || 'Not disclosed';
  const easyApply = job.easy_apply ? 'Yes' : 'No';
  const posted = job.how_long || 'Unknown';
  const company = job.company || 'Unknown startup';

  return `
You are a strict job filter for a developer seeking remote startup jobs. Evaluate YC/startup listings aggressively.

DEVELOPER PROFILE:
- Experience: 2.4 years total
- Languages: JavaScript (ES6+), TypeScript
- Frontend: React.js, Next.js (SSR/SSG/ISR), Redux Toolkit, Tailwind CSS, NativeWind
- Mobile: React Native, Ionic Capacitor
- Backend: Node.js, Express.js, NestJS, REST APIs, JWT, Firebase
- Database: MySQL, MongoDB
- Integrations: Stripe, Google Maps API, WebSockets, Social Login
- Tools: Git, GitHub, Vercel, Figma, CI/CD
- Target: Remote-only, startup environment, equity + USD salary preferred
- OPEN TO: Full stack, frontend, backend Node.js, React Native (if startup is strong)

HARD REJECT RULES — return pass: false and score < 40 if ANY match:
1. Primary stack is Java, Spring, Python, PHP, .NET, Ruby, Go, Rust (as main requirement)
2. Primary stack is Angular, Vue without React alternative
3. Native Android/iOS without React Native option
4. QA, testing, DevOps, SRE, Data Science, ML Engineering roles
5. Non-technical roles: sales, marketing, customer success, account management
6. Blockchain/crypto/Web3 (Solidity, smart contracts)
7. Requires 4+ years experience as minimum
8. Onsite-only in a location that is NOT remote
9. Company appears to be a body-shop / staffing agency
10. Role is primarily non-voice/voice/BPO support disguised as tech

ACCEPT CRITERIA — pass if ANY match:
1. Frontend role with React.js / Next.js as primary framework
2. Full Stack with Node.js + React (MERN/MEAN with React)
3. Backend Node.js / Express / NestJS role
4. React Native mobile role at a funded startup
5. Remote-friendly startup with relevant JS/TS stack
6. YC-backed company is a strong positive signal

STARTUP FIT SCORING BOOST:
- YC-backed or well-funded: +5 points
- Fully remote: +5 points
- Equity mentioned: +3 points
- Small team (< 50 people): +3 points

SCORING GUIDE:
- 90-100: Perfect match — React/Node/TS, remote, good salary, early-stage YC startup
- 75-89:  Strong match — relevant stack, startup culture, remote/hybrid
- 60-74:  Decent match — partial stack match but startup quality is high
- 40-59:  Weak — only surface-level match
- 0-39:   Reject — wrong stack or hard reject triggered

JOB DETAILS:
- Title: ${job.title}
- Company: ${company}
- Experience Required: ${job.experience || 'Not specified'}
- Salary/Compensation: ${salary}
- Location: ${job.city || 'Remote'}
- Posted: ${posted}
- Applicants: ${applicants}
- Easy Apply: ${easyApply}
- Skills Required: ${skills}

Return ONLY this JSON, nothing else:
{
  "score": <number 0-100>,
  "pass": <true if score >= 60, false otherwise>,
  "reason": "<one line — why pass or reject>",
  "highlights": "<key matching skills or startup signals if passing>",
  "concerns": "<red flags or mismatches>"
}
`.trim();
}

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

/**
 * Evaluate a YC/startup job using AI.
 * Falls back to static scoring if Ollama is unavailable.
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
