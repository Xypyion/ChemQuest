/**
 * What it costs a student to ask Kru CJ for help.
 *
 * Two ways to pay, checked in this order:
 *   1. a small number of FREE questions each day, and
 *   2. coins from the Daily Quest wallet (`user.coins`, see routes/quests.routes.js).
 *
 * Coins are the currency the quest system already pays out, so the tutor spends
 * that balance rather than inventing a second one. `coinsEarned` is a lifetime
 * total and is deliberately NOT decreased when spending — it is the "how much
 * have I ever earned" number, not a balance.
 *
 * The daily allowance resets on a **Bangkok** day boundary. Using UTC would roll
 * the free questions over at 07:00 local time, in the middle of a school
 * morning; this is the only place in the codebase that needs a day key, so the
 * pattern is established here.
 *
 * `TUTOR_UNLIMITED=1` (see config.js) skips all of this for testing. It never
 * touches `user.tutor` / `user.coins`, so turning it off restores whatever the
 * student's real balance was — nothing here is destructive.
 */
const config = require('./config');

/** Coins charged per question once the daily free ones are used up. */
const PRICE = 50;

/** Free questions each student gets per day. */
const FREE_PER_DAY = 3;

const TIMEZONE = 'Asia/Bangkok';

/** Today's date as 'YYYY-MM-DD' in the school's timezone. */
function schoolDay(now) {
  // en-CA formats as YYYY-MM-DD, which sorts and compares correctly.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now || new Date());
}

/** The student's tutor counter, reset when the day rolled over. */
function counterOf(user) {
  const day = schoolDay();
  if (!user.tutor || user.tutor.day !== day) {
    user.tutor = { day, freeUsed: 0, spent: 0 };
  }
  return user.tutor;
}

/**
 * What the student can see: how many free questions are left, what a paid one
 * costs, and whether they can afford to ask right now.
 */
function statusOf(user) {
  if (config.tutorUnlimited()) {
    return {
      freeLeft: FREE_PER_DAY, freePerDay: FREE_PER_DAY, coins: user.coins || 0,
      price: PRICE, canAsk: true, nextIsFree: true, unlimited: true,
    };
  }
  const c = counterOf(user);
  const freeLeft = Math.max(0, FREE_PER_DAY - (c.freeUsed || 0));
  const coins = user.coins || 0;
  return {
    freeLeft,
    freePerDay: FREE_PER_DAY,
    coins,
    price: PRICE,
    canAsk: freeLeft > 0 || coins >= PRICE,
    nextIsFree: freeLeft > 0,
  };
}

/**
 * Take payment for one question.
 *
 * MUST be called before awaiting the model, not after: `db.js` has no
 * transactions, and Node only guarantees that a synchronous block runs without
 * interruption. Deducting after the await would let two concurrent requests
 * both pass the balance check and ask twice on one payment.
 *
 * @returns {{ kind: 'free'|'coins', charged: number }}
 * @throws  {Error} with code 'INSUFFICIENT_COINS' when they cannot pay
 */
function charge(user) {
  if (config.tutorUnlimited()) return { kind: 'free', charged: 0, unlimited: true };

  const c = counterOf(user);

  if ((c.freeUsed || 0) < FREE_PER_DAY) {
    c.freeUsed = (c.freeUsed || 0) + 1;
    return { kind: 'free', charged: 0 };
  }

  const coins = user.coins || 0;
  if (coins < PRICE) {
    const err = new Error('Not enough coins.');
    err.code = 'INSUFFICIENT_COINS';
    throw err;
  }

  user.coins = coins - PRICE;
  c.spent = (c.spent || 0) + PRICE;
  return { kind: 'coins', charged: PRICE };
}

/** Undo a charge — used when the model call fails and no answer was given. */
function refund(user, receipt) {
  if (!receipt || receipt.unlimited) return; // nothing was actually charged
  const c = counterOf(user);
  if (receipt.kind === 'free') {
    c.freeUsed = Math.max(0, (c.freeUsed || 0) - 1);
  } else {
    user.coins = (user.coins || 0) + receipt.charged;
    c.spent = Math.max(0, (c.spent || 0) - receipt.charged);
  }
}

module.exports = { PRICE, FREE_PER_DAY, schoolDay, statusOf, charge, refund };
