const express = require('express');
const crypto = require('crypto');
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

/**
 * Decide whether a level is unlocked for this user, and if not, why.
 * A level is open only when BOTH hold:
 *   1. the teacher's access gate is open (auto / scheduled-time-reached), and
 *   2. progression is satisfied (first level, or the PREVIOUS level is fully
 *      done — which means its post-test passed when it has one).
 * reason ∈ 'teacher' | 'scheduled' | 'posttest' | 'progress'
 */
function unlockInfo(lessons, idx, user) {
  const lesson = lessons[idx];
  const g = lesson.gate || { mode: 'auto', openAt: null };
  if (!game.gateOpen(lesson)) {
    return { locked: true, reason: g.mode === 'scheduled' ? 'scheduled' : 'teacher', opensAt: g.openAt || null };
  }
  if (idx === 0) return { locked: false };
  const prev = lessons[idx - 1];
  if (!game.levelDone(prev, (user.progress || {})[prev.id])) {
    return { locked: true, reason: game.hasPostTest(prev) ? 'posttest' : 'progress' };
  }
  return { locked: false };
}

/** Human-readable lock reason for API errors (the client also localises by reason). */
function lockMessage(gate) {
  switch (gate.reason) {
    case 'teacher': return 'Your teacher has locked this level for now.';
    case 'scheduled': return gate.opensAt
      ? 'This level opens at ' + new Date(gate.opensAt).toLocaleString() + '.'
      : 'Your teacher will open this level soon.';
    case 'posttest': return 'Pass the previous level’s post-test to unlock this one!';
    default: return 'Finish the previous level to unlock this one!';
  }
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
    awaitingGrading: !!p.awaitingGrading,
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
  const type = q.type === 'written' ? 'written' : 'mcq';
  const base = {
    index: i,
    id: q.id,
    type,
    question: q.question,
    points: q.points || 1,
    image: q.image || null,
  };
  // Written questions have no choices — the student types a free answer.
  if (type === 'mcq') base.choices = q.choices || [];
  return base;
}

/** Count of written (teacher-graded) questions in a set. */
function writtenCount(questions) {
  return questions.filter((q) => q.type === 'written').length;
}

/** Total points possible for a question set (each question defaults to 1). */
function sumPoints(questions) {
  return questions.reduce((s, q) => s + (q.points || 1), 0);
}

/**
 * Build a pending submission from a graded attempt that contains written
 * questions: auto-grade the MCQ part, stash the student's written answers for
 * the teacher, and mark the progress entry as awaiting grading (without
 * finalising score / points / certificate — that happens once graded).
 * Returns the JSON payload to send back to the student.
 */
function submitForGrading(user, lesson, mode, questions, answers) {
  const total = questions.length;
  const maxPoints = sumPoints(questions);
  let mcqCorrect = 0;
  let mcqTotal = 0;
  let mcqPoints = 0; // points auto-earned from correct MCQs
  const written = [];

  questions.forEach((q, i) => {
    if (q.type === 'written') {
      written.push({
        questionId: q.id,
        index: i,
        question: q.question,
        points: q.points || 1, // max the teacher may award
        guide: q.explanation || '',
        answer: (answers[i] == null ? '' : String(answers[i])).slice(0, 4000),
        awarded: null,
      });
    } else {
      mcqTotal += 1;
      if (Number(answers[i]) === q.correctIndex) { mcqCorrect += 1; mcqPoints += (q.points || 1); }
    }
  });

  const submission = db.insert('submissions', {
    id: crypto.randomUUID(),
    userId: user.id,
    userName: user.name,
    userAvatar: user.avatar || '🧑‍🎓',
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonIcon: lesson.icon || '🧪',
    mode,
    difficulty: user.difficulty,
    total,
    mcqCorrect,
    mcqTotal,
    mcqPoints,
    maxPoints,
    written,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  // Record that an attempt happened and is awaiting grading, without changing
  // pass/score (those stay as any previous best until the teacher grades).
  const progress = (user.progress = user.progress || {});
  if (mode === 'post') {
    const entry = (progress[lesson.id] = progress[lesson.id] || { attempts: 0, bestScore: 0 });
    const prior = entry.post || { attempts: 0, bestScore: 0 };
    entry.post = { ...prior, attempts: (prior.attempts || 0) + 1, awaitingGrading: true, pendingSubmissionId: submission.id };
  } else {
    const prior = progress[lesson.id] || { attempts: 0, bestScore: 0 };
    progress[lesson.id] = { ...prior, attempts: (prior.attempts || 0) + 1, awaitingGrading: true, pendingSubmissionId: submission.id };
  }
  db.save();

  return {
    pending: true,
    mode,
    mcqCorrect,
    mcqTotal,
    writtenPending: written.length,
    total,
    pointsTotal: user.points || 0,
    user: publicUser(user),
  };
}

/** GET /api/lessons — the adventure map: every level + this student's progress. */
router.get('/', (req, res) => {
  const lessons = orderedLessons();
  const progress = req.user.progress || {};

  const list = lessons.map((lesson, i) => {
    const p = progress[lesson.id] || {};
    const completed = game.levelDone(lesson, p); // post-test passed when one exists
    const unlock = unlockInfo(lessons, i, req.user);
    return {
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
      locked: unlock.locked,
      lockReason: unlock.locked ? unlock.reason : null,
      opensAt: unlock.opensAt || null,
      completed,
      preDone: !!p.passed,
      awaitingGrading: !!p.awaitingGrading,
      bestScore: p.bestScore || 0,
      hasCertificate: (req.user.certificates || []).some((c) => c.lessonId === lesson.id),
      postTest: postTestSummary(lesson, req.user),
    };
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

  const gate = unlockInfo(lessons, idx, req.user);
  if (gate.locked) return res.status(403).json({ error: lockMessage(gate) });

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

/** Find a lesson and make sure it is unlocked AND its post-test is open. */
function openPostTest(req, res) {
  const lessons = orderedLessons();
  const idx = lessons.findIndex((l) => l.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'That level does not exist.' }); return null; }
  const gate = unlockInfo(lessons, idx, req.user);
  if (gate.locked) { res.status(403).json({ error: lockMessage(gate) }); return null; }
  const lesson = lessons[idx];
  if (!lesson.postTest || !lesson.postTest.open) {
    res.status(403).json({ error: 'The post-test is not open yet. Your teacher will unlock it!' });
    return null;
  }
  // One attempt only — once a student has submitted the post-test they cannot
  // retake or re-open it. (Guards GET, per-question check, and complete.)
  const p = ((req.user.progress || {})[lesson.id] || {}).post;
  if (p && (p.attempts || 0) >= 1) {
    res.status(403).json({ error: 'ALREADY_SUBMITTED' });
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
  if (q.type === 'written') return res.json({ written: true }); // graded later by the teacher
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

  // Any written answers? Hand the whole attempt off for teacher grading.
  if (writtenCount(questions)) {
    return res.json(submitForGrading(req.user, lesson, 'post', questions, answers));
  }

  // Points-based: a correct MCQ earns its own points; score is earned / total.
  let earned = 0;
  questions.forEach((q, i) => { if (Number(answers[i]) === q.correctIndex) earned += (q.points || 1); });
  const max = sumPoints(questions);

  const passed = max === 0 ? true : game.isPass(earned, max);
  const score = game.computeScore({ correct: earned, total: max, difficulty: req.user.difficulty });

  const progress = (req.user.progress = req.user.progress || {});
  const entry = (progress[lesson.id] = progress[lesson.id] || { attempts: 0, bestScore: 0 });
  const prior = entry.post || { attempts: 0, bestScore: 0 };
  entry.post = {
    attempts: (prior.attempts || 0) + 1,
    lastScore: score,
    bestScore: Math.max(prior.bestScore || 0, score),
    bestEarned: Math.max(prior.bestEarned || 0, earned),
    total: max,
    passed: prior.passed || passed,
    completedAt: prior.completedAt || new Date().toISOString(),
  };

  game.recalcPoints(req.user);
  db.save();

  res.json({
    passed,
    correct: earned,
    total: max,
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
  if (q.type === 'written') return res.json({ written: true }); // graded later by the teacher
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
  const gate = unlockInfo(lessons, idx, req.user);
  if (gate.locked) return res.status(403).json({ error: lockMessage(gate) });

  const questions = quizFor(lesson, req.user.difficulty);
  const answers = Array.isArray(req.body && req.body.answers) ? req.body.answers : [];
  const total = questions.length;

  // Any written answers? Hand the whole attempt off for teacher grading.
  if (writtenCount(questions)) {
    return res.json(submitForGrading(req.user, lesson, 'pre', questions, answers));
  }

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
