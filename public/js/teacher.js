// Teacher Console: manage lessons (ordered storyboard of lines + inline videos,
// per-line images, per-difficulty quizzes, quiz timer) and students.

const me = guard('teacher');
if (me) document.getElementById('teacherName').textContent = me.name;

const MOODS = ['happy', 'excited', 'thinking', 'wave', 'cheer', 'sad'];
const TERRAINS = ['plain', 'mountain', 'snow'];
const DIFFS = ['easy', 'medium', 'hard'];
const MAX_IMG_BYTES = 800 * 1024;

let LESSONS = [];
let STUDENTS = [];
let view = 'lessons';
let draft = null;
let currentDiff = 'easy';

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
  view = v; draft = null;
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  document.getElementById('side').classList.remove('open');
  render();
}
function openStudentView() { window.open('/', '_blank'); }
function render() {
  if (draft) return renderEditor();
  if (view === 'students') return renderStudents();
  return renderLessons();
}

/* ============================ LESSONS LIST ============================ */
function renderLessons() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'lessons'));
  const rows = LESSONS.length ? LESSONS.map((l, i) => {
    const qCount = DIFFS.reduce((n, d) => n + ((l.quizzes && l.quizzes[d]) || []).length, 0);
    const lines = (l.storyboard || []).filter((s) => s.type !== 'video').length;
    const vids = (l.storyboard || []).filter((s) => s.type === 'video').length;
    return `
    <div class="lesson-row">
      <div class="ico">${esc(l.icon || '🧪')}</div>
      <div class="info">
        <div class="t">${i + 1}. ${esc(l.title)} <span class="terr ${l.terrain}">${l.terrain}</span></div>
        <div class="d">📖 ${lines} lines · 🎬 ${vids} · ❓ ${qCount} questions · ${l.timeLimit ? '⏱ ' + l.timeLimit + 's' : 'no timer'}</div>
      </div>
      <div class="acts">
        <button class="tbtn ghost sm" onclick="moveLesson('${l.id}','up')" title="Move up">↑</button>
        <button class="tbtn ghost sm" onclick="moveLesson('${l.id}','down')" title="Move down">↓</button>
        <button class="tbtn blue sm" onclick="editLesson('${l.id}')">✏️ Edit</button>
        <button class="tbtn danger sm" onclick="confirmDeleteLesson('${l.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') : `<div class="empty">No levels yet. Create your first one!</div>`;

  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>📚 Lessons &amp; Levels</h1><div class="sub">Build the adventure — each level is one stop on the student map.</div></div>
      <button class="tbtn" onclick="newLesson()">＋ New Level</button>
    </div>
    <div class="t-card">${rows}</div>`;
}
async function moveLesson(id, direction) {
  try { await API.post(`/api/teacher/lessons/${id}/move`, { direction }); await reload(); render(); }
  catch (e) { toast(e.message, 'bad'); }
}
function confirmDeleteLesson(id) {
  const l = LESSONS.find((x) => x.id === id);
  openModal(`<h3>Delete level?</h3><p>Delete <b>${esc(l.title)}</b>? This cannot be undone.</p>
    <div class="editor-actions" style="border:none;padding:0">
      <button class="tbtn ghost" onclick="closeModal()">Cancel</button>
      <button class="tbtn danger" onclick="doDeleteLesson('${id}')">Delete</button></div>`);
}
async function doDeleteLesson(id) {
  try { await API.del('/api/teacher/lessons/' + id); closeModal(); await reload(); render(); toast('Level deleted', 'good'); }
  catch (e) { toast(e.message, 'bad'); }
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
  };
  currentDiff = 'easy';
  render();
}
async function editLesson(id) {
  try {
    const { lesson } = await API.get('/api/teacher/lessons/' + id);
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
    };
    if (!draft.storyboard.length) draft.storyboard = [blankLine()];
    currentDiff = 'easy';
    render();
  } catch (e) { toast(e.message, 'bad'); }
}
function mapInQ(arr) {
  return (arr || []).map((q) => ({ _id: q.id || uid(), question: q.question || '', choices: (q.choices || ['', '']).slice(), correctIndex: q.correctIndex || 0, explanation: q.explanation || '' }));
}

function renderEditor() {
  const d = draft;
  const moodOpts = (sel) => MOODS.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${m}</option>`).join('');
  const terrainOpts = TERRAINS.map((t) => `<option value="${t}" ${t === d.terrain ? 'selected' : ''}>${t}</option>`).join('');

  const story = d.storyboard.map((it, i) => renderStoryItem(it, i, d.storyboard.length, moodOpts)).join('');

  const quizCounts = DIFFS.map((dd) => `<button class="${dd === currentDiff ? 'active' : ''}" onclick="switchDiff('${dd}')">${dd}<span class="cnt">${d.quizzes[dd].length}</span></button>`).join('');
  const questions = d.quizzes[currentDiff].map((q, i) => renderQuestionCard(q, i)).join('') ||
    `<p class="sub" style="color:var(--t-soft)">No questions for <b>${currentDiff}</b> yet. Add one below.</p>`;

  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${d.id ? '✏️ Edit Level' : '＋ New Level'}</h1><div class="sub">Design the storyboard, drop a video wherever you like, and write quizzes per difficulty.</div></div>
      <button class="tbtn ghost" onclick="cancelEdit()">← Back</button>
    </div>

    <div class="t-card">
      <h3 style="margin-top:0">Basics</h3>
      <div class="field-row">
        <div><label class="t-label">Title</label><input id="f-title" class="t-input" value="${esc(d.title)}" placeholder="e.g. What is Matter?"></div>
        <div><label class="t-label">Icon (emoji)</label><input id="f-icon" class="t-input" value="${esc(d.icon)}" maxlength="4"></div>
        <div><label class="t-label">Terrain zone</label><select id="f-terrain" class="t-select">${terrainOpts}</select></div>
      </div>
      <label class="t-label">Short description</label>
      <input id="f-desc" class="t-input" value="${esc(d.description)}" placeholder="One line shown on the map">
    </div>

    <div class="t-card">
      <div class="t-head" style="margin:0 0 4px"><h3 style="margin:0">📖 Storyboard</h3>
        <div class="row" style="gap:8px">
          <button class="tbtn blue sm" onclick="addLine()">＋ Add line</button>
          <button class="tbtn indigo sm" onclick="addVideo()">🎬 Add video</button>
        </div></div>
      <div class="sub" style="color:var(--t-soft);margin-bottom:4px">Steps play top-to-bottom. Use ↑ ↓ to move a video before any line, or put it last to play right before the quiz.</div>
      <div id="sbList">${story}</div>
    </div>

    <div class="t-card">
      <h3 style="margin-top:0">❓ Quiz</h3>
      <label class="t-label">⏱ Quiz time limit in seconds (0 = no timer). Starts when the student begins the quiz; on timeout the latest answers are saved.</label>
      <input id="f-timelimit" class="t-input" type="number" min="0" max="3600" value="${d.timeLimit || 0}" style="max-width:240px">
      <div class="sub" style="color:var(--t-soft);margin:10px 0 4px">Write different questions for each difficulty. Students see the set matching their level.</div>
      <div class="diff-tabs">${quizCounts}</div>
      <div id="quizList">${questions}</div>
      <button class="tbtn blue sm" style="margin-top:12px" onclick="addQuestion()">＋ Add question</button>
    </div>

    <div class="editor-actions">
      <button class="tbtn ghost" onclick="cancelEdit()">Cancel</button>
      <button class="tbtn" onclick="saveLesson()">💾 Save Level</button>
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
      <div class="builder-head">🎬 Step ${i + 1} · Video</div>${reorder}
      <label class="t-label">Video title</label><input class="t-input vd-title" value="${esc(it.title)}" placeholder="e.g. States of Matter">
      <label class="t-label">YouTube link or ID</label><input class="t-input vd-url" value="${esc(it.url)}" placeholder="https://www.youtube.com/watch?v=...">
    </div>`;
  }

  const isData = (it.image || '').startsWith('data:');
  const preview = it.image
    ? `<div class="sb-img-preview"><img src="${esc(it.image)}" alt="preview"><button class="tbtn danger sm" onclick="removeLineImage(${i})">✕ Remove image</button></div>` : '';
  return `
    <div class="builder-item" data-sb data-type="line">
      <div class="builder-head">💬 Step ${i + 1} · Line</div>${reorder}
      <div class="field-row">
        <div><label class="t-label">Character</label><input class="t-input sb-char" value="${esc(it.character)}"></div>
        <div><label class="t-label">Mood / expression</label><select class="t-select sb-mood">${moodOpts(it.mood)}</select></div>
      </div>
      <label class="t-label">What Ruby says</label>
      <textarea class="t-area sb-text" placeholder="Type the dialogue line…">${esc(it.text)}</textarea>
      <label class="t-label">Image (optional)</label>
      ${preview}
      <input type="hidden" class="sb-image-data" value="${esc(it.image)}">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input class="t-input sb-image-url" style="flex:1;min-width:160px" value="${isData ? '' : esc(it.image)}" placeholder="Paste an image URL…">
        <label class="tbtn ghost sm" style="cursor:pointer">⤴ Upload<input type="file" accept="image/*" style="display:none" onchange="uploadLineImage(${i}, this)"></label>
      </div>
    </div>`;
}

function renderQuestionCard(q, i) {
  const choices = q.choices.map((c, ci) => `
    <div class="choice-row ${ci === q.correctIndex ? 'is-correct' : ''}">
      <input type="radio" class="q-correct" name="correct-${q._id}" value="${ci}" ${ci === q.correctIndex ? 'checked' : ''} onchange="markCorrect(this)">
      <input type="text" class="q-choice" value="${esc(c)}" placeholder="Answer choice ${ci + 1}">
      <span class="correct-wrap">${ci === q.correctIndex ? '✅ correct' : ''}</span>
      ${q.choices.length > 2 ? `<button class="tbtn ghost sm" onclick="removeChoice('${q._id}',${ci})">✕</button>` : ''}
    </div>`).join('');
  return `
    <div class="builder-item qcard" data-qid="${q._id}">
      <div class="builder-head">Question ${i + 1}</div>
      <button class="tbtn danger sm rm" onclick="removeQuestion('${q._id}')">✕</button>
      <input type="text" class="t-input q-text" value="${esc(q.question)}" placeholder="Type the question…">
      <div class="choices" style="margin-top:6px">${choices}</div>
      <button class="tbtn ghost sm" style="margin-top:8px" onclick="addChoice('${q._id}')">＋ Add choice</button>
      <label class="t-label">Explanation (shown after answering)</label>
      <input type="text" class="t-input q-explain" value="${esc(q.explanation)}" placeholder="Why is this the answer?">
    </div>`;
}

/* ---- editor state sync ---- */
function syncDraft() {
  if (!draft) return;
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (document.getElementById('f-title')) {
    draft.title = g('f-title'); draft.icon = g('f-icon'); draft.terrain = g('f-terrain'); draft.description = g('f-desc');
    let t = parseInt(g('f-timelimit'), 10); draft.timeLimit = Number.isFinite(t) && t > 0 ? Math.min(t, 3600) : 0;
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
  const ql = document.getElementById('quizList');
  if (ql) {
    draft.quizzes[currentDiff] = [...ql.querySelectorAll('.qcard')].map((cardEl) => {
      const cs = [...cardEl.querySelectorAll('.q-choice')].map((i) => i.value);
      const correct = cardEl.querySelector('.q-correct:checked');
      return { _id: cardEl.dataset.qid, question: cardEl.querySelector('.q-text').value, choices: cs, correctIndex: correct ? Number(correct.value) : 0, explanation: cardEl.querySelector('.q-explain').value };
    });
  }
}

function markCorrect(radio) {
  const cardEl = radio.closest('.qcard');
  cardEl.querySelectorAll('.choice-row').forEach((row) => {
    const isC = row.querySelector('.q-correct').checked;
    row.classList.toggle('is-correct', isC);
    row.querySelector('.correct-wrap').textContent = isC ? '✅ correct' : '';
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
  if (file.size > MAX_IMG_BYTES) { toast('Image too big (max 800 KB). Try a smaller one.', 'bad'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => { syncDraft(); draft.storyboard[i].image = reader.result; render(); toast('Image added', 'good'); };
  reader.onerror = () => toast('Could not read that file.', 'bad');
  reader.readAsDataURL(file);
}

/* quiz handlers */
function switchDiff(d) { syncDraft(); currentDiff = d; render(); }
function addQuestion() { syncDraft(); draft.quizzes[currentDiff].push(blankQuestion()); render(); }
function removeQuestion(qid) { syncDraft(); draft.quizzes[currentDiff] = draft.quizzes[currentDiff].filter((q) => q._id !== qid); render(); }
function addChoice(qid) { syncDraft(); const q = draft.quizzes[currentDiff].find((x) => x._id === qid); if (q && q.choices.length < 6) q.choices.push(''); render(); }
function removeChoice(qid, idx) {
  syncDraft();
  const q = draft.quizzes[currentDiff].find((x) => x._id === qid);
  if (q && q.choices.length > 2) { q.choices.splice(idx, 1); if (q.correctIndex >= q.choices.length) q.correctIndex = 0; }
  render();
}
function cancelEdit() { draft = null; render(); }

async function saveLesson() {
  syncDraft();
  if (!draft.title.trim()) { toast('Please give the level a title.', 'bad'); return; }
  const mapQ = (arr) => arr
    .filter((q) => q.question.trim() && q.choices.filter((c) => c.trim()).length >= 2)
    .map((q) => ({ id: q._id, question: q.question, choices: q.choices, correctIndex: q.correctIndex, explanation: q.explanation }));
  const payload = {
    title: draft.title, description: draft.description, terrain: draft.terrain, icon: draft.icon,
    timeLimit: draft.timeLimit || 0,
    storyboard: draft.storyboard.filter((it) => it.type === 'video' ? it.url.trim() : (it.text.trim() || it.image)),
    quizzes: { easy: mapQ(draft.quizzes.easy), medium: mapQ(draft.quizzes.medium), hard: mapQ(draft.quizzes.hard) },
  };
  if (draft.order !== undefined) payload.order = draft.order;
  try {
    if (draft.id) await API.put('/api/teacher/lessons/' + draft.id, payload);
    else await API.post('/api/teacher/lessons', payload);
    toast('Level saved! 🎉', 'good');
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
      <td>
        <button class="tbtn blue sm" onclick='editStudent("${s.id}")'>✏️</button>
        <button class="tbtn danger sm" onclick='confirmDeleteStudent("${s.id}")'>🗑</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="8" class="empty">No students have signed up yet.</td></tr>`;

  viewEl.innerHTML = `
    <div class="t-head"><div><h1>👩‍🎓 Students</h1><div class="sub">${STUDENTS.length} registered explorer${STUDENTS.length === 1 ? '' : 's'}. Manage names, difficulty and ranking.</div></div></div>
    <div class="t-card" style="overflow-x:auto">
      <table class="t-table">
        <thead><tr><th></th><th>Name</th><th>Email</th><th>Difficulty</th><th>Levels</th><th>Certs</th><th>Points</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function editStudent(id) {
  const s = STUDENTS.find((x) => x.id === id);
  openModal(`<h3>Edit student</h3>
    <label class="t-label">Name</label><input id="es-name" class="t-input" value="${esc(s.name)}">
    <label class="t-label">Difficulty</label>
    <select id="es-diff" class="t-select">${DIFFS.map((d) => `<option value="${d}" ${d === s.difficulty ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <label class="t-label">Points (ranking)</label>
    <input id="es-points" class="t-input" type="number" min="0" value="${s.points}">
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn ghost" onclick="closeModal()">Cancel</button>
      <button class="tbtn" onclick="saveStudent('${id}')">💾 Save</button></div>`);
}
async function saveStudent(id) {
  const body = {
    name: document.getElementById('es-name').value,
    difficulty: document.getElementById('es-diff').value,
    points: Number(document.getElementById('es-points').value),
  };
  try { await API.put('/api/teacher/students/' + id, body); closeModal(); await reload(); render(); toast('Student updated', 'good'); }
  catch (e) { toast(e.message, 'bad'); }
}
function confirmDeleteStudent(id) {
  const s = STUDENTS.find((x) => x.id === id);
  openModal(`<h3>Delete student?</h3><p>Delete <b>${esc(s.name)}</b>'s account and progress? This cannot be undone.</p>
    <div class="editor-actions" style="border:none;padding:0">
      <button class="tbtn ghost" onclick="closeModal()">Cancel</button>
      <button class="tbtn danger" onclick="doDeleteStudent('${id}')">Delete</button></div>`);
}
async function doDeleteStudent(id) {
  try { await API.del('/api/teacher/students/' + id); closeModal(); await reload(); render(); toast('Student deleted', 'good'); }
  catch (e) { toast(e.message, 'bad'); }
}

/* ============================ MODAL ============================ */
function openModal(html) {
  document.getElementById('modalHost').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { document.getElementById('modalHost').innerHTML = ''; }
