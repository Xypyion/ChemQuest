/**
 * Daily Quests — the student page.
 *
 * List → play → result, all on one page: a quest is short, so navigating away
 * to a player page and back would cost more than it is worth. Question markup
 * and answer collection come from js/qrender.js, shared with the challenge
 * player so both send exactly what the server grades.
 */
const me = guard('student');
mountLangSwitch();

const contentEl = document.getElementById('content');

let quests = [];
let wallet = { coins: 0, coinsEarned: 0, history: [] };
let playing = null;      // the quest being answered / reviewed
let mySubmission = null; // set once the quest has been handed in
let sending = false;
let deadline = null;
let timerId = null;

/* --------------------------------- boot --------------------------------- */

async function start() {
  try {
    // guard() reads a cached copy of the user, so refresh before showing a balance.
    const meData = await API.get('/api/auth/me');
    API.updateUser(meData.user);
    setNavCoins(meData.user.coins || 0);
    document.getElementById('navPoints').textContent = meData.user.points || 0;

    const [list, w] = await Promise.all([API.get('/api/quests'), API.get('/api/quests/wallet')]);
    quests = list.quests || [];
    wallet = w;
    setNavCoins(w.coins || 0);
    renderList();
  } catch (e) {
    contentEl.innerHTML = `<div class="q-empty"><p>${escapeHtml(e.message || t('quest.loadFail'))}</p></div>`;
  }
}

/* --------------------------------- list --------------------------------- */

function renderList() {
  stopTimer();
  playing = null;
  mySubmission = null;

  const cards = quests.length
    ? `<div class="q-list">${quests.map(questCard).join('')}</div>`
    : `<div class="q-empty">
         <div class="q-empty-ruby">${renderRuby('happy', { size: 130, float: true })}</div>
         <h3>${t('quest.none')}</h3>
         <p class="muted">${t('quest.noneSub')}</p>
       </div>`;

  contentEl.innerHTML = walletCard() + cards + historyCard();
}

function walletCard() {
  return `
    <div class="q-wallet">
      <div class="q-wallet-coin">🪙</div>
      <div class="q-wallet-body">
        <div class="q-wallet-label">${t('quest.wallet')}</div>
        <div class="q-wallet-amount">${wallet.coins || 0}</div>
        <div class="q-wallet-sub">${t('quest.walletSub')}</div>
      </div>
    </div>`;
}

function questCard(q) {
  const done = q.status === 'done';
  const state = q.windowState;
  const locked = state !== 'open';

  let badge = `<span class="q-badge todo">${t('quest.todo')}</span>`;
  if (done) badge = `<span class="q-badge done">${t('quest.done')}</span>`;
  else if (state === 'closed') badge = `<span class="q-badge closed">${t('quest.closed')}</span>`;
  else if (state === 'upcoming') badge = `<span class="q-badge soon">${t('quest.upcoming')}</span>`;

  // A finished quest stays openable so the student can review it; an unanswered
  // one that is closed or not yet open is not.
  const canOpen = done || !locked;
  const cta = done ? t('quest.review') : t('quest.start');

  let when = '';
  if (!done && state === 'upcoming' && q.opensAt) when = t('quest.opensWhen', { when: fmtWhen(q.opensAt) });
  else if (!done && q.closesAt && state === 'open') when = t('quest.closesWhen', { when: fmtWhen(q.closesAt) });

  return `
    <article class="q-card ${canOpen ? '' : 'locked'}" ${canOpen ? `onclick="openQuest('${escapeHtml(q.id)}')"` : ''}>
      <div class="q-card-icon">${escapeHtml(q.icon || '⚔️')}</div>
      <div class="q-card-main">
        <div class="q-card-top">
          <h3>${escapeHtml(q.title)}</h3>
          ${badge}
        </div>
        ${q.description ? `<p class="q-card-desc">${escapeHtml(q.description)}</p>` : ''}
        <div class="q-card-meta">
          <span>${t('quest.questions', { n: q.questionCount })}</span>
          <span>·</span>
          <span>${t('quest.oneTry')}</span>
          ${when ? `<span>·</span><span>${escapeHtml(when)}</span>` : ''}
        </div>
      </div>
      <div class="q-card-side">
        <div class="q-reward">
          <span class="q-reward-label">${done ? t('quest.coinsAdded', { n: q.coinsAwarded || 0 }) : t('quest.coins', { n: q.reward })}</span>
        </div>
        ${canOpen ? `<span class="q-cta">${cta}</span>` : ''}
      </div>
    </article>`;
}

function historyCard() {
  if (!wallet.history || !wallet.history.length) {
    return `<div class="q-history"><h3>${t('quest.history')}</h3><p class="muted">${t('quest.noHistory')}</p></div>`;
  }
  return `
    <div class="q-history">
      <h3>${t('quest.history')}</h3>
      <ul class="q-history-list">
        ${wallet.history.map((h) => `
          <li>
            <span class="q-h-icon">${escapeHtml(h.icon || '⚔️')}</span>
            <span class="q-h-title">${escapeHtml(h.title)}</span>
            <span class="q-h-when">${escapeHtml(fmtWhen(h.at))}</span>
            <span class="q-h-coins">+${h.coins}</span>
          </li>`).join('')}
      </ul>
    </div>`;
}

/* -------------------------------- playing ------------------------------- */

async function openQuest(id) {
  try {
    const data = await API.get('/api/quests/' + id);
    playing = data.quest;
    mySubmission = data.mySubmission;
    renderPlay();
  } catch (e) {
    toast(e.message, 'bad');
  }
}

function renderPlay() {
  stopTimer();
  const q = playing;
  const reviewing = !!mySubmission;

  contentEl.innerHTML = `
    <div class="q-play">
      <button class="btn ghost q-back" onclick="renderList()">${t('quest.back')}</button>
      <div class="q-play-head">
        <div class="q-card-icon big">${escapeHtml(q.icon || '⚔️')}</div>
        <div>
          <h2>${escapeHtml(q.title)}</h2>
          ${q.description ? `<p class="muted">${escapeHtml(q.description)}</p>` : ''}
          <div class="q-card-meta">
            <span>${t('quest.pts', { n: q.maxPoints })}</span>
            <span>·</span>
            <span>🪙 ${q.reward}</span>
            ${q.timeLimit && !reviewing ? `<span>·</span><span id="qTimer" class="q-timer"></span>` : ''}
          </div>
        </div>
      </div>
      ${reviewing ? resultHtml() : formHtml()}
    </div>`;

  if (!reviewing) {
    const btn = document.getElementById('qSubmit');
    if (btn) btn.addEventListener('click', () => submit(false));
    if (q.timeLimit) startTimer(q.timeLimit);
  }
}

function formHtml() {
  return `
    ${playing.questions.map((q, i) => questionHtml(q, i + 1)).join('')}
    <div class="q-submit-row">
      <button class="btn primary" id="qSubmit">${t('quest.submit')}</button>
      <span class="muted">${t('quest.oneTry')}</span>
    </div>`;
}

/** One question card. Quest types are all simple — no simulations here. */
function questionHtml(q, n) {
  return `
    <section class="ch-q" data-qid="${escapeHtml(q.id)}" data-qtype="${q.type}">
      <div class="ch-q-head">
        <span class="ch-q-n">${t('ch.qLabel', { n })}</span>
        <span class="ch-q-pts">${t('ch.pts', { n: q.points })}</span>
      </div>
      <div class="ch-q-text">${escapeHtml(q.question)}</div>
      ${q.image ? `<img class="ch-q-img" src="${escapeHtml(q.image)}" alt="">` : ''}
      ${QRender.answerHtml(q)}
    </section>`;
}

async function submit(auto) {
  if (sending) return;
  const answers = QRender.collectAnswers();
  if (!auto) {
    if (!Object.keys(answers).length) { toast(t('quest.required'), 'bad'); return; }
    if (!confirm(t('quest.confirmSubmit'))) return;
  }
  sending = true;
  const btn = document.getElementById('qSubmit');
  if (btn) { btn.disabled = true; btn.textContent = t('common.loading'); }
  try {
    const res = await API.post(`/api/quests/${playing.id}/submit`, { answers });
    mySubmission = res.submission;
    stopTimer();
    setNavCoins(res.coins);
    if (res.submission.coinsAwarded > 0) {
      toast(t('quest.coinsAdded', { n: res.submission.coinsAwarded }), 'good');
      confetti(90);
    } else {
      toast(t('quest.noCoins'), '');
    }
    // Keep the list and wallet in step with what just happened.
    await refreshAfterSubmit();
    renderPlay();
  } catch (e) {
    if ((e.message || '').includes('ALREADY_SUBMITTED')) toast(t('quest.alreadyDone'), 'bad');
    else toast(e.message, 'bad');
  } finally {
    sending = false;
  }
}

async function refreshAfterSubmit() {
  try {
    const [list, w] = await Promise.all([API.get('/api/quests'), API.get('/api/quests/wallet')]);
    quests = list.quests || [];
    wallet = w;
    setNavCoins(w.coins || 0);
  } catch { /* the result is already on screen; a stale list is not worth an error */ }
}

/* -------------------------------- result -------------------------------- */

function resultHtml() {
  const r = mySubmission;
  const flat = QRender.flatten(playing.questions);
  const pct = r.maxPoints ? Math.round((r.earned / r.maxPoints) * 100) : 0;

  const rows = flat.map((q, i) => {
    const res = (r.results || []).find((x) => x.questionId === q.id) || {};
    const cls = res.correct ? 'good' : 'bad';
    const label = res.correct ? t('quest.correct') : t('quest.wrong');
    return `
      <div class="ch-res ${cls}">
        <div class="ch-res-q">${t('ch.qLabel', { n: i + 1 })} · ${escapeHtml(q.question)}</div>
        <div class="ch-res-a"><b>${t('quest.yourAnswer')}:</b> ${escapeHtml(QRender.myAnswerText(q, (r.answers || {})[q.id]))}</div>
        <div class="ch-res-badge">${label} · ${res.earned || 0}/${res.max || 0}</div>
      </div>`;
  }).join('');

  return `
    <div class="q-result">
      <div class="q-result-top">
        <div class="q-ring" style="--pct:${pct}">
          <span class="q-ring-num">${r.earned}/${r.maxPoints}</span>
        </div>
        <div>
          <h3>${t('quest.resultTitle')}</h3>
          <p class="muted">${t('quest.score', { earned: r.earned, max: r.maxPoints })}</p>
          <div class="q-result-coins">${r.coinsAwarded > 0 ? t('quest.coinsAdded', { n: r.coinsAwarded }) : t('quest.noCoins')}</div>
        </div>
      </div>
      <div class="ch-result">${rows}</div>
    </div>`;
}

/* --------------------------------- timer -------------------------------- */

function startTimer(seconds) {
  deadline = Date.now() + seconds * 1000;
  tick();
  timerId = setInterval(tick, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  deadline = null;
}

function tick() {
  const el = document.getElementById('qTimer');
  if (!el || !deadline) return;
  const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  const m = String(Math.floor(left / 60)).padStart(2, '0');
  const s = String(left % 60).padStart(2, '0');
  el.textContent = `⏱ ${t('quest.timeLeft')} ${m}:${s}`;
  el.classList.toggle('low', left <= 15);
  if (left <= 0) {
    stopTimer();
    submit(true); // hand in whatever is filled in
  }
}

start();
