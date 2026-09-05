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
  return (process.env.GEMINI_MODEL || '').trim() || 'gemini-3.1-flash-lite';
}

/* ------------------------------------------------------------------ *
 * Thinking level, per model
 *
 * `thinking_level` is not universal: the bigger models take it, the Lite ones
 * generally do not, and which is which changes with every model Google ships.
 * Rather than keep a list that goes stale, callers ask for a level, notice a
 * refusal, and remember — so one wasted call per model per process buys a
 * setting that fixes itself when the school changes `GEMINI_MODEL`.
 *
 * It lives here, beside `aiModel()`, because both things that talk to Gemini
 * need it: `tutor.js` asks to think a little, `aiQuestions.js` asks to think
 * hard, and neither should have to know what the other learned.
 * ------------------------------------------------------------------ */

/** Models this process has learned do not accept a thinking level. */
const noThinking = new Set();

/** Remember that this model refused, and say so once. */
function noteThinkingUnsupported(model) {
  if (noThinking.has(model)) return;
  noThinking.add(model);
  console.warn(`[ai] ${model} does not take a thinking level; continuing without one.`);
}

/**
 * How hard this model should think on this call.
 *
 * `want` is what the caller would like; '' means send no thinking level at all.
 * Two things override it:
 *
 *   - a model that has already refused the setting (above), and
 *   - `GEMINI_THINKING` in the environment, which is the escape hatch for a
 *     host that kills slow requests. Thinking is what makes a generated answer
 *     key arithmetically right, so it is on by default — but a reply that gets
 *     cut off by a serverless timeout is worth nothing at all, and on Vercel
 *     that is a real trade. `GEMINI_THINKING=off` turns it off everywhere;
 *     `low` or `minimal` dials it down.
 */
function thinkingFor(model, want) {
  if (noThinking.has(model)) return '';
  load();
  const override = (process.env.GEMINI_THINKING || '').trim().toLowerCase();
  if (override === 'off' || override === 'none') return '';
  if (override) return override;
  return want;
}

/** Is this the API telling us the thinking level was the problem? */
function rejectsThinking(err) {
  if (!err || err.status !== 400) return false;
  return /thinking/i.test(String(err.message || ''));
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
    // one teacher, marking class sets: one call per student's paper plus one
    // per class report, so a 40-student class costs 41. Enough for a day of it.
    mark: num(process.env.AI_MARK_LIMIT, 200),
    // every student, checking their own written answer while they work. The
    // real guard is the per-question cap in aiMarking.js; this is the bill.
    check: num(process.env.AI_CHECK_LIMIT, 30),
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

module.exports = {
  load, apiKey, aiEnabled, aiModel, aiLimits, tutorUnlimited, teacherSeed,
  thinkingFor, noteThinkingUnsupported, rejectsThinking,
};
