/**
 * The Lab API — the games tab.
 *
 * Every route here is a student route; there is no teacher side yet, on
 * purpose. The Lab authors its own content (see src/elements.js and
 * src/labFacts.js), so there is nothing for a teacher to write, publish or
 * mark. When one is added it belongs behind `/api/teacher/lab`, mounted BEFORE
 * `/api/teacher` — see the router order note in server.js.
 *
 * THE ANSWER NEVER LEAVES THE SERVER until the round is over. `lab.playView`
 * is the only thing a student is sent while a round is live, and it has no
 * answer in it. Opening a third clue is a round trip for the same reason: so
 * the unopened clues are not sitting in the network tab.
 */
const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const lab = require('../lab');
const el = require('../elements');

const router = express.Router();
router.use(authMiddleware, requireRole('student'));

/** `?lang=th` picks the Thai copy. Anything else is English. */
const langOf = (req) => (req.query.lang === 'th' ? 'th' : 'en');

/** A round belongs to the student asking for it, or it does not exist to them. */
function ownRound(req) {
  const round = db.findById('labRounds', req.params.id);
  return round && round.userId === req.user.id ? round : null;
}

/**
 * GET /api/lab — everything the hub screen needs.
 * The whole table (118 rows) plus which ones this student has found.
 */
router.get('/', (req, res) => {
  const lang = langOf(req);
  const state = lab.todayState(req.user);
  const have = Array.isArray(req.user.elements) ? req.user.elements.slice() : [];

  res.json({
    table: el.table(),
    found: have,
    total: el.COUNT,
    coins: req.user.coins || 0,
    coinsLeftToday: lab.coinsLeft(req.user),
    dailyCoins: lab.DAILY_COINS,
    roundsToday: state.rounds || 0,
    streak: state.streak || 0,
    games: lab.GAMES,
    lang,
  });
});

/**
 * GET /api/lab/element/:z — the collection card for one element.
 * Only for elements this student has actually found: the card is the reward,
 * so handing out unfound ones would give away the whole table for free.
 */
router.get('/element/:z', (req, res) => {
  const z = Number(req.params.z);
  if (!Number.isInteger(z) || z < 1 || z > el.COUNT) {
    return res.status(400).json({ error: 'No such element.' });
  }
  if (!lab.found(req.user).has(z)) {
    return res.status(403).json({ error: 'You have not found that element yet.' });
  }
  res.json({ element: el.card(z, langOf(req)) });
});

/** POST /api/lab/round — start a round. Body: { game }. */
router.post('/round', (req, res) => {
  const game = (req.body && req.body.game) || '';
  if (!lab.GAMES.includes(game)) {
    return res.status(400).json({ error: 'Unknown game.' });
  }
  const round = lab.startRound(req.user, game);
  db.save();
  res.status(201).json({
    round: lab.playView(round, langOf(req)),
    coinsLeftToday: lab.coinsLeft(req.user),
  });
});

/**
 * POST /api/lab/round/:id/clue — open the next clue.
 * Guess the Element only. Each clue opened lowers what the round pays, which is
 * why this is a server decision and not a client one.
 */
router.post('/round/:id/clue', (req, res) => {
  const round = ownRound(req);
  if (!round) return res.status(404).json({ error: 'Round not found.' });
  if (round.game !== 'guess') return res.status(400).json({ error: 'That game has no clues.' });
  if (round.done) return res.status(409).json({ error: 'That round is already finished.' });
  if (lab.expired(round)) return res.status(410).json({ error: 'That round has expired. Start a new one.' });

  if (round.revealed < round.payload.clues.length) {
    round.revealed += 1;
    db.save();
  }
  res.json({ round: lab.playView(round, langOf(req)) });
});

/** POST /api/lab/round/:id/answer — grade it. Body: { answer }. */
router.post('/round/:id/answer', (req, res) => {
  const round = ownRound(req);
  if (!round) return res.status(404).json({ error: 'Round not found.' });

  const given = req.body ? req.body.answer : undefined;
  const outcome = lab.answerRound(req.user, round, given);
  if (!outcome.ok) {
    const message = outcome.reason === 'done'
      ? 'That round is already finished.'
      : 'That round has expired. Start a new one.';
    return res.status(outcome.reason === 'done' ? 409 : 410).json({ error: message });
  }
  db.save();

  const lang = langOf(req);
  res.json({
    result: lab.resultView(round, lang),
    coins: req.user.coins || 0,
    coinsLeftToday: lab.coinsLeft(req.user),
    streak: lab.todayState(req.user).streak || 0,
    foundCount: lab.found(req.user).size,
    total: el.COUNT,
  });
});

module.exports = router;
