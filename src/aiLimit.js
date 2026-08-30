/**
 * How many AI calls one person gets per day, per purpose.
 *
 * This is NOT the tutor's wallet. `src/tutorCredit.js` prices a tutor question
 * in free questions and then coins, because asking Kru CJ for a hint is a move
 * inside the game and should cost something. Generating a question bank and
 * getting a duel question checked are not game moves — they are tools, and
 * charging a teacher coins for them would be nonsense.
 *
 * What this file is for is the API bill. The school is on a free Gemini tier,
 * where a quota is a real, small number, and one bored student holding down a
 * button could spend the whole day's allowance before the first lesson ends.
 * So: a plain per-person daily counter, no currency involved.
 *
 * The day boundary is Bangkok's, borrowed from tutorCredit so the two features
 * roll over together rather than seven hours apart.
 */
const config = require('./config');
const credit = require('./tutorCredit');

/** The purposes we count separately. */
const PURPOSES = ['generate', 'review'];

/** This person's counter, reset when the school day rolled over. */
function counterOf(user) {
  const day = credit.schoolDay();
  if (!user.aiUsage || user.aiUsage.day !== day) {
    user.aiUsage = { day };
  }
  return user.aiUsage;
}

/** The cap for one purpose. 0 means unlimited. */
function limitFor(purpose) {
  const limits = config.aiLimits();
  return limits[purpose] == null ? 0 : limits[purpose];
}

/** What is left today, without spending anything. */
function statusOf(user, purpose) {
  const limit = limitFor(purpose);
  if (!limit) return { used: 0, limit: 0, left: null, ok: true, unlimited: true };
  const used = counterOf(user)[purpose] || 0;
  return { used, limit, left: Math.max(0, limit - used), ok: used < limit, unlimited: false };
}

/**
 * Spend one call.
 *
 * MUST be called before awaiting the model, for the same reason
 * `tutorCredit.charge` is: `db.js` has no transactions, so a check that happens
 * after an await lets two concurrent requests both pass it.
 *
 * @returns {{ok: true}} on success
 * @throws  {Error} with code 'AI_DAILY_LIMIT' when they have run out
 */
function take(user, purpose) {
  const limit = limitFor(purpose);
  if (!limit) return { ok: true, unlimited: true };

  const c = counterOf(user);
  const used = c[purpose] || 0;
  if (used >= limit) {
    const err = new Error('Daily AI limit reached.');
    err.code = 'AI_DAILY_LIMIT';
    throw err;
  }
  c[purpose] = used + 1;
  return { ok: true, used: c[purpose], limit };
}

/** Give a call back — used when the model failed and produced nothing usable. */
function refund(user, purpose) {
  if (!limitFor(purpose)) return;
  const c = counterOf(user);
  c[purpose] = Math.max(0, (c[purpose] || 0) - 1);
}

module.exports = { PURPOSES, statusOf, take, refund };
