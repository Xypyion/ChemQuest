/**
 * Teacher console — ✨ "Write me some questions", the AI panel.
 *
 * A dialog shared by two editors that already look the same:
 *   TQuests  (⚔️ Daily Quests)   — questions for one quest
 *   TBattles (🤺 Coin Battles)   — questions for one difficulty's bank
 *
 * Both call `TAI.open({...})` and get a list of drafts back through `onInsert`.
 * Nothing here saves anything: the questions land in the editor the teacher is
 * already looking at, and their existing Save button is what stores them. That
 * keeps one save path per feature and, more to the point, means no question
 * reaches a student without the teacher having seen it.
 *
 * Loaded BEFORE teacher.js (which owns openModal/closeModal), like the other
 * teacher-*.js modules. Inline handlers call `window.TAI`.
 */
const TAI = (() => {
  const esc = (s) => escapeHtml(s);

  const TYPES = ['mcq', 'multi', 'short', 'table'];
  const TYPE_LABEL = {
    mcq: () => t('t.qTypeMcq'),
    multi: () => t('t.qTypeMulti'),
    short: () => t('t.qTypeShort'),
    table: () => t('t.qTypeTable'),
  };

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  let ctx = null;        // { target, difficulty, types, onInsert }
  let status = null;     // GET /api/teacher/ai/status
  let results = [];      // the drafts on screen, each with a `_take` flag
  let busy = false;
  let notice = '';       // an error already turned into a sentence

  /* ------------------------------- opening ------------------------------ */

  /**
   * @param {object} opts
   * @param {string} opts.target      'battle' | 'quest' — what it is being written for
   * @param {string} [opts.difficulty] 'easy' | 'medium' | 'hard'
   * @param {string[]} [opts.types]   which types this editor accepts
   * @param {function} opts.onInsert  (questions[]) => void
   */
  async function open(opts) {
    ctx = {
      target: opts.target === 'quest' ? 'quest' : 'battle',
      difficulty: opts.difficulty || 'easy',
      types: (opts.types && opts.types.length ? opts.types : ['mcq']).slice(),
      onInsert: opts.onInsert,
      count: 3,
      picked: ['mcq'],
      notes: '',
    };
    results = [];
    notice = '';
    busy = false;
    paint();
    try {
      status = await API.get('/api/teacher/ai/status');
    } catch (e) {
      status = { enabled: false };
    }
    paint();
  }

  function close() {
    ctx = null;
    results = [];
    closeModal();
  }

  /* -------------------------------- paint ------------------------------- */

  function paint() {
    if (!ctx) return;
    // The review pane shows whole questions with their choices, which the
    // default 440px dialog cannot hold without wrapping every line.
    openModal(results.length ? resultsHtml() : formHtml(), results.length ? 'wide' : '');
  }

  /** How much of today's allowance is left, when there is a cap at all. */
  function quotaLine() {
    if (!status || status.enabled === false) return '';
    if (status.unlimited) return '';
    return `<div class="sub" style="margin-top:8px">${t('t.aiLeftToday', { n: status.left })}</div>`;
  }

  function formHtml() {
    if (status && status.enabled === false) {
      return `
        <h3>${t('t.aiTitle')}</h3>
        <div class="empty">${t('t.aiDisabled')}</div>
        <div class="editor-actions"><button class="tbtn ghost" onclick="TAI.close()">${t('common.close')}</button></div>`;
    }

    const typeBoxes = TYPES.filter((ty) => ctx.types.includes(ty)).map((ty) => `
      <label class="t-check">
        <input type="checkbox" class="ai-type" value="${ty}" ${ctx.picked.includes(ty) ? 'checked' : ''}>
        ${esc(TYPE_LABEL[ty]())}
      </label>`).join('');

    const diffPicker = ctx.target === 'quest' ? `
      <div>
        <label class="t-label">${t('t.aiDifficulty')}</label>
        <select class="t-input" id="ai-diff">
          ${['easy', 'medium', 'hard'].map((d) =>
            `<option value="${d}" ${d === ctx.difficulty ? 'selected' : ''}>${esc(tDiff(d))}</option>`).join('')}
        </select>
        <div class="sub">${t('t.aiDifficultyHint')}</div>
      </div>` : `
      <div>
        <label class="t-label">${t('t.aiDifficulty')}</label>
        <input class="t-input" value="${esc(tDiff(ctx.difficulty))}" disabled>
        <div class="sub">${t('t.aiBankDifficultyHint')}</div>
      </div>`;

    return `
      <h3>${t('t.aiTitle')}</h3>
      <div class="sub" style="margin-bottom:12px">${t('t.aiSub')}</div>
      ${notice ? `<div class="empty" style="padding:12px">${esc(notice)}</div>` : ''}

      <div class="t-grid-2">
        <div>
          <label class="t-label">${t('t.aiCount')}</label>
          <input class="t-input" id="ai-count" type="number" min="1" max="${(status && status.maxBatch) || 10}" value="${ctx.count}">
        </div>
        ${diffPicker}
      </div>

      <label class="t-label">${t('t.aiTypes')}</label>
      <div class="q-types" style="flex-wrap:wrap">${typeBoxes}</div>

      <label class="t-label" style="margin-top:10px">${t('t.aiNotes')}</label>
      <textarea class="t-area" id="ai-notes" rows="2" placeholder="${esc(t('t.aiNotesPh'))}">${esc(ctx.notes)}</textarea>
      <div class="sub">${t('t.aiTopicNote')}</div>
      ${quotaLine()}

      <div class="editor-actions" style="margin-top:14px">
        <button class="tbtn ghost" onclick="TAI.close()">${t('common.cancel')}</button>
        <button class="tbtn indigo" onclick="TAI.generate()" ${busy ? 'disabled' : ''}>
          ${busy ? t('t.aiWorking') : t('t.aiGenerate')}
        </button>
      </div>`;
  }

  /** The answer key, spelled out so the teacher can check it at a glance. */
  function keyText(q) {
    if (q.type === 'mcq') return `${LETTERS[q.correctIndex] || '?'}. ${(q.choices || [])[q.correctIndex] || ''}`;
    if (q.type === 'multi') {
      return (q.correctIndexes || [])
        .map((i) => `${LETTERS[i] || i}. ${(q.choices || [])[i] || ''}`).join('  ·  ');
    }
    if (q.type === 'short') return (q.accepted || []).join('  /  ');
    if (q.type === 'table') {
      const cols = (q.table && q.table.columns) || [];
      const out = [];
      ((q.table && q.table.rows) || []).forEach((row) => {
        const label = (row.cells || []).find((c) => !c.blank && c.text);
        (row.cells || []).forEach((cell, ci) => {
          if (cell.blank) out.push(`${label ? label.text + ' / ' : ''}${cols[ci] || ''}: ${cell.answer}`);
        });
      });
      return out.join('  ·  ');
    }
    return '';
  }

  function cardHtml(q, i) {
    const choices = (q.type === 'mcq' || q.type === 'multi') ? `
      <ul class="ai-choices">
        ${(q.choices || []).map((c, ci) => {
          const right = q.type === 'mcq' ? ci === q.correctIndex : (q.correctIndexes || []).includes(ci);
          return `<li class="${right ? 'right' : ''}"><b>${LETTERS[ci] || ci}.</b> ${chem(c)}</li>`;
        }).join('')}
      </ul>` : '';

    return `
      <div class="ai-card ${q._take ? 'on' : 'off'}">
        <label class="t-check ai-pick">
          <input type="checkbox" class="ai-take" data-i="${i}" ${q._take ? 'checked' : ''}>
          <span class="t-pill ${esc(q._difficulty || '')}">${esc(TYPE_LABEL[q.type] ? TYPE_LABEL[q.type]() : q.type)}</span>
          <span class="sub">${t('t.chPoints')}: ${q.points}</span>
        </label>
        <div class="ai-q">${chem(q.question)}</div>
        ${choices}
        <div class="ai-key"><b>${t('t.aiAnswer')}:</b> ${chem(keyText(q))}</div>
        ${q.explanation ? `<details class="ai-why"><summary>${t('t.aiShowWorking')}</summary><div>${chem(q.explanation)}</div></details>` : ''}
      </div>`;
  }

  function resultsHtml() {
    const taking = results.filter((q) => q._take).length;
    return `
      <h3>${t('t.aiReviewTitle')}</h3>
      <div class="sub" style="margin-bottom:10px">${t('t.aiReviewSub')}</div>
      ${notice ? `<div class="empty" style="padding:12px">${esc(notice)}</div>` : ''}
      <div class="ai-list">${results.map(cardHtml).join('')}</div>
      ${quotaLine()}
      <div class="editor-actions" style="margin-top:14px">
        <button class="tbtn ghost" onclick="TAI.back()">${t('t.aiAgain')}</button>
        <button class="tbtn ghost" onclick="TAI.close()">${t('common.cancel')}</button>
        <button class="tbtn indigo" onclick="TAI.insert()" ${taking ? '' : 'disabled'}>
          ${t('t.aiInsert', { n: taking })}
        </button>
      </div>`;
  }

  /* ------------------------------- actions ------------------------------ */

  /** Read the form before a repaint throws it away — same rule as the editors. */
  function syncForm() {
    const count = document.getElementById('ai-count');
    if (count) ctx.count = Math.max(1, parseInt(count.value, 10) || 1);
    const diff = document.getElementById('ai-diff');
    if (diff) ctx.difficulty = diff.value;
    const notes = document.getElementById('ai-notes');
    if (notes) ctx.notes = notes.value;
    const picked = [...document.querySelectorAll('.ai-type:checked')].map((i) => i.value);
    if (picked.length) ctx.picked = picked;
  }

  /** Read the checkboxes back before the results pane repaints. */
  function syncPicks() {
    document.querySelectorAll('.ai-take').forEach((box) => {
      const q = results[Number(box.dataset.i)];
      if (q) q._take = box.checked;
    });
  }

  /** Turn a server error code into a sentence the teacher can act on. */
  function messageFor(code) {
    const key = 't.aiErr.' + code;
    const text = t(key);
    return text === key ? code : text;
  }

  async function generate() {
    if (busy) return;
    syncForm();
    busy = true;
    notice = '';
    paint();
    try {
      const r = await API.post('/api/teacher/ai/questions', {
        target: ctx.target,
        difficulty: ctx.difficulty,
        count: ctx.count,
        types: ctx.picked,
        notes: ctx.notes,
        lang: getLang(),
      });
      // Everything arrives ticked: the common case is "these are fine, add them".
      results = (r.questions || []).map((q) => ({ ...q, _take: true, _difficulty: ctx.difficulty }));
      status = { ...(status || {}), ...r };
      if (r.dropped) notice = t('t.aiDropped', { n: r.dropped });
    } catch (e) {
      notice = messageFor(e.message);
    } finally {
      busy = false;
      paint();
    }
  }

  function toggle() { syncPicks(); paint(); }

  /** Back to the form, keeping what was typed. */
  function back() {
    syncPicks();
    results = [];
    notice = '';
    paint();
  }

  function insert() {
    syncPicks();
    const take = results.filter((q) => q._take).map((q) => {
      // `_take` / `_difficulty` are this dialog's own bookkeeping; the editor
      // must never see them, and neither must the server.
      const { _take, _difficulty, ...clean } = q;
      return clean;
    });
    if (!take.length) return;
    const done = ctx.onInsert;
    close();
    if (done) done(take);
    toast(t('t.aiInserted', { n: take.length }), 'good');
  }

  const api = { open, close, generate, insert, back, toggle };
  window.TAI = api;
  return api;
})();

// Ticking a draft repaints nothing on its own, so the click is caught here
// rather than wiring an inline handler onto every checkbox.
document.addEventListener('change', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('ai-take')) TAI.toggle();
});
