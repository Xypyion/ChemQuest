/**
 * Fills a fresh demo server with the class from scripts/demo-class.js.
 *
 * EVERYTHING GOES THROUGH THE REAL HTTP API, the same requests the browser
 * sends. Nothing here writes db.json. So the demo data obeys the real rules
 * (unlocks, one-shot post-tests, grading, coins), and keeps working when the
 * backend changes a data shape. If a rule changes so that a step here is
 * refused, the fill stops with the API's own error message.
 *
 * The story it tells — about one school week in:
 *   Level 1  finished and marked. One student failed the post-test and is stuck.
 *   Level 2  in progress. Pre-test written answers and a written challenge are
 *            waiting for the teacher to mark. Its post-test is built but closed.
 *   Around it: quests (open, closed, upcoming), battles and duels, the Lab,
 *            assignments with hand-ins and ratings, the gradebook, Student Logs.
 *
 * Note: every timestamp is "now". Data made through the API cannot be
 * back-dated, so the demo cannot show a hand-in from last Tuesday.
 */
const C = require('./demo-class');
const { workingBoard, atomBoard } = require('./demo-draw');
const { judge } = require('../src/aiFake');

/* ------------------------------------------------------------------ *
 * Seeded randomness: a different-looking class, the same one every time
 * ------------------------------------------------------------------ */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = seeded(20261012);
const chance = (p) => R() < p;
const pickOne = (arr) => arr[Math.floor(R() * arr.length)];
const between = ([lo, hi]) => lo + Math.floor(R() * (hi - lo + 1));
const shuffled = (arr) => arr.map((x) => [R(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();
const slug = (name, i) => (name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') || 'student') + (i + 1);

/* ------------------------------------------------------------------ *
 * The API
 * ------------------------------------------------------------------ */
function client(base) {
  return async function call(token, method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`${method} ${url} -> ${res.status} ${data.error || text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return data;
  };
}

/* ------------------------------------------------------------------ *
 * How a student answers
 * ------------------------------------------------------------------ */

/** An answer in the shape the player sends (see public/js/qrender.js). */
function answerFor(q, right) {
  switch (q.type) {
    case 'mcq': {
      if (right) return q.correctIndex;
      const wrong = q.choices.map((_, i) => i).filter((i) => i !== q.correctIndex);
      return pickOne(wrong);
    }
    case 'multi':
      return right ? q.correctIndexes.slice() : [q.correctIndexes[0]];
    case 'short':
      return right ? q.accepted[0] : pickOne(['idk', '?', '3']);
    case 'table': {
      const out = {};
      q.table.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
        if (!cell.blank) return;
        const ok = right || chance(0.5);
        out[`${r}_${c}`] = ok ? cell.answer : (cell.answer === 'yes' ? 'no' : 'yes');
      }));
      return out;
    }
    default:
      return '';
  }
}

/** The written answer this student gives to one question. */
function writtenFor(s, key) {
  const bank = C.ANSWERS[key];
  if (!bank) return '';
  const tier = pickOne(s.p.tiers);
  if (tier === 'blank') return '';
  const options = bank[tier] || bank.partial;
  return pickOne(options);
}

const langOf = (s) => (s.persona === 'thai' ? 'th' : 'en');
const goodTier = (text, rubric) => judge(text, rubric).ratio >= 0.5;

/* ------------------------------------------------------------------ *
 * The fill
 * ------------------------------------------------------------------ */
async function fill(base, log = console.log) {
  const call = client(base);
  const say = (msg) => log(`[demo] ${msg}`);

  /* ---------------- the teacher builds the course ---------------- */
  say('Teacher: building levels, challenges, quests, battle banks, assignments…');
  const { token: T } = await call(null, 'POST', '/api/auth/login', { email: C.TEACHER.email, password: C.TEACHER.password });
  const tc = (method, url, body) => call(T, method, url, body);

  await tc('POST', '/api/teacher/practice-student');

  const { categories } = await tc('POST', '/api/teacher/challenges/categories', { categories: C.CATEGORIES });
  const categoryId = (name) => (categories.find((c) => c.name === name) || {}).id || null;

  const { lessons } = await tc('GET', '/api/teacher/lessons');
  const levels = {
    1: await buildLevel(tc, lessons[0], C.STORY_QUESTIONS.level1, C.TESTS.level1),
    2: await buildLevel(tc, lessons[1], C.STORY_QUESTIONS.level2, C.TESTS.level2),
  };
  await tc('POST', `/api/teacher/lessons/${levels[1].lesson.id}/posttest-open`, { open: true });

  const challenges = [];
  for (const def of C.CHALLENGES) {
    const { challenge } = await tc('POST', '/api/teacher/challenges', {
      lessonId: levels[def.level].lesson.id,
      categoryId: categoryId(def.category),
      title: def.title,
      description: def.description,
      dueAt: def.due == null ? null : daysFromNow(def.due),
      questions: def.questions,
      assign: { mode: 'all' },
      published: !def.draft,
    });
    challenges.push({ def, saved: challenge, keyOf: keysByText(def.questions, challenge.questions) });
  }
  const [C1, C2, C3] = challenges;

  const quests = [];
  for (const def of C.QUESTS) {
    const { quest } = await tc('POST', '/api/teacher/quests', {
      title: def.title,
      reward: def.reward,
      opensAt: def.opens ? daysFromNow(def.opens) : null,
      closesAt: def.closes ? daysFromNow(def.closes) : null,
      questions: def.questions,
      assign: { mode: 'all' },
      published: true,
    });
    quests.push({ def, saved: quest });
  }

  const bankByText = new Map();
  for (const [difficulty, questions] of Object.entries(C.BATTLE_BANKS)) {
    await tc('POST', `/api/teacher/battles/bank/${difficulty}`, { questions });
    questions.forEach((q) => bankByText.set(q.question, q));
  }

  const assignments = {};
  for (const [lv, def] of [[1, C.ASSIGNMENTS.level1], [2, C.ASSIGNMENTS.level2]]) {
    const { post } = await call(T, 'POST', `/api/posts/lesson/${levels[lv].lesson.id}`, {
      title: def.title, text: def.text, criteria: def.criteria.map((label) => ({ label })),
    });
    assignments[lv] = { def, post };
  }

  /* ---------------- the students sign up ---------------- */
  say(`Students: ${C.STUDENTS.length} sign-ups and logins…`);
  const students = [];
  for (const [i, def] of C.STUDENTS.entries()) {
    const email = `${slug(def.name, i)}@demo.local`;
    const signup = await call(null, 'POST', '/api/auth/signup', { name: def.name, email, password: C.STUDENT_PASSWORD });
    let token = signup.token;
    if (def.avatar) await call(token, 'PATCH', '/api/auth/me', { avatar: def.avatar });
    const p = C.PERSONAS[def.persona];
    const logins = between(p.logins);
    for (let n = 0; n < logins; n++) {
      token = (await call(null, 'POST', '/api/auth/login', { email, password: C.STUDENT_PASSWORD })).token;
    }
    students.push({ ...def, email, p, token, id: signup.user.id, call: (m, u, b) => call(token, m, u, b) });
  }
  const active = students.filter((s) => s.persona !== 'ghost');

  /* ---------------- Level 1: done and marked ---------------- */
  say('Level 1: storyboard, pre-test, post-test, marking…');
  for (const s of active) {
    await readStory(s, levels[1], { stopAt: null });
    await takeTest(s, levels[1], 'pre');
  }
  await markAll(tc, levels[1].lesson.id, 'pre', levels[1]);
  for (const s of active) await takeTest(s, levels[1], 'post');
  await markAll(tc, levels[1].lesson.id, 'post', levels[1]);

  for (const s of active) await submitChallenge(s, C1);

  await board(tc, active, levels[1], assignments[1], { handIns: 12, poster: true });

  /* ---------------- quests: coins for the battles ---------------- */
  say('Daily Quests and coins…');
  for (const q of quests) {
    if (!q.def.answeredBy) continue;
    for (const s of active) {
      if (!chance(q.def.answeredBy)) continue;
      const answers = {};
      q.saved.questions.forEach((qq) => { answers[qq.id] = answerFor(qq, chance(s.p.skill + 0.1)); });
      await s.call('POST', `/api/quests/${q.saved.id}/submit`, { answers });
    }
    if (q.def.closeAfter) {
      // Close it the way a teacher would: edit its window.
      const { quest } = await tc('GET', `/api/teacher/quests/item/${q.saved.id}`);
      await tc('PUT', `/api/teacher/quests/${q.saved.id}`, { ...quest, closesAt: daysFromNow(-0.25) });
    }
  }

  /* ---------------- Level 2: in progress ---------------- */
  say('Level 2: storyboard, whiteboards, pre-test (left for you to mark)…');
  const onL2 = active.filter((s) => s.passedL1 && s.persona !== 'behind');
  for (const s of onL2) {
    await readStory(s, levels[2], { stopAt: s.midStory ? 3 : null });
    if (!s.midStory) await takeTest(s, levels[2], 'pre');
  }

  say('Challenges, the tutor, whiteboard working…');
  for (const s of onL2) if (!s.skipsDue) await submitChallenge(s, C2);
  const c3Writers = shuffled(onL2).slice(0, 16);
  for (const [n, s] of c3Writers.entries()) {
    if (n < 3) {
      const q = C3.saved.questions.find((x) => C3.keyOf[x.id] === 'massNucleus');
      for (let k = 0; k < 1 + (n % 2); k++) {
        await s.call('POST', '/api/tutor/ask', { challengeId: C3.saved.id, questionId: q.id, message: pickOne(C.TUTOR_QUESTIONS), lang: langOf(s) });
      }
    }
    await submitChallenge(s, C3, { boards: n < 7 });
  }

  await board(tc, onL2, levels[2], assignments[2], { handIns: 9, atom: true });

  /* ---------------- battles, duels, the Lab ---------------- */
  say('Coin Battles, duels and the Lab…');
  await battles(active, bankByText);
  await duels(active);
  for (const s of shuffled(active).slice(0, 5)) {
    for (let r = 0; r < 3; r++) {
      const game = r % 2 ? 'guess' : 'trueweird';
      const { round } = await s.call('POST', '/api/lab/round', { game });
      await s.call('POST', `/api/lab/round/${round.id}/answer`, { answer: game === 'guess' ? pickOne(round.choices) : chance(0.5) });
    }
  }

  /* ---------------- the teacher's records ---------------- */
  say('Gradebook and Student Logs profiles…');
  await tc('POST', '/api/teacher/gradebook/import', { lessonId: levels[1].lesson.id, source: 'pre' });
  await tc('POST', '/api/teacher/gradebook/import', { lessonId: levels[1].lesson.id, source: 'post' });
  const imported = await tc('POST', '/api/teacher/gradebook/import', { challengeId: C1.saved.id });
  const { columns } = await tc('POST', '/api/teacher/gradebook/columns', {
    columns: [...imported.columns, { name: 'Lab safety quiz (paper)', max: 10 }],
  });
  const paper = columns.find((c) => c.name === 'Lab safety quiz (paper)');
  for (const s of active) {
    await tc('POST', '/api/teacher/gradebook/score', { columnId: paper.id, studentId: s.id, score: Math.max(2, Math.round(10 * Math.min(1, s.p.skill + R() * 0.2))) });
  }
  for (const name of ['Ploy Srisuk', 'Tonkla Saetang']) {
    const s = students.find((x) => x.name === name);
    await tc('POST', `/api/teacher/logs/student/${s.id}/summary`, { lang: 'en' });
  }

  const pending = await tc('GET', '/api/teacher/submissions');
  say(`Done. ${students.length} students; ${pending.submissions.length} test papers waiting to be marked.`);
  return { students };

  /* ================= helpers that need the API ================= */

  /** Add storyboard questions and written test questions to a seeded level. */
  async function buildLevel(tcall, lesson, storyQs, tests) {
    const storyboard = (lesson.storyboard || []).slice();
    storyQs.slice().sort((a, b) => b.after - a.after).forEach((q) => {
      storyboard.splice(q.after, 0, { type: 'question', question: q.question, expected: q.expected, aiNote: q.aiNote || '', whiteboard: !!q.whiteboard });
    });
    const pre = ['easy', 'medium', 'hard'].flatMap((k) => (lesson.quizzes && lesson.quizzes[k]) || []).concat(tests.preWritten);
    const { lesson: saved } = await tcall('PUT', `/api/teacher/lessons/${lesson.id}`, {
      ...lesson,
      storyboard,
      quizzes: { easy: pre, medium: [], hard: [] },
      postTest: { timeLimit: 0, quizzes: { easy: tests.post, medium: [], hard: [] } },
    });
    const storyKey = {};
    saved.storyboard.forEach((st) => {
      const def = storyQs.find((q) => st.type === 'question' && q.question === st.question);
      if (def) storyKey[st.id] = def.key;
    });
    return {
      lesson: saved,
      storyKey,
      preKey: keysByText(tests.preWritten, saved.quizzes.easy),
      postKey: keysByText(tests.post, saved.postTest.quizzes.easy),
    };
  }

  /** Read a storyboard step by step, answering its questions on the way. */
  async function readStory(s, level, { stopAt }) {
    const L = level.lesson;
    const steps = L.storyboard;
    for (let i = 0; i < steps.length; i++) {
      if (stopAt != null && i >= stopAt) return;
      await s.call('POST', `/api/lessons/${L.id}/story-position`, { index: i });
      const st = steps[i];
      if (st.type !== 'question') continue;
      const key = level.storyKey[st.id];
      const answer = writtenFor(s, key);
      if (!answer) continue; // the page will not send an empty answer
      const saved = await s.call('POST', `/api/work/story/${L.id}/${st.id}`, { answer });
      if (saved.needsAnalysis) await s.call('POST', `/api/work/story-answer/${saved.id}/analyze`, { lang: langOf(s) });
      if (st.whiteboard && chance(0.35)) {
        const good = goodTier(answer, st.expected);
        const b = await s.call('POST', '/api/work/whiteboard', {
          kind: 'story', lessonId: L.id, questionId: st.id, answer,
          image: atomBoard({ good, labels: good && chance(0.7) }),
        });
        if (b.needsAnalysis) await s.call('POST', `/api/work/whiteboard/${b.id}/analyze`, { lang: langOf(s) });
      }
    }
    await s.call('POST', `/api/lessons/${L.id}/story-complete`);
  }

  /** Take a pre- or post-test. Records whether the student passed Level 1. */
  async function takeTest(s, level, mode) {
    const L = level.lesson;
    const qs = mode === 'pre' ? L.quizzes.easy : L.postTest.quizzes.easy;
    const keyOf = mode === 'pre' ? level.preKey : level.postKey;
    // After the lesson the post-test goes well: everyone gets the multiple
    // choice right and the written answer decides 71 / 86 / 100% (the pass
    // mark is 60%). Except the student written to fail it — it is one attempt
    // only, so they are stuck on this level, which is the point.
    const skill = mode === 'post' ? (s.failsPost ? 0.3 : 1) : s.p.skill;
    const answers = qs.map((q) => (q.type === 'written'
      ? (s.failsPost && mode === 'post' ? pickOne(C.ANSWERS[keyOf[q.id]].wrong) : writtenFor(s, keyOf[q.id]))
      : answerFor(q, chance(skill))));
    const url = mode === 'pre' ? `/api/lessons/${L.id}/complete` : `/api/lessons/${L.id}/posttest/complete`;
    await s.call('POST', url, { answers });
  }

  /** The teacher marks every waiting paper for one test, the way the fake Kru CJ would. */
  async function markAll(tcall, lessonId, mode, level) {
    const { submissions } = await tcall('GET', '/api/teacher/submissions');
    for (const sub of submissions.filter((x) => x.lessonId === lessonId && x.mode === mode)) {
      const scores = {};
      sub.written.forEach((w) => { scores[w.questionId] = Math.round(w.points * judge(w.answer, w.guide).ratio); });
      const { result } = await tcall('POST', `/api/teacher/submissions/${sub.id}/grade`, { scores });
      const s = students.find((x) => x.name === sub.userName);
      if (s && mode === 'post' && level === levels[1]) s.passedL1 = !!(result && result.passed);
    }
  }

  /** Hand in a challenge. Written answers come from the class file. */
  async function submitChallenge(s, ch, { boards } = {}) {
    const answers = {};
    for (const q of ch.saved.questions) {
      const key = ch.keyOf[q.id];
      if (q.type !== 'written') { answers[q.id] = answerFor(q, chance(s.p.skill)); continue; }
      answers[q.id] = writtenFor(s, key);
      if (boards && q.whiteboard && answers[q.id]) {
        const lines = C.BOARDS[key][goodTier(answers[q.id], q.rubric) ? 'good' : 'wrong'];
        const b = await s.call('POST', '/api/work/whiteboard', {
          kind: 'challenge', challengeId: ch.saved.id, questionId: q.id, answer: answers[q.id],
          image: workingBoard(lines, { crossOut: chance(0.3) ? 0 : undefined }),
        });
        if (b.needsAnalysis) await s.call('POST', `/api/work/whiteboard/${b.id}/analyze`, { lang: langOf(s) });
      }
    }
    await s.call('POST', `/api/challenges/${ch.saved.id}/submit`, { answers });
  }

  /** Hand-ins, ratings, comments, likes, private questions and class posts. */
  async function board(tcall, pool, level, assignment, { handIns, poster, atom }) {
    const L = level.lesson;
    const { def, post: a } = assignment;
    const crit = a.criteria || [];
    const authors = shuffled(pool).slice(0, handIns);
    const work = [];
    for (const [n, s] of authors.entries()) {
      const attachments = [];
      if (poster && n % 2 === 0) attachments.push({ name: 'poster.png', data: workingBoard(['ICE = SOLID', 'WATER = LIQUID', 'STEAM = GAS']) });
      if (atom && n % 3 !== 2) attachments.push({ name: 'atom.png', data: atomBoard({ good: s.p.skill > 0.5, labels: true }) });
      const { post } = await s.call('POST', `/api/posts/lesson/${L.id}`, { text: def.handIns[n % def.handIns.length], assignmentId: a.id, attachments });
      work.push({ post, author: s });
    }
    for (const w of work) {
      const raters = shuffled(pool.filter((s) => s !== w.author)).slice(0, between([1, 4]));
      for (const r of raters) {
        const scores = {};
        crit.forEach((c) => { scores[c.id] = between([3, 5]); });
        await r.call('POST', `/api/posts/${w.post.id}/rate`, { scores });
        if (chance(0.5)) await r.call('POST', `/api/posts/${w.post.id}/like`);
        if (chance(0.3)) await r.call('POST', `/api/posts/${w.post.id}/comment`, { text: pickOne(C.COMMENTS) });
      }
      // The teacher has rated the older assignment's work, not yet the new one.
      if (poster) {
        const scores = {};
        crit.forEach((c) => { scores[c.id] = between([2, 5]); });
        await tcall('POST', `/api/posts/${w.post.id}/rate`, { scores });
      }
    }
    const lv = level === levels[1] ? 1 : 2;
    for (const cp of C.CLASS_POSTS.filter((x) => x.level === lv)) {
      const s = pickOne(pool);
      const { post } = await s.call('POST', `/api/posts/lesson/${L.id}`, { text: cp.text });
      const replier = pickOne(pool.filter((x) => x !== s));
      await replier.call('POST', `/api/posts/${post.id}/comment`, { text: pickOne(C.COMMENTS) });
    }
    for (const pq of C.PRIVATE_QUESTIONS.filter((x) => x.level === lv)) {
      await pickOne(pool).call('POST', `/api/posts/${a.id}/question`, { text: pq.text });
    }
  }

  /** A few raids between students who have coins. */
  async function battles(pool, bank) {
    let done = 0;
    for (const attacker of shuffled(pool)) {
      if (done >= 10) break;
      const { opponents, coins } = await attacker.call('GET', '/api/battles/opponents');
      if (coins < 5) continue;
      const targets = opponents.filter((o) => o.attackable);
      if (!targets.length) continue;
      const target = pickOne(targets);
      // Stakes are easy 5 / medium 15 (battles.js DEFAULTS): only pick what this student can pay.
      const difficulty = coins >= 15 && chance(0.3) ? 'medium' : 'easy';
      let battle;
      try {
        ({ battle } = await attacker.call('POST', '/api/battles/start', { opponentId: target.id, difficulty }));
      } catch (err) {
        if (err.status === 403) continue; // refused (cooldown, coins…): a student would just pick someone else
        throw err;
      }
      const answers = {};
      battle.questions.forEach((q) => { answers[q.id] = answerFor(bank.get(q.question), chance(attacker.p.skill)); });
      await attacker.call('POST', `/api/battles/${battle.id}/answer`, { answers });
      done++;
    }
  }

  /** Three duels: one answered, two still waiting. */
  async function duels(pool) {
    const people = shuffled(pool.filter((s) => s.p.skill >= 0.6));
    const used = new Set();
    let made = 0;
    for (const from of people) {
      if (made >= C.DUEL_QUESTIONS.length) break;
      if (used.has(from)) continue;
      const { coins } = await from.call('GET', '/api/battles/opponents');
      if (coins < 5) continue; // cannot stake anything
      const question = C.DUEL_QUESTIONS[made];
      const check = await from.call('POST', '/api/battles/duels/check', { question, lang: langOf(from) });
      if (!check.ok) continue;
      let duel = null;
      let to = null;
      // Try classmates until one can be challenged (coins, cooldowns), as a student would.
      for (const cand of people.filter((x) => x !== from && !used.has(x))) {
        try {
          ({ duel } = await from.call('POST', '/api/battles/duels', { draftId: check.draftId, opponentId: cand.id, difficulty: 'easy' }));
          to = cand;
          break;
        } catch (err) {
          if (err.status !== 403) throw err;
        }
      }
      if (!duel) continue;
      used.add(from); used.add(to);
      if (made++ === 0) {
        // The question id is made by the server; the open view carries it.
        const opened = await to.call('POST', `/api/battles/duels/${duel.id}/open`);
        await to.call('POST', `/api/battles/duels/${duel.id}/answer`, {
          answers: { [opened.duel.question.id]: answerFor(question, chance(to.p.skill)) },
        });
      }
    }
  }
}

/** Map saved question id -> the class file's `key`, matched by question text. */
function keysByText(defs, saved) {
  const out = {};
  (saved || []).forEach((q) => {
    const def = defs.find((d) => d.question === q.question);
    if (def && def.key) out[q.id] = def.key;
  });
  return out;
}

module.exports = { fill };
