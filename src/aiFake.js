/**
 * A FAKE Kru CJ, for `npm run demo` only.
 *
 * With `AI_FAKE=1` every AI job answers instantly-ish with a canned but
 * plausible result: no Gemini key, no cost, no network. It exists so the demo
 * class can show every AI screen (suggested marks, story and whiteboard
 * readings, the student profile, question drafts, duel checks, the tutor).
 *
 * It is NOT a model. It marks by matching words in the student's answer
 * against the teacher's criteria (with a small Thai <-> English word list, so
 * a Thai answer is not marked zero). Good enough to look real; never good
 * enough to trust. That is why it must never run where real students are:
 * `install()` refuses on a hosted or Postgres-backed server.
 *
 * How it plugs in: every route calls these modules through their exports
 * object (`marking.markSubmission(...)`, `ai.generateQuestions(...)`), so
 * replacing the properties on those objects swaps the behaviour everywhere,
 * and the real routes (limits, saving, refunds) still run around it.
 */
const config = require('./config');

/* ------------------------------------------------------------------ *
 * Reading an answer
 * ------------------------------------------------------------------ */

/* English stem -> Thai words that mean the same. Enough for the demo's own
   questions; anything else falls back to plain word matching. */
const SYNONYMS = {
  particl: ['อนุภาค'], solid: ['ของแข็ง'], liquid: ['ของเหลว'], gas: ['แก๊ส', 'ก๊าซ'],
  energy: ['พลังงาน'], heat: ['ความร้อน', 'ร้อน'], move: ['เคลื่อน'], vibrat: ['สั่น'],
  shape: ['รูปร่าง'], volum: ['ปริมาตร'], contain: ['ภาชนะ'], close: ['ชิด', 'ใกล้'],
  far: ['ห่าง'], fast: ['เร็ว'], slow: ['ช้า'], evapor: ['ระเหย'], melt: ['หลอม', 'ละลาย'],
  freez: ['แข็งตัว'], conden: ['ควบแน่น'], atom: ['อะตอม'], proton: ['โปรตอน'],
  electr: ['อิเล็กตรอน'], neutron: ['นิวตรอน'], nucle: ['นิวเคลียส'], charg: ['ประจุ'],
  positiv: ['บวก'], negativ: ['ลบ'], mole: ['โมล'], mass: ['มวล'], ratio: ['อัตราส่วน'],
  equat: ['สมการ'], balanc: ['ดุล'], molecul: ['โมเลกุล'], bond: ['พันธะ'],
  group: ['หมู่'], period: ['คาบ'], metal: ['โลหะ'], react: ['ปฏิกิริยา', 'ทำปฏิกิริยา'],
  same: ['เท่ากัน', 'เหมือน'], number: ['จำนวน'], tempera: ['อุณหภูมิ'], pressur: ['ความดัน'],
  space: ['ที่ว่าง', 'ช่องว่าง'], between: ['ระหว่าง'], increas: ['เพิ่ม'], decreas: ['ลด'],
  hydrog: ['ไฮโดรเจน'], oxygen: ['ออกซิเจน'], heav: ['หนัก', 'มวลมาก'], light: ['เบา', 'แทบไม่มีมวล'],
  cancel: ['หักล้าง'], centr: ['ตรงกลาง', 'กลาง'], spread: ['แพร่', 'กระจาย'], gain: ['ได้รับ'],
  break: ['หลุด'], slide: ['ผ่านกัน'], positio: ['ตำแหน่ง'], fill: ['เต็ม'], equal: ['เท่ากับ', 'เท่ากัน'],
  around: ['รอบ'], free: ['อิสระ'], keep: ['คงที่'],
};

const STOP = new Set(['the', 'and', 'that', 'with', 'from', 'they', 'their', 'have', 'into', 'than',
  'this', 'when', 'what', 'which', 'more', 'each', 'other', 'about', 'should', 'must', 'answer',
  'student', 'mention', 'explain', 'says', 'there', 'them', 'will', 'also', 'only', 'does',
  'are', 'one', 'was', 'for', 'its', 'not', 'has', 'can', 'now', 'out']);

const lower = (s) => String(s == null ? '' : s).toLowerCase();

/** Content words of an English phrase, cut to a stem so "particles" = "particle". */
function stems(text) {
  return (lower(text).match(/[a-z][a-z]{2,}/g) || [])
    .filter((w) => !STOP.has(w))
    .map((w) => w.replace(/s$/, '').slice(0, 6));
}

/** Does the answer contain this stem, in English or in Thai? */
function hasStem(answer, stem) {
  if (answer.includes(stem)) return true;
  const key = Object.keys(SYNONYMS).find((k) => stem.startsWith(k) || k.startsWith(stem));
  return !!key && SYNONYMS[key].some((th) => answer.includes(th));
}

/** Split the teacher's expected answer into the separate things it asks for. */
function requirements(rubric) {
  return String(rubric || '')
    .split(/\r?\n|;|•|(?:^|\s)-\s|\.\s+|\d\)\s/)
    .map((s) => s.replace(/^[\s\-–*\d.)]+/, '').trim())
    .filter((s) => s.length > 3)
    .slice(0, 8);
}

/** Is one requirement met? Thai requirements match on their own words. */
function met(answer, req) {
  // Numbers in the requirement ("6 + 6 = 12") must all be in the answer.
  const nums = req.match(/\d+(?:\.\d+)?/g) || [];
  const numbersOk = nums.every((n) => new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}($|[^\\d])`).test(answer));
  if (!numbersOk) return false;
  const st = stems(req);
  if (!st.length && nums.length) return true;
  if (st.length) {
    const hits = st.filter((w) => hasStem(answer, w)).length;
    return hits / st.length >= 0.4;
  }
  // A requirement written in Thai: match any word of 2+ Thai letters.
  const thai = (req.match(/[฀-๿]{2,}/g) || []);
  return thai.some((w) => answer.includes(w));
}

/** Mark one answer against the expected answer. */
function judge(answer, rubric) {
  const a = lower(answer).trim();
  const reqs = requirements(rubric);
  if (!a) return { blank: true, ratio: 0, criteria: reqs.map((r) => ({ name: r, met: false })) };
  if (!reqs.length) return { blank: false, ratio: a.length > 40 ? 0.7 : 0.4, criteria: [] };
  const criteria = reqs.map((r) => ({ name: r, met: met(a, r) }));
  const hit = criteria.filter((c) => c.met).length;
  // A long answer that misses every keyword still gets a little: it tried.
  const ratio = hit ? hit / reqs.length : (a.length > 60 ? 0.15 : 0);
  return { blank: false, ratio, criteria };
}

const levelOf = (ratio) => (ratio >= 0.75 ? 'strong' : ratio >= 0.4 ? 'mixed' : 'struggling');
const isThai = (lang) => lang === 'th';
const pick = (arr, seed) => arr[Math.abs(hashOf(seed)) % arr.length];
function hashOf(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) | 0;
  return h;
}

/** A short wait, so loading states look like they do with the real model. */
const think = () => new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 600)));

/* ------------------------------------------------------------------ *
 * The fake jobs — each returns exactly what the real one returns
 * ------------------------------------------------------------------ */

function feedbackFor(j, lang) {
  if (j.blank) return isThai(lang) ? 'ไม่ได้เขียนคำตอบ ลองเขียนสิ่งที่รู้ก่อน แม้จะไม่แน่ใจก็ตาม' : 'No answer was written. Next time, write down what you do know, even if you are not sure.';
  const missed = j.criteria.filter((c) => !c.met).map((c) => c.name);
  if (j.ratio >= 0.75) {
    return isThai(lang) ? 'ตอบได้ครบและชัดเจน อธิบายเหตุผลได้ดี' : 'A clear, complete answer that explains the reasoning well.';
  }
  if (isThai(lang)) return `มาถูกทางแล้วบางส่วน แต่ยังขาด: ${missed.slice(0, 2).join(', ') || 'คำอธิบายที่ชัดเจน'} ลองอธิบายเพิ่มว่าทำไม`;
  return `Partly there. It is missing: ${missed.slice(0, 2).join('; ') || 'a clear explanation'}. Say why, not only what.`;
}

async function markSubmission({ items, lang }) {
  await think();
  const judged = items.map((it) => ({ it, j: judge(it.answer, it.rubric) }));
  const marks = judged.map(({ it, j }) => ({
    questionId: it.questionId,
    score: Math.min(it.points || 0, Math.round((it.points || 0) * j.ratio)),
    outOf: it.points || 0,
    feedback: feedbackFor(j, lang),
    rubricSilent: !j.blank && !j.criteria.length,
    criteria: j.criteria,
  }));
  const avg = judged.length ? judged.reduce((s, x) => s + x.j.ratio, 0) / judged.length : 0;
  const lvl = levelOf(avg);
  const th = isThai(lang);
  return {
    marks,
    diagnosis: {
      summary: th
        ? { strong: 'เข้าใจเนื้อหาดี อธิบายด้วยคำของตัวเองได้', mixed: 'เข้าใจบางส่วน แต่ยังอธิบายเหตุผลไม่ครบ', struggling: 'ยังไม่เข้าใจแนวคิดหลัก คำตอบสั้นหรือว่าง' }[lvl]
        : { strong: 'Understands the topic and can explain it in their own words.', mixed: 'Understands part of it, but the explanations stop short of the reason.', struggling: 'The main idea is not there yet; answers are short or blank.' }[lvl],
      level: lvl,
      strengths: avg > 0.3 ? [th ? 'ใช้คำศัพท์ถูกต้อง' : 'Uses the right vocabulary'] : [],
      gaps: avg < 0.75 ? [th ? 'อธิบายเหตุผลไม่ครบ' : 'Does not finish the explanation'] : [],
      nextStep: th ? 'ให้อธิบายคำตอบหนึ่งข้อด้วยปากเปล่า แล้วเขียนใหม่' : 'Ask them to explain one answer out loud, then write it again.',
    },
  };
}

async function classReport({ questions, papers, lang }) {
  await think();
  const th = isThai(lang);
  const byQ = questions.map((q) => {
    const scored = papers.map((p) => (p.answers || []).find((a) => a.questionId === q.questionId)).filter((a) => a && a.score != null);
    const pct = scored.length ? scored.reduce((s, a) => s + a.score / Math.max(1, a.outOf), 0) / scored.length : null;
    const blanks = papers.filter((p) => { const a = (p.answers || []).find((x) => x.questionId === q.questionId); return !a || !String(a.answer || '').trim(); }).length;
    return { q, pct, blanks };
  });
  const weak = byQ.filter((x) => x.pct != null && x.pct < 0.6);
  return {
    summary: th
      ? `ส่งงาน ${papers.length} คน ${weak.length ? `มี ${weak.length} ข้อที่ห้องยังทำได้ไม่ดี` : 'ภาพรวมทำได้ดี'}`
      : `${papers.length} student(s) handed in. ${weak.length ? `${weak.length} question(s) went badly for the class.` : 'Overall the class did well.'}`,
    misconceptions: weak.slice(0, 3).map((x) => ({
      what: th ? `อธิบายไม่ครบในข้อ "${String(x.q.question).slice(0, 60)}"` : `Incomplete reasoning on "${String(x.q.question).slice(0, 60)}"`,
      count: Math.max(1, Math.round(papers.length * (1 - x.pct))),
      example: th ? 'ตอบแค่ชื่อ ไม่บอกเหตุผล' : 'Names the answer but not the reason.',
    })),
    reteach: weak.length
      ? [th ? 'ทำตัวอย่างหนึ่งข้อบนกระดานพร้อมเหตุผลทีละขั้น' : 'Work one example on the board, giving the reason at each step.']
      : [],
    byQuestion: weak.map((x) => ({ questionId: x.q.questionId, note: th ? `${x.blanks} คนเว้นว่าง` : `${x.blanks} left it blank.` })),
    papersUsed: papers.length,
  };
}

async function checkAnswer({ question, answer, lang }) {
  await think();
  const j = judge(answer, question.rubric);
  const th = isThai(lang);
  const left = j.criteria.filter((c) => !c.met).length;
  // The real checker never repeats the teacher's answer to a student, so this
  // one names the gap by count only.
  return {
    onTask: !j.blank,
    met: j.criteria.some((c) => c.met) ? [th ? 'เริ่มตอบประเด็นหลักแล้ว' : 'You have started on the main idea.'] : [],
    missing: left ? [th ? `ยังขาดอีก ${left} ประเด็นที่คำถามต้องการ` : `${left} more point(s) the question is asking for.`] : [],
    feedback: j.blank
      ? (th ? 'ยังไม่ได้เขียนอะไรเลย ลองเริ่มจากสิ่งที่รู้' : 'Nothing written yet. Start with what you know.')
      : left
        ? (th ? 'มาถูกทาง ลองอ่านคำถามอีกครั้งแล้วอธิบายว่า "ทำไม"' : 'Good start. Read the question again and explain why.')
        : (th ? 'ครบถ้วนดีแล้ว' : 'That covers what the question asks.'),
  };
}

async function diagnoseStoryAnswer({ expected, answer, lang }) {
  await think();
  const j = judge(answer, expected);
  const lvl = j.blank ? 'struggling' : levelOf(j.ratio);
  const th = isThai(lang);
  const hit = j.criteria.filter((c) => c.met).map((c) => c.name);
  const miss = j.criteria.filter((c) => !c.met).map((c) => c.name);
  return {
    summary: th
      ? { strong: 'คำตอบแสดงความเข้าใจที่ชัดเจน', mixed: 'เข้าใจบางส่วน แต่ยังขาดเหตุผลสำคัญ', struggling: 'คำตอบยังไม่แสดงความเข้าใจแนวคิดหลัก' }[lvl]
      : { strong: 'The answer shows secure understanding.', mixed: 'Partly there, but a key reason is missing.', struggling: 'The answer does not show the main idea yet.' }[lvl],
    level: lvl,
    understands: hit.slice(0, 3),
    gaps: miss.slice(0, 3),
    misconceptions: lvl === 'struggling' && !j.blank ? [th ? 'อาจสับสนระหว่างสถานะกับอุณหภูมิ' : 'May be mixing up the state of a substance with its temperature.'] : [],
    nextStep: th ? 'ถามต่อหนึ่งคำถามสั้น ๆ ให้เขาอธิบายด้วยคำของตัวเอง' : 'Ask one short follow-up question and let them explain in their own words.',
    onTask: !j.blank,
  };
}

async function analyzeWhiteboard({ expected, studentAnswer, lang }) {
  await think();
  const j = judge(studentAnswer || '', expected);
  const lvl = studentAnswer ? levelOf(j.ratio) : 'mixed';
  const th = isThai(lang);
  return {
    legible: true,
    summary: th ? 'เขียนทดเป็นขั้นตอน อ่านได้' : 'The working is set out in steps and is readable.',
    level: lvl,
    method: th ? 'เขียนข้อมูลที่โจทย์ให้ แล้วคำนวณทีละขั้น' : 'Wrote down the given values, then worked step by step.',
    steps: th ? ['เขียนข้อมูลจากโจทย์', 'เลือกสูตร', 'แทนค่าและคำนวณ'] : ['Wrote down the given values', 'Chose a formula', 'Substituted and calculated'],
    errors: lvl === 'strong' ? [] : [th ? 'หน่วยหายไปในขั้นสุดท้าย' : 'The unit is dropped in the last step.'],
    strengths: [th ? 'จัดลำดับขั้นตอนดี' : 'Clear order of steps'],
    reachedAnswer: String(studentAnswer || '').slice(0, 80),
    nextStep: th ? 'ให้ฝึกเขียนหน่วยกำกับทุกบรรทัด' : 'Have them write the unit on every line.',
  };
}

async function summarizeStudent({ dataText, lang }) {
  await think();
  const num = (re) => { const m = re.exec(dataText); return m ? Number(m[1]) : null; };
  const pre = num(/Pre-test average (\d+)%/);
  const post = num(/post-test average (\d+)%/);
  const chal = num(/challenges (\d+)%/);
  const logins = num(/Signed in (\d+) time/) || 0;
  const scores = [pre, post, chal].filter((x) => x != null);
  const avg = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null;
  const lvl = avg == null ? 'struggling' : avg >= 75 ? 'strong' : avg >= 45 ? 'mixed' : 'struggling';
  const trend = pre != null && post != null ? (post > pre + 5 ? 'improving' : post < pre - 5 ? 'declining' : 'steady') : 'unclear';
  const th = isThai(lang);
  const nums = `pre ${pre == null ? '—' : pre + '%'}, post ${post == null ? '—' : post + '%'}, challenges ${chal == null ? '—' : chal + '%'}`;
  return {
    overview: avg == null
      ? (th ? 'ยังมีข้อมูลน้อยเกินไปที่จะสรุป นักเรียนแทบไม่ได้ทำงานในระบบ' : 'Too little data to say much: this student has done almost nothing in StoiVenture yet.')
      : (th ? `คะแนนโดยรวม (${nums}) อยู่ในระดับ ${lvl === 'strong' ? 'ดี' : lvl === 'mixed' ? 'ปานกลาง' : 'ต้องช่วยเหลือ'}` : `Overall (${nums}) this student is ${lvl === 'strong' ? 'doing well' : lvl === 'mixed' ? 'partly there' : 'struggling'}.`),
    level: lvl,
    trend,
    strengths: avg != null && avg >= 45 ? [th ? 'ทำข้อปรนัยได้ดี' : 'Does well on multiple choice'] : [],
    weaknesses: avg == null || avg < 75 ? [th ? 'คำตอบเขียนอธิบายสั้นเกินไป' : 'Written explanations are too short'] : [],
    patterns: avg != null && avg < 60 ? [th ? 'มักเว้นข้อเขียนไว้' : 'Often leaves written answers blank'] : [],
    engagement: th ? `เข้าสู่ระบบ ${logins} ครั้ง` : `Signed in ${logins} time(s).`,
    recommendations: [th ? 'คุยสั้น ๆ หนึ่งต่อหนึ่งเรื่องบทที่ทำได้น้อยที่สุด' : 'Have a short one-to-one talk about their weakest level.'],
  };
}

/* Question drafts: a small hand-written bank, handed out in turn. */
const BANK = [
  { type: 'mcq', question: 'How many moles are in 36 g of water (H₂O, M = 18 g/mol)?', choices: ['1 mol', '2 mol', '18 mol', '0.5 mol'], correctIndex: 1, explanation: '36 ÷ 18 = 2 mol.' },
  { type: 'mcq', question: 'In 2H₂ + O₂ → 2H₂O, how many moles of O₂ react with 4 mol of H₂?', choices: ['1 mol', '2 mol', '4 mol', '8 mol'], correctIndex: 1, explanation: 'The ratio H₂ : O₂ is 2 : 1, so 4 mol H₂ needs 2 mol O₂.' },
  { type: 'short', question: 'What is the molar mass of CO₂ in g/mol? (C = 12, O = 16)', accepted: ['44', '44 g/mol'], explanation: '12 + 2 × 16 = 44.' },
  { type: 'multi', question: 'Which of these contain exactly 1 mol of atoms? (Na = 23, C = 12, He = 4)', choices: ['23 g of Na', '12 g of C', '8 g of He', '2 g of He'], correctIndexes: [0, 1], explanation: '23 g Na and 12 g C are 1 mol each; 8 g He is 2 mol.' },
  { type: 'mcq', question: 'How many molecules are in 0.5 mol of CO₂?', choices: ['3.01 × 10²³', '6.02 × 10²³', '1.20 × 10²⁴', '0.5'], correctIndex: 0, explanation: '0.5 × 6.02 × 10²³ = 3.01 × 10²³.' },
  { type: 'short', question: 'How many grams are in 3 mol of NaCl? (M = 58.5 g/mol)', accepted: ['175.5', '175.5 g'], explanation: '3 × 58.5 = 175.5 g.' },
  { type: 'mcq', question: 'Which reactant is limiting when 2 mol H₂ meet 2 mol O₂ in 2H₂ + O₂ → 2H₂O?', choices: ['H₂', 'O₂', 'Neither', 'Both'], correctIndex: 0, explanation: '2 mol H₂ needs only 1 mol O₂, so H₂ runs out first.' },
  { type: 'table', question: 'Fill in the moles. (M of H₂O = 18 g/mol)', table: { columns: ['Mass of water', 'Moles'], rows: [{ cells: [{ text: '18 g' }, { blank: true, answer: '1' }] }, { cells: [{ text: '9 g' }, { blank: true, answer: '0.5' }] }] }, explanation: 'moles = mass ÷ 18.' },
];
const BANK_TH = [
  { type: 'mcq', question: 'น้ำ (H₂O, M = 18 g/mol) 36 กรัม มีกี่โมล', choices: ['1 โมล', '2 โมล', '18 โมล', '0.5 โมล'], correctIndex: 1, explanation: '36 ÷ 18 = 2 โมล' },
  { type: 'short', question: 'มวลโมเลกุลของ CO₂ เท่ากับกี่ g/mol (C = 12, O = 16)', accepted: ['44', '44 g/mol'], explanation: '12 + 2 × 16 = 44' },
  { type: 'mcq', question: 'จาก 2H₂ + O₂ → 2H₂O ถ้าใช้ H₂ 4 โมล ต้องใช้ O₂ กี่โมล', choices: ['1 โมล', '2 โมล', '4 โมล', '8 โมล'], correctIndex: 1, explanation: 'อัตราส่วน H₂ : O₂ = 2 : 1' },
];
let bankAt = 0;

async function generateQuestions({ count, types, lang, avoid }) {
  await think();
  const allowed = new Set(Array.isArray(types) && types.length ? types : ['mcq']);
  const seen = new Set((avoid || []).map((q) => String(q).trim()));
  const pool = (isThai(lang) ? BANK_TH.concat(BANK) : BANK).filter((q) => allowed.has(q.type) && !seen.has(q.question));
  const out = [];
  for (let i = 0; i < pool.length && out.length < count; i++) {
    out.push(JSON.parse(JSON.stringify(pool[(bankAt + i) % pool.length])));
  }
  bankAt += out.length;
  return out;
}

async function reviewStudentQuestion({ question, lang }) {
  await think();
  const text = lower(question.question);
  const th = isThai(lang);
  const onTopic = /mol|โมล|gram|กรัม|\bg\b|mass|มวล|ratio|อัตราส่วน|limiting|excess|yield|→|->/.test(text);
  const solvable = text.length >= 15;
  const ok = onTopic && solvable;
  return {
    ok,
    onTopic,
    solvable,
    keyCorrect: true,
    appropriate: true,
    feedback: ok
      ? (th ? 'คำถามชัดเจนและเป็นเรื่องปริมาณสารสัมพันธ์ ส่งได้เลย!' : 'A clear stoichiometry question. Good to send!')
      : !onTopic
        ? (th ? 'คำถามนี้ยังไม่ใช่เรื่องปริมาณสารสัมพันธ์ ลองถามเรื่องโมล มวล หรืออัตราส่วนในสมการ' : 'This is not a stoichiometry question yet. Try asking about moles, mass, or a ratio in an equation.')
        : (th ? 'คำถามสั้นเกินไป ใส่ตัวเลขที่เพื่อนต้องใช้ให้ครบ' : 'The question is too short. Give every number your classmate needs.'),
    subtopic: onTopic ? 'moles' : '',
  };
}

const HINTS_EN = [
  'Start by writing down what the question gives you, with units.',
  'Which formula links the quantities you have to the one you want?',
  'Look at the balanced equation: what is the mole ratio between the two substances?',
  'Check your units. If grams cancel, what are you left with?',
];
const HINTS_TH = [
  'เริ่มจากเขียนข้อมูลที่โจทย์ให้ พร้อมหน่วย',
  'สูตรไหนเชื่อมสิ่งที่มีอยู่กับสิ่งที่โจทย์ถาม',
  'ดูสมการที่ดุลแล้ว อัตราส่วนโมลของสองสารเป็นเท่าไร',
  'ตรวจหน่วย ถ้ากรัมตัดกันหมด จะเหลือหน่วยอะไร',
];

async function ask({ message, lang }) {
  await think();
  return { text: pick(isThai(lang) ? HINTS_TH : HINTS_EN, message), refused: false };
}

/* ------------------------------------------------------------------ */

let installed = false;

function install() {
  if (installed) return;
  if (config.isProductionLike()) {
    throw new Error('AI_FAKE=1 is for a local demo copy only. Refusing to start on a hosted or Postgres-backed server.');
  }
  Object.assign(require('./aiMarking'), { markSubmission, classReport, checkAnswer });
  Object.assign(require('./aiDiagnosis'), { diagnoseStoryAnswer, analyzeWhiteboard, summarizeStudent });
  Object.assign(require('./aiQuestions'), { generateQuestions, reviewStudentQuestion });
  Object.assign(require('./tutor'), { ask });
  installed = true;
  console.log('[ai] AI_FAKE=1: Kru CJ is a canned demo stand-in. No real AI is called.');
}

module.exports = { install, judge };
