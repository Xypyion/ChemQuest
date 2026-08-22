const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const game = require('../game');
const {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  authMiddleware,
} = require('../auth');

const router = express.Router();

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The avatar set. One list, used by BOTH the signup auto-pick and the picker
   in Settings — if these were two lists, a student could be handed a starting
   avatar that their own picker refuses to accept back.

   The first twelve are the original set and MUST keep their order: every
   account created before Settings existed already stores one of these, and
   the picker validates against this array. Extras only ever go on the end. */
const AVATARS = [
  '🦊', '🐯', '🐲', '🦁', '🐸', '🐼', '🦉', '🐧', '🦄', '🐙', '🦖', '🐢',
  '🐱', '🐶', '🐻', '🐷', '🐵', '🐔', '🐦', '🐝', '🦋', '🐌', '🦀', '🐠',
];
const NAME_MAX = 40;

/** POST /api/auth/signup — create a new student account. */
router.post('/signup', (req, res) => {
  let { name, email, password, difficulty } = req.body || {};
  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();
  difficulty = (difficulty || '').trim().toLowerCase();

  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: 'Please choose a difficulty: easy, medium or hard.' });
  }
  if (db.find('users', (u) => u.email === email)) {
    return res.status(409).json({ error: 'That email is already registered.' });
  }

  const user = {
    id: crypto.randomUUID(),
    role: 'student',
    name,
    email,
    passwordHash: hashPassword(password),
    difficulty,
    progress: {},
    certificates: [],
    earnedPoints: 0,
    bonusPoints: 0,
    points: 0,
    avatar: pickAvatar(name),
    createdAt: new Date().toISOString(),
  };
  game.recalcPoints(user);
  db.insert('users', user);

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

/** POST /api/auth/login — works for both students and the teacher. */
router.post('/login', (req, res) => {
  let { email, password } = req.body || {};
  email = (email || '').trim().toLowerCase();

  const user = db.find('users', (u) => u.email === email);
  if (!user || !verifyPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

/** GET /api/auth/me — current logged-in user. */
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ------------------------- self-service settings -------------------------
   Before this, a student could change nothing about their own account: the
   teacher renamed them, the teacher reset their password, and their avatar
   was whatever pickAvatar() derived from their name at signup. These three
   routes are the student side of that.

   All three take authMiddleware but NOT requireRole('student'): the teacher
   is a user with a password too, and locking them out of changing it would
   be strange. What stays teacher-only is `difficulty` — it selects which
   question bank a quiz draws from, so a student who could set it would be
   choosing how hard their own graded test is. Settings shows it read-only. */

/** GET /api/auth/profile — the account plus the progress summary Settings shows. */
router.get('/profile', authMiddleware, (req, res) => {
  const user = req.user;
  const progress = user.progress || {};
  const lessons = db.all('lessons');

  /* Counted with game.levelDone rather than by looking for `passed`, so this
     agrees with the map about what "finished" means: on a level that has a
     post-test, passing the pre-test is not finishing it. */
  const levelsDone = lessons.filter((l) => game.levelDone(l, progress[l.id])).length;

  res.json({
    user: publicUser(user),
    avatars: AVATARS,
    stats: {
      points: user.points || 0,
      coins: user.coins || 0,
      certificates: (user.certificates || []).length,
      levelsDone,
      levelsTotal: lessons.length,
      joinedAt: user.createdAt || null,
    },
  });
});

/** PATCH /api/auth/me — change your own display name and/or avatar. */
router.patch('/me', authMiddleware, (req, res) => {
  const body = req.body || {};
  const user = req.user;

  if (body.name !== undefined) {
    const name = (body.name || '').toString().trim();
    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (name.length > NAME_MAX) {
      return res.status(400).json({ error: `Name must be ${NAME_MAX} characters or fewer.` });
    }
    user.name = name;
  }

  if (body.avatar !== undefined) {
    /* Whitelist, not a length check. This string is rendered straight into the
       leaderboard podium, the battle screen and every feed comment, so "one
       emoji" is not a strong enough rule — it has to be one of ours. */
    if (!AVATARS.includes(body.avatar)) {
      return res.status(400).json({ error: 'Please choose one of the available avatars.' });
    }
    user.avatar = body.avatar;
  }

  db.save();
  res.json({ user: publicUser(user) });
});

/** POST /api/auth/password — change your own password. */
router.post('/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = req.user;

  /* The current password is required even though the token already proves who
     they are. The tokens last 30 days and this is a shared-computer school:
     without this check, walking up to a logged-in machine would be enough to
     take the account over. */
  if (!verifyPassword((currentPassword || '').toString(), user.passwordHash)) {
    /* 403 and NOT 401. The browser's fetch wrapper treats every 401 as a dead
       session — it clears the token and bounces to the login page (api.js).
       A student who simply mistypes their current password here would be
       thrown out of the app, losing the other fields they had filled in. The
       request IS authenticated; it is the re-check that failed, so 403. */
    return res.status(403).json({ error: 'Your current password is not correct.' });
  }
  const next = (newPassword || '').toString();
  if (next.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (verifyPassword(next, user.passwordHash)) {
    return res.status(400).json({ error: 'That is already your password.' });
  }

  user.passwordHash = hashPassword(next);
  db.save();

  /* A fresh token so the tab that made the change keeps working. Note this
     does NOT end sessions on other devices: tokens carry only id and role,
     so nothing in an old token stops verifying when the hash changes. Ending
     them would need a token version on the user, which is a bigger change
     than this route. Worth knowing if a student changes their password
     BECAUSE someone else knows it. */
  res.json({ ok: true, token: signToken(user) });
});

function pickAvatar(name) {
  let hash = 0;
  for (const ch of name) hash = (hash + ch.charCodeAt(0)) % AVATARS.length;
  return AVATARS[hash];
}

module.exports = router;
