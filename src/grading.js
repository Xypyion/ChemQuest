/**
 * Shared "finalize an attempt" logic.
 *
 * The instant pre-test / post-test grading lives in lessons.routes.js and is
 * left untouched for quizzes made entirely of multiple-choice questions. When
 * a quiz also contains written (ข้อเขียน) questions, the attempt can't be
 * scored until the teacher has graded the writing — so the score, pass status,
 * points and certificate are finalised here, called from the teacher's grading
 * endpoint once every written answer has been marked.
 *
 * Kept in its own module so both lessons.routes (future use) and teacher.routes
 * agree on exactly how a completed attempt updates a student's progress.
 */
const game = require('./game');

/**
 * Apply a fully-graded attempt to the user's progress.
 *   mode: 'pre' | 'post'
 *   correct / total: final counts including teacher-graded written answers
 * Mutates `user` in place (does NOT persist — the caller saves). Returns a
 * summary mirroring the shape lessons.routes already returns to the client.
 */
function finalizeAttempt(user, lesson, mode, correct, total) {
  const progress = (user.progress = user.progress || {});

  if (mode === 'post') {
    const passed = total === 0 ? true : game.isPass(correct, total);
    const score = game.computeScore({ correct, total, difficulty: user.difficulty });
    const entry = (progress[lesson.id] = progress[lesson.id] || { attempts: 0, bestScore: 0 });
    const prior = entry.post || { attempts: 0, bestScore: 0 };
    entry.post = {
      ...prior,
      attempts: prior.attempts || 0, // the attempt was already counted at submit time
      lastScore: score,
      bestScore: Math.max(prior.bestScore || 0, score),
      bestCorrect: Math.max(prior.bestCorrect || 0, correct),
      total,
      passed: prior.passed || passed,
      completedAt: prior.completedAt || new Date().toISOString(),
    };
    delete entry.post.awaitingGrading;
    delete entry.post.pendingSubmissionId;
    game.recalcPoints(user);
    return { mode, passed, correct, total, score, bestScore: entry.post.bestScore, certificate: null, newCertificate: false };
  }

  // pre-test
  const passed = total === 0 ? true : game.isPass(correct, total);
  const score =
    total === 0
      ? Math.round(0.8 * game.MAX_LESSON_POINTS * game.multiplierFor(user.difficulty))
      : game.computeScore({ correct, total, difficulty: user.difficulty });

  const prior = progress[lesson.id] || { attempts: 0, bestScore: 0 };
  const bestScore = Math.max(prior.bestScore || 0, score);
  const entry = {
    ...prior,
    attempts: prior.attempts || 0, // already counted at submit time
    lastScore: score,
    bestScore,
    bestCorrect: Math.max(prior.bestCorrect || 0, correct),
    total,
    passed: prior.passed || passed,
    completedAt: prior.completedAt || (passed ? new Date().toISOString() : null),
  };
  delete entry.awaitingGrading;
  delete entry.pendingSubmissionId;
  progress[lesson.id] = entry;

  // Award a certificate the first time they pass.
  let certificate = (user.certificates || []).find((c) => c.lessonId === lesson.id);
  let newCertificate = false;
  if (passed && !certificate) {
    certificate = {
      id: `${user.id}-${lesson.id}`,
      lessonId: lesson.id,
      title: lesson.title,
      icon: lesson.icon || '🧪',
      score: bestScore,
      difficulty: user.difficulty,
      dateEarned: new Date().toISOString(),
    };
    user.certificates = user.certificates || [];
    user.certificates.push(certificate);
    newCertificate = true;
  }

  game.recalcPoints(user);
  return { mode, passed, correct, total, score, bestScore, certificate, newCertificate };
}

module.exports = { finalizeAttempt };
