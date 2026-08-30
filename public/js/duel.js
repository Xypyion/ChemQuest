/**
 * Duels — write your own question and send it to a classmate.
 *
 * The other half of js/battle.js. A raid has you answering the teacher's
 * questions; a duel has you WRITING one, getting it past Kru CJ, and making a
 * classmate answer it. If they get it right they take your stake; if they get
 * it wrong you take theirs. Declining costs nobody anything.
 *
 * Module shape follows js/tutor.js and js/feed.js: an IIFE on a top-level
 * const, module-scope state, full innerHTML re-render, inline onclick handlers
 * on `window.Duel`. It borrows battle.js's `#content` for its own screens and
 * calls back to the lobby when it is done, rather than owning a second page.
 *
 * Question markup and answer collection come from js/qrender.js, so the answer
 * shape the server grades is the same one raids and quests produce. The compose
 * form's own fields reuse the same `.ch-input` / `.ch-area` classes rather than
 * inventing new ones — that is what the chemistry key bar (js/chemkey.js, on
 * the feat/chemistry-keys branch) hooks onto, so a student writing "Fe2(SO4)3"
 * gets the subscript pad here for free once that branch lands.
 *
 * Load AFTER i18n.js, api.js, character.js and qrender.js.
 */
const Duel = (() => {
  const TYPES = ['mcq', 'multi', 'short'];
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const MAX_CHOICES = 5;

  let host = null;        // battle.js's #content
  let back = null;        // () => battle.js repaints its lobby
  let rules = null;       // GET /api/battles/settings, handed over by battle.js
  let opponents = [];

  let data = { duels: [], draft: null, openSent: 0, maxOpen: 3 };
  let draft = null;       // the question being written
  let review = null;      // Kru CJ's verdict on it
  let draftId = null;     // set once approved, and what /duels is sent
  let fight = null;       // an incoming duel being answered
  let outcome = null;
  let busy = false;
  let timerId = null;
  let deadline = null;

  /* -------------------------------- setup ------------------------------- */

  /** battle.js hands over the page bits it owns. */
  function init(opts) {
    host = opts.content;
    back = opts.back;
    rules = opts.rules;
    opponents = opts.opponents || [];
  }

  async function load() {
    data = await API.get('/api/battles/duels');
    return data;
  }

  const incoming = () => data.duels.filter((d) => d.direction === 'received' && d.status === 'pending');
  const sent = () => data.duels.filter((d) => d.direction === 'sent' && d.status === 'pending');
  const settled = () => data.duels.filter((d) => d.status !== 'pending');

  /* ------------------------- the lobby's own card ------------------------ */

  /**
   * The duels section of the battle lobby. Rendered by battle.js inside its own
   * markup, so this returns a string rather than painting anything.
   */
  function sectionHtml() {
    const waiting = incoming();
    const mine = sent();

    const waitingHtml = waiting.length ? `
      <div class="d-incoming">
        ${waiting.map((d) => `
          <div class="d-card">
            <div class="d-face">${avatarHtml(d.opponentAvatar, 42)}</div>
            <div class="d-main">
              <div class="d-name">${escapeHtml(t('duel.fromName', { name: d.opponentName }))}</div>
              <div class="d-meta">${escapeHtml(tDiff(d.difficulty))} · ${t('duel.stake', { n: d.stake })}</div>
            </div>
            <div class="d-actions">
              <button class="btn primary sm" onclick="Duel.answerDuel('${escapeHtml(d.id)}')">${t('duel.answerIt')}</button>
              <button class="btn ghost sm" onclick="Duel.decline('${escapeHtml(d.id)}')">${t('duel.decline')}</button>
            </div>
          </div>`).join('')}
      </div>` : `<p class="muted">${t('duel.noneIncoming')}</p>`;

    const mineHtml = mine.length ? `
      <div class="d-sent">
        <h4>${t('duel.waitingTitle')}</h4>
        ${mine.map((d) => `
          <div class="d-card sent">
            <div class="d-face">${avatarHtml(d.opponentAvatar, 34)}</div>
            <div class="d-main">
              <div class="d-name">${escapeHtml(t('duel.toName', { name: d.opponentName }))}</div>
              <div class="d-meta">${escapeHtml(truncate(d.question, 70))}</div>
            </div>
            <button class="btn ghost sm" onclick="Duel.cancel('${escapeHtml(d.id)}')">${t('duel.cancel')}</button>
          </div>`).join('')}
      </div>` : '';

    const room = data.openSent < data.maxOpen;

    /* Writing one needs Kru CJ to check it, so with no key configured the
       button is not offered at all. Duels already SENT still work — they carry
       their own approved question, and it would be unfair to strand them. */
    const writeHtml = data.aiEnabled === false
      ? `<p class="muted">${t('duel.aiOff')}</p>`
      : `<div class="d-write">
           <button class="btn primary" onclick="Duel.compose()" ${room ? '' : 'disabled'}>
             ${t('duel.write')}
           </button>
           ${room ? '' : `<p class="muted">${t('duel.tooMany', { n: data.maxOpen })}</p>`}
         </div>`;

    return `
      <section class="b-section d-section">
        <h3>${t('duel.title')}</h3>
        <p class="muted d-blurb">${t('duel.blurb')}</p>
        ${waitingHtml}
        ${mineHtml}
        ${writeHtml}
        ${settledHtml()}
      </section>`;
  }

  function settledHtml() {
    const done = settled().slice(0, 8);
    if (!done.length) return '';
    return `
      <div class="q-history d-history">
        <h4>${t('duel.pastTitle')}</h4>
        <ul class="q-history-list">
          ${done.map((d) => {
            const win = d.outcome === 'win';
            return `
              <li>
                <span class="q-h-icon">${escapeHtml(d.opponentAvatar || '🧑‍🎓')}</span>
                <span class="q-h-title">${escapeHtml(duelLine(d))}</span>
                <span class="q-h-when">${escapeHtml(fmtWhen(d.createdAt))}</span>
                ${d.outcome
                  ? `<span class="q-h-coins ${win ? '' : 'down'}">${win ? '+' : '−'}${d.coinsMoved}</span>`
                  : '<span class="q-h-coins zero">0</span>'}
              </li>`;
          }).join('')}
        </ul>
      </div>`;
  }

  /** One line of history, written from this student's side. */
  function duelLine(d) {
    if (d.status === 'declined') {
      return t(d.direction === 'sent' ? 'duel.logTheyDeclined' : 'duel.logIDeclined', { name: d.opponentName });
    }
    if (d.status === 'cancelled') return t('duel.logCancelled', { name: d.opponentName });
    if (d.status === 'expired') return t('duel.logExpired', { name: d.opponentName });
    const key = d.direction === 'sent'
      ? (d.outcome === 'win' ? 'duel.logSentWin' : 'duel.logSentLoss')
      : (d.outcome === 'win' ? 'duel.logGotWin' : 'duel.logGotLoss');
    return t(key, { name: d.opponentName });
  }

  const truncate = (s, n) => {
    const text = String(s || '');
    return text.length > n ? text.slice(0, n - 1) + '…' : text;
  };

  /* ------------------------------- writing ------------------------------ */

  function blankDraft() {
    return {
      type: 'mcq',
      question: '',
      choices: ['', '', '', ''],
      correctIndex: 0,
      correctIndexes: [],
      accepted: '',
      opponentId: '',
      // Difficulty here only sets the STAKE — a duel brings its own question,
      // so unlike a raid it never depends on the teacher's bank being filled.
      difficulty: 'easy',
    };
  }

  function compose() {
    draft = blankDraft();
    review = null;
    draftId = null;
    paintCompose();
  }

  function paintCompose() {
    const stake = (rules && rules.stakes && rules.stakes[draft.difficulty]) || 0;

    host.innerHTML = `
      <div class="d-compose">
        <div class="d-compose-head">
          <button class="btn ghost sm" onclick="Duel.exit()">${t('common.back')}</button>
          <h2>${t('duel.writeTitle')}</h2>
        </div>
        <p class="muted">${t('duel.writeSub')}</p>
        <div class="d-topic">${t('duel.topicNote')}</div>

        <div class="d-field">
          <label class="d-label">${t('duel.typeLabel')}</label>
          <div class="d-types">
            ${TYPES.map((ty) => `
              <button class="btn ${draft.type === ty ? 'primary' : 'ghost'} sm"
                      onclick="Duel.setType('${ty}')" ${locked() ? 'disabled' : ''}>
                ${escapeHtml(t('duel.type.' + ty))}
              </button>`).join('')}
          </div>
        </div>

        <div class="d-field">
          <label class="d-label" for="dq">${t('duel.questionLabel')}</label>
          <textarea class="ch-area" id="dq" rows="3" placeholder="${escapeHtml(t('duel.questionPh'))}"
                    ${locked() ? 'disabled' : ''}>${escapeHtml(draft.question)}</textarea>
        </div>

        ${bodyHtml()}
        ${reviewHtml()}
        ${review && review.ok ? sendHtml(stake) : checkHtml()}
      </div>`;
  }

  /** Once Kru CJ has approved it, the question is frozen — edit it and re-check. */
  const locked = () => !!(review && review.ok);

  function bodyHtml() {
    if (draft.type === 'short') {
      return `
        <div class="d-field">
          <label class="d-label" for="da">${t('duel.acceptedLabel')}</label>
          <input class="ch-input" id="da" value="${escapeHtml(draft.accepted)}"
                 placeholder="${escapeHtml(t('duel.acceptedPh'))}" ${locked() ? 'disabled' : ''}>
          <p class="d-hint">${t('duel.acceptedHint')}</p>
        </div>`;
    }
    const multi = draft.type === 'multi';
    return `
      <div class="d-field">
        <label class="d-label">${t('duel.choicesLabel')}</label>
        <p class="d-hint">${multi ? t('duel.choicesHintMulti') : t('duel.choicesHint')}</p>
        <div class="d-choices">
          ${draft.choices.map((c, i) => `
            <div class="d-choice">
              <input type="${multi ? 'checkbox' : 'radio'}" name="dok" class="d-ok" data-i="${i}"
                     ${multi ? (draft.correctIndexes.includes(i) ? 'checked' : '')
                             : (draft.correctIndex === i ? 'checked' : '')}
                     ${locked() ? 'disabled' : ''}>
              <span class="ltr">${LETTERS[i]}</span>
              <input class="ch-input d-choice-text" data-i="${i}" value="${escapeHtml(c)}"
                     placeholder="${escapeHtml(t('duel.choicePh', { n: i + 1 }))}" ${locked() ? 'disabled' : ''}>
            </div>`).join('')}
        </div>
        ${locked() || draft.choices.length >= MAX_CHOICES ? '' :
          `<button class="btn ghost sm" onclick="Duel.addChoice()">${t('duel.addChoice')}</button>`}
      </div>`;
  }

  function reviewHtml() {
    if (busy) {
      return `<div class="d-review thinking">
                ${renderRuby('happy', { size: 64 })}
                <div class="d-review-text">${t('duel.checking')}</div>
              </div>`;
    }
    if (!review) return '';
    return `
      <div class="d-review ${review.ok ? 'ok' : 'no'}">
        ${renderRuby(review.ok ? 'cheer' : 'shrug', { size: 64 })}
        <div class="d-review-text">
          <b>${review.ok ? t('duel.approved') : t('duel.rejected')}</b>
          <p>${escapeHtml(review.feedback || '')}</p>
          ${review.ok ? '' : `<ul class="d-flags">${flagList()}</ul>`}
        </div>
      </div>`;
  }

  /** Which of Kru CJ's four checks failed, as a plain list. */
  function flagList() {
    const flags = [];
    if (!review.onTopic) flags.push(t('duel.flag.onTopic'));
    if (!review.solvable) flags.push(t('duel.flag.solvable'));
    if (!review.keyCorrect) flags.push(t('duel.flag.keyCorrect'));
    if (!review.appropriate) flags.push(t('duel.flag.appropriate'));
    return flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
  }

  function checkHtml() {
    return `
      <div class="d-submit">
        <button class="btn primary" onclick="Duel.check()" ${busy ? 'disabled' : ''}>
          ${busy ? t('duel.checking') : t('duel.check')}
        </button>
      </div>`;
  }

  function sendHtml(stake) {
    const canFight = opponents.filter((o) => o.attackable);
    if (!canFight.length) {
      return `<div class="d-submit"><p class="muted">${t('duel.noOpponents')}</p>
        <button class="btn ghost" onclick="Duel.edit()">${t('duel.editAgain')}</button></div>`;
    }
    return `
      <div class="d-send">
        <div class="d-field">
          <label class="d-label" for="dopp">${t('duel.sendTo')}</label>
          <select class="ch-input" id="dopp">
            ${canFight.map((o) =>
              `<option value="${escapeHtml(o.id)}" ${o.id === draft.opponentId ? 'selected' : ''}>
                 ${escapeHtml(o.name)} — ${escapeHtml(t('battle.coins', { n: o.coins }))}
               </option>`).join('')}
          </select>
        </div>
        <div class="d-field">
          <label class="d-label" for="ddiff">${t('duel.stakeLevel')}</label>
          <select class="ch-input" id="ddiff" onchange="Duel.setDifficulty(this.value)">
            ${['easy', 'medium', 'hard'].map((d) =>
              `<option value="${d}" ${d === draft.difficulty ? 'selected' : ''}>
                 ${escapeHtml(tDiff(d))} — ${escapeHtml(t('duel.stake', { n: (rules.stakes || {})[d] || 0 }))}
               </option>`).join('')}
          </select>
          <p class="d-hint">${t('duel.stakeHint', { n: stake })}</p>
        </div>
        <div class="d-submit">
          <button class="btn ghost" onclick="Duel.edit()">${t('duel.editAgain')}</button>
          <button class="btn primary" onclick="Duel.send()" ${busy ? 'disabled' : ''}>${t('duel.send')}</button>
        </div>
      </div>`;
  }

  /* ---- reading the compose form back into the draft ---- */

  /** The pane repaints on every change, so read the DOM first. */
  function syncDraft() {
    const q = document.getElementById('dq');
    if (q) draft.question = q.value;
    const acc = document.getElementById('da');
    if (acc) draft.accepted = acc.value;
    const texts = [...document.querySelectorAll('.d-choice-text')];
    if (texts.length) draft.choices = texts.map((i) => i.value);
    const oks = [...document.querySelectorAll('.d-ok')];
    if (oks.length) {
      if (draft.type === 'multi') {
        draft.correctIndexes = oks.map((i, idx) => (i.checked ? idx : -1)).filter((i) => i >= 0);
      } else {
        const picked = oks.findIndex((i) => i.checked);
        draft.correctIndex = picked === -1 ? 0 : picked;
      }
    }
    const opp = document.getElementById('dopp');
    if (opp) draft.opponentId = opp.value;
  }

  function setType(ty) {
    if (locked()) return;
    syncDraft();
    draft.type = ty;
    paintCompose();
  }

  function addChoice() {
    syncDraft();
    if (draft.choices.length < MAX_CHOICES) draft.choices.push('');
    paintCompose();
  }

  function setDifficulty(d) {
    syncDraft();
    draft.difficulty = d;
    paintCompose();
  }

  /** Unfreeze an approved question so it can be changed — and re-checked. */
  function edit() {
    review = null;
    draftId = null;
    paintCompose();
  }

  /** The draft in the shape the server's question normaliser expects. */
  function payload() {
    const out = { type: draft.type, question: draft.question, points: 1 };
    if (draft.type === 'mcq') {
      out.choices = draft.choices;
      out.correctIndex = draft.correctIndex;
    } else if (draft.type === 'multi') {
      out.choices = draft.choices;
      out.correctIndexes = draft.correctIndexes;
    } else {
      out.accepted = draft.accepted.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return out;
  }

  /** Turn a server error code into a sentence. */
  function messageFor(code) {
    const key = 'duel.err.' + code;
    const text = t(key);
    if (text !== key) return text;
    // Duels share the raid's blockers, so fall back to that dictionary.
    const shared = 'battle.reason.' + code;
    const alt = t(shared);
    return alt === shared ? code : alt;
  }

  async function check() {
    if (busy) return;
    syncDraft();
    busy = true;
    review = null;
    paintCompose();
    try {
      const r = await API.post('/api/battles/duels/check', { question: payload(), lang: getLang() });
      review = r.review;
      draftId = r.ok ? r.draftId : null;
    } catch (e) {
      toast(messageFor(e.message), 'bad');
    } finally {
      busy = false;
      paintCompose();
    }
  }

  async function send() {
    if (busy || !draftId) return;
    syncDraft();
    busy = true;
    paintCompose();
    try {
      await API.post('/api/battles/duels', {
        draftId,
        opponentId: draft.opponentId || (opponents.find((o) => o.attackable) || {}).id,
        difficulty: draft.difficulty,
      });
      toast(t('duel.sent'), 'good');
      draft = null;
      review = null;
      draftId = null;
      await exit();
      return;
    } catch (e) {
      toast(messageFor(e.message), 'bad');
    } finally {
      busy = false;
      if (draft) paintCompose();
    }
  }

  /* ------------------------------ answering ----------------------------- */

  async function answerDuel(id) {
    if (busy) return;
    busy = true;
    try {
      const r = await API.post(`/api/battles/duels/${id}/open`, {});
      fight = r.duel;
      outcome = null;
      paintFight();
    } catch (e) {
      toast(messageFor(e.message), 'bad');
      await exit();
    } finally {
      busy = false;
    }
  }

  function paintFight() {
    const d = fight;
    const seconds = d.answerBy ? Math.round((Date.parse(d.answerBy) - Date.now()) / 1000) : 0;

    host.innerHTML = `
      <div class="b-fight d-fight">
        <div class="b-vs">
          <div class="b-vs-side">
            <div class="b-vs-face">${escapeHtml(d.challengerAvatar || '🧑‍🎓')}</div>
            <div class="b-vs-name">${escapeHtml(d.challengerName)}</div>
          </div>
          <div class="b-vs-mid">
            <div class="b-vs-word">${t('duel.vsWord')}</div>
            <div class="b-vs-stake">🪙 ${d.stake}</div>
            ${d.answerBy ? '<div class="b-timer" id="dTimer"></div>' : ''}
          </div>
          <div class="b-vs-side">
            <div class="b-vs-face">${avatarHtml(API.user() && API.user().avatar, 54)}</div>
            <div class="b-vs-name">${escapeHtml((API.user() && API.user().name) || '')}</div>
          </div>
        </div>
        <p class="muted b-fight-sub">${escapeHtml(t('duel.answerSub', { name: d.challengerName, n: d.stake }))}</p>
        <section class="ch-q" data-qid="${escapeHtml(d.question.id)}" data-qtype="${d.question.type}">
          <div class="ch-q-head"><span class="ch-q-n">${t('duel.theirQuestion')}</span></div>
          <div class="ch-q-text">${chem(d.question.question)}</div>
          ${QRender.answerHtml(d.question)}
        </section>
        <div class="q-submit-row">
          <button class="btn primary" id="dSubmit">${t('duel.submit')}</button>
        </div>
      </div>`;

    const btn = document.getElementById('dSubmit');
    if (btn) btn.addEventListener('click', () => submit(false));
    if (d.answerBy) startTimer(Math.max(0, seconds));
  }

  async function submit(auto) {
    if (busy) return;
    const answers = QRender.collectAnswers();
    if (!auto) {
      if (!Object.keys(answers).length) { toast(t('duel.required'), 'bad'); return; }
      if (!confirm(t('duel.confirm'))) return;
    }
    busy = true;
    const btn = document.getElementById('dSubmit');
    if (btn) { btn.disabled = true; btn.textContent = t('battle.answering'); }
    try {
      outcome = await API.post(`/api/battles/duels/${fight.id}/answer`, { answers });
      stopTimer();
      setNavCoins(outcome.coins);
      if (outcome.outcome === 'win') confetti(110);
      paintResult();
    } catch (e) {
      toast(messageFor(e.message), 'bad');
      if (btn) { btn.disabled = false; btn.textContent = t('duel.submit'); }
    } finally {
      busy = false;
    }
  }

  function paintResult() {
    const r = outcome;
    const win = r.outcome === 'win';
    const moved = r.coinsMoved > 0
      ? (win ? t('battle.wonCoins', { n: r.coinsMoved, name: r.opponentName })
        : t('battle.lostCoins', { n: r.coinsMoved, name: r.opponentName }))
      : t('battle.noCoinsMoved');
    const res = (r.results || [])[0] || {};

    host.innerHTML = `
      <div class="b-result ${win ? 'win' : 'lose'}">
        <div class="b-result-ruby">${renderRuby(win ? 'cheer' : 'sad', { size: 150, float: true })}</div>
        <h2>${win ? t('duel.win') : t('duel.lose')}</h2>
        <p class="b-result-coins">${escapeHtml(moved)}</p>
        ${r.late ? `<p class="b-late">${t('battle.lateNote')}</p>` : ''}
        <div class="b-result-wallet">🪙 <b>${r.coins}</b></div>
        <div class="ch-result">
          <div class="ch-res ${res.correct ? 'good' : 'bad'}">
            <div class="ch-res-q">${chem(r.review.question)}</div>
            <div class="ch-res-a"><b>${t('battle.yourAnswer')}:</b> ${chem(r.review.mine || '—')}</div>
            ${res.correct ? '' : `<div class="ch-res-a"><b>${t('battle.correctAnswer')}:</b> ${chem(r.review.expected || '—')}</div>`}
            <div class="ch-res-badge">${res.correct ? t('quest.correct') : t('quest.wrong')}</div>
          </div>
        </div>
        <div class="b-result-actions">
          <button class="btn primary" onclick="Duel.exit()">${t('duel.backToLobby')}</button>
        </div>
      </div>`;
  }

  /* ------------------------------- replies ------------------------------ */

  async function decline(id) {
    if (busy) return;
    if (!confirm(t('duel.declineConfirm'))) return;
    busy = true;
    try {
      await API.post(`/api/battles/duels/${id}/decline`, {});
      toast(t('duel.declined'), 'good');
    } catch (e) {
      toast(messageFor(e.message), 'bad');
    } finally {
      busy = false;
      await exit();
    }
  }

  async function cancel(id) {
    if (busy) return;
    if (!confirm(t('duel.cancelConfirm'))) return;
    busy = true;
    try {
      await API.post(`/api/battles/duels/${id}/cancel`, {});
      toast(t('duel.cancelled'), 'good');
    } catch (e) {
      toast(messageFor(e.message), 'bad');
    } finally {
      busy = false;
      await exit();
    }
  }

  /** Leave whatever duel screen is up and hand the page back to the lobby. */
  async function exit() {
    stopTimer();
    fight = null;
    outcome = null;
    draft = null;
    review = null;
    draftId = null;
    if (back) await back();
  }

  /* -------------------------------- timer ------------------------------- */

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
    const el = document.getElementById('dTimer');
    if (!el || !deadline) return;
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    el.textContent = `⏱ ${m}:${s}`;
    el.classList.toggle('low', left <= 10);
    if (left <= 0) {
      stopTimer();
      submit(true); // out of time hands in whatever is filled, same as a raid
    }
  }

  const api = {
    init, load, sectionHtml,
    compose, setType, addChoice, setDifficulty, edit, check, send,
    answerDuel, decline, cancel, exit,
  };
  window.Duel = api;
  return api;
})();
