/**
 * AI tutor routes — Kru CJ helps with a challenge question without answering it.
 *
 * Collections used: `tutorLogs` (auto-created by db.all on first use).
 *
 * Paid for out of the Daily Quest coin wallet, with a few free questions a day
 * (see src/tutorCredit.js).
 *
 * Every exchange is logged. These are minors, so a teacher must be able to read
 * back what was said. The log is trimmed per student because storyboard and
 * challenge images already make the store big — see CLAUDE.md "db.json grows".
 *
 * Two different things live here, and they have OPPOSITE rules about the answer:
 *
 *   POST /ask    — a hint. The model is handed `sanitizeQuestion()` output and
 *                  has never seen the key. Costs coins (src/tutorCredit.js).
 *   POST /check  — a look over the student's own written answer, against the
 *                  teacher's rubric. The model IS handed the rubric, so the
 *                  containment lives in the prompt, in a hard per-question cap,
 *                  and in this log. Read the header of src/aiMarking.js before
 *                  touching it. Free, because checking your own work is doing
 *                  the work, not buying a hint.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const ch = require('../challenges');
const config = require('../config');
const tutor = require('../tutor');
const marking = require('../aiMarking');
const aiLimit = require('../aiLimit');
const ai = require('../aiQuestions'); // failureOf/describeFailure: one failure vocabulary for both AI features
const credit = require('../tutorCredit');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();

const LOGS_PER_STUDENT = 200;

router.use(authMiddleware, requireRole('student'));

/* ------------------------------- helpers -------------------------------- */

/** Record one exchange and keep the per-student log bounded. */
function logExchange(user, entry) {
  const logs = db.all('tutorLogs');
  logs.push({
    id: crypto.randomUUID(),
    userId: user.id,
    userName: user.name,
    createdAt: new Date().toISOString(),
    ...entry,
  });

  // Trim this student's oldest entries only, so one chatty student cannot push
  // another student's history out of the log.
  const mine = logs.filter((l) => l.userId === user.id);
  if (mine.length > LOGS_PER_STUDENT) {
    const doomed = new Set(mine.slice(0, mine.length - LOGS_PER_STUDENT).map((l) => l.id));
    for (let i = logs.length - 1; i >= 0; i--) {
      if (doomed.has(logs[i].id)) logs.splice(i, 1);
    }
  }
}

/**
 * Find the challenge the student is allowed to open, or answer the request.
 * Mirrors `openChallenge` in challenges.routes.js — a student must not be able
 * to get tutoring on a challenge that was never assigned to them.
 */
function openChallenge(req, res) {
  const c = db.findById('challenges', req.body.challengeId);
  if (!c) { res.status(404).json({ error: 'Challenge not found.' }); return null; }
  if (!c.published || !ch.isAssignedTo(c, req.user)) {
    res.status(403).json({ error: 'This challenge is not assigned to you.' });
    return null;
  }
  return c;
}

/* -------------------------------- routes -------------------------------- */

/** GET /api/tutor/status — can I ask, is it free, what does it cost? */
router.get('/status', (req, res) => {
  res.json({ enabled: config.aiEnabled(), ...credit.statusOf(req.user) });
});

/**
 * POST /api/tutor/ask — ask Kru CJ about one challenge question.
 * Body: { challengeId, questionId, message, draft?, history?, lang? }
 */
router.post('/ask', async (req, res) => {
  if (!config.aiEnabled()) {
    return res.status(503).json({ error: 'The AI tutor is not set up on this server yet.' });
  }

  const message = String((req.body && req.body.message) || '').trim();
  if (!message) return res.status(400).json({ error: 'Please type a question first.' });
  if (message.length > tutor.MAX_MESSAGE_CHARS) {
    return res.status(400).json({ error: 'That question is too long.' });
  }

  const challenge = openChallenge(req, res);
  if (!challenge) return;

  // flatQuestions so simulation sub-questions can be asked about too.
  const raw = ch.flatQuestions(challenge).find((q) => q.id === req.body.questionId);
  if (!raw) return res.status(404).json({ error: 'Question not found.' });

  // THE safety line: the model only ever sees the same projection the student's
  // browser gets. Answer keys and the teacher's marking guide are stripped here.
  const question = ch.sanitizeQuestion(raw);

  const lang = req.body.lang === 'th' ? 'th' : 'en';
  const draft = String(req.body.draft || '').slice(0, tutor.MAX_MESSAGE_CHARS);

  // Take payment BEFORE the await. See the note in tutorCredit.charge().
  let receipt;
  try {
    receipt = credit.charge(req.user);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') {
      return res.status(402).json({
        error: 'INSUFFICIENT_COINS',
        ...credit.statusOf(req.user),
      });
    }
    throw err;
  }
  db.save();

  try {
    const result = await tutor.ask({
      message,
      question,
      draft,
      history: req.body.history,
      lang,
    });

    if (result.refused) {
      // No usable answer, so don't charge for it.
      credit.refund(req.user, receipt);
      logExchange(req.user, {
        challengeId: challenge.id,
        questionId: raw.id,
        lang,
        question: message,
        answer: '',
        refused: true,
        charged: 0,
      });
      db.save();
      return res.status(200).json({
        reply: '',
        refused: true,
        error: 'I cannot help with that one. Try asking about the chemistry in the question.',
        ...credit.statusOf(req.user),
      });
    }

    logExchange(req.user, {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      questionId: raw.id,
      questionText: question.question,
      lang,
      question: message,
      answer: result.text,
      refused: false,
      paidWith: receipt.kind,
      charged: receipt.charged,
    });
    db.save();

    res.json({ reply: result.text, refused: false, ...credit.statusOf(req.user) });
  } catch (err) {
    // The student got nothing, so give the payment back.
    credit.refund(req.user, receipt);
    // Still log the attempt with no answer — a request that errored out is not
    // the same as one that never happened, and a teacher reading this log for
    // safety reasons needs to see every question a student actually typed.
    logExchange(req.user, {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      questionId: raw.id,
      questionText: question.question,
      lang,
      question: message,
      answer: '',
      refused: false,
      error: true,
      charged: 0,
    });
    db.save();
    console.error('[tutor]', ai.describeFailure(err));

    /* Which failure it was matters, because these read very differently to the
       person on the other end:
         AI_BUSY     — the provider's OWN rate limit, distinct from the coin and
                       free-question limits, and common on a free tier.
         AI_BAD_KEY  — the provider rejected the key. A student can do nothing
                       about it, so say plainly that it is the server, not them;
                       the detail is in the log for whoever deployed it.
       Everything else stays the generic "try again". */
    const { status, code } = ai.failureOf(err);
    const MESSAGES = {
      AI_BUSY: 'Kru CJ is getting a lot of questions right now — wait about a minute and try again.',
      AI_BAD_KEY: 'Kru CJ is not set up correctly on this server. Please tell your teacher.',
      AI_FAILED: 'Kru CJ could not answer just now. Please try again in a moment.',
    };
    res.status(status).json({ error: MESSAGES[code], ...credit.statusOf(req.user) });
  }
});

/**
 * POST /api/tutor/check — look over my written answer before I hand it in.
 * Body: { challengeId, questionId, answer, lang }
 *
 * Deliberately NOT sanitized: `checkAnswer` needs the teacher's rubric to say
 * anything useful. See the "THE INVERSION" note in src/aiMarking.js.
 */
router.post('/check', async (req, res) => {
  if (!config.aiEnabled()) {
    return res.status(503).json({ error: 'AI_DISABLED' });
  }

  const challenge = openChallenge(req, res);
  if (!challenge) return;

  const raw = ch.flatQuestions(challenge).find((q) => q.id === req.body.questionId);
  if (!raw) return res.status(404).json({ error: 'Question not found.' });

  // The teacher has to have opted this question in AND written a rubric. One
  // test, shared with the player and the marker, so they cannot disagree.
  if (!ch.isAiMarkable(raw)) {
    return res.status(400).json({ error: 'NOT_CHECKABLE' });
  }

  const answer = String((req.body && req.body.answer) || '').trim();
  // Refuse an empty answer here rather than spending a check on it: the reply
  // would only be "write your first step", which the button already implies.
  if (!answer) return res.status(400).json({ error: 'EMPTY_ANSWER' });

  const lang = req.body.lang === 'th' ? 'th' : 'en';

  /* Both allowances are spent BEFORE the await, for the reason in
     aiLimit.take(): db.js has no transactions, so a check made after an await
     lets two concurrent requests both pass it. The daily one goes first because
     it is what rebuilds `user.aiUsage` on a new school day. */
  try {
    aiLimit.take(req.user, 'check');
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') {
      return res.status(429).json({ error: 'AI_DAILY_LIMIT', ...aiLimit.statusOf(req.user, 'check') });
    }
    throw err;
  }
  try {
    marking.takeCheck(req.user, raw.id);
  } catch (err) {
    if (err.code === 'CHECK_LIMIT') {
      aiLimit.refund(req.user, 'check');
      db.save();
      return res.status(429).json({ error: 'CHECK_LIMIT', checksLeft: 0, maxChecks: marking.MAX_CHECKS });
    }
    throw err;
  }
  db.save();

  const giveBack = () => {
    marking.refundCheck(req.user, raw.id);
    aiLimit.refund(req.user, 'check');
  };

  try {
    const result = await marking.checkAnswer({ question: raw, answer, lang });

    logExchange(req.user, {
      kind: 'check',
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      questionId: raw.id,
      questionText: raw.question,
      lang,
      question: answer,          // what the student had written when they asked
      answer: result.feedback,   // what Kru CJ said back
      refused: false,
      charged: 0,
    });
    db.save();

    res.json({ ...result, checksLeft: marking.checksLeft(req.user, raw.id), maxChecks: marking.MAX_CHECKS });
  } catch (err) {
    giveBack();
    // Log the attempt even though it failed: a teacher reading this log for
    // safety reasons needs every answer a student actually submitted to Kru CJ.
    logExchange(req.user, {
      kind: 'check',
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      questionId: raw.id,
      questionText: raw.question,
      lang,
      question: answer,
      answer: '',
      refused: false,
      error: true,
      charged: 0,
    });
    db.save();
    console.error('[tutor/check]', ai.describeFailure(err));

    const { status, code } = ai.failureOf(err);
    const MESSAGES = {
      AI_BUSY: 'Kru CJ is looking at a lot of answers right now — wait about a minute and try again.',
      AI_BAD_KEY: 'Kru CJ is not set up correctly on this server. Please tell your teacher.',
      AI_FAILED: 'Kru CJ could not read that just now. Please try again in a moment.',
    };
    res.status(status).json({
      error: MESSAGES[code],
      checksLeft: marking.checksLeft(req.user, raw.id),
      maxChecks: marking.MAX_CHECKS,
    });
  }
});

module.exports = router;
