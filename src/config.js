/**
 * Tiny zero-dependency .env reader.
 *
 * The AI tutor needs a GEMINI_API_KEY (Google AI Studio). Setting a permanent environment
 * variable on the school's Windows machine is fiddly, so we also accept a
 * plain `.env` file at the repo root (already git-ignored). A real environment
 * variable always wins, so production/hosting setups behave normally.
 *
 * This is deliberately not `dotenv` — see CLAUDE.md rule 6.
 */
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

let loaded = false;

/** Parse `.env` once and copy anything missing into process.env. */
function load() {
  if (loaded) return;
  loaded = true;
  let raw;
  try {
    raw = fs.readFileSync(ENV_FILE, 'utf8');
  } catch (err) {
    return; // no .env is perfectly normal
  }
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq < 1) continue;
    const key = text.slice(0, eq).trim();
    let value = text.slice(eq + 1).trim();
    // Allow KEY="value" / KEY='value'
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** The Gemini API key, or '' when the tutor has not been configured. */
function apiKey() {
  load();
  return process.env.GEMINI_API_KEY || '';
}

/**
 * Whether the AI tutor can run. Every tutor route checks this so the rest of
 * StoiVenture keeps working normally on a machine with no key configured.
 */
function aiEnabled() {
  return apiKey().length > 0;
}

/**
 * TESTING ONLY. Set `TUTOR_UNLIMITED=1` to skip the daily-free-question and
 * coin charge entirely, so testers aren't rationed while trying the feature.
 * Do not set this in a real classroom deployment — it turns the tutor free.
 */
function tutorUnlimited() {
  load();
  return process.env.TUTOR_UNLIMITED === '1';
}

/**
 * The teacher account the seed creates on a brand-new database.
 *
 * This used to be three literals in src/seed.js — name, email and the password
 * "12345678" — in a repository anyone can read. That is the login for every
 * deployment that ever ran the seed, published. It comes from the environment
 * now, which on this project means the git-ignored `.env` at the repo root.
 *
 * There is deliberately NO fallback password. A missing one is not an error the
 * seed should paper over with a default everybody knows; see src/seed.js, which
 * generates a random one and prints it exactly once instead.
 */
function teacherSeed() {
  load();
  return {
    name: (process.env.TEACHER_NAME || 'Teacher').trim(),
    email: (process.env.TEACHER_EMAIL || '').trim().toLowerCase(),
    password: process.env.TEACHER_PASSWORD || '',
  };
}

module.exports = { load, apiKey, aiEnabled, tutorUnlimited, teacherSeed };
