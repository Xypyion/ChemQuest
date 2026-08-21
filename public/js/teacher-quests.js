/**
 * Teacher console — the ⚔️ Daily Quests section.
 *
 * Same contract as teacher-challenges.js:
 *   TQuests.render(hostEl)  paint into the console's view element
 *   TQuests.reset()         forget sub-view state when the nav changes
 * Inline onclick handlers need globals, so the actions are published on
 * `window.TQ`. Loaded before teacher.js.
 *
 * Quests are marked automatically, so unlike Challenges there is no grading
 * UI here — the Responses view is read-only.
 */
const TQuests = (() => {
  const esc = escapeHtml;

  /** Question types a quest may use. Everything here can be auto-marked. */
  const TYPES = ['mcq', 'multi', 'short', 'table'];
  const TYPE_LABEL = {
    mcq: () => t('t.qTypeMcq'),
    multi: () => t('t.qTypeMulti'),
    short: () => t('t.qTypeShort'),
    table: () => t('t.qTypeTable'),
  };

  let host = null;
  let mode = 'list';      // 'list' | 'editor' | 'responses'
  let list = [];
  let draft = null;
  let responses = null;
  let loaded = false;

  function reset() {
    mode = 'list';
    draft = null;
    responses = null;
    loaded = false;
  }

  async function load() {
    list = (await API.get('/api/teacher/quests')).quests || [];
    loaded = true;
  }

  async function render(el) {
    if (el) host = el;
    if (!host) return;
    document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'quests'));
    if (!loaded) {
      host.innerHTML = `<div class="t-card empty">${t('common.loading')}</div>`;
      try { await load(); } catch (e) { host.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`; return; }
    }
    if (mode === 'editor') return paintEditor();
    if (mode === 'responses') return paintResponses();
    paintList();
  }

  async function refresh() {
    loaded = false;
    await render();
  }

  /* --------------------------------- list -------------------------------- */

  function statePill(q) {
    if (!q.published) return `<span class="t-pill">${t('t.qDraft')}</span>`;
    if (q.windowState === 'closed') return `<span class="t-pill">${t('t.qClosedState')}</span>`;
    if (q.windowState === 'upcoming') return `<span class="t-pill">${t('t.qUpcomingState')}</span>`;
    return `<span class="t-pill good">${t('t.qOpenNow')}</span>`;
  }

  function questRow(q) {
    return `
      <div class="lesson-row">
        <div class="lr-icon">${esc(q.icon || '⚔️')}</div>
        <div class="lr-main">
          <div class="lr-title">${esc(q.title)} ${statePill(q)}</div>
          <div class="lr-sub">
            🪙 ${q.reward} · ${t('t.qQuestionCount', { n: q.questionCount })} · ${t('t.qResponseCount', { n: q.responses })}
            ${q.opensAt ? ` · ${t('t.qOpens')} ${esc(fmtWhen(q.opensAt))}` : ''}
            ${q.closesAt ? ` · ${t('t.qCloses')} ${esc(fmtWhen(q.closesAt))}` : ''}
          </div>
        </div>
        <div class="lr-actions">
          <button class="tbtn sm blue" onclick="TQ.openResponses('${esc(q.id)}')">${t('t.qResponses')}${q.responses ? ` <span class="t-badge">${q.responses}</span>` : ''}</button>
          <button class="tbtn sm ghost" onclick="TQ.openAssign('${esc(q.id)}')">${t('t.qAssign')}</button>
          <button class="tbtn sm ${q.published ? 'ghost' : 'green'}" onclick="TQ.togglePublish('${esc(q.id)}', ${!q.published})">${q.published ? t('t.qUnpublish') : t('t.qPublish')}</button>
          <button class="tbtn sm ghost" onclick="TQ.move('${esc(q.id)}','up')">↑</button>
          <button class="tbtn sm ghost" onclick="TQ.move('${esc(q.id)}','down')">↓</button>
          <button class="tbtn sm indigo" onclick="TQ.edit('${esc(q.id)}')">${t('t.edit')}</button>
          <button class="tbtn sm danger" onclick="TQ.confirmDelete('${esc(q.id)}')">🗑</button>
        </div>
      </div>`;
  }

  function paintList() {
    host.innerHTML = `
      <div class="t-head">
        <div>
          <h1>${t('t.qTitle')}</h1>
          <div class="sub">${t('t.qSub')}</div>
        </div>
        <button class="tbtn indigo" onclick="TQ.newQuest()">${t('t.qNew')}</button>
      </div>
      <div class="t-card">
        ${list.length ? list.map(questRow).join('') : `<div class="empty">${t('t.qNone')}</div>`}
      </div>`;
  }

  /* -------------------------------- editor ------------------------------- */

  function blankQuestion(type) {
    return {
      _id: 'q' + Math.random().toString(36).slice(2, 9),
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

  /** ISO -> the value an <input type="datetime-local"> expects. */
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function newQuest() {
    draft = { id: null, title: '', icon: '⚔️', description: '', reward: 10, timeLimit: 0, opensAt: '', closesAt: '', questions: [blankQuestion('mcq')] };
    mode = 'editor';
    render();
  }

  async function edit(id) {
    try {
      const q = (await API.get('/api/teacher/quests/item/' + id)).quest;
      draft = {
        id: q.id,
        title: q.title || '',
        icon: q.icon || '⚔️',
        description: q.description || '',
        reward: q.reward || 0,
        timeLimit: q.timeLimit || 0,
        opensAt: toLocalInput(q.opensAt),
        closesAt: toLocalInput(q.closesAt),
        questions: (q.questions || []).map(mapInQuestion),
      };
      mode = 'editor';
      render();
    } catch (e) { toast(e.message, 'bad'); }
  }

  function paintEditor() {
    host.innerHTML = `
      <div class="t-head">
        <div>
          <h1>${draft.id ? t('t.edit') : t('t.qNew')}</h1>
          <div class="sub">${t('t.qSub')}</div>
        </div>
        <button class="tbtn ghost" onclick="TQ.backToList()">${t('t.qBack')}</button>
      </div>

      <div class="t-card">
        <div class="t-grid-2">
          <div>
            <label class="t-label">${t('t.qTitleField')}</label>
            <input class="t-input" id="q-title" value="${esc(draft.title)}">
          </div>
          <div>
            <label class="t-label">${t('t.qIcon')}</label>
            <input class="t-input" id="q-icon" value="${esc(draft.icon)}" maxlength="8">
          </div>
        </div>
        <label class="t-label">${t('t.qDesc')}</label>
        <textarea class="t-area" id="q-desc" rows="2">${esc(draft.description)}</textarea>
        <div class="t-grid-2">
          <div>
            <label class="t-label">${t('t.qReward')}</label>
            <input class="t-input" id="q-reward" type="number" min="0" value="${draft.reward}">
            <div class="sub">${t('t.qRewardHint')}</div>
          </div>
          <div>
            <label class="t-label">${t('t.qTimeLimit')}</label>
            <input class="t-input" id="q-time" type="number" min="0" value="${draft.timeLimit}">
          </div>
        </div>
        <label class="t-label">${t('t.qWindow')}</label>
        <div class="t-grid-2">
          <div>
            <label class="t-label">${t('t.qOpens')}</label>
            <input class="t-input" id="q-opens" type="datetime-local" value="${esc(draft.opensAt)}">
          </div>
          <div>
            <label class="t-label">${t('t.qCloses')}</label>
            <input class="t-input" id="q-closes" type="datetime-local" value="${esc(draft.closesAt)}">
          </div>
        </div>
        <div class="sub">${t('t.qWindowHint')}</div>
      </div>

      <div class="t-card">
        <div class="sub" style="margin-bottom:10px">${t('t.qAutoOnly')}</div>
        <div id="qqList">${draft.questions.map((q, i) => questionCard(q, i)).join('')}</div>
        <button class="tbtn ghost" onclick="TQ.addQuestion()">${t('t.qAddQ')}</button>
      </div>

      <div class="editor-actions">
        <button class="tbtn ghost" onclick="TQ.backToList()">${t('common.cancel')}</button>
        <button class="tbtn indigo" onclick="TQ.save()">${t('common.save')}</button>
      </div>`;
  }

  function questionCard(q, i) {
    return `
      <div class="qcard" data-qid="${esc(q._id)}">
        <div class="qcard-head">
          <div class="q-types">
            ${TYPES.map((ty) => `<button class="tbtn sm ${q.type === ty ? 'indigo' : 'ghost'}" onclick="TQ.setType('${esc(q._id)}','${ty}')">${esc(TYPE_LABEL[ty]())}</button>`).join('')}
          </div>
          <button class="tbtn sm danger" onclick="TQ.removeQuestion('${esc(q._id)}')">🗑</button>
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
              <input type="${multi ? 'checkbox' : 'radio'}" name="ok-${esc(q._id)}" class="q-ok" data-i="${i}"
                ${multi ? (q.correctIndexes.includes(i) ? 'checked' : '') : (q.correctIndex === i ? 'checked' : '')}>
              <input class="t-input q-choice-text" data-i="${i}" value="${esc(c)}" placeholder="${esc(t('t.choicePh', { n: i + 1 }))}">
              <button class="tbtn sm ghost" onclick="TQ.removeChoice('${esc(q._id)}',${i})">✕</button>
            </div>`).join('')}
        </div>
        <button class="tbtn sm ghost" onclick="TQ.addChoice('${esc(q._id)}')">${t('t.addChoice')}</button>`;
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
          <button class="tbtn sm ghost" onclick="TQ.addCol('${esc(q._id)}')">＋</button>
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
              <button class="tbtn sm ghost" onclick="TQ.removeRow('${esc(q._id)}',${ri})">✕</button>
            </div>`).join('')}
        </div>
        <button class="tbtn sm ghost" onclick="TQ.addRow('${esc(q._id)}')">${t('t.chAddRow')}</button>`;
    }
    return '';
  }

  /* ---- reading the editor DOM back into the draft ---- */

  function findQ(id) { return draft.questions.find((q) => q._id === id); }

  function readCard(el) {
    const q = findQ(el.dataset.qid);
    if (!q) return;
    q.question = el.querySelector(':scope > .q-text').value;
    q.points = parseInt(el.querySelector(':scope > .t-grid-2 .q-points').value, 10) || 0;
    q.explanation = el.querySelector(':scope > .t-grid-2 .q-explain').value;

    if (q.type === 'mcq' || q.type === 'multi') {
      const texts = [...el.querySelectorAll(':scope .q-choice-text')];
      q.choices = texts.map((i) => i.value);
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

  /** The editor re-renders on every structural change, so read the DOM first. */
  function syncDraft() {
    draft.title = document.getElementById('q-title').value;
    draft.icon = document.getElementById('q-icon').value;
    draft.description = document.getElementById('q-desc').value;
    draft.reward = parseInt(document.getElementById('q-reward').value, 10) || 0;
    draft.timeLimit = parseInt(document.getElementById('q-time').value, 10) || 0;
    draft.opensAt = document.getElementById('q-opens').value;
    draft.closesAt = document.getElementById('q-closes').value;
    document.querySelectorAll('#qqList > .qcard').forEach(readCard);
  }

  const mutate = (fn) => { syncDraft(); fn(); render(); };

  const addQuestion = () => mutate(() => draft.questions.push(blankQuestion('mcq')));
  const removeQuestion = (id) => mutate(() => { draft.questions = draft.questions.filter((q) => q._id !== id); });
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

  async function save() {
    syncDraft();
    if (!draft.title.trim()) { toast(t('t.chNeedTitle'), 'bad'); return; }
    const payload = {
      title: draft.title,
      icon: draft.icon,
      description: draft.description,
      reward: draft.reward,
      timeLimit: draft.timeLimit,
      // datetime-local has no timezone; the browser's own zone is what the
      // teacher meant, and toISOString normalises it for the server.
      opensAt: draft.opensAt ? new Date(draft.opensAt).toISOString() : null,
      closesAt: draft.closesAt ? new Date(draft.closesAt).toISOString() : null,
      questions: draft.questions.map(outQuestion),
    };
    try {
      const res = draft.id
        ? await API.put('/api/teacher/quests/' + draft.id, payload)
        : await API.post('/api/teacher/quests', payload);
      // The server silently drops questions with no answer key — say so.
      if (res.dropped === 1) toast(t('t.qDroppedOne'), 'bad');
      else if (res.dropped > 1) toast(t('t.qDropped', { n: res.dropped }), 'bad');
      else toast(t('t.qSaved'), 'good');
      mode = 'list';
      draft = null;
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* ------------------------------ row actions ---------------------------- */

  async function togglePublish(id, next) {
    try { await API.post(`/api/teacher/quests/${id}/publish`, { published: next }); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function move(id, direction) {
    try { await API.post(`/api/teacher/quests/${id}/move`, { direction }); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function confirmDelete(id) {
    const q = list.find((x) => x.id === id);
    if (!q) return;
    openModal(`
      <h3>${t('t.qDeleteTitle')}</h3>
      <p>${t('t.qDeleteMsg', { title: esc(q.title) })}</p>
      <div class="editor-actions" style="border:none;padding-top:14px">
        <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
        <button class="tbtn danger" onclick="TQ.doDelete('${esc(id)}')">🗑</button>
      </div>`);
  }

  async function doDelete(id) {
    try { await API.del('/api/teacher/quests/' + id); closeModal(); toast(t('t.qDeleted'), 'good'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function openAssign(id) {
    const q = list.find((x) => x.id === id);
    if (!q) return;
    const a = q.assign || { mode: 'all', studentIds: [] };
    openModal(`
      <h3>${t('t.qAssign')}</h3>
      <label class="gate-opt"><input type="radio" name="qasg" value="all" ${a.mode === 'all' ? 'checked' : ''} onchange="TQ.syncAssignUI()"> ${t('t.chAssignAll')}</label>
      <label class="gate-opt"><input type="radio" name="qasg" value="some" ${a.mode === 'some' ? 'checked' : ''} onchange="TQ.syncAssignUI()"> ${t('t.chAssignSome')}</label>
      <div id="qassign-list" style="${a.mode === 'some' ? '' : 'display:none'};max-height:240px;overflow:auto;margin-top:8px">
        ${STUDENTS.map((s) => `
          <label class="t-check"><input type="checkbox" class="qasg-s" value="${esc(s.id)}" ${a.studentIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}
      </div>
      <div class="editor-actions" style="border:none;padding-top:14px">
        <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
        <button class="tbtn indigo" onclick="TQ.saveAssign('${esc(id)}')">${t('common.save')}</button>
      </div>`);
  }

  function syncAssignUI() {
    const mode = document.querySelector('input[name="qasg"]:checked').value;
    document.getElementById('qassign-list').style.display = mode === 'some' ? '' : 'none';
  }

  async function saveAssign(id) {
    const mode = document.querySelector('input[name="qasg"]:checked').value;
    const studentIds = [...document.querySelectorAll('.qasg-s:checked')].map((i) => i.value);
    try { await API.post(`/api/teacher/quests/${id}/assign`, { mode, studentIds }); closeModal(); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  /* ------------------------------- responses ----------------------------- */

  async function openResponses(id) {
    try {
      responses = await API.get(`/api/teacher/quests/${id}/responses`);
      mode = 'responses';
      render();
    } catch (e) { toast(e.message, 'bad'); }
  }

  function paintResponses() {
    const r = responses;
    const rows = r.responses.map((s) => `
      <tr>
        <td>${esc(s.userAvatar || '🧑‍🎓')} ${esc(s.userName)}</td>
        <td>${s.earned} / ${s.maxPoints}</td>
        <td><b style="color:#c89200">🪙 ${s.coinsAwarded}</b></td>
        <td>${esc(fmtWhen(s.createdAt))}</td>
      </tr>`).join('');

    host.innerHTML = `
      <div class="t-head">
        <div>
          <h1>${t('t.qRespTitle', { title: esc(r.quest.title) })}</h1>
          <div class="sub">${t('t.qRespDone', { done: r.responses.length, total: r.assignedCount })}</div>
        </div>
        <button class="tbtn ghost" onclick="TQ.backToList()">${t('t.qBack')}</button>
      </div>

      <div class="t-card">
        ${r.responses.length ? `
          <table class="t-table">
            <thead><tr>
              <th>${t('t.gbStudent')}</th><th>${t('t.qRespScore')}</th><th>${t('t.qRespCoins')}</th><th>${t('t.csvSubmitted')}</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>` : `<div class="empty">${t('t.qRespNone')}</div>`}
      </div>

      ${r.missing.length ? `
        <div class="t-card">
          <div class="t-label">${t('t.qRespMissing')}</div>
          <div>${r.missing.map((m) => `<span class="t-pill">${esc(m.name)}</span>`).join(' ')}</div>
        </div>` : ''}

      <div class="t-card">
        <div class="t-label">${t('t.qExpected')}</div>
        <table class="t-table">
          <tbody>
            ${r.quest.questions.map((q, i) => `
              <tr>
                <td>${i + 1}. ${esc(q.question)}</td>
                <td><b>${esc(q.expected || '—')}</b></td>
                <td>${q.points}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function backToList() {
    mode = 'list';
    draft = null;
    responses = null;
    render();
  }

  const api = {
    newQuest, edit, save, backToList,
    addQuestion, removeQuestion, setType, addChoice, removeChoice, addCol, addRow, removeRow,
    togglePublish, move, confirmDelete, doDelete,
    openAssign, syncAssignUI, saveAssign,
    openResponses,
  };
  window.TQ = api;

  return { render, reset };
})();
