/**
 * Badges — teacher CRUD and the student's own shelf.
 *
 * Mounted in server.js as:
 *   /api/badges          -> studentRouter   (what I have earned)
 *   /api/teacher/badges  -> teacherRouter   (BEFORE the generic /api/teacher)
 *
 * Collections: `badges`, `badgeAwards`. The picture itself is not in either —
 * `src/uploads.js` puts the bytes wherever this host can keep them and hands
 * back a URL, so a badge document stays small however big the artwork was.
 */
const express = require('express');
const db = require('../db');
const bg = require('../badges');
const uploads = require('../uploads');
const { authMiddleware, requireRole } = require('../auth');

const studentRouter = express.Router();
const teacherRouter = express.Router();

/* ============================== STUDENT API ============================== */

studentRouter.use(authMiddleware, requireRole('student'));

/**
 * GET /api/badges/me — the badges I have earned, and the ones still out there.
 *
 * `locked` carries no picture on purpose: an unearned badge shows as a
 * silhouette, so there is something to want without spoiling what it looks
 * like. Its name is included because "Balancing Champion" is the goal; the art
 * is the reward.
 */
studentRouter.get('/me', (req, res) => {
  const mine = bg.awardsFor(req.user.id);
  const earnedIds = new Set(mine.map((a) => a.badgeId));

  // Only badges a challenge actually hands out are worth showing as locked —
  // one the teacher made but never attached to anything is not a goal yet.
  const attached = new Set(
    db.filter('challenges', (c) => c.badgeId && c.published).map((c) => c.badgeId)
  );

  const locked = bg.allBadges()
    .filter((b) => attached.has(b.id) && !earnedIds.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, description: b.description || '' }));

  res.json({
    earned: mine.map((a) => ({
      id: a.id,
      badgeId: a.badgeId,
      name: a.badgeName,
      image: a.badgeImage,
      challengeTitle: a.challengeTitle,
      awardedAt: a.awardedAt,
    })),
    locked,
  });
});

/* ============================== TEACHER API ============================== */

teacherRouter.use(authMiddleware, requireRole('teacher'));

/** One badge, with the two counts a teacher needs before deleting it. */
function teacherView(b) {
  return {
    id: b.id,
    name: b.name,
    description: b.description || '',
    image: b.image || '',
    usedBy: bg.challengesUsing(b.id).length,
    earnedBy: bg.awardsOf(b.id).length,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** GET /api/teacher/badges — every badge, with usage counts. */
teacherRouter.get('/', (req, res) => {
  res.json({ badges: bg.allBadges().map(teacherView) });
});

/**
 * Pull the picture out of a request body and store it.
 * Returns `{ url }`, or `{ error }` when the upload was unusable.
 */
function takeImage(body) {
  const image = body && body.image;
  if (!image || !image.data) return { url: null };
  const saved = uploads.saveDataUrl(image, {
    maxBytes: bg.MAX_IMAGE_BYTES,
    mimes: bg.IMAGE_MIMES,
  });
  if (!saved) return { error: 'BAD_IMAGE' };
  return { url: saved.url };
}

/** POST /api/teacher/badges — create one. The picture is required. */
teacherRouter.post('/', (req, res) => {
  const body = req.body || {};
  const picture = takeImage(body);
  if (picture.error) return res.status(400).json({ error: picture.error });
  if (!picture.url) return res.status(400).json({ error: 'IMAGE_REQUIRED' });

  const badge = bg.normalizeBadge(body, null);
  badge.image = picture.url;
  db.insert('badges', badge);
  res.status(201).json({ badge: teacherView(badge) });
});

/** PUT /api/teacher/badges/:id — rename, or replace the picture. */
teacherRouter.put('/:id', (req, res) => {
  const badge = db.findById('badges', req.params.id);
  if (!badge) return res.status(404).json({ error: 'Badge not found.' });

  const body = req.body || {};
  const picture = takeImage(body);
  if (picture.error) return res.status(400).json({ error: picture.error });

  const previous = badge.image;
  bg.normalizeBadge(body, badge);
  if (picture.url) badge.image = picture.url;
  db.save();

  // Only once the new one is safely in place, and only if it really changed.
  if (picture.url && previous && previous !== picture.url) uploads.removeByUrl(previous);

  res.json({ badge: teacherView(badge) });
});

/**
 * DELETE /api/teacher/badges/:id — remove a badge.
 *
 * Refused once a student holds it. Deleting would take a badge off somebody's
 * shelf that they earned, which is not a thing a stray click should be able to
 * do — the teacher can detach it from the challenge instead, which stops it
 * being given out without erasing anyone's.
 */
teacherRouter.delete('/:id', (req, res) => {
  const badge = db.findById('badges', req.params.id);
  if (!badge) return res.status(404).json({ error: 'Badge not found.' });

  const earnedBy = bg.awardsOf(badge.id).length;
  if (earnedBy) return res.status(409).json({ error: 'BADGE_EARNED', earnedBy });

  // Any challenge still pointing at it stops handing one out.
  bg.challengesUsing(badge.id).forEach((c) => { c.badgeId = null; });
  db.remove('badges', badge.id);
  uploads.removeByUrl(badge.image);
  db.save();

  res.json({ ok: true });
});

/** GET /api/teacher/badges/:id/holders — who has earned this one. */
teacherRouter.get('/:id/holders', (req, res) => {
  const badge = db.findById('badges', req.params.id);
  if (!badge) return res.status(404).json({ error: 'Badge not found.' });
  const holders = bg.awardsOf(badge.id)
    .slice()
    .sort((a, b) => String(b.awardedAt).localeCompare(String(a.awardedAt)))
    .map((a) => ({
      userId: a.userId,
      userName: a.userName,
      challengeTitle: a.challengeTitle,
      awardedAt: a.awardedAt,
    }));
  res.json({ badge: teacherView(badge), holders });
});

module.exports = { studentRouter, teacherRouter };
