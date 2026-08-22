const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const game = require('../game');
const { finalizeAttempt } = require('../grading');
const challengeLib = require('../challenges');
const { authMiddleware, requireRole, publicUser, hashPassword } = require('../auth');

const router = express.Router();

// Everything here is teacher-only.
router.use(authMiddleware, requireRole('teacher'));

const TERRAINS = ['plain', 'mountain', 'snow'];

function normalizeQuestion(q) {
  q = q || {};
  const type = q.type === 'written' ? 'written' : 'mcq';
  // Per-question points (default 1). Correct MCQ earns the full points; a
  // written answer is graded 0..points by the teacher.
  let points = parseInt(q.points, 10);
  if (!Number.isFinite(points) || points < 1) points = 1;
  const base = {
    id: q.id || crypto.randomUUID(),
    type,
    question: (q.question || '').toString().trim(),
    points: Math.min(points, 100),
    explanation: (q.explanation || '').toString().trim(),
  };
  // Written (ข้อเขียน) questions have no choices — the student types a free
  // answer that the teacher grades by hand later. Multiple-choice questions
  // keep their choices + correct answer index.
  if (type === 'written') return base;
  let correctIndex = Number(q.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0) correctIndex = 0;
  base.choices = (Array.isArray(q.choices) ? q.choices : []).map((c) => (c == null ? '' : c.toString()));
  base.correctIndex = correctIndex;
  return base;
}

/** A question is keepable if it has text and (for MCQ) at least two choices. */
function isUsableQuestion(q) {
  if (!q.question) return false;
  return q.type === 'written' ? true : (q.choices || []).length >= 2;
}

// Cap inline (data-URL) storyboard images so the JSON store stays reasonable.
const MAX_IMAGE_CHARS = 800 * 1024; // ~800KB of base64

/** Ordered storyboard: a mix of spoken "line" steps and "video" steps. */
function normalizeStoryboard(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((it) => {
      it = it || {};
      if (it.type === 'video') {
        return { type: 'video', url: (it.url || '').toString().trim(), title: (it.title || '').toString().trim() };
      }
      let image = (it.image || '').toString();
      if (image.length > MAX_IMAGE_CHARS) image = ''; // drop oversized uploads
      return {
        type: 'line',
        character: (it.character || 'Kru CJ').toString().trim() || 'Kru CJ',
        mood: (it.mood || 'happy').toString(),
        text: (it.text || '').toString(),
        image,
      };
    })
    .filter((it) => (it.type === 'video' ? it.url : it.text.trim() || it.image));
}

function normalizeLesson(body, existing) {
  const lesson = existing || { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  lesson.title = (body.title || '').toString().trim() || 'Untitled Level';
  lesson.description = (body.description || '').toString().trim();
  lesson.terrain = TERRAINS.includes(body.terrain) ? body.terrain : 'plain';
  lesson.icon = (body.icon || '🧪').toString().trim() || '🧪';

  lesson.storyboard = normalizeStoryboard(body.storyboard);

  // Which of the two level activities comes first for the student: the
  // storyboard, or the pre-test? (The second one stays locked until the first
  // is finished — see game.activityState.)
  lesson.flow = game.FLOWS.includes(body.flow) ? body.flow : 'story-first';

  // Per-lesson quiz timer (seconds). 0 = no timer. Capped at 1 hour.
  let timeLimit = parseInt(body.timeLimit, 10);
  if (!Number.isFinite(timeLimit) || timeLimit < 0) timeLimit = 0;
  lesson.timeLimit = Math.min(timeLimit, 3600);

  const qz = body.quizzes || {};
  lesson.quizzes = {
    easy: (qz.easy || []).map(normalizeQuestion).filter(isUsableQuestion),
    medium: (qz.medium || []).map(normalizeQuestion).filter(isUsableQuestion),
    hard: (qz.hard || []).map(normalizeQuestion).filter(isUsableQuestion),
  };

  // Post-test: built separately from the pre-test, locked until the teacher
  // opens it. Keep the current open/closed state when re-saving the lesson.
  const pt = body.postTest || {};
  const ptq = pt.quizzes || {};
  let ptTime = parseInt(pt.timeLimit, 10);
  if (!Number.isFinite(ptTime) || ptTime < 0) ptTime = 0;
  lesson.postTest = {
    open: !!(lesson.postTest && lesson.postTest.open),
    timeLimit: Math.min(ptTime, 3600),
    quizzes: {
      easy: (ptq.easy || []).map(normalizeQuestion).filter(isUsableQuestion),
      medium: (ptq.medium || []).map(normalizeQuestion).filter(isUsableQuestion),
      hard: (ptq.hard || []).map(normalizeQuestion).filter(isUsableQuestion),
    },
  };

  // Per-level access gate (managed via its own endpoint; default to auto).
  if (!lesson.gate) lesson.gate = { mode: 'auto', openAt: null };
  // Peer/teacher rating criteria (managed via its own endpoint; preserve).
  if (!Array.isArray(lesson.ratingCriteria)) lesson.ratingCriteria = [];

  lesson.updatedAt = new Date().toISOString();
  return lesson;
}

function nextOrder() {
  const lessons = db.all('lessons');
  return lessons.reduce((max, l) => Math.max(max, l.order || 0), 0) + 1;
}

/* ----------------------------- Lessons CRUD ----------------------------- */

router.get('/lessons', (req, res) => {
  const lessons = db.all('lessons').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({ lessons });
});

router.get('/lessons/:id', (req, res) => {
  const lesson = db.findById('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Level not found.' });
  res.json({ lesson });
});

router.post('/lessons', (req, res) => {
  const lesson = normalizeLesson(req.body || {}, null);
  lesson.order = Number.isFinite(req.body && req.body.order) ? req.body.order : nextOrder();
  db.insert('lessons', lesson);
  res.status(201).json({ lesson });
});

router.put('/lessons/:id', (req, res) => {
  const existing = db.findById('lessons', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Level not found.' });
  normalizeLesson(req.body || {}, existing);
  if (Number.isFinite(req.body && req.body.order)) existing.order = req.body.order;
  db.save();
  res.json({ lesson: existing });
});

router.delete('/lessons/:id', (req, res) => {
  const ok = db.remove('lessons', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Level not found.' });
  res.json({ ok: true });
});

/** Move a level earlier/later in the adventure by swapping order with a neighbour. */
router.post('/lessons/:id/move', (req, res) => {
  const dir = (req.body && req.body.direction) === 'up' ? -1 : 1;
  const lessons = db.all('lessons').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const i = lessons.findIndex((l) => l.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Level not found.' });
  const j = i + dir;
  if (j < 0 || j >= lessons.length) return res.json({ ok: true }); // already at the edge
  const a = lessons[i];
  const b = lessons[j];
  const tmp = a.order;
  a.order = b.order;
  b.order = tmp;
  db.save();
  res.json({ ok: true });
});

/** Set a level's access gate: auto (normal progression), locked, or scheduled. */
router.post('/lessons/:id/gate', (req, res) => {
  const lesson = db.findById('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Level not found.' });
  const body = req.body || {};
  const mode = ['auto', 'locked', 'scheduled'].includes(body.mode) ? body.mode : 'auto';
  let openAt = null;
  if (mode === 'scheduled') {
    const ts = Date.parse(body.openAt);
    if (Number.isNaN(ts)) return res.status(400).json({ error: 'Please pick a valid date & time.' });
    openAt = new Date(ts).toISOString();
  }
  lesson.gate = { mode, openAt };
  db.save();
  res.json({ ok: true, gate: lesson.gate });
});

/** Set the peer/teacher rating criteria for a level's student works. */
router.post('/lessons/:id/criteria', (req, res) => {
  const lesson = db.findById('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Level not found.' });
  const arr = Array.isArray(req.body && req.body.criteria) ? req.body.criteria : [];
  lesson.ratingCriteria = arr
    .map((c) => ({ id: (c && c.id) || crypto.randomUUID(), label: ((c && c.label) || '').toString().trim().slice(0, 80) }))
    .filter((c) => c.label)
    .slice(0, 8); // keep the rubric focused
  db.save();
  res.json({ ok: true, criteria: lesson.ratingCriteria });
});

/** Open or close the post-test for every student on this level. */
router.post('/lessons/:id/posttest-open', (req, res) => {
  const lesson = db.findById('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Level not found.' });
  lesson.postTest = lesson.postTest || { open: false, timeLimit: 0, quizzes: { easy: [], medium: [], hard: [] } };
  lesson.postTest.open = !!(req.body && req.body.open);
  db.save();
  res.json({ ok: true, open: lesson.postTest.open });
});

/* --------------------------- Student management -------------------------- */

function studentSummary(u) {
  const progress = u.progress || {};
  const completed = Object.values(progress).filter((p) => p.passed).length;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    difficulty: u.difficulty,
    points: u.points || 0,
    earnedPoints: u.earnedPoints || 0,
    bonusPoints: u.bonusPoints || 0,
    certificates: (u.certificates || []).length,
    levelsCompleted: completed,
    avatar: u.avatar || '🧑‍🎓',
    createdAt: u.createdAt,
  };
}

router.get('/students', (req, res) => {
  const students = db
    .filter('users', (u) => u.role === 'student')
    .map(studentSummary)
    .sort((a, b) => b.points - a.points);
  res.json({ students });
});

router.put('/students/:id', (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user || user.role !== 'student') return res.status(404).json({ error: 'Student not found.' });

  const body = req.body || {};
  if (typeof body.name === 'string' && body.name.trim()) user.name = body.name.trim();
  if (['easy', 'medium', 'hard'].includes(body.difficulty)) user.difficulty = body.difficulty;

  // "Update ranking" — set an absolute point total via a bonus adjustment.
  if (body.points !== undefined && body.points !== null && !Number.isNaN(Number(body.points))) {
    const target = Math.max(0, Math.round(Number(body.points)));
    user.bonusPoints = target - (user.earnedPoints || 0);
  }
  game.recalcPoints(user);
  db.save();
  res.json({ student: studentSummary(user) });
});

/** Reset a student's password (teacher sets a fresh one for them). */
router.post('/students/:id/password', (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user || user.role !== 'student') return res.status(404).json({ error: 'Student not found.' });
  const password = ((req.body || {}).password || '').toString();
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  user.passwordHash = hashPassword(password);
  db.save();
  res.json({ ok: true });
});

router.delete('/students/:id', (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user || user.role !== 'student') return res.status(404).json({ error: 'Student not found.' });
  db.remove('users', req.params.id);
  res.json({ ok: true });
});

/* ------------------------------ Gradebook -------------------------------- */
/* A spreadsheet-style gradebook. Columns are grade items the teacher defines
   (e.g. "L1 Assignment", "L1 Post-test", "Midterm"); each student's score per
   column is stored on the user as `grades[columnId]`. Fully manual, so it never
   interferes with the auto-graded tests — the teacher has full control. */

function gradebookColumns() {
  return db.all('gradebook').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}
function gradebookRows() {
  return db
    .filter('users', (u) => u.role === 'student')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || '🧑‍🎓', difficulty: u.difficulty, grades: u.grades || {} }));
}

router.get('/gradebook', (req, res) => {
  res.json({ columns: gradebookColumns(), rows: gradebookRows() });
});

/** Bulk-save the column list (add / rename / reorder / delete / set max). */
router.post('/gradebook/columns', (req, res) => {
  const arr = Array.isArray(req.body && req.body.columns) ? req.body.columns : [];
  const cols = arr.slice(0, 40).map((c, i) => {
    let max = Number(c && c.max);
    if (!Number.isFinite(max) || max < 1) max = 100;
    return {
      id: (c && c.id) || crypto.randomUUID(),
      name: ((c && c.name) || '').toString().trim().slice(0, 60) || 'Untitled',
      max: Math.min(Math.round(max), 100000),
      order: i,
    };
  });
  const keep = new Set(cols.map((c) => c.id));
  // Drop scores that belonged to removed columns.
  db.filter('users', (u) => u.role === 'student').forEach((u) => {
    if (u.grades) Object.keys(u.grades).forEach((cid) => { if (!keep.has(cid)) delete u.grades[cid]; });
  });
  const live = db.all('gradebook');
  live.length = 0;
  cols.forEach((c) => live.push(c));
  db.save();
  res.json({ columns: gradebookColumns() });
});

/** Set (or clear) one student's score for one column. */
router.post('/gradebook/score', (req, res) => {
  const body = req.body || {};
  const col = db.findById('gradebook', body.columnId);
  if (!col) return res.status(404).json({ error: 'Grade column not found.' });
  const user = db.findById('users', body.studentId);
  if (!user || user.role !== 'student') return res.status(404).json({ error: 'Student not found.' });
  user.grades = user.grades || {};
  if (body.score === '' || body.score === null || body.score === undefined) {
    delete user.grades[body.columnId];
  } else {
    let v = Number(body.score);
    if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'Score must be 0 or more.' });
    user.grades[body.columnId] = Math.min(Math.round(v * 100) / 100, 100000);
  }
  db.save();
  res.json({ ok: true, score: user.grades[body.columnId] == null ? null : user.grades[body.columnId] });
});

/** Create a column pre-filled from a level's pre-test or post-test best scores,
 *  or from the points students earned on one challenge. */
router.post('/gradebook/import', (req, res) => {
  const body = req.body || {};

  // Challenge import: one column holding each student's earned challenge points.
  if (body.challengeId) {
    const challenge = db.findById('challenges', body.challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });
    const col = {
      id: crypto.randomUUID(),
      name: `${challenge.icon || '🧩'} ${challenge.title}`.trim().slice(0, 60),
      max: Math.max(1, challengeLib.maxPoints(challenge)),
      order: db.all('gradebook').length,
    };
    db.insert('gradebook', col);
    db.filter('users', (u) => u.role === 'student').forEach((u) => {
      const sub = db.find('challengeSubmissions', (s) => s.challengeId === challenge.id && s.userId === u.id);
      if (!sub) return; // never handed it in — leave the cell empty for the teacher
      u.grades = u.grades || {};
      u.grades[col.id] = sub.status === 'graded' ? (sub.earned || 0) : (sub.autoEarned || 0);
    });
    db.save();
    return res.json({ columns: gradebookColumns(), rows: gradebookRows() });
  }

  const lesson = db.findById('lessons', body.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Level not found.' });
  const src = body.source === 'pre' ? 'pre' : 'post';
  const col = {
    id: crypto.randomUUID(),
    name: `${lesson.icon || ''} ${lesson.title} — ${src === 'pre' ? 'Pre-test' : 'Post-test'}`.trim().slice(0, 60),
    max: 100,
    order: db.all('gradebook').length,
  };
  db.insert('gradebook', col);
  db.filter('users', (u) => u.role === 'student').forEach((u) => {
    const p = (u.progress || {})[lesson.id] || {};
    const score = src === 'pre' ? (p.bestScore || 0) : ((p.post && p.post.bestScore) || 0);
    u.grades = u.grades || {};
    u.grades[col.id] = score;
  });
  db.save();
  res.json({ columns: gradebookColumns(), rows: gradebookRows() });
});

/* ------------------------- Written-answer grading ------------------------ */

/** Public shape of a pending submission for the grading queue. */
function submissionView(s) {
  return {
    id: s.id,
    userName: s.userName,
    userAvatar: s.userAvatar || '🧑‍🎓',
    lessonId: s.lessonId,
    lessonTitle: s.lessonTitle,
    lessonIcon: s.lessonIcon || '🧪',
    mode: s.mode,
    difficulty: s.difficulty,
    total: s.total,
    mcqCorrect: s.mcqCorrect,
    mcqTotal: s.mcqTotal,
    mcqPoints: s.mcqPoints || 0,      // points already earned from auto-graded MCQs
    maxPoints: s.maxPoints || 0,      // total points possible on this attempt
    written: (s.written || []).map((w) => ({
      questionId: w.questionId,
      question: w.question,
      guide: w.guide || '',
      answer: w.answer || '',
      points: w.points || 1,          // max points the teacher may award for this answer
    })),
    createdAt: s.createdAt,
  };
}

/** GET /api/teacher/submissions — written answers still waiting to be graded. */
router.get('/submissions', (req, res) => {
  const pending = db
    .filter('submissions', (s) => s.status === 'pending')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) // oldest first
    .map(submissionView);
  res.json({ submissions: pending });
});

/**
 * POST /api/teacher/submissions/:id/grade
 * body: { scores: { [questionId]: number } }
 * The teacher awards each written answer a numeric score (0..question points).
 * That is added to the auto-graded MCQ points and finalises the student's
 * attempt (score, pass/fail, points, certificate) against the total possible.
 */
router.post('/submissions/:id/grade', (req, res) => {
  const sub = db.findById('submissions', req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (sub.status === 'graded') return res.status(400).json({ error: 'This submission was already graded.' });

  const scores = (req.body && req.body.scores) || {};
  let writtenPoints = 0;
  (sub.written || []).forEach((w) => {
    const max = w.points || 1;
    let v = Math.round(Number(scores[w.questionId]));
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (v > max) v = max;
    w.awarded = v;
    writtenPoints += v;
  });

  const user = db.findById('users', sub.userId);
  const lesson = db.findById('lessons', sub.lessonId);
  if (!user || lesson === undefined || !lesson) {
    // Student or level was deleted — just close the submission out.
    sub.status = 'graded';
    sub.gradedAt = new Date().toISOString();
    db.save();
    return res.json({ ok: true, finalized: false });
  }

  const earned = (sub.mcqPoints || 0) + writtenPoints;
  const max = sub.maxPoints || 0;
  const result = finalizeAttempt(user, lesson, sub.mode, earned, max);

  sub.status = 'graded';
  sub.gradedAt = new Date().toISOString();
  sub.writtenPoints = writtenPoints;
  sub.finalEarned = earned;
  sub.score = result.score;
  sub.passed = result.passed;
  db.save();

  res.json({ ok: true, finalized: true, result });
});

module.exports = router;
