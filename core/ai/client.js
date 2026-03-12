// ─────────────────────────────────────────────────────────────
//  core/ai/client.js — Ollama connection
//
//  ONE place to swap models for ALL platforms.
//  Platforms call askAI() — they never import ollama directly.
// ─────────────────────────────────────────────────────────────

import ollama from 'ollama';

// ── Model config — change here to swap for every platform ────
export const MODELS = {
  evaluator: 'gemma3:4b',
  // evaluator: 'mistral:7b',
  // evaluator: 'llama3.2:3b',
};

const AI_CONFIG = {
  temperature: 0.1, // low = consistent, deterministic
  timeout: 15000,   // 15 sec max — skip if model hangs
};

/**
 * Send a prompt to Ollama, get text back.
 * All platforms share this — swap model in MODELS above.
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
    console.error(`  ⚠️  AI call failed: ${err.message}`);
    return null;
  }
}

/**
 * Check if Ollama is running and model is available.
 * Call once at startup — each platform calls this independently.
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
    console.warn('⚠️  Ollama not running — AI layer disabled, using static fallback');
    console.warn('   Run: ollama serve');
    return false;
  }
}
