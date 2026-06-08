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

function pickAvatar(name) {
  const avatars = ['🦊', '🐯', '🐲', '🦁', '🐸', '🐼', '🦉', '🐧', '🦄', '🐙', '🦖', '🐢'];
  let hash = 0;
  for (const ch of name) hash = (hash + ch.charCodeAt(0)) % avatars.length;
  return avatars[hash];
}

module.exports = router;
