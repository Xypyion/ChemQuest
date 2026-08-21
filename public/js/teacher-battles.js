/**
 * Teacher Console — 🤺 Coin Battles.
 *
 * Driven by teacher.js exactly like teacher-quests.js:
 *   TBattles.render(hostEl)  — paint the current sub-view
 *   TBattles.reset()         — leave the section (called when the nav changes)
 * Inline handlers call `window.TB`. Loaded before teacher.js.
 *
 * Two panes: the battle rules (stakes, limits, on/off) and a difficulty-tabbed
 * question bank. The question editor mirrors the one in teacher-quests.js — the
 * same four auto-markable types, because a battle pays out the instant a student
 * answers and nothing may wait for marking.
 */
const TBattles = (() => {
  const DIFFS = ['easy', 'medium', 'hard'];
  const TYPES = ['mcq', 'multi', 'short', 'table'];
  const TYPE_LABEL = {
    mcq: () => t('t.qTypeMcq'),
    multi: () => t('t.qTypeMulti'),
    short: () => t('t.qTypeShort'),
    table: () => t('t.qTypeTable'),
  };

  const esc = (s) => escapeHtml(s);
  const uid = () => 'b' + Math.random().toString(36).slice(2, 9);

  let host = null;
  let settings = null;
  let banks = {};        // difficulty -> count
  let recent = [];
  let tab = 'easy';
  let draft = [];        // the bank being edited, as editor questions
  let loaded = false;

  function reset() { loaded = false; draft = []; tab = 'easy'; }

  /* ------------------------------- loading ------------------------------ */

  async function load() {
    const data = await API.get('/api/teacher/battles');
    settings = data.settings;
    banks = data.banks || {};
    recent = data.recent || [];
    draft = (await API.get('/api/teacher/battles/bank/' + tab)).questions.map(mapInQuestion);
    loaded = true;
  }

  async function render(el) {
    host = el || host;
    if (!loaded) {
      host.innerHTML = `<div class="t-card empty">${t('common.loading')}</div>`;
      try { await load(); } catch (e) { host.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`; return; }
    }
    paint();
  }

  /* -------------------------------- paint ------------------------------- */

  function paint() {
    host.innerHTML = `
      <div class="t-head">
        <div><h1>${t('t.bTitle')}</h1><div class="sub">${t('t.bSub')}</div></div>
      </div>
      ${settingsCard()}
      ${bankCard()}
      ${logCard()}`;
  }

  function settingsCard() {
    const rows = DIFFS.map((d) => `
      <tr>
        <td><b>${esc(tDiff(d))}</b></td>
        <td><input class="t-input b-stake" data-d="${d}" type="number" min="1" value="${settings.stakes[d]}"></td>
        <td><input class="t-input b-time" data-d="${d}" type="number" min="0" value="${settings.timeLimits[d]}"></td>
        <td class="sub">${t('t.bBankCount', { n: banks[d] || 0 })}</td>
      </tr>`).join('');

    return `
      <div class="t-card">
        <h3 style="margin-top:0">${t('t.bSettings')}</h3>
        <label class="t-check" style="margin-bottom:10px">
          <input type="checkbox" id="b-enabled" ${settings.enabled ? 'checked' : ''}> ${t('t.bEnabled')}
        </label>
        <div class="sub" style="margin-bottom:12px">${t('t.bEnabledHint')}</div>

        <table class="t-table b-rules">
          <thead><tr>
            <th></th><th>${t('t.bStakeCol')}</th><th>${t('t.bTimeCol')}</th><th>${t('t.bBank')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="sub" style="margin-top:6px">${t('t.bStakeHint')}</div>

        <div class="t-grid-2" style="margin-top:14px">
          <div>
            <label class="t-label">${t('t.bPerBattle')}</label>
            <input class="t-input" id="b-per" type="number" min="1" max="5" value="${settings.questionsPerBattle}">
            <div class="sub">${t('t.bPerBattleHint')}</div>
          </div>
          <div>
            <label class="t-label">${t('t.bCooldown')}</label>
            <input class="t-input" id="b-cooldown" type="number" min="0" value="${settings.cooldownMinutes}">
            <div class="sub">${t('t.bCooldownHint')}</div>
          </div>
        </div>
        <div class="t-grid-2">
          <div>
            <label class="t-label">${t('t.bDailyLimit')}</label>
            <input class="t-input" id="b-daily" type="number" min="0" value="${settings.dailyLimit}">
            <div class="sub">${t('t.bDailyLimitHint')}</div>
          </div>
          <div></div>
        </div>
        <div style="margin-top:12px"><button class="tbtn indigo" onclick="TB.saveSettings()">${t('t.bSaveSettings')}</button></div>
      </div>`;
  }

  function bankCard() {
    const tabs = DIFFS.map((d) =>
      `<button class="tbtn sm ${d === tab ? 'indigo' : 'ghost'}" onclick="TB.setTab('${d}')">
         ${esc(tDiff(d))} <span class="t-badge">${banks[d] || 0}</span>
       </button>`).join('');

    return `
      <div class="t-card">
        <div class="t-head" style="margin:0 0 8px">
          <h3 style="margin:0">${t('t.bBank')} — ${esc(tDiff(tab))}</h3>
          <div class="q-types">${tabs}</div>
        </div>
        <div class="sub" style="margin-bottom:10px">${t('t.bBankHint')}</div>
        ${draft.length ? '' : `<div class="empty">${t('t.bBankEmpty')}</div>`}
        <div id="bqList">${draft.map((q, i) => questionCard(q, i)).join('')}</div>
        <div class="editor-actions" style="margin-top:12px">
          <button class="tbtn ghost" onclick="TB.addQuestion()">${t('t.bAddQ')}</button>
          <button class="tbtn indigo" onclick="TB.saveBank()">${t('t.bSaveBank')}</button>
        </div>
      </div>`;
  }

  function logCard() {
    if (!recent.length) {
      return `<div class="t-card"><h3 style="margin-top:0">${t('t.bLog')}</h3><div class="empty">${t('t.bNoLog')}</div></div>`;
    }
    const rows = recent.map((b) => {
      const line = b.status === 'open'
        ? `${esc(b.attackerName)} → ${esc(b.defenderName)}`
        : b.status === 'won'
          ? t('t.bBeat', { a: esc(b.attackerName), b: esc(b.defenderName) })
          : t('t.bLostTo', { a: esc(b.attackerName), b: esc(b.defenderName) });
      const tag = b.status === 'open' ? t('t.bOpen') : b.status === 'won' ? t('t.bWon') : t('t.bLost');
      return `
        <tr>
          <td>${b.attackerAvatar || '🧑‍🎓'} ${line}</td>
          <td>${esc(tDiff(b.difficulty))}</td>
          <td><span class="t-pill ${b.status === 'won' ? 'pub' : 'draft'}">${esc(tag)}</span></td>
          <td>${t('t.bCoinsMoved', { n: b.coinsMoved })}</td>
          <td class="sub">${esc(fmtWhen(b.startedAt))}</td>
        </tr>`;
    }).join('');
    return `
      <div class="t-card">
        <h3 style="margin-top:0">${t('t.bLog')}</h3>
        <table class="t-table"><tbody>${rows}</tbody></table>
      </div>`;
  }

  /* ------------------------------- editor ------------------------------- */

  function blankQuestion(type) {
    return {
      _id: uid(),
      type: type || 'mcq',
      question: '',
      points: 1,
      explanation: '',
      choices: ['', ''],
      correctIndex: 0,
      correctIndexes: [],
      accepted: [],
      caseSensitive: false,
      table: { columns: ['', ''], rows: [{ cells: [{ text: '', blank: false, answer: '' }, { text: '', blank: true, answer: '' }] }] },
    };
  }

  function mapInQuestion(q) {
    const b = blankQuestion(q.type);
    b._id = q.id || b._id;
    b.type = q.type;
    b.question = q.question || '';
    b.points = q.points == null ? 1 : q.points;
    b.explanation = q.explanation || '';
    if (q.choices) b.choices = q.choices.slice();
    if (q.correctIndex != null) b.correctIndex = q.correctIndex;
    if (q.correctIndexes) b.correctIndexes = q.correctIndexes.slice();
    if (q.accepted) b.accepted = q.accepted.slice();
    b.caseSensitive = !!q.caseSensitive;
    if (q.table) b.table = JSON.parse(JSON.stringify(q.table));
    return b;
  }

  function questionCard(q, i) {
    return `
      <div class="qcard" data-qid="${esc(q._id)}">
        <div class="qcard-head">
          <div class="q-types">
            ${TYPES.map((ty) => `<button class="tbtn sm ${q.type === ty ? 'indigo' : 'ghost'}" onclick="TB.setType('${esc(q._id)}','${ty}')">${esc(TYPE_LABEL[ty]())}</button>`).join('')}
          </div>
          <button class="tbtn sm danger" onclick="TB.removeQuestion('${esc(q._id)}')">🗑</button>
        </div>
        <textarea class="t-area q-text" rows="2" placeholder="${esc(t('t.chQuestionPh'))}">${esc(q.question)}</textarea>
        ${questionBody(q)}
        <div class="t-grid-2">
          <div>
            <label class="t-label">${t('t.chPoints')}</label>
            <input class="t-input q-points" type="number" min="0" value="${q.points}">
          </div>
          <div>
            <label class="t-label">${t('t.chExplain')}</label>
            <input class="t-input q-explain" value="${esc(q.explanation)}">
          </div>
        </div>
      </div>`;
  }

  function questionBody(q) {
    if (q.type === 'mcq' || q.type === 'multi') {
      const multi = q.type === 'multi';
      return `
        <div class="q-choices">
          ${q.choices.map((c, i) => `
            <div class="q-choice">
              <input type="${multi ? 'checkbox' : 'radio'}" name="bok-${esc(q._id)}" class="q-ok" data-i="${i}"
                ${multi ? (q.correctIndexes.includes(i) ? 'checked' : '') : (q.correctIndex === i ? 'checked' : '')}>
              <input class="t-input q-choice-text" data-i="${i}" value="${esc(c)}" placeholder="${esc(t('t.choicePh', { n: i + 1 }))}">
              <button class="tbtn sm ghost" onclick="TB.removeChoice('${esc(q._id)}',${i})">✕</button>
            </div>`).join('')}
        </div>
        <button class="tbtn sm ghost" onclick="TB.addChoice('${esc(q._id)}')">${t('t.addChoice')}</button>`;
    }
    if (q.type === 'short') {
      return `
        <label class="t-label">${t('t.chAccepted')}</label>
        <input class="t-input q-accepted" value="${esc((q.accepted || []).join(', '))}" placeholder="${esc(t('t.chAcceptedPh'))}">
        <label class="t-check"><input type="checkbox" class="q-case" ${q.caseSensitive ? 'checked' : ''}> ${t('t.chCaseSensitive')}</label>`;
    }
    if (q.type === 'table') {
      const cols = q.table.columns || [];
      return `
        <label class="t-label">${t('t.chTableCols')}</label>
        <div class="q-cols">
          ${cols.map((c, i) => `<input class="t-input q-col" data-i="${i}" value="${esc(c)}">`).join('')}
          <button class="tbtn sm ghost" onclick="TB.addCol('${esc(q._id)}')">＋</button>
        </div>
        <div class="q-table-rows">
          ${(q.table.rows || []).map((r, ri) => `
            <div class="q-row" data-ri="${ri}">
              ${(r.cells || []).map((cell, ci) => `
                <div class="q-cell">
                  <input class="t-input q-cell-text" data-ri="${ri}" data-ci="${ci}" value="${esc(cell.text)}" placeholder="${esc(t('t.chCellTextPh'))}" ${cell.blank ? 'disabled' : ''}>
                  <label class="t-check"><input type="checkbox" class="q-cell-blank" data-ri="${ri}" data-ci="${ci}" ${cell.blank ? 'checked' : ''}> ${t('t.chCellBlank')}</label>
                  <input class="t-input q-cell-answer" data-ri="${ri}" data-ci="${ci}" value="${esc(cell.answer || '')}" placeholder="${esc(t('t.chCellAnswerPh'))}" ${cell.blank ? '' : 'disabled'}>
                </div>`).join('')}
              <button class="tbtn sm ghost" onclick="TB.removeRow('${esc(q._id)}',${ri})">✕</button>
            </div>`).join('')}
        </div>
        <button class="tbtn sm ghost" onclick="TB.addRow('${esc(q._id)}')">${t('t.chAddRow')}</button>`;
    }
    return '';
  }

  /* ---- reading the editor DOM back into the draft ---- */

  const findQ = (id) => draft.find((q) => q._id === id);

  function readCard(el) {
    const q = findQ(el.dataset.qid);
    if (!q) return;
    q.question = el.querySelector(':scope > .q-text').value;
    q.points = parseInt(el.querySelector(':scope > .t-grid-2 .q-points').value, 10) || 0;
    q.explanation = el.querySelector(':scope > .t-grid-2 .q-explain').value;

    if (q.type === 'mcq' || q.type === 'multi') {
      q.choices = [...el.querySelectorAll(':scope .q-choice-text')].map((i) => i.value);
      const oks = [...el.querySelectorAll(':scope .q-ok')];
      if (q.type === 'mcq') {
        const picked = oks.findIndex((i) => i.checked);
        q.correctIndex = picked === -1 ? 0 : picked;
      } else {
        q.correctIndexes = oks.map((i, idx) => (i.checked ? idx : -1)).filter((i) => i >= 0);
      }
    } else if (q.type === 'short') {
      q.accepted = el.querySelector(':scope .q-accepted').value.split(',').map((s) => s.trim()).filter(Boolean);
      q.caseSensitive = el.querySelector(':scope .q-case').checked;
    } else if (q.type === 'table') {
      q.table.columns = [...el.querySelectorAll(':scope .q-col')].map((i) => i.value);
      el.querySelectorAll(':scope .q-cell-text').forEach((inp) => {
        const { ri, ci } = inp.dataset;
        q.table.rows[ri].cells[ci].text = inp.value;
      });
      el.querySelectorAll(':scope .q-cell-blank').forEach((inp) => {
        const { ri, ci } = inp.dataset;
        q.table.rows[ri].cells[ci].blank = inp.checked;
      });
      el.querySelectorAll(':scope .q-cell-answer').forEach((inp) => {
        const { ri, ci } = inp.dataset;
        q.table.rows[ri].cells[ci].answer = inp.value;
      });
    }
  }

  /** The pane re-renders on every structural change, so read the DOM first. */
  function syncDraft() {
    const list = document.getElementById('bqList');
    if (list) list.querySelectorAll(':scope > .qcard').forEach(readCard);
  }

  /** Read the rules pane, so switching tabs never loses a typed stake. */
  function syncSettings() {
    if (!document.getElementById('b-enabled')) return;
    settings.enabled = document.getElementById('b-enabled').checked;
    document.querySelectorAll('.b-stake').forEach((i) => {
      settings.stakes[i.dataset.d] = parseInt(i.value, 10) || settings.stakes[i.dataset.d];
    });
    document.querySelectorAll('.b-time').forEach((i) => {
      settings.timeLimits[i.dataset.d] = Math.max(0, parseInt(i.value, 10) || 0);
    });
    settings.questionsPerBattle = parseInt(document.getElementById('b-per').value, 10) || 1;
    settings.cooldownMinutes = Math.max(0, parseInt(document.getElementById('b-cooldown').value, 10) || 0);
    settings.dailyLimit = Math.max(0, parseInt(document.getElementById('b-daily').value, 10) || 0);
  }

  const mutate = (fn) => { syncSettings(); syncDraft(); fn(); paint(); };

  const addQuestion = () => mutate(() => draft.push(blankQuestion('mcq')));
  const removeQuestion = (id) => mutate(() => { draft = draft.filter((q) => q._id !== id); });
  const setType = (id, ty) => mutate(() => { const q = findQ(id); if (q) q.type = ty; });
  const addChoice = (id) => mutate(() => { const q = findQ(id); if (q && q.choices.length < 8) q.choices.push(''); });
  const removeChoice = (id, i) => mutate(() => {
    const q = findQ(id);
    if (!q || q.choices.length <= 2) return;
    q.choices.splice(i, 1);
    if (q.correctIndex >= q.choices.length) q.correctIndex = 0;
    q.correctIndexes = (q.correctIndexes || []).filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
  });
  const addCol = (id) => mutate(() => {
    const q = findQ(id);
    if (!q || q.table.columns.length >= 8) return;
    q.table.columns.push('');
    q.table.rows.forEach((r) => r.cells.push({ text: '', blank: false, answer: '' }));
  });
  const addRow = (id) => mutate(() => {
    const q = findQ(id);
    if (!q || q.table.rows.length >= 20) return;
    q.table.rows.push({ cells: q.table.columns.map(() => ({ text: '', blank: false, answer: '' })) });
  });
  const removeRow = (id, ri) => mutate(() => {
    const q = findQ(id);
    if (q && q.table.rows.length > 1) q.table.rows.splice(ri, 1);
  });

  /** Draft question -> the payload the server expects (drops the private _id). */
  function outQuestion(q) {
    const out = { id: q._id, type: q.type, question: q.question, points: q.points, explanation: q.explanation };
    if (q.type === 'mcq') { out.choices = q.choices; out.correctIndex = q.correctIndex; }
    else if (q.type === 'multi') { out.choices = q.choices; out.correctIndexes = q.correctIndexes; }
    else if (q.type === 'short') { out.accepted = q.accepted; out.caseSensitive = q.caseSensitive; }
    else if (q.type === 'table') { out.table = q.table; }
    return out;
  }

  /* ------------------------------- actions ------------------------------ */

  /** Switching difficulty saves nothing — load that bank fresh. */
  async function setTab(d) {
    syncSettings();
    tab = d;
    try {
      draft = (await API.get('/api/teacher/battles/bank/' + d)).questions.map(mapInQuestion);
      paint();
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function saveSettings() {
    syncSettings();
    syncDraft();
    try {
      const r = await API.post('/api/teacher/battles/settings', {
        enabled: settings.enabled,
        stakes: settings.stakes,
        timeLimits: settings.timeLimits,
        questionsPerBattle: settings.questionsPerBattle,
        cooldownMinutes: settings.cooldownMinutes,
        dailyLimit: settings.dailyLimit,
      });
      settings = r.settings;
      toast(t('t.bSettingsSaved'), 'good');
      paint();
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function saveBank() {
    syncSettings();
    syncDraft();
    try {
      const r = await API.post('/api/teacher/battles/bank/' + tab, { questions: draft.map(outQuestion) });
      draft = r.questions.map(mapInQuestion);
      banks[tab] = r.questions.length;
      toast(t('t.bBankSaved'), 'good');
      if (r.dropped) toast(t('t.bDropped', { n: r.dropped }), 'bad');
      paint();
    } catch (e) { toast(e.message, 'bad'); }
  }

  const api = {
    setTab, saveSettings, saveBank,
    addQuestion, removeQuestion, setType, addChoice, removeChoice, addCol, addRow, removeRow,
  };
  window.TB = api;

  return { render, reset };
})();
