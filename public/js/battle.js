/**
 * Coin Battles — the student page.
 *
 * Lobby → fight → result, all on one page, the same shape as js/quests.js: a
 * battle is one or two questions, so a separate player page would cost more than
 * it is worth. Question markup and answer collection come from js/qrender.js,
 * shared with the quest and challenge players so every page sends exactly the
 * answer shape the server grades.
 *
 * The server owns the rules. Everything disabled here is disabled there too —
 * this only saves the student a pointless round trip.
 */
const me = guard('student');
addClouds();
mountLangSwitch();

const contentEl = document.getElementById('content');

let rules = null;        // GET /api/battles/settings
let opponents = [];
let history = [];
let difficulty = 'easy';
let fight = null;        // the open battle being answered
let outcome = null;      // the resolved result
let sending = false;
let deadline = null;
let timerId = null;

/* --------------------------------- boot --------------------------------- */

async function start() {
  try {
    // guard() reads a cached user, so ask the server for a balance that moves.
    const meData = await API.get('/api/auth/me');
    API.updateUser(meData.user);
    setNavCoins(meData.user.coins || 0);
    document.getElementById('navPoints').textContent = meData.user.points || 0;

    await loadLobby();

    // An abandoned battle is resumed rather than re-rolled — see the server.
    const open = (await API.get('/api/battles/open')).battle;
    if (open) { fight = open; renderFight(); return; }
    renderLobby();
  } catch (e) {
    contentEl.innerHTML = `<div class="q-empty"><p>${escapeHtml(e.message || t('battle.loadFail'))}</p></div>`;
  }
}

async function loadLobby() {
  const [s, o, h] = await Promise.all([
    API.get('/api/battles/settings'),
    API.get('/api/battles/opponents'),
    API.get('/api/battles/history'),
    // A duel needs no question bank, so it must not fail the whole lobby when
    // the AI is switched off — the raid half of the page still works.
    Duel.load().catch(() => null),
  ]);
  rules = s;
  opponents = o.opponents || [];
  history = h.battles || [];
  Duel.init({ content: contentEl, back: backToLobby, rules, opponents });
  setNavCoins(s.coins || 0);
  // Land on a difficulty the teacher has actually filled.
  if (!(rules.banks || {})[difficulty]) {
    const ready = ['easy', 'medium', 'hard'].find((d) => (rules.banks || {})[d]);
    if (ready) difficulty = ready;
  }
}

/* --------------------------------- lobby -------------------------------- */

function renderLobby() {
  stopTimer();
  fight = null;
  outcome = null;

  if (!rules.enabled) {
    contentEl.innerHTML = walletCard() + `
      <div class="q-empty">
        <div class="q-empty-ruby">${renderRuby('sad', { size: 130, float: true })}</div>
        <h3>${t('battle.disabledTitle')}</h3>
        <p class="muted">${t('battle.disabledSub')}</p>
      </div>` + historyCard();
    return;
  }

  contentEl.innerHTML =
    walletCard() + difficultyCard() + opponentCard() + Duel.sectionHtml() + historyCard();
}

/** Reload and repaint the lobby — what the Duel module calls on its way out. */
async function backToLobby() {
  try {
    await loadLobby();
  } catch (e) {
    toast(e.message, 'bad');
  }
  renderLobby();
}

function walletCard() {
  const left = rules && rules.dailyLimit > 0
    ? t('battle.battlesLeft', { n: rules.battlesLeft })
    : t('battle.unlimited');
  return `
    <div class="q-wallet">
      <div class="q-wallet-coin">🪙</div>
      <div class="q-wallet-body">
        <div class="q-wallet-label">${t('battle.wallet')}</div>
        <div class="q-wallet-amount">${(rules && rules.coins) || 0}</div>
        <div class="q-wallet-sub">${escapeHtml(left)}</div>
      </div>
    </div>`;
}

function difficultyCard() {
  const cards = ['easy', 'medium', 'hard'].map((d) => {
    const stake = (rules.stakes || {})[d] || 0;
    const bank = (rules.banks || {})[d] || 0;
    const time = (rules.timeLimits || {})[d] || 0;
    const on = d === difficulty;
    return `
      <button class="b-diff ${d} ${on ? 'on' : ''} ${bank ? '' : 'empty'}"
              ${bank ? `onclick="pickDifficulty('${d}')"` : 'disabled'}>
        <span class="b-diff-name">${escapeHtml(tDiff(d))}</span>
        <span class="b-diff-stake">${t('battle.stakeLabel', { n: stake })}</span>
        <span class="b-diff-meta">${bank
          ? `${t('battle.questionsPer', { n: rules.questionsPerBattle, s: rules.questionsPerBattle === 1 ? '' : 's' })} · ${time ? t('battle.timer', { n: time }) : t('battle.noTimer')}`
          : t('battle.emptyBank')}</span>
      </button>`;
  }).join('');

  const stake = (rules.stakes || {})[difficulty] || 0;
  return `
    <section class="b-section">
      <h3>${t('battle.pickDifficulty')}</h3>
      <div class="b-diffs">${cards}</div>
      <p class="muted b-stake-hint">${t('battle.stakeHint', { n: stake })}</p>
    </section>`;
}

function opponentCard() {
  if (!opponents.length) {
    return `<section class="b-section"><h3>${t('battle.pickOpponent')}</h3>
      <p class="muted">${t('battle.noOpponents')}</p></section>`;
  }
  const cards = opponents.map((o) => {
    // A blocker the server reported for the whole account (cooldown, daily
    // limit, no coins) applies whatever difficulty is selected; on top of that a
    // difficulty the student cannot afford blocks just that one.
    const stake = (rules.stakes || {})[difficulty] || 0;
    const poor = (rules.coins || 0) < stake;
    const canFight = o.attackable && !poor && (rules.banks || {})[difficulty];
    const why = !o.attackable
      ? reasonText(o.reason, o)
      : poor ? t('battle.reason.poor', { n: stake })
        : !(rules.banks || {})[difficulty] ? t('battle.reason.noQuestions') : '';
    return `
      <div class="b-opp ${canFight ? '' : 'locked'}">
        <div class="b-opp-face">${avatarHtml(o.avatar, 42)}</div>
        <div class="b-opp-main">
          <div class="b-opp-name">${escapeHtml(o.name)}</div>
          <div class="b-opp-coins">${t('battle.coins', { n: o.coins })}</div>
          ${canFight ? '' : `<div class="b-opp-why">${escapeHtml(why)}</div>`}
        </div>
        ${canFight
          ? `<button class="btn primary b-go" onclick="startFight('${escapeHtml(o.id)}')">${t('battle.attack')}</button>`
          : `<span class="b-locked">🔒</span>`}
      </div>`;
  }).join('');
  return `<section class="b-section"><h3>${t('battle.pickOpponent')}</h3>
    <div class="b-opps">${cards}</div></section>`;
}

/** Turn a server reason code into a sentence. */
function reasonText(code, opp) {
  if (code === 'cooldown') return t('battle.reason.cooldown', { when: opp && opp.readyAt ? fmtWhen(opp.readyAt) : '' });
  if (code === 'poor') return t('battle.reason.poor', { n: (rules.stakes || {})[difficulty] || 0 });
  const key = 'battle.reason.' + code;
  const text = t(key);
  return text === key ? t('battle.reason.unavailable') : text;
}

function historyCard() {
  if (!history.length) {
    return `<div class="q-history"><h3>${t('battle.history')}</h3><p class="muted">${t('battle.noHistory')}</p></div>`;
  }
  return `
    <div class="q-history">
      <h3>${t('battle.history')}</h3>
      <ul class="q-history-list">
        ${history.map((b) => {
          const win = b.outcome === 'win';
          const key = b.iAttacked
            ? (win ? 'battle.logAttackWin' : 'battle.logAttackLoss')
            : (win ? 'battle.logDefendLoss' : 'battle.logDefendWin');
          return `
            <li>
              <span class="q-h-icon">${escapeHtml(b.opponentAvatar || '🧑‍🎓')}</span>
              <span class="q-h-title">${escapeHtml(t(key, { name: b.opponentName }))}</span>
              <span class="q-h-when">${escapeHtml(fmtWhen(b.startedAt))}</span>
              <span class="q-h-coins ${win ? '' : 'down'}">${win ? '+' : '−'}${b.coinsMoved}</span>
            </li>`;
        }).join('')}
      </ul>
    </div>`;
}

function pickDifficulty(d) {
  difficulty = d;
  renderLobby();
}

/* --------------------------------- fight -------------------------------- */

async function startFight(opponentId) {
  if (sending) return;
  sending = true;
  try {
    const res = await API.post('/api/battles/start', { opponentId, difficulty });
    fight = res.battle;
    renderFight(res.timeLimit);
  } catch (e) {
    toast(reasonText(e.message) || e.message, 'bad');
    await loadLobby();
    renderLobby();
  } finally {
    sending = false;
  }
}

function renderFight(timeLimit) {
  const b = fight;
  // Resuming: work the countdown out from the deadline the server stored.
  const secondsLeft = b.expiresAt ? Math.round((Date.parse(b.expiresAt) - Date.now()) / 1000) : 0;
  const seconds = timeLimit != null ? timeLimit : secondsLeft;

  contentEl.innerHTML = `
    <div class="b-fight">
      <div class="b-vs">
        <div class="b-vs-side">
          <div class="b-vs-face">${avatarHtml(me && me.avatar, 54)}</div>
          <div class="b-vs-name">${escapeHtml((me && me.name) || '')}</div>
        </div>
        <div class="b-vs-mid">
          <div class="b-vs-word">VS</div>
          <div class="b-vs-stake">🪙 ${b.stake}</div>
          ${b.expiresAt ? `<div class="b-timer" id="bTimer"></div>` : ''}
        </div>
        <div class="b-vs-side">
          <div class="b-vs-face">${escapeHtml(b.opponentAvatar || '🧑‍🎓')}</div>
          <div class="b-vs-name">${escapeHtml(b.opponentName)}</div>
        </div>
      </div>
      <p class="muted b-fight-sub">${escapeHtml(t('battle.vsSub', { stake: b.stake, diff: tDiff(b.difficulty) }))}</p>
      ${b.questions.map((q, i) => questionHtml(q, i + 1)).join('')}
      <div class="q-submit-row">
        <button class="btn primary" id="bSubmit">${t('battle.submit')}</button>
      </div>
    </div>`;

  const btn = document.getElementById('bSubmit');
  if (btn) btn.addEventListener('click', () => answer(false));
  if (b.expiresAt) startTimer(Math.max(0, seconds));
}

/** One question card — battles use the simple auto-marked types only. */
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

async function answer(auto) {
  if (sending) return;
  const answers = QRender.collectAnswers();
  if (!auto) {
    if (!Object.keys(answers).length) { toast(t('battle.required'), 'bad'); return; }
    if (!confirm(t('battle.confirm'))) return;
  }
  sending = true;
  const btn = document.getElementById('bSubmit');
  if (btn) { btn.disabled = true; btn.textContent = t('battle.answering'); }
  try {
    outcome = await API.post(`/api/battles/${fight.id}/answer`, { answers });
    stopTimer();
    setNavCoins(outcome.coins);
    if (outcome.outcome === 'win') confetti(110);
    await loadLobby();
    renderResult();
  } catch (e) {
    toast(e.message, 'bad');
    if (btn) { btn.disabled = false; btn.textContent = t('battle.submit'); }
  } finally {
    sending = false;
  }
}

/* -------------------------------- result -------------------------------- */

function renderResult() {
  const r = outcome;
  const win = r.outcome === 'win';
  const moved = r.coinsMoved > 0
    ? (win ? t('battle.wonCoins', { n: r.coinsMoved, name: r.opponentName })
      : t('battle.lostCoins', { n: r.coinsMoved, name: r.opponentName }))
    : t('battle.noCoinsMoved');

  const rows = (r.review || []).map((q, i) => {
    const res = (r.results || []).find((x) => x.questionId === q.id) || {};
    return `
      <div class="ch-res ${res.correct ? 'good' : 'bad'}">
        <div class="ch-res-q">${t('ch.qLabel', { n: i + 1 })} · ${escapeHtml(q.question)}</div>
        <div class="ch-res-a"><b>${t('battle.yourAnswer')}:</b> ${escapeHtml(q.mine || '—')}</div>
        ${res.correct ? '' : `<div class="ch-res-a"><b>${t('battle.correctAnswer')}:</b> ${escapeHtml(q.expected || '—')}</div>`}
        <div class="ch-res-badge">${res.correct ? t('quest.correct') : t('quest.wrong')}</div>
      </div>`;
  }).join('');

  contentEl.innerHTML = `
    <div class="b-result ${win ? 'win' : 'lose'}">
      <div class="b-result-ruby">${renderRuby(win ? 'cheer' : 'sad', { size: 150, float: true })}</div>
      <h2>${win ? t('battle.win') : t('battle.lose')}</h2>
      <p class="b-result-coins">${escapeHtml(moved)}</p>
      ${r.late ? `<p class="b-late">${t('battle.lateNote')}</p>` : ''}
      <div class="b-result-wallet">🪙 <b>${r.coins}</b></div>
      <div class="ch-result">${rows}</div>
      <div class="b-result-actions">
        <button class="btn primary" onclick="renderLobby()">${t('battle.again')}</button>
        <a class="btn ghost" href="/quests.html">${t('nav.quests')}</a>
      </div>
    </div>`;
}

/* --------------------------------- timer -------------------------------- */

function startTimer(seconds) {
  stopTimer();
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
  const el = document.getElementById('bTimer');
  if (!el || !deadline) return;
  const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  const m = String(Math.floor(left / 60)).padStart(2, '0');
  const s = String(left % 60).padStart(2, '0');
  el.textContent = `⏱ ${m}:${s}`;
  el.classList.toggle('low', left <= 10);
  if (left <= 0) {
    stopTimer();
    answer(true); // hand in whatever is filled — running out is a loss
  }
}

start();
