/**
 * Assignment board ("posts") routes — a Facebook-group-style feed per level.
 * Students and the teacher can post text + file attachments, comment, like,
 * and students can send a private question to the teacher under any post.
 *
 * Attachments arrive as base64 data URLs; `src/uploads.js` puts the bytes
 * wherever this host can keep them and hands back a URL, so the JSON store
 * stays small either way.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const uploads = require('../uploads');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware); // both roles may use the board

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per attached file
const MAX_FILES_PER_POST = 6;
const MAX_TEXT = 4000;

function authorOf(user) {
  return { id: user.id, name: user.name, avatar: user.avatar || (user.role === 'teacher' ? '👩‍🏫' : '🧑‍🎓'), role: user.role };
}

/** A board attachment: any file type, up to MAX_FILE_BYTES. */
function saveAttachment(att) {
  return uploads.saveDataUrl(att, { maxBytes: MAX_FILE_BYTES });
}

function deleteAttachmentFiles(post) {
  (post.attachments || []).forEach((a) => uploads.removeByUrl(a.url));
}

/**
 * Peer/teacher rating summary for a student work, against the level's criteria.
 * Aggregates per-criterion averages (individual raters stay anonymous), plus the
 * requesting user's own rating and the teacher's rating (shown distinctly).
 */
function ratingSummary(post, user, criteria) {
  const ratings = post.ratings || [];
  const perCriterion = {};
  let sumAll = 0, countAll = 0;
  (criteria || []).forEach((c) => {
    let sum = 0, n = 0;
    ratings.forEach((r) => {
      const v = Math.round(Number((r.scores || {})[c.id]));
      if (v >= 1 && v <= 5) { sum += v; n += 1; sumAll += v; countAll += 1; }
    });
    perCriterion[c.id] = { avg: n ? +(sum / n).toFixed(2) : 0, count: n };
  });
  const mine = ratings.find((r) => r.raterId === user.id);
  const teacher = ratings.find((r) => r.raterRole === 'teacher');
  return {
    raters: ratings.length,
    perCriterion,
    overall: countAll ? +(sumAll / countAll).toFixed(2) : 0,
    mine: mine ? mine.scores : null,
    teacher: teacher ? teacher.scores : null,
    canRate: post.author.id !== user.id, // student works only (assignment posts excluded below)
  };
}

/** Shape a post for the requesting user (privacy filter on questions). */
function viewPost(post, user, criteria) {
  const isTeacher = user.role === 'teacher';
  return {
    id: post.id,
    lessonId: post.lessonId,
    author: post.author,
    isAssignment: !!post.isAssignment,
    text: post.text,
    attachments: post.attachments || [],
    likes: post.likes || [],
    likedByMe: (post.likes || []).includes(user.id),
    comments: post.comments || [],
    // Private questions: the teacher sees all; a student only their own.
    questions: (post.questions || []).filter((qq) => isTeacher || qq.author.id === user.id),
    // Ratings only apply to student works, never to a teacher's assignment post.
    rating: post.isAssignment ? null : ratingSummary(post, user, criteria),
    createdAt: post.createdAt,
    canDelete: isTeacher || post.author.id === user.id,
  };
}

/** GET /api/posts/lesson/:lessonId — the board feed for one level. */
router.get('/lesson/:lessonId', (req, res) => {
  const lesson = db.findById('lessons', req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'That level does not exist.' });
  const criteria = lesson.ratingCriteria || [];
  const posts = db
    .filter('posts', (p) => p.lessonId === lesson.id)
    .sort((a, b) => {
      // Teacher assignments pinned on top, then newest first.
      if (!!b.isAssignment !== !!a.isAssignment) return b.isAssignment ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .map((p) => viewPost(p, req.user, criteria));
  res.json({ posts, criteria });
});

/** POST /api/posts/lesson/:lessonId — create a post (text and/or files). */
router.post('/lesson/:lessonId', (req, res) => {
  const lesson = db.findById('lessons', req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'That level does not exist.' });

  const body = req.body || {};
  const text = (body.text || '').toString().trim().slice(0, MAX_TEXT);
  const rawFiles = Array.isArray(body.attachments) ? body.attachments.slice(0, MAX_FILES_PER_POST) : [];
  const attachments = rawFiles.map(saveAttachment).filter(Boolean);

  if (!text && !attachments.length) return res.status(400).json({ error: 'Write something or attach a file first.' });

  const post = {
    id: crypto.randomUUID(),
    lessonId: lesson.id,
    author: authorOf(req.user),
    isAssignment: req.user.role === 'teacher',
    text,
    attachments,
    likes: [],
    comments: [],
    questions: [],
    createdAt: new Date().toISOString(),
  };
  db.insert('posts', post);
  res.status(201).json({ post: viewPost(post, req.user, lesson.ratingCriteria || []) });
});

/**
 * POST /api/posts/:id/rate — rate a classmate's work against the level's
 * criteria. Any logged-in user may rate (students rate peers, the teacher rates
 * too), but never their own post and never a teacher assignment post. Scores are
 * 1–5 per criterion; a rater may update one or more criteria at a time.
 */
router.post('/:id/rate', (req, res) => {
  const post = db.findById('posts', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.isAssignment) return res.status(403).json({ error: 'Only student works can be rated.' });
  if (post.author.id === req.user.id) return res.status(403).json({ error: 'You cannot rate your own work.' });

  const lesson = db.findById('lessons', post.lessonId);
  const criteria = (lesson && lesson.ratingCriteria) || [];
  if (!criteria.length) return res.status(400).json({ error: 'Your teacher has not set any rating criteria yet.' });

  const critIds = new Set(criteria.map((c) => c.id));
  const raw = (req.body && req.body.scores) || {};
  const scores = {};
  for (const k of Object.keys(raw)) {
    if (!critIds.has(k)) continue;
    const v = Math.round(Number(raw[k]));
    if (v >= 1 && v <= 5) scores[k] = v;
  }
  if (!Object.keys(scores).length) return res.status(400).json({ error: 'Please give a star rating first.' });

  post.ratings = post.ratings || [];
  const existing = post.ratings.find((r) => r.raterId === req.user.id);
  if (existing) {
    existing.scores = { ...existing.scores, ...scores };
    existing.at = new Date().toISOString();
  } else {
    post.ratings.push({ raterId: req.user.id, raterRole: req.user.role, scores, at: new Date().toISOString() });
  }
  db.save();
  res.json({ rating: ratingSummary(post, req.user, criteria) });
});

/** POST /api/posts/:id/comment */
router.post('/:id/comment', (req, res) => {
  const post = db.findById('posts', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const text = ((req.body || {}).text || '').toString().trim().slice(0, MAX_TEXT);
  if (!text) return res.status(400).json({ error: 'Comment cannot be empty.' });
  post.comments = post.comments || [];
  const comment = { id: crypto.randomUUID(), author: authorOf(req.user), text, at: new Date().toISOString() };
  post.comments.push(comment);
  db.save();
  res.status(201).json({ comment });
});

/** DELETE /api/posts/:id/comment/:cid — author of the comment or the teacher. */
router.delete('/:id/comment/:cid', (req, res) => {
  const post = db.findById('posts', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const idx = (post.comments || []).findIndex((c) => c.id === req.params.cid);
  if (idx === -1) return res.status(404).json({ error: 'Comment not found.' });
  const c = post.comments[idx];
  if (req.user.role !== 'teacher' && c.author.id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }
  post.comments.splice(idx, 1);
  db.save();
  res.json({ ok: true });
});

/** POST /api/posts/:id/like — toggle a like. */
router.post('/:id/like', (req, res) => {
  const post = db.findById('posts', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  post.likes = post.likes || [];
  const i = post.likes.indexOf(req.user.id);
  if (i === -1) post.likes.push(req.user.id);
  else post.likes.splice(i, 1);
  db.save();
  res.json({ likes: post.likes.length, likedByMe: i === -1 });
});

/** POST /api/posts/:id/question — a student's PRIVATE question to the teacher.
 *  Only allowed on a teacher's assignment post (not on other students' posts). */
router.post('/:id/question', (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students send private questions.' });
  const post = db.findById('posts', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (!post.isAssignment) return res.status(403).json({ error: 'You can only ask the teacher on an assignment post.' });
  const text = ((req.body || {}).text || '').toString().trim().slice(0, MAX_TEXT);
  if (!text) return res.status(400).json({ error: 'Question cannot be empty.' });
  post.questions = post.questions || [];
  const question = { id: crypto.randomUUID(), author: authorOf(req.user), text, at: new Date().toISOString() };
  post.questions.push(question);
  db.save();
  res.status(201).json({ question });
});

/** DELETE /api/posts/:id — the post's author or the teacher. */
router.delete('/:id', (req, res) => {
  const post = db.findById('posts', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (req.user.role !== 'teacher' && post.author.id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own posts.' });
  }
  deleteAttachmentFiles(post);
  db.remove('posts', post.id);
  res.json({ ok: true });
});

module.exports = router;
