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

/**
 * Recalculate a user's point totals from their best lesson scores plus any
 * manual bonus a teacher has applied. Mutates the user object in place.
 */
function recalcPoints(user) {
  const progress = user.progress || {};
  const earned = Object.values(progress).reduce((sum, p) => sum + (p.bestScore || 0), 0);
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
  recalcPoints,
};
