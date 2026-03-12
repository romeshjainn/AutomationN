// ─────────────────────────────────────────────────────────────
//  AI Client — Ollama connection
//
//  To swap model in future:
//  Change MODELS.classifier or MODELS.scorer below
//  Nothing else needs touching anywhere in the codebase
// ─────────────────────────────────────────────────────────────

import ollama from 'ollama';

// ── Model config — change here to swap models ─────────────────
export const MODELS = {
  // Used for job evaluation — scoring + pass/fail decision
  evaluator: 'gemma3:4b',

  // Future: use a bigger model just for scoring if needed
  // evaluator: 'mistral:7b',
  // evaluator: 'llama3.2:3b',
};

// ── AI settings ───────────────────────────────────────────────
const AI_CONFIG = {
  temperature: 0.1, // low = more consistent, deterministic outputs
  timeout: 15000, // 15 sec max per call — skip if model hangs
};

/**
 * Send a prompt to Ollama, get text back.
 * Single function — swap model by changing MODELS above.
 *
 * @param {string} prompt
 * @param {string} model  — defaults to MODELS.evaluator
 * @returns {string} raw response text
 */
export async function askAI(prompt, model = MODELS.evaluator) {
  try {
    const response = await ollama.chat({
      model,
      options: { temperature: AI_CONFIG.temperature },
      messages: [{ role: 'user', content: prompt }],
    });
    return response.message.content.trim();
  } catch (err) {
    // If Ollama is down or model not found — fail gracefully
    console.error(`  ⚠️  AI call failed: ${err.message}`);
    return null;
  }
}

/**
 * Check if Ollama is running and model is available.
 * Call this once at startup in index.js
 */
export async function checkAI() {
  try {
    const list = await ollama.list();
    const available = list.models.map((m) => m.name);
    const needed = MODELS.evaluator;

    if (!available.some((m) => m.startsWith(needed.split(':')[0]))) {
      console.warn(`⚠️  Model "${needed}" not found in Ollama`);
      console.warn(`   Run: ollama pull ${needed}`);
      return false;
    }

    console.log(`✅ AI ready — model: ${needed}`);
    return true;
  } catch {
    console.warn('⚠️  Ollama not running — AI layer disabled');
    console.warn('   Run: ollama serve');
    return false;
  }
}
