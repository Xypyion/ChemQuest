/**
 * Coin Battles — student and teacher routes.
 *
 * Two ways to put coins at risk, sharing one set of rules:
 *
 *  • A RAID (`/start`, `/:id/answer`). The attacker picks an opponent and a
 *    difficulty, answers the questions the teacher wrote, and wins the stake off
 *    them — or hands the same number over for getting it wrong. The opponent is
 *    passive.
 *  • A DUEL (`/duels/*`). The challenger WRITES the question, Kru CJ checks that
 *    it is real stoichiometry with a correct answer key, and the classmate they
 *    send it to is the one who answers. See the duel notes in src/battles.js.
 *
 * Mounted in server.js as:
 *   /api/battles          -> studentRouter
 *   /api/teacher/battles  -> teacherRouter   (BEFORE the generic /api/teacher)
 *
 * Collections: `battles`, `duels`, `duelDrafts` (one pending AI-approved
 * question per student), `battleQuestions` (one document per question, tagged
 * with its difficulty), `battleSettings` (a single document, id 'settings').
 */
const express = require('express');
const db = require('../db');
const ch = require('../challenges');
const bt = require('../battles');
const config = require('../config');
const ai = require('../aiQuestions');
const aiLimit = require('../aiLimit');
const { authMiddleware, requireRole } = require('../auth');

const studentRouter = express.Router();
const teacherRouter = express.Router();

/* ------------------------------- helpers -------------------------------- */

const settings = () => bt.withDefaults(db.findById('battleSettings', bt.SETTINGS_ID));

const bankFor = (difficulty) => db
  .filter('battleQuestions', (q) => q.difficulty === difficulty)
  .slice()
  .sort((a, b) => (a.order || 0) - (b.order || 0));

const bankCounts = () => bt.DIFFICULTIES.reduce((acc, d) => {
  acc[d] = bankFor(d).length;
  return acc;
}, {});

/** Every battle this student took part in, newest first. */
const battlesOf = (userId) => db
  .filter('battles', (b) => b.attackerId === userId || b.defenderId === userId)
  .slice()
  .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

const openBattleOf = (userId) => db.find('battles', (b) => b.attackerId === userId && b.status === 'open');

/**
 * Aggressive moves this student made today — raids started AND duels sent.
 *
 * The two count against one allowance on purpose. Counting them separately
 * would make "send a duel" the way to keep going once the daily raid limit is
 * spent, which is not a limit at all.
 */
const actionsToday = (userId) => {
  const today = bt.dayKey();
  const raids = db.filter('battles', (b) => b.attackerId === userId && bt.dayKey(b.startedAt) === today).length;
  const duels = db.filter('duels', (d) => d.challengerId === userId && bt.dayKey(d.createdAt) === today).length;
  return raids + duels;
};

/** When this student last came after that classmate, by either route, or null. */
const lastAgainst = (attackerId, defenderId) => {
  const hits = db
    .filter('battles', (b) => b.attackerId === attackerId && b.defenderId === defenderId)
    .map((b) => b.startedAt)
    .concat(
      db
        .filter('duels', (d) => d.challengerId === attackerId && d.defenderId === defenderId)
        .map((d) => d.createdAt)
    )
    .sort();
  return hits.length ? hits[hits.length - 1] : null;
};

/** A battle as the student who fought it should see it. */
function battleView(b, meId) {
  const iAttacked = b.attackerId === meId;
  const won = b.status === 'won';
  return {
    id: b.id,
    difficulty: b.difficulty,
    stake: b.stake,
    status: b.status,
    // 'win' / 'loss' from THIS student's side, whichever end they were on.
    outcome: b.status === 'open' ? 'open' : (iAttacked === won ? 'win' : 'loss'),
    iAttacked,
    opponentName: iAttacked ? b.defenderName : b.attackerName,
    opponentAvatar: iAttacked ? b.defenderAvatar : b.attackerAvatar,
    coinsMoved: b.coinsMoved || 0,
    startedAt: b.startedAt,
    resolvedAt: b.resolvedAt || null,
  };
}

/** The live battle, questions stripped of their answer keys. */
function playView(b) {
  return {
    id: b.id,
    difficulty: b.difficulty,
    stake: b.stake,
    opponentName: b.defenderName,
    opponentAvatar: b.defenderAvatar,
    startedAt: b.startedAt,
    expiresAt: b.expiresAt || null,
    questions: (b.questions || []).map(ch.sanitizeQuestion),
  };
}

/* ============================== STUDENT API ============================== */

studentRouter.use(authMiddleware, requireRole('student'));

/** GET /api/battles/settings — the rules, and how many turns I have left. */
studentRouter.get('/settings', (req, res) => {
  const s = settings();
  const used = actionsToday(req.user.id);
  res.json({
    enabled: s.enabled,
    stakes: s.stakes,
    timeLimits: s.timeLimits,
    questionsPerBattle: s.questionsPerBattle,
    cooldownMinutes: s.cooldownMinutes,
    dailyLimit: s.dailyLimit,
    battlesToday: used,
    battlesLeft: s.dailyLimit > 0 ? Math.max(0, s.dailyLimit - used) : null,
    banks: bankCounts(),
    coins: req.user.coins || 0,
  });
});

/**
 * GET /api/battles/opponents — classmates I could raid.
 * Deliberately carries no email address: this list goes to every student, and
 * the assignment feed sets the precedent of exposing only name + avatar.
 */
studentRouter.get('/opponents', (req, res) => {
  const s = settings();
  const open = openBattleOf(req.user.id);
  const today = actionsToday(req.user.id);

  const list = db
    .filter('users', (u) => u.role === 'student' && u.id !== req.user.id)
    .map((u) => {
      const last = lastAgainst(req.user.id, u.id);
      // Reported against the cheapest difficulty, so a student is only shown as
      // unattackable when no difficulty at all would work.
      const check = bt.DIFFICULTIES
        .map((d) => bt.canAttack(req.user, u, {
          settings: s, difficulty: d, battlesToday: today, lastAgainst: last, openBattle: open,
        }))
        .reduce((best, r) => (best && best.ok ? best : r), null);
      return {
        id: u.id,
        name: u.name,
        avatar: u.avatar || '🧑‍🎓',
        coins: u.coins || 0,
        attackable: !!(check && check.ok),
        reason: check && check.ok ? null : (check ? check.reason : 'unavailable'),
        readyAt: (check && check.readyAt) || null,
      };
    })
    .sort((a, b) => (b.coins - a.coins) || a.name.localeCompare(b.name));

  res.json({ opponents: list, coins: req.user.coins || 0 });
});

/** GET /api/battles/history — my last 30 battles, both sides. */
studentRouter.get('/history', (req, res) => {
  res.json({ battles: battlesOf(req.user.id).slice(0, 30).map((b) => battleView(b, req.user.id)) });
});

/** GET /api/battles/open — the battle I walked away from, if there is one. */
studentRouter.get('/open', (req, res) => {
  const open = openBattleOf(req.user.id);
  res.json({ battle: open ? playView(open) : null });
});

/** POST /api/battles/start — draw the questions and put the coins at risk. */
studentRouter.post('/start', (req, res) => {
  const body = req.body || {};
  const s = settings();
  const difficulty = bt.DIFFICULTIES.includes(body.difficulty) ? body.difficulty : null;
  if (!difficulty) return res.status(400).json({ error: 'Pick easy, medium or hard.' });

  const defender = db.findById('users', body.opponentId);
  if (!defender) return res.status(404).json({ error: 'That student was not found.' });

  const verdict = bt.canAttack(req.user, defender, {
    settings: s,
    difficulty,
    battlesToday: actionsToday(req.user.id),
    lastAgainst: lastAgainst(req.user.id, defender.id),
    openBattle: openBattleOf(req.user.id),
  });
  // The reason code is what the client localises, so send it as the error.
  if (!verdict.ok) return res.status(403).json({ error: verdict.reason, readyAt: verdict.readyAt || null });

  const bank = bankFor(difficulty);
  if (!bank.length) return res.status(400).json({ error: 'noQuestions' });

  const drawn = bt.drawQuestions(bank, s.questionsPerBattle);
  const now = new Date();
  const limit = bt.timeLimitFor(s, difficulty);

  const battle = {
    id: bt.uuid(),
    attackerId: req.user.id,
    attackerName: req.user.name,
    attackerAvatar: req.user.avatar || '🧑‍🎓',
    defenderId: defender.id,
    defenderName: defender.name,
    defenderAvatar: defender.avatar || '🧑‍🎓',
    difficulty,
    stake: verdict.stake,
    // The drawn questions live on the battle, keys and all: grading must use the
    // set the student actually saw, not a fresh roll of the bank.
    questions: drawn,
    status: 'open',
    coinsMoved: 0,
    startedAt: now.toISOString(),
    expiresAt: limit ? new Date(now.getTime() + limit * 1000).toISOString() : null,
    resolvedAt: null,
  };
  db.insert('battles', battle);

  res.status(201).json({ battle: playView(battle), timeLimit: limit, coins: req.user.coins || 0 });
});

/** POST /api/battles/:id/answer — grade it and move the coins. */
studentRouter.post('/:id/answer', (req, res) => {
  const battle = db.findById('battles', req.params.id);
  if (!battle) return res.status(404).json({ error: 'Battle not found.' });
  if (battle.attackerId !== req.user.id) return res.status(403).json({ error: 'That is not your battle.' });
  if (battle.status !== 'open') return res.status(403).json({ error: 'ALREADY_RESOLVED' });

  const answers = (req.body && req.body.answers) || {};
  const graded = ch.gradeSubmission({ questions: battle.questions }, answers);
  // Running out of time is a loss, not a free walk-away: otherwise abandoning a
  // hard draw and coming back later would be a re-roll.
  const late = !!battle.expiresAt && Date.now() > Date.parse(battle.expiresAt);
  const won = !late && bt.isWin(graded);

  const defender = db.findById('users', battle.defenderId);
  let moved = 0;
  if (defender) {
    moved = won
      ? bt.transferCoins(req.user, defender, battle.stake)
      : bt.transferCoins(defender, req.user, battle.stake);
  }

  battle.status = won ? 'won' : 'lost';
  battle.late = late;
  battle.coinsMoved = moved;
  battle.earned = graded.autoEarned;
  battle.maxPoints = graded.maxPoints;
  battle.results = graded.results;
  battle.answers = answers;
  battle.resolvedAt = new Date().toISOString();
  db.save();

  res.json({
    outcome: won ? 'win' : 'loss',
    late,
    coinsMoved: moved,
    stake: battle.stake,
    coins: req.user.coins || 0,
    opponentName: battle.defenderName,
    earned: graded.autoEarned,
    maxPoints: graded.maxPoints,
    results: graded.results,
    // The keys are safe to reveal now the battle is over.
    review: (battle.questions || []).map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      expected: ch.expectedText(q),
      mine: ch.answerText(q, answers[q.id]),
    })),
  });
});

/* ================================= DUELS ================================= */
/*
 * A duel is the mirror image of a raid: the challenger writes the question and
 * the classmate answers it. Kru CJ stands between the two — see
 * src/aiQuestions.js `reviewStudentQuestion` — and the server re-runs that
 * review itself rather than believing a client that says "approved".
 */

const duelsOf = (userId) => db
  .filter('duels', (d) => d.challengerId === userId || d.defenderId === userId)
  .slice()
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

const pendingSentBy = (userId) => db.filter('duels', (d) => d.challengerId === userId && d.status === 'pending');

const pendingBetween = (challengerId, defenderId) => db.find(
  'duels',
  (d) => d.challengerId === challengerId && d.defenderId === defenderId && d.status === 'pending'
);

/** One AI-approved question per student, waiting to be sent. */
const draftOf = (userId) => db.find('duelDrafts', (d) => d.userId === userId);

/**
 * Retire duels nobody answered in time.
 *
 * Called at the top of every duel read, because there is no scheduler here and
 * nothing else would ever move them out of 'pending'. No coins are involved: a
 * duel never locked any, so expiring one is pure bookkeeping.
 */
function sweepExpired() {
  let touched = false;
  db.filter('duels', (d) => d.status === 'pending').forEach((d) => {
    if (!bt.duelExpired(d)) return;
    d.status = 'expired';
    d.resolvedAt = new Date().toISOString();
    touched = true;
  });
  if (touched) db.save();
}

/** A duel as the person looking at it should see it — never with the key. */
function duelView(d, meId) {
  const mine = d.challengerId === meId;
  return {
    id: d.id,
    direction: mine ? 'sent' : 'received',
    difficulty: d.difficulty,
    stake: d.stake,
    status: d.status,
    // Who won, from THIS student's side. null while it is still pending.
    outcome: d.status === 'pending' || d.status === 'declined' || d.status === 'cancelled' || d.status === 'expired'
      ? null
      : (mine ? (d.defenderWon ? 'loss' : 'win') : (d.defenderWon ? 'win' : 'loss')),
    opponentName: mine ? d.defenderName : d.challengerName,
    opponentAvatar: mine ? d.defenderAvatar : d.challengerAvatar,
    // The challenger wrote it, so showing it back to them gives nothing away.
    // The defender must not see it until they open the duel and the clock starts.
    question: mine && d.question ? d.question.question : null,
    coinsMoved: d.coinsMoved || 0,
    late: !!d.late,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt || null,
    answerBy: d.answerBy || null,
    resolvedAt: d.resolvedAt || null,
  };
}

/** The shared shape of a "can Kru CJ look at this?" failure. */
function aiUnavailable(res) {
  if (!config.aiEnabled()) {
    res.status(503).json({ error: 'AI_DISABLED' });
    return true;
  }
  return false;
}

/**
 * POST /api/battles/duels/check — have Kru CJ read a question I wrote.
 *
 * Body: { question: {...}, lang? }
 * On approval the question is parked as this student's single draft, so that
 * sending it does not pay the model twice for the same review. On rejection
 * nothing is stored and the student is told what to fix.
 */
studentRouter.post('/duels/check', async (req, res) => {
  if (aiUnavailable(res)) return;

  const s = settings();
  if (!s.enabled) return res.status(403).json({ error: 'disabled' });

  const body = req.body || {};
  const lang = body.lang === 'th' ? 'th' : 'en';
  const question = bt.normalizeDuelQuestion(body.question);
  if (!question) {
    // Not a model call: the question is missing its answer key or its text, and
    // asking Kru CJ to review nothing would spend quota to say so.
    return res.status(400).json({ error: 'DUEL_INCOMPLETE' });
  }

  // Spend the allowance BEFORE the await — see the note in aiLimit.take().
  try {
    aiLimit.take(req.user, 'review');
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') {
      return res.status(429).json({ error: 'AI_DAILY_LIMIT', ...aiLimit.statusOf(req.user, 'review') });
    }
    throw err;
  }
  db.save();

  let review;
  try {
    review = await ai.reviewStudentQuestion({ question, lang });
  } catch (err) {
    aiLimit.refund(req.user, 'review');
    db.save();
    console.error('[duel/check]', ai.describeFailure(err));
    const { status, code } = ai.failureOf(err);
    return res.status(status).json({ error: code, ...aiLimit.statusOf(req.user, 'review') });
  }

  if (!review.ok) {
    // A rejected question leaves nothing behind: the next check starts clean.
    const stale = draftOf(req.user.id);
    if (stale) db.remove('duelDrafts', stale.id);
    return res.json({ ok: false, review, ...aiLimit.statusOf(req.user, 'review') });
  }

  // One draft per student, replaced rather than accumulated, so this collection
  // can never grow past one row per person.
  const existing = draftOf(req.user.id);
  if (existing) db.remove('duelDrafts', existing.id);
  const draft = {
    id: bt.uuid(),
    userId: req.user.id,
    question,
    review,
    createdAt: new Date().toISOString(),
  };
  db.insert('duelDrafts', draft);

  res.json({ ok: true, draftId: draft.id, review, ...aiLimit.statusOf(req.user, 'review') });
});

/** GET /api/battles/duels — my duels, both directions, plus my parked draft. */
studentRouter.get('/duels', (req, res) => {
  sweepExpired();
  const draft = draftOf(req.user.id);
  res.json({
    duels: duelsOf(req.user.id).slice(0, 40).map((d) => duelView(d, req.user.id)),
    draft: draft ? { id: draft.id, question: draft.question.question, type: draft.question.type } : null,
    maxOpen: bt.MAX_OPEN_DUELS,
    openSent: pendingSentBy(req.user.id).length,
    // Writing a duel question needs Kru CJ, so the page must be able to say
    // "not available here" rather than let a student write one into a wall.
    aiEnabled: config.aiEnabled(),
    ...aiLimit.statusOf(req.user, 'review'),
  });
});

/**
 * POST /api/battles/duels — send an approved question to a classmate.
 * Body: { draftId, opponentId, difficulty }
 *
 * The question comes from the parked draft, never from this request body: a
 * client that could send the question here could send one Kru CJ never saw.
 */
studentRouter.post('/duels', (req, res) => {
  sweepExpired();
  const body = req.body || {};
  const s = settings();

  const draft = draftOf(req.user.id);
  if (!draft || draft.id !== body.draftId) {
    return res.status(400).json({ error: 'DUEL_NOT_CHECKED' });
  }

  const difficulty = bt.DIFFICULTIES.includes(body.difficulty) ? body.difficulty : null;
  if (!difficulty) return res.status(400).json({ error: 'Pick easy, medium or hard.' });

  const defender = db.findById('users', body.opponentId);
  if (!defender) return res.status(404).json({ error: 'That student was not found.' });

  const verdict = bt.canDuel(req.user, defender, {
    settings: s,
    difficulty,
    actionsToday: actionsToday(req.user.id),
    lastAgainst: lastAgainst(req.user.id, defender.id),
    openSent: pendingSentBy(req.user.id).length,
    pendingAgainst: pendingBetween(req.user.id, defender.id),
  });
  if (!verdict.ok) return res.status(403).json({ error: verdict.reason, readyAt: verdict.readyAt || null });

  const now = new Date();
  const duel = {
    id: bt.uuid(),
    challengerId: req.user.id,
    challengerName: req.user.name,
    challengerAvatar: req.user.avatar || '🧑‍🎓',
    defenderId: defender.id,
    defenderName: defender.name,
    defenderAvatar: defender.avatar || '🧑‍🎓',
    difficulty,
    stake: verdict.stake,
    // The question, answer key and all, lives on the duel — the same reason a
    // raid stores its drawn questions: grading must use what was actually sent.
    question: draft.question,
    // Kept so the teacher can see what Kru CJ was asked to approve, and why.
    review: draft.review,
    status: 'pending',
    defenderWon: null,
    coinsMoved: 0,
    late: false,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + bt.DUEL_EXPIRY_HOURS * 3600_000).toISOString(),
    openedAt: null,
    answerBy: null,
    resolvedAt: null,
  };
  db.insert('duels', duel);
  db.remove('duelDrafts', draft.id);

  res.status(201).json({ duel: duelView(duel, req.user.id) });
});

/** POST /api/battles/duels/:id/cancel — take back a duel nobody has answered. */
studentRouter.post('/duels/:id/cancel', (req, res) => {
  const duel = db.findById('duels', req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found.' });
  if (duel.challengerId !== req.user.id) return res.status(403).json({ error: 'That is not your duel.' });
  if (duel.status !== 'pending') return res.status(403).json({ error: 'ALREADY_RESOLVED' });

  duel.status = 'cancelled';
  duel.resolvedAt = new Date().toISOString();
  db.save();
  res.json({ ok: true, duel: duelView(duel, req.user.id) });
});

/** POST /api/battles/duels/:id/decline — no thanks. Costs nothing, by design. */
studentRouter.post('/duels/:id/decline', (req, res) => {
  const duel = db.findById('duels', req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found.' });
  if (duel.defenderId !== req.user.id) return res.status(403).json({ error: 'That duel is not yours to decline.' });
  if (duel.status !== 'pending') return res.status(403).json({ error: 'ALREADY_RESOLVED' });

  duel.status = 'declined';
  duel.resolvedAt = new Date().toISOString();
  db.save();
  res.json({ ok: true, duel: duelView(duel, req.user.id) });
});

/**
 * POST /api/battles/duels/:id/open — read the question and start the clock.
 *
 * Idempotent: re-opening returns the same deadline rather than a fresh one, so
 * refreshing the page is not a way to buy another minute.
 */
studentRouter.post('/duels/:id/open', (req, res) => {
  sweepExpired();
  const duel = db.findById('duels', req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found.' });
  if (duel.defenderId !== req.user.id) return res.status(403).json({ error: 'That duel is not yours to answer.' });
  if (duel.status !== 'pending') return res.status(403).json({ error: 'ALREADY_RESOLVED' });

  if (!duel.openedAt) {
    const s = settings();
    const limit = bt.timeLimitFor(s, duel.difficulty);
    const now = new Date();
    duel.openedAt = now.toISOString();
    duel.answerBy = limit ? new Date(now.getTime() + limit * 1000).toISOString() : null;
    db.save();
  }

  res.json({
    duel: {
      id: duel.id,
      difficulty: duel.difficulty,
      stake: duel.stake,
      challengerName: duel.challengerName,
      challengerAvatar: duel.challengerAvatar,
      answerBy: duel.answerBy,
      createdAt: duel.createdAt,
      // Stripped of its answer key, exactly like a raid's drawn questions.
      question: ch.sanitizeQuestion(duel.question),
    },
  });
});

/** POST /api/battles/duels/:id/answer — grade it and move the coins. */
studentRouter.post('/duels/:id/answer', (req, res) => {
  const duel = db.findById('duels', req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found.' });
  if (duel.defenderId !== req.user.id) return res.status(403).json({ error: 'That duel is not yours to answer.' });
  if (duel.status !== 'pending') return res.status(403).json({ error: 'ALREADY_RESOLVED' });

  // Past the 48 hours: it is dead, and nothing moves either way.
  if (bt.duelExpired(duel)) {
    duel.status = 'expired';
    duel.resolvedAt = new Date().toISOString();
    db.save();
    return res.status(403).json({ error: 'DUEL_EXPIRED' });
  }
  if (!duel.openedAt) return res.status(403).json({ error: 'DUEL_NOT_OPENED' });

  const answers = (req.body && req.body.answers) || {};
  const graded = ch.gradeSubmission({ questions: [duel.question] }, answers);
  // Running the clock down is a loss for the defender, the same rule a raid
  // uses: otherwise walking away from a hard question is a free escape.
  const late = !!duel.answerBy && Date.now() > Date.parse(duel.answerBy);
  const defenderWon = !late && bt.isWin(graded);

  const challenger = db.findById('users', duel.challengerId);
  let moved = 0;
  if (challenger) {
    moved = defenderWon
      ? bt.transferCoins(req.user, challenger, duel.stake)
      : bt.transferCoins(challenger, req.user, duel.stake);
  }

  duel.status = 'answered';
  duel.defenderWon = defenderWon;
  duel.late = late;
  duel.coinsMoved = moved;
  duel.answer = answers;
  duel.results = graded.results;
  duel.resolvedAt = new Date().toISOString();
  db.save();

  res.json({
    outcome: defenderWon ? 'win' : 'loss',
    late,
    coinsMoved: moved,
    stake: duel.stake,
    coins: req.user.coins || 0,
    opponentName: duel.challengerName,
    results: graded.results,
    // Safe to reveal now the duel is over.
    review: {
      id: duel.question.id,
      question: duel.question.question,
      type: duel.question.type,
      expected: ch.expectedText(duel.question),
      mine: ch.answerText(duel.question, answers[duel.question.id]),
    },
  });
});

/* ============================== TEACHER API ============================== */

teacherRouter.use(authMiddleware, requireRole('teacher'));

/** GET /api/teacher/battles — settings, bank sizes and the latest battles. */
teacherRouter.get('/', (req, res) => {
  const recent = db
    .all('battles')
    .slice()
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, 40)
    .map((b) => ({
      id: b.id,
      attackerName: b.attackerName,
      attackerAvatar: b.attackerAvatar,
      defenderName: b.defenderName,
      defenderAvatar: b.defenderAvatar,
      difficulty: b.difficulty,
      stake: b.stake,
      status: b.status,
      coinsMoved: b.coinsMoved || 0,
      startedAt: b.startedAt,
      resolvedAt: b.resolvedAt || null,
    }));
  res.json({ settings: settings(), banks: bankCounts(), recent });
});

/** GET /api/teacher/battles/bank/:difficulty — that bank, answer keys included. */
teacherRouter.get('/bank/:difficulty', (req, res) => {
  const d = req.params.difficulty;
  if (!bt.DIFFICULTIES.includes(d)) return res.status(404).json({ error: 'Unknown difficulty.' });
  res.json({ difficulty: d, questions: bankFor(d) });
});

/**
 * POST /api/teacher/battles/bank/:difficulty — replace one bank.
 * Ids are preserved by the editor, so re-saving a bank is a small diff for the
 * Postgres backend rather than a delete-and-reinsert of every question.
 */
teacherRouter.post('/bank/:difficulty', (req, res) => {
  const d = req.params.difficulty;
  if (!bt.DIFFICULTIES.includes(d)) return res.status(404).json({ error: 'Unknown difficulty.' });

  const sent = Array.isArray(req.body && req.body.questions) ? req.body.questions.slice(0, bt.MAX_BANK) : [];
  const kept = sent
    .map((raw, i) => bt.normalizeBankQuestion(raw, d, i))
    .filter(Boolean);

  const keep = new Set(kept.map((q) => q.id));
  bankFor(d).forEach((old) => { if (!keep.has(old.id)) db.remove('battleQuestions', old.id); });
  kept.forEach((q) => {
    const existing = db.findById('battleQuestions', q.id);
    if (existing) Object.assign(existing, q);
    else db.insert('battleQuestions', q);
  });
  db.save();

  res.json({ difficulty: d, questions: bankFor(d), dropped: Math.max(0, sent.length - kept.length) });
});

/** POST /api/teacher/battles/settings — stakes, limits, on/off. */
teacherRouter.post('/settings', (req, res) => {
  const existing = db.findById('battleSettings', bt.SETTINGS_ID);
  const next = bt.normalizeSettings(req.body || {}, existing);
  if (!existing) db.insert('battleSettings', next);
  else db.save();
  res.json({ settings: bt.withDefaults(next) });
});

/** GET /api/teacher/battles/log — every battle, newest first. */
teacherRouter.get('/log', (req, res) => {
  const log = db
    .all('battles')
    .slice()
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .map((b) => ({
      id: b.id,
      attackerName: b.attackerName,
      defenderName: b.defenderName,
      difficulty: b.difficulty,
      stake: b.stake,
      status: b.status,
      late: !!b.late,
      coinsMoved: b.coinsMoved || 0,
      earned: b.earned == null ? null : b.earned,
      maxPoints: b.maxPoints == null ? null : b.maxPoints,
      startedAt: b.startedAt,
      resolvedAt: b.resolvedAt || null,
    }));
  res.json({ battles: log });
});

/**
 * GET /api/teacher/battles/duels — every duel, with the question and Kru CJ's
 * verdict on it.
 *
 * This one is not a nice-to-have. Duels are the only place in StoiVenture where
 * something a student wrote is put in front of another student, and an AI
 * reviewer is a filter, not a guardian. The teacher must be able to read what
 * their class is actually sending each other, so the answer key and the review
 * are both included.
 */
teacherRouter.get('/duels', (req, res) => {
  const list = db
    .all('duels')
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((d) => ({
      id: d.id,
      challengerName: d.challengerName,
      challengerAvatar: d.challengerAvatar,
      defenderName: d.defenderName,
      defenderAvatar: d.defenderAvatar,
      difficulty: d.difficulty,
      stake: d.stake,
      status: d.status,
      defenderWon: d.defenderWon,
      late: !!d.late,
      coinsMoved: d.coinsMoved || 0,
      question: d.question ? d.question.question : '',
      type: d.question ? d.question.type : '',
      expected: d.question ? ch.expectedText(d.question) : '',
      review: d.review || null,
      createdAt: d.createdAt,
      resolvedAt: d.resolvedAt || null,
    }));
  res.json({ duels: list });
});

/**
 * DELETE /api/teacher/battles/duels/:id — take down a duel.
 *
 * The backstop for the paragraph above: when a question slips past Kru CJ and
 * should not be in front of a classmate, the teacher can remove it. A pending
 * duel is simply gone; a resolved one keeps the coins where they landed,
 * because unwinding a transfer days later would be a worse surprise than the
 * question was.
 */
teacherRouter.delete('/duels/:id', (req, res) => {
  const duel = db.findById('duels', req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duel not found.' });
  db.remove('duels', duel.id);
  res.json({ ok: true });
});

module.exports = { studentRouter, teacherRouter };
