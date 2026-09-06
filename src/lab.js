/**
 * The Lab — small chemistry games that pay coins and drop elements.
 *
 * WHY THE SERVER OWNS EVERY ROUND
 * The same rule `startBattle` follows, for the same reason: the question and
 * its answer are picked here, written to the `labRounds` collection, and the
 * answer is stripped before anything is sent to the browser. A student cannot
 * re-roll for an easier draw, cannot read the key out of the response, and
 * cannot mark their own work. These are teenagers with devtools and the games
 * pay real currency.
 *
 * WHY THERE IS A DAILY CEILING
 * The Lab MINTS coins. Before it existed the only source was Daily Quests and
 * the only sink was Kru CJ at 50 a question. An uncapped game would make quests
 * pointless and the tutor free. `DAILY_COINS` is the ceiling; elements keep
 * dropping after it is reached, so there is still a reason to play.
 *
 * WHY COINS ARE NOT FOLDED INTO POINTS
 * `game.recalcPoints()` rebuilds `user.points` from quiz scores on every award
 * path and would wipe anything stored there. Coins live on `user.coins`, and
 * the collection lives on `user.elements`, both deliberately outside it —
 * exactly as `src/quests.js` documents for the Daily Quest wallet.
 */
const crypto = require('crypto');
const db = require('./db');
const el = require('./elements');
const facts = require('./labFacts');
const credit = require('./tutorCredit');   // for schoolDay(), the Bangkok boundary

const GAMES = ['guess', 'trueweird'];

/** Most a student can mint from the Lab in one school day. */
const DAILY_COINS = 60;

/** A round nobody answered stops mattering. Keeps `labRounds` from growing. */
const ROUND_EXPIRY_MINUTES = 30;

/** Rounds kept per student, newest first. Same trimming idea as tutorLogs. */
const KEEP_ROUNDS = 40;

/* What each game pays for a correct answer. Guess the Element pays less the
   more clues you opened, which is the entire tension of that game. */
const PAY = {
  guess: [15, 10, 6],     // by clues revealed: 1, 2, 3
  trueweird: 5,
  streakBonus: 10,        // every 5 correct in a row on True or Weird
};

const STREAK_EVERY = 5;

/* Rarity weights for what drops. Common elements come early and often; the
   obscure end of the table takes a while, which is what makes a full table
   worth chasing. Index is the element's `rarity` (0 common .. 2 rare). */
const DROP_WEIGHT = [6, 3, 1];

/* ------------------------------------------------------------------ *
 * Daily state
 * ------------------------------------------------------------------ */

/**
 * This student's Lab counters for today, resetting on the Bangkok day.
 * Mutates `user.lab` in place; the caller is responsible for db.save().
 */
function todayState(user) {
  const day = credit.schoolDay();
  const lab = user.lab && user.lab.day === day
    ? user.lab
    : { day, coins: 0, rounds: 0, streak: 0 };
  user.lab = lab;
  return lab;
}

/** Coins this student may still mint from the Lab today. */
function coinsLeft(user) {
  return Math.max(0, DAILY_COINS - (todayState(user).coins || 0));
}

/* ------------------------------------------------------------------ *
 * The collection
 * ------------------------------------------------------------------ */

/** Atomic numbers this student has found, as a Set. */
function found(user) {
  return new Set(Array.isArray(user.elements) ? user.elements : []);
}

/**
 * Pick one element the student does not have yet, weighted by rarity.
 * Returns null once the table is complete — at which point the games still pay
 * coins, there is simply nothing left to drop.
 */
function drawElement(user) {
  const have = found(user);
  const pool = el.ELEMENTS.filter((e) => !have.has(e.z));
  if (!pool.length) return null;

  const total = pool.reduce((sum, e) => sum + DROP_WEIGHT[e.rarity], 0);
  let roll = Math.random() * total;
  for (const e of pool) {
    roll -= DROP_WEIGHT[e.rarity];
    if (roll <= 0) return e;
  }
  return pool[pool.length - 1];
}

/** Record a found element. Caller saves. */
function collect(user, z) {
  if (!Array.isArray(user.elements)) user.elements = [];
  if (!user.elements.includes(z)) user.elements.push(z);
}

/* ------------------------------------------------------------------ *
 * Building a round
 * ------------------------------------------------------------------ */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build one Guess the Element round.
 *
 * Three clues, hardest first, revealed on demand. The three symbol choices are
 * the answer plus two decoys drawn from the same category where possible — a
 * decoy from the other end of the table makes the answer obvious.
 */
function buildGuess() {
  const answer = pick(el.GUESSABLE);
  const sameCat = el.ELEMENTS.filter((e) => e.cat === answer.cat && e.z !== answer.z);
  const otherPool = sameCat.length >= 2 ? sameCat : el.ELEMENTS.filter((e) => e.z !== answer.z);
  const decoys = shuffle(otherPool).slice(0, 2);
  const lore = el.LORE[answer.sym];

  return {
    answer: answer.z,
    payload: {
      clues: lore.clues,                                   // all three, revealed client-side on request
      choices: shuffle([answer, ...decoys]).map((e) => ({ z: e.z, sym: e.sym })),
    },
  };
}

/** Build one True or Weird round. */
function buildTrueWeird() {
  const i = Math.floor(Math.random() * facts.FACTS.length);
  const f = facts.FACTS[i];
  return {
    answer: f.ok,
    payload: { index: i, en: f.en, th: f.th },
  };
}

/**
 * Create a round, store it with its answer, and return the document.
 * Never hand this straight to a student — use `playView`.
 */
function startRound(user, game) {
  const built = game === 'guess' ? buildGuess() : buildTrueWeird();
  const round = {
    id: crypto.randomUUID(),
    userId: user.id,
    game,
    answer: built.answer,
    payload: built.payload,
    revealed: 1,                 // clues opened so far (Guess the Element)
    done: false,
    correct: null,
    coins: 0,
    element: null,
    createdAt: new Date().toISOString(),
  };
  db.insert('labRounds', round);
  trim(user.id);
  return round;
}

/** Keep only the most recent rounds per student. */
function trim(userId) {
  const mine = db.filter('labRounds', (r) => r.userId === userId);
  if (mine.length <= KEEP_ROUNDS) return;
  const doomed = new Set(mine
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .slice(0, mine.length - KEEP_ROUNDS)
    .map((r) => r.id));
  const all = db.all('labRounds');
  for (let i = all.length - 1; i >= 0; i--) if (doomed.has(all[i].id)) all.splice(i, 1);
}

function expired(round) {
  const age = Date.now() - new Date(round.createdAt).getTime();
  return age > ROUND_EXPIRY_MINUTES * 60 * 1000;
}

/* ------------------------------------------------------------------ *
 * Views — what a student is allowed to see
 * ------------------------------------------------------------------ */

/**
 * The round as the player sees it. **The answer is not in here.** For Guess the
 * Element only the clues opened so far are included, so opening clue three
 * costs a round trip and cannot be peeked at in the network tab.
 */
function playView(round, lang) {
  const l = lang === 'th' ? 'th' : 'en';
  if (round.game === 'guess') {
    return {
      id: round.id,
      game: 'guess',
      revealed: round.revealed,
      totalClues: round.payload.clues.length,
      clues: round.payload.clues.slice(0, round.revealed).map((c) => c[l]),
      choices: round.payload.choices.map((c) => c.sym),
      worth: PAY.guess[Math.min(round.revealed - 1, PAY.guess.length - 1)],
    };
  }
  return {
    id: round.id,
    game: 'trueweird',
    statement: round.payload[l],
    worth: PAY.trueweird,
  };
}

/** What a finished round reveals: the answer, why, and what was won. */
function resultView(round, lang) {
  const l = lang === 'th' ? 'th' : 'en';
  const out = {
    id: round.id,
    game: round.game,
    correct: round.correct,
    coins: round.coins,
    element: round.element ? el.card(round.element, lang) : null,
  };
  if (round.game === 'guess') {
    const e = el.BY_Z.get(round.answer);
    out.answer = e.sym;
    out.answerName = l === 'th' ? e.th : e.en;
  } else {
    const f = facts.FACTS[round.payload.index];
    out.answer = round.answer;
    out.why = l === 'th' ? f.whyTh : f.whyEn;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Grading
 * ------------------------------------------------------------------ */

/**
 * Apply an answer to a round. Mutates the round and the user; the caller saves.
 * Returns { ok, reason } so the route can answer honestly on refusal.
 */
function answerRound(user, round, given) {
  if (round.done) return { ok: false, reason: 'done' };
  if (expired(round)) return { ok: false, reason: 'expired' };

  let correct;
  if (round.game === 'guess') {
    const e = el.BY_Z.get(round.answer);
    correct = typeof given === 'string' && given.toUpperCase() === e.sym.toUpperCase();
  } else {
    correct = given === true || given === 'true';
    correct = correct === round.answer;
  }

  const state = todayState(user);
  round.done = true;
  round.correct = correct;
  round.answeredAt = new Date().toISOString();
  state.rounds = (state.rounds || 0) + 1;

  if (!correct) {
    state.streak = 0;
    return { ok: true };
  }

  /* ---- what a correct answer is worth ---- */
  let earned = round.game === 'guess'
    ? PAY.guess[Math.min(round.revealed - 1, PAY.guess.length - 1)]
    : PAY.trueweird;

  state.streak = (state.streak || 0) + 1;
  if (round.game === 'trueweird' && state.streak % STREAK_EVERY === 0) earned += PAY.streakBonus;

  /* The ceiling clips the payout rather than refusing the round: finishing a
     game and being told it was worth nothing is worse than being told it was
     worth less. */
  const room = Math.max(0, DAILY_COINS - (state.coins || 0));
  earned = Math.min(earned, room);

  if (earned > 0) {
    state.coins = (state.coins || 0) + earned;
    user.coins = (user.coins || 0) + earned;
    user.coinsEarned = (user.coinsEarned || 0) + earned;
    round.coins = earned;
  }

  /* Elements drop whether or not there were coins left — the collection is the
     reason to keep playing once the wallet is capped for the day. */
  const dropped = drawElement(user);
  if (dropped) {
    collect(user, dropped.z);
    round.element = dropped.z;
  }

  return { ok: true };
}

module.exports = {
  GAMES, DAILY_COINS, PAY, STREAK_EVERY, ROUND_EXPIRY_MINUTES,
  todayState, coinsLeft, found, collect, drawElement,
  startRound, playView, resultView, answerRound, expired,
};
