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
const config = require('../config');
const marking = require('../aiMarking');
const aiLimit = require('../aiLimit');
const ai = require('../aiQuestions');   // failureOf/describeFailure: one failure vocabulary
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
    // Checks left today on each rubric-marked question, so the button can say
    // so on a fresh page load instead of only after the first click.
    // sanitizeQuestion sends `canCheck`; the rubric itself never leaves.
    checks: checksFor(c, req.user),
    aiEnabled: config.aiEnabled(),
    maxChecks: marking.MAX_CHECKS,
  });
});

/** `{ questionId: checksLeft }` for every question Kru CJ may look over. */
function checksFor(c, user) {
  const out = {};
  if (!config.aiEnabled()) return out;
  ch.flatQuestions(c).forEach((q) => {
    if (ch.isAiMarkable(q)) out[q.id] = marking.checksLeft(user, q.id);
  });
  return out;
}

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
  db.save();

  res.json({ submission: resultView(c, existing || record) });
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
    // The teacher's own marking guide, and whether Kru CJ marks against it.
    // Teacher-side only — `sanitizeQuestion` never emits either of these.
    rubric: q.rubric || '',
    aiMark: ch.isAiMarkable(q),
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
    aiEnabled: config.aiEnabled(),
    aiReport: c.aiReport || null,
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
        aiDiagnosis: s.aiDiagnosis || null,
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
            // Kru CJ's SUGGESTION, or null. Never a mark: `awarded` stays null
            // until a person confirms it through the grade route below.
            ai: (manual && manual.ai) || null,
          };
        }),
      };
    }),
  });
});

/* ---------------------------- AI marking ----------------------------- *
 *
 * Kru CJ SUGGESTS; the teacher confirms. Nothing in this section ever writes
 * `awarded` or moves a submission to 'graded' — that only happens in the grade
 * route below, when a person clicks. The suggestions land in `manual[].ai`, and
 * the client pre-fills the score boxes with them.
 *
 * One request marks ONE student's paper, not the whole class. That is a
 * deliberate shape: a class set is far too slow for a single request (Vercel
 * kills a function at ~10s — see the note in src/config.js), and marking one
 * paper per call also lets the teacher watch progress instead of a spinner.
 * The client loops.
 * --------------------------------------------------------------------- */

/** Everything in this submission that Kru CJ is allowed to mark. */
function markableItems(c, sub) {
  const byId = new Map(ch.flatQuestions(c).map((q) => [q.id, q]));
  return (sub.manual || [])
    .filter((m) => m.awarded == null)          // never re-mark what a teacher confirmed
    .map((m) => ({ m, q: byId.get(m.questionId) }))
    .filter((x) => x.q && ch.isAiMarkable(x.q))
    .map((x) => ({
      questionId: x.q.id,
      question: x.q.question,
      rubric: x.q.rubric,
      expected: ch.expectedText(x.q),
      points: x.q.points || 0,
      answer: ch.answerText(x.q, (sub.answers || {})[x.q.id]),
      _manual: x.m,
    }));
}

/** POST /api/teacher/challenges/responses/:sid/ai-mark — one student's paper. */
teacherRouter.post('/responses/:sid/ai-mark', async (req, res) => {
  if (!config.aiEnabled()) return res.status(503).json({ error: 'AI_DISABLED' });

  const sub = db.findById('challengeSubmissions', req.params.sid);
  if (!sub) return res.status(404).json({ error: 'Response not found.' });
  const c = db.findById('challenges', sub.challengeId);
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });

  const items = markableItems(c, sub);
  if (!items.length) return res.json({ marked: 0, marks: [], diagnosis: sub.aiDiagnosis || null });

  const lang = (req.body && req.body.lang) === 'th' ? 'th' : 'en';

  // Spend the allowance BEFORE the await — see the note in aiLimit.take().
  try {
    aiLimit.take(req.user, 'mark');
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') {
      return res.status(429).json({ error: 'AI_DAILY_LIMIT', ...aiLimit.statusOf(req.user, 'mark') });
    }
    throw err;
  }
  db.save();

  try {
    const out = await marking.markSubmission({
      challengeTitle: c.title,
      items: items.map(({ _manual, ...rest }) => rest),
      lang,
    });

    const at = new Date().toISOString();
    const byQ = new Map(items.map((it) => [it.questionId, it._manual]));
    let marked = 0;
    out.marks.forEach((mk) => {
      const manual = byQ.get(mk.questionId);
      if (!manual) return;
      // A SUGGESTION. `manual.awarded` is deliberately not touched.
      manual.ai = {
        score: mk.score,
        outOf: mk.outOf,
        feedback: mk.feedback,
        criteria: mk.criteria,
        rubricSilent: mk.rubricSilent,
        at,
      };
      marked++;
    });
    sub.aiDiagnosis = { ...out.diagnosis, at };
    db.save();

    res.json({
      marked,
      marks: out.marks,
      diagnosis: sub.aiDiagnosis,
      status: sub.status,          // still 'pending' — nothing was graded here
      ...aiLimit.statusOf(req.user, 'mark'),
    });
  } catch (err) {
    aiLimit.refund(req.user, 'mark');   // the teacher got nothing
    db.save();
    console.error('[ai/mark]', ai.describeFailure(err));
    const { status, code } = ai.failureOf(err);
    res.status(status).json({ error: code, ...aiLimit.statusOf(req.user, 'mark') });
  }
});

/** POST /api/teacher/challenges/:id/ai-report — what to reteach tomorrow. */
teacherRouter.post('/:id/ai-report', async (req, res) => {
  if (!config.aiEnabled()) return res.status(503).json({ error: 'AI_DISABLED' });

  const c = db.findById('challenges', req.params.id);
  if (!c) return res.status(404).json({ error: 'Challenge not found.' });

  // Report on the written work only. The auto-marked questions already have a
  // score the teacher can read off the responses table; a model adds nothing.
  const questions = ch.flatQuestions(c).filter(ch.isAiMarkable).map((q) => ({
    questionId: q.id,
    question: q.question,
    rubric: q.rubric,
    points: q.points || 0,
  }));
  if (!questions.length) return res.status(400).json({ error: 'NO_RUBRIC_QUESTIONS' });

  const subs = db.filter('challengeSubmissions', (s) => s.challengeId === c.id);
  if (!subs.length) return res.status(400).json({ error: 'NO_SUBMISSIONS' });

  const papers = subs.map((s) => ({
    answers: questions.map((q) => {
      const manual = (s.manual || []).find((m) => m.questionId === q.questionId);
      // The confirmed mark if there is one, else Kru CJ's suggestion, else null.
      const score = manual && manual.awarded != null
        ? manual.awarded
        : (manual && manual.ai ? manual.ai.score : null);
      return {
        questionId: q.questionId,
        answer: (s.answers || {})[q.questionId],
        score,
        outOf: q.points,
      };
    }),
  }));

  const lang = (req.body && req.body.lang) === 'th' ? 'th' : 'en';

  try {
    aiLimit.take(req.user, 'mark');
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') {
      return res.status(429).json({ error: 'AI_DAILY_LIMIT', ...aiLimit.statusOf(req.user, 'mark') });
    }
    throw err;
  }
  db.save();

  try {
    const report = await marking.classReport({ challengeTitle: c.title, questions, papers, lang });
    c.aiReport = { ...report, at: new Date().toISOString(), submissionCount: subs.length, lang };
    db.save();
    res.json({ report: c.aiReport, ...aiLimit.statusOf(req.user, 'mark') });
  } catch (err) {
    aiLimit.refund(req.user, 'mark');
    db.save();
    console.error('[ai/report]', ai.describeFailure(err));
    const { status, code } = ai.failureOf(err);
    res.status(status).json({ error: code, ...aiLimit.statusOf(req.user, 'mark') });
  }
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
