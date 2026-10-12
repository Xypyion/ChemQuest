// Lesson player. Three modes, chosen from the level board:
//   ?mode=story          — the storyboard on its own (lines + inline videos)
//   ?mode=pre  (default) — the pre-test on its own → results
//   ?mode=post           — the teacher-opened post-test → results (no certificate)
// The storyboard and the pre-test are separate activities: the teacher decides
// which comes first, and the server keeps the other one locked until the first
// is finished. Quizzes honour an optional countdown timer.

guard('student');
addClouds();
mountLangSwitch();

const params = new URLSearchParams(location.search);
const LESSON_ID = params.get('id');
const RAW_MODE = params.get('mode');
const MODE = RAW_MODE === 'post' ? 'post' : RAW_MODE === 'story' ? 'story' : 'pre';
const card = document.getElementById('stageCard');

const BOARD_URL = '/level.html?id=' + encodeURIComponent(LESSON_ID || '');

const PHASE_META = {
  story: { icon: '📖', label: () => t('lesson.phase.story') },
  storyDone: { icon: '✅', label: () => t('lesson.phase.storyDone') },
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

// Storyboard questions: stepId -> { id, answer } for the ones this student has
// already sent. A question step holds the Next button until it is answered.
let storyAnswers = {};
let storyDrafts = {};   // stepId -> text typed but not sent yet

// Resuming the storyboard: the step the server last saw, and whether the
// "picking up where you left off" note is still showing.
let savedStoryAt = -1;
let resumedNote = false;
const WB_KIND = MODE === 'post' ? 'post' : MODE === 'story' ? 'story' : 'pre';

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

    const act = lesson.activities || {};
    if (MODE === 'story') {
      if (act.storyLocked) { card.innerHTML = errorBox(t('lesson.storyLockedMsg')); return; }
      if (!(lesson.storyboard || []).length) { card.innerHTML = errorBox(t('lesson.noStoryYet')); return; }
      phases = ['story', 'storyDone'];
    } else {
      if (MODE === 'pre' && act.preLocked) { card.innerHTML = errorBox(t('lesson.preLockedMsg')); return; }
      if (!(lesson.questions || []).length) {
        card.innerHTML = errorBox(MODE === 'post' ? t('board.postTestNoQ') : t('lesson.noQuestionsYet'));
        return;
      }
      phases = ['quiz', 'result'];
    }
    answers = new Array((lesson.questions || []).length).fill(null);

    // What this student already sent: storyboard answers, and which
    // whiteboards on this level are in (so their buttons read "sent").
    try {
      const mine = await API.get('/api/work/story/' + encodeURIComponent(LESSON_ID));
      storyAnswers = mine.answers || {};
      Object.keys(mine.boards || {}).forEach((k) => Whiteboard.markSent(k));
    } catch { storyAnswers = {}; }

    if (MODE === 'story') resumeStory(act);
    goPhase(0);
  } catch (err) {
    card.innerHTML = errorBox(localizeErr(err.message));
  }
}

/** Map known server error codes to friendly, localized text. */
function localizeErr(msg) {
  if (msg === 'ALREADY_SUBMITTED') return t('lesson.alreadyPost');
  if (msg === 'PRETEST_LOCKED') return t('lesson.preLockedMsg');
  if (msg === 'STORY_LOCKED') return t('lesson.storyLockedMsg');
  return msg;
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
  Whiteboard.dock(null);   // each question shows it again if it uses the whiteboard
  const key = phases[idx];
  if (key !== 'quiz') stopQuizTimer();
  if (key === 'story') { storyIndex = Math.min(storyIndex, lesson.storyboard.length - 1); showStory(); }
  else if (key === 'storyDone') await showStoryDone();
  else if (key === 'quiz') { startQuizTimer(); showQuiz(); }
  else if (key === 'result') await showResult();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextPhaseLabel() {
  const next = phases[cur + 1];
  if (next === 'quiz') return t('lesson.startQuiz');
  if (next === 'storyDone') return t('lesson.finishStory');
  return t('lesson.finish');
}

/**
 * End of the storyboard. Tell the server the story is done (that is what
 * unlocks the pre-test when the teacher put the story first) and offer the
 * next step.
 */
async function showStoryDone() {
  card.innerHTML = `<div class="center"><div>${renderRuby('thinking', { size: 120 })}</div><p class="muted">${t('common.loading')}</p></div>`;
  let act = lesson.activities || {};
  try {
    const r = await API.post(`/api/lessons/${encodeURIComponent(LESSON_ID)}/story-complete`);
    if (r.activities) act = r.activities;
  } catch (err) {
    card.innerHTML = errorBox(localizeErr(err.message));
    return;
  }
  const preHref = `/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=pre`;
  const canPre = act.hasPre && !act.preLocked;
  card.innerHTML = `
    <div class="result">
      <div>${renderRuby('cheer', { size: 160, float: true })}</div>
      <h2>${t('lesson.storyDoneTitle')}</h2>
      <p class="muted">${t('lesson.storyDoneMsg')}</p>
      <div class="result-actions">
        ${canPre ? `<a class="btn big green" href="${preHref}">${t('lesson.goPreTest')}</a>` : ''}
        <a class="btn secondary" href="${BOARD_URL}">${t('lesson.backToBoard')}</a>
        <button class="btn ghost" id="readAgain">${t('lesson.readAgain')}</button>
      </div>
    </div>`;
  confetti(60);
  document.getElementById('readAgain').onclick = () => { storyIndex = 0; goPhase(phases.indexOf('story')); };
}

/* ----------------------------- STORYBOARD ----------------------------- */
/**
 * Open the storyboard where the student stopped last time. Never past a
 * question they have not answered yet: if the teacher added one earlier in
 * the story since, that is where they pick up.
 */
function resumeStory(act) {
  const steps = lesson.storyboard;
  savedStoryAt = Number.isInteger(act.storyAt) ? act.storyAt : 0;
  let at = Math.min(Math.max(savedStoryAt, 0), steps.length - 1);
  const gap = steps.findIndex((s, i) => i < at && s.type === 'question' && !storyAnswered(s));
  if (gap !== -1) at = gap;
  storyIndex = at;
  resumedNote = at > 0;
}

/** Tell the server which step is on screen. Fire-and-forget; one call per change. */
function saveStoryPosition() {
  if (storyIndex === savedStoryAt) return;
  savedStoryAt = storyIndex;
  API.post(`/api/lessons/${encodeURIComponent(LESSON_ID)}/story-position`, { index: storyIndex })
    .catch(() => { savedStoryAt = -1; });   // try again on the next step
}

function startStoryOver() {
  resumedNote = false;
  storyIndex = 0;
  showStory();
}

function showStory() {
  const step = lesson.storyboard[storyIndex];
  saveStoryPosition();
  const last = storyIndex === lesson.storyboard.length - 1;
  const dots = `<div class="dots">${lesson.storyboard.map((s, i) =>
    `<i class="${i <= storyIndex ? 'on' : ''} ${s.type === 'video' ? 'vid' : ''}"></i>`).join('')}</div>`;

  // A question step keeps Next shut until the student has sent an answer —
  // typed, or (on a whiteboard question) their board.
  const blocked = step.type === 'question' && !storyAnswered(step);
  const nav = `
    <div class="row" style="justify-content:center;margin-top:14px;gap:10px">
      ${storyIndex > 0 ? `<button class="btn ghost" id="prevStep">${t('lesson.back')}</button>` : ''}
      <button class="btn big green" id="nextStep" ${blocked ? 'disabled' : ''}>${last ? nextPhaseLabel() : t('lesson.next')}</button>
    </div>
    ${blocked ? `<div class="story-q-gate">${t('lesson.qAnswerToGoOn')}</div>` : ''}
    ${last ? '' : `<button class="btn ghost" style="margin-top:10px;font-size:.8rem;padding:8px 14px" id="skipStory">${t('lesson.skip')}</button>`}`;
  const resume = resumedNote ? `
    <div class="story-resume" role="status">
      <span>${t('lesson.resumed', { n: storyIndex + 1, total: lesson.storyboard.length })}</span>
      <button class="linkbtn" id="storyFromStart">${t('lesson.startOver')}</button>
    </div>` : '';

  if (step.type === 'question' && step.whiteboard) {
    // The teacher chose the whiteboard: no text box — the board IS the answer.
    const sentBoard = Whiteboard.isSent(storyBoardKey(step.id));
    card.innerHTML = `
      <div class="story-stage">${resume}
        <div class="ruby-hero">${renderRuby('thinking', { size: 170, float: true })}</div>
        ${step.image ? `<img class="story-img" src="${escapeHtml(step.image)}" alt="">` : ''}
        <div class="speech top pop-in story-q">
          <div class="speaker">${t('lesson.qKruAsks', { name: escapeHtml(speakerName('Kru CJ')) })}</div>
          <div>${chemLinks(step.question)}</div>
        </div>
        <div class="story-answer story-board-answer">
          <p class="story-board-how">${ICON.board(18)} ${t('lesson.qBoardHow')}</p>
          <div class="story-answer-row">
            <span class="story-answer-note ${sentBoard ? 'is-sent' : ''}">
              ${sentBoard ? t('lesson.qSent') : t('lesson.qNotGraded')}</span>
            <button class="btn secondary" id="openStoryBoardBtn">${ICON.board(18)} ${sentBoard ? t('lesson.qBoardAgain') : t('lesson.qBoardOpen')}</button>
          </div>
        </div>
        ${dots}${nav}
      </div>`;
    document.getElementById('openStoryBoardBtn').onclick = () => openStoryBoard(step.id);
  } else if (step.type === 'question') {
    const mine = storyAnswers[step.id];
    const draft = storyDrafts[step.id] != null ? storyDrafts[step.id] : (mine ? mine.answer : '');
    card.innerHTML = `
      <div class="story-stage">${resume}
        <div class="ruby-hero">${renderRuby('thinking', { size: 170, float: true })}</div>
        ${step.image ? `<img class="story-img" src="${escapeHtml(step.image)}" alt="">` : ''}
        <div class="speech top pop-in story-q">
          <div class="speaker">${t('lesson.qKruAsks', { name: escapeHtml(speakerName('Kru CJ')) })}</div>
          <div>${chemLinks(step.question)}</div>
        </div>
        <div class="story-answer">
          <textarea class="written-input" id="storyAnswer" rows="4"
                    placeholder="${escapeHtml(t('lesson.qAnswerPh'))}">${escapeHtml(draft)}</textarea>
          <div class="story-answer-row">
            <span class="story-answer-note ${mine ? 'is-sent' : ''}" id="storyAnsNote">
              ${mine ? t('lesson.qSent') : t('lesson.qNotGraded')}</span>
            <button class="btn secondary" id="sendStoryAns">${mine ? t('lesson.qUpdate') : t('lesson.qSend')}</button>
          </div>
        </div>
        ${dots}${nav}
      </div>`;
    const ta = document.getElementById('storyAnswer');
    ta.addEventListener('input', () => { storyDrafts[step.id] = ta.value; });
    document.getElementById('sendStoryAns').onclick = () => sendStoryAnswer(step);
  } else if (step.type === 'video') {
    const embed = youtubeEmbed(step.url);
    const body = embed
      ? `${step.title ? `<div class="video-title">🎬 ${escapeHtml(step.title)}</div>` : ''}
         <div class="video-frame"><iframe src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : `<p class="muted">${t('lesson.cantEmbed')}</p><a class="btn secondary" href="${encodeURI(step.url)}" target="_blank" rel="noopener">${t('lesson.openYoutube')}</a>`;
    card.innerHTML = `<div class="center">${resume}<h2>${t('lesson.watch')}</h2>
      <p class="muted">${t('lesson.watchSub')}</p>
      ${body}${dots}${nav}</div>`;
  } else {
    card.innerHTML = `
      <div class="story-stage">${resume}
        <div class="ruby-hero">${renderRuby(step.mood || 'happy', { size: 190, float: true })}</div>
        ${step.image ? `<img class="story-img" src="${escapeHtml(step.image)}" alt="storyboard image">` : ''}
        <div class="speech top pop-in">
          <div class="speaker">${escapeHtml(speakerName(step.character))}</div>
          <div>${chemLinks(step.text)}</div>
        </div>
        ${dots}${nav}
      </div>`;
  }

  Whiteboard.dock(step.type === 'question' && step.whiteboard
    ? { key: storyBoardKey(step.id), open: () => openStoryBoard(step.id) }
    : null);

  // The note is for the first step they land on; it goes once they move.
  resumedNote = false;
  const fromStart = document.getElementById('storyFromStart');
  if (fromStart) fromStart.onclick = startStoryOver;

  document.getElementById('nextStep').onclick = () => {
    if (step.type === 'question' && !storyAnswered(step)) return;
    if (last) goPhase(cur + 1);
    else { storyIndex++; showStory(); }
  };
  const prev = document.getElementById('prevStep');
  if (prev) prev.onclick = () => { storyIndex--; showStory(); };
  const skip = document.getElementById('skipStory');
  // Skipping the story still stops at a question nobody has answered yet —
  // otherwise "Skip" would be the way around every question the teacher asks.
  if (skip) skip.onclick = () => {
    const steps = lesson.storyboard;
    const next = steps.findIndex((s, i) => i > storyIndex && s.type === 'question' && !storyAnswered(s));
    if (next !== -1) { storyIndex = next; showStory(); }
    else goPhase(cur + 1);
  };
}

/** Send (or re-send) the answer to one storyboard question. */
async function sendStoryAnswer(step) {
  const ta = document.getElementById('storyAnswer');
  const btn = document.getElementById('sendStoryAns');
  const answer = (ta.value || '').trim();
  if (!answer) { toast(t('lesson.qEmpty'), 'bad'); ta.focus(); return; }
  btn.disabled = true;
  btn.textContent = t('lesson.qSending');
  try {
    const r = await API.post(
      `/api/work/story/${encodeURIComponent(LESSON_ID)}/${encodeURIComponent(step.id)}`,
      { answer, lang: getLang() });
    storyAnswers[step.id] = { id: r.id, answer, updatedAt: r.updatedAt };
    delete storyDrafts[step.id];
    toast(t('lesson.qSentToast'), 'good');
    // Kru CJ reads it for the teacher. Not awaited — the student moves on.
    if (r.needsAnalysis) {
      API.post(`/api/work/story-answer/${encodeURIComponent(r.id)}/analyze`, { lang: getLang() }).catch(() => {});
    }
    showStory();
  } catch (e) {
    toast(localizeErr(e.message), 'bad');
    btn.disabled = false;
    btn.textContent = storyAnswers[step.id] ? t('lesson.qUpdate') : t('lesson.qSend');
  }
}

function storyBoardKey(stepId) { return `story:${LESSON_ID}:${stepId}`; }

/** Has the student answered this storyboard question — by text, or by board? */
function storyAnswered(step) {
  return step.whiteboard ? Whiteboard.isSent(storyBoardKey(step.id)) : !!storyAnswers[step.id];
}

/** Open the whiteboard for a storyboard question. Sending it answers the question. */
function openStoryBoard(stepId) {
  const step = (lesson.storyboard || []).find((s) => s.id === stepId);
  if (!step) return;
  Whiteboard.open({
    key: storyBoardKey(stepId),
    question: step.question,
    payload: { kind: 'story', lessonId: LESSON_ID, questionId: stepId },
    // Re-draw the step so its note reads "sent" and Next opens.
    onSent: () => { if (lesson.storyboard[storyIndex] && lesson.storyboard[storyIndex].id === stepId) showStory(); },
  });
}

/** Open the whiteboard for the pre/post-test question on screen. */
function openQuizBoard(qid) {
  const q = (lesson.questions || []).find((x) => x.id === qid);
  if (!q) return;
  const i = lesson.questions.indexOf(q);
  Whiteboard.open({
    key: `${WB_KIND}:${LESSON_ID}:${qid}`,
    question: q.question,
    payload: { kind: WB_KIND, lessonId: LESSON_ID, questionId: qid },
    getAnswer: () => {
      const a = answers[i];
      if (a == null) return '';
      return q.type === 'written' ? String(a) : String((q.choices || [])[a] || '');
    },
  });
}

/** Point the bottom-left whiteboard button at the quiz question on screen (or hide it). */
function dockQuizBoard(q, n) {
  Whiteboard.dock(q.whiteboard && q.id
    ? { key: `${WB_KIND}:${LESSON_ID}:${q.id}`, label: t('lesson.question', { n, total: lesson.questions.length }), open: () => openQuizBoard(q.id) }
    : null);
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
  dockQuizBoard(q, quizIndex + 1);   // written questions return below, so this covers both

  if (q.type === 'written') return showWrittenQuestion(q, total, last);

  card.innerHTML = `
    <div class="quiz-head">
      <div class="q-counter">${t('lesson.question', { n: quizIndex + 1, total })}${MODE === 'post' && q.points ? ` · <span class="q-pts">${t('lesson.worthPts', { n: q.points })}</span>` : ''}</div>
      ${lesson.timeLimit ? `<div class="quiz-timer" id="quizTimer">⏱ --:--</div>` : ''}
    </div>
    <div class="q-text">${chemLinks(q.question)}</div>
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

/* Written (ข้อเขียน) question — the student types an answer the teacher grades later. */
function showWrittenQuestion(q, total, last) {
  const prev = typeof answers[quizIndex] === 'string' ? answers[quizIndex] : '';
  card.innerHTML = `
    <div class="quiz-head">
      <div class="q-counter">${t('lesson.question', { n: quizIndex + 1, total })}${MODE === 'post' && q.points ? ` · <span class="q-pts">${t('lesson.worthPts', { n: q.points })}</span>` : ''}</div>
      ${lesson.timeLimit ? `<div class="quiz-timer" id="quizTimer">⏱ --:--</div>` : ''}
    </div>
    <div class="q-text">${chemLinks(q.question)}</div>
    ${q.image ? `<img class="q-img" src="${escapeHtml(q.image)}" alt="">` : ''}
    <textarea class="written-input" id="writtenInput" rows="5" placeholder="${escapeHtml(t('lesson.writtenPlaceholder'))}">${escapeHtml(prev)}</textarea>
    <div class="written-note">✍️ ${t('lesson.writtenNote')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:16px">
      <button class="btn big green" id="nextQ">${last ? t('lesson.seeResults') : t('lesson.next')}</button>
    </div>`;

  if (lesson.timeLimit) paintTimer(Math.max(0, quizDeadline - Date.now()));
  const ta = document.getElementById('writtenInput');
  ta.addEventListener('input', () => { answers[quizIndex] = ta.value; });
  document.getElementById('nextQ').onclick = () => {
    answers[quizIndex] = ta.value;
    if (quizIndex < lesson.questions.length - 1) { quizIndex++; showQuiz(); }
    else goPhase(phases.indexOf('result'));
  };
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
  explain.innerHTML = (res.correct ? t('lesson.correct') : t('lesson.notQuite')) + chem(res.explanation || '');
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
    } catch (err) { card.innerHTML = errorBox(localizeErr(err.message)); return; }
  }
  const r = submitted;
  if (r.pending) return showPendingResult(r);
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
          <div class="meta">${cert.icon} · ${cert.score} ${t('lesson.pts')} · ${new Date(cert.dateEarned).toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined)}</div>
        </div>
        ${r.newCertificate ? `<p class="muted">${t('lesson.savedToInventory')}</p>` : ''}` : ''}
      <div class="result-actions">
        <a class="btn secondary" href="${BOARD_URL}">${t('lesson.backToBoard')}</a>
        <a class="btn ghost" href="/dashboard.html">${t('lesson.backToMap')}</a>
        ${MODE === 'pre' ? `<button class="btn ghost" id="replay">${t('lesson.playAgain')}</button>` : ''}
        ${nextHref ? `<a class="btn green" href="${nextHref}">${t('lesson.nextLevel')}</a>` : ''}
        ${MODE === 'pre' ? `<a class="btn grape" href="/inventory.html">${t('lesson.certificates')}</a>` : ''}
      </div>
    </div>`;

  if (r.passed) confetti();
  // "Play again" is only offered for the pre-test; the post-test is one attempt.
  const replayBtn = document.getElementById('replay');
  if (replayBtn) replayBtn.onclick = () => {
    submitted = null; storyIndex = 0; quizIndex = 0; timeExpired = false;
    answers = new Array(lesson.questions.length).fill(null);
    goPhase(0);
  };
}

/* Some answers need the teacher's eyes — no instant score for this attempt. */
function showPendingResult(r) {
  stopQuizTimer();
  card.innerHTML = `
    <div class="result">
      <div>${renderRuby('happy', { size: 160, float: true })}</div>
      <h2>${t('lesson.awaitingTitle')}</h2>
      ${timeExpired ? `<p class="muted">${t('lesson.timesUpSaved')}</p>` : ''}
      <p class="muted">${t('lesson.awaitingMsg')}</p>
      <div class="pending-box">
        <div>📝 ${t('lesson.awaitingWritten', { n: r.writtenPending })}</div>
        ${r.mcqTotal ? `<div>✅ ${t('lesson.awaitingMcq', { c: r.mcqCorrect, t: r.mcqTotal })}</div>` : ''}
      </div>
      <p class="muted">${t('lesson.totalPoints')} <b>${r.pointsTotal}</b></p>
      <div class="result-actions">
        <a class="btn secondary" href="${BOARD_URL}">${t('lesson.backToBoard')}</a>
        <a class="btn ghost" href="/dashboard.html">${t('lesson.backToMap')}</a>
      </div>
    </div>`;
}
