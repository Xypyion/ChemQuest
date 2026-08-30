/**
 * AI question generation — teacher routes.
 *
 * Mounted in server.js as `/api/teacher/ai`, BEFORE the generic `/api/teacher`.
 *
 * What this does NOT do is save anything. A generated question comes back as a
 * draft for the teacher to read, edit and then save through the ordinary quest
 * or battle-bank endpoints. That is deliberate: the teacher is the authority on
 * what their class is asked, and a route that wrote straight into a live bank
 * would put a model's arithmetic in front of students with nobody having looked
 * at it. It also means there is exactly one save path per feature, still owned
 * by `quests.routes.js` / `battles.routes.js`.
 *
 * Everything the model returns is put through the same normalising and
 * auto-markable checks as a hand-typed question, so a malformed or unkeyed
 * question is dropped here rather than surfacing later as a quest that cannot
 * pay out.
 */
const express = require('express');
const ch = require('../challenges');
const qs = require('../quests');
const bt = require('../battles');
const config = require('../config');
const ai = require('../aiQuestions');
const aiLimit = require('../aiLimit');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();

router.use(authMiddleware, requireRole('teacher'));

/** Question types the generator may be asked for — all auto-markable. */
const TYPES = qs.QUEST_TYPES; // mcq | multi | short | table

/* ------------------------------- helpers -------------------------------- */

/**
 * Questions already in the bank the teacher is filling, so the model can be
 * told not to write them again. Only the question text is sent — an answer key
 * has no business leaving the server for a job that does not need it.
 */
function existingQuestions(target, difficulty) {
  if (target === 'battle') {
    return db
      .filter('battleQuestions', (q) => q.difficulty === difficulty)
      .map((q) => q.question);
  }
  // Quests are global, so "already asked" means across every quest.
  const out = [];
  db.all('quests').forEach((q) => (q.questions || []).forEach((x) => out.push(x.question)));
  return out;
}

/** Turn one raw model question into a stored-shape question, or null. */
function usable(raw) {
  if (!TYPES.includes(raw && raw.type)) return null;
  if (!qs.rawKeyed(raw)) return null;              // an mcq with no key chosen
  const q = ch.normalizeQuestion(raw, false);      // false = no nested simulations
  if (!ch.isUsableQuestion(q) || !qs.isAutoMarkable(q)) return null;
  return q;
}

/* -------------------------------- routes -------------------------------- */

/** GET /api/teacher/ai/status — is the AI configured, and what is left today? */
router.get('/status', (req, res) => {
  res.json({
    enabled: config.aiEnabled(),
    model: config.aiModel(),
    maxBatch: ai.MAX_BATCH,
    types: TYPES,
    ...aiLimit.statusOf(req.user, 'generate'),
  });
});

/**
 * POST /api/teacher/ai/questions — write some stoichiometry questions.
 *
 * Body: { target:'battle'|'quest', difficulty, count, types[], notes?, lang? }
 * Returns { questions[], dropped, ... quota } — drafts, saved by nobody.
 */
router.post('/questions', async (req, res) => {
  if (!config.aiEnabled()) {
    return res.status(503).json({ error: 'AI_DISABLED' });
  }

  const body = req.body || {};
  const target = body.target === 'quest' ? 'quest' : 'battle';
  const difficulty = bt.DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'easy';
  const count = Math.max(1, Math.min(ai.MAX_BATCH, parseInt(body.count, 10) || 3));
  const types = (Array.isArray(body.types) ? body.types : []).filter((ty) => TYPES.includes(ty));
  const lang = body.lang === 'th' ? 'th' : 'en';
  const notes = String(body.notes || '').slice(0, ai.MAX_NOTES);

  // Spend the allowance BEFORE the await — see the note in aiLimit.take().
  try {
    aiLimit.take(req.user, 'generate');
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') {
      return res.status(429).json({ error: 'AI_DAILY_LIMIT', ...aiLimit.statusOf(req.user, 'generate') });
    }
    throw err;
  }
  db.save();

  try {
    const raw = await ai.generateQuestions({
      count,
      difficulty,
      types: types.length ? types : ['mcq'],
      lang,
      notes,
      avoid: existingQuestions(target, difficulty),
    });

    const questions = raw.map(usable).filter(Boolean);

    // Nothing usable came back, so the teacher got nothing — give the call back.
    if (!questions.length) {
      aiLimit.refund(req.user, 'generate');
      db.save();
      return res.status(502).json({
        error: 'AI_NOTHING_USABLE',
        ...aiLimit.statusOf(req.user, 'generate'),
      });
    }

    res.json({
      questions,
      dropped: Math.max(0, raw.length - questions.length),
      difficulty,
      target,
      ...aiLimit.statusOf(req.user, 'generate'),
    });
  } catch (err) {
    // The teacher got nothing, so the allowance goes back.
    aiLimit.refund(req.user, 'generate');
    db.save();
    console.error('[ai/questions]', ai.describeFailure(err));

    // AI_BUSY is the MODEL PROVIDER's rate limit, a different thing from the
    // AI_DAILY_LIMIT above; AI_BAD_KEY is a key the provider would not accept.
    const { status, code } = ai.failureOf(err);
    res.status(status).json({ error: code, ...aiLimit.statusOf(req.user, 'generate') });
  }
});

module.exports = router;
