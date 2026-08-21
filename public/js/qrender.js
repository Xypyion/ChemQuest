/**
 * Shared question rendering + answer collection.
 *
 * Used by the challenge player (`challenge.js`) and the daily quest player
 * (`quests.js`). Both must produce the SAME answer shapes, because the server
 * grades them with one engine (`src/challenges.js gradeQuestion`) — so this
 * lives in one place rather than being copied per player.
 *
 * Markup deliberately reuses the `.ch-*` classes from `css/challenge.css`.
 *
 * Simulations are NOT handled here: they are a challenge-only question type and
 * their sandboxed iframe stays in `challenge.js`.
 *
 * Load AFTER i18n.js and api.js (needs `t()` and `escapeHtml()`).
 */
const QRender = (() => {
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  /** The answer control for one question, by type. */
  function answerHtml(q) {
    switch (q.type) {
      case 'mcq':
        return `<div class="ch-choices">${(q.choices || []).map((c, i) => `
          <label class="ch-choice">
            <input type="radio" name="q-${escapeHtml(q.id)}" value="${i}">
            <span class="ltr">${LETTERS[i]}</span><span>${escapeHtml(c)}</span>
          </label>`).join('')}</div>`;
      case 'multi':
        return `<div class="ch-hint">${t('ch.multiHint')}</div>
          <div class="ch-choices">${(q.choices || []).map((c, i) => `
          <label class="ch-choice">
            <input type="checkbox" name="q-${escapeHtml(q.id)}" value="${i}">
            <span class="ltr">${LETTERS[i]}</span><span>${escapeHtml(c)}</span>
          </label>`).join('')}</div>`;
      case 'short':
        return `<input class="ch-input" type="text" data-answer placeholder="${escapeHtml(t('ch.shortPh'))}">`;
      case 'table':
        return `<div class="ch-hint">${t('ch.tableHint')}</div>${tableHtml(q)}`;
      case 'written':
      default:
        return `<textarea class="ch-area" rows="5" data-answer placeholder="${escapeHtml(t('ch.answerPh'))}"></textarea>`;
    }
  }

  function tableHtml(q) {
    const cols = (q.table && q.table.columns) || [];
    const rows = (q.table && q.table.rows) || [];
    return `
      <div class="ch-table-wrap">
        <table class="ch-table">
          <thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((r, ri) => `<tr>${(r.cells || []).map((cell, ci) => cell.blank
              ? `<td><input class="ch-cell" type="text" data-cell="${ri}_${ci}" aria-label="row ${ri + 1} column ${ci + 1}"></td>`
              : `<td class="fixed">${escapeHtml(cell.text)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /**
   * Read every answer out of the DOM, keyed by question id.
   * Only non-empty answers are included — the server treats a missing key as
   * "not answered", so an empty string must not be sent.
   * `root` defaults to the document so existing callers keep working.
   */
  function collectAnswers(root) {
    const scope = root || document;
    const out = {};
    scope.querySelectorAll('.ch-q[data-qid]').forEach((el) => {
      const qid = el.dataset.qid;
      const type = el.dataset.qtype;
      if (type === 'mcq') {
        const picked = el.querySelector('input[type=radio]:checked');
        if (picked) out[qid] = Number(picked.value);
      } else if (type === 'multi') {
        const picked = [...el.querySelectorAll('input[type=checkbox]:checked')].map((i) => Number(i.value));
        if (picked.length) out[qid] = picked;
      } else if (type === 'table') {
        const cells = {};
        el.querySelectorAll('.ch-cell').forEach((inp) => { if (inp.value.trim()) cells[inp.dataset.cell] = inp.value.trim(); });
        if (Object.keys(cells).length) out[qid] = cells;
      } else {
        const inp = el.querySelector('[data-answer]');
        if (inp && inp.value.trim()) out[qid] = inp.value;
      }
    });
    return out;
  }

  /** Flatten simulation sub-questions the same way the server scores them. */
  function flatten(questions) {
    const out = [];
    (questions || []).forEach((q) => {
      if (q.type === 'simulation') (q.sub || []).forEach((s) => out.push(s));
      else out.push(q);
    });
    return out;
  }

  /** The student's own answer, as readable text (client twin of `ch.answerText`). */
  function myAnswerText(q, ans) {
    if (ans == null) return '—';
    if (q.type === 'mcq') return (q.choices || [])[Number(ans)] || '—';
    if (q.type === 'multi') return (Array.isArray(ans) ? ans : []).map((i) => (q.choices || [])[i]).filter(Boolean).join(', ') || '—';
    if (q.type === 'table') return Object.keys(ans).map((k) => ans[k]).join(' · ') || '—';
    return String(ans);
  }

  return { answerHtml, tableHtml, collectAnswers, flatten, myAnswerText };
})();
