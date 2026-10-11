/**
 * Shared game rules: scoring, the question set, and point bookkeeping.
 * Kept in one place so the lesson routes, teacher tools and leaderboard all
 * agree on how points are calculated.
 *
 * THERE IS NO STUDENT DIFFICULTY ANY MORE. Students used to pick easy / medium
 * / hard at signup; it chose one of three question sets and multiplied the
 * score (x1 / x1.25 / x1.5). Both are gone: every student takes the same test
 * and a score is simply its percentage. Scores earned before the change keep
 * whatever multiplier they were earned with — nothing is recalculated.
 *
 * Lessons still STORE `quizzes: { easy, medium, hard }` (and the same under
 * `postTest`), because that is the shape every existing database holds. The
 * one set is `questionSet()` below — all three concatenated — and the teacher
 * editor saves everything into `easy`. Merging rather than picking one is what
 * guarantees no question a teacher already wrote disappears.
 */

const MAX_LESSON_POINTS = 100;
const PASS_RATIO = 0.6; // need 60% correct to earn a certificate

/** Kept so older callers still work: every attempt now scores at x1. */
function multiplierFor() {
  return 1;
}

/** The one question set of a pre/post-test: easy + medium + hard, de-duplicated. */
function questionSet(quizzes) {
  const q = quizzes || {};
  const seen = new Set();
  const out = [];
  ['easy', 'medium', 'hard'].forEach((k) => (Array.isArray(q[k]) ? q[k] : []).forEach((x) => {
    if (!x || (x.id && seen.has(x.id))) return;
    if (x.id) seen.add(x.id);
    out.push(x);
  }));
  return out;
}

/** Points awarded for an attempt: the percentage correct, out of 100. */
function computeScore({ correct, total }) {
  if (!total) return 0;
  return Math.round((correct / total) * MAX_LESSON_POINTS);
}

function isPass(correct, total) {
  if (!total) return false;
  return correct / total >= PASS_RATIO;
}

/** Does this level have a post-test built (in any of its stored sets)? */
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

/* ----------------------- storyboard / pre-test flow ----------------------- */

/**
 * A level is made of two separate activities: the STORYBOARD and the PRE-TEST.
 * The teacher decides which one the student meets first:
 *   'story-first' (default) — read the story, then take the pre-test.
 *   'test-first'            — take the pre-test cold, then read the story.
 * The second activity stays locked until the first one is done, so the order
 * the teacher picked is actually respected (server-side, not just in the UI).
 */
const FLOWS = ['story-first', 'test-first'];

function lessonFlow(lesson) {
  const f = lesson && lesson.flow;
  return FLOWS.includes(f) ? f : 'story-first';
}

function hasStory(lesson) {
  return !!(lesson && (lesson.storyboard || []).length);
}

/** Does this level have a pre-test built (in any of its stored sets)? */
function hasPreTest(lesson) {
  const q = (lesson && lesson.quizzes) || {};
  return !!((q.easy || []).length || (q.medium || []).length || (q.hard || []).length);
}

/**
 * Work out which of the two activities a student may open right now.
 * `progressEntry` is user.progress[lesson.id] (may be undefined).
 */
function activityState(lesson, progressEntry) {
  const p = progressEntry || {};
  const flow = lessonFlow(lesson);
  const story = hasStory(lesson);
  const pre = hasPreTest(lesson);
  const storyDone = !!p.storyDone;
  const preAttempted = !!(p.attempts || p.awaitingGrading);

  // Only gate when BOTH activities exist — otherwise there is no order to keep.
  // An activity the student already finished never locks again (that would
  // punish them if the teacher flips the order half-way through a class).
  const gated = story && pre;
  return {
    flow,
    hasStory: story,
    hasPre: pre,
    storyDone,
    preAttempted,
    prePassed: !!p.passed,
    storyLocked: gated && flow === 'test-first' && !preAttempted && !storyDone,
    preLocked: gated && flow === 'story-first' && !storyDone && !preAttempted,
  };
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
  FLOWS,
  MAX_LESSON_POINTS,
  PASS_RATIO,
  multiplierFor,
  questionSet,
  computeScore,
  isPass,
  hasPostTest,
  hasStory,
  hasPreTest,
  lessonFlow,
  activityState,
  levelDone,
  gateOpen,
  recalcPoints,
};
