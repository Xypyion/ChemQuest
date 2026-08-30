/**
 * Badges — the model and the awarding rule.
 *
 * A badge is a picture the teacher uploads and a name they give it. A challenge
 * may carry one, and a student earns it by finishing that challenge.
 *
 * WHAT "EARNED" MEANS HERE
 * The moment the student hands the challenge in. Not when it is marked — a
 * challenge with written answers can sit in the grading queue for days, and a
 * reward that arrives on Thursday for something done on Monday is not a reward.
 * There is deliberately no score threshold: the badge is for doing the work.
 * (If a teacher ever wants "only if they pass", that is a `minPercent` on the
 * challenge plus a second award pass in the grading route — the awarding is
 * already funnelled through `award()` below so there is one place to change.)
 *
 * A student holds any given badge ONCE. Retaking the challenge does not mint a
 * second copy, and two challenges sharing a badge is fine — the first one to be
 * finished awards it.
 *
 * Badges are not points and not coins. They touch neither `game.recalcPoints()`
 * nor `user.coins`; they are their own collection, so nothing about scoring or
 * the economy changes by adding one.
 */
const crypto = require('crypto');
const db = require('./db');

/** Pictures only, and small — this is an icon on a shelf, not a photograph. */
const IMAGE_MIMES = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml)$/i;
const MAX_IMAGE_BYTES = 512 * 1024;

const MAX_NAME = 60;
const MAX_DESC = 300;

const uuid = () => crypto.randomUUID();
const trimmed = (v, max) => (v == null ? '' : String(v)).slice(0, max).trim();

/* ------------------------------- the model ------------------------------- */

/**
 * Normalise a badge from a request body, mutating `existing` when editing.
 * The image is handled by the route (it has to store bytes); this only shapes
 * the text around it.
 */
function normalizeBadge(body, existing) {
  body = body || {};
  const b = existing || { id: uuid(), createdAt: new Date().toISOString() };
  b.name = trimmed(body.name, MAX_NAME) || 'Untitled Badge';
  b.description = trimmed(body.description, MAX_DESC);
  b.updatedAt = new Date().toISOString();
  return b;
}

/** Every badge, newest first — the order a teacher expects after adding one. */
const allBadges = () => db
  .all('badges')
  .slice()
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

/** How many challenges hand this badge out. */
const challengesUsing = (badgeId) => db.filter('challenges', (c) => c.badgeId === badgeId);

/** Everyone who holds this badge. */
const awardsOf = (badgeId) => db.filter('badgeAwards', (a) => a.badgeId === badgeId);

/** This student's badges, newest first. */
const awardsFor = (userId) => db
  .filter('badgeAwards', (a) => a.userId === userId)
  .slice()
  .sort((a, b) => String(b.awardedAt).localeCompare(String(a.awardedAt)));

const holds = (userId, badgeId) =>
  !!db.find('badgeAwards', (a) => a.userId === userId && a.badgeId === badgeId);

/* -------------------------------- awarding ------------------------------- */

/**
 * Give `user` the badge attached to `challenge`, if there is one and they do
 * not already hold it.
 *
 * Mutates the store; the caller persists (every caller is inside a route that
 * already calls `db.save()`, and server.js flushes before replying).
 *
 * @returns {object|null} the award, or null when nothing was given
 */
function award(user, challenge) {
  if (!challenge || !challenge.badgeId) return null;

  const badge = db.findById('badges', challenge.badgeId);
  // The teacher may have deleted the badge since. Not an error: the challenge
  // simply stops handing one out.
  if (!badge) return null;
  if (holds(user.id, badge.id)) return null;

  const record = {
    id: uuid(),
    badgeId: badge.id,
    userId: user.id,
    userName: user.name,
    // Copied, not looked up, so a teacher's later rename or a deleted challenge
    // cannot rewrite what a student was told they earned it for.
    badgeName: badge.name,
    badgeImage: badge.image || '',
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    awardedAt: new Date().toISOString(),
  };
  db.insert('badgeAwards', record);
  return record;
}

/** A badge as a student should see it. */
function publicBadge(badge) {
  return {
    id: badge.id,
    name: badge.name,
    description: badge.description || '',
    image: badge.image || '',
  };
}

module.exports = {
  IMAGE_MIMES,
  MAX_IMAGE_BYTES,
  MAX_NAME,
  MAX_DESC,
  uuid,
  normalizeBadge,
  allBadges,
  challengesUsing,
  awardsOf,
  awardsFor,
  holds,
  award,
  publicBadge,
};
