/**
 * Student work that is read but never graded — and the Student Logs page that
 * reads it.
 *
 * Two routers:
 *   studentRouter → /api/work          a student answers a storyboard question,
 *                                      or sends in their whiteboard
 *   teacherRouter → /api/teacher/logs  Student Logs: one student's whole record,
 *                                      the class overview, Kru CJ's analyses
 *
 * Collections (created on first use, like every other one):
 *   storyAnswers     one row per (student, storyboard question)
 *   whiteboards      one row per (student, question) — a resend replaces it
 *   studentInsights  one row per student: Kru CJ's overall profile, id = userId
 *
 * WHY ANALYSIS IS A SECOND REQUEST
 * Saving an answer has to be instant — the student is in the middle of a story
 * and is waiting for the Next button. Kru CJ takes seconds. So the student's
 * page saves first, then fires `/analyze` and moves on without waiting. If
 * that call never finishes (the tab closed, the daily cap was hit, the model
 * was busy) nothing is lost: the work is already saved, and the teacher can
 * run the analysis themselves from Student Logs.
 *
 * WHY WHITEBOARD IMAGES STAY OUT OF THE LIST RESPONSES
 * They are pictures. A class's worth of them would turn every Student Logs
 * page into megabytes, so lists carry metadata only and the teacher's browser
 * fetches one image at a time from `/whiteboard/:id/image`.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const ch = require('../challenges');
const game = require('../game');
const config = require('../config');
const aiLimit = require('../aiLimit');
const ai = require('../aiQuestions');      // failureOf/describeFailure: one failure vocabulary
const diag = require('../aiDiagnosis');
const lessonsRoutes = require('./lessons.routes');
const { authMiddleware, requireRole } = require('../auth');

const studentRouter = express.Router();
const teacherRouter = express.Router();

const MAX_ANSWER = 4000;
const MAX_BOARD_CHARS = 2500 * 1024;     // the data-URL string, ~1.8 MB of image
const BOARD_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const KEEP_HISTORY = 5;                 // earlier answers kept when a student re-sends
const TIMELINE_MAX = 300;

const now = () => new Date().toISOString();
const langOf = (req) => ((req.body && req.body.lang) === 'th' ? 'th' : 'en');

/* ------------------------------------------------------------------ *
 * Helpers shared by both sides
 * ------------------------------------------------------------------ */

/** Split a data URL into what the model wants; null if it is not an image. */
function parseImage(dataUrl) {
  const s = String(dataUrl || '');
  if (!s || s.length > MAX_BOARD_CHARS) return null;
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m || !BOARD_TYPES.includes(m[1])) return null;
  return { mimeType: m[1], data: m[2] };
}

/** A level the student may open right now (same rule as the level itself). */
function openLesson(req, res, lessonId) {
  const lessons = lessonsRoutes.orderedLessons();
  const idx = lessons.findIndex((l) => l.id === lessonId);
  if (idx === -1) { res.status(404).json({ error: 'That level does not exist.' }); return null; }
  if (lessonsRoutes.unlockInfo(lessons, idx, req.user).locked) {
    res.status(403).json({ error: 'This level is locked.' });
    return null;
  }
  return lessons[idx];
}

function storyQuestion(lesson, stepId) {
  return (lesson.storyboard || []).find((s) => s.type === 'question' && s.id === stepId) || null;
}

/** The correct answer of a pre/post-test question, as text for the model. */
function quizExpected(q) {
  const bits = [];
  if (q.type !== 'written' && Array.isArray(q.choices)) {
    const c = q.choices[q.correctIndex];
    if (c != null) bits.push(`Correct choice: ${c}`);
  }
  if (q.explanation) bits.push(`Teacher's explanation / answer guide: ${q.explanation}`);
  return bits.join('\n');
}

/** The expected answer of a challenge question, as text for the model. */
function challengeExpected(q) {
  return [
    q.rubric ? `Teacher's expected answer: ${q.rubric}` : '',
    ch.expectedText(q) ? `Answer key: ${ch.expectedText(q)}` : '',
    q.explanation ? `Marking guide: ${q.explanation}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Work out what a whiteboard belongs to, and check the student may send one.
 * Returns the context, or answers the request and returns null.
 */
function boardContext(req, res) {
  const b = req.body || {};
  const kind = String(b.kind || '');
  const questionId = String(b.questionId || b.stepId || '').slice(0, 80);
  if (!questionId) { res.status(400).json({ error: 'Which question is this whiteboard for?' }); return null; }

  if (kind === 'challenge') {
    const c = db.findById('challenges', String(b.challengeId || ''));
    if (!c) { res.status(404).json({ error: 'Challenge not found.' }); return null; }
    if (!c.published || !ch.isAssignedTo(c, req.user)) {
      res.status(403).json({ error: 'This challenge is not assigned to you.' });
      return null;
    }
    const q = ch.flatQuestions(c).find((x) => x.id === questionId);
    if (!q) { res.status(404).json({ error: 'Question not found.' }); return null; }
    if (!q.whiteboard) { res.status(400).json({ error: 'NO_WHITEBOARD' }); return null; }
    return {
      kind, key: `challenge:${c.id}:${q.id}`, questionId: q.id,
      challengeId: c.id, lessonId: c.lessonId || null,
      title: `${c.icon || '🧩'} ${c.title}`,
      question: q.question || '', expected: challengeExpected(q),
    };
  }

  if (kind === 'pre' || kind === 'post' || kind === 'story') {
    const lesson = openLesson(req, res, String(b.lessonId || ''));
    if (!lesson) return null;
    let q = null;
    if (kind === 'story') {
      q = storyQuestion(lesson, questionId);
    } else {
      // All three stored sets: older lessons may still hold questions under
      // `medium` / `hard` until the teacher next saves them (game.questionSet).
      const zone = kind === 'post' ? ((lesson.postTest && lesson.postTest.quizzes) || {}) : (lesson.quizzes || {});
      q = ['easy', 'medium', 'hard'].map((d) => (zone[d] || []).find((x) => x.id === questionId)).find(Boolean) || null;
    }
    if (!q) { res.status(404).json({ error: 'Question not found.' }); return null; }
    if (!q.whiteboard) { res.status(400).json({ error: 'NO_WHITEBOARD' }); return null; }
    return {
      kind, key: `${kind}:${lesson.id}:${q.id}`, questionId: q.id,
      challengeId: null, lessonId: lesson.id,
      title: `${lesson.icon || '🧪'} ${lesson.title}`,
      question: q.question || '',
      expected: kind === 'story'
        ? [q.expected ? `Teacher's expected answer: ${q.expected}` : '', q.aiNote ? `Teacher's note: ${q.aiNote}` : ''].filter(Boolean).join('\n')
        : quizExpected(q),
    };
  }

  res.status(400).json({ error: 'Unknown whiteboard kind.' });
  return null;
}

/** Where a piece of work came from, in words the teacher reads. */
const KIND_LABEL = { story: 'Storyboard question', pre: 'Pre-test', post: 'Post-test', challenge: 'Challenge' };

/* ------------------------------------------------------------------ *
 * Running Kru CJ — one place for both answers and boards, both callers
 * ------------------------------------------------------------------ */

/**
 * Spend one AI call from `payer`'s `purpose` allowance BEFORE the await (see
 * aiLimit.take), run `fn`, and give the call back if the model failed.
 * Returns { ok, result } or { ok:false, status, code }.
 */
async function withAllowance(payer, purpose, fn) {
  if (!config.aiEnabled()) return { ok: false, status: 503, code: 'AI_DISABLED' };
  try {
    aiLimit.take(payer, purpose);
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') return { ok: false, status: 429, code: 'AI_DAILY_LIMIT' };
    throw err;
  }
  db.save();
  // Persist the spend now, not at the end: the model call is long, and on
  // Postgres another request may re-read the store while we wait.
  await db.flush();
  try {
    return { ok: true, result: await fn() };
  } catch (err) {
    const live = db.findById('users', payer.id) || payer;
    aiLimit.refund(live, purpose);
    db.save();
    console.error('[ai/diagnose]', ai.describeFailure(err));
    const { status, code } = ai.failureOf(err);
    return { ok: false, status, code };
  }
}

/* The teacher may give Kru CJ what to look for at the moment they ask:
   the expected answer / criteria and their own instruction. Either one
   replaces what was saved with the question, for this run only. A field the
   request leaves out keeps the saved one. */
function overridesOf(req) {
  const b = req.body || {};
  const o = {};
  if (typeof b.expected === 'string') o.expected = b.expected.slice(0, 2000);
  if (typeof b.note === 'string') o.note = b.note.slice(0, 800);
  return o;
}
const pick = (over, key, saved) => (over && typeof over[key] === 'string' ? over[key] : saved);

async function analyzeStoryAnswer(recId, payer, purpose, lang, over) {
  const rec = db.findById('storyAnswers', recId);
  if (!rec) return { ok: false, status: 404, code: 'NOT_FOUND' };
  const lesson = db.findById('lessons', rec.lessonId);
  const step = lesson ? storyQuestion(lesson, rec.stepId) : null;
  const forAnswer = rec.updatedAt;

  const out = await withAllowance(payer, purpose, () => diag.diagnoseStoryAnswer({
    lessonTitle: rec.lessonTitle,
    question: (step && step.question) || rec.question,
    expected: pick(over, 'expected', step ? step.expected : ''),
    aiNote: pick(over, 'note', step ? step.aiNote : ''),
    answer: rec.answer,
    lang,
  }));

  // Re-find after the await: on Postgres the store may have been re-read.
  const live = db.findById('storyAnswers', recId);
  if (!live) return out;
  if (out.ok) {
    // A student may have re-sent while Kru CJ was reading the old answer.
    if (live.updatedAt !== forAnswer) return { ok: false, status: 409, code: 'ANSWER_CHANGED' };
    live.ai = { ...out.result, at: now(), lang };
    live.aiError = null;
  } else {
    live.aiError = out.code;
  }
  db.save();
  return out.ok ? { ok: true, ai: live.ai } : out;
}

async function analyzeBoard(recId, payer, purpose, lang, over) {
  const rec = db.findById('whiteboards', recId);
  if (!rec) return { ok: false, status: 404, code: 'NOT_FOUND' };
  // The picture is not kept in memory with the rest (src/db.js LAZY_FIELDS).
  const img = parseImage(await db.field('whiteboards', rec.id, 'image'));
  if (!img) return { ok: false, status: 400, code: 'BAD_IMAGE' };
  const forImage = rec.updatedAt;

  const out = await withAllowance(payer, purpose, () => diag.analyzeWhiteboard({
    where: `${KIND_LABEL[rec.kind] || rec.kind}: ${rec.title}`,
    question: rec.question,
    expected: pick(over, 'expected', rec.expected),
    studentAnswer: rec.answer,
    aiNote: pick(over, 'note', ''),
    image: img.data,
    mimeType: img.mimeType,
    lang,
  }));

  const live = db.findById('whiteboards', recId);
  if (!live) return out;
  if (out.ok) {
    if (live.updatedAt !== forImage) return { ok: false, status: 409, code: 'BOARD_CHANGED' };
    live.ai = { ...out.result, at: now(), lang };
    live.aiError = null;
  } else {
    live.aiError = out.code;
  }
  db.save();
  return out.ok ? { ok: true, ai: live.ai } : out;
}

/* ============================== STUDENT API ============================== */

studentRouter.use(authMiddleware, requireRole('student'));

/** GET /api/work/story/:lessonId — my answers to this level's storyboard questions. */
studentRouter.get('/story/:lessonId', (req, res) => {
  const answers = {};
  db.filter('storyAnswers', (a) => a.userId === req.user.id && a.lessonId === req.params.lessonId)
    .forEach((a) => { answers[a.stepId] = { id: a.id, answer: a.answer, updatedAt: a.updatedAt }; });
  const boards = {};
  db.filter('whiteboards', (w) => w.userId === req.user.id && w.lessonId === req.params.lessonId)
    .forEach((w) => { boards[w.key] = { id: w.id, updatedAt: w.updatedAt }; });
  res.json({ answers, boards });
});

/** POST /api/work/story/:lessonId/:stepId — answer one storyboard question. */
studentRouter.post('/story/:lessonId/:stepId', (req, res) => {
  const lesson = openLesson(req, res, req.params.lessonId);
  if (!lesson) return;
  const entry = (req.user.progress || {})[lesson.id];
  if (game.activityState(lesson, entry).storyLocked) return res.status(403).json({ error: 'STORY_LOCKED' });

  const step = storyQuestion(lesson, req.params.stepId);
  if (!step) return res.status(404).json({ error: 'Question not found.' });

  const answer = String((req.body && req.body.answer) || '').trim().slice(0, MAX_ANSWER);
  if (!answer) return res.status(400).json({ error: 'EMPTY_ANSWER' });

  const at = now();
  let rec = db.find('storyAnswers', (a) => a.userId === req.user.id && a.lessonId === lesson.id && a.stepId === step.id);
  if (rec) {
    if (rec.answer !== answer) {
      rec.history = [...(rec.history || []), { answer: rec.answer, at: rec.updatedAt, ai: rec.ai || null }].slice(-KEEP_HISTORY);
      rec.ai = null;
      rec.aiError = null;
    }
    Object.assign(rec, {
      answer, question: step.question, userName: req.user.name, userAvatar: req.user.avatar || '',
      lessonTitle: lesson.title, updatedAt: at, sends: (rec.sends || 1) + 1,
    });
    db.save();
  } else {
    rec = db.insert('storyAnswers', {
      id: crypto.randomUUID(),
      userId: req.user.id,
      userName: req.user.name,
      userAvatar: req.user.avatar || '',
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      stepId: step.id,
      question: step.question,
      answer,
      ai: null,
      aiError: null,
      history: [],
      sends: 1,
      createdAt: at,
      updatedAt: at,
    });
  }
  // `needsAnalysis` tells the page to fire /analyze — only when there is a model to ask.
  res.json({ ok: true, id: rec.id, updatedAt: rec.updatedAt, needsAnalysis: !rec.ai && config.aiEnabled() });
});

/**
 * POST /api/work/story-answer/:id/analyze — Kru CJ reads it for the teacher.
 * Fired in the background by the student's page; the student never sees the
 * result, only that the call finished.
 */
studentRouter.post('/story-answer/:id/analyze', async (req, res, next) => {
  try {
    const rec = db.findById('storyAnswers', req.params.id);
    if (!rec || rec.userId !== req.user.id) return res.status(404).json({ error: 'Not found.' });
    if (rec.ai) return res.json({ ok: true, already: true });
    const out = await analyzeStoryAnswer(rec.id, req.user, 'diagnose', langOf(req));
    if (!out.ok) return res.status(out.status).json({ error: out.code });
    res.json({ ok: true });   // the diagnosis itself is the teacher's
  } catch (err) { next(err); }
});

/** POST /api/work/whiteboard — send my whiteboard in. */
studentRouter.post('/whiteboard', (req, res) => {
  const ctx = boardContext(req, res);
  if (!ctx) return;
  const image = String((req.body && req.body.image) || '');
  if (!parseImage(image)) {
    return res.status(400).json({
      error: image.length > MAX_BOARD_CHARS ? 'BOARD_TOO_BIG' : 'BAD_IMAGE',
    });
  }
  const answer = String((req.body && req.body.answer) || '').slice(0, MAX_ANSWER);

  const at = now();
  let rec = db.find('whiteboards', (w) => w.userId === req.user.id && w.key === ctx.key);
  const fields = {
    kind: ctx.kind, key: ctx.key, questionId: ctx.questionId,
    lessonId: ctx.lessonId, challengeId: ctx.challengeId,
    title: ctx.title, question: ctx.question, expected: ctx.expected,
    userName: req.user.name, userAvatar: req.user.avatar || '',
    image, answer, ai: null, aiError: null, updatedAt: at,
  };
  if (rec) {
    Object.assign(rec, fields, { sends: (rec.sends || 1) + 1 });
    db.save();
  } else {
    rec = db.insert('whiteboards', { id: crypto.randomUUID(), userId: req.user.id, createdAt: at, sends: 1, ...fields });
  }
  res.json({ ok: true, id: rec.id, updatedAt: rec.updatedAt, needsAnalysis: config.aiEnabled() });
});

/** POST /api/work/whiteboard/:id/analyze — Kru CJ reads the board for the teacher. */
studentRouter.post('/whiteboard/:id/analyze', async (req, res, next) => {
  try {
    const rec = db.findById('whiteboards', req.params.id);
    if (!rec || rec.userId !== req.user.id) return res.status(404).json({ error: 'Not found.' });
    if (rec.ai) return res.json({ ok: true, already: true });
    const out = await analyzeBoard(rec.id, req.user, 'diagnose', langOf(req));
    if (!out.ok) return res.status(out.status).json({ error: out.code });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ============================== TEACHER API ============================== */

teacherRouter.use(authMiddleware, requireRole('teacher'));

const pct = (e, m) => (m > 0 ? Math.round((e / m) * 100) : null);
const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : null);

/** A whiteboard without its picture — what every list carries. */
function boardMeta(w) {
  const { image, expected, ...rest } = w;
  return rest;
}

/** Per-level progress for one student, in map order. */
function levelRows(user) {
  return lessonsRoutes.orderedLessons().map((l) => {
    const p = (user.progress || {})[l.id] || {};
    const post = p.post || {};
    const storyQs = (l.storyboard || []).filter((s) => s.type === 'question');
    // A whiteboard question is answered by its board, not by text.
    const answered = storyQs.filter((s) => (s.whiteboard
      ? db.find('whiteboards', (w) => w.userId === user.id && w.key === `story:${l.id}:${s.id}`)
      : db.find('storyAnswers', (a) => a.userId === user.id && a.lessonId === l.id && a.stepId === s.id))).length;
    return {
      id: l.id,
      title: l.title,
      icon: l.icon || '🧪',
      done: game.levelDone(l, p),
      storyDone: !!p.storyDone,
      storyAt: p.storyCompletedAt || null,
      storyQuestions: storyQs.length,
      storyAnswered: Math.min(answered, storyQs.length),
      pre: p.attempts ? {
        attempts: p.attempts || 0,
        bestScore: p.bestScore || 0,
        lastScore: p.lastScore == null ? null : p.lastScore,
        percent: p.total ? pct(p.bestCorrect || 0, p.total) : null,
        passed: !!p.passed,
        awaiting: !!p.awaitingGrading,
        at: p.completedAt || null,
      } : null,
      post: post.attempts ? {
        attempts: post.attempts || 0,
        bestScore: post.bestScore || 0,
        percent: post.total ? pct(post.bestEarned != null ? post.bestEarned : (post.bestCorrect || 0), post.total) : null,
        passed: !!post.passed,
        awaiting: !!post.awaitingGrading,
        at: post.completedAt || null,
      } : null,
    };
  });
}

/**
 * Everything the student did, as dated events, newest first.
 *
 * Each event is a `type` plus the bits that fill it in (`p`). The sentence is
 * built in the browser from `lg.ev.<type>`, so the timeline reads in Thai or
 * English like the rest of the console.
 */
function timeline(user) {
  const ev = [];
  const add = (at, type, p) => { if (at) ev.push({ at, type, p: p || {} }); };
  const lessons = db.all('lessons');
  const title = (id) => { const l = lessons.find((x) => x.id === id); return l ? l.title : ''; };
  const outcome = (won) => (won === true ? 'won' : won === false ? 'lost' : 'open');

  add(user.createdAt, 'signup');
  (user.logins || []).forEach((at) => add(at, 'login'));
  Object.entries(user.progress || {}).forEach(([lid, p]) => {
    add(p.storyCompletedAt, 'story', { title: title(lid) });
    add(p.completedAt, 'prePass', { title: title(lid), score: p.bestScore || 0 });
    if (p.post) add(p.post.completedAt, 'postDone', { title: title(lid), score: p.post.bestScore || 0 });
  });
  (user.certificates || []).forEach((c) => add(c.dateEarned, 'certificate', { title: c.title }));
  db.filter('submissions', (s) => s.userId === user.id).forEach((s) => {
    const mode = s.mode === 'post' ? 'post' : 'pre';
    add(s.createdAt, mode + 'Submit', { title: s.lessonTitle });
    add(s.gradedAt, mode + 'Graded', { title: s.lessonTitle, score: s.score == null ? '' : s.score });
  });
  db.filter('challengeSubmissions', (s) => s.userId === user.id).forEach((s) => {
    add(s.createdAt, 'challenge', { title: s.challengeTitle, e: s.autoEarned || 0, m: s.maxPoints || 0 });
    if (s.gradedAt && s.gradedAt !== s.createdAt) {
      add(s.gradedAt, 'challengeGraded', { title: s.challengeTitle, e: s.earned || 0, m: s.maxPoints || 0 });
    }
  });
  db.filter('questSubmissions', (s) => s.userId === user.id).forEach((s) => {
    add(s.createdAt, 'quest', { title: s.questTitle, e: s.earned || 0, m: s.maxPoints || 0, coins: s.coinsAwarded || 0 });
  });
  db.filter('battles', (b) => b.attackerId === user.id || b.defenderId === user.id).forEach((b) => {
    const won = b.status === 'open' ? null : (b.attackerId === user.id) === (b.status === 'won');
    add(b.startedAt, b.attackerId === user.id ? 'battleAttack' : 'battleDefend', {
      name: b.attackerId === user.id ? b.defenderName : b.attackerName,
      diff: b.difficulty,
      result: outcome(won),
    });
  });
  db.filter('duels', (d) => d.challengerId === user.id || d.defenderId === user.id).forEach((d) => {
    if (d.challengerId === user.id) add(d.createdAt, 'duelSent', { name: d.defenderName });
    else if (d.status === 'answered') add(d.resolvedAt, 'duelAnswered', { name: d.challengerName, result: d.defenderWon ? 'right' : 'wrong' });
    else if (d.status === 'declined') add(d.resolvedAt, 'duelDeclined', { name: d.challengerName });
  });
  db.filter('tutorLogs', (l) => l.userId === user.id).forEach((l) => {
    add(l.createdAt, l.kind === 'check' ? 'tutorCheck' : 'tutorAsk', { title: l.challengeTitle || '' });
  });
  db.filter('storyAnswers', (a) => a.userId === user.id)
    .forEach((a) => add(a.updatedAt, 'storyAnswer', { title: a.lessonTitle, level: a.ai ? a.ai.level : '' }));
  db.filter('whiteboards', (w) => w.userId === user.id)
    .forEach((w) => add(w.updatedAt, 'whiteboard', { kind: w.kind, title: w.title, level: w.ai ? w.ai.level : '' }));
  db.all('posts').forEach((p) => {
    if (p.author && p.author.id === user.id) add(p.createdAt, 'boardPost', { title: title(p.lessonId) });
    (p.comments || []).forEach((c) => { if (c.author && c.author.id === user.id) add(c.at, 'boardComment', { title: title(p.lessonId) }); });
    (p.questions || []).forEach((q) => { if (q.author && q.author.id === user.id) add(q.at, 'boardQuestion', { title: title(p.lessonId) }); });
  });
  db.filter('labRounds', (r) => r.userId === user.id && r.done)
    .forEach((r) => add(r.answeredAt, 'lab', { game: r.game, result: r.correct ? 'right' : 'wrong' }));

  ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return ev.slice(0, TIMELINE_MAX);
}

/** The headline numbers for one student — the overview row, and the detail header. */
function headline(user) {
  const rows = levelRows(user);
  const subs = db.filter('challengeSubmissions', (s) => s.userId === user.id);
  let chE = 0; let chM = 0;
  subs.forEach((s) => { chE += s.status === 'graded' ? (s.earned || 0) : (s.autoEarned || 0); chM += s.maxPoints || 0; });
  const story = db.filter('storyAnswers', (a) => a.userId === user.id);
  const boards = db.filter('whiteboards', (w) => w.userId === user.id);
  const levels = [...story, ...boards].filter((x) => x.ai).map((x) => x.ai.level);
  const insight = db.findById('studentInsights', user.id);
  const last = timeline(user)[0];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar || '🧑‍🎓',
    points: user.points || 0,
    coins: user.coins || 0,
    certificates: (user.certificates || []).length,
    levelsDone: rows.filter((r) => r.done).length,
    levelsTotal: rows.length,
    preAvg: avg(rows.filter((r) => r.pre && r.pre.percent != null).map((r) => r.pre.percent)),
    postAvg: avg(rows.filter((r) => r.post && r.post.percent != null).map((r) => r.post.percent)),
    challengePct: pct(chE, chM),
    challenges: subs.length,
    quests: db.filter('questSubmissions', (s) => s.userId === user.id).length,
    storyAnswers: story.length,
    whiteboards: boards.length,
    aiLevels: {
      strong: levels.filter((l) => l === 'strong').length,
      mixed: levels.filter((l) => l === 'mixed').length,
      struggling: levels.filter((l) => l === 'struggling').length,
    },
    insightLevel: insight ? insight.level : null,
    lastActive: last ? last.at : null,
    loginCount: user.loginCount || 0,
    joinedAt: user.createdAt || null,
  };
}

/** GET /api/teacher/logs — every student, one row each. */
teacherRouter.get('/', (req, res) => {
  const students = db.filter('users', (u) => u.role === 'student').map(headline)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.json({ students, aiEnabled: config.aiEnabled() });
});

/** GET /api/teacher/logs/student/:id — one student's whole record. */
teacherRouter.get('/student/:id', (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user || user.role !== 'student') return res.status(404).json({ error: 'Student not found.' });

  const battles = db.filter('battles', (b) => b.attackerId === user.id || b.defenderId === user.id);
  const wonBattle = (b) => (b.attackerId === user.id ? b.status === 'won' : b.status === 'lost');
  const duels = db.filter('duels', (d) => d.challengerId === user.id || d.defenderId === user.id);
  const posts = db.all('posts');
  const lab = db.filter('labRounds', (r) => r.userId === user.id && r.done);

  res.json({
    aiEnabled: config.aiEnabled(),
    student: {
      ...headline(user),
      coinsEarned: user.coinsEarned || 0,
      lastLoginAt: user.lastLoginAt || null,
      elements: Array.isArray(user.elements) ? user.elements.length : 0,
    },
    insight: db.findById('studentInsights', user.id) || null,
    levels: levelRows(user),
    storyAnswers: db.filter('storyAnswers', (a) => a.userId === user.id)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    whiteboards: db.filter('whiteboards', (w) => w.userId === user.id)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(boardMeta),
    tests: db.filter('submissions', (s) => s.userId === user.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((s) => ({
        id: s.id, lessonTitle: s.lessonTitle, lessonIcon: s.lessonIcon, mode: s.mode, status: s.status,
        mcqCorrect: s.mcqCorrect, mcqTotal: s.mcqTotal, finalEarned: s.finalEarned == null ? null : s.finalEarned,
        maxPoints: s.maxPoints, score: s.score == null ? null : s.score, passed: s.passed,
        written: (s.written || []).map((w) => ({ question: w.question, answer: w.answer, points: w.points, awarded: w.awarded })),
        createdAt: s.createdAt, gradedAt: s.gradedAt || null,
      })),
    challenges: db.filter('challengeSubmissions', (s) => s.userId === user.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((s) => ({
        id: s.id, challengeId: s.challengeId, title: s.challengeTitle, icon: s.challengeIcon,
        status: s.status, earned: s.status === 'graded' ? s.earned : s.autoEarned, maxPoints: s.maxPoints,
        percent: pct(s.status === 'graded' ? (s.earned || 0) : (s.autoEarned || 0), s.maxPoints || 0),
        feedback: s.feedback || '', aiDiagnosis: s.aiDiagnosis || null,
        createdAt: s.createdAt, gradedAt: s.gradedAt || null,
      })),
    quests: db.filter('questSubmissions', (s) => s.userId === user.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((s) => ({ id: s.id, title: s.questTitle, icon: s.questIcon, earned: s.earned, maxPoints: s.maxPoints, coins: s.coinsAwarded || 0, createdAt: s.createdAt })),
    battles: {
      total: battles.length,
      won: battles.filter(wonBattle).length,
      recent: battles.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 10).map((b) => ({
        at: b.startedAt, attacking: b.attackerId === user.id,
        opponent: b.attackerId === user.id ? b.defenderName : b.attackerName,
        difficulty: b.difficulty, won: wonBattle(b), open: b.status === 'open', coins: b.coinsMoved || 0,
      })),
    },
    duels: {
      sent: duels.filter((d) => d.challengerId === user.id).length,
      received: duels.filter((d) => d.defenderId === user.id).length,
      answeredRight: duels.filter((d) => d.defenderId === user.id && d.defenderWon === true).length,
    },
    tutor: db.filter('tutorLogs', (l) => l.userId === user.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 60)
      .map((l) => ({ kind: l.kind || 'ask', challengeTitle: l.challengeTitle || '', questionText: l.questionText || '', asked: l.question || '', reply: l.answer || '', refused: !!l.refused, error: !!l.error, at: l.createdAt })),
    board: {
      posts: posts.filter((p) => p.author && p.author.id === user.id).length,
      comments: posts.reduce((n, p) => n + (p.comments || []).filter((c) => c.author && c.author.id === user.id).length, 0),
      questions: posts.reduce((n, p) => n + (p.questions || []).filter((q) => q.author && q.author.id === user.id).length, 0),
    },
    lab: { rounds: lab.length, correct: lab.filter((r) => r.correct).length },
    timeline: timeline(user),
  });
});

/** GET /api/teacher/logs/story — every storyboard answer, for the by-question view. */
teacherRouter.get('/story', (req, res) => {
  const lessons = lessonsRoutes.orderedLessons();
  const answers = db.all('storyAnswers');
  const out = lessons.map((l) => ({
    id: l.id,
    title: l.title,
    icon: l.icon || '🧪',
    questions: (l.storyboard || []).filter((s) => s.type === 'question').map((s) => ({
      id: s.id,
      question: s.question,
      expected: s.expected || '',
      whiteboard: !!s.whiteboard,
      answers: answers.filter((a) => a.lessonId === l.id && a.stepId === s.id)
        .sort((a, b) => (a.userName || '').localeCompare(b.userName || '')),
      // On a whiteboard question the board IS the answer.
      boards: db.filter('whiteboards', (w) => w.key === `story:${l.id}:${s.id}`)
        .sort((a, b) => (a.userName || '').localeCompare(b.userName || '')).map(boardMeta),
    })),
  })).filter((l) => l.questions.length);
  res.json({ lessons: out, aiEnabled: config.aiEnabled() });
});

/** GET /api/teacher/logs/whiteboards — every board, newest first, no pictures. */
teacherRouter.get('/whiteboards', (req, res) => {
  const boards = db.all('whiteboards').slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(boardMeta);
  res.json({ whiteboards: boards, aiEnabled: config.aiEnabled() });
});

/** GET /api/teacher/logs/whiteboard/:id/image — one board's picture. */
teacherRouter.get('/whiteboard/:id/image', async (req, res, next) => {
  try {
    const w = db.findById('whiteboards', req.params.id);
    if (!w) return res.status(404).json({ error: 'Whiteboard not found.' });
    res.json({ image: (await db.field('whiteboards', w.id, 'image')) || '' });
  } catch (err) { next(err); }
});

/** GET /api/teacher/logs/analyze-context/:kind/:id — what Kru CJ would be
 *  given for one story answer or board, so the "Analyze with Kru CJ" dialog
 *  can show it and let the teacher change it for this run. */
teacherRouter.get('/analyze-context/:kind/:id', (req, res) => {
  if (req.params.kind === 'story') {
    const rec = db.findById('storyAnswers', req.params.id);
    if (!rec) return res.status(404).json({ error: 'NOT_FOUND' });
    const lesson = db.findById('lessons', rec.lessonId);
    const step = lesson ? storyQuestion(lesson, rec.stepId) : null;
    return res.json({ question: (step && step.question) || rec.question || '',
      expected: (step && step.expected) || '', note: (step && step.aiNote) || '' });
  }
  const rec = db.findById('whiteboards', req.params.id);
  if (!rec) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ question: rec.question || '', expected: rec.expected || '', note: '' });
});

/** POST /api/teacher/logs/story-answer/:id/analyze — run (or re-run) Kru CJ. */
teacherRouter.post('/story-answer/:id/analyze', async (req, res, next) => {
  try {
    const out = await analyzeStoryAnswer(req.params.id, req.user, 'mark', langOf(req), overridesOf(req));
    if (!out.ok) return res.status(out.status).json({ error: out.code, ...aiLimit.statusOf(req.user, 'mark') });
    res.json({ ai: out.ai, ...aiLimit.statusOf(req.user, 'mark') });
  } catch (err) { next(err); }
});

/** POST /api/teacher/logs/whiteboard/:id/analyze — run (or re-run) Kru CJ. */
teacherRouter.post('/whiteboard/:id/analyze', async (req, res, next) => {
  try {
    const out = await analyzeBoard(req.params.id, req.user, 'mark', langOf(req), overridesOf(req));
    if (!out.ok) return res.status(out.status).json({ error: out.code, ...aiLimit.statusOf(req.user, 'mark') });
    res.json({ ai: out.ai, ...aiLimit.statusOf(req.user, 'mark') });
  } catch (err) { next(err); }
});

/** One student's record laid out as text for the profile call. */
function recordText(user) {
  const h = headline(user);
  const lines = [];
  lines.push(`STUDENT. Levels finished ${h.levelsDone}/${h.levelsTotal}. ` +
    `Pre-test average ${h.preAvg == null ? 'n/a' : h.preAvg + '%'}, post-test average ${h.postAvg == null ? 'n/a' : h.postAvg + '%'}, ` +
    `challenges ${h.challengePct == null ? 'n/a' : h.challengePct + '%'} over ${h.challenges}. Signed in ${h.loginCount} time(s).`);

  lines.push('\nLEVELS');
  levelRows(user).forEach((r) => {
    lines.push(`- ${r.title}: story ${r.storyDone ? 'read' : 'not read'}; ` +
      `pre ${r.pre ? `${r.pre.percent == null ? '?' : r.pre.percent + '%'}${r.pre.passed ? ' passed' : ''} in ${r.pre.attempts} attempt(s)` : 'not taken'}; ` +
      `post ${r.post ? `${r.post.percent == null ? '?' : r.post.percent + '%'}${r.post.passed ? ' passed' : ''}${r.post.awaiting ? ' (awaiting marking)' : ''}` : 'not taken'}`);
  });

  const chs = db.filter('challengeSubmissions', (s) => s.userId === user.id);
  if (chs.length) {
    lines.push('\nCHALLENGES');
    chs.forEach((s) => {
      const e = s.status === 'graded' ? s.earned : s.autoEarned;
      lines.push(`- ${s.challengeTitle}: ${e}/${s.maxPoints}${s.status !== 'graded' ? ' (partly unmarked)' : ''}` +
        (s.aiDiagnosis && s.aiDiagnosis.summary ? ` — Kru CJ: ${s.aiDiagnosis.summary}` : ''));
    });
  }

  const story = db.filter('storyAnswers', (a) => a.userId === user.id);
  if (story.length) {
    lines.push('\nSTORYBOARD QUESTIONS (ungraded)');
    story.forEach((a) => {
      lines.push(`- Q: ${String(a.question).slice(0, 300)}\n  A: ${String(a.answer).slice(0, 500)}` +
        (a.ai ? `\n  Kru CJ (${a.ai.level}): ${a.ai.summary}` : ''));
    });
  }

  const boards = db.filter('whiteboards', (w) => w.userId === user.id);
  if (boards.length) {
    lines.push('\nWHITEBOARD WORKING');
    boards.forEach((w) => {
      lines.push(`- ${KIND_LABEL[w.kind] || w.kind} "${w.title}": ${String(w.question).slice(0, 200)}` +
        (w.ai ? `\n  Kru CJ (${w.ai.level}): ${w.ai.summary}${w.ai.errors.length ? ' Errors: ' + w.ai.errors.join('; ') : ''}` : ' (not analysed)'));
    });
  }

  const quests = db.filter('questSubmissions', (s) => s.userId === user.id);
  if (quests.length) {
    lines.push('\nDAILY QUESTS');
    quests.forEach((s) => lines.push(`- ${s.questTitle}: ${s.earned}/${s.maxPoints}`));
  }

  const tutor = db.filter('tutorLogs', (l) => l.userId === user.id);
  if (tutor.length) {
    lines.push(`\nASKED KRU CJ FOR HELP ${tutor.length} time(s). Most recent questions:`);
    tutor.slice(-8).forEach((l) => lines.push(`- ${String(l.question).slice(0, 200)}`));
  }
  return lines.join('\n');
}

/** POST /api/teacher/logs/student/:id/summary — Kru CJ's overall profile. */
teacherRouter.post('/student/:id/summary', async (req, res, next) => {
  try {
    const user = db.findById('users', req.params.id);
    if (!user || user.role !== 'student') return res.status(404).json({ error: 'Student not found.' });
    const lang = langOf(req);
    const dataText = recordText(user);
    const out = await withAllowance(req.user, 'mark', () => diag.summarizeStudent({ dataText, lang }));
    if (!out.ok) return res.status(out.status).json({ error: out.code, ...aiLimit.statusOf(req.user, 'mark') });

    const insight = { id: user.id, userId: user.id, ...out.result, lang, at: now() };
    const existing = db.findById('studentInsights', user.id);
    if (existing) Object.assign(existing, insight);
    else db.insert('studentInsights', insight);
    db.save();
    res.json({ insight, ...aiLimit.statusOf(req.user, 'mark') });
  } catch (err) { next(err); }
});

module.exports = { studentRouter, teacherRouter };
