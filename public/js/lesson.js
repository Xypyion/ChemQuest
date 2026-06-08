// Lesson player: walk the ordered storyboard (lines + inline videos), then the
// quiz (with an optional countdown timer), then the results + certificate.

guard('student');
addClouds();

const params = new URLSearchParams(location.search);
const LESSON_ID = params.get('id');
const card = document.getElementById('stageCard');

const PHASE_META = {
  story: { icon: '📖', label: 'Story' },
  quiz: { icon: '❓', label: 'Quiz' },
  result: { icon: '🏆', label: 'Certificate' },
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
  if (!LESSON_ID) { card.innerHTML = errorBox('No level was selected.'); return; }
  try {
    const data = await API.get('/api/lessons/' + encodeURIComponent(LESSON_ID));
    lesson = data.lesson;
    document.getElementById('lessonTitlePill').textContent = lesson.icon + ' ' + lesson.title;
    const dp = document.getElementById('diffPill');
    dp.className = 'pill ' + lesson.difficulty;
    dp.textContent = lesson.difficulty.toUpperCase();

    phases = [];
    if ((lesson.storyboard || []).length) phases.push('story');
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
    <h2>Oops!</h2>
    <p class="muted">${escapeHtml(msg)}</p>
    <a class="btn secondary" href="/dashboard.html">🗺️ Back to Map</a>
  </div>`;
}

function renderSteps() {
  document.getElementById('steps').innerHTML = phases.map((p, i) => {
    const m = PHASE_META[p];
    const cls = i < cur ? 'done' : i === cur ? 'active' : '';
    return `<div class="step ${cls}">${m.icon} ${m.label}</div>`;
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
  if (next === 'quiz') return 'Start the Quiz ❓';
  return 'Finish ▶';
}

/* ----------------------------- STORYBOARD ----------------------------- */
function showStory() {
  const step = lesson.storyboard[storyIndex];
  const last = storyIndex === lesson.storyboard.length - 1;
  const dots = `<div class="dots">${lesson.storyboard.map((s, i) =>
    `<i class="${i <= storyIndex ? 'on' : ''} ${s.type === 'video' ? 'vid' : ''}"></i>`).join('')}</div>`;

  const nav = `
    <div class="row" style="justify-content:center;margin-top:14px;gap:10px">
      ${storyIndex > 0 ? `<button class="btn ghost" id="prevStep">◀ Back</button>` : ''}
      <button class="btn big green" id="nextStep">${last ? nextPhaseLabel() : 'Next ▶'}</button>
    </div>
    ${last ? '' : `<button class="btn ghost" style="margin-top:10px;font-size:.8rem;padding:8px 14px" id="skipStory">Skip story ⏩</button>`}`;

  if (step.type === 'video') {
    const embed = youtubeEmbed(step.url);
    const body = embed
      ? `${step.title ? `<div class="video-title">🎬 ${escapeHtml(step.title)}</div>` : ''}
         <div class="video-frame"><iframe src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : `<p class="muted">Couldn't embed this video.</p><a class="btn secondary" href="${encodeURI(step.url)}" target="_blank" rel="noopener">▶ Open on YouTube</a>`;
    card.innerHTML = `<div class="center"><h2>🎬 Watch &amp; Learn</h2>
      <p class="muted">Ruby picked this clip for you. Watch it, then keep going!</p>
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
    toast("⏰ Time's up! Saving your answers…", 'bad');
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
function showQuiz() {
  ensureQuizRuby('thinking');
  const q = lesson.questions[quizIndex];
  const total = lesson.questions.length;
  const last = quizIndex === total - 1;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  card.innerHTML = `
    <div class="quiz-head">
      <div class="q-counter">Question ${quizIndex + 1} of ${total}</div>
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
      <button class="btn big green hidden" id="nextQ">${last ? 'See my results 🏆' : 'Next ▶'}</button>
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
    res = await API.post(`/api/lessons/${encodeURIComponent(LESSON_ID)}/check`, { questionIndex: quizIndex, answer: chosen });
  } catch (e) { res = { correct: false, correctIndex: -1, explanation: '' }; }

  all.forEach((b) => {
    const i = Number(b.dataset.i);
    if (i === res.correctIndex) b.classList.add('correct');
    else if (i === chosen) b.classList.add('wrong');
    else b.classList.add('dim');
  });

  const explain = document.getElementById('explain');
  explain.className = 'explain show ' + (res.correct ? 'right' : 'wrong');
  explain.innerHTML = (res.correct ? '✅ <b>Correct!</b> ' : '❌ <b>Not quite.</b> ') + escapeHtml(res.explanation || '');
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
  card.innerHTML = `<div class="center"><div>${renderRuby('thinking', { size: 120 })}</div><p class="muted">Grading your answers…</p></div>`;
  if (!submitted) {
    try {
      submitted = await API.post(`/api/lessons/${encodeURIComponent(LESSON_ID)}/complete`, { answers });
      if (submitted.user) API.updateUser(submitted.user);
    } catch (err) { card.innerHTML = errorBox(err.message); return; }
  }
  const r = submitted;
  const pct = r.total ? Math.round((r.correct / r.total) * 100) : 100;
  const ringColor = r.passed ? 'var(--grass)' : 'var(--primary)';

  let nextHref = null;
  try {
    const list = await API.get('/api/lessons');
    const i = list.lessons.findIndex((l) => l.id === LESSON_ID);
    const nxt = list.lessons[i + 1];
    if (nxt && !nxt.locked) nextHref = `/lesson.html?id=${encodeURIComponent(nxt.id)}`;
  } catch {}

  const cert = r.certificate;
  card.innerHTML = `
    <div class="result">
      <div>${renderRuby(r.passed ? 'cheer' : 'happy', { size: 160, float: true })}</div>
      <h2>${timeExpired ? "⏰ Time's up!" : r.passed ? 'Level Complete! 🎉' : 'Good try! 💪'}</h2>
      ${timeExpired ? `<p class="muted">We saved the answers you had so far.</p>` : ''}
      <div class="score-ring" style="--p:${pct}%; background:conic-gradient(${ringColor} ${pct}%, #ececf5 0)">
        <div class="inner"><div class="pct">${pct}%</div><div class="sub">${r.correct}/${r.total} correct</div></div>
      </div>
      <p style="font-weight:700;font-size:1.1rem">
        ${r.passed ? `You scored <b>${r.score}</b> points! ⭐` : `Score 60% or more to earn your certificate. You can try again!`}
      </p>
      <p class="muted">Total points: <b>${r.pointsTotal}</b></p>
      ${r.passed && cert ? `
        <div class="cert-preview pop-in">
          <div class="ribbon">🎖️</div>
          <h3>Certificate of Achievement</h3>
          <div class="who">${escapeHtml(API.user().name)}</div>
          <div>has mastered <b>${escapeHtml(cert.title)}</b></div>
          <div class="meta">${cert.icon} ${escapeHtml((cert.difficulty || '').toUpperCase())} · ${cert.score} pts · ${new Date(cert.dateEarned).toLocaleDateString()}</div>
        </div>
        ${r.newCertificate ? '<p class="muted">Saved to your Certificates inventory! 🎒</p>' : ''}` : ''}
      <div class="result-actions">
        <a class="btn secondary" href="/dashboard.html">🗺️ Back to Map</a>
        <button class="btn ghost" id="replay">🔁 Play again</button>
        ${nextHref ? `<a class="btn green" href="${nextHref}">Next Level ▶</a>` : ''}
        <a class="btn grape" href="/inventory.html">🎖️ Certificates</a>
      </div>
    </div>`;

  if (r.passed) confetti();
  document.getElementById('replay').onclick = () => {
    submitted = null; storyIndex = 0; quizIndex = 0; timeExpired = false;
    answers = new Array(lesson.questions.length).fill(null);
    goPhase(0);
  };
}
