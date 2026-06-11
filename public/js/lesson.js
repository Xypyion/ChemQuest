// Lesson player. Two modes, chosen from the level board:
//   ?mode=pre  (default) — storyboard (lines + inline videos) → pre-test → results
//   ?mode=post           — the teacher-opened post-test → results (no certificate)
// Both honour an optional countdown timer and return to the level board.

guard('student');
addClouds();
mountLangSwitch();

const params = new URLSearchParams(location.search);
const LESSON_ID = params.get('id');
const MODE = params.get('mode') === 'post' ? 'post' : 'pre';
const card = document.getElementById('stageCard');

const BOARD_URL = '/level.html?id=' + encodeURIComponent(LESSON_ID || '');

const PHASE_META = {
  story: { icon: '📖', label: () => t('lesson.phase.story') },
  quiz: { icon: '❓', label: () => (MODE === 'post' ? t('lesson.phase.posttest') : t('lesson.phase.quiz')) },
  result: { icon: '🏆', label: () => t('lesson.phase.result') },
};

let lesson = null;
let phases = [];
let cur = 0;
let storyIndex = 0;
let quizIndex = 0;
let answers = [];
let submitted = null;

// quiz timer state
let quizDeadline = 0;
let quizTimerId = null;
let timeExpired = false;

start();

async function start() {
  if (!LESSON_ID) { card.innerHTML = errorBox(t('lesson.noLevel')); return; }
  try {
    const path = MODE === 'post'
      ? `/api/lessons/${encodeURIComponent(LESSON_ID)}/posttest`
      : '/api/lessons/' + encodeURIComponent(LESSON_ID);
    const data = await API.get(path);
    lesson = data.lesson;
    document.getElementById('lessonTitlePill').textContent =
      lesson.icon + ' ' + lesson.title + (MODE === 'post' ? ' · 🧾' : '');
    const dp = document.getElementById('diffPill');
    dp.className = 'pill ' + lesson.difficulty;
    dp.textContent = tDiff(lesson.difficulty);

    phases = [];
    if (MODE === 'pre' && (lesson.storyboard || []).length) phases.push('story');
    if ((lesson.questions || []).length) phases.push('quiz');
    phases.push('result');
    answers = new Array((lesson.questions || []).length).fill(null);

    goPhase(0);
  } catch (err) {
    card.innerHTML = errorBox(err.message);
  }
}

function errorBox(msg) {
  return `<div class="center stack">
    <div>${renderRuby('sad', { size: 150 })}</div>
    <h2>${t('common.oops')}</h2>
    <p class="muted">${escapeHtml(msg)}</p>
    <a class="btn secondary" href="${BOARD_URL}">${t('lesson.backToBoard')}</a>
    <a class="btn ghost" href="/dashboard.html">${t('lesson.backToMap')}</a>
  </div>`;
}

function renderSteps() {
  document.getElementById('steps').innerHTML = phases.map((p, i) => {
    const m = PHASE_META[p];
    const cls = i < cur ? 'done' : i === cur ? 'active' : '';
    return `<div class="step ${cls}">${m.icon} ${m.label()}</div>`;
  }).join('');
}

async function goPhase(idx) {
  cur = idx;
  renderSteps();
  removeQuizRuby();
  const key = phases[idx];
  if (key !== 'quiz') stopQuizTimer();
  if (key === 'story') { storyIndex = Math.min(storyIndex, lesson.storyboard.length - 1); showStory(); }
  else if (key === 'quiz') { startQuizTimer(); showQuiz(); }
  else if (key === 'result') await showResult();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextPhaseLabel() {
  const next = phases[cur + 1];
  if (next === 'quiz') return t('lesson.startQuiz');
  return t('lesson.finish');
}

/* ----------------------------- STORYBOARD ----------------------------- */
function showStory() {
  const step = lesson.storyboard[storyIndex];
  const last = storyIndex === lesson.storyboard.length - 1;
  const dots = `<div class="dots">${lesson.storyboard.map((s, i) =>
    `<i class="${i <= storyIndex ? 'on' : ''} ${s.type === 'video' ? 'vid' : ''}"></i>`).join('')}</div>`;

  const nav = `
    <div class="row" style="justify-content:center;margin-top:14px;gap:10px">
      ${storyIndex > 0 ? `<button class="btn ghost" id="prevStep">${t('lesson.back')}</button>` : ''}
      <button class="btn big green" id="nextStep">${last ? nextPhaseLabel() : t('lesson.next')}</button>
    </div>
    ${last ? '' : `<button class="btn ghost" style="margin-top:10px;font-size:.8rem;padding:8px 14px" id="skipStory">${t('lesson.skip')}</button>`}`;

  if (step.type === 'video') {
    const embed = youtubeEmbed(step.url);
    const body = embed
      ? `${step.title ? `<div class="video-title">🎬 ${escapeHtml(step.title)}</div>` : ''}
         <div class="video-frame"><iframe src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : `<p class="muted">${t('lesson.cantEmbed')}</p><a class="btn secondary" href="${encodeURI(step.url)}" target="_blank" rel="noopener">${t('lesson.openYoutube')}</a>`;
    card.innerHTML = `<div class="center"><h2>${t('lesson.watch')}</h2>
      <p class="muted">${t('lesson.watchSub')}</p>
      ${body}${dots}${nav}</div>`;
  } else {
    card.innerHTML = `
      <div class="story-stage">
        <div class="ruby-hero">${renderRuby(step.mood || 'happy', { size: 190, float: true })}</div>
        ${step.image ? `<img class="story-img" src="${escapeHtml(step.image)}" alt="storyboard image">` : ''}
        <div class="speech top pop-in">
          <div class="speaker">${escapeHtml(step.character || 'Ruby')}</div>
          <div>${escapeHtml(step.text)}</div>
        </div>
        ${dots}${nav}
      </div>`;
  }

  document.getElementById('nextStep').onclick = () => {
    if (last) goPhase(cur + 1);
    else { storyIndex++; showStory(); }
  };
  const prev = document.getElementById('prevStep');
  if (prev) prev.onclick = () => { storyIndex--; showStory(); };
  const skip = document.getElementById('skipStory');
  if (skip) skip.onclick = () => goPhase(cur + 1);
}

/* ------------------------------ QUIZ TIMER ---------------------------- */
function startQuizTimer() {
  stopQuizTimer();
  timeExpired = false;
  if (!lesson.timeLimit) return;
  quizDeadline = Date.now() + lesson.timeLimit * 1000;
  quizTimerId = setInterval(tickTimer, 250);
}
function stopQuizTimer() { if (quizTimerId) { clearInterval(quizTimerId); quizTimerId = null; } }
function tickTimer() {
  const remaining = Math.max(0, quizDeadline - Date.now());
  paintTimer(remaining);
  if (remaining <= 0) {
    stopQuizTimer();
    timeExpired = true;
    toast(t('lesson.timesUpToast'), 'bad');
    goPhase(phases.indexOf('result'));
  }
}
function paintTimer(remaining) {
  const el = document.getElementById('quizTimer');
  if (!el) return;
  const s = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  el.textContent = `⏱ ${mm}:${ss}`;
  el.classList.toggle('warn', s <= 10);
}

/* -------------------------------- QUIZ -------------------------------- */
function checkPath() {
  return MODE === 'post'
    ? `/api/lessons/${encodeURIComponent(LESSON_ID)}/posttest/check`
    : `/api/lessons/${encodeURIComponent(LESSON_ID)}/check`;
}
function completePath() {
  return MODE === 'post'
    ? `/api/lessons/${encodeURIComponent(LESSON_ID)}/posttest/complete`
    : `/api/lessons/${encodeURIComponent(LESSON_ID)}/complete`;
}

function showQuiz() {
  ensureQuizRuby('thinking');
  const q = lesson.questions[quizIndex];
  const total = lesson.questions.length;
  const last = quizIndex === total - 1;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  card.innerHTML = `
    <div class="quiz-head">
      <div class="q-counter">${t('lesson.question', { n: quizIndex + 1, total })}</div>
      ${lesson.timeLimit ? `<div class="quiz-timer" id="quizTimer">⏱ --:--</div>` : ''}
    </div>
    <div class="q-text">${escapeHtml(q.question)}</div>
    ${q.image ? `<img class="q-img" src="${escapeHtml(q.image)}" alt="">` : ''}
    <div class="choices" id="choices">
      ${q.choices.map((c, i) => `
        <button class="choice ${answers[quizIndex] === i ? 'picked' : ''}" data-i="${i}">
          <span class="ltr">${letters[i]}</span><span>${escapeHtml(c)}</span>
        </button>`).join('')}
    </div>
    <div class="explain" id="explain"></div>
    <div class="row" style="justify-content:flex-end;margin-top:16px">
      <button class="btn big green hidden" id="nextQ">${last ? t('lesson.seeResults') : t('lesson.next')}</button>
    </div>`;

  if (lesson.timeLimit) paintTimer(Math.max(0, quizDeadline - Date.now()));
  document.getElementById('choices').querySelectorAll('.choice').forEach((btn) => {
    btn.onclick = () => answerQuestion(btn, q);
  });
}

async function answerQuestion(btn, q) {
  const chosen = Number(btn.dataset.i);
  answers[quizIndex] = chosen; // record the latest answer (kept even if the timer expires)
  const all = [...document.querySelectorAll('.choice')];
  all.forEach((b) => (b.disabled = true));

  let res;
  try {
    res = await API.post(checkPath(), { questionIndex: quizIndex, answer: chosen });
  } catch (e) { res = { correct: false, correctIndex: -1, explanation: '' }; }

  all.forEach((b) => {
    const i = Number(b.dataset.i);
    if (i === res.correctIndex) b.classList.add('correct');
    else if (i === chosen) b.classList.add('wrong');
    else b.classList.add('dim');
  });

  const explain = document.getElementById('explain');
  explain.className = 'explain show ' + (res.correct ? 'right' : 'wrong');
  explain.innerHTML = (res.correct ? t('lesson.correct') : t('lesson.notQuite')) + escapeHtml(res.explanation || '');
  ensureQuizRuby(res.correct ? 'cheer' : 'sad');
  if (res.correct) { try { miniPop(btn); } catch {} }

  const nextBtn = document.getElementById('nextQ');
  nextBtn.classList.remove('hidden');
  nextBtn.onclick = () => {
    if (quizIndex < lesson.questions.length - 1) { quizIndex++; showQuiz(); }
    else { goPhase(phases.indexOf('result')); }
  };
}

function miniPop(el) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('div');
    s.textContent = ['✨', '⭐', '🎉'][i % 3];
    s.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top}px;z-index:999;pointer-events:none;transition:all .8s ease;font-size:18px`;
    document.body.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = `translate(${(Math.random() - 0.5) * 160}px,${-40 - Math.random() * 80}px)`;
      s.style.opacity = '0';
    });
    setTimeout(() => s.remove(), 850);
  }
}

function ensureQuizRuby(mood) {
  let el = document.querySelector('.quiz-ruby');
  if (!el) { el = document.createElement('div'); el.className = 'quiz-ruby'; document.body.appendChild(el); }
  el.innerHTML = renderRuby(mood, { size: 120 });
}
function removeQuizRuby() { const el = document.querySelector('.quiz-ruby'); if (el) el.remove(); }

/* ------------------------------- RESULTS ------------------------------ */
async function showResult() {
  stopQuizTimer();
  card.innerHTML = `<div class="center"><div>${renderRuby('thinking', { size: 120 })}</div><p class="muted">${t('lesson.grading')}</p></div>`;
  if (!submitted) {
    try {
      submitted = await API.post(completePath(), { answers });
      if (submitted.user) API.updateUser(submitted.user);
    } catch (err) { card.innerHTML = errorBox(err.message); return; }
  }
  const r = submitted;
  const pct = r.total ? Math.round((r.correct / r.total) * 100) : 100;
  const ringColor = r.passed ? 'var(--grass)' : 'var(--primary)';

  let nextHref = null;
  if (MODE === 'pre') {
    try {
      const list = await API.get('/api/lessons');
      const i = list.lessons.findIndex((l) => l.id === LESSON_ID);
      const nxt = list.lessons[i + 1];
      if (nxt && !nxt.locked) nextHref = `/level.html?id=${encodeURIComponent(nxt.id)}`;
    } catch {}
  }

  const heading = timeExpired
    ? t('lesson.timesUp')
    : MODE === 'post'
      ? t('lesson.postDone')
      : r.passed ? t('lesson.complete') : t('lesson.goodTry');

  const scoreLine = MODE === 'post'
    ? t('lesson.postScored', { s: r.score })
    : r.passed ? t('lesson.scored', { s: r.score }) : t('lesson.needPass');

  const cert = r.certificate;
  card.innerHTML = `
    <div class="result">
      <div>${renderRuby(r.passed ? 'cheer' : 'happy', { size: 160, float: true })}</div>
      <h2>${heading}</h2>
      ${timeExpired ? `<p class="muted">${t('lesson.timesUpSaved')}</p>` : ''}
      <div class="score-ring" style="--p:${pct}%; background:conic-gradient(${ringColor} ${pct}%, #ececf5 0)">
        <div class="inner"><div class="pct">${pct}%</div><div class="sub">${t('lesson.correctCount', { c: r.correct, t: r.total })}</div></div>
      </div>
      <p style="font-weight:700;font-size:1.1rem">${scoreLine}</p>
      <p class="muted">${t('lesson.totalPoints')} <b>${r.pointsTotal}</b></p>
      ${MODE === 'pre' && r.passed && cert ? `
        <div class="cert-preview pop-in">
          <div class="ribbon">🎖️</div>
          <h3>${t('lesson.certTitle')}</h3>
          <div class="who">${escapeHtml(API.user().name)}</div>
          <div>${t('lesson.mastered')} <b>${escapeHtml(cert.title)}</b></div>
          <div class="meta">${cert.icon} ${tDiff(cert.difficulty)} · ${cert.score} ${t('lesson.pts')} · ${new Date(cert.dateEarned).toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined)}</div>
        </div>
        ${r.newCertificate ? `<p class="muted">${t('lesson.savedToInventory')}</p>` : ''}` : ''}
      <div class="result-actions">
        <a class="btn secondary" href="${BOARD_URL}">${t('lesson.backToBoard')}</a>
        <a class="btn ghost" href="/dashboard.html">${t('lesson.backToMap')}</a>
        <button class="btn ghost" id="replay">${t('lesson.playAgain')}</button>
        ${nextHref ? `<a class="btn green" href="${nextHref}">${t('lesson.nextLevel')}</a>` : ''}
        ${MODE === 'pre' ? `<a class="btn grape" href="/inventory.html">${t('lesson.certificates')}</a>` : ''}
      </div>
    </div>`;

  if (r.passed) confetti();
  document.getElementById('replay').onclick = () => {
    submitted = null; storyIndex = 0; quizIndex = 0; timeExpired = false;
    answers = new Array(lesson.questions.length).fill(null);
    goPhase(0);
  };
}
