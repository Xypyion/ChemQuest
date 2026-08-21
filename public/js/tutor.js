/**
 * Ruby the AI tutor — floating help panel for one challenge question at a time.
 *
 * Follows the same module shape as js/feed.js: an IIFE assigned to a top-level
 * const, module-scope state, full innerHTML re-render, inline onclick handlers
 * (so it works from markup built by challenge.js without extra wiring).
 *
 * Mounted once onto document.body (like the toast host in api.js), not into
 * the page's #chStage — that container gets blown away on every re-render.
 *
 * Load AFTER i18n.js, api.js and character.js.
 */
const Tutor = (() => {
  let host = null;
  let shown = false;
  // The question currently waiting on a reply, or null. Tracked by id (not a
  // plain boolean) so switching to a different question's panel while one
  // request is still in flight doesn't lock its input too.
  let sendingQid = null;

  // What we're currently helping with.
  let current = null; // { challengeId, questionId, questionLabel, getDraft }

  // One conversation per question, kept only for this page load.
  const historyByQuestion = {};

  // Cached quota, refreshed after every ask (and once on first open).
  let status = null;
  let statusLoading = null;

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.className = 'tutor-widget';
    document.body.appendChild(host);
    return host;
  }

  async function loadStatus(force) {
    if (statusLoading && !force) return statusLoading;
    statusLoading = API.get('/api/tutor/status')
      .then((s) => { status = s; render(); return s; })
      .catch(() => { status = { enabled: false }; render(); });
    return statusLoading;
  }

  /**
   * Open the panel for one question.
   * @param {object} opts
   * @param {string} opts.challengeId
   * @param {string} opts.questionId
   * @param {string} opts.questionLabel  short text shown in the panel header
   * @param {function} opts.getDraft     () => current answer as plain text
   */
  function open(opts) {
    current = opts;
    shown = true;
    ensureHost();
    render();
    if (!status) loadStatus();
    setTimeout(() => {
      const box = host.querySelector('.tutor-log');
      if (box) box.scrollTop = box.scrollHeight;
      const input = host.querySelector('.tutor-input');
      if (input) input.focus();
    }, 0);
  }

  function close() {
    shown = false;
    render();
  }

  function historyFor(qid) {
    return historyByQuestion[qid] || (historyByQuestion[qid] = []);
  }

  async function send() {
    if (!current || sendingQid === current.questionId) return;
    const input = host.querySelector('.tutor-input');
    const text = (input && input.value || '').trim();
    if (!text) return;

    if (status && status.enabled === false) return; // nothing to send to

    // Capture everything about THIS question now — `current` may point at a
    // different question by the time the request resolves, if the student
    // switches panels while waiting.
    const { challengeId, questionId, getDraft } = current;
    const hist = historyFor(questionId);
    const priorTurns = hist.map((m) => ({ role: m.role, content: m.content }));

    hist.push({ role: 'user', content: text });
    if (input) input.value = '';
    sendingQid = questionId;
    render();

    try {
      const r = await API.post('/api/tutor/ask', {
        challengeId,
        questionId,
        message: text,
        draft: getDraft ? getDraft() : '',
        history: priorTurns,
        lang: getLang(),
      });

      if (r.refused) {
        hist.push({ role: 'assistant', content: r.error || t('tutor.blocked'), note: true });
      } else {
        hist.push({ role: 'assistant', content: r.reply });
      }
      status = { enabled: true, freeLeft: r.freeLeft, freePerDay: r.freePerDay, coins: r.coins, price: r.price, canAsk: r.canAsk, nextIsFree: r.nextIsFree, unlimited: r.unlimited };
    } catch (e) {
      hist.push({ role: 'assistant', content: e.message, note: true });
      // The server may have refunded a charge on failure — resync the balance
      // rather than trust whatever `status` last held.
      loadStatus(true);
    } finally {
      sendingQid = null;
      render();
      const box = host.querySelector('.tutor-log');
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  /* ------------------------------- rendering ------------------------------ */

  function quotaLine() {
    if (!status) return `<span class="tutor-quota muted">${t('common.loading')}</span>`;
    if (status.enabled === false) return '';
    if (status.unlimited) return `<span class="tutor-quota">${t('tutor.unlimited')}</span>`;
    return status.nextIsFree
      ? `<span class="tutor-quota">${t('tutor.freeLeft', { n: status.freeLeft, s: status.freeLeft === 1 ? '' : 's' })}</span>`
      : `<span class="tutor-quota">${t('tutor.coinCost', { n: status.price })} · ${t('tutor.coinBalance', { n: status.coins })}</span>`;
  }

  function bubble(m) {
    const who = m.role === 'user'
      ? `<div class="tutor-msg user">${escapeHtml(m.content)}</div>`
      : `<div class="tutor-msg ruby${m.note ? ' note' : ''}">${escapeHtml(m.content)}</div>`;
    return who;
  }

  function render() {
    if (!host) return;
    if (!shown || !current) { host.innerHTML = ''; return; }

    if (status && status.enabled === false) {
      host.innerHTML = `
        <div class="tutor-panel pop-in">
          <div class="tutor-head">
            <span class="tutor-title">${renderRuby('sad', { size: 30 })} ${t('tutor.title')}</span>
            <button class="tutor-close" onclick="Tutor.close()" aria-label="${escapeHtml(t('common.close'))}">✕</button>
          </div>
          <div class="tutor-unavailable">${t('tutor.unavailable')}</div>
        </div>`;
      return;
    }

    const hist = historyFor(current.questionId);
    const log = hist.length
      ? hist.map(bubble).join('')
      : `<div class="tutor-msg ruby">${escapeHtml(t('tutor.greeting'))}</div>`;

    const sending = sendingQid === current.questionId;
    const blocked = status && !status.canAsk;

    host.innerHTML = `
      <div class="tutor-panel pop-in">
        <div class="tutor-head">
          <span class="tutor-title">${renderRuby('happy', { size: 30 })} ${t('tutor.title')}</span>
          <button class="tutor-close" onclick="Tutor.close()" aria-label="${escapeHtml(t('common.close'))}">✕</button>
        </div>
        <div class="tutor-context">${escapeHtml(current.questionLabel || '')}</div>
        <div class="tutor-log">${log}${sending ? `<div class="tutor-msg ruby typing">${t('tutor.typing')}</div>` : ''}</div>
        ${blocked ? `<div class="tutor-blocked">${t('tutor.noCoins', { n: status.price })}</div>` : ''}
        <div class="tutor-bar">
          <textarea class="tutor-input" rows="1" placeholder="${escapeHtml(t('tutor.placeholder'))}"
            ${sending || blocked ? 'disabled' : ''} onkeydown="Tutor.onKey(event)"></textarea>
          <button class="btn tutor-send" onclick="Tutor.send()" ${sending || blocked ? 'disabled' : ''}>${t('tutor.send')}</button>
        </div>
        <div class="tutor-foot">${quotaLine()}</div>
      </div>`;
  }

  return { open, close, send, onKey };
})();
