/**
 * Teacher Console — 🧩 Challenges.
 *
 * Lives in its own file (teacher.js is already big) and is driven by teacher.js:
 *   TChallenges.render(hostEl)  — paint the current sub-view
 *   TChallenges.reset()         — leave the section (called when the nav changes)
 *
 * Sub-views: list (categories + challenges) → editor (question builder) →
 * responses (marking). Inline handlers call the exported `TC` object.
 */
const TChallenges = (() => {
  const MAX_IMG_BYTES = 900 * 1024;
  const TYPES = ['mcq', 'multi', 'short', 'written', 'table', 'simulation'];
  const TYPE_LABEL = {
    mcq: () => t('t.qTypeMcq'),
    multi: () => t('t.qTypeMulti'),
    short: () => t('t.qTypeShort'),
    written: () => t('t.qTypeLong'),
    table: () => t('t.qTypeTable'),
    simulation: () => t('t.qTypeSim'),
  };

  const esc = (s) => escapeHtml(s);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'q' + Math.random().toString(36).slice(2));

  let host = null;
  let mode = 'list';        // 'list' | 'editor' | 'responses'
  let cats = [];            // working copy of the categories
  let list = [];            // challenge summaries
  let draft = null;         // challenge being edited
  let responses = null;     // { challenge, responses[], missing[] }
  let simPreview = {};      // questionId -> bool (show the live preview?)
  let loaded = false;

  function reset() { mode = 'list'; draft = null; responses = null; loaded = false; }

  /* ------------------------------- loading ------------------------------ */

  async function load() {
    const data = await API.get('/api/teacher/challenges');
    list = data.challenges;
    cats = data.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
    loaded = true;
  }

  async function render(el) {
    host = el || host;
    if (!loaded) {
      host.innerHTML = `<div class="t-card empty">${t('common.loading')}</div>`;
      try { await load(); } catch (e) { host.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`; return; }
    }
    if (mode === 'editor') return paintEditor();
    if (mode === 'responses') return paintResponses();
    paintList();
  }

  /** Reload from the server, then repaint (also refreshes teacher.js badges). */
  async function refresh() {
    loaded = false;
    if (typeof reload === 'function') { try { await reload(); } catch { /* ignore */ } }
    await render();
  }

  function lessonName(id) {
    const l = (typeof LESSONS !== 'undefined' ? LESSONS : []).find((x) => x.id === id);
    return l ? `${l.icon || '🧪'} ${l.title}` : '—';
  }

  /* ================================ LIST ================================ */

  function paintList() {
    const groups = cats.map((c) => ({ label: `${c.icon || '📂'} ${c.name}`, items: [] }));
    const other = { label: t('t.chUncategorized'), items: [] };
    list.forEach((c) => {
      const i = cats.findIndex((k) => k.id === c.categoryId);
      (i === -1 ? other : groups[i]).items.push(c);
    });
    if (other.items.length) groups.push(other);

    const body = list.length
      ? groups.filter((g) => g.items.length).map((g) => `
          <div class="t-card">
            <div class="t-head" style="margin:0 0 10px"><h3 style="margin:0">${esc(g.label)}</h3></div>
            ${g.items.map(challengeRow).join('')}
          </div>`).join('')
      : `<div class="t-card empty">${t('t.chNone')}</div>`;

    host.innerHTML = `
      <div class="t-head">
        <div><h1>${t('t.chTitle')}</h1><div class="sub">${t('t.chSub')}</div></div>
        <button class="tbtn" onclick="TC.newChallenge()">${t('t.chNew')}</button>
      </div>
      <div class="t-card" id="catCard"></div>
      ${body}`;
    paintCategories();
  }

  function challengeRow(c) {
    const assigned = c.assign && c.assign.mode === 'some'
      ? t('t.chAssignedN', { n: (c.assign.studentIds || []).length })
      : t('t.chAssignedAll');
    return `
      <div class="lesson-row">
        <div class="ico">${esc(c.icon || '🧩')}</div>
        <div class="info">
          <div class="t">${esc(c.title)}
            <span class="t-pill ${c.published ? 'pub' : 'draft'}">${c.published ? t('t.chPublished') : t('t.chDraft')}</span>
          </div>
          <div class="d">${esc(lessonName(c.lessonId))} · ❓ ${c.questionCount} ${t('t.questions')} · ⭐ ${c.maxPoints}
            · 👥 ${assigned} · ${t('t.chStats', { r: c.responses, p: c.pending })}</div>
        </div>
        <div class="acts">
          <button class="tbtn ${c.pending ? 'blue' : 'ghost'} sm" onclick="TC.openResponses('${c.id}')">
            ${t('t.chResponses')}${c.pending ? ` <span class="t-badge">${c.pending}</span>` : ''}
          </button>
          <button class="tbtn ghost sm" onclick="TC.openAssign('${c.id}')">${t('t.chAssign')}</button>
          <button class="tbtn ${c.published ? 'green' : 'ghost'} sm" onclick="TC.togglePublish('${c.id}', ${c.published ? 'false' : 'true'})">
            ${c.published ? t('t.chUnpublish') : t('t.chPublish')}
          </button>
          <button class="tbtn ghost sm" onclick="TC.move('${c.id}','up')" title="${t('t.moveUp')}">↑</button>
          <button class="tbtn ghost sm" onclick="TC.move('${c.id}','down')" title="${t('t.moveDown')}">↓</button>
          <button class="tbtn blue sm" onclick="TC.edit('${c.id}')">${t('t.edit')}</button>
          <button class="tbtn danger sm" onclick="TC.confirmDelete('${c.id}')">🗑</button>
        </div>
      </div>`;
  }

  /* ---- categories editor ---- */
  function paintCategories() {
    const rows = cats.length ? cats.map((c, i) => `
      <div class="crit-row">
        <input class="t-input cat-icon" data-i="${i}" value="${esc(c.icon || '📂')}" maxlength="4" style="max-width:70px">
        <input class="t-input cat-name" data-i="${i}" value="${esc(c.name)}" placeholder="${esc(t('t.chCatNamePh'))}" maxlength="60">
        <button class="tbtn danger sm" onclick="TC.removeCat(${i})" aria-label="${t('common.delete')}">✕</button>
      </div>`).join('') : `<div class="sub" style="color:var(--t-soft)">${t('t.chNoCats')}</div>`;
    const el = document.getElementById('catCard');
    if (!el) return;
    el.innerHTML = `
      <div class="t-head" style="margin:0 0 4px"><h3 style="margin:0">${t('t.chCatsTitle')}</h3>
        <button class="tbtn blue sm" onclick="TC.addCat()">${t('t.chAddCat')}</button></div>
      <div class="sub" style="color:var(--t-soft);margin-bottom:8px">${t('t.chCatsHint')}</div>
      ${rows}
      <div style="margin-top:12px"><button class="tbtn" onclick="TC.saveCats()">${t('t.chSaveCats')}</button></div>`;
  }
  function syncCats() {
    document.querySelectorAll('.cat-name').forEach((inp) => { cats[+inp.dataset.i].name = inp.value; });
    document.querySelectorAll('.cat-icon').forEach((inp) => { cats[+inp.dataset.i].icon = inp.value; });
  }
  function addCat() { syncCats(); cats.push({ id: uid(), name: '', icon: '📂' }); paintCategories(); }
  function removeCat(i) { syncCats(); cats.splice(i, 1); paintCategories(); }
  async function saveCats() {
    syncCats();
    try {
      const r = await API.post('/api/teacher/challenges/categories', {
        categories: cats.filter((c) => c.name.trim()),
      });
      cats = r.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
      toast(t('t.chCatsSaved'), 'good');
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* ---- row actions ---- */
  async function togglePublish(id, published) {
    try {
      const r = await API.post(`/api/teacher/challenges/${id}/publish`, { published });
      toast(r.published ? t('t.chPublishedToast') : t('t.chUnpublishedToast'), 'good');
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function move(id, direction) {
    try { await API.post(`/api/teacher/challenges/${id}/move`, { direction }); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  function confirmDelete(id) {
    const c = list.find((x) => x.id === id);
    openModal(`<h3>${t('t.chDeleteQ')}</h3><p>${t('t.chDeleteMsg', { title: esc(c.title) })}</p>
      <div class="editor-actions" style="border:none;padding:0">
        <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
        <button class="tbtn danger" onclick="TC.doDelete('${id}')">${t('common.delete')}</button></div>`);
  }
  async function doDelete(id) {
    try { await API.del('/api/teacher/challenges/' + id); closeModal(); toast(t('t.chDeleted'), 'good'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  /* ---- assign modal ---- */
  function openAssign(id) {
    const c = list.find((x) => x.id === id);
    const a = c.assign || { mode: 'all', studentIds: [] };
    const students = typeof STUDENTS !== 'undefined' ? STUDENTS : [];
    const rows = students.length ? students.map((s) => `
      <label class="assign-row">
        <input type="checkbox" class="assign-student" value="${s.id}" ${(a.studentIds || []).includes(s.id) ? 'checked' : ''}>
        <span class="av">${s.avatar || '🧑‍🎓'}</span> ${esc(s.name)}
        <span class="sub" style="color:var(--t-soft)">${esc(s.email)}</span>
      </label>`).join('') : `<div class="sub" style="color:var(--t-soft)">${t('t.chAssignNoStudents')}</div>`;
    openModal(`
      <h3>${t('t.chAssignTitle', { title: esc(c.title) })}</h3>
      <p class="sub" style="color:var(--t-soft);margin-top:-4px">${t('t.chAssignHint')}</p>
      <label class="gate-opt ${a.mode === 'all' ? 'on' : ''}">
        <input type="radio" name="assign-mode" value="all" ${a.mode === 'all' ? 'checked' : ''} onchange="TC.syncAssignUI()">
        <span><b>${t('t.chAssignAll')}</b></span></label>
      <label class="gate-opt ${a.mode === 'some' ? 'on' : ''}">
        <input type="radio" name="assign-mode" value="some" ${a.mode === 'some' ? 'checked' : ''} onchange="TC.syncAssignUI()">
        <span><b>${t('t.chAssignSome')}</b></span></label>
      <div id="assign-list" class="assign-list" style="${a.mode === 'some' ? '' : 'display:none'}">${rows}</div>
      <div class="editor-actions" style="border:none;padding-top:14px">
        <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
        <button class="tbtn" onclick="TC.saveAssign('${id}')">${t('common.save')}</button>
      </div>`);
  }
  function syncAssignUI() {
    const mode = document.querySelector('input[name=assign-mode]:checked').value;
    document.getElementById('assign-list').style.display = mode === 'some' ? '' : 'none';
    document.querySelectorAll('.gate-opt').forEach((el) => el.classList.toggle('on', el.querySelector('input').checked));
  }
  async function saveAssign(id) {
    const mode = document.querySelector('input[name=assign-mode]:checked').value;
    const studentIds = [...document.querySelectorAll('.assign-student:checked')].map((i) => i.value);
    try {
      await API.post(`/api/teacher/challenges/${id}/assign`, { mode, studentIds });
      closeModal();
      toast(t('t.chAssignSaved'), 'good');
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* =============================== EDITOR =============================== */

  function blankQuestion(type) {
    return {
      _id: uid(), type: type || 'mcq', question: '', image: '', points: 1, explanation: '',
      choices: ['', ''], correctIndex: 0, correctIndexes: [],
      accepted: [], caseSensitive: false,
      table: { columns: ['', ''], rows: [{ cells: [{ text: '', blank: false, answer: '' }, { text: '', blank: true, answer: '' }] }] },
      sim: { mode: 'html', html: '', url: '', height: 420 },
      sub: [],
    };
  }

  function mapInQuestion(q) {
    const b = blankQuestion(q.type);
    b._id = q.id || b._id;
    b.question = q.question || '';
    b.image = q.image || '';
    b.points = q.points == null ? 1 : q.points;
    b.explanation = q.explanation || '';
    if (q.choices && q.choices.length) b.choices = q.choices.slice();
    b.correctIndex = q.correctIndex || 0;
    b.correctIndexes = (q.correctIndexes || []).slice();
    b.accepted = (q.accepted || []).slice();
    b.caseSensitive = !!q.caseSensitive;
    if (q.table && (q.table.columns || []).length) b.table = JSON.parse(JSON.stringify(q.table));
    if (q.sim) b.sim = Object.assign(b.sim, q.sim);
    b.sub = (q.sub || []).map(mapInQuestion);
    return b;
  }

  function newChallenge() {
    const lessons = typeof LESSONS !== 'undefined' ? LESSONS : [];
    draft = {
      id: null, lessonId: lessons.length ? lessons[0].id : '', categoryId: cats.length ? cats[0].id : '',
      title: '', description: '', icon: '🧩', timeLimit: 0, dueAt: '', allowRetake: false,
      published: false, questions: [blankQuestion('mcq')],
    };
    mode = 'editor';
    render();
  }

  async function edit(id) {
    try {
      const { challenge } = await API.get('/api/teacher/challenges/item/' + id);
      draft = {
        id: challenge.id,
        lessonId: challenge.lessonId || '',
        categoryId: challenge.categoryId || '',
        title: challenge.title || '',
        description: challenge.description || '',
        icon: challenge.icon || '🧩',
        timeLimit: challenge.timeLimit || 0,
        dueAt: challenge.dueAt ? toLocalInput(challenge.dueAt) : '',
        allowRetake: !!challenge.allowRetake,
        published: !!challenge.published,
        questions: (challenge.questions || []).map(mapInQuestion),
      };
      if (!draft.questions.length) draft.questions.push(blankQuestion('mcq'));
      mode = 'editor';
      render();
    } catch (e) { toast(e.message, 'bad'); }
  }

  function paintEditor() {
    const lessons = typeof LESSONS !== 'undefined' ? LESSONS : [];
    const lessonOpts = lessons.map((l, i) =>
      `<option value="${l.id}" ${l.id === draft.lessonId ? 'selected' : ''}>${i + 1}. ${esc(l.title)}</option>`).join('');
    const catOpts = [`<option value="" ${!draft.categoryId ? 'selected' : ''}>${esc(t('t.chUncategorized'))}</option>`]
      .concat(cats.map((c) => `<option value="${c.id}" ${c.id === draft.categoryId ? 'selected' : ''}>${esc((c.icon || '📂') + ' ' + c.name)}</option>`))
      .join('');

    host.innerHTML = `
      <div class="t-head">
        <div><h1>${draft.id ? t('t.edit') : t('t.chNew')} — ${t('t.chTitle')}</h1><div class="sub">${t('t.chSub')}</div></div>
        <button class="tbtn ghost" onclick="TC.cancelEdit()">${t('common.back')}</button>
      </div>

      <div class="t-card">
        <h3 style="margin-top:0">${t('t.basics')}</h3>
        <div class="field-row">
          <div><label class="t-label">${t('t.chTitleLabel')}</label>
            <input id="c-title" class="t-input" value="${esc(draft.title)}" placeholder="${esc(t('t.chTitlePh'))}"></div>
          <div><label class="t-label">${t('t.chIcon')}</label>
            <input id="c-icon" class="t-input" value="${esc(draft.icon)}" maxlength="4"></div>
        </div>
        <div class="field-row">
          <div><label class="t-label">${t('t.chLevel')}</label><select id="c-lesson" class="t-select">${lessonOpts}</select></div>
          <div><label class="t-label">${t('t.chCategory')}</label><select id="c-cat" class="t-select">${catOpts}</select></div>
        </div>
        <label class="t-label">${t('t.chDesc')}</label>
        <textarea id="c-desc" class="t-area" placeholder="${esc(t('t.chDescPh'))}">${esc(draft.description)}</textarea>
        <div class="field-row">
          <div><label class="t-label">${t('t.chTimeLimit')}</label>
            <input id="c-time" class="t-input" type="number" min="0" max="7200" value="${draft.timeLimit || 0}"></div>
          <div><label class="t-label">${t('t.chDue')}</label>
            <input id="c-due" class="t-input" type="datetime-local" value="${esc(draft.dueAt)}"></div>
        </div>
        <label class="check-row">
          <input type="checkbox" id="c-retake" ${draft.allowRetake ? 'checked' : ''}>
          <span>${t('t.chAllowRetake')} <span class="sub" style="color:var(--t-soft)">— ${t('t.chAllowRetakeHint')}</span></span>
        </label>
      </div>

      <div class="t-card">
        <div class="t-head" style="margin:0 0 4px"><h3 style="margin:0">${t('t.chQuestions')}</h3>
          <button class="tbtn blue sm" onclick="TC.addQuestion()">${t('t.chAddQuestion')}</button></div>
        <div id="qList">${draft.questions.map((q, i) => questionCard(q, i, null)).join('')
          || `<p class="sub" style="color:var(--t-soft)">${t('t.chNoQuestions')}</p>`}</div>
        <button class="tbtn blue sm" style="margin-top:12px" onclick="TC.addQuestion()">${t('t.chAddQuestion')}</button>
      </div>

      <div class="editor-actions">
        <button class="tbtn ghost" onclick="TC.cancelEdit()">${t('common.cancel')}</button>
        <button class="tbtn" onclick="TC.save()">${t('t.chSave')}</button>
      </div>`;
  }

  /** One question card. `parentId` is set for a question under a simulation. */
  function questionCard(q, i, parentId) {
    const typeTabs = `<div class="qtype-tabs">${TYPES
      .filter((ty) => ty !== 'simulation' || !parentId)   // no simulation inside a simulation
      .map((ty) => `<button class="${q.type === ty ? 'active' : ''}" onclick="TC.setType('${q._id}','${ty}')">${TYPE_LABEL[ty]()}</button>`)
      .join('')}</div>`;

    const imgRow = `
      <label class="t-label">${t('t.chImage')}</label>
      ${q.image ? `<div class="sb-img-preview"><img src="${esc(q.image)}" alt="preview">
        <button class="tbtn danger sm" onclick="TC.removeImage('${q._id}')">${t('t.removeImage')}</button></div>` : ''}
      <input type="hidden" class="q-image-data" value="${esc(q.image)}">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input class="t-input q-image-url" style="flex:1;min-width:160px" value="${(q.image || '').startsWith('data:') ? '' : esc(q.image)}" placeholder="${esc(t('t.imageUrlPh'))}">
        <label class="tbtn ghost sm" style="cursor:pointer">${t('t.upload')}
          <input type="file" accept="image/*" style="display:none" onchange="TC.uploadImage('${q._id}', this)"></label>
      </div>`;

    const pointsRow = q.type === 'simulation' ? '' : `
      <div class="q-points-row">
        <label class="t-label" style="margin:0">${t('t.chPoints')}</label>
        <input type="number" class="t-input q-points" min="0" max="1000" value="${q.points == null ? 1 : q.points}">
      </div>`;

    const explainRow = q.type === 'simulation' ? '' : `
      <label class="t-label">${t('t.chExplain')}</label>
      <input type="text" class="t-input q-explain" value="${esc(q.explanation)}" placeholder="${esc(t('t.chExplainPh'))}">`;

    return `
      <div class="builder-item qcard ${q.type === 'simulation' ? 'simcard' : ''}" data-qid="${q._id}" data-qtype="${q.type}">
        <div class="builder-head">${parentId ? '↳ ' : ''}${t('t.question', { n: i + 1 })} · ${TYPE_LABEL[q.type]()}</div>
        <button class="tbtn danger sm rm" onclick="TC.removeQuestion('${q._id}')">✕</button>
        ${typeTabs}
        <input type="text" class="t-input q-text" value="${esc(q.question)}" placeholder="${esc(t('t.chQuestionPh'))}">
        ${q.type === 'simulation' ? '' : imgRow}
        ${questionBody(q)}
        ${pointsRow}
        ${explainRow}
      </div>`;
  }

  function questionBody(q) {
    switch (q.type) {
      case 'mcq': return choicesBody(q, false);
      case 'multi': return choicesBody(q, true);
      case 'short': return `
        <label class="t-label">${t('t.chAccepted')}</label>
        <textarea class="t-area q-accepted" rows="3" placeholder="${esc(t('t.chAcceptedPh'))}">${esc((q.accepted || []).join('\n'))}</textarea>
        <div class="sub" style="color:var(--t-soft)">${t('t.chAcceptedHint')}</div>
        <label class="check-row"><input type="checkbox" class="q-case" ${q.caseSensitive ? 'checked' : ''}><span>${t('t.chCaseSensitive')}</span></label>`;
      case 'written': return `<div class="written-box"><div class="written-hint">📝 ${t('t.chLongHint')}</div>
        <textarea class="t-area" disabled>${esc(t('t.writtenPreviewPh'))}</textarea></div>`;
      case 'table': return tableBody(q);
      case 'simulation': return simBody(q);
      default: return '';
    }
  }

  function choicesBody(q, multi) {
    const rows = q.choices.map((c, ci) => {
      const on = multi ? (q.correctIndexes || []).includes(ci) : q.correctIndex === ci;
      return `
        <div class="choice-row ${on ? 'is-correct' : ''}">
          <input type="${multi ? 'checkbox' : 'radio'}" class="q-correct" name="correct-${q._id}" value="${ci}" ${on ? 'checked' : ''} onchange="TC.markCorrect(this)">
          <input type="text" class="q-choice" value="${esc(c)}" placeholder="${esc(t('t.choicePh', { n: ci + 1 }))}">
          <span class="correct-wrap">${on ? t('t.correct') : ''}</span>
          ${q.choices.length > 2 ? `<button class="tbtn ghost sm" onclick="TC.removeChoice('${q._id}',${ci})">✕</button>` : ''}
        </div>`;
    }).join('');
    return `
      ${multi ? `<div class="sub" style="color:var(--t-soft);margin-top:6px">${t('t.chMultiHint')}</div>` : ''}
      <div class="choices" style="margin-top:6px">${rows}</div>
      <button class="tbtn ghost sm" style="margin-top:8px" onclick="TC.addChoice('${q._id}')">${t('t.addChoice')}</button>`;
  }

  function tableBody(q) {
    const cols = q.table.columns;
    const head = cols.map((c, ci) =>
      `<th><input class="t-input tb-col" data-c="${ci}" value="${esc(c)}" placeholder="${esc(t('t.chTableCols'))} ${ci + 1}"></th>`).join('');
    const rows = q.table.rows.map((r, ri) => `
      <tr class="tb-row" data-r="${ri}">
        ${r.cells.map((cell, ci) => `
          <td>
            <input class="t-input tb-text" data-r="${ri}" data-c="${ci}" value="${esc(cell.text)}"
                   placeholder="${esc(t('t.chCellTextPh'))}" ${cell.blank ? 'disabled' : ''}>
            <label class="check-row sm"><input type="checkbox" class="tb-blank" data-r="${ri}" data-c="${ci}"
              ${cell.blank ? 'checked' : ''} onchange="TC.toggleCell('${q._id}',${ri},${ci},this.checked)"><span>${t('t.chCellBlank')}</span></label>
            ${cell.blank ? `<input class="t-input tb-ans" data-r="${ri}" data-c="${ci}" value="${esc(cell.answer)}" placeholder="${esc(t('t.chCellAnswerPh'))}">` : ''}
          </td>`).join('')}
        <td class="tb-tools"><button class="tbtn danger sm" onclick="TC.removeRow('${q._id}',${ri})">✕</button></td>
      </tr>`).join('');
    return `
      <div class="sub" style="color:var(--t-soft);margin:8px 0 6px">${t('t.chTableHint')}</div>
      <div class="tb-wrap"><table class="tb-editor"><thead><tr>${head}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="tbtn ghost sm" onclick="TC.addCol('${q._id}')">${t('t.chAddCol')}</button>
        <button class="tbtn ghost sm" onclick="TC.removeCol('${q._id}')">${t('t.chRemoveCol')}</button>
        <button class="tbtn ghost sm" onclick="TC.addRow('${q._id}')">${t('t.chAddRow')}</button>
      </div>`;
  }

  function simBody(q) {
    const isUrl = q.sim.mode === 'url';
    const showing = !!simPreview[q._id];
    return `
      <div class="sub" style="color:var(--t-soft);margin:8px 0">${t('t.chSimHint')}</div>
      <div class="field-row">
        <div><label class="t-label">${t('t.chSimMode')}</label>
          <select class="t-select sim-mode" onchange="TC.setSimMode('${q._id}', this.value)">
            <option value="html" ${!isUrl ? 'selected' : ''}>${t('t.chSimModeHtml')}</option>
            <option value="url" ${isUrl ? 'selected' : ''}>${t('t.chSimModeUrl')}</option>
          </select></div>
        <div><label class="t-label">${t('t.chSimHeight')}</label>
          <input class="t-input sim-height" type="number" min="160" max="1200" value="${q.sim.height || 420}"></div>
      </div>
      ${isUrl
        ? `<label class="t-label">${t('t.chSimUrl')}</label>
           <input class="t-input sim-url" value="${esc(q.sim.url)}" placeholder="${esc(t('t.chSimUrlPh'))}">`
        : `<label class="t-label">${t('t.chSimHtml')}</label>
           <textarea class="t-area code sim-html" rows="10" spellcheck="false" placeholder="${esc(t('t.chSimHtmlPh'))}">${esc(q.sim.html)}</textarea>`}
      <button class="tbtn ghost sm" style="margin-top:8px" onclick="TC.toggleSimPreview('${q._id}')">
        ${showing ? t('t.chSimHidePreview') : t('t.chSimPreview')}</button>
      ${showing ? simFrame(q.sim) : ''}

      <div class="t-head" style="margin:16px 0 4px"><h4 style="margin:0">${t('t.chSubQuestions')}</h4>
        <button class="tbtn blue sm" onclick="TC.addSub('${q._id}')">${t('t.chAddSub')}</button></div>
      <div class="q-subs">${(q.sub || []).map((sq, i) => questionCard(sq, i, q._id)).join('')
        || `<p class="sub" style="color:var(--t-soft)">${t('t.chNoSub')}</p>`}</div>`;
  }

  /** Sandboxed preview of the teacher's simulation (same sandbox as students get). */
  function simFrame(sim) {
    const h = Math.max(160, Math.min(1200, sim.height || 420));
    if (sim.mode === 'url') {
      if (!sim.url) return '';
      return `<iframe class="sim-preview" style="height:${h}px" src="${esc(sim.url)}"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerpolicy="no-referrer" title="simulation"></iframe>`;
    }
    if (!(sim.html || '').trim()) return '';
    const doc = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:12px;font-family:'Rubik','Mitr',system-ui,sans-serif;color:#28243d;background:#fff}img,canvas,svg,video{max-width:100%}</style>
</head><body>${sim.html}</body></html>`;
    return `<iframe class="sim-preview" style="height:${h}px" srcdoc="${esc(doc)}" sandbox="allow-scripts allow-popups" title="simulation"></iframe>`;
  }

  /* ---- editor state sync ---- */

  /** Walk the draft (including simulation sub-questions) to find one by id. */
  function findQ(id, arr) {
    arr = arr || draft.questions;
    for (const q of arr) {
      if (q._id === id) return q;
      if (q.sub && q.sub.length) { const hit = findQ(id, q.sub); if (hit) return hit; }
    }
    return null;
  }
  function removeFrom(id, arr) {
    arr = arr || draft.questions;
    const i = arr.findIndex((q) => q._id === id);
    if (i !== -1) { arr.splice(i, 1); return true; }
    return arr.some((q) => q.sub && q.sub.length && removeFrom(id, q.sub));
  }

  /** Read one question card (and its sub-cards) back into the draft object. */
  function readCard(el) {
    const q = findQ(el.dataset.qid);
    if (!q) return;
    q.question = el.querySelector(':scope > .q-text').value;
    const pts = el.querySelector(':scope > .q-points-row .q-points');
    if (pts) q.points = Math.max(0, Math.min(1000, parseInt(pts.value, 10) || 0));
    const exp = el.querySelector(':scope > .q-explain');
    if (exp) q.explanation = exp.value;
    const imgUrl = el.querySelector(':scope > .row > .q-image-url');
    const imgData = el.querySelector(':scope > .q-image-data');
    if (imgUrl || imgData) {
      const typed = imgUrl ? imgUrl.value.trim() : '';
      const data = imgData ? imgData.value : '';
      q.image = typed || (data.startsWith('data:') ? data : '');
    }

    if (q.type === 'mcq' || q.type === 'multi') {
      q.choices = [...el.querySelectorAll(':scope > .choices > .choice-row > .q-choice')].map((i) => i.value);
      const checked = [...el.querySelectorAll(':scope > .choices > .choice-row > .q-correct:checked')].map((i) => Number(i.value));
      if (q.type === 'mcq') q.correctIndex = checked.length ? checked[0] : 0;
      else q.correctIndexes = checked;
    } else if (q.type === 'short') {
      const ta = el.querySelector(':scope > .q-accepted');
      if (ta) q.accepted = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
      const cs = el.querySelector(':scope > .check-row > .q-case');
      if (cs) q.caseSensitive = cs.checked;
    } else if (q.type === 'table') {
      el.querySelectorAll(':scope > .tb-wrap .tb-col').forEach((inp) => { q.table.columns[+inp.dataset.c] = inp.value; });
      el.querySelectorAll(':scope > .tb-wrap .tb-text').forEach((inp) => {
        const cell = q.table.rows[+inp.dataset.r].cells[+inp.dataset.c];
        if (cell) cell.text = inp.value;
      });
      el.querySelectorAll(':scope > .tb-wrap .tb-blank').forEach((inp) => {
        const cell = q.table.rows[+inp.dataset.r].cells[+inp.dataset.c];
        if (cell) cell.blank = inp.checked;
      });
      el.querySelectorAll(':scope > .tb-wrap .tb-ans').forEach((inp) => {
        const cell = q.table.rows[+inp.dataset.r].cells[+inp.dataset.c];
        if (cell) cell.answer = inp.value;
      });
    } else if (q.type === 'simulation') {
      const height = el.querySelector('.sim-height');
      if (height) q.sim.height = Math.max(160, Math.min(1200, parseInt(height.value, 10) || 420));
      const html = el.querySelector('.sim-html');
      if (html) q.sim.html = html.value;
      const url = el.querySelector('.sim-url');
      if (url) q.sim.url = url.value.trim();
      const subs = el.querySelector(':scope > .q-subs');
      if (subs) subs.querySelectorAll(':scope > .qcard').forEach(readCard);
    }
  }

  function syncDraft() {
    if (!draft) return;
    const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    if (document.getElementById('c-title')) {
      draft.title = g('c-title');
      draft.icon = g('c-icon');
      draft.lessonId = g('c-lesson');
      draft.categoryId = g('c-cat');
      draft.description = g('c-desc');
      draft.timeLimit = Math.max(0, Math.min(7200, parseInt(g('c-time'), 10) || 0));
      draft.dueAt = g('c-due');
      const rt = document.getElementById('c-retake');
      draft.allowRetake = !!(rt && rt.checked);
    }
    const qList = document.getElementById('qList');
    if (qList) qList.querySelectorAll(':scope > .qcard').forEach(readCard);
  }

  /* ---- editor actions ---- */
  function addQuestion() { syncDraft(); draft.questions.push(blankQuestion('mcq')); render(); }
  function addSub(simId) { syncDraft(); const q = findQ(simId); if (q) q.sub.push(blankQuestion('mcq')); render(); }
  function removeQuestion(id) { syncDraft(); removeFrom(id); render(); }
  function setType(id, type) {
    syncDraft();
    const q = findQ(id);
    if (!q || q.type === type) return;
    q.type = type;
    if ((type === 'mcq' || type === 'multi') && (!q.choices || q.choices.length < 2)) q.choices = ['', ''];
    if (type === 'simulation') q.points = 0;
    else if (!q.points) q.points = 1;
    render();
  }
  function addChoice(id) { syncDraft(); const q = findQ(id); if (q && q.choices.length < 8) q.choices.push(''); render(); }
  function removeChoice(id, ci) {
    syncDraft();
    const q = findQ(id);
    if (q && q.choices.length > 2) {
      q.choices.splice(ci, 1);
      if (q.correctIndex >= q.choices.length) q.correctIndex = 0;
      q.correctIndexes = (q.correctIndexes || []).filter((n) => n !== ci).map((n) => (n > ci ? n - 1 : n));
    }
    render();
  }
  /** Repaint the ✅ marks without a full re-render (keeps focus where it is). */
  function markCorrect(input) {
    const card = input.closest('.qcard');
    card.querySelectorAll(':scope > .choices > .choice-row').forEach((row) => {
      const on = row.querySelector('.q-correct').checked;
      row.classList.toggle('is-correct', on);
      row.querySelector('.correct-wrap').textContent = on ? t('t.correct') : '';
    });
  }
  function toggleCell(id, r, c, blank) {
    syncDraft();
    const q = findQ(id);
    if (q) q.table.rows[r].cells[c].blank = blank;
    render();
  }
  function addCol(id) {
    syncDraft();
    const q = findQ(id);
    if (!q || q.table.columns.length >= 8) return;
    q.table.columns.push('');
    q.table.rows.forEach((r) => r.cells.push({ text: '', blank: true, answer: '' }));
    render();
  }
  function removeCol(id) {
    syncDraft();
    const q = findQ(id);
    if (!q || q.table.columns.length <= 1) return;
    q.table.columns.pop();
    q.table.rows.forEach((r) => r.cells.pop());
    render();
  }
  function addRow(id) {
    syncDraft();
    const q = findQ(id);
    if (!q || q.table.rows.length >= 20) return;
    q.table.rows.push({ cells: q.table.columns.map(() => ({ text: '', blank: true, answer: '' })) });
    render();
  }
  function removeRow(id, ri) {
    syncDraft();
    const q = findQ(id);
    if (q && q.table.rows.length > 1) q.table.rows.splice(ri, 1);
    render();
  }
  function setSimMode(id, mode) { syncDraft(); const q = findQ(id); if (q) q.sim.mode = mode; render(); }
  function toggleSimPreview(id) { syncDraft(); simPreview[id] = !simPreview[id]; render(); }
  function removeImage(id) { syncDraft(); const q = findQ(id); if (q) q.image = ''; render(); }
  function uploadImage(id, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > MAX_IMG_BYTES) { toast(t('t.imgTooBig'), 'bad'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { syncDraft(); const q = findQ(id); if (q) q.image = reader.result; render(); toast(t('t.imgAdded'), 'good'); };
    reader.onerror = () => toast('Could not read that file.', 'bad');
    reader.readAsDataURL(file);
  }
  function cancelEdit() { draft = null; mode = 'list'; render(); }

  /** Strip the editor's private `_id` and send the challenge to the server. */
  function outQuestion(q) {
    const base = {
      id: q._id, type: q.type, question: q.question, image: q.image || '',
      points: q.points == null ? 1 : q.points, explanation: q.explanation || '',
    };
    if (q.type === 'mcq') { base.choices = q.choices; base.correctIndex = q.correctIndex; }
    else if (q.type === 'multi') { base.choices = q.choices; base.correctIndexes = q.correctIndexes || []; }
    else if (q.type === 'short') { base.accepted = q.accepted || []; base.caseSensitive = !!q.caseSensitive; }
    else if (q.type === 'table') { base.table = q.table; }
    else if (q.type === 'simulation') { base.sim = q.sim; base.sub = (q.sub || []).map(outQuestion); }
    return base;
  }

  async function save() {
    syncDraft();
    if (!draft.title.trim()) { toast(t('t.chNeedTitle'), 'bad'); return; }
    if (!draft.lessonId) { toast(t('t.chNeedLevel'), 'bad'); return; }
    const payload = {
      lessonId: draft.lessonId,
      categoryId: draft.categoryId || null,
      title: draft.title,
      description: draft.description,
      icon: draft.icon,
      timeLimit: draft.timeLimit || 0,
      dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
      allowRetake: !!draft.allowRetake,
      published: !!draft.published,
      questions: draft.questions.map(outQuestion),
    };
    try {
      if (draft.id) await API.put('/api/teacher/challenges/' + draft.id, payload);
      else await API.post('/api/teacher/challenges', payload);
      toast(t('t.chSaved'), 'good');
      draft = null;
      mode = 'list';
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* ============================= RESPONSES ============================== */

  async function openResponses(id) {
    try {
      responses = await API.get(`/api/teacher/challenges/${id}/responses`);
      mode = 'responses';
      render();
    } catch (e) { toast(e.message, 'bad'); }
  }

  function paintResponses() {
    const d = responses;
    const cards = d.responses.length ? d.responses.map(responseCard).join('')
      : `<div class="t-card empty">${t('t.chNoResponses')}</div>`;
    const missing = d.missing.length
      ? `<div class="t-card"><h3 style="margin-top:0">${t('t.chMissing', { n: d.missing.length })}</h3>
          <div class="missing-list">${d.missing.map((m) => `<span class="missing-chip">${m.avatar} ${esc(m.name)}</span>`).join('')}</div></div>`
      : '';
    host.innerHTML = `
      <div class="t-head">
        <div><h1>${t('t.chResponsesTitle', { title: esc(d.challenge.title) })}</h1>
          <div class="sub">${t('t.chResponsesSub')}</div></div>
        <button class="tbtn ghost" onclick="TC.backToList()">${t('common.back')}</button>
      </div>
      ${cards}
      ${missing}`;
    d.responses.forEach((r) => updateTotal(r.id));
  }

  function responseCard(r) {
    const items = r.manual.length ? r.manual.map((m, i) => `
      <div class="grade-item" data-qid="${esc(m.questionId)}" data-max="${m.points}">
        <div class="grade-q">${i + 1}. ${esc(m.question)} <span class="grade-qpts">(${t('t.outOf', { n: m.points })})</span></div>
        <div class="grade-ans">${esc(m.answer) || `<span class="grade-blank">${t('t.gradeNoAnswer')}</span>`}</div>
        ${m.guide ? `<div class="grade-guide">💡 ${esc(m.guide)}</div>` : ''}
        <div class="grade-score">
          <label class="t-label" style="margin:0">${t('t.gradeScoreLabel')}</label>
          <input type="number" class="grade-score-input" min="0" max="${m.points}" step="1"
                 value="${m.awarded == null ? 0 : m.awarded}" oninput="TC.updateTotal('${r.id}')">
          <span class="grade-outof">/ ${m.points}</span>
        </div>
      </div>`).join('') : `<div class="sub" style="color:var(--t-soft)">${t('t.chNothingToMark')}</div>`;

    return `
      <div class="t-card grade-card" data-sid="${r.id}" data-auto="${r.autoEarned}" data-max="${r.maxPoints}">
        <div class="grade-head">
          <span class="av">${r.userAvatar}</span>
          <div>
            <div class="grade-name">${esc(r.userName)}</div>
            <div class="sub" style="color:var(--t-soft)">${fmtWhen(r.createdAt)} · ${r.status === 'graded' ? t('t.chGradedTag') : t('t.chPendingTag')}</div>
          </div>
          <span class="grade-auto">${t('t.chAutoScore', { e: r.autoEarned, m: r.maxPoints })}</span>
        </div>
        <div class="grade-items">${items}</div>
        <label class="t-label">${t('t.chFeedback')}</label>
        <input type="text" class="t-input grade-feedback" value="${esc(r.feedback)}" placeholder="${esc(t('t.chFeedbackPh'))}">
        <div class="grade-foot">
          <span class="grade-total" id="ct-${r.id}"></span>
          <button class="tbtn" onclick="TC.saveGrade('${r.id}')">${t('t.chGradeSave')}</button>
        </div>
      </div>`;
  }

  function updateTotal(sid) {
    const card = document.querySelector(`.grade-card[data-sid="${sid}"]`);
    if (!card) return;
    let earned = Number(card.dataset.auto) || 0;
    card.querySelectorAll('.grade-item').forEach((it) => {
      const max = Number(it.dataset.max) || 0;
      let v = parseInt(it.querySelector('.grade-score-input').value, 10);
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > max) v = max;
      earned += v;
    });
    const el = document.getElementById('ct-' + sid);
    if (el) el.textContent = t('t.chManualTotal', { e: earned, m: card.dataset.max });
  }

  async function saveGrade(sid) {
    const card = document.querySelector(`.grade-card[data-sid="${sid}"]`);
    if (!card) return;
    const scores = {};
    card.querySelectorAll('.grade-item').forEach((it) => {
      const max = Number(it.dataset.max) || 0;
      let v = parseInt(it.querySelector('.grade-score-input').value, 10);
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > max) v = max;
      scores[it.dataset.qid] = v;
    });
    const feedback = (card.querySelector('.grade-feedback') || {}).value || '';
    try {
      await API.post(`/api/teacher/challenges/responses/${sid}/grade`, { scores, feedback });
      toast(t('t.chGradedToast'), 'good');
      const cid = responses.challenge.id;
      loaded = false;
      if (typeof reload === 'function') { try { await reload(); } catch { /* ignore */ } }
      await openResponses(cid);
    } catch (e) { toast(e.message, 'bad'); }
  }

  function backToList() { responses = null; mode = 'list'; render(); }

  /* ------------------------------- exports ------------------------------ */

  const api = {
    // list
    newChallenge, edit, move, togglePublish, confirmDelete, doDelete,
    addCat, removeCat, saveCats,
    openAssign, syncAssignUI, saveAssign,
    // editor
    addQuestion, addSub, removeQuestion, setType, addChoice, removeChoice, markCorrect,
    toggleCell, addCol, removeCol, addRow, removeRow,
    setSimMode, toggleSimPreview, removeImage, uploadImage,
    cancelEdit, save,
    // responses
    openResponses, updateTotal, saveGrade, backToList,
  };
  window.TC = api;

  return { render, reset };
})();

// `toLocalInput` (ISO → the value a datetime-local input wants) lives in teacher.js.
