/**
 * Daily Quests — student and teacher routes.
 *
 * Students answer short teacher-assigned side questions and are paid in coins
 * the moment they submit. Quests are global (not attached to a level), every
 * question is auto-marked, and the payout is pro-rata to the score.
 *
 * Mounted in server.js as:
 *   /api/quests          -> studentRouter
 *   /api/teacher/quests  -> teacherRouter   (BEFORE the generic /api/teacher)
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const ch = require('../challenges');
const qs = require('../quests');
const { authMiddleware, requireRole } = require('../auth');

const studentRouter = express.Router();
const teacherRouter = express.Router();

/* ------------------------------- helpers -------------------------------- */

const allQuests = () => db
  .all('quests')
  .slice()
  .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));

/** One submission per (quest, student) — a quest is a single attempt. */
const submissionOf = (questId, userId) =>
  db.find('questSubmissions', (s) => s.questId === questId && s.userId === userId);

/** The student's list-card view of a quest (no questions, no answer keys). */
function cardFor(q, user) {
  const sub = submissionOf(q.id, user.id);
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    icon: q.icon,
    reward: q.reward || 0,
    opensAt: q.opensAt || null,
    closesAt: q.closesAt || null,
    windowState: qs.windowState(q),
    timeLimit: q.timeLimit || 0,
    questionCount: (q.questions || []).length,
    maxPoints: ch.maxPoints(q),
    status: sub ? 'done' : 'todo',
    earned: sub ? sub.earned : null,
    coinsAwarded: sub ? sub.coinsAwarded : null,
    submittedAt: sub ? sub.createdAt : null,
  };
}

/** The student's view of their own submission. */
function resultView(sub) {
  return {
    id: sub.id,
    earned: sub.earned,
    maxPoints: sub.maxPoints,
    coinsAwarded: sub.coinsAwarded,
    results: sub.results,
    answers: sub.answers,
    submittedAt: sub.createdAt,
  };
}

/* ============================== STUDENT API ============================== */

studentRouter.use(authMiddleware, requireRole('student'));

/** GET /api/quests/wallet — balance + what earned it. Declared before /:id. */
studentRouter.get('/wallet', (req, res) => {
  const history = db
    .filter('questSubmissions', (s) => s.userId === req.user.id)
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 50)
    .map((s) => ({
      questId: s.questId,
      title: s.questTitle,
      icon: s.questIcon,
      coins: s.coinsAwarded,
      earned: s.earned,
      maxPoints: s.maxPoints,
      at: s.createdAt,
    }));
  res.json({ coins: req.user.coins || 0, coinsEarned: req.user.coinsEarned || 0, history });
});

/** GET /api/quests — the quests assigned to me. */
studentRouter.get('/', (req, res) => {
  const list = allQuests()
    .filter((q) => qs.isVisibleTo(q, req.user))
    .map((q) => cardFor(q, req.user));
  res.json({ quests: list, coins: req.user.coins || 0 });
});

/** Find a quest this student is allowed to open, or answer the request. */
function openQuest(req, res) {
  const q = db.findById('quests', req.params.id);
  if (!q) { res.status(404).json({ error: 'Quest not found.' }); return null; }
  if (!qs.isVisibleTo(q, req.user)) {
    res.status(403).json({ error: 'This quest is not assigned to you.' });
    return null;
  }
  return q;
}

/** GET /api/quests/:id — the quest to answer, with answer keys stripped. */
studentRouter.get('/:id', (req, res) => {
  const q = openQuest(req, res);
  if (!q) return;
  const sub = submissionOf(q.id, req.user.id);
  const state = qs.windowState(q);
  // Before it opens there is nothing to show; once closed a finished quest is
  // still reviewable, but an unanswered one is not.
  if (state === 'upcoming') return res.status(403).json({ error: 'This quest has not started yet.' });
  if (state === 'closed' && !sub) return res.status(403).json({ error: 'This quest has closed.' });

  res.json({
    quest: {
      id: q.id,
      title: q.title,
      description: q.description,
      icon: q.icon,
      reward: q.reward || 0,
      opensAt: q.opensAt || null,
      closesAt: q.closesAt || null,
      windowState: state,
      timeLimit: q.timeLimit || 0,
      maxPoints: ch.maxPoints(q),
      questions: (q.questions || []).map(ch.sanitizeQuestion),
    },
    mySubmission: sub ? resultView(sub) : null,
  });
});

/** POST /api/quests/:id/submit — grade, pay out, and record it. */
studentRouter.post('/:id/submit', (req, res) => {
  const q = openQuest(req, res);
  if (!q) return;

  // One attempt only. The sentinel string is what the player special-cases.
  if (submissionOf(q.id, req.user.id)) {
    return res.status(403).json({ error: 'ALREADY_SUBMITTED' });
  }
  // Unlike a challenge's advisory dueAt, the window is enforced here: coins are
  // at stake, so a late or early submission must not pay out.
  const state = qs.windowState(q);
  if (state === 'upcoming') return res.status(403).json({ error: 'This quest has not started yet.' });
  if (state === 'closed') return res.status(403).json({ error: 'This quest has closed.' });

  const answers = (req.body && req.body.answers) || {};
  const graded = ch.gradeSubmission(q, answers);
  // Every quest question is auto-markable, so nothing should land in `manual`.
  // If one ever does, treat it as worth zero rather than paying for it blindly.
  const earned = graded.autoEarned;
  const maxPoints = graded.maxPoints;
  const coins = qs.coinsFor(q, earned, maxPoints);

  const record = {
    id: crypto.randomUUID(),
    questId: q.id,
    questTitle: q.title,
    questIcon: q.icon,
    userId: req.user.id,
    userName: req.user.name,
    userAvatar: req.user.avatar || '🧑‍🎓',
    answers,
    results: graded.results,
    earned,
    maxPoints,
    coinsAwarded: coins,
    createdAt: new Date().toISOString(),
  };
  db.insert('questSubmissions', record);

  // Coins live on the user, outside game.recalcPoints() — that function rebuilds
  // `points` from quiz scores and would wipe anything folded into it.
  req.user.coins = (req.user.coins || 0) + coins;
  req.user.coinsEarned = (req.user.coinsEarned || 0) + coins;
  db.save();

  res.status(201).json({ submission: resultView(record), coins: req.user.coins });
});

/* ============================== TEACHER API ============================== */

teacherRouter.use(authMiddleware, requireRole('teacher'));

const submissionsOf = (questId) => db.filter('questSubmissions', (s) => s.questId === questId);

/** GET /api/teacher/quests — every quest with response counts. */
teacherRouter.get('/', (req, res) => {
  const quests = allQuests().map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description,
    icon: q.icon,
    reward: q.reward || 0,
    opensAt: q.opensAt || null,
    closesAt: q.closesAt || null,
    windowState: qs.windowState(q),
    timeLimit: q.timeLimit || 0,
    questionCount: (q.questions || []).length,
    maxPoints: ch.maxPoints(q),
    published: !!q.published,
    assign: q.assign || { mode: 'all', studentIds: [] },
    responses: submissionsOf(q.id).length,
    order: q.order || 0,
    updatedAt: q.updatedAt,
  }));
  res.json({ quests });
});

/** GET /api/teacher/quests/item/:id — the full quest, answer keys included. */
teacherRouter.get('/item/:id', (req, res) => {
  const q = db.findById('quests', req.params.id);
  if (!q) return res.status(404).json({ error: 'Quest not found.' });
  res.json({ quest: q });
});

/**
 * POST /api/teacher/quests/coins — adjust a student's balance by hand.
 * Also the only debit path in the app; a future shop will need one.
 */
teacherRouter.post('/coins', (req, res) => {
  const body = req.body || {};
  const student = db.findById('users', body.studentId);
  if (!student || student.role !== 'student') return res.status(404).json({ error: 'Student not found.' });
  const delta = parseInt(body.delta, 10);
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'Enter how many coins to add or take away.' });

  const next = Math.max(0, (student.coins || 0) + delta);
  // coinsEarned is a lifetime total, so only a credit moves it.
  if (delta > 0) student.coinsEarned = (student.coinsEarned || 0) + delta;
  student.coins = next;
  db.save();
  res.json({ ok: true, coins: student.coins });
});

/** How many questions the normaliser threw away, so the teacher can be told. */
function droppedCount(body, quest) {
  const sent = Array.isArray(body && body.questions) ? body.questions.length : 0;
  return Math.max(0, sent - quest.questions.length);
}

/** POST /api/teacher/quests — create. */
teacherRouter.post('/', (req, res) => {
  const body = req.body || {};
  const q = qs.normalizeQuest(body, null);
  if (!q.questions.length) {
    return res.status(400).json({ error: 'A quest needs at least one question with an answer key.' });
  }
  q.order = db.all('quests').reduce((max, x) => Math.max(max, x.order || 0), 0) + 1;
  db.insert('quests', q);
  res.status(201).json({ quest: q, dropped: droppedCount(body, q) });
});

/** PUT /api/teacher/quests/:id — update in place. */
teacherRouter.put('/:id', (req, res) => {
  const existing = db.findById('quests', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Quest not found.' });
  const body = req.body || {};
  qs.normalizeQuest(body, existing);
  if (!existing.questions.length) {
    return res.status(400).json({ error: 'A quest needs at least one question with an answer key.' });
  }
  db.save();
  res.json({ quest: existing, dropped: droppedCount(body, existing) });
});

/** DELETE /api/teacher/quests/:id — removes its submissions too. */
teacherRouter.delete('/:id', (req, res) => {
  const q = db.findById('quests', req.params.id);
  if (!q) return res.status(404).json({ error: 'Quest not found.' });
  submissionsOf(q.id).forEach((s) => db.remove('questSubmissions', s.id));
  db.remove('quests', q.id);
  res.json({ ok: true });
});

/** POST /api/teacher/quests/:id/publish — show or hide it from students. */
teacherRouter.post('/:id/publish', (req, res) => {
  const q = db.findById('quests', req.params.id);
  if (!q) return res.status(404).json({ error: 'Quest not found.' });
  q.published = !!(req.body && req.body.published);
  q.updatedAt = new Date().toISOString();
  db.save();
  res.json({ ok: true, published: q.published });
});

/** POST /api/teacher/quests/:id/assign — everyone, or picked students. */
teacherRouter.post('/:id/assign', (req, res) => {
  const q = db.findById('quests', req.params.id);
  if (!q) return res.status(404).json({ error: 'Quest not found.' });
  q.assign = ch.normalizeAssign(req.body || {});
  q.updatedAt = new Date().toISOString();
  db.save();
  res.json({ ok: true, assign: q.assign });
});

/** POST /api/teacher/quests/:id/move — swap order with the neighbour. */
teacherRouter.post('/:id/move', (req, res) => {
  const list = allQuests();
  const idx = list.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Quest not found.' });
  const dir = (req.body && req.body.direction) === 'up' ? -1 : 1;
  const swap = idx + dir;
  if (swap < 0 || swap >= list.length) return res.json({ ok: true });
  const a = list[idx];
  const b = list[swap];
  const tmp = a.order || 0;
  a.order = b.order || 0;
  b.order = tmp;
  db.save();
  res.json({ ok: true });
});

/** GET /api/teacher/quests/:id/responses — who answered, what they scored. */
teacherRouter.get('/:id/responses', (req, res) => {
  const q = db.findById('quests', req.params.id);
  if (!q) return res.status(404).json({ error: 'Quest not found.' });

  const students = db.filter('users', (u) => u.role === 'student');
  const assigned = students.filter((u) => ch.isAssignedTo(q, u));
  const subs = submissionsOf(q.id);
  const answered = new Set(subs.map((s) => s.userId));
  const flat = ch.flatQuestions(q);

  const responses = subs
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: s.userName,
      userAvatar: s.userAvatar,
      earned: s.earned,
      maxPoints: s.maxPoints,
      coinsAwarded: s.coinsAwarded,
      createdAt: s.createdAt,
      // Positionally aligned with `questions` below.
      answers: flat.map((question) => {
        const r = (s.results || []).find((x) => x.questionId === question.id) || {};
        return {
          questionId: question.id,
          text: ch.answerText(question, (s.answers || {})[question.id]),
          correct: !!r.correct,
          earned: r.earned || 0,
          max: r.max || 0,
        };
      }),
    }));

  res.json({
    quest: {
      id: q.id,
      title: q.title,
      icon: q.icon,
      reward: q.reward || 0,
      maxPoints: ch.maxPoints(q),
      questions: flat.map((question) => ({
        id: question.id,
        type: question.type,
        question: question.question,
        points: question.points,
        expected: ch.expectedText(question),
      })),
    },
    assignedCount: assigned.length,
    missing: assigned
      .filter((u) => !answered.has(u.id))
      .map((u) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar })),
    responses,
  });
});

module.exports = { studentRouter, teacherRouter };
