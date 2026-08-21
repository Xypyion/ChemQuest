/**
 * Coin Battles — the model and the rules.
 *
 * A battle is an **instant raid**: one student stakes coins, answers questions
 * drawn from the teacher's bank for the difficulty they picked, and either takes
 * that many coins off an opponent or hands the same number over. The opponent is
 * passive — they see the result in their battle log next time they look.
 *
 * It sits on the challenge question engine, like Daily Quests do, and inherits
 * the same hard rule for the same reason: **auto-markable questions only**.
 * Coins move the instant the answer arrives, so nothing may be left waiting for
 * a teacher to mark. `quests.isAutoMarkable` / `quests.rawKeyed` are reused here
 * rather than re-derived — if two copies of that rule ever disagreed, a student
 * could lose coins to a question nobody keyed.
 *
 * Two rules make a battle different from a quest:
 *
 *  1. **The question set is drawn and stored server-side.** `startBattle` picks
 *     the questions and writes them onto the battle document, so a student
 *     cannot re-roll for an easier draw or read the keys out of the response.
 *  2. **Coins move between two people.** Everything here is written so that a
 *     balance can never go below zero, and so a student can never take more
 *     coins than their opponent actually has.
 */
const crypto = require('crypto');
const ch = require('./challenges');
const qs = require('./quests');

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Question types a battle may use — everything here can be marked by machine. */
const BATTLE_TYPES = qs.QUEST_TYPES;

const SETTINGS_ID = 'settings';
const MAX_BANK = 200;          // questions per difficulty
const MAX_STAKE = 10000;
const MAX_PER_BATTLE = 5;      // questions drawn into one battle

const DEFAULTS = {
  enabled: true,
  questionsPerBattle: 1,
  cooldownMinutes: 10,
  dailyLimit: 10,
  stakes: { easy: 5, medium: 15, hard: 30 },
  timeLimits: { easy: 60, medium: 60, hard: 90 },
};

const uuid = () => crypto.randomUUID();

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------- settings -------------------------------- */

/**
 * Normalise the single settings document. Missing fields fall back to
 * `DEFAULTS` rather than to zero, so a half-filled form can never accidentally
 * set every stake to nothing.
 */
function normalizeSettings(body, existing) {
  const base = existing || { id: SETTINGS_ID, createdAt: new Date().toISOString() };
  body = body || {};
  const prev = existing || DEFAULTS;

  const stakesIn = body.stakes || {};
  const timesIn = body.timeLimits || {};
  const stakes = {};
  const timeLimits = {};
  for (const d of DIFFICULTIES) {
    const prevStake = (prev.stakes && prev.stakes[d]) != null ? prev.stakes[d] : DEFAULTS.stakes[d];
    const prevTime = (prev.timeLimits && prev.timeLimits[d]) != null ? prev.timeLimits[d] : DEFAULTS.timeLimits[d];
    stakes[d] = clampInt(stakesIn[d], 1, MAX_STAKE, prevStake);
    timeLimits[d] = clampInt(timesIn[d], 0, 3600, prevTime);
  }

  base.id = SETTINGS_ID;
  base.enabled = typeof body.enabled === 'boolean' ? body.enabled : (prev.enabled !== false);
  base.stakes = stakes;
  base.timeLimits = timeLimits;
  base.questionsPerBattle = clampInt(body.questionsPerBattle, 1, MAX_PER_BATTLE,
    prev.questionsPerBattle || DEFAULTS.questionsPerBattle);
  base.cooldownMinutes = clampInt(body.cooldownMinutes, 0, 1440,
    prev.cooldownMinutes == null ? DEFAULTS.cooldownMinutes : prev.cooldownMinutes);
  base.dailyLimit = clampInt(body.dailyLimit, 0, 200,
    prev.dailyLimit == null ? DEFAULTS.dailyLimit : prev.dailyLimit);
  base.updatedAt = new Date().toISOString();
  return base;
}

/** Fill in anything a stored settings doc predates. */
function withDefaults(stored) {
  if (!stored) return { id: SETTINGS_ID, ...JSON.parse(JSON.stringify(DEFAULTS)) };
  return normalizeSettings(stored, { ...stored });
}

const stakeFor = (settings, difficulty) =>
  (settings.stakes && settings.stakes[difficulty]) || DEFAULTS.stakes[difficulty] || 0;

const timeLimitFor = (settings, difficulty) => {
  const t = settings.timeLimits && settings.timeLimits[difficulty];
  return t == null ? DEFAULTS.timeLimits[difficulty] : t;
};

/* ----------------------------- question bank ----------------------------- */

/**
 * Normalise one bank question. Returns null when the teacher left it unusable
 * or unkeyed — the caller drops those and reports how many went.
 */
function normalizeBankQuestion(raw, difficulty, order) {
  if (!raw || !BATTLE_TYPES.includes(raw.type)) return null;
  if (!qs.rawKeyed(raw)) return null;                 // an mcq with no key chosen
  const q = ch.normalizeQuestion(raw, false);         // false = no nested simulations
  if (!ch.isUsableQuestion(q) || !qs.isAutoMarkable(q)) return null;
  q.difficulty = DIFFICULTIES.includes(difficulty) ? difficulty : 'easy';
  q.order = Number.isFinite(order) ? order : 0;
  return q;
}

/** Fisher–Yates: `n` random questions (or the whole bank when it is smaller). */
function drawQuestions(bank, n) {
  const pool = bank.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, Math.min(n, pool.length)));
}

/* --------------------------------- rules --------------------------------- */

/** A battle is won only when every drawn question is right. */
function isWin(graded) {
  const results = (graded && graded.results) || [];
  return results.length > 0 && results.every((r) => r.correct === true);
}

/** Local midnight-to-midnight day key, so "10 battles a day" means the school day. */
function dayKey(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * May `attacker` start a battle against `defender` right now?
 * `reason` is a stable code the client turns into a localised message.
 *
 *   ctx = { settings, difficulty, battlesToday, lastAgainst (iso|null), openBattle }
 */
function canAttack(attacker, defender, ctx) {
  const s = ctx.settings;
  if (!s.enabled) return { ok: false, reason: 'disabled' };
  if (ctx.openBattle) return { ok: false, reason: 'battleInProgress' };
  if (!defender || defender.role !== 'student') return { ok: false, reason: 'notAStudent' };
  if (defender.id === attacker.id) return { ok: false, reason: 'self' };

  if (s.dailyLimit > 0 && ctx.battlesToday >= s.dailyLimit) {
    return { ok: false, reason: 'dailyLimit' };
  }
  if (s.cooldownMinutes > 0 && ctx.lastAgainst) {
    const readyAt = Date.parse(ctx.lastAgainst) + s.cooldownMinutes * 60_000;
    if (Date.now() < readyAt) return { ok: false, reason: 'cooldown', readyAt: new Date(readyAt).toISOString() };
  }

  const stake = stakeFor(s, ctx.difficulty);
  // Both sides must be able to pay: the attacker risks the same amount they
  // stand to win, and there is nothing to take from an empty purse.
  if ((attacker.coins || 0) < stake) return { ok: false, reason: 'poor', stake };
  if ((defender.coins || 0) <= 0) return { ok: false, reason: 'targetBroke' };
  return { ok: true, stake };
}

/**
 * Move coins from loser to winner, capped at what the loser actually holds so
 * no balance can go negative. Mutates both users; the caller persists.
 * `coinsEarned` is a lifetime total, so only the winner's moves — matching the
 * rule the teacher's manual coin adjustment already follows.
 */
function transferCoins(winner, loser, stake) {
  const amount = Math.max(0, Math.min(stake, loser.coins || 0));
  if (!amount) return 0;
  loser.coins = (loser.coins || 0) - amount;
  winner.coins = (winner.coins || 0) + amount;
  winner.coinsEarned = (winner.coinsEarned || 0) + amount;
  return amount;
}

module.exports = {
  DIFFICULTIES,
  BATTLE_TYPES,
  SETTINGS_ID,
  MAX_BANK,
  MAX_PER_BATTLE,
  DEFAULTS,
  uuid,
  normalizeSettings,
  withDefaults,
  stakeFor,
  timeLimitFor,
  normalizeBankQuestion,
  drawQuestions,
  isWin,
  dayKey,
  canAttack,
  transferCoins,
};
