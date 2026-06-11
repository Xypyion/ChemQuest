const express = require('express');
const db = require('../db');
const game = require('../game');
const { authMiddleware, requireRole, publicUser } = require('../auth');

const router = express.Router();

// Every route here requires a logged-in student.
router.use(authMiddleware, requireRole('student'));

function orderedLessons() {
  return db
    .all('lessons')
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Pick the question set for a difficulty, falling back if it's empty. */
function quizFor(lesson, difficulty) {
  const q = lesson.quizzes || {};
  const order = [difficulty, 'medium', 'easy', 'hard'];
  for (const key of order) {
    if (Array.isArray(q[key]) && q[key].length) return q[key];
  }
  return [];
}

/** Pick the post-test question set for a difficulty, falling back if empty. */
function postQuizFor(lesson, difficulty) {
  const q = (lesson.postTest && lesson.postTest.quizzes) || {};
  const order = [difficulty, 'medium', 'easy', 'hard'];
  for (const key of order) {
    if (Array.isArray(q[key]) && q[key].length) return q[key];
  }
  return [];
}

/** Small summary of the post-test for the level board. */
function postTestSummary(lesson, user) {
  const p = ((user.progress || {})[lesson.id] || {}).post || {};
  return {
    open: !!(lesson.postTest && lesson.postTest.open),
    questionCount: postQuizFor(lesson, user.difficulty).length,
    timeLimit: (lesson.postTest && lesson.postTest.timeLimit) || 0,
    done: !!p.attempts,
    bestScore: p.bestScore || 0,
    passed: !!p.passed,
  };
}

/** Build the ordered storyboard steps (lines + inline videos) for a learner. */
function buildSteps(lesson) {
  const steps = (lesson.storyboard || []).map((it) =>
    it.type === 'video'
      ? { type: 'video', url: it.url, title: it.title }
      : { type: 'line', character: it.character || 'Ruby', mood: it.mood || 'happy', text: it.text || '', image: it.image || null }
  );
  // Legacy lessons kept videos in a separate `media` array — append them at the end.
  if (!steps.some((s) => s.type === 'video') && Array.isArray(lesson.media)) {
    lesson.media.forEach((m) => steps.push({ type: 'video', url: m.url, title: m.title }));
  }
  return steps;
}

/** Strip answers so a student can't peek at the correct choice. */
function sanitizeQuestion(q, i) {
  return {
    index: i,
    id: q.id,
    question: q.question,
    image: q.image || null,
    choices: q.choices || [],
  };
}

/** GET /api/lessons — the adventure map: every level + this student's progress. */
router.get('/', (req, res) => {
  const lessons = orderedLessons();
  const progress = req.user.progress || {};
  let previousCompleted = true; // first level is always unlocked

  const list = lessons.map((lesson) => {
    const p = progress[lesson.id] || {};
    const completed = !!p.passed;
    const locked = !previousCompleted;
    const item = {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      terrain: lesson.terrain,
      icon: lesson.icon,
      order: lesson.order,
      questionCount: quizFor(lesson, req.user.difficulty).length,
      storyboardCount: (lesson.storyboard || []).filter((s) => s.type !== 'video').length,
      hasVideo: (lesson.storyboard || []).some((s) => s.type === 'video') || (lesson.media || []).length > 0,
      timeLimit: lesson.timeLimit || 0,
      locked,
      completed,
      bestScore: p.bestScore || 0,
      hasCertificate: (req.user.certificates || []).some((c) => c.lessonId === lesson.id),
      postTest: postTestSummary(lesson, req.user),
    };
    previousCompleted = completed;
    return item;
  });

  res.json({
    difficulty: req.user.difficulty,
    points: req.user.points || 0,
    lessons: list,
  });
});

/** GET /api/lessons/:id — full content to play a level (answers hidden). */
router.get('/:id', (req, res) => {
  const lessons = orderedLessons();
  const idx = lessons.findIndex((l) => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'That level does not exist.' });

  // Locked unless the previous level (by order) has been completed.
  const progress = req.user.progress || {};
  if (idx > 0) {
    const prev = lessons[idx - 1];
    if (!progress[prev.id] || !progress[prev.id].passed) {
      return res.status(403).json({ error: 'Finish the previous level to unlock this one!' });
    }
  }

  const lesson = lessons[idx];
  const questions = quizFor(lesson, req.user.difficulty);
  res.json({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      terrain: lesson.terrain,
      icon: lesson.icon,
      timeLimit: lesson.timeLimit || 0,
      storyboard: buildSteps(lesson),
      difficulty: req.user.difficulty,
      questions: questions.map(sanitizeQuestion),
      postTest: postTestSummary(lesson, req.user),
      preDone: !!((req.user.progress || {})[lesson.id] || {}).passed,
      preBestScore: (((req.user.progress || {})[lesson.id]) || {}).bestScore || 0,
    },
  });
});

/* ------------------------------ POST-TEST ------------------------------ */

/** Find a lesson and make sure its post-test is open for students. */
function openPostTest(req, res) {
  const lesson = db.findById('lessons', req.params.id);
  if (!lesson) { res.status(404).json({ error: 'That level does not exist.' }); return null; }
  if (!lesson.postTest || !lesson.postTest.open) {
    res.status(403).json({ error: 'The post-test is not open yet. Your teacher will unlock it!' });
    return null;
  }
  return lesson;
}

/** GET /api/lessons/:id/posttest — the post-test questions (answers hidden). */
router.get('/:id/posttest', (req, res) => {
  const lesson = openPostTest(req, res);
  if (!lesson) return;
  const questions = postQuizFor(lesson, req.user.difficulty);
  res.json({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      icon: lesson.icon,
      difficulty: req.user.difficulty,
      timeLimit: (lesson.postTest && lesson.postTest.timeLimit) || 0,
      questions: questions.map(sanitizeQuestion),
    },
  });
});

/** POST /api/lessons/:id/posttest/check — instant feedback for one question. */
router.post('/:id/posttest/check', (req, res) => {
  const lesson = openPostTest(req, res);
  if (!lesson) return;
  const questions = postQuizFor(lesson, req.user.difficulty);
  const { questionIndex, answer } = req.body || {};
  const q = questions[questionIndex];
  if (!q) return res.status(400).json({ error: 'Unknown question.' });
  res.json({
    correct: Number(answer) === q.correctIndex,
    correctIndex: q.correctIndex,
    explanation: q.explanation || '',
  });
});

/** POST /api/lessons/:id/posttest/complete — grade the post-test. */
router.post('/:id/posttest/complete', (req, res) => {
  const lesson = openPostTest(req, res);
  if (!lesson) return;
  const questions = postQuizFor(lesson, req.user.difficulty);
  const answers = Array.isArray(req.body && req.body.answers) ? req.body.answers : [];
  const total = questions.length;

  let correct = 0;
  questions.forEach((q, i) => { if (Number(answers[i]) === q.correctIndex) correct += 1; });

  const passed = total === 0 ? true : game.isPass(correct, total);
  const score = game.computeScore({ correct, total, difficulty: req.user.difficulty });

  const progress = (req.user.progress = req.user.progress || {});
  const entry = (progress[lesson.id] = progress[lesson.id] || { attempts: 0, bestScore: 0 });
  const prior = entry.post || { attempts: 0, bestScore: 0 };
  entry.post = {
    attempts: (prior.attempts || 0) + 1,
    lastScore: score,
    bestScore: Math.max(prior.bestScore || 0, score),
    bestCorrect: Math.max(prior.bestCorrect || 0, correct),
    total,
    passed: prior.passed || passed,
    completedAt: prior.completedAt || new Date().toISOString(),
  };

  game.recalcPoints(req.user);
  db.save();

  res.json({
    passed,
    correct,
    total,
    score,
    bestScore: entry.post.bestScore,
    pointsTotal: req.user.points,
    user: publicUser(req.user),
  });
});

/** POST /api/lessons/:id/check — instant feedback for one question. */
router.post('/:id/check', (req, res) => {
  const lesson = db.findById('lessons', req.params.id);
  if (!lesson) return res.status(404).json({ error: 'That level does not exist.' });
  const questions = quizFor(lesson, req.user.difficulty);
  const { questionIndex, answer } = req.body || {};
  const q = questions[questionIndex];
  if (!q) return res.status(400).json({ error: 'Unknown question.' });
  res.json({
    correct: Number(answer) === q.correctIndex,
    correctIndex: q.correctIndex,
    explanation: q.explanation || '',
  });
});

/** POST /api/lessons/:id/complete — grade the whole quiz and award points/cert. */
router.post('/:id/complete', (req, res) => {
  const lessons = orderedLessons();
  const idx = lessons.findIndex((l) => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'That level does not exist.' });
  const lesson = lessons[idx];

  // Re-check the unlock rule on the server.
  const progress = (req.user.progress = req.user.progress || {});
  if (idx > 0) {
    const prev = lessons[idx - 1];
    if (!progress[prev.id] || !progress[prev.id].passed) {
      return res.status(403).json({ error: 'This level is still locked.' });
    }
  }

  const questions = quizFor(lesson, req.user.difficulty);
  const answers = Array.isArray(req.body && req.body.answers) ? req.body.answers : [];
  const total = questions.length;

  let correct = 0;
  const results = questions.map((q, i) => {
    const chosen = Number(answers[i]);
    const ok = chosen === q.correctIndex;
    if (ok) correct += 1;
    return {
      index: i,
      question: q.question,
      chosen: Number.isInteger(chosen) ? chosen : null,
      correctIndex: q.correctIndex,
      correct: ok,
      explanation: q.explanation || '',
    };
  });

  // No-quiz levels (pure storyboard/video) count as completion credit.
  const passed = total === 0 ? true : game.isPass(correct, total);
  const score =
    total === 0
      ? Math.round(0.8 * game.MAX_LESSON_POINTS * game.multiplierFor(req.user.difficulty))
      : game.computeScore({ correct, total, difficulty: req.user.difficulty });

  const prior = progress[lesson.id] || { attempts: 0, bestScore: 0 };
  const bestScore = Math.max(prior.bestScore || 0, score);
  progress[lesson.id] = {
    attempts: (prior.attempts || 0) + 1,
    lastScore: score,
    bestScore,
    bestCorrect: Math.max(prior.bestCorrect || 0, correct),
    total,
    passed: prior.passed || passed,
    completedAt: prior.completedAt || (passed ? new Date().toISOString() : null),
  };

  // Award a certificate the first time they pass.
  let certificate = (req.user.certificates || []).find((c) => c.lessonId === lesson.id);
  let newCertificate = false;
  if (passed && !certificate) {
    certificate = {
      id: `${req.user.id}-${lesson.id}`,
      lessonId: lesson.id,
      title: lesson.title,
      icon: lesson.icon || '🧪',
      score: bestScore,
      difficulty: req.user.difficulty,
      dateEarned: new Date().toISOString(),
    };
    req.user.certificates = req.user.certificates || [];
    req.user.certificates.push(certificate);
    newCertificate = true;
  }

  game.recalcPoints(req.user);
  db.save();

  res.json({
    passed,
    correct,
    total,
    score,
    bestScore,
    pointsTotal: req.user.points,
    results,
    certificate: passed ? certificate : null,
    newCertificate,
    user: publicUser(req.user),
  });
});

/** GET /api/lessons/me/certificates — this student's earned certificates. */
router.get('/me/certificates', (req, res) => {
  res.json({ certificates: req.user.certificates || [] });
});

module.exports = router;
