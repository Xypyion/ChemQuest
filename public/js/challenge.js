/**
 * Challenge player — the student side of the 🧩 Challenges board section.
 *
 * Renders every question type the teacher can build:
 *   mcq · multi · short · written · table (fill in the blanks) · simulation
 * A simulation runs inside a sandboxed iframe (no same-origin access, so
 * teacher-authored HTML can never touch the student's session) with its own
 * sub-questions underneath it.
 */

guard('student');
addClouds();
mountLangSwitch();

const params = new URLSearchParams(location.search);
const CHALLENGE_ID = params.get('id');
const stage = document.getElementById('chStage');

let challenge = null;
let category = null;
let mySubmission = null;
let reviewing = false;   // showing the marked result instead of the form
let sending = false;

// countdown
let deadline = 0;
let timerId = null;

start();

async function start() {
  if (!CHALLENGE_ID) { stage.innerHTML = errorBox(t('ch.notFound')); return; }
  try {
    const data = await API.get('/api/challenges/' + encodeURIComponent(CHALLENGE_ID));
    challenge = data.challenge;
    category = data.category;
    mySubmission = data.mySubmission;
    reviewing = !!mySubmission;
    document.getElementById('chTitlePill').textContent = (challenge.icon || '🧩') + ' ' + challenge.title;
    render();
  } catch (e) {
    stage.innerHTML = errorBox(e.message);
  }
}

function boardUrl() {
  return challenge && challenge.lessonId
    ? `/level.html?id=${encodeURIComponent(challenge.lessonId)}&tab=challenges`
    : '/dashboard.html';
}

function errorBox(msg) {
  return `<div class="center stack card" style="padding:26px">
    <div>${renderRuby('sad', { size: 140 })}</div>
    <h2>${t('common.oops')}</h2>
    <p class="muted">${escapeHtml(msg)}</p>
    <a class="btn secondary" href="/dashboard.html">${t('ch.backMap')}</a>
  </div>`;
}

/* ------------------------------- rendering ------------------------------ */

function render() {
  const head = `
    <div class="ch-head pop-in">
      <div class="ch-head-ico">${escapeHtml(challenge.icon || '🧩')}</div>
      <div class="ch-head-info">
        <h1>${escapeHtml(challenge.title)}</h1>
        ${category ? `<div class="ch-cat">${escapeHtml((category.icon || '📂') + ' ' + category.name)}</div>` : ''}
        ${challenge.description ? `<p class="ch-instructions">${escapeHtml(challenge.description)}</p>` : ''}
        <div class="ch-head-meta">
          <span>${t('ch.meta', { q: challenge.questions.length, s: challenge.questions.length === 1 ? '' : 's', p: challenge.maxPoints })}</span>
          ${challenge.dueAt ? `<span>${t('ch.due', { time: fmtWhen(challenge.dueAt) })}</span>` : ''}
        </div>
      </div>
    </div>`;

  const body = reviewing ? resultHtml() : formHtml();
  stage.innerHTML = head + body;

  if (!reviewing) {
    const btn = document.getElementById('chSubmit');
    if (btn) btn.onclick = () => submit(false);
    startTimer();
  } else {
    stopTimer();
  }
}

function formHtml() {
  const questions = challenge.questions.map((q, i) => questionHtml(q, i + 1)).join('');
  return `
    <form class="ch-form" id="chForm" onsubmit="return false">
      ${questions || `<div class="card center muted" style="padding:20px">${t('ch.none')}</div>`}
      <div class="ch-actions">
        <a class="btn ghost" href="${boardUrl()}">${t('ch.back')}</a>
        <button class="btn big green" id="chSubmit" type="button">${t('ch.submit')}</button>
      </div>
    </form>`;
}

/** One question card (a simulation renders its frame plus its sub-questions). */
function questionHtml(q, n, sub) {
  if (q.type === 'simulation') {
    const inner = (q.sub || []).map((sq, i) => questionHtml(sq, i + 1, true)).join('');
    return `
      <section class="ch-q sim">
        ${q.question ? `<div class="ch-q-text">${chem(q.question)}</div>` : ''}
        <div class="ch-sim-hint">🧪 ${t('ch.simHint')}</div>
        ${simFrameHtml(q.sim)}
        ${q.image ? `<img class="ch-q-img" src="${escapeHtml(q.image)}" alt="">` : ''}
        <div class="ch-subs">${inner}</div>
      </section>`;
  }

  const label = sub
    ? `<span class="ch-q-n sub">${t('ch.qLabel', { n })}</span>`
    : `<span class="ch-q-n">${t('ch.qLabel', { n })}</span>`;
  return `
    <section class="ch-q" data-qid="${escapeHtml(q.id)}" data-qtype="${q.type}">
      <div class="ch-q-head">
        ${label}
        <span class="ch-q-head-right">
          <button type="button" class="ch-tutor-btn" onclick="askRuby('${q.id}')">💬 ${t('tutor.ask')}</button>
          <span class="ch-q-pts">${t('ch.pts', { n: q.points })}</span>
        </span>
      </div>
      <div class="ch-q-text">${chem(q.question)}</div>
      ${q.image ? `<img class="ch-q-img" src="${escapeHtml(q.image)}" alt="">` : ''}
      ${answerHtml(q)}
    </section>`;
}

/** Open the Ruby help panel for one question, with the student's current draft. */
function askRuby(qid) {
  const q = flatten(challenge.questions).find((x) => x.id === qid);
  if (!q) return;
  Tutor.open({
    challengeId: CHALLENGE_ID,
    questionId: qid,
    questionLabel: q.question,
    getDraft: () => {
      const answers = collectAnswers();
      return qid in answers ? myAnswerText(q, answers[qid]) : '';
    },
  });
}

// Rendering + answer collection are shared with the quest player — see js/qrender.js.
const answerHtml = (q) => QRender.answerHtml(q);
const tableHtml = (q) => QRender.tableHtml(q);

/**
 * The teacher's simulation, in a sandboxed frame.
 * `allow-scripts` WITHOUT `allow-same-origin` gives the frame an opaque origin,
 * so its scripts cannot read the page, the token or localStorage.
 */
function simFrameHtml(sim) {
  sim = sim || {};
  const h = Math.max(160, Math.min(1200, sim.height || 420));
  if (sim.mode === 'url') {
    if (!sim.url) return `<div class="ch-hint">${t('ch.simMissing')}</div>`;
    return `<iframe class="ch-sim" style="height:${h}px" src="${escapeHtml(sim.url)}"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy"
      referrerpolicy="no-referrer" title="simulation"></iframe>`;
  }
  if (!(sim.html || '').trim()) return `<div class="ch-hint">${t('ch.simMissing')}</div>`;
  return `<iframe class="ch-sim" style="height:${h}px" srcdoc="${escapeHtml(simDocument(sim.html))}"
    sandbox="allow-scripts allow-popups" title="simulation"></iframe>`;
}

/** Wrap the teacher's snippet in a tiny document so it looks at home. */
function simDocument(html) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{margin:0;padding:12px;font-family:'Rubik','Mitr',system-ui,sans-serif;color:#3a3357;background:#fff}
  img,canvas,svg,video{max-width:100%}
</style></head><body>${html}</body></html>`;
}

/* ------------------------------- answering ------------------------------ */

const collectAnswers = () => QRender.collectAnswers();

async function submit(auto) {
  if (sending) return;
  const answers = collectAnswers();
  if (!auto) {
    if (!Object.keys(answers).length) { toast(t('ch.required'), 'bad'); return; }
    const ok = confirm(challenge.allowRetake ? t('ch.confirmSubmitRetake') : t('ch.confirmSubmit'));
    if (!ok) return;
  }
  sending = true;
  const btn = document.getElementById('chSubmit');
  if (btn) { btn.disabled = true; btn.textContent = t('ch.submitting'); }
  try {
    const r = await API.post(`/api/challenges/${encodeURIComponent(CHALLENGE_ID)}/submit`, { answers });
    mySubmission = r.submission;
    reviewing = true;
    toast(t('ch.sent'), 'good');
    confetti(80);
    render();
  } catch (e) {
    toast(e.message === 'ALREADY_SUBMITTED' ? t('ch.alreadyDone') : e.message, 'bad');
    if (btn) { btn.disabled = false; btn.textContent = t('ch.submit'); }
  } finally {
    sending = false;
  }
}

/* --------------------------------- timer -------------------------------- */

function startTimer() {
  stopTimer();
  const pill = document.getElementById('chTimerPill');
  if (!challenge.timeLimit) { if (pill) pill.hidden = true; return; }
  deadline = Date.now() + challenge.timeLimit * 1000;
  if (pill) pill.hidden = false;
  timerId = setInterval(tick, 250);
  tick();
}
function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  const pill = document.getElementById('chTimerPill');
  if (pill) pill.hidden = true;
}
function tick() {
  const left = Math.max(0, deadline - Date.now());
  const s = Math.ceil(left / 1000);
  const pill = document.getElementById('chTimerPill');
  if (pill) {
    pill.textContent = t('ch.timeLeft', {
      time: String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'),
    });
    pill.classList.toggle('warn', s <= 15);
  }
  if (left <= 0) {
    stopTimer();
    toast(t('ch.timesUp'), 'bad');
    submit(true);
  }
}

/* -------------------------------- results ------------------------------- */

function resultHtml() {
  const r = mySubmission;
  const pending = r.status !== 'graded';
  const flat = flatten(challenge.questions);
  const byId = {};
  (r.results || []).forEach((x) => { byId[x.questionId] = x; });

  const rows = flat.map((q, i) => {
    const res = byId[q.id] || { auto: false, earned: 0, max: q.points, correct: null };
    let tag;
    if (!res.auto) tag = `<span class="ch-res manual">${res.earned != null && r.status === 'graded' ? `✍️ ${res.earned}/${res.max}` : t('ch.manual')}</span>`;
    else if (res.correct === true) tag = `<span class="ch-res good">${t('ch.correct')} · ${res.earned}/${res.max}</span>`;
    else if (res.earned > 0) tag = `<span class="ch-res part">${t('ch.partial')} · ${res.earned}/${res.max}</span>`;
    else tag = `<span class="ch-res bad">${t('ch.wrong')} · 0/${res.max}</span>`;
    return `
      <div class="ch-res-row">
        <div class="ch-res-q"><b>${t('ch.qLabel', { n: i + 1 })}.</b> ${chem(q.question || '')}</div>
        <div class="ch-res-a">${escapeHtml(myAnswerText(q, (r.answers || {})[q.id]))}</div>
        ${tag}
      </div>`;
  }).join('');

  const earned = r.status === 'graded' ? r.earned : r.autoEarned;
  const pct = r.maxPoints ? Math.round((earned / r.maxPoints) * 100) : 0;

  return `
    <div class="card ch-result">
      <div class="center">
        <div>${renderRuby(pct >= 60 ? 'cheer' : 'happy', { size: 140, float: true })}</div>
        <h2>${t('ch.resultTitle')}</h2>
        <div class="score-ring" style="--p:${pct}%; background:conic-gradient(var(--grass) ${pct}%, #ececf5 0)">
          <div class="inner"><div class="pct">${pct}%</div><div class="sub">${earned}/${r.maxPoints}</div></div>
        </div>
        <p>${pending ? t('ch.autoOnly', { e: r.autoEarned, m: r.maxPoints }) : t('ch.scoreLine', { e: earned, m: r.maxPoints })}</p>
        ${pending && r.pendingCount ? `<p class="muted">${t('ch.pendingNote', { n: r.pendingCount })}</p>` : ''}
        ${r.feedback ? `<div class="ch-feedback"><b>${t('ch.feedback')}</b><br>${escapeHtml(r.feedback)}</div>` : ''}
        ${challenge.allowRetake ? `<p class="muted">${t('ch.retakeNote')}</p>` : ''}
      </div>
      <div class="ch-res-list">${rows}</div>
      <div class="ch-actions">
        <a class="btn secondary" href="${boardUrl()}">${t('ch.back')}</a>
        ${challenge.allowRetake ? `<button class="btn green" id="chRetake">${t('ch.tryAgain')}</button>` : ''}
      </div>
    </div>`;
}

const flatten = (questions) => QRender.flatten(questions);
const myAnswerText = (q, ans) => QRender.myAnswerText(q, ans);

// "Answer again" (only when the teacher allows retakes).
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'chRetake') {
    reviewing = false;
    mySubmission = null;
    render();
  }
});
