/**
 * Challenges routes — the "🧩 Challenges" section of a level board.
 *
 * Two routers are exported:
 *   studentRouter → /api/challenges        (see & answer assigned challenges)
 *   teacherRouter → /api/teacher/challenges (categories, CRUD, assign, grade)
 *
 * Collections used: `challenges`, `challengeCategories`, `challengeSubmissions`.
 * The existing lesson quiz flow is untouched: challenge answers are marked here
 * and land in their own grading queue, so pre/post-test grading stays as it was.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const ch = require('../challenges');
const bg = require('../badges');
const { authMiddleware, requireRole } = require('../auth');

const studentRouter = express.Router();
const teacherRouter = express.Router();

/* ------------------------------- helpers -------------------------------- */

function categories() {
  return db.all('challengeCategories').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

function challengesFor(lessonId) {
  return db
    .filter('challenges', (c) => c.lessonId === lessonId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt));
}

function submissionOf(challengeId, userId) {
  return db.find('challengeSubmissions', (s) => s.challengeId === challengeId && s.userId === userId);
}

/** How a challenge looks in a list (no questions, no answers). */
function cardFor(c, user) {
  const sub = user ? submissionOf(c.id, user.id) : null;
  return {
    id: c.id,
    lessonId: c.lessonId,
    categoryId: c.categoryId,
    title: c.title,
    description: c.description,
    icon: c.icon,
    dueAt: c.dueAt || null,
    timeLimit: c.timeLimit || 0,
    allowRetake: !!c.allowRetake,
    questionCount: (c.questions || []).length,
    maxPoints: ch.maxPoints(c),
    status: !sub ? 'todo' : sub.status === 'graded' ? 'graded' : 'submitted',
    earned: sub && sub.status === 'graded' ? sub.earned : null,
    submittedAt: sub ? sub.createdAt : null,
  };
}

/* ============================== STUDENT API ============================== */

studentRouter.use(authMiddleware, requireRole('student'));

/** GET /api/challenges/lesson/:lessonId — challenges assigned to me on a level. */
studentRouter.get('/lesson/:lessonId', (req, res) => {
  const lesson = db.findById('lessons', req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'That level does not exist.' });
  const list = challengesFor(lesson.id)
    .filter((c) => c.published && ch.isAssignedTo(c, req.user))
    .map((c) => cardFor(c, req.user));
  res.json({ challenges: list, categories: categories() });
});

/** Find a challenge the student is actually allowed to open. */
function openChallenge(req, res) {
  const c = db.findById('challenges', req.params.id);
  if (!c) { res.status(404).json({ error: 'Challenge not found.' }); return null; }
  if (!c.published || !ch.isAssignedTo(c, req.user)) {
    res.status(403).json({ error: 'This challenge is not assigned to you.' });
    return null;
  }
  return c;
}

/** GET /api/challenges/:id — the challenge to answer (answer keys stripped). */
studentRouter.get('/:id', (req, res) => {
  const c = openChallenge(req, res);
  if (!c) return;
  const sub = submissionOf(c.id, req.user.id);
  const done = !!sub && !c.allowRetake;
  res.json({
    challenge: {
      id: c.id,
      lessonId: c.lessonId,
      categoryId: c.categoryId,
      title: c.title,
      description: c.description,
      icon: c.icon,
      dueAt: c.dueAt || null,
      timeLimit: c.timeLimit || 0,
      allowRetake: !!c.allowRetake,
      maxPoints: ch.maxPoints(c),
      // Answer keys are always stripped; the questions themselves stay visible
      // after handing in so the student can review what they answered.
      questions: (c.questions || []).map(ch.sanitizeQuestion),
    },
    category: categories().find((k) => k.id === c.categoryId) || null,
    mySubmission: sub ? resultView(c, sub) : null,
    locked: done,
  });
});

/** The student's own view of a marked (or pending) submission. */
function resultView(c, sub) {
  return {
    id: sub.id,
    status: sub.status,
    earned: sub.status === 'graded' ? sub.earned : sub.autoEarned,
    autoEarned: sub.autoEarned,
    maxPoints: sub.maxPoints,
    pendingCount: (sub.manual || []).filter((m) => m.awarded == null).length,
    results: sub.results || [],
    answers: sub.answers || {},
    feedback: sub.feedback || '',
    submittedAt: sub.createdAt,
    gradedAt: sub.gradedAt || null,
  };
}

/** POST /api/challenges/:id/submit — hand in answers. */
studentRouter.post('/:id/submit', (req, res) => {
  const c = openChallenge(req, res);
  if (!c) return;
  const existing = submissionOf(c.id, req.user.id);
  if (existing && !c.allowRetake) return res.status(403).json({ error: 'ALREADY_SUBMITTED' });

  const answers = (req.body && req.body.answers) || {};
  const graded = ch.gradeSubmission(c, answers);
  const now = new Date().toISOString();
  const pending = graded.manual.length > 0;

  const record = {
    id: (existing && existing.id) || crypto.randomUUID(),
    challengeId: c.id,
    challengeTitle: c.title,
    challengeIcon: c.icon || '🧩',
    lessonId: c.lessonId,
    userId: req.user.id,
    userName: req.user.name,
    userAvatar: req.user.avatar || '🧑‍🎓',
    answers,
    results: graded.results,
    autoEarned: graded.autoEarned,
    manual: graded.manual,
    earned: pending ? null : graded.autoEarned,
    maxPoints: graded.maxPoints,
    status: pending ? 'pending' : 'graded',
    feedback: '',
    createdAt: now,
    gradedAt: pending ? null : now,
  };

  if (existing) Object.assign(existing, record);
  else db.insert('challengeSubmissions', record);

  /* The badge, if this challenge carries one. Awarded on handing in rather than
     on being marked: a challenge with written answers can sit in the grading
     queue for days, and a reward that arrives on Thursday for work done on
     Monday is not a reward. `award()` is a no-op when the student already holds
     it, so a retake cannot mint a second copy. */
  const earnedBadge = bg.award(req.user, c);
  db.save();

  res.json({
    submission: resultView(c, existing || record),
    // Only present when something was actually earned, so the player can just
    // check for it rather than compare against what they held before.
    badge: earnedBadge ? { name: earnedBadge.badgeName, image: earnedBadge.badgeImage } : null,
  });
});

/** GET /api/challenges/:id/result — my marked result. */
studentRouter.get('/:id/result', (req, res) => {
  const c = openChallenge(req, res);
  if (!c) return;
  const sub = submissionOf(c.id, req.user.id);
  if (!sub) return res.status(404).json({ error: 'You have not submitted this challenge yet.' });
  res.json({ submission: resultView(c, sub), title: c.title, icon: c.icon });
});

/* ============================== TEACHER API ============================== */

teacherRouter.use(authMiddleware, requireRole('teacher'));

/** Count of challenge responses still waiting to be marked. */
function pendingCount() {
  return db.filter('challengeSubmissions', (s) => s.status === 'pending').length;
}

/** GET /api/teacher/challenges — every challenge + categories + queue size. */
teacherRouter.get('/', (req, res) => {
  const list = db
    .all('challenges')
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt))
    .map((c) => ({
      id: c.id,
      lessonId: c.lessonId,
      categoryId: c.categoryId,
      title: c.title,
      description: c.description,
      icon: c.icon,
      published: !!c.published,
      dueAt: c.dueAt || null,
      timeLimit: c.timeLimit || 0,
      allowRetake: !!c.allowRetake,
      assign: c.assign || { mode: 'all', studentIds: [] },
      questionCount: (c.questions || []).length,
      maxPoints: ch.maxPoints(c),
      responses: db.filter('challengeSubmissions', (s) => s.challengeId === c.id).length,
      pending: db.filter('challengeSubmissions', (s) => s.challengeId === c.id && s.status === 'pending').length,
      updatedAt: c.updatedAt,
    }));
  res.json({ challenges: list, categories: categories(), pending: pendingCount() });
});

/** GET /api/teacher/challenges/:id — one challenge in full (with answer keys). */
teacherRouter.get('/item/:id', (req, res) => {
  const c = db.findById('challenges', req.params.id);
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  res.json({ challenge: c });
});

teacherRouter.post('/', (req, res) => {
  const c = ch.normalizeChallenge(req.body || {}, null);
  if (!c.lessonId || !db.findById('lessons', c.lessonId)) {
    return res.status(400).json({ error: 'Pick which level this challenge belongs to.' });
  }
  c.order = db.all('challenges').reduce((max, x) => Math.max(max, x.order || 0), 0) + 1;
  db.insert('challenges', c);
  res.status(201).json({ challenge: c });
});

teacherRouter.put('/:id', (req, res) => {
  const existing = db.findById('challenges', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Challenge not found.' });
  ch.normalizeChallenge(req.body || {}, existing);
  if (!existing.lessonId || !db.findById('lessons', existing.lessonId)) {
    return res.status(400).json({ error: 'Pick which level this challenge belongs to.' });
  }
  db.save();
  res.json({ challenge: existing });
});

teacherRouter.delete('/:id', (req, res) => {
  const ok = db.remove('challenges', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Challenge not found.' });
  // Drop the responses too — they are meaningless without their challenge.
  db.all('challengeSubmissions')
    .filter((s) => s.challengeId === req.params.id)
    .forEach((s) => db.remove('challengeSubmissions', s.id));
  res.json({ ok: true });
});

/** Publish / unpublish (students only ever see published challenges). */
teacherRouter.post('/:id/publish', (req, res) => {
  const c = db.findById('challenges', req.params.id);
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  c.published = !!(req.body && req.body.published);
  db.save();
  res.json({ ok: true, published: c.published });
});

/** Assign to everyone or to a hand-picked set of students. */
teacherRouter.post('/:id/assign', (req, res) => {
  const c = db.findById('challenges', req.params.id);
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  c.assign = ch.normalizeAssign(req.body || {});
  db.save();
  res.json({ ok: true, assign: c.assign });
});

/** Move a challenge up/down inside its list. */
teacherRouter.post('/:id/move', (req, res) => {
  const dir = (req.body && req.body.direction) === 'up' ? -1 : 1;
  const list = db.all('challenges').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const i = list.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Challenge not found.' });
  const j = i + dir;
  if (j < 0 || j >= list.length) return res.json({ ok: true });
  const tmp = list[i].order || 0;
  list[i].order = list[j].order || 0;
  list[j].order = tmp;
  db.save();
  res.json({ ok: true });
});

/* ------------------------------ categories ------------------------------ */

/** Bulk save the category list (add / rename / reorder / delete). */
teacherRouter.post('/categories', (req, res) => {
  const arr = Array.isArray(req.body && req.body.categories) ? req.body.categories : [];
  const cats = arr.slice(0, 30).map((c, i) => ({
    id: (c && c.id) || crypto.randomUUID(),
    name: ((c && c.name) || '').toString().trim().slice(0, 60) || 'Untitled',
    icon: ((c && c.icon) || '📂').toString().trim().slice(0, 8) || '📂',
    order: i,
  }));
  const keep = new Set(cats.map((c) => c.id));
  // Challenges in a deleted category fall back to "uncategorised".
  db.all('challenges').forEach((c) => { if (c.categoryId && !keep.has(c.categoryId)) c.categoryId = null; });
  const live = db.all('challengeCategories');
  live.length = 0;
  cats.forEach((c) => live.push(c));
  db.save();
  res.json({ categories: categories() });
});

/* ------------------------- responses & grading -------------------------- */

/**
 * The question list a teacher sees next to the responses: prompt, type, points,
 * the marking guide and the correct answer. Images are left out — they can be
 * megabytes of data-URI and the teacher wrote the question themselves.
 */
function teacherQuestionView(q, simTitle) {
  const view = {
    id: q.id,
    type: q.type,
    question: q.question,
    points: q.points || 0,
    guide: q.explanation || '',
    expected: ch.expectedText(q),
    simTitle: simTitle || '',   // the simulation this question sits under, if any
  };
  if (q.type === 'mcq' || q.type === 'multi') view.choices = q.choices || [];
  if (q.type === 'table') {
    view.table = {
      columns: (q.table && q.table.columns) || [],
      rows: ((q.table && q.table.rows) || []).map((r) => ({
        cells: (r.cells || []).map((c) => ({ text: c.text, blank: !!c.blank, answer: c.answer })),
      })),
    };
  }
  return view;
}

/** Every scorable question in order, each tagged with its parent simulation. */
function teacherQuestionList(c) {
  const out = [];
  (c.questions || []).forEach((q) => {
    if (q.type === 'simulation') (q.sub || []).forEach((sq) => out.push(teacherQuestionView(sq, q.question || 'Simulation')));
    else out.push(teacherQuestionView(q, ''));
  });
  return out;
}

/**
 * GET /api/teacher/challenges/:id/responses
 * Everything the teacher needs to read a whole class set: the question list
 * once, then every student's answer to every question — not only the ones still
 * waiting for a mark — plus the per-question outcome and who has not handed in.
 */
teacherRouter.get('/:id/responses', (req, res) => {
  const c = db.findById('challenges', req.params.id);
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });
  const students = db.filter('users', (u) => u.role === 'student');
  const assigned = students.filter((u) => ch.isAssignedTo(c, u));
  const subs = db.filter('challengeSubmissions', (s) => s.challengeId === c.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const flat = ch.flatQuestions(c);
  const byId = (id) => students.find((u) => u.id === id);

  res.json({
    challenge: {
      id: c.id,
      title: c.title,
      icon: c.icon,
      maxPoints: ch.maxPoints(c),
      questions: teacherQuestionList(c),
    },
    assignedCount: assigned.length,
    missing: assigned
      .filter((u) => !subs.some((s) => s.userId === u.id))
      .map((u) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar || '🧑‍🎓' })),
    responses: subs.map((s) => {
      const user = byId(s.userId);
      return {
        id: s.id,
        userId: s.userId,
        userName: s.userName,
        userEmail: user ? user.email : '',
        userAvatar: s.userAvatar || '🧑‍🎓',
        status: s.status,
        autoEarned: s.autoEarned,
        earned: s.earned,
        maxPoints: s.maxPoints,
        feedback: s.feedback || '',
        createdAt: s.createdAt,
        gradedAt: s.gradedAt || null,
        // The student's answer to EVERY question, in the same order as
        // challenge.questions — raw (for rendering) and as readable text.
        answers: flat.map((q) => {
          const raw = (s.answers || {})[q.id];
          const result = (s.results || []).find((r) => r.questionId === q.id) || {};
          const manual = (s.manual || []).find((m) => m.questionId === q.id);
          return {
            questionId: q.id,
            raw: raw === undefined ? null : raw,
            text: ch.answerText(q, raw),
            answered: raw !== undefined && raw !== null && raw !== '',
            auto: !!result.auto,
            correct: result.correct === undefined ? null : result.correct,
            earned: manual && manual.awarded == null ? null : (result.earned || 0),
            max: result.max || 0,
            awarded: manual ? manual.awarded : null,
            needsMark: !!manual,
          };
        }),
      };
    }),
  });
});

/** POST /api/teacher/challenges/responses/:sid/grade — award the manual parts. */
teacherRouter.post('/responses/:sid/grade', (req, res) => {
  const sub = db.findById('challengeSubmissions', req.params.sid);
  if (!sub) return res.status(404).json({ error: 'Response not found.' });

  const scores = (req.body && req.body.scores) || {};
  let manualPoints = 0;
  (sub.manual || []).forEach((m) => {
    const max = m.points || 0;
    let v = Math.round(Number(scores[m.questionId]));
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (v > max) v = max;
    m.awarded = v;
    manualPoints += v;
    const r = (sub.results || []).find((x) => x.questionId === m.questionId);
    if (r) r.earned = v;
  });

  sub.earned = (sub.autoEarned || 0) + manualPoints;
  sub.feedback = ((req.body && req.body.feedback) || '').toString().trim().slice(0, 2000);
  sub.status = 'graded';
  sub.gradedAt = new Date().toISOString();
  db.save();

  res.json({ ok: true, earned: sub.earned, maxPoints: sub.maxPoints });
});

module.exports = { studentRouter, teacherRouter };
