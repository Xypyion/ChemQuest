/**
 * Coin Battles — student and teacher routes.
 *
 * Students raid each other for coins: pick an opponent and a difficulty, answer
 * the questions the teacher wrote for that difficulty, and win the stake off
 * them — or hand the same number over for getting it wrong.
 *
 * Mounted in server.js as:
 *   /api/battles          -> studentRouter
 *   /api/teacher/battles  -> teacherRouter   (BEFORE the generic /api/teacher)
 *
 * Collections: `battles`, `battleQuestions` (one document per question, tagged
 * with its difficulty), `battleSettings` (a single document, id 'settings').
 */
const express = require('express');
const db = require('../db');
const ch = require('../challenges');
const bt = require('../battles');
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

/** Resolved battles this student started today (open ones count — they used a turn). */
const battlesStartedToday = (userId) => {
  const today = bt.dayKey();
  return db.filter('battles', (b) => b.attackerId === userId && bt.dayKey(b.startedAt) === today).length;
};

/** When this student last attacked that opponent, or null. */
const lastAgainst = (attackerId, defenderId) => {
  const hits = db
    .filter('battles', (b) => b.attackerId === attackerId && b.defenderId === defenderId)
    .map((b) => b.startedAt)
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
  const used = battlesStartedToday(req.user.id);
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
  const today = battlesStartedToday(req.user.id);

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
    battlesToday: battlesStartedToday(req.user.id),
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

module.exports = { studentRouter, teacherRouter };
