/**
 * Daily Quests — the model, on top of the challenge question engine.
 *
 * A quest is a short set of teacher-assigned side questions that pays out an
 * in-game currency ("coins") the moment the student submits. It is deliberately
 * a thin layer: a quest is challenge-shaped, so the normalising, grading and
 * client-shaping helpers in `challenges.js` are reused rather than forked.
 *
 * Two rules make quests different from challenges:
 *
 *  1. **Auto-markable questions only.** Coins are paid on submit, so nothing may
 *     be left waiting for a teacher to mark. Question types are limited to
 *     mcq / multi / short / table, and each one must carry a usable answer key
 *     (see `isAutoMarkable`) or it is dropped when the quest is saved.
 *  2. **A real open/close window, enforced by the server.** A challenge's
 *     `dueAt` is advisory — only the browser checks it. That is fine for a
 *     score and not fine when the reward is currency.
 */
const crypto = require('crypto');
const ch = require('./challenges');

/** Question types a quest may use — everything here can be marked automatically. */
const QUEST_TYPES = ['mcq', 'multi', 'short', 'table'];

const MAX_QUESTIONS = 20;
const MAX_REWARD = 10000;
const MAX_TEXT = 4000;

const uuid = () => crypto.randomUUID();
const trimmed = (v, max) => (v == null ? '' : String(v)).slice(0, max || MAX_TEXT).trim();

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** An ISO string, or null when the value is missing/unparseable. */
function isoOrNull(v) {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Can this question be scored without a human?
 * Mirrors the branches of `challenges.gradeQuestion` that set `auto: true` —
 * if these two ever disagree, a student could submit a quest that never pays out.
 */
function isAutoMarkable(q) {
  if (!q || !QUEST_TYPES.includes(q.type)) return false;
  switch (q.type) {
    case 'mcq':
      return Number.isInteger(q.correctIndex) && q.correctIndex >= 0;
    case 'multi':
      return Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0;
    case 'short':
      return Array.isArray(q.accepted) && q.accepted.length > 0;
    case 'table': {
      // Gradable only when there is at least one blank and every blank is keyed.
      const blanks = ch.tableBlanks(q);
      return blanks.length > 0 && blanks.every((b) => (b.answer || '').trim() !== '');
    }
    default:
      return false;
  }
}

/**
 * Does the RAW question carry an answer key the teacher actually chose?
 *
 * `challenges.normalizeQuestion` defaults a missing `correctIndex` to 0, so an
 * mcq whose key the teacher forgot would silently mark choice "A" correct — and
 * for a quest that means students lose coins to a key nobody set. The other
 * types survive normalisation unkeyed (empty `correctIndexes` / `accepted` /
 * table answers) and are caught by `isAutoMarkable`, so only mcq needs this.
 */
function rawKeyed(raw) {
  if (!raw || raw.type !== 'mcq') return true;
  const n = Number(raw.correctIndex);
  return Number.isInteger(n) && n >= 0;
}

/**
 * Normalise a quest from a request body, mutating `existing` when editing.
 * Follows `challenges.normalizeChallenge`, including its rule that `published`
 * is only overwritten when the body actually carries a boolean — so saving from
 * the editor never silently unpublishes a live quest.
 */
function normalizeQuest(body, existing) {
  body = body || {};
  const q = existing || { id: uuid(), createdAt: new Date().toISOString() };

  q.title = trimmed(body.title, 120) || 'Untitled Quest';
  q.description = trimmed(body.description, MAX_TEXT);
  q.icon = trimmed(body.icon, 8) || '⚔️';
  q.reward = clampInt(body.reward, 0, MAX_REWARD, 10);
  q.timeLimit = clampInt(body.timeLimit, 0, 7200, 0);
  q.opensAt = isoOrNull(body.opensAt);
  q.closesAt = isoOrNull(body.closesAt);

  q.questions = (Array.isArray(body.questions) ? body.questions : [])
    .slice(0, MAX_QUESTIONS)
    .filter(rawKeyed)
    // `false` forbids nested simulations; the type filter below drops the rest.
    .map((raw) => ch.normalizeQuestion(raw, false))
    .filter((x) => ch.isUsableQuestion(x) && isAutoMarkable(x));

  q.assign = ch.normalizeAssign(body.assign);
  if (typeof body.published === 'boolean') q.published = body.published;
  if (typeof q.published !== 'boolean') q.published = false;
  if (!Number.isFinite(q.order)) q.order = 0;
  q.updatedAt = new Date().toISOString();
  return q;
}

/** 'upcoming' before it opens, 'closed' once it shuts, else 'open'. */
function windowState(quest, now) {
  const at = now ? now.getTime() : Date.now();
  if (quest.opensAt && at < Date.parse(quest.opensAt)) return 'upcoming';
  if (quest.closesAt && at > Date.parse(quest.closesAt)) return 'closed';
  return 'open';
}

/** Coins for a result: the reward, pro-rata to the score. */
function coinsFor(quest, earned, max) {
  const reward = quest.reward || 0;
  if (!reward || !max || max <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, earned / max));
  return Math.round(reward * ratio);
}

/** Published AND assigned to this student. */
function isVisibleTo(quest, user) {
  return !!quest.published && ch.isAssignedTo(quest, user);
}

module.exports = {
  QUEST_TYPES,
  MAX_QUESTIONS,
  MAX_REWARD,
  isAutoMarkable,
  rawKeyed,
  normalizeQuest,
  windowState,
  coinsFor,
  isVisibleTo,
};
