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
 * Whether the AI features can run. Every AI route checks this so the rest of
 * StoiVenture keeps working normally on a machine with no key configured.
 */
function aiEnabled() {
  return apiKey().length > 0;
}

/**
 * The Gemini model every AI feature uses — the tutor, question generation and
 * the duel-question reviewer.
 *
 * One name in one place, overridable with `GEMINI_MODEL`, so moving off the
 * free tier (or onto whatever Google ships next) is an .env edit rather than a
 * hunt through three source files.
 */
function aiModel() {
  load();
  return (process.env.GEMINI_MODEL || '').trim() || 'gemini-3.7-flash';
}

/**
 * How many AI calls one person gets per day, per purpose.
 *
 * A guard rail for a free API tier, not a game rule: the point is that one
 * enthusiastic student cannot burn the whole school's quota before lunch. See
 * src/aiLimit.js. Zero means unlimited.
 */
function aiLimits() {
  load();
  const num = (v, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    // one teacher, generating a bank: generous
    generate: num(process.env.AI_GENERATE_LIMIT, 60),
    // every student, checking their own duel question: tighter
    review: num(process.env.AI_REVIEW_LIMIT, 20),
  };
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
 * An override. src/seed.js holds a default login so a fresh clone starts with
 * nothing to configure; setting these here — in the git-ignored `.env`, or as
 * real environment variables — replaces it when a database is first seeded.
 *
 * Anything blank falls through to the default in src/seed.js.
 */
function teacherSeed() {
  load();
  return {
    name: (process.env.TEACHER_NAME || '').trim(),
    email: (process.env.TEACHER_EMAIL || '').trim().toLowerCase(),
    password: process.env.TEACHER_PASSWORD || '',
  };
}

module.exports = { load, apiKey, aiEnabled, aiModel, aiLimits, tutorUnlimited, teacherSeed };
