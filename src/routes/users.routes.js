/**
 * Player profiles — the page a classmate sees when they tap someone's name.
 *
 * GET /api/users/:id/profile   (any signed-in user)
 *
 * WHAT IS PUBLIC, AND WHY
 * Only what classmates can already see somewhere else in the app:
 *   - name and avatar ......... the leaderboard, battles and every board post
 *   - points and rank ......... the leaderboard
 *   - coins ................... the Coin Battles opponent list
 *   - levels finished, badges . the leaderboard row (counts) — here as the
 *                               badges themselves
 *   - their board posts ....... the level boards, which every student reads
 * Never returned: email, password hash, per-question progress, grades, the
 * private questions they asked the teacher, or anything from Student Logs.
 *
 * "Badges" are the records the app has always called certificates
 * (`user.certificates`, one per level passed). Only the name shown to people
 * changed; the stored shape did not, so nothing that writes them is touched.
 */
const express = require('express');
const db = require('../db');
const game = require('../game');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware);

const MAX_POSTS = 20;

/** Students ranked exactly the way /api/leaderboard ranks them. */
function rankedStudents() {
  return db
    .filter('users', (u) => u.role === 'student' && !u.practice)
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (a.name || '').localeCompare(b.name || ''));
}

router.get('/:id/profile', (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user || user.role !== 'student') return res.status(404).json({ error: 'That player could not be found.' });

  const lessons = db.all('lessons').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const progress = user.progress || {};
  const levelOf = new Map(lessons.map((l, i) => [l.id, { n: i + 1, lesson: l }]));

  const ranked = rankedStudents();
  const at = ranked.findIndex((u) => u.id === user.id);

  const badges = (user.certificates || [])
    .map((c) => {
      const lv = levelOf.get(c.lessonId);
      return {
        lessonId: c.lessonId,
        // the teacher may have renamed the level since; show today's title
        title: lv ? lv.lesson.title : c.title,
        icon: (lv && lv.lesson.icon) || c.icon || '',
        level: lv ? lv.n : null,
        score: c.score || 0,
        dateEarned: c.dateEarned || null,
      };
    })
    .sort((a, b) => (a.level || 999) - (b.level || 999));

  const lessonTitle = new Map(lessons.map((l) => [l.id, l.title]));
  const posts = db
    .filter('posts', (p) => !p.isAssignment && p.author && p.author.id === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_POSTS)
    .map((p) => ({
      id: p.id,
      lessonId: p.lessonId,
      lessonTitle: lessonTitle.get(p.lessonId) || '',
      text: p.text || '',
      attachments: (p.attachments || []).map((a) => ({ name: a.name, type: a.type, url: a.url })),
      likes: (p.likes || []).length,
      comments: (p.comments || []).length,
      createdAt: p.createdAt,
    }));

  res.json({
    profile: {
      id: user.id,
      name: user.name,
      avatar: user.avatar || '🧑‍🎓',
      joinedAt: user.createdAt || null,
      points: user.points || 0,
      coins: user.coins || 0,
      levelsDone: lessons.filter((l) => game.levelDone(l, progress[l.id])).length,
      levelsTotal: lessons.length,
      rank: at === -1 ? null : at + 1,
      players: ranked.length,
      badges,
      badgesTotal: lessons.length,
      posts,
      isMe: user.id === req.user.id,
    },
  });
});

module.exports = router;
