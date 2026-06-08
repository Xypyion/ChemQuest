const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

/** GET /api/leaderboard — all students ranked by points (any logged-in user). */
router.get('/', authMiddleware, (req, res) => {
  const ranked = db
    .filter('users', (u) => u.role === 'student')
    .map((u) => {
      const progress = u.progress || {};
      return {
        id: u.id,
        name: u.name,
        avatar: u.avatar || '🧑‍🎓',
        difficulty: u.difficulty,
        points: u.points || 0,
        levelsCompleted: Object.values(progress).filter((p) => p.passed).length,
        certificates: (u.certificates || []).length,
      };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  ranked.forEach((s, i) => {
    s.rank = i + 1;
    s.isMe = s.id === req.user.id;
  });

  res.json({ leaderboard: ranked, meId: req.user.id, total: ranked.length });
});

module.exports = router;
