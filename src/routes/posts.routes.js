/**
 * Assignment board ("posts") routes — a Facebook-group-style feed per level.
 * Students and the teacher can post text + file attachments, comment, like,
 * and students can send a private question to the teacher under any post.
 *
 * Attachments arrive as base64 data URLs and are written to data/uploads/,
 * then served back as /uploads/<file> so the JSON store stays small.
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();
router.use(authMiddleware); // both roles may use the board

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per attached file
const MAX_FILES_PER_POST = 6;
const MAX_TEXT = 4000;

function authorOf(user) {
  return { id: user.id, name: user.name, avatar: user.avatar || (user.role === 'teacher' ? '👩‍🏫' : '🧑‍🎓'), role: user.role };
}

/** Decode a data URL and save it under data/uploads. Returns attachment meta. */
function saveAttachment(att) {
  const name = (att.name || 'file').toString().replace(/[^\w.\- ()฀-๿]/g, '_').slice(0, 120) || 'file';
  const data = (att.data || '').toString();
  const m = data.match(/^data:([\w/+.-]+);base64,(.+)$/s);
  if (!m) return null;
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_FILE_BYTES) return null;
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fileName = crypto.randomUUID().slice(0, 8) + '__' + name;
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buf);
  return { id: crypto.randomUUID(), name, type: mime, size: buf.length, url: '/uploads/' + encodeURIComponent(fileName) };
}

function deleteAttachmentFiles(post) {
  (post.attachments || []).forEach((a) => {
    try {
      const fileName = decodeURIComponent((a.url || '').split('/').pop() || '');
      if (fileName) fs.unlinkSync(path.join(UPLOAD_DIR, fileName));
    } catch { /* already gone */ }
  });
}

/** Shape a post for the requesting user (privacy filter on questions). */
function viewPost(post, user) {
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
    createdAt: post.createdAt,
    canDelete: isTeacher || post.author.id === user.id,
  };
}

/** GET /api/posts/lesson/:lessonId — the board feed for one level. */
router.get('/lesson/:lessonId', (req, res) => {
  const lesson = db.findById('lessons', req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'That level does not exist.' });
  const posts = db
    .filter('posts', (p) => p.lessonId === lesson.id)
    .sort((a, b) => {
      // Teacher assignments pinned on top, then newest first.
      if (!!b.isAssignment !== !!a.isAssignment) return b.isAssignment ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .map((p) => viewPost(p, req.user));
  res.json({ posts });
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
  res.status(201).json({ post: viewPost(post, req.user) });
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

/** POST /api/posts/:id/question — a student's PRIVATE question to the teacher. */
router.post('/:id/question', (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students send private questions.' });
  const post = db.findById('posts', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
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
