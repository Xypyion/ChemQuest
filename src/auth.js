/**
 * Authentication helpers: password hashing, JWT issuing/verification, and
 * Express middleware that loads the current user and enforces roles.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'chemquest-dev-secret-change-me-in-production';
const TOKEN_TTL = '30d';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Remove sensitive fields before sending a user to the client. */
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

/** Require a valid token; attaches the full user record to req.user. */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'You need to log in first.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.findById('users', payload.id);
    if (!user) return res.status(401).json({ error: 'Your account no longer exists.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

/** Restrict a route to a specific role ('student' or 'teacher'). */
function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  authMiddleware,
  requireRole,
  JWT_SECRET,
};
