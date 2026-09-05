/**
 * Challenges — the model, validation and grading rules for the "Challenges"
 * section of a level board.
 *
 * A challenge is a small, teacher-built worksheet that lives under a level and
 * belongs to a teacher-defined category. It holds an ordered list of questions.
 * Unlike the pre/post-test (multiple-choice + written only) a challenge question
 * can be any of:
 *
 *   mcq        — one correct choice
 *   multi      — several correct choices (checkboxes, all-or-nothing)
 *   short      — a short typed answer, auto-marked against accepted answers
 *   written    — a long typed answer, always graded by the teacher
 *   table      — a fill-in-the-table grid; blank cells with an answer key are
 *                auto-marked, otherwise the teacher grades the whole question
 *   simulation — an embedded HTML simulation the student plays with, followed
 *                by its own sub-questions (any of the types above)
 *
 * Every question may carry an image, and every question is worth points.
 * Anything that cannot be marked by the machine lands in the teacher's
 * challenge-response grading queue.
 *
 * A question that lands in that queue may also carry a `rubric` — the teacher's
 * own words for how the answer should be judged — and `aiMark`, which opts it
 * in to being marked against that rubric by Kru CJ (src/aiMarking.js). Both are
 * teacher-only: `sanitizeQuestion` never emits them, and `isAiMarkable` below is
 * the one place that decides whether a question qualifies.
 */
const crypto = require('crypto');

const QUESTION_TYPES = ['mcq', 'multi', 'short', 'written', 'table', 'simulation'];
const ASSIGN_MODES = ['all', 'some'];

const MAX_IMAGE_CHARS = 900 * 1024;   // ~900KB of base64 per question image
const MAX_SIM_CHARS = 400 * 1024;     // teacher-authored simulation HTML
const MAX_TEXT = 4000;
const MAX_RUBRIC = 2000;      // the teacher's marking guide, sent to the model
const MAX_QUESTIONS = 60;
const MAX_CHOICES = 8;
const MAX_TABLE_COLS = 8;
const MAX_TABLE_ROWS = 20;

const uuid = () => crypto.randomUUID();
const str = (v, max) => (v == null ? '' : String(v)).slice(0, max || MAX_TEXT);
const trimmed = (v, max) => str(v, max).trim();

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ------------------------------ normalising ------------------------------ */

function normalizeImage(v) {
  const s = str(v, MAX_IMAGE_CHARS + 1);
  return s.length > MAX_IMAGE_CHARS ? '' : s; // silently drop oversized uploads
}

function normalizeTable(raw) {
  raw = raw || {};
  const columns = (Array.isArray(raw.columns) ? raw.columns : [])
    .slice(0, MAX_TABLE_COLS)
    .map((c) => trimmed(c, 120));
  if (!columns.length) columns.push('');
  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .slice(0, MAX_TABLE_ROWS)
    .map((r) => {
      const cells = (Array.isArray(r && r.cells) ? r.cells : []).slice(0, columns.length).map((c) => ({
        text: trimmed(c && c.text, 200),        // fixed label shown to the student
        blank: !!(c && c.blank),                // student fills this cell in
        answer: trimmed(c && c.answer, 200),    // answer key ('' = teacher grades)
      }));
      while (cells.length < columns.length) cells.push({ text: '', blank: true, answer: '' });
      return { cells };
    });
  if (!rows.length) rows.push({ cells: columns.map(() => ({ text: '', blank: true, answer: '' })) });
  return { columns, rows };
}

function normalizeSim(raw) {
  raw = raw || {};
  const mode = raw.mode === 'url' ? 'url' : 'html';
  return {
    mode,
    html: str(raw.html, MAX_SIM_CHARS),
    url: trimmed(raw.url, 600),
    height: clampInt(raw.height, 160, 1200, 420),
  };
}

/**
 * Normalise one question. `allowSim` is false inside a simulation so that
 * simulations cannot be nested inside each other.
 */
function normalizeQuestion(raw, allowSim) {
  raw = raw || {};
  let type = QUESTION_TYPES.includes(raw.type) ? raw.type : 'mcq';
  if (type === 'simulation' && !allowSim) type = 'written';

  const q = {
    id: raw.id || uuid(),
    type,
    question: trimmed(raw.question, MAX_TEXT),
    image: normalizeImage(raw.image),
    points: clampInt(raw.points, 0, 1000, 1),
    explanation: trimmed(raw.explanation, MAX_TEXT),
    // How the teacher wants this answer judged, and whether Kru CJ may use it.
    // Kept even on auto-marked types: a teacher who switches a question from
    // 'short' to 'written' should not silently lose what they wrote.
    rubric: trimmed(raw.rubric, MAX_RUBRIC),
    aiMark: !!raw.aiMark,
  };

  if (type === 'mcq' || type === 'multi') {
    q.choices = (Array.isArray(raw.choices) ? raw.choices : []).slice(0, MAX_CHOICES).map((c) => str(c, 300));
    while (q.choices.length < 2) q.choices.push('');
    if (type === 'mcq') {
      q.correctIndex = clampInt(raw.correctIndex, 0, q.choices.length - 1, 0);
    } else {
      const set = new Set((Array.isArray(raw.correctIndexes) ? raw.correctIndexes : [])
        .map((n) => clampInt(n, 0, q.choices.length - 1, -1))
        .filter((n) => n >= 0));
      q.correctIndexes = [...set].sort((a, b) => a - b);
    }
  } else if (type === 'short') {
    // Accepted answers; empty means "the teacher marks this by hand".
    q.accepted = (Array.isArray(raw.accepted) ? raw.accepted : [])
      .slice(0, 12).map((a) => trimmed(a, 200)).filter(Boolean);
    q.caseSensitive = !!raw.caseSensitive;
  } else if (type === 'table') {
    q.table = normalizeTable(raw.table);
  } else if (type === 'simulation') {
    q.sim = normalizeSim(raw.sim);
    q.sub = (Array.isArray(raw.sub) ? raw.sub : [])
      .slice(0, MAX_QUESTIONS)
      .map((s) => normalizeQuestion(s, false))
      .filter(isUsableQuestion);
    q.points = 0; // a simulation scores through its sub-questions
  }
  return q;
}

/** Keep only questions the student could actually answer. */
function isUsableQuestion(q) {
  if (!q) return false;
  if (q.type === 'simulation') {
    const hasSim = !!(q.sim && (q.sim.html.trim() || q.sim.url));
    return hasSim || (q.sub || []).length > 0;
  }
  if (!q.question && !q.image) return false;
  if (q.type === 'mcq' || q.type === 'multi') return q.choices.filter((c) => c.trim()).length >= 2;
  return true;
}

function normalizeAssign(raw) {
  raw = raw || {};
  const mode = ASSIGN_MODES.includes(raw.mode) ? raw.mode : 'all';
  const studentIds = (Array.isArray(raw.studentIds) ? raw.studentIds : [])
    .slice(0, 500).map((id) => str(id, 80)).filter(Boolean);
  return { mode, studentIds: mode === 'some' ? [...new Set(studentIds)] : [] };
}

function normalizeChallenge(body, existing) {
  body = body || {};
  const c = existing || { id: uuid(), createdAt: new Date().toISOString() };
  c.lessonId = str(body.lessonId, 80) || c.lessonId || null;
  c.categoryId = str(body.categoryId, 80) || null;
  c.title = trimmed(body.title, 120) || 'Untitled Challenge';
  c.description = trimmed(body.description, MAX_TEXT);
  c.icon = trimmed(body.icon, 8) || '🧩';
  c.timeLimit = clampInt(body.timeLimit, 0, 7200, 0);
  c.allowRetake = !!body.allowRetake;
  const due = body.dueAt ? Date.parse(body.dueAt) : NaN;
  c.dueAt = Number.isNaN(due) ? null : new Date(due).toISOString();
  c.questions = (Array.isArray(body.questions) ? body.questions : [])
    .slice(0, MAX_QUESTIONS)
    .map((q) => normalizeQuestion(q, true))
    .filter(isUsableQuestion);
  c.assign = normalizeAssign(body.assign);
  if (typeof body.published === 'boolean') c.published = body.published;
  if (typeof c.published !== 'boolean') c.published = false;
  if (!Number.isFinite(c.order)) c.order = 0;
  c.updatedAt = new Date().toISOString();
  return c;
}

/* -------------------------------- scoring -------------------------------- */

/** Every scorable question, flattened (a simulation contributes its sub-questions). */
function flatQuestions(challenge) {
  const out = [];
  (challenge.questions || []).forEach((q) => {
    if (q.type === 'simulation') (q.sub || []).forEach((s) => out.push(s));
    else out.push(q);
  });
  return out;
}

function maxPoints(challenge) {
  return flatQuestions(challenge).reduce((sum, q) => sum + (q.points || 0), 0);
}

function norm(s, caseSensitive) {
  const v = String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
  return caseSensitive ? v : v.toLowerCase();
}

/**
 * Blank cells of a table question, as `${rowIndex}_${colIndex}` keys, each with
 * a human label built from the row's first fixed cell and the column header —
 * so a teacher reads "Solid / Shape" instead of "0_1".
 */
function tableBlanks(q) {
  const columns = (q.table && q.table.columns) || [];
  const out = [];
  ((q.table && q.table.rows) || []).forEach((row, r) => {
    const rowLabel = (row.cells || []).find((c) => !c.blank && c.text);
    (row.cells || []).forEach((cell, c) => {
      if (!cell.blank) return;
      const parts = [rowLabel ? rowLabel.text : '', columns[c] || ''].filter(Boolean);
      out.push({
        key: r + '_' + c,
        answer: cell.answer,
        label: parts.join(' / ') || `R${r + 1}C${c + 1}`,
        row: r,
        col: c,
      });
    });
  });
  return out;
}

/**
 * Mark one question against the student's answer.
 * Returns { auto, earned, max, correct } — `auto:false` means the teacher has
 * to look at it (written answers, un-keyed short answers / table cells).
 */
function gradeQuestion(q, answer) {
  const max = q.points || 0;
  switch (q.type) {
    case 'mcq': {
      const correct = Number(answer) === q.correctIndex;
      return { auto: true, earned: correct ? max : 0, max, correct };
    }
    case 'multi': {
      const want = q.correctIndexes || [];
      // No correct choice ticked = no answer key, so the teacher marks it
      // (otherwise "tick nothing" would score full marks).
      if (!want.length) return { auto: false, earned: 0, max, correct: null };
      const picked = [...new Set((Array.isArray(answer) ? answer : []).map(Number).filter(Number.isInteger))]
        .sort((a, b) => a - b);
      const correct = picked.length === want.length && picked.every((v, i) => v === want[i]);
      return { auto: true, earned: correct ? max : 0, max, correct };
    }
    case 'short': {
      if (!(q.accepted || []).length) return { auto: false, earned: 0, max, correct: null };
      const given = norm(answer, q.caseSensitive);
      const correct = !!given && q.accepted.some((a) => norm(a, q.caseSensitive) === given);
      return { auto: true, earned: correct ? max : 0, max, correct };
    }
    case 'table': {
      const blanks = tableBlanks(q);
      // Auto-mark only when every blank has an answer key.
      if (!blanks.length || blanks.some((b) => !b.answer)) return { auto: false, earned: 0, max, correct: null };
      const given = (answer && typeof answer === 'object') ? answer : {};
      const hits = blanks.filter((b) => norm(given[b.key]) === norm(b.answer)).length;
      const earned = Math.round((hits / blanks.length) * max);
      return { auto: true, earned, max, correct: hits === blanks.length, hits, blanks: blanks.length };
    }
    case 'written':
    default:
      return { auto: false, earned: 0, max, correct: null };
  }
}

/**
 * Should Kru CJ mark this question against the teacher's rubric?
 *
 * Three things must all be true: the teacher ticked the box, they actually
 * wrote a rubric, and the machine cannot mark it already. That last test asks
 * `gradeQuestion` rather than re-listing the types — so a question with an
 * answer key stays auto-marked, and a new auto-markable type can never quietly
 * become AI-markable as well.
 */
function isAiMarkable(q) {
  if (!q || !q.aiMark || !String(q.rubric || '').trim()) return false;
  if (q.type === 'simulation') return false;   // it scores through its sub-questions
  return gradeQuestion(q, undefined).auto === false;
}

/**
 * A readable copy of the student's answer — used by the grading queue, the
 * teacher's response list and the CSV export.
 */
function answerText(q, answer) {
  if (answer == null || answer === '') return '';
  if (q.type === 'mcq') {
    const i = Number(answer);
    return (q.choices || [])[i] == null ? '' : String(q.choices[i]);
  }
  if (q.type === 'multi') {
    return (Array.isArray(answer) ? answer : []).map((i) => (q.choices || [])[i]).filter(Boolean).join(', ');
  }
  if (q.type === 'table') {
    const given = (answer && typeof answer === 'object') ? answer : {};
    return tableBlanks(q)
      .map((b) => `${b.label}: ${given[b.key] || '—'}`)
      .join(' | ');
  }
  return str(answer, MAX_TEXT);
}

/** The correct answer as text, so the teacher can compare at a glance. */
function expectedText(q) {
  if (q.type === 'mcq') return (q.choices || [])[q.correctIndex] || '';
  if (q.type === 'multi') return (q.correctIndexes || []).map((i) => (q.choices || [])[i]).filter(Boolean).join(', ');
  if (q.type === 'short') return (q.accepted || []).join(' / ');
  if (q.type === 'table') {
    return tableBlanks(q).filter((b) => b.answer).map((b) => `${b.label}: ${b.answer}`).join(' | ');
  }
  return ''; // written answers have no single right answer
}

/**
 * Mark a whole submission.
 * Returns { autoEarned, maxPoints, manual[], results[] } where `manual` holds
 * the questions still waiting for the teacher.
 */
function gradeSubmission(challenge, answers) {
  answers = answers || {};
  const manual = [];
  const results = [];
  let autoEarned = 0;
  let max = 0;

  flatQuestions(challenge).forEach((q) => {
    const given = answers[q.id];
    const g = gradeQuestion(q, given);
    max += g.max;
    if (g.auto) {
      autoEarned += g.earned;
    } else {
      manual.push({
        questionId: q.id,
        question: q.question,
        type: q.type,
        points: g.max,
        guide: q.explanation || '',
        answer: answerText(q, given),
        awarded: null,
      });
    }
    results.push({ questionId: q.id, auto: g.auto, earned: g.earned, max: g.max, correct: g.correct });
  });

  return { autoEarned, maxPoints: max, manual, results };
}

/* ------------------------- shaping for the client ------------------------- */

/** Strip answer keys so a student cannot read the answers out of the JSON. */
function sanitizeQuestion(q) {
  const out = {
    id: q.id,
    type: q.type,
    question: q.question,
    image: q.image || '',
    points: q.points || 0,
  };
  // A BOOLEAN, deliberately — the player needs to know whether to draw the
  // "Check my answer" button, and must never be told what the rubric says.
  out.canCheck = isAiMarkable(q);
  if (q.type === 'mcq' || q.type === 'multi') out.choices = q.choices || [];
  if (q.type === 'table') {
    out.table = {
      columns: (q.table && q.table.columns) || [],
      rows: ((q.table && q.table.rows) || []).map((r) => ({
        cells: (r.cells || []).map((c) => ({ text: c.blank ? '' : c.text, blank: !!c.blank })),
      })),
    };
  }
  if (q.type === 'simulation') {
    out.sim = q.sim || { mode: 'html', html: '', url: '', height: 420 };
    out.sub = (q.sub || []).map(sanitizeQuestion);
  }
  return out;
}

/** Is this challenge assigned to this student? */
function isAssignedTo(challenge, user) {
  const a = challenge.assign || { mode: 'all', studentIds: [] };
  if (a.mode === 'all') return true;
  return (a.studentIds || []).includes(user.id);
}

module.exports = {
  QUESTION_TYPES,
  ASSIGN_MODES,
  MAX_SIM_CHARS,
  normalizeChallenge,
  normalizeQuestion,
  normalizeAssign,
  isUsableQuestion,
  flatQuestions,
  maxPoints,
  gradeQuestion,
  gradeSubmission,
  isAiMarkable,
  sanitizeQuestion,
  isAssignedTo,
  answerText,
  expectedText,
  tableBlanks,
};
