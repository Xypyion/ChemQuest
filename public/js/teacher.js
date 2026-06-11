// Teacher Console: manage lessons (storyboard, pre-test + separately-built
// post-test with an open/close gate, timers), the per-level assignment board,
// and students (incl. password reset).

const me = guard('teacher');
if (me) document.getElementById('teacherName').textContent = me.name;
mountLangSwitch(document.getElementById('langHost'));

const MOODS = ['happy', 'excited', 'thinking', 'wave', 'cheer', 'sad'];
const TERRAINS = ['plain', 'mountain', 'snow'];
const DIFFS = ['easy', 'medium', 'hard'];
const MAX_IMG_BYTES = 800 * 1024;

let LESSONS = [];
let STUDENTS = [];
let view = 'lessons';
let draft = null;
let curDiff = { pre: 'easy', post: 'easy' }; // active difficulty tab per quiz zone
let boardLessonId = null;                    // lesson whose assignment board is open

const viewEl = document.getElementById('view');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'q' + Math.random().toString(36).slice(2));
const esc = (s) => escapeHtml(s);

init();
async function init() {
  try { await reload(); render(); }
  catch (e) { viewEl.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`; }
}
async function reload() {
  LESSONS = (await API.get('/api/teacher/lessons')).lessons;
  STUDENTS = (await API.get('/api/teacher/students')).students;
}
function setView(v) {
  view = v; draft = null; boardLessonId = null;
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  document.getElementById('side').classList.remove('open');
  render();
}
function openStudentView() { window.open('/', '_blank'); }
function render() {
  if (draft) return renderEditor();
  if (boardLessonId) return renderBoard();
  if (view === 'students') return renderStudents();
  return renderLessons();
}

/* ============================ LESSONS LIST ============================ */
function renderLessons() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'lessons'));
  const rows = LESSONS.length ? LESSONS.map((l, i) => {
    const qCount = DIFFS.reduce((n, d) => n + ((l.quizzes && l.quizzes[d]) || []).length, 0);
    const pt = l.postTest || {};
    const ptCount = DIFFS.reduce((n, d) => n + ((pt.quizzes && pt.quizzes[d]) || []).length, 0);
    const lines = (l.storyboard || []).filter((s) => s.type !== 'video').length;
    const vids = (l.storyboard || []).filter((s) => s.type === 'video').length;
    return `
    <div class="lesson-row">
      <div class="ico">${esc(l.icon || '🧪')}</div>
      <div class="info">
        <div class="t">${i + 1}. ${esc(l.title)} <span class="terr ${l.terrain}">${l.terrain}</span></div>
        <div class="d">📖 ${lines} ${t('t.lines')} · 🎬 ${vids} · ❓ ${qCount} ${t('t.questions')} · 🧾 ${ptCount} · ${l.timeLimit ? '⏱ ' + l.timeLimit + 's' : t('t.noTimer')}</div>
      </div>
      <div class="acts">
        <button class="tbtn ${pt.open ? 'green' : 'ghost'} sm" onclick="togglePostTest('${l.id}', ${pt.open ? 'false' : 'true'})"
                title="${pt.open ? t('t.closePostTest') : t('t.openPostTest')}">
          ${pt.open ? '🔓 ' + t('t.postTestShort') + ': ' + t('t.open') : '🔒 ' + t('t.postTestShort')}
        </button>
        <button class="tbtn indigo sm" onclick="openBoard('${l.id}')">${t('t.board')}</button>
        <button class="tbtn ghost sm" onclick="moveLesson('${l.id}','up')" title="${t('t.moveUp')}">↑</button>
        <button class="tbtn ghost sm" onclick="moveLesson('${l.id}','down')" title="${t('t.moveDown')}">↓</button>
        <button class="tbtn blue sm" onclick="editLesson('${l.id}')">${t('t.edit')}</button>
        <button class="tbtn danger sm" onclick="confirmDeleteLesson('${l.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') : `<div class="empty">${t('t.noLevels')}</div>`;

  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${t('t.lessonsTitle')}</h1><div class="sub">${t('t.lessonsSub')}</div></div>
      <button class="tbtn" onclick="newLesson()">${t('t.newLevel')}</button>
    </div>
    <div class="t-card">${rows}</div>`;
}
async function moveLesson(id, direction) {
  try { await API.post(`/api/teacher/lessons/${id}/move`, { direction }); await reload(); render(); }
  catch (e) { toast(e.message, 'bad'); }
}
async function togglePostTest(id, open) {
  try {
    const r = await API.post(`/api/teacher/lessons/${id}/posttest-open`, { open });
    toast(r.open ? t('t.postTestNowOpen') : t('t.postTestNowClosed'), 'good');
    await reload(); render();
  } catch (e) { toast(e.message, 'bad'); }
}
function confirmDeleteLesson(id) {
  const l = LESSONS.find((x) => x.id === id);
  openModal(`<h3>${t('t.deleteLevelQ')}</h3><p>${t('t.deleteLevelMsg', { title: esc(l.title) })}</p>
    <div class="editor-actions" style="border:none;padding:0">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn danger" onclick="doDeleteLesson('${id}')">${t('common.delete')}</button></div>`);
}
async function doDeleteLesson(id) {
  try { await API.del('/api/teacher/lessons/' + id); closeModal(); await reload(); render(); toast(t('t.levelDeleted'), 'good'); }
  catch (e) { toast(e.message, 'bad'); }
}

/* ====================== ASSIGNMENT BOARD (teacher view) ====================== */
function openBoard(id) { boardLessonId = id; render(); }
function renderBoard() {
  const l = LESSONS.find((x) => x.id === boardLessonId);
  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${t('t.boardFor', { title: esc(l ? l.title : '') })}</h1><div class="sub">${t('t.boardSub')}</div></div>
      <button class="tbtn ghost" onclick="setView('lessons')">${t('common.back')}</button>
    </div>
    <div id="tFeed"></div>`;
  Feed.mount(document.getElementById('tFeed'), boardLessonId, { teacher: true });
}

/* ============================ LESSON EDITOR ============================ */
function blankQuestion() { return { _id: uid(), question: '', choices: ['', ''], correctIndex: 0, explanation: '' }; }
function blankLine() { return { type: 'line', character: 'Ruby', mood: 'happy', text: '', image: '' }; }
function blankVideo() { return { type: 'video', url: '', title: '' }; }

function newLesson() {
  draft = {
    id: null, title: '', description: '', terrain: 'plain', icon: '🧪', timeLimit: 0,
    storyboard: [{ type: 'line', character: 'Ruby', mood: 'wave', text: '', image: '' }],
    quizzes: { easy: [blankQuestion()], medium: [], hard: [] },
    postTest: { open: false, timeLimit: 0, quizzes: { easy: [], medium: [], hard: [] } },
  };
  curDiff = { pre: 'easy', post: 'easy' };
  render();
}
async function editLesson(id) {
  try {
    const { lesson } = await API.get('/api/teacher/lessons/' + id);
    const pt = lesson.postTest || {};
    draft = {
      id: lesson.id, title: lesson.title, description: lesson.description || '',
      terrain: lesson.terrain || 'plain', icon: lesson.icon || '🧪', order: lesson.order,
      timeLimit: lesson.timeLimit || 0,
      storyboard: (lesson.storyboard || []).map((it) => it.type === 'video'
        ? { type: 'video', url: it.url || '', title: it.title || '' }
        : { type: 'line', character: it.character || 'Ruby', mood: it.mood || 'happy', text: it.text || '', image: it.image || '' }),
      quizzes: {
        easy: mapInQ(lesson.quizzes && lesson.quizzes.easy),
        medium: mapInQ(lesson.quizzes && lesson.quizzes.medium),
        hard: mapInQ(lesson.quizzes && lesson.quizzes.hard),
      },
      postTest: {
        open: !!pt.open,
        timeLimit: pt.timeLimit || 0,
        quizzes: {
          easy: mapInQ(pt.quizzes && pt.quizzes.easy),
          medium: mapInQ(pt.quizzes && pt.quizzes.medium),
          hard: mapInQ(pt.quizzes && pt.quizzes.hard),
        },
      },
    };
    if (!draft.storyboard.length) draft.storyboard = [blankLine()];
    curDiff = { pre: 'easy', post: 'easy' };
    render();
  } catch (e) { toast(e.message, 'bad'); }
}
function mapInQ(arr) {
  return (arr || []).map((q) => ({ _id: q.id || uid(), question: q.question || '', choices: (q.choices || ['', '']).slice(), correctIndex: q.correctIndex || 0, explanation: q.explanation || '' }));
}

function zoneQuizzes(zone) { return zone === 'post' ? draft.postTest.quizzes : draft.quizzes; }

function renderQuizSection(zone) {
  const d = draft;
  const quizzes = zoneQuizzes(zone);
  const diff = curDiff[zone];
  const timeVal = zone === 'post' ? (d.postTest.timeLimit || 0) : (d.timeLimit || 0);
  const tabs = DIFFS.map((dd) =>
    `<button class="${dd === diff ? 'active' : ''}" onclick="switchDiff('${zone}','${dd}')">${dd}<span class="cnt">${quizzes[dd].length}</span></button>`).join('');
  const questions = quizzes[diff].map((q, i) => renderQuestionCard(q, i, zone)).join('') ||
    `<p class="sub" style="color:var(--t-soft)">${t('t.noQuestions', { diff })}</p>`;
  const openToggle = zone === 'post' && d.id ? `
    <button class="tbtn ${d.postTest.open ? 'green' : 'ghost'} sm" style="margin-bottom:8px"
            onclick="togglePostTestFromEditor()">
      ${d.postTest.open ? '🔓 ' + t('t.postTestShort') + ': ' + t('t.open') + ' — ' + t('t.closePostTest') : t('t.openPostTest')}
    </button>` : '';

  return `
    <div class="t-card">
      <h3 style="margin-top:0">${zone === 'post' ? t('t.postTest') : t('t.preTest')}</h3>
      ${zone === 'post' ? `<div class="sub" style="color:var(--t-soft);margin-bottom:6px">${t('t.postTestHint')}</div>${openToggle}` : ''}
      <label class="t-label">${t('t.timerLabel')}</label>
      <input id="f-timelimit-${zone}" class="t-input" type="number" min="0" max="3600" value="${timeVal}" style="max-width:240px">
      <div class="sub" style="color:var(--t-soft);margin:10px 0 4px">${t('t.diffHint')}</div>
      <div class="diff-tabs">${tabs}</div>
      <div id="quizList-${zone}">${questions}</div>
      <button class="tbtn blue sm" style="margin-top:12px" onclick="addQuestion('${zone}')">${t('t.addQuestion')}</button>
    </div>`;
}

function renderEditor() {
  const d = draft;
  const moodOpts = (sel) => MOODS.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${m}</option>`).join('');
  const terrainOpts = TERRAINS.map((tr) => `<option value="${tr}" ${tr === d.terrain ? 'selected' : ''}>${tr}</option>`).join('');

  const story = d.storyboard.map((it, i) => renderStoryItem(it, i, d.storyboard.length, moodOpts)).join('');

  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${d.id ? t('t.editLevel') : t('t.newLevel')}</h1><div class="sub">${t('t.editorSub')}</div></div>
      <button class="tbtn ghost" onclick="cancelEdit()">${t('common.back')}</button>
    </div>

    <div class="t-card">
      <h3 style="margin-top:0">${t('t.basics')}</h3>
      <div class="field-row">
        <div><label class="t-label">${t('t.title')}</label><input id="f-title" class="t-input" value="${esc(d.title)}" placeholder="${esc(t('t.titlePh'))}"></div>
        <div><label class="t-label">${t('t.icon')}</label><input id="f-icon" class="t-input" value="${esc(d.icon)}" maxlength="4"></div>
        <div><label class="t-label">${t('t.terrain')}</label><select id="f-terrain" class="t-select">${terrainOpts}</select></div>
      </div>
      <label class="t-label">${t('t.shortDesc')}</label>
      <input id="f-desc" class="t-input" value="${esc(d.description)}" placeholder="${esc(t('t.shortDescPh'))}">
    </div>

    <div class="t-card">
      <div class="t-head" style="margin:0 0 4px"><h3 style="margin:0">${t('t.storyboard')}</h3>
        <div class="row" style="gap:8px">
          <button class="tbtn blue sm" onclick="addLine()">${t('t.addLine')}</button>
          <button class="tbtn indigo sm" onclick="addVideo()">${t('t.addVideo')}</button>
        </div></div>
      <div class="sub" style="color:var(--t-soft);margin-bottom:4px">${t('t.sbHint')}</div>
      <div id="sbList">${story}</div>
    </div>

    ${renderQuizSection('pre')}
    ${renderQuizSection('post')}

    <div class="editor-actions">
      <button class="tbtn ghost" onclick="cancelEdit()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="saveLesson()">${t('t.saveLevel')}</button>
    </div>`;
}

function renderStoryItem(it, i, total, moodOpts) {
  const reorder = `
    <div class="sb-reorder">
      <button class="tbtn ghost sm" onclick="moveStoryItem(${i},'up')" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="tbtn ghost sm" onclick="moveStoryItem(${i},'down')" ${i === total - 1 ? 'disabled' : ''}>↓</button>
      <button class="tbtn danger sm" onclick="removeStoryItem(${i})">✕</button>
    </div>`;

  if (it.type === 'video') {
    return `
    <div class="builder-item video" data-sb data-type="video">
      <div class="builder-head">${t('t.stepVideo', { n: i + 1 })}</div>${reorder}
      <label class="t-label">${t('t.videoTitle')}</label><input class="t-input vd-title" value="${esc(it.title)}" placeholder="e.g. States of Matter">
      <label class="t-label">${t('t.videoUrl')}</label><input class="t-input vd-url" value="${esc(it.url)}" placeholder="https://www.youtube.com/watch?v=...">
    </div>`;
  }

  const isData = (it.image || '').startsWith('data:');
  const preview = it.image
    ? `<div class="sb-img-preview"><img src="${esc(it.image)}" alt="preview"><button class="tbtn danger sm" onclick="removeLineImage(${i})">${t('t.removeImage')}</button></div>` : '';
  return `
    <div class="builder-item" data-sb data-type="line">
      <div class="builder-head">${t('t.stepLine', { n: i + 1 })}</div>${reorder}
      <div class="field-row">
        <div><label class="t-label">${t('t.character')}</label><input class="t-input sb-char" value="${esc(it.character)}"></div>
        <div><label class="t-label">${t('t.mood')}</label><select class="t-select sb-mood">${moodOpts(it.mood)}</select></div>
      </div>
      <label class="t-label">${t('t.says')}</label>
      <textarea class="t-area sb-text" placeholder="${esc(t('t.saysPh'))}">${esc(it.text)}</textarea>
      <label class="t-label">${t('t.image')}</label>
      ${preview}
      <input type="hidden" class="sb-image-data" value="${esc(it.image)}">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input class="t-input sb-image-url" style="flex:1;min-width:160px" value="${isData ? '' : esc(it.image)}" placeholder="${esc(t('t.imageUrlPh'))}">
        <label class="tbtn ghost sm" style="cursor:pointer">${t('t.upload')}<input type="file" accept="image/*" style="display:none" onchange="uploadLineImage(${i}, this)"></label>
      </div>
    </div>`;
}

function renderQuestionCard(q, i, zone) {
  const choices = q.choices.map((c, ci) => `
    <div class="choice-row ${ci === q.correctIndex ? 'is-correct' : ''}">
      <input type="radio" class="q-correct" name="correct-${zone}-${q._id}" value="${ci}" ${ci === q.correctIndex ? 'checked' : ''} onchange="markCorrect(this)">
      <input type="text" class="q-choice" value="${esc(c)}" placeholder="${esc(t('t.choicePh', { n: ci + 1 }))}">
      <span class="correct-wrap">${ci === q.correctIndex ? t('t.correct') : ''}</span>
      ${q.choices.length > 2 ? `<button class="tbtn ghost sm" onclick="removeChoice('${zone}','${q._id}',${ci})">✕</button>` : ''}
    </div>`).join('');
  return `
    <div class="builder-item qcard" data-qid="${q._id}">
      <div class="builder-head">${t('t.question', { n: i + 1 })}</div>
      <button class="tbtn danger sm rm" onclick="removeQuestion('${zone}','${q._id}')">✕</button>
      <input type="text" class="t-input q-text" value="${esc(q.question)}" placeholder="${esc(t('t.questionPh'))}">
      <div class="choices" style="margin-top:6px">${choices}</div>
      <button class="tbtn ghost sm" style="margin-top:8px" onclick="addChoice('${zone}','${q._id}')">${t('t.addChoice')}</button>
      <label class="t-label">${t('t.explanation')}</label>
      <input type="text" class="t-input q-explain" value="${esc(q.explanation)}" placeholder="${esc(t('t.explanationPh'))}">
    </div>`;
}

/* ---- editor state sync ---- */
function readQuizList(zone) {
  const ql = document.getElementById('quizList-' + zone);
  if (!ql) return;
  zoneQuizzes(zone)[curDiff[zone]] = [...ql.querySelectorAll('.qcard')].map((cardEl) => {
    const cs = [...cardEl.querySelectorAll('.q-choice')].map((i) => i.value);
    const correct = cardEl.querySelector('.q-correct:checked');
    return { _id: cardEl.dataset.qid, question: cardEl.querySelector('.q-text').value, choices: cs, correctIndex: correct ? Number(correct.value) : 0, explanation: cardEl.querySelector('.q-explain').value };
  });
}

function syncDraft() {
  if (!draft) return;
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (document.getElementById('f-title')) {
    draft.title = g('f-title'); draft.icon = g('f-icon'); draft.terrain = g('f-terrain'); draft.description = g('f-desc');
    let tl = parseInt(g('f-timelimit-pre'), 10); draft.timeLimit = Number.isFinite(tl) && tl > 0 ? Math.min(tl, 3600) : 0;
    let tp = parseInt(g('f-timelimit-post'), 10); draft.postTest.timeLimit = Number.isFinite(tp) && tp > 0 ? Math.min(tp, 3600) : 0;
  }
  const sb = document.getElementById('sbList');
  if (sb) {
    draft.storyboard = [...sb.querySelectorAll('[data-sb]')].map((r) => {
      if (r.dataset.type === 'video') {
        return { type: 'video', url: r.querySelector('.vd-url').value, title: r.querySelector('.vd-title').value };
      }
      const typed = (r.querySelector('.sb-image-url').value || '').trim();
      const data = r.querySelector('.sb-image-data').value || '';
      return {
        type: 'line',
        character: r.querySelector('.sb-char').value,
        mood: r.querySelector('.sb-mood').value,
        text: r.querySelector('.sb-text').value,
        image: typed || (data.startsWith('data:') ? data : ''),
      };
    });
  }
  readQuizList('pre');
  readQuizList('post');
}

function markCorrect(radio) {
  const cardEl = radio.closest('.qcard');
  cardEl.querySelectorAll('.choice-row').forEach((row) => {
    const isC = row.querySelector('.q-correct').checked;
    row.classList.toggle('is-correct', isC);
    row.querySelector('.correct-wrap').textContent = isC ? t('t.correct') : '';
  });
}

/* storyboard handlers */
function addLine() { syncDraft(); draft.storyboard.push(blankLine()); render(); }
function addVideo() { syncDraft(); draft.storyboard.push(blankVideo()); render(); }
function removeStoryItem(i) { syncDraft(); draft.storyboard.splice(i, 1); if (!draft.storyboard.length) draft.storyboard.push(blankLine()); render(); }
function moveStoryItem(i, dir) {
  syncDraft();
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= draft.storyboard.length) return;
  const a = draft.storyboard; [a[i], a[j]] = [a[j], a[i]]; render();
}
function removeLineImage(i) { syncDraft(); draft.storyboard[i].image = ''; render(); }
function uploadLineImage(i, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > MAX_IMG_BYTES) { toast(t('t.imgTooBig'), 'bad'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => { syncDraft(); draft.storyboard[i].image = reader.result; render(); toast(t('t.imgAdded'), 'good'); };
  reader.onerror = () => toast('Could not read that file.', 'bad');
  reader.readAsDataURL(file);
}

/* quiz handlers (zone = 'pre' | 'post') */
function switchDiff(zone, d) { syncDraft(); curDiff[zone] = d; render(); }
function addQuestion(zone) { syncDraft(); zoneQuizzes(zone)[curDiff[zone]].push(blankQuestion()); render(); }
function removeQuestion(zone, qid) { syncDraft(); const z = zoneQuizzes(zone); z[curDiff[zone]] = z[curDiff[zone]].filter((q) => q._id !== qid); render(); }
function addChoice(zone, qid) { syncDraft(); const q = zoneQuizzes(zone)[curDiff[zone]].find((x) => x._id === qid); if (q && q.choices.length < 6) q.choices.push(''); render(); }
function removeChoice(zone, qid, idx) {
  syncDraft();
  const q = zoneQuizzes(zone)[curDiff[zone]].find((x) => x._id === qid);
  if (q && q.choices.length > 2) { q.choices.splice(idx, 1); if (q.correctIndex >= q.choices.length) q.correctIndex = 0; }
  render();
}
function cancelEdit() { draft = null; render(); }

async function togglePostTestFromEditor() {
  if (!draft || !draft.id) return;
  syncDraft();
  try {
    const r = await API.post(`/api/teacher/lessons/${draft.id}/posttest-open`, { open: !draft.postTest.open });
    draft.postTest.open = r.open;
    toast(r.open ? t('t.postTestNowOpen') : t('t.postTestNowClosed'), 'good');
    render();
  } catch (e) { toast(e.message, 'bad'); }
}

async function saveLesson() {
  syncDraft();
  if (!draft.title.trim()) { toast(t('t.needTitle'), 'bad'); return; }
  const mapQ = (arr) => arr
    .filter((q) => q.question.trim() && q.choices.filter((c) => c.trim()).length >= 2)
    .map((q) => ({ id: q._id, question: q.question, choices: q.choices, correctIndex: q.correctIndex, explanation: q.explanation }));
  const payload = {
    title: draft.title, description: draft.description, terrain: draft.terrain, icon: draft.icon,
    timeLimit: draft.timeLimit || 0,
    storyboard: draft.storyboard.filter((it) => it.type === 'video' ? it.url.trim() : (it.text.trim() || it.image)),
    quizzes: { easy: mapQ(draft.quizzes.easy), medium: mapQ(draft.quizzes.medium), hard: mapQ(draft.quizzes.hard) },
    postTest: {
      timeLimit: draft.postTest.timeLimit || 0,
      quizzes: { easy: mapQ(draft.postTest.quizzes.easy), medium: mapQ(draft.postTest.quizzes.medium), hard: mapQ(draft.postTest.quizzes.hard) },
    },
  };
  if (draft.order !== undefined) payload.order = draft.order;
  try {
    if (draft.id) await API.put('/api/teacher/lessons/' + draft.id, payload);
    else await API.post('/api/teacher/lessons', payload);
    toast(t('t.levelSaved'), 'good');
    draft = null; await reload(); render();
  } catch (e) { toast(e.message, 'bad'); }
}

/* ============================ STUDENTS ============================ */
function renderStudents() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'students'));
  const rows = STUDENTS.length ? STUDENTS.map((s) => `
    <tr>
      <td><span class="av">${s.avatar || '🧑‍🎓'}</span></td>
      <td><b>${esc(s.name)}</b></td>
      <td class="sub" style="color:var(--t-soft)">${esc(s.email)}</td>
      <td><span class="t-pill ${s.difficulty}">${(s.difficulty || '').toUpperCase()}</span></td>
      <td>${s.levelsCompleted}</td>
      <td>${s.certificates} 🎖️</td>
      <td><b>${s.points}</b></td>
      <td style="white-space:nowrap">
        <button class="tbtn blue sm" onclick='editStudent("${s.id}")'>✏️</button>
        <button class="tbtn ghost sm" onclick='resetPassword("${s.id}")' title="${t('t.resetPw')}">🔑</button>
        <button class="tbtn danger sm" onclick='confirmDeleteStudent("${s.id}")'>🗑</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="8" class="empty">${t('t.noStudents')}</td></tr>`;

  viewEl.innerHTML = `
    <div class="t-head"><div><h1>${t('t.studentsTitle')}</h1><div class="sub">${t('t.studentsSub', { n: STUDENTS.length, s: STUDENTS.length === 1 ? '' : 's' })}</div></div></div>
    <div class="t-card" style="overflow-x:auto">
      <table class="t-table">
        <thead><tr><th></th><th>${t('t.thName')}</th><th>${t('t.thEmail')}</th><th>${t('t.thDiff')}</th><th>${t('t.thLevels')}</th><th>${t('t.thCerts')}</th><th>${t('t.thPoints')}</th><th>${t('t.thActions')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function editStudent(id) {
  const s = STUDENTS.find((x) => x.id === id);
  openModal(`<h3>${t('t.editStudent')}</h3>
    <label class="t-label">${t('t.name')}</label><input id="es-name" class="t-input" value="${esc(s.name)}">
    <label class="t-label">${t('t.difficulty')}</label>
    <select id="es-diff" class="t-select">${DIFFS.map((d) => `<option value="${d}" ${d === s.difficulty ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <label class="t-label">${t('t.points')}</label>
    <input id="es-points" class="t-input" type="number" min="0" value="${s.points}">
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="saveStudent('${id}')">${t('common.save')}</button></div>`);
}
async function saveStudent(id) {
  const body = {
    name: document.getElementById('es-name').value,
    difficulty: document.getElementById('es-diff').value,
    points: Number(document.getElementById('es-points').value),
  };
  try { await API.put('/api/teacher/students/' + id, body); closeModal(); await reload(); render(); toast(t('t.studentUpdated'), 'good'); }
  catch (e) { toast(e.message, 'bad'); }
}

/* ---- password reset ---- */
function resetPassword(id) {
  const s = STUDENTS.find((x) => x.id === id);
  openModal(`<h3>${t('t.resetPwFor', { name: esc(s.name) })}</h3>
    <label class="t-label">${t('t.newPw')}</label>
    <input id="rp-pass" class="t-input" type="text" placeholder="${esc(t('t.newPwPh'))}" minlength="6" autocomplete="off">
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="doResetPassword('${id}')">${t('t.resetPw')}</button></div>`);
  setTimeout(() => { const el = document.getElementById('rp-pass'); if (el) el.focus(); }, 50);
}
async function doResetPassword(id) {
  const s = STUDENTS.find((x) => x.id === id);
  const password = document.getElementById('rp-pass').value;
  try {
    await API.post(`/api/teacher/students/${id}/password`, { password });
    closeModal();
    toast(t('t.pwResetDone', { name: s ? s.name : '' }), 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

function confirmDeleteStudent(id) {
  const s = STUDENTS.find((x) => x.id === id);
  openModal(`<h3>${t('t.deleteStudentQ')}</h3><p>${t('t.deleteStudentMsg', { name: esc(s.name) })}</p>
    <div class="editor-actions" style="border:none;padding:0">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn danger" onclick="doDeleteStudent('${id}')">${t('common.delete')}</button></div>`);
}
async function doDeleteStudent(id) {
  try { await API.del('/api/teacher/students/' + id); closeModal(); await reload(); render(); toast(t('t.studentDeleted'), 'good'); }
  catch (e) { toast(e.message, 'bad'); }
}

/* ============================ MODAL ============================ */
function openModal(html) {
  document.getElementById('modalHost').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { document.getElementById('modalHost').innerHTML = ''; }
