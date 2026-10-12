/**
 * Teacher Console — challenges.
 *
 * There is no Challenges menu item any more: every challenge belongs to one
 * level, so they are listed, created and marked on that level's page
 * (teacher.js renderLevel). This file owns the two screens that open from
 * there — the editor (question builder) and Responses (marking) — plus the
 * row actions (publish, assign, move, delete), the shared category list and a
 * read-only view of a challenge's questions.
 *
 * teacher.js calls:
 *   TChallenges.attach(hostEl, onExit) — once; onExit runs whenever one of
 *                                        these screens closes or the data changes
 *   TChallenges.render(hostEl)         — paint the open screen
 *   TChallenges.reset()                — forget the open screen (nav change)
 * Inline handlers call the exported `TC` object.
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
  let mode = 'none';        // 'none' | 'editor' | 'responses'
  let cats = [];            // working copy of the categories
  let list = [];            // challenge summaries
  let draft = null;         // challenge being edited
  let responses = null;     // { challenge, responses[], missing[] }
  let simPreview = {};      // questionId -> bool (show the live preview?)
  let loaded = false;
  // Where Back, Cancel, Save and the row actions return to: the level page.
  let onExit = null;

  function reset() { mode = 'none'; draft = null; responses = null; loaded = false; }
  function attach(el, fn) { host = el; onExit = fn; }
  /** Close whichever screen is open and hand control back to the level page. */
  function leave() {
    mode = 'none'; draft = null; responses = null; snap = null;
    if (onExit) onExit();
  }
  async function ensureLoaded() { if (!loaded) await load(); }

  /* Unsaved-changes check (see "UNSAVED CHANGES" in teacher.js): the draft as
     it was when the editor opened, taken right after it is first painted so
     both sides have been through the same syncDraft(). */
  let snap = null;
  let snapPending = false;
  function takeSnap() {
    if (!snapPending || !draft) return;
    snapPending = false;
    syncDraft();
    snap = JSON.stringify(draft);
  }
  function isDirty() {
    if (mode !== 'editor' || !draft || !document.getElementById('c-title')) return false;
    syncDraft();
    return JSON.stringify(draft) !== snap;
  }

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
    if (mode === 'editor') { paintEditor(); takeSnap(); return; }
    if (mode === 'responses') return paintResponses();
    leave();
  }

  /** After a row action: reload, then let the level page repaint (and its badges). */
  async function refresh() {
    loaded = false;
    try { await load(); } catch { /* the level page reloads its own copy anyway */ }
    if (onExit) onExit();
  }

  /* =========================== READ-ONLY VIEW ===========================
     A published challenge could only be read by opening its editor (risky:
     one stray keystroke and Save changes what students are answering) or by
     working back from Responses. This lays out every question with its answer
     key, points and rubric, for reading only. teacher.js shows it under the
     challenge's row on the level page. */

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  function detailQuestion(q, label) {
    const type = TYPE_LABEL[q.type] ? TYPE_LABEL[q.type]() : q.type;
    const pts = q.type === 'simulation' ? '' : `<span class="chd-pts">${esc(ptsLabel(q.points == null ? 1 : q.points))}</span>`;
    let body = '';
    if (q.type === 'mcq' || q.type === 'multi') {
      const right = q.type === 'mcq' ? [q.correctIndex] : (q.correctIndexes || []);
      body = `<ul class="chd-choices">${(q.choices || []).map((c, i) => `
        <li class="${right.includes(i) ? 'is-key' : ''}"><b>${LETTERS[i] || i + 1}</b> ${chem(c)}
          ${right.includes(i) ? `<span class="chd-key">${ICON.check(13)} ${esc(t('t.correct'))}</span>` : ''}</li>`).join('')}</ul>`;
    } else if (q.type === 'short') {
      body = `<div class="chd-row"><b>${esc(t('t.chdAccepted'))}</b> ${(q.accepted || []).map((a) => `<span class="chd-ans">${chem(a)}</span>`).join(' ') || '—'}
        ${q.caseSensitive ? `<span class="chd-note">${esc(t('t.chdCase'))}</span>` : ''}</div>`;
    } else if (q.type === 'table') {
      const tb = q.table || { columns: [], rows: [] };
      body = `<div class="chd-tablewrap"><table class="chd-table">
        <thead><tr>${(tb.columns || []).map((c) => `<th>${chem(c)}</th>`).join('')}</tr></thead>
        <tbody>${(tb.rows || []).map((r) => `<tr>${(r.cells || []).map((c) => c.blank
          ? `<td class="is-key">${chem(c.answer || '')}</td>`
          : `<td>${chem(c.text || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="chd-note">${esc(t('t.chdTableKey'))}</div>`;
    } else if (q.type === 'simulation') {
      body = `<div class="chd-note">${ICON.flask(13)} ${esc(t('t.chdSim'))}</div>
        <ol class="chd-sub">${(q.sub || []).map((sq, i) => detailQuestion(sq, String.fromCharCode(97 + i))).join('')}</ol>`;
    }
    if (q.rubric) body += `<div class="chd-row chd-rubric"><b>${esc(t('t.chdRubric'))}</b> ${chem(q.rubric)}</div>`;
    if (q.aiMark) body += `<div class="chd-note">${ICON.chat(13)} ${esc(t('t.chdAiMark'))}</div>`;
    if (q.explanation) body += `<div class="chd-row"><b>${esc(t('t.chdExplain'))}</b> ${chem(q.explanation)}</div>`;
    return `
      <li class="chd-q">
        <div class="chd-head"><span class="chd-n">${esc(label)}</span><span class="chd-type">${esc(type)}</span>${pts}</div>
        <div class="chd-text">${chem(q.question || '')}</div>
        ${q.image ? `<img class="chd-img" src="${esc(q.image)}" alt="">` : ''}
        ${body}
      </li>`;
  }

  /** Every question of one full challenge (as GET /item/:id returns it), read-only. */
  function detailHtml(c) {
    const bits = [];
    if (c.timeLimit) bits.push(t('t.chdTime', { n: Math.round(c.timeLimit / 60) || 1 }));
    if (c.dueAt) bits.push(t('t.chdDue', { when: fmtWhen(c.dueAt) }));
    bits.push(c.allowRetake ? t('t.chdRetake') : t('t.chdOnce'));
    const qs = c.questions || [];
    return `
      ${c.description ? `<p class="chd-desc">${chem(c.description)}</p>` : ''}
      <div class="chd-meta">${bits.map((b) => `<span>${esc(b)}</span>`).join('')}</div>
      ${qs.length ? `<ol class="chd-list">${qs.map((q, i) => detailQuestion(q, String(i + 1))).join('')}</ol>`
        : `<p class="lv-empty">${esc(t('t.chdNoQs'))}</p>`}`;
  }

  /** Fetch one challenge in full (answer keys included — teacher only). */
  async function fetchFull(id) {
    return (await API.get('/api/teacher/challenges/item/' + id)).challenge;
  }

  /** The shared category list, painted into the level page's fold. */
  async function mountCategories() {
    try { await ensureLoaded(); paintCategories(); } catch { /* fold stays empty */ }
  }

  /* ---- categories editor ---- */
  function paintCategories() {
    const rows = cats.length ? cats.map((c, i) => `
      <div class="crit-row">
        <input class="t-input cat-icon" data-i="${i}" value="${esc(c.icon || '📂')}" maxlength="4" style="max-width:70px">
        <input class="t-input cat-name" data-i="${i}" value="${esc(c.name)}" placeholder="${esc(t('t.chCatNamePh'))}" maxlength="60">
        <button class="tbtn danger sm" onclick="TC.removeCat(${i})" aria-label="${t('common.delete')}">${ICON.close(13)}</button>
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
  async function confirmDelete(id) {
    await ensureLoaded();
    const c = list.find((x) => x.id === id);
    if (!c) return;
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
  async function openAssign(id) {
    await ensureLoaded();
    const c = list.find((x) => x.id === id);
    if (!c) return;
    const a = c.assign || { mode: 'all', studentIds: [] };
    const students = typeof STUDENTS !== 'undefined' ? STUDENTS : [];
    const rows = students.length ? students.map((s) => `
      <label class="assign-row">
        <input type="checkbox" class="assign-student" value="${s.id}" ${(a.studentIds || []).includes(s.id) ? 'checked' : ''}>
        <span class="av">${avatarHtml(s.avatar, 24)}</span> ${esc(s.name)}
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
      rubric: '', aiNote: '', aiMark: false, whiteboard: false,
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
    b.rubric = q.rubric || '';
    b.aiNote = q.aiNote || '';
    b.aiMark = !!q.aiMark;
    b.whiteboard = !!q.whiteboard;
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

  /** A new challenge for one level (the level page passes its own id). */
  async function newChallenge(lessonId, withAi) {
    await ensureLoaded();
    const lessons = typeof LESSONS !== 'undefined' ? LESSONS : [];
    draft = {
      id: null, lessonId: lessonId || (lessons.length ? lessons[0].id : ''), categoryId: '',
      title: '', description: '', icon: '🧩', timeLimit: 0, dueAt: '', allowRetake: false,
      published: false, questions: [blankQuestion('mcq')],
    };
    mode = 'editor';
    snapPending = true;
    await render();
    if (withAi) aiGenerate();
  }

  async function edit(id) {
    try {
      await ensureLoaded();
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
      snapPending = true;
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
            <input id="c-title" data-chem class="t-input" value="${esc(draft.title)}" placeholder="${esc(t('t.chTitlePh'))}"></div>
          <div><label class="t-label">${t('t.chIcon')}</label>
            <input id="c-icon" class="t-input" value="${esc(draft.icon)}" maxlength="4"></div>
        </div>
        <div class="field-row">
          <div><label class="t-label">${t('t.chLevel')}</label><select id="c-lesson" class="t-select">${lessonOpts}</select></div>
          <div><label class="t-label">${t('t.chCategory')}</label><select id="c-cat" class="t-select">${catOpts}</select></div>
        </div>
        <label class="t-label">${t('t.chDesc')}</label>
        <textarea id="c-desc" data-chem class="t-area" placeholder="${esc(t('t.chDescPh'))}">${esc(draft.description)}</textarea>
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
          <div class="row" style="gap:8px">
            <button class="tbtn ghost sm" onclick="TC.aiGenerate()">${t('t.aiButton')}</button>
            <button class="tbtn blue sm" onclick="TC.addQuestion()">${t('t.chAddQuestion')}</button>
          </div></div>
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

    /* The teacher writes the answer they expect (แนวคำตอบ) and, if they want,
       an instruction for how to weigh it. Kru CJ compares the student's answer
       to the first and applies the second as policy.

       Offered only on the types the machine cannot mark on its own.
       `src/challenges.js isAiMarkable` makes the same call server-side and is
       the one that counts — an expected answer typed on a question that already
       has an answer key is simply ignored, which the hint says out loud. */
    const RUBRIC_TYPES = ['written', 'short', 'table'];
    const rubricRow = !RUBRIC_TYPES.includes(q.type) ? '' : `
      <label class="t-label">${t('t.chRubric')}</label>
      <div class="t-hint">${t('t.chRubricHint')}</div>
      <textarea class="t-input q-rubric" rows="4" placeholder="${esc(t('t.chRubricPh'))}">${esc(q.rubric || '')}</textarea>
      <label class="t-label">${t('t.chAiNote')}</label>
      <div class="t-hint">${t('t.chAiNoteHint')}</div>
      <textarea class="t-input q-ainote" rows="2" placeholder="${esc(t('t.chAiNotePh'))}">${esc(q.aiNote || '')}</textarea>
      <label class="q-aimark-row">
        <input type="checkbox" class="q-aimark" ${q.aiMark ? 'checked' : ''}>
        <span>${t('t.chAiMark')}</span>
      </label>
      <div class="t-hint">${t('t.chAiMarkHint')}</div>`;

    /* "This question uses the whiteboard": the student gets a scratch board
       and can send their working in for Kru CJ to read for you. */
    const boardRow = q.type === 'simulation' ? '' : `
      <label class="q-aimark-row q-board-row">
        <input type="checkbox" class="q-board" ${q.whiteboard ? 'checked' : ''}>
        <span>${ICON.board(15)} ${t('t.wbToggle')}</span>
      </label>
      <div class="t-hint">${t('t.wbToggleHint')}</div>`;

    return `
      <div class="builder-item qcard ${q.type === 'simulation' ? 'simcard' : ''}" data-qid="${q._id}" data-qtype="${q.type}">
        <div class="builder-head">${parentId ? '↳ ' : ''}${t('t.question', { n: i + 1 })} · ${TYPE_LABEL[q.type]()}</div>
        <button class="tbtn danger sm rm" onclick="TC.removeQuestion('${q._id}')">${ICON.close(13)}</button>
        ${typeTabs}
        <input type="text" class="t-input q-text" value="${esc(q.question)}" placeholder="${esc(t('t.chQuestionPh'))}">
        ${q.type === 'simulation' ? '' : imgRow}
        ${questionBody(q)}
        ${pointsRow}
        ${explainRow}
        ${rubricRow}
        ${boardRow}
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
      case 'written': return `<div class="written-box"><div class="written-hint">${ICON.pen(14)} ${t('t.chLongHint')}</div>
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
          ${q.choices.length > 2 ? `<button class="tbtn ghost sm" onclick="TC.removeChoice('${q._id}',${ci})">${ICON.close(13)}</button>` : ''}
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
        <td class="tb-tools"><button class="tbtn danger sm" onclick="TC.removeRow('${q._id}',${ri})">${ICON.close(13)}</button></td>
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
    const rub = el.querySelector(':scope > .q-rubric');
    if (rub) q.rubric = rub.value;
    const note = el.querySelector(':scope > .q-ainote');
    if (note) q.aiNote = note.value;
    const aim = el.querySelector(':scope > .q-aimark-row .q-aimark');
    if (aim) q.aiMark = aim.checked;
    const wb = el.querySelector(':scope > .q-board-row .q-board');
    if (wb) q.whiteboard = wb.checked;
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
  function cancelEdit() {
    if (!confirmDiscard()) return;
    leave();
  }

  /* Kru CJ writes questions for this challenge, fitted to its level. Like the
     quest and battle editors: they land in the draft, unsaved, and the
     teacher's own Save is the only way they reach a student. Only auto-marked
     types — the writer does not do written or simulation questions. */
  function aiGenerate() {
    syncDraft();
    TAI.open({
      target: 'challenge',
      lessonId: draft.lessonId,
      difficulty: 'medium',
      types: ['mcq', 'multi', 'short', 'table'],
      onInsert: (questions) => {
        syncDraft();
        // The editor opens with one empty question; don't leave it in front.
        draft.questions = draft.questions.filter((q) => !isBlankDraftQuestion(q));
        questions.forEach((q) => draft.questions.push(mapInQuestion(q)));
        render();
      },
    });
  }
  function isBlankDraftQuestion(q) {
    return q.type === 'mcq' && !String(q.question || '').trim()
      && !(q.choices || []).some((c) => String(c || '').trim()) && !q.image;
  }

  /** Strip the editor's private `_id` and send the challenge to the server. */
  function outQuestion(q) {
    const base = {
      id: q._id, type: q.type, question: q.question, image: q.image || '',
      points: q.points == null ? 1 : q.points, explanation: q.explanation || '',
      rubric: q.rubric || '', aiNote: q.aiNote || '', aiMark: !!q.aiMark,
      whiteboard: !!q.whiteboard,
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
      snap = null;
      loaded = false;
      leave();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* ============================= RESPONSES ============================== */
  /* The teacher reads the whole class set here: every question, every student's
     actual answer (not just the score), the outcome, and a box to mark whatever
     the machine could not. The same data exports to CSV. */

  async function openResponses(id) {
    try {
      responses = await API.get(`/api/teacher/challenges/${id}/responses`);
      mode = 'responses';
      render();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* ------------------------------ AI marking ------------------------------ *
   *
   * Kru CJ SUGGESTS, the teacher confirms. Nothing here saves a mark: the
   * suggestion pre-fills the same score box the teacher has always used, and
   * the same "Save marks" button is what makes it real. That is the whole
   * safety design of this feature, and it is why there is no "accept all and
   * save" shortcut — a teacher who never looks is exactly what we are avoiding.
   *
   * One request per student, in sequence. A class set in a single request
   * would be killed by a serverless timeout, and looping here also lets the
   * teacher watch it happen.
   * ----------------------------------------------------------------------- */

  let aiBusy = false;

  /** Papers with at least one rubric-marked answer nobody has confirmed yet. */
  function papersNeedingAi() {
    if (!responses) return [];
    const rubricQs = new Set(responses.challenge.questions.filter((q) => q.aiMark).map((q) => q.id));
    if (!rubricQs.size) return [];
    return responses.responses.filter((r) => r.status !== 'graded'
      && r.answers.some((a) => rubricQs.has(a.questionId) && a.needsMark && a.awarded == null && !a.ai));
  }

  function setAiStatus(msg) {
    const el = document.getElementById('aiStatus');
    if (el) el.textContent = msg || '';
  }

  async function aiMarkAll() {
    if (aiBusy) return;
    const todo = papersNeedingAi();
    if (!todo.length) { toast(t('t.aiNothingToMark'), 'bad'); return; }

    aiBusy = true;
    const btn = document.getElementById('aiMarkBtn');
    if (btn) btn.disabled = true;
    let done = 0, failed = 0;

    for (const r of todo) {
      setAiStatus(t('t.aiMarking', { n: done + 1, total: todo.length, name: r.userName }));
      try {
        await API.post(`/api/teacher/challenges/responses/${r.id}/ai-mark`, { lang: getLang() });
        done++;
      } catch (e) {
        failed++;
        // Stop on the first hard failure rather than burning the allowance on
        // thirty more that will fail the same way.
        setAiStatus('');
        toast(aiError(e.message), 'bad');
        break;
      }
    }

    aiBusy = false;
    setAiStatus('');
    if (done) toast(t('t.aiMarked', { n: done }), 'good');
    // Repaint from the server so the boxes hold what was actually stored.
    await openResponses(responses.challenge.id);
    if (failed && !done) { /* the toast above already said why */ }
  }

  async function buildReport() {
    if (aiBusy) return;
    aiBusy = true;
    const btn = document.getElementById('aiReportBtn');
    if (btn) btn.disabled = true;
    setAiStatus(t('t.aiReporting'));
    try {
      await API.post(`/api/teacher/challenges/${responses.challenge.id}/ai-report`, { lang: getLang() });
      aiBusy = false;
      await openResponses(responses.challenge.id);
      toast(t('t.aiReportDone'), 'good');
    } catch (e) {
      aiBusy = false;
      setAiStatus('');
      if (btn) btn.disabled = false;
      toast(aiError(e.message), 'bad');
    }
  }

  /** The server speaks in codes so both languages can say it properly. */
  function aiError(code) {
    const known = {
      AI_DISABLED: 't.aiDisabled',
      AI_DAILY_LIMIT: 't.aiDailyLimit',
      AI_BUSY: 't.aiBusy',
      AI_BAD_KEY: 't.aiBadKey',
      AI_FAILED: 't.aiFailed',
      NO_RUBRIC_QUESTIONS: 't.aiNoRubricQs',
      NO_SUBMISSIONS: 't.aiNoSubmissions',
    };
    return known[code] ? t(known[code]) : code;
  }

  /** Kru CJ's suggestion under one answer: the criteria, then the comment. */
  function aiBlock(a) {
    if (!a.ai) return '';
    const crit = (a.ai.criteria || []).map((c) => `
      <li class="${c.met ? 'met' : 'unmet'}">${c.met ? ICON.check(13) : ICON.close(13)}<span>${esc(c.name)}</span></li>`).join('');
    return `
      <div class="ai-mark">
        <div class="ai-mark-head">${ICON.chat(14)} ${t('t.aiSuggests', { s: a.ai.score, m: a.ai.outOf })}</div>
        ${crit ? `<ul class="ai-crit">${crit}</ul>` : ''}
        ${a.ai.feedback ? `<div class="ai-fb">${esc(a.ai.feedback)}</div>` : ''}
        ${a.ai.rubricSilent ? `<div class="ai-warn">${t('t.aiRubricSilent')}</div>` : ''}
      </div>`;
  }

  /** What Kru CJ made of one student overall. */
  function diagnosisBlock(r) {
    const d = r.aiDiagnosis;
    if (!d) return '';
    const bullets = (label, items) => !items || !items.length ? '' :
      `<div class="ai-diag-row"><b>${label}</b><span>${items.map(esc).join(' · ')}</span></div>`;
    return `
      <div class="ai-diag level-${esc(d.level)}">
        <div class="ai-diag-head">${t('t.aiDiagnosis')} <span class="ai-level">${t('t.aiLevel.' + d.level)}</span></div>
        <p>${esc(d.summary)}</p>
        ${bullets(t('t.aiStrengths'), d.strengths)}
        ${bullets(t('t.aiGaps'), d.gaps)}
        ${d.nextStep ? `<div class="ai-diag-row"><b>${t('t.aiNextStep')}</b><span>${esc(d.nextStep)}</span></div>` : ''}
      </div>`;
  }

  /** The class report: what to reteach tomorrow. */
  function reportBlock() {
    const R = responses.aiReport;
    if (!R) return '';
    const mis = (R.misconceptions || []).map((m) => `
      <li><span class="ai-count">${m.count}</span>
        <span>${esc(m.what)}${m.example ? ` <i>${esc(m.example)}</i>` : ''}</span></li>`).join('');
    const re = (R.reteach || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const byQ = (R.byQuestion || []).map((b) => {
      const i = responses.challenge.questions.findIndex((q) => q.id === b.questionId);
      return `<li><b>${t('t.chQn', { n: i + 1 })}</b> ${esc(b.note)}</li>`;
    }).join('');
    return `
      <div class="t-card ai-report">
        <h3>${ICON.lines(16)} ${t('t.aiReportTitle')}</h3>
        <div class="sub">${t('t.aiReportMeta', { n: R.submissionCount, when: fmtWhen(R.at) })}</div>
        <p class="ai-report-sum">${esc(R.summary)}</p>
        ${mis ? `<h4>${t('t.aiMisconceptions')}</h4><ul class="ai-mis">${mis}</ul>` : ''}
        ${re ? `<h4>${t('t.aiReteach')}</h4><ul class="ai-reteach">${re}</ul>` : ''}
        ${byQ ? `<h4>${t('t.aiByQuestion')}</h4><ul class="ai-byq">${byQ}</ul>` : ''}
      </div>`;
  }

  /** The AI toolbar above the class set — hidden entirely with no key set. */
  function aiBar() {
    const d = responses;
    const rubricCount = d.challenge.questions.filter((q) => q.aiMark).length;
    if (!rubricCount) return '';
    if (!d.aiEnabled) return `<div class="t-card ai-bar off">${t('t.aiDisabled')}</div>`;
    const todo = papersNeedingAi().length;
    return `
      <div class="t-card ai-bar">
        <div class="ai-bar-text">
          <b>${t('t.aiBarTitle')}</b>
          <span class="sub">${t('t.aiBarSub', { q: rubricCount, n: todo })}</span>
        </div>
        <span class="ai-status" id="aiStatus"></span>
        <button class="tbtn blue" id="aiMarkBtn" onclick="TC.aiMarkAll()" ${todo ? '' : 'disabled'}>
          ${ICON.chat(14)} ${t('t.aiMarkAll')}</button>
        <button class="tbtn ghost" id="aiReportBtn" onclick="TC.buildReport()" ${d.responses.length ? '' : 'disabled'}>
          ${ICON.lines(14)} ${d.aiReport ? t('t.aiReportAgain') : t('t.aiReportBuild')}</button>
      </div>`;
  }

  function paintResponses() {
    const d = responses;
    const toMark = d.responses.filter((r) => r.status !== 'graded').length;
    const cards = d.responses.length ? d.responses.map(responseCard).join('')
      : `<div class="t-card empty">${t('t.chNoResponses')}</div>`;
    const missing = d.missing.length
      ? `<div class="t-card"><h3 style="margin-top:0">${t('t.chMissing', { n: d.missing.length })}</h3>
          <div class="missing-list">${d.missing.map((m) => `<span class="missing-chip">${avatarHtml(m.avatar, 20)} ${esc(m.name)}</span>`).join('')}</div></div>`
      : '';
    host.innerHTML = `
      <div class="t-head">
        <div><h1>${t('t.chResponsesTitle', { title: esc(d.challenge.title) })}</h1>
          <div class="sub">${t('t.chResponsesSub')}</div></div>
        <div class="row" style="gap:8px">
          <button class="tbtn ghost" onclick="TC.backToList()">${t('common.back')}</button>
          <button class="tbtn blue" onclick="TC.downloadCsv()" ${d.responses.length ? '' : 'disabled'}>${t('t.chCsv')}</button>
        </div>
      </div>
      <div class="t-card resp-summary">
        <span>${t('t.chHandedIn', { n: d.responses.length, total: d.assignedCount })}</span>
        <span>${t('t.chToMark', { n: toMark })}</span>
        <span>${t('t.chOutOf', { n: d.challenge.maxPoints })}</span>
      </div>
      ${aiBar()}
      ${reportBlock()}
      ${cards}
      ${missing}`;
    d.responses.forEach((r) => updateTotal(r.id));
  }

  /** The student's answer to one question, rendered for its type. */
  function answerBlock(q, a) {
    if (!a.answered) return `<div class="resp-answer blank">${t('t.chNoAnswer')}</div>`;

    if (q.type === 'table') {
      const cols = (q.table && q.table.columns) || [];
      const rows = (q.table && q.table.rows) || [];
      const given = (a.raw && typeof a.raw === 'object') ? a.raw : {};
      return `
        <div class="resp-table-wrap">
          <table class="resp-table">
            <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((r, ri) => `<tr>${(r.cells || []).map((cell, ci) => {
              if (!cell.blank) return `<td class="fixed">${esc(cell.text)}</td>`;
              const val = given[ri + '_' + ci];
              const key = cell.answer;
              const state = !key ? '' : !val ? 'bad' : norm(val) === norm(key) ? 'good' : 'bad';
              return `<td class="filled ${state}">${val ? esc(val) : '—'}${
                state === 'bad' && key ? `<span class="resp-key">${esc(key)}</span>` : ''}</td>`;
            }).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>`;
    }

    if (q.type === 'written') return `<div class="resp-answer long">${esc(a.text)}</div>`;
    return `<div class="resp-answer">${esc(a.text)}</div>`;
  }

  function norm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); }

  /** Outcome badge (or a score box when only the teacher can mark it). */
  function outcomeBlock(q, a, sid) {
    if (a.needsMark) {
      return `
        <div class="grade-score">
          <label class="t-label" style="margin:0">${t('t.gradeScoreLabel')}</label>
          <input type="number" class="grade-score-input" min="0" max="${q.points}" step="1"
                 value="${a.awarded != null ? a.awarded : (a.ai ? a.ai.score : 0)}"
                 oninput="TC.updateTotal('${sid}')">
          <span class="grade-outof">/ ${q.points}</span>
          ${a.ai && a.awarded == null ? `<span class="ai-chip">${t('t.aiPrefilled')}</span>` : ''}
        </div>`;
    }
    if (!a.auto) return `<span class="resp-tag manual">${t('t.chNotMarked')}</span>`;
    if (a.correct === true) return `<span class="resp-tag good">${t('t.chCorrect')} · ${a.earned}/${a.max}</span>`;
    if (a.earned > 0) return `<span class="resp-tag part">${t('t.chPartial')} · ${a.earned}/${a.max}</span>`;
    return `<span class="resp-tag bad">${t('t.chWrong')} · 0/${a.max}</span>`;
  }

  function responseCard(r) {
    const questions = responses.challenge.questions;
    const items = questions.map((q, i) => {
      const a = r.answers.find((x) => x.questionId === q.id) || { answered: false, auto: false, max: q.points };
      const wrong = a.auto && a.correct !== true && q.expected;
      return `
        <div class="resp-q ${a.needsMark ? 'grade-item' : ''}" ${a.needsMark ? `data-qid="${esc(q.id)}" data-max="${q.points}"` : ''}>
          <div class="resp-q-head">
            <span class="resp-q-n">${t('t.chQn', { n: i + 1 })}</span>
            <span class="resp-q-type">${TYPE_LABEL[q.type] ? TYPE_LABEL[q.type]() : q.type}</span>
            ${q.simTitle ? `<span class="resp-q-sim">${ICON.flask(13)} ${esc(q.simTitle)}</span>` : ''}
            <span class="resp-q-pts">${q.points}</span>
          </div>
          <div class="resp-q-text">${esc(q.question)}</div>
          ${answerBlock(q, a)}
          ${wrong ? `<div class="resp-expected">${t('t.chExpected')}: <b>${esc(q.expected)}</b></div>` : ''}
          ${a.needsMark && q.guide ? `<div class="grade-guide">${ICON.question(13)} ${esc(q.guide)}</div>` : ''}
          ${outcomeBlock(q, a, r.id)}
          ${aiBlock(a)}
        </div>`;
    }).join('');

    return `
      <div class="t-card grade-card" data-sid="${r.id}" data-auto="${r.autoEarned}" data-max="${r.maxPoints}">
        <div class="grade-head">
          <span class="av">${r.userAvatar}</span>
          <div>
            <div class="grade-name">${esc(r.userName)}</div>
            <div class="sub" style="color:var(--t-soft)">${esc(r.userEmail || '')} · ${fmtWhen(r.createdAt)} ·
              ${r.status === 'graded' ? t('t.chGradedTag') : t('t.chPendingTag')}</div>
          </div>
          <span class="grade-auto">${t('t.chAutoScore', { e: r.autoEarned, m: r.maxPoints })}</span>
        </div>
        <div class="resp-list">${items}</div>
        ${diagnosisBlock(r)}
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

  function backToList() { leave(); }

  /* ------------------------------ CSV export ----------------------------- */

  /**
   * One CSV field. Quotes everything (Thai text, commas, newlines all survive)
   * and defuses anything a spreadsheet would treat as a formula.
   */
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /**
   * Download the class set as a spreadsheet: one row per student, one column
   * per question (plus its points), and rows for students who never handed in.
   * Built in the browser so the download carries no token in a URL.
   */
  function downloadCsv() {
    const d = responses;
    const questions = d.challenge.questions;

    const header = [t('t.csvStudent'), t('t.csvEmail'), t('t.csvSubmitted'), t('t.csvStatus'),
      t('t.csvScore'), t('t.csvMax')];
    questions.forEach((q, i) => {
      header.push(`Q${i + 1}. ${q.question}`);
      header.push(`Q${i + 1} ${t('t.csvPts')}`);
    });
    header.push(t('t.csvFeedback'));

    const rows = d.responses.map((r) => {
      const row = [
        r.userName,
        r.userEmail || '',
        fmtWhen(r.createdAt),
        r.status === 'graded' ? t('t.chGradedTag') : t('t.chPendingTag'),
        r.status === 'graded' ? r.earned : r.autoEarned,
        r.maxPoints,
      ];
      questions.forEach((q) => {
        const a = r.answers.find((x) => x.questionId === q.id);
        row.push(a && a.answered ? a.text : '');
        // A part the teacher has not marked yet has no score to report.
        row.push(!a ? '' : a.needsMark && a.awarded == null ? '' : a.earned);
      });
      row.push(r.feedback || '');
      return row;
    });

    // Students who never handed in still get a row, so the sheet covers the class.
    d.missing.forEach((m) => {
      const row = [m.name, m.email || '', '', t('t.csvNotHandedIn'), '', d.challenge.maxPoints];
      questions.forEach(() => { row.push(''); row.push(''); });
      row.push('');
      rows.push(row);
    });

    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    // The BOM makes Excel read it as UTF-8, so Thai answers are not mojibake.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const name = (d.challenge.title || 'challenge').replace(/[^\w฀-๿ .-]+/g, '_').slice(0, 60);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name} - responses.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('t.chCsvDone'), 'good');
  }

  /* ------------------------------- exports ------------------------------ */

  const api = {
    // list
    newChallenge, edit, move, togglePublish, confirmDelete, doDelete, aiGenerate,
    addCat, removeCat, saveCats,
    openAssign, syncAssignUI, saveAssign,
    // editor
    addQuestion, addSub, removeQuestion, setType, addChoice, removeChoice, markCorrect,
    toggleCell, addCol, removeCol, addRow, removeRow,
    setSimMode, toggleSimPreview, removeImage, uploadImage,
    cancelEdit, save,
    // responses
    openResponses, updateTotal, saveGrade, backToList, downloadCsv,
    // AI marking
    aiMarkAll, buildReport,
  };
  window.TC = api;

  return { render, reset, attach, isDirty, detailHtml, fetchFull, mountCategories, ensureLoaded };
})();

// `toLocalInput` (ISO → the value a datetime-local input wants) lives in teacher.js.
