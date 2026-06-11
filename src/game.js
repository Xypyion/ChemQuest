/**
 * Shared game rules: scoring, difficulty multipliers, and point bookkeeping.
 * Kept in one place so the lesson routes, teacher tools and leaderboard all
 * agree on how points are calculated.
 */

const DIFFICULTY_MULTIPLIER = { easy: 1, medium: 1.25, hard: 1.5 };
const MAX_LESSON_POINTS = 100; // before the difficulty multiplier
const PASS_RATIO = 0.6; // need 60% correct to earn a certificate

function multiplierFor(difficulty) {
  return DIFFICULTY_MULTIPLIER[difficulty] || 1;
}

/** Points awarded for an attempt, scaled by accuracy and difficulty. */
function computeScore({ correct, total, difficulty }) {
  if (!total) return 0;
  const ratio = correct / total;
  return Math.round(ratio * MAX_LESSON_POINTS * multiplierFor(difficulty));
}

function isPass(correct, total) {
  if (!total) return false;
  return correct / total >= PASS_RATIO;
}

/** Does this level have a post-test built (any difficulty)? */
function hasPostTest(lesson) {
  const q = lesson && lesson.postTest && lesson.postTest.quizzes;
  return !!(q && ((q.easy || []).length || (q.medium || []).length || (q.hard || []).length));
}

/**
 * Is a level fully completed (so the NEXT one may unlock)?
 * If the level has a post-test, the student must pass the POST-test.
 * Otherwise passing the pre-test is enough (keeps post-test-free levels working).
 */
function levelDone(lesson, progressEntry) {
  const p = progressEntry || {};
  if (hasPostTest(lesson)) return !!(p.post && p.post.passed);
  return !!p.passed;
}

/** Teacher access gate: is this level's gate currently open? (separate from progression) */
function gateOpen(lesson) {
  const g = (lesson && lesson.gate) || { mode: 'auto' };
  if (g.mode === 'locked') return false;
  if (g.mode === 'scheduled') return !!g.openAt && Date.now() >= new Date(g.openAt).getTime();
  return true; // 'auto'
}

/**
 * Recalculate a user's point totals from their best lesson scores plus any
 * manual bonus a teacher has applied. Mutates the user object in place.
 */
function recalcPoints(user) {
  const progress = user.progress || {};
  // Pre-test (lesson) best scores + post-test best scores both count.
  const earned = Object.values(progress).reduce(
    (sum, p) => sum + (p.bestScore || 0) + ((p.post && p.post.bestScore) || 0), 0);
  user.earnedPoints = earned;
  user.bonusPoints = user.bonusPoints || 0;
  user.points = earned + user.bonusPoints;
  return user.points;
}

module.exports = {
  DIFFICULTY_MULTIPLIER,
  MAX_LESSON_POINTS,
  PASS_RATIO,
  multiplierFor,
  computeScore,
  isPass,
  hasPostTest,
  levelDone,
  gateOpen,
  recalcPoints,
};
