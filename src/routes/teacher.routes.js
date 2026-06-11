const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const game = require('../game');
const { authMiddleware, requireRole, publicUser, hashPassword } = require('../auth');

const router = express.Router();

// Everything here is teacher-only.
router.use(authMiddleware, requireRole('teacher'));

const TERRAINS = ['plain', 'mountain', 'snow'];

function normalizeQuestion(q) {
  q = q || {};
  let correctIndex = Number(q.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0) correctIndex = 0;
  return {
    id: q.id || crypto.randomUUID(),
    question: (q.question || '').toString().trim(),
    choices: (Array.isArray(q.choices) ? q.choices : []).map((c) => (c == null ? '' : c.toString())),
    correctIndex,
    explanation: (q.explanation || '').toString().trim(),
  };
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
        character: (it.character || 'Ruby').toString().trim() || 'Ruby',
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

  // Per-lesson quiz timer (seconds). 0 = no timer. Capped at 1 hour.
  let timeLimit = parseInt(body.timeLimit, 10);
  if (!Number.isFinite(timeLimit) || timeLimit < 0) timeLimit = 0;
  lesson.timeLimit = Math.min(timeLimit, 3600);

  const qz = body.quizzes || {};
  lesson.quizzes = {
    easy: (qz.easy || []).map(normalizeQuestion).filter((q) => q.question && q.choices.length >= 2),
    medium: (qz.medium || []).map(normalizeQuestion).filter((q) => q.question && q.choices.length >= 2),
    hard: (qz.hard || []).map(normalizeQuestion).filter((q) => q.question && q.choices.length >= 2),
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
      easy: (ptq.easy || []).map(normalizeQuestion).filter((q) => q.question && q.choices.length >= 2),
      medium: (ptq.medium || []).map(normalizeQuestion).filter((q) => q.question && q.choices.length >= 2),
      hard: (ptq.hard || []).map(normalizeQuestion).filter((q) => q.question && q.choices.length >= 2),
    },
  };

  // Per-level access gate (managed via its own endpoint; default to auto).
  if (!lesson.gate) lesson.gate = { mode: 'auto', openAt: null };

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

module.exports = router;
