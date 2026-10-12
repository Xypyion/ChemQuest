// Teacher Console: manage lessons (storyboard, pre-test + separately-built
// post-test with an open/close gate, timers), the per-level assignment board,
// and students (incl. password reset).

const me = guard('teacher');
if (me) document.getElementById('teacherName').textContent = me.name;
mountLangSwitch(document.getElementById('langHost'));

const MOODS = ['happy', 'excited', 'thinking', 'wave', 'cheer', 'sad'];
const DIFFS = ['easy', 'medium', 'hard'];   // the STORED quiz keys only — counting questions; no student difficulty
const MAX_IMG_BYTES = 800 * 1024;

let LESSONS = [];
let STUDENTS = [];
let CHALLENGES = [];                          // challenge summaries (for the gradebook import)
// The two sources of written work waiting to be marked. They are fetched
// separately because they are stored separately, and merged for display in one
// "To mark" queue — see the block comment there.
let POST_PENDING = [];                        // post-test written answers
let CH_PENDING = [];                          // challenge written answers
let GRADEBOOK = { columns: [], rows: [] };    // spreadsheet-style gradebook
let view = 'lessons';
let draft = null;
/* There is no student difficulty any more: each test is ONE question list. The
   draft keeps the stored { easy, medium, hard } shape and works in `easy`;
   editLesson merges any medium/hard questions into it so none are lost. */
const QSET = 'easy';
let boardLessonId = null;                    // lesson whose assignment board is open
/* The level page: one level's storyboard, tests, assignment board and
   challenges in one place, with the marking for each test inside it. */
let levelId = null;                          // level whose page is open
let levelSub = null;                         // null | 'mark-pre' | 'mark-post' | 'challenge'
let levelOverview = null;                    // { lessonId, data } class counts for that page
let chDetailOpen = {};                       // level page: challenge id -> full challenge, or 'loading' / 'error'
let catsFoldOpen = false;                    // level page: is the categories fold open?
let CH_CATS = [];                            // challenge categories, for the tags on challenge rows
let preview = null;                          // in-console "play as student" preview state

const viewEl = document.getElementById('view');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'q' + Math.random().toString(36).slice(2));
const esc = (s) => escapeHtml(s);
/* Level titles are chemistry, so their digits belong below the line:
   "Balancing H2O" reads wrong on a stoichiometry course. Names, emails
   and form values keep plain esc(). */
const escChem = (s) => chem(s);

/* The challenge editor and Responses screens open from a level page and
   come back to it — after Back, Cancel, Save, or a row action. */
TChallenges.attach(viewEl, () => {
  levelSub = null;
  reload().catch(() => {}).then(() => { render(); if (levelId) loadLevelOverview(levelId); });
});

init();
async function init() {
  try { await reload(); restoreHash(); render(); }
  catch (e) { viewEl.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`; }
}
async function reload() {
  LESSONS = (await API.get('/api/teacher/lessons')).lessons;
  STUDENTS = (await API.get('/api/teacher/students')).students;
  // Post-test answers arrive in their own shape; give them the same field
  // names the challenge queue uses so one card can render either.
  POST_PENDING = (await API.get('/api/teacher/submissions')).submissions.map((s) => ({
    id: s.id,
    source: 'post',
    userId: s.userId,
    userName: s.userName,
    userAvatar: s.userAvatar || '',
    mode: s.mode === 'pre' ? 'pre' : 'post',
    lessonId: s.lessonId,
    title: s.lessonTitle || '',
    autoPoints: s.mcqPoints || 0,
    autoCorrect: s.mcqCorrect || 0,
    autoOf: s.mcqTotal || 0,
    maxPoints: s.maxPoints || 0,
    written: s.written || [],
    createdAt: s.createdAt,
  }));
  try {
    const ch = await API.get('/api/teacher/challenges');
    CHALLENGES = ch.challenges;
    CH_CATS = ch.categories || [];
  } catch { CHALLENGES = []; }
  try {
    CH_PENDING = (await API.get('/api/teacher/challenges/pending')).submissions;
  } catch { CH_PENDING = []; }
  paintNav();
}

/* Every sidebar button is painted here — icon, label, and a count when work
   is waiting. It used to be two functions that each rebuilt a button's
   innerHTML from a label alone, which wiped whatever icon was in the markup
   the moment a badge appeared. */
/* A badge means one thing: work is waiting for you in there. Marking lives
   with what it marks - a test's answers on its level's page, a challenge's on
   its Responses screen - so each section counts its own, and the two numbers
   never overlap. (There used to be a separate "To mark" queue for both.) */
/* Challenges live inside their level now (there is no Challenges menu item),
   so Lessons & Levels counts everything waiting in a level: test answers and
   challenge answers. */
const NAV_BADGE = {
  lessons: () => POST_PENDING.length + CH_PENDING.length,
};
const NAV_KEY = {
  lessons: 't.navLessons', quests: 't.navQuests',
  battles: 't.navBattles', gradebook: 't.navGradebook',
  students: 't.navStudents', logs: 't.navLogs', preview: 't.playAsStudent',
};
function paintNav() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((btn) => {
    const v = btn.dataset.view;
    const n = NAV_BADGE[v] ? NAV_BADGE[v]() : 0;
    btn.innerHTML = `${ICON[btn.dataset.icon](20)}<span>${esc(t(NAV_KEY[v]))}</span>`
      + (n ? ` <span class="t-badge">${n}</span>` : '');
  });
  const mark = document.getElementById('brandMark');
  if (mark) mark.innerHTML = ICON.brand(28);
  const menu = document.getElementById('menuToggle');
  if (menu) menu.innerHTML = `${ICON.lines(18)} ${esc(t('t.menu'))}`;
}
function updateChallengeBadge() { paintNav(); }
function updateGradingBadge() { paintNav(); }   // kept: called from other console files
/* ========================= UNSAVED CHANGES =========================
   Every editor in the console (a level, a challenge, a daily quest, a battle
   bank) used to drop what the teacher had typed, without a word, the moment
   they clicked another menu item, Back or Cancel. Each editor now keeps a
   snapshot of what it opened with; leaving while it differs asks first, and
   so does closing or reloading the tab (switching language reloads too). */
let draftSnap = null;                         // the level draft as opened / last saved
function snapDraft() { syncDraft(); draftSnap = JSON.stringify(draft); }
function levelDraftChanged() {
  if (!draft || !document.getElementById('f-title')) return false;
  syncDraft();
  return JSON.stringify(draft) !== draftSnap;
}
function anyUnsaved() {
  return levelDraftChanged()
    || markingChanged()
    || (typeof TChallenges !== 'undefined' && TChallenges.isDirty())
    || (typeof TQuests !== 'undefined' && TQuests.isDirty())
    || (typeof TBattles !== 'undefined' && TBattles.isDirty());
}
/** True when it is fine to leave: nothing unsaved, or the teacher said so. */
function confirmDiscard() { return !anyUnsaved() || window.confirm(t('t.unsavedLeave')); }
window.addEventListener('beforeunload', (e) => {
  if (anyUnsaved()) { e.preventDefault(); e.returnValue = ''; }
});

function setView(v) {
  if (!confirmDiscard()) return;
  view = v; draft = null; boardLessonId = null; preview = null;
  levelId = null; levelSub = null;
  // These are top-level consts, which are not properties of window.
  if (typeof TChallenges !== 'undefined') TChallenges.reset();
  if (typeof TQuests !== 'undefined') TQuests.reset();
  if (typeof TBattles !== 'undefined') TBattles.reset();
  if (typeof TLogs !== 'undefined') TLogs.reset();
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  document.getElementById('side').classList.remove('open');
  render();
}
function render() {
  syncHash();
  if (draft) return renderEditor();
  if (boardLessonId) return renderBoard();
  if (preview) return renderPreview();
  if (view === 'lessons' && levelId) return renderLevel();
  if (view === 'preview') return renderPreviewPicker();
  if (view === 'quests') return TQuests.render(viewEl);
  if (view === 'battles') return TBattles.render(viewEl);
  if (view === 'logs') return TLogs.render(viewEl);
  if (view === 'gradebook') return renderGradebook();
  if (view === 'students') return renderStudents();
  return renderLessons();
}

/* ========================= ROW OVERFLOW MENU =========================

   Every list in this console had grown the same way: one more action, one more
   button on the row. A challenge row reached seven buttons in five colours, a
   level row five, and the loudest thing on all of them was a red Delete
   repeated once per row — a destructive action given the strongest visual
   weight on the page, eighteen times over.

   So each row now shows the ONE action a teacher actually came for, and
   everything else lives behind a "..." button. Delete goes in there with the
   rest and is styled as danger only inside the menu, where it cannot be hit by
   accident and cannot shout.

   Deliberately no framework and no library: one module, inline `onclick`
   strings like the rest of this file, and a single document-level listener
   rather than one per row.

   Keyboard: the trigger is a real <button> with aria-haspopup/aria-expanded,
   the menu items are real buttons in DOM order so Tab reaches them, Escape
   closes and returns focus to the trigger.                                   */

const TMenu = (() => {
  let openId = null;

  /** Build a row's menu. `items` are {label, action, icon?, danger?, disabled?}. */
  function html(id, items, label) {
    const rows = items.filter(Boolean).map((it) => `
      <button role="menuitem" type="button"
              class="tmenu-item${it.danger ? ' danger' : ''}"
              ${it.disabled ? 'disabled' : ''}
              onclick="TMenu.run(event, ${JSON.stringify(it.action).replace(/"/g, '&quot;')})">
        ${it.icon && ICON[it.icon] ? ICON[it.icon](15) : '<i class="tmenu-gap"></i>'}
        <span>${escapeHtml(it.label)}</span>
      </button>`).join('');

    return `
      <div class="tmenu" data-menu="${escapeHtml(id)}">
        <button class="iconbtn tmenu-trigger" type="button"
                aria-haspopup="menu" aria-expanded="false"
                aria-label="${escapeHtml(label || t('t.moreActions'))}"
                title="${escapeHtml(label || t('t.moreActions'))}"
                onclick="TMenu.toggle(event, '${escapeHtml(id)}')">${ICON.more(16)}</button>
        <div class="tmenu-pop" role="menu" hidden>${rows}</div>
      </div>`;
  }

  function nodeOf(id) { return document.querySelector(`.tmenu[data-menu="${CSS.escape(id)}"]`); }

  function close() {
    if (!openId) return;
    const n = nodeOf(openId);
    if (n) {
      n.classList.remove('is-open');
      n.querySelector('.tmenu-pop').hidden = true;
      n.querySelector('.tmenu-trigger').setAttribute('aria-expanded', 'false');
    }
    openId = null;
  }

  function toggle(ev, id) {
    ev.stopPropagation();
    const wasOpen = openId === id;
    close();
    if (wasOpen) return;
    const n = nodeOf(id);
    if (!n) return;
    n.classList.add('is-open');
    n.querySelector('.tmenu-pop').hidden = false;
    n.querySelector('.tmenu-trigger').setAttribute('aria-expanded', 'true');
    openId = id;
    // Flip upward when there is not room below, so the last row's menu is
    // never cut off by the bottom of the page.
    const pop = n.querySelector('.tmenu-pop');
    pop.classList.remove('up');
    const r = pop.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) pop.classList.add('up');
    const first = pop.querySelector('.tmenu-item:not([disabled])');
    if (first) first.focus();
  }

  /** Run an item's action, then close. Actions are inline calls, as elsewhere. */
  function run(ev, action) {
    ev.stopPropagation();
    close();
    // eslint-disable-next-line no-new-func
    try { new Function(action)(); } catch (e) { console.error('[TMenu]', action, e); }
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.tmenu')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openId) return;
    const n = nodeOf(openId);
    close();
    if (n) n.querySelector('.tmenu-trigger').focus();
  });

  return { html, toggle, run, close };
})();

/* ============================ LESSONS LIST ============================ *

   A level row used to be seven small buttons in one strip — gate, post-test,
   board, up, down, edit, delete — all the same size in five different
   colours, above a line of bare emoji and unlabelled numbers
   ("2 lines · 1 · 14 questions · 6").

   Two changes, both structural:
     1. STATE lives with the information, not in the action group. The access
        gate and the post-test are facts about the level that happen to be
        editable, so they read as chips under the title instead of as two more
        buttons competing with Edit.
     2. Every number is labelled and every mark is a drawn icon, so the row can
        be read rather than decoded.                                          */

function fmtTimer(seconds) {
  if (!seconds) return t('t.noTimer');
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/** "1 point" / "4 points" — numbers on a row always say what they count. */
function qCountLabel(n) { return Number(n) === 1 ? t('t.question1') : `${n} ${t('t.questions')}`; }
function ptsLabel(n) { return t(Number(n) === 1 ? 't.chdPt1' : 't.chdPts', { n }); }

function metaBit(icon, text) {
  return `<i>${ICON[icon](15)}${esc(text)}</i>`;
}

function renderLessons() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'lessons'));

  const rows = LESSONS.length ? LESSONS.map((l, i) => {
    const qCount = DIFFS.reduce((n, d) => n + ((l.quizzes && l.quizzes[d]) || []).length, 0);
    const pt = l.postTest || {};
    const ptCount = DIFFS.reduce((n, d) => n + ((pt.quizzes && pt.quizzes[d]) || []).length, 0);
    const lines = (l.storyboard || []).filter((s) => s.type !== 'video' && s.type !== 'question').length;
    const vids = (l.storyboard || []).filter((s) => s.type === 'video').length;
    const storyQs = (l.storyboard || []).filter((s) => s.type === 'question').length;
    const gate = gateMode(l);
    const gateIcon = gate === 'locked' ? 'lock' : gate === 'scheduled' ? 'calendar' : 'unlock';

    const toMark = POST_PENDING.filter((s) => s.lessonId === l.id).length
      + levelChallenges(l.id).reduce((n, c) => n + (c.pending || 0), 0);

    return `
    <div class="lesson-row">
      <div class="lr-num">${i + 1}</div>

      <div class="lr-body">
        <div class="lr-title">
          <button class="lr-name lr-open" onclick="openLevel('${l.id}')">${escChem(l.title)}</button>
          <span class="lr-flow">${esc(l.flow === 'test-first' ? t('t.flowBadgeTest') : t('t.flowBadgeStory'))}</span>
        </div>

        <div class="lr-meta">
          ${metaBit('lines', `${lines} ${t('t.lines')}`)}
          ${metaBit('video', `${vids} ${vids === 1 ? t('t.videos') : t('t.videosPlural')}`)}
          ${storyQs ? metaBit('chat', `${storyQs} ${t('t.storyQCount')}`) : ''}
          ${metaBit('question', `${qCount} ${t('t.questions')}`)}
          ${metaBit('pen', `${ptCount} ${t('t.postQ')}`)}
          ${metaBit('timer', fmtTimer(l.timeLimit))}
        </div>

        <div class="lr-state">
          <button class="chip chip-${gate}" onclick="openGate('${l.id}')">
            ${ICON[gateIcon](14)}<b>${esc(t('t.access'))}</b> ${esc(gateLabel(l))}
          </button>
          ${!pt.open && !ptCount ? `<span class="chip chip-off" title="${esc(t('t.postTestNeedsQs'))}">
            ${ICON.lock(14)}<b>${esc(t('t.postTestShort'))}</b> ${esc(t('t.lvNoQs'))}
          </span>` : `<button class="chip ${pt.open ? 'chip-on' : ''}"
                  onclick="togglePostTest('${l.id}', ${pt.open ? 'false' : 'true'})"
                  title="${esc(pt.open ? t('t.closePostTest') : t('t.openPostTest'))}">
            ${ICON[pt.open ? 'unlock' : 'lock'](14)}<b>${esc(t('t.postTestShort'))}</b> ${esc(pt.open ? t('t.open') : t('t.closed'))}
          </button>`}
          ${toMark ? `<button class="chip chip-mark" onclick="openLevel('${l.id}')">
            ${ICON.pen(14)}<b>${esc(t('t.lvToMarkChip', { n: toMark }))}</b>
          </button>` : ''}
        </div>
      </div>

      <div class="lr-acts" role="group" aria-label="${esc(t('t.rowActions', { title: l.title }))}">
        <button class="tbtn ghost sm" onclick="openBoard('${l.id}')">${ICON.people(15)} ${esc(t('t.lvBoardBtn'))}</button>
        <button class="tbtn sm" onclick="openLevel('${l.id}')">${esc(t('t.lvOpen'))}</button>
        ${TMenu.html('lesson-' + l.id, [
          { label: t('t.edit'), action: `editLesson('${l.id}')`, icon: 'pencil' },
          { label: t('t.moveUp'), action: `moveLesson('${l.id}','up')`, icon: 'up', disabled: i === 0 },
          { label: t('t.moveDown'), action: `moveLesson('${l.id}','down')`, icon: 'down', disabled: i === LESSONS.length - 1 },
          { label: t('t.deleteLevel'), action: `confirmDeleteLesson('${l.id}')`, icon: 'trash', danger: true },
        ], t('t.rowActions', { title: l.title }))}
      </div>
    </div>`;
  }).join('') : `<div class="empty">${esc(t('t.noLevels'))}</div>`;

  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${esc(t('t.lessonsTitle'))}</h1><div class="sub">${esc(t('t.lessonsSub'))}</div></div>
      <button class="tbtn" onclick="newLesson()">${ICON.plus(16)} ${esc(t('t.newLevel'))}</button>
    </div>
    <div class="t-card lessons">${rows}</div>`;
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
/* ---- per-level access gate ---- */
function gateMode(l) { return (l.gate && l.gate.mode) || 'auto'; }
function gateLabel(l) {
  const m = gateMode(l);
  return m === 'locked' ? t('t.accessLocked') : m === 'scheduled' ? t('t.accessScheduled') : t('t.accessAuto');
}
function gateBtnClass(l) {
  const m = gateMode(l);
  return m === 'locked' ? 'danger' : m === 'scheduled' ? 'indigo' : 'ghost';
}
function toLocalInput(iso) {
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function openGate(id) {
  const l = LESSONS.find((x) => x.id === id);
  const g = l.gate || { mode: 'auto', openAt: null };
  const localVal = g.openAt ? toLocalInput(g.openAt) : '';
  const opt = (val, label, desc) => `
    <label class="gate-opt ${g.mode === val ? 'on' : ''}">
      <input type="radio" name="gate-mode" value="${val}" ${g.mode === val ? 'checked' : ''} onchange="syncGateUI()">
      <span><b>${label}</b><br><span class="sub" style="color:var(--t-soft)">${desc}</span></span>
    </label>`;
  openModal(`
    <h3>${t('t.accessTitle', { title: esc(l.title) })}</h3>
    <p class="sub" style="color:var(--t-soft);margin-top:-4px">${t('t.accessHint')}</p>
    ${opt('auto', t('t.gateAuto'), t('t.gateAutoDesc'))}
    ${opt('locked', t('t.gateLocked'), t('t.gateLockedDesc'))}
    ${opt('scheduled', t('t.gateScheduled'), t('t.gateScheduledDesc'))}
    <div id="gate-when" style="${g.mode === 'scheduled' ? '' : 'display:none'};margin-top:6px">
      <label class="t-label">${t('t.opensAtLabel')}</label>
      <input id="gate-openat" class="t-input" type="datetime-local" value="${localVal}" style="max-width:260px">
    </div>
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="saveGate('${id}')">${t('common.save')}</button>
    </div>`);
}
function syncGateUI() {
  const mode = document.querySelector('input[name=gate-mode]:checked').value;
  document.getElementById('gate-when').style.display = mode === 'scheduled' ? '' : 'none';
  document.querySelectorAll('.gate-opt').forEach((el) => el.classList.toggle('on', el.querySelector('input').checked));
}
async function saveGate(id) {
  const mode = document.querySelector('input[name=gate-mode]:checked').value;
  const body = { mode };
  if (mode === 'scheduled') {
    const v = document.getElementById('gate-openat').value;
    if (!v) { toast(t('t.opensAtLabel'), 'bad'); return; }
    body.openAt = new Date(v).toISOString();
  }
  try {
    const r = await API.post(`/api/teacher/lessons/${id}/gate`, body);
    closeModal(); await reload(); render();
    toast(r.gate.mode === 'scheduled' ? t('t.gateSchedSavedAt', { time: fmtWhen(r.gate.openAt) }) : t('t.gateSaved'), 'good');
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
let boardCriteria = []; // working copy of the level's rating criteria

function openBoard(id) {
  boardLessonId = id;
  const l = LESSONS.find((x) => x.id === id);
  boardCriteria = ((l && l.ratingCriteria) || []).map((c) => ({ id: c.id, label: c.label }));
  render();
}
/* Back from the board goes where the teacher came from: the level's page if
   they opened it there, the list of levels if they opened it from a row. */
function closeBoard() { boardLessonId = null; render(); }
function renderBoard() {
  const l = LESSONS.find((x) => x.id === boardLessonId);
  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${t('t.boardFor', { title: esc(l ? l.title : '') })}</h1><div class="sub">${t('t.boardSub')}</div></div>
      <button class="tbtn ghost" onclick="closeBoard()">${t('common.back')}</button>
    </div>
    <div class="t-card" id="critCard"></div>
    <div id="tFeed"></div>`;
  renderCriteriaCard();
  Feed.mount(document.getElementById('tFeed'), boardLessonId, { teacher: true, title: l ? l.title : '', icon: l ? l.icon : '' });
}

/* ---- rating criteria editor (lives above the board feed) ---- */
function renderCriteriaCard() {
  const rows = boardCriteria.length ? boardCriteria.map((c, i) => `
    <div class="crit-row">
      <input class="t-input crit-input" data-i="${i}" value="${esc(c.label)}" placeholder="${esc(t('rate.critPh'))}" maxlength="80">
      <button class="tbtn danger sm" onclick="removeCriterion(${i})" aria-label="${t('common.delete')}">${ICON.close(13)}</button>
    </div>`).join('') : `<div class="sub" style="color:var(--t-soft)">${t('rate.noneYet')}</div>`;
  document.getElementById('critCard').innerHTML = `
    <div class="t-head" style="margin:0 0 4px"><h3 style="margin:0">${t('rate.editorTitle')}</h3>
      <button class="tbtn blue sm" onclick="addCriterion()">${t('rate.addCrit')}</button></div>
    <div class="sub" style="color:var(--t-soft);margin-bottom:8px">${t('rate.editorHint')}</div>
    ${rows}
    <div style="margin-top:12px"><button class="tbtn" onclick="saveCriteria()">${t('rate.saveCrit')}</button></div>`;
}
function syncCriteria() {
  document.querySelectorAll('.crit-input').forEach((inp) => { boardCriteria[+inp.dataset.i].label = inp.value; });
}
function addCriterion() { syncCriteria(); if (boardCriteria.length < 8) boardCriteria.push({ id: uid(), label: '' }); renderCriteriaCard(); }
function removeCriterion(i) { syncCriteria(); boardCriteria.splice(i, 1); renderCriteriaCard(); }
async function saveCriteria() {
  syncCriteria();
  const payload = boardCriteria.filter((c) => c.label.trim());
  try {
    const r = await API.post(`/api/teacher/lessons/${boardLessonId}/criteria`, { criteria: payload });
    boardCriteria = r.criteria.map((c) => ({ id: c.id, label: c.label }));
    const l = LESSONS.find((x) => x.id === boardLessonId); if (l) l.ratingCriteria = r.criteria;
    toast(t('rate.saved'), 'good');
    renderCriteriaCard();
    Feed.refresh(); // re-render posts so rating widgets pick up the new criteria
  } catch (e) { toast(e.message, 'bad'); }
}

/* ============================ LESSON EDITOR ============================ */
function blankQuestion() { return { _id: uid(), type: 'mcq', question: '', choices: ['', ''], correctIndex: 0, points: 1, explanation: '', whiteboard: false }; }
function blankLine() { return { type: 'line', character: mascotName(), mood: 'happy', text: '', image: '' }; }
function blankVideo() { return { type: 'video', url: '', title: '' }; }
/* A question asked in the middle of the story. Not graded: the student answers,
   Kru CJ reads it for you, and it lands in Student Logs. The id is kept across
   saves because each student's answer is stored against it. */
function blankStoryQuestion() { return { type: 'question', id: uid(), question: '', image: '', expected: '', aiNote: '', whiteboard: false }; }

function newLesson() {
  draft = {
    /* `terrain` no longer has a picker: the map stopped painting ground, so it
       controlled nothing. It is still carried draft -> save so editing a level
       never blanks the value already stored against it. */
    id: null, title: '', description: '', terrain: 'plain', icon: '🧪', timeLimit: 0, flow: 'story-first',
    storyboard: [{ ...blankLine(), mood: 'wave' }],
    quizzes: { easy: [blankQuestion()], medium: [], hard: [] },
    postTest: { open: false, timeLimit: 0, quizzes: { easy: [], medium: [], hard: [] } },
  };
  render();
  snapDraft();
}
async function editLesson(id, focus) {
  try {
    const { lesson } = await API.get('/api/teacher/lessons/' + id);
    const pt = lesson.postTest || {};
    draft = {
      id: lesson.id, title: lesson.title, description: lesson.description || '',
      terrain: lesson.terrain || 'plain', icon: lesson.icon || '🧪', order: lesson.order,
      timeLimit: lesson.timeLimit || 0,
      flow: lesson.flow === 'test-first' ? 'test-first' : 'story-first',
      storyboard: (lesson.storyboard || []).map((it) => {
        if (it.type === 'video') return { type: 'video', url: it.url || '', title: it.title || '' };
        if (it.type === 'question') {
          return { type: 'question', id: it.id || uid(), question: it.question || '', image: it.image || '',
            expected: it.expected || '', aiNote: it.aiNote || '', whiteboard: !!it.whiteboard };
        }
        return { type: 'line', character: it.character || mascotName(), mood: it.mood || 'happy', text: it.text || '', image: it.image || '' };
      }),
      quizzes: { easy: mapInQ(oneSet(lesson.quizzes)), medium: [], hard: [] },
      postTest: {
        open: !!pt.open,
        timeLimit: pt.timeLimit || 0,
        quizzes: { easy: mapInQ(oneSet(pt.quizzes)), medium: [], hard: [] },
      },
    };
    if (!draft.storyboard.length) draft.storyboard = [blankLine()];
    render();
    snapDraft();
    // Opened from a card on the level page: land on that part of the editor.
    const target = focus && document.getElementById('ed-' + focus);
    if (target) target.scrollIntoView({ block: 'start' });
  } catch (e) { toast(e.message, 'bad'); }
}
/** A test's one question list: easy + medium + hard, as src/game.js questionSet does. */
function oneSet(quizzes) {
  const q = quizzes || {};
  const seen = new Set();
  return ['easy', 'medium', 'hard'].flatMap((k) => q[k] || []).filter((x) => {
    if (x.id && seen.has(x.id)) return false;
    if (x.id) seen.add(x.id);
    return true;
  });
}
function mapInQ(arr) {
  return (arr || []).map((q) => ({
    _id: q.id || uid(),
    type: q.type === 'written' ? 'written' : 'mcq',
    question: q.question || '',
    choices: (q.choices && q.choices.length ? q.choices : ['', '']).slice(),
    correctIndex: q.correctIndex || 0,
    points: q.points || 1,
    explanation: q.explanation || '',
    whiteboard: !!q.whiteboard,
  }));
}

function zoneQuizzes(zone) { return zone === 'post' ? draft.postTest.quizzes : draft.quizzes; }

function renderQuizSection(zone) {
  const d = draft;
  const quizzes = zoneQuizzes(zone);
  const timeVal = zone === 'post' ? (d.postTest.timeLimit || 0) : (d.timeLimit || 0);
  const questions = quizzes[QSET].map((q, i) => renderQuestionCard(q, i, zone)).join('') ||
    `<p class="sub" style="color:var(--t-soft)">${t('t.noQuestions')}</p>`;
  const saved = zone === 'post' && d.id ? LESSONS.find((x) => x.id === d.id) : null;
  const savedPostQs = saved ? oneSet((saved.postTest || {}).quizzes).length : 0;
  const openToggle = zone === 'post' && d.id && !d.postTest.open && !savedPostQs
    ? `<div class="t-hint" style="margin-bottom:8px">${t('t.postTestNeedsQs')}</div>`
    : zone === 'post' && d.id ? `
    <button class="tbtn ${d.postTest.open ? 'green' : 'ghost'} sm" style="margin-bottom:8px"
            onclick="togglePostTestFromEditor()">
      ${d.postTest.open ? ICON.unlock(14) + ' ' + t('t.postTestShort') + ': ' + t('t.open') + ' — ' + t('t.closePostTest') : t('t.openPostTest')}
    </button>` : '';

  return `
    <div class="t-card" id="ed-${zone}">
      <h3 style="margin-top:0">${zone === 'post' ? t('t.postTest') : t('t.preTest')}</h3>
      ${zone === 'post' ? `<div class="sub" style="color:var(--t-soft);margin-bottom:6px">${t('t.postTestHint')}</div>${openToggle}` : ''}
      <label class="t-label">${t('t.timerLabel')}</label>
      <input id="f-timelimit-${zone}" class="t-input" type="number" min="0" max="3600" value="${timeVal}" style="max-width:240px">
      <div id="quizList-${zone}" style="margin-top:10px">${questions}</div>
      <button class="tbtn blue sm" style="margin-top:12px" onclick="addQuestion('${zone}')">${t('t.addQuestion')}</button>
    </div>`;
}

function renderEditor() {
  const d = draft;
  const moodOpts = (sel) => MOODS.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${m}</option>`).join('');

  const story = d.storyboard.map((it, i) => renderStoryItem(it, i, d.storyboard.length, moodOpts)).join('');

  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${d.id ? t('t.editLevel') : t('t.newLevel')}</h1><div class="sub">${t('t.editorSub')}</div></div>
      <button class="tbtn ghost" onclick="cancelEdit()">${t('common.back')}</button>
    </div>

    <div class="t-card">
      <h3 style="margin-top:0">${t('t.basics')}</h3>
      <div class="field-row">
        <div><label class="t-label">${t('t.title')}</label><input id="f-title" data-chem class="t-input" value="${esc(d.title)}" placeholder="${esc(t('t.titlePh'))}"></div>
        <div><label class="t-label">${t('t.icon')}</label><input id="f-icon" class="t-input" value="${esc(d.icon)}" maxlength="4"></div>
      </div>
      <label class="t-label">${t('t.shortDesc')}</label>
      <input id="f-desc" data-chem class="t-input" value="${esc(d.description)}" placeholder="${esc(t('t.shortDescPh'))}">

      <label class="t-label" style="margin-top:14px">${t('t.flow')}</label>
      <div class="sub" style="color:var(--t-soft);margin-bottom:8px">${t('t.flowHint')}</div>
      ${flowOption('story-first', t('t.flowStoryFirst'), t('t.flowStoryFirstDesc'), d.flow)}
      ${flowOption('test-first', t('t.flowTestFirst'), t('t.flowTestFirstDesc'), d.flow)}
    </div>

    <div class="t-card" id="ed-story">
      <div class="t-head" style="margin:0 0 4px"><h3 style="margin:0">${t('t.storyboard')}</h3>
        <div class="row" style="gap:8px">
          <button class="tbtn blue sm" onclick="addLine()">${t('t.addLine')}</button>
          <button class="tbtn indigo sm" onclick="addVideo()">${t('t.addVideo')}</button>
          <button class="tbtn sm" onclick="addStoryQuestion()">${ICON.question(14)} ${t('t.addStoryQ')}</button>
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

/** One radio card of the "which activity comes first?" picker. */
function flowOption(value, label, desc, current) {
  return `
    <label class="gate-opt ${current === value ? 'on' : ''}">
      <input type="radio" name="lesson-flow" value="${value}" ${current === value ? 'checked' : ''} onchange="syncFlowUI()">
      <span><b>${label}</b><br><span class="sub" style="color:var(--t-soft)">${desc}</span></span>
    </label>`;
}
function syncFlowUI() {
  document.querySelectorAll('input[name=lesson-flow]').forEach((inp) => {
    inp.closest('.gate-opt').classList.toggle('on', inp.checked);
  });
}

function renderStoryItem(it, i, total, moodOpts) {
  const reorder = `
    <div class="sb-reorder">
      <button class="tbtn ghost sm" onclick="moveStoryItem(${i},'up')" ${i === 0 ? 'disabled' : ''}>${ICON.up(14)}</button>
      <button class="tbtn ghost sm" onclick="moveStoryItem(${i},'down')" ${i === total - 1 ? 'disabled' : ''}>${ICON.down(14)}</button>
      <button class="tbtn danger sm" onclick="removeStoryItem(${i})">${ICON.close(13)}</button>
    </div>`;

  if (it.type === 'question') {
    const isDataQ = (it.image || '').startsWith('data:');
    const previewQ = it.image
      ? `<div class="sb-img-preview"><img src="${esc(it.image)}" alt="preview"><button class="tbtn danger sm" onclick="removeLineImage(${i})">${t('t.removeImage')}</button></div>` : '';
    return `
    <div class="builder-item sbq" data-sb data-type="question" data-sid="${esc(it.id)}">
      <div class="builder-head">${t('t.stepQuestion', { n: i + 1 })}</div>${reorder}
      <div class="t-hint">${t('t.storyQHint')}</div>
      <label class="t-label">${t('t.storyQText')}</label>
      <textarea class="t-area sbq-text" data-chem placeholder="${esc(t('t.storyQTextPh'))}">${esc(it.question)}</textarea>
      <label class="t-label">${t('t.image')}</label>
      ${previewQ}
      <input type="hidden" class="sb-image-data" value="${esc(it.image)}">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input class="t-input sb-image-url" style="flex:1;min-width:160px" value="${isDataQ ? '' : esc(it.image)}" placeholder="${esc(t('t.imageUrlPh'))}">
        <label class="tbtn ghost sm" style="cursor:pointer">${t('t.upload')}<input type="file" accept="image/*" style="display:none" onchange="uploadLineImage(${i}, this)"></label>
      </div>
      <label class="t-label">${t('t.storyQExpected')}</label>
      <div class="t-hint">${t('t.storyQExpectedHint')}</div>
      <textarea class="t-area sbq-expected" rows="3" placeholder="${esc(t('t.chRubricPh'))}">${esc(it.expected)}</textarea>
      <label class="t-label">${t('t.chAiNote')}</label>
      <textarea class="t-area sbq-ainote" rows="2" placeholder="${esc(t('t.chAiNotePh'))}">${esc(it.aiNote)}</textarea>
      <label class="check-row">
        <input type="checkbox" class="sbq-board" ${it.whiteboard ? 'checked' : ''}>
        <span>${ICON.board(15)} ${t('t.wbToggle')} <span class="sub" style="color:var(--t-soft)">— ${t('t.storyQBoardHint')}</span></span>
      </label>
    </div>`;
  }

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
  const isWritten = q.type === 'written';
  // Type switcher (Multiple choice | ข้อเขียน), like a Google Form question type.
  const typeTabs = `
    <div class="qtype-tabs">
      <button class="${!isWritten ? 'active' : ''}" onclick="setQuestionType('${zone}','${q._id}','mcq')">${t('t.qTypeMcq')}</button>
      <button class="${isWritten ? 'active' : ''}" onclick="setQuestionType('${zone}','${q._id}','written')">${t('t.qTypeWritten')}</button>
    </div>`;

  let bodyHtml;
  if (isWritten) {
    bodyHtml = `
      <div class="written-box">
        <div class="written-hint">${ICON.pen(14)} ${t('t.writtenHint')}</div>
        <textarea class="t-area q-sample" disabled>${esc(t('t.writtenPreviewPh'))}</textarea>
      </div>
      <label class="t-label">${t('t.answerGuide')}</label>
      <input type="text" class="t-input q-explain" value="${esc(q.explanation)}" placeholder="${esc(t('t.answerGuideInputPh'))}">`;
  } else {
    const choices = q.choices.map((c, ci) => `
      <div class="choice-row ${ci === q.correctIndex ? 'is-correct' : ''}">
        <input type="radio" class="q-correct" name="correct-${zone}-${q._id}" value="${ci}" ${ci === q.correctIndex ? 'checked' : ''} onchange="markCorrect(this)">
        <input type="text" class="q-choice" value="${esc(c)}" placeholder="${esc(t('t.choicePh', { n: ci + 1 }))}">
        <span class="correct-wrap">${ci === q.correctIndex ? t('t.correct') : ''}</span>
        ${q.choices.length > 2 ? `<button class="tbtn ghost sm" onclick="removeChoice('${zone}','${q._id}',${ci})">${ICON.close(13)}</button>` : ''}
      </div>`).join('');
    bodyHtml = `
      <div class="choices" style="margin-top:6px">${choices}</div>
      <button class="tbtn ghost sm" style="margin-top:8px" onclick="addChoice('${zone}','${q._id}')">${t('t.addChoice')}</button>
      <label class="t-label">${t('t.explanation')}</label>
      <input type="text" class="t-input q-explain" value="${esc(q.explanation)}" placeholder="${esc(t('t.explanationPh'))}">`;
  }

  // Post-test questions carry a point value; a correct MCQ earns it in full and
  // a written answer is graded 0..points by the teacher.
  const pointsRow = zone === 'post' ? `
    <div class="q-points-row">
      <label class="t-label" style="margin:0">${t('t.points')}</label>
      <input type="number" class="t-input q-points" min="1" max="100" value="${q.points || 1}">
      <span class="q-points-hint">${isWritten ? t('t.pointsWrittenHint') : t('t.pointsMcqHint')}</span>
    </div>` : '';

  return `
    <div class="builder-item qcard" data-qid="${q._id}" data-qtype="${isWritten ? 'written' : 'mcq'}">
      <div class="builder-head">${t('t.question', { n: i + 1 })}</div>
      <button class="tbtn danger sm rm" onclick="removeQuestion('${zone}','${q._id}')">${ICON.close(13)}</button>
      ${typeTabs}
      <input type="text" class="t-input q-text" value="${esc(q.question)}" placeholder="${esc(t('t.questionPh'))}">
      ${bodyHtml}
      ${pointsRow}
      <label class="check-row q-board-row">
        <input type="checkbox" class="q-board" ${q.whiteboard ? 'checked' : ''}>
        <span>${ICON.board(15)} ${t('t.wbToggle')} <span class="sub" style="color:var(--t-soft)">— ${t('t.wbToggleHint')}</span></span>
      </label>
    </div>`;
}

/** Switch a question between multiple-choice and written. */
function setQuestionType(zone, qid, type) {
  syncDraft();
  const q = zoneQuizzes(zone)[QSET].find((x) => x._id === qid);
  if (!q || q.type === type) return;
  q.type = type === 'written' ? 'written' : 'mcq';
  if (q.type === 'mcq' && (!q.choices || q.choices.length < 2)) q.choices = ['', ''];
  render();
}

/* ---- editor state sync ---- */
function readQuizList(zone) {
  const ql = document.getElementById('quizList-' + zone);
  if (!ql) return;
  zoneQuizzes(zone)[QSET] = [...ql.querySelectorAll('.qcard')].map((cardEl) => {
    const type = cardEl.dataset.qtype === 'written' ? 'written' : 'mcq';
    const explainEl = cardEl.querySelector('.q-explain');
    const pointsEl = cardEl.querySelector('.q-points');
    const base = {
      _id: cardEl.dataset.qid,
      type,
      question: cardEl.querySelector('.q-text').value,
      points: pointsEl ? Math.max(1, Math.min(100, parseInt(pointsEl.value, 10) || 1)) : 1,
      explanation: explainEl ? explainEl.value : '',
      whiteboard: !!(cardEl.querySelector('.q-board') || {}).checked,
    };
    if (type === 'written') { base.choices = []; base.correctIndex = 0; return base; }
    base.choices = [...cardEl.querySelectorAll('.q-choice')].map((i) => i.value);
    const correct = cardEl.querySelector('.q-correct:checked');
    base.correctIndex = correct ? Number(correct.value) : 0;
    return base;
  });
}

function syncDraft() {
  if (!draft) return;
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (document.getElementById('f-title')) {
    draft.title = g('f-title'); draft.icon = g('f-icon'); draft.description = g('f-desc');
    const flowPick = document.querySelector('input[name=lesson-flow]:checked');
    if (flowPick) draft.flow = flowPick.value;
    let tl = parseInt(g('f-timelimit-pre'), 10); draft.timeLimit = Number.isFinite(tl) && tl > 0 ? Math.min(tl, 3600) : 0;
    let tp = parseInt(g('f-timelimit-post'), 10); draft.postTest.timeLimit = Number.isFinite(tp) && tp > 0 ? Math.min(tp, 3600) : 0;
  }
  const sb = document.getElementById('sbList');
  if (sb) {
    draft.storyboard = [...sb.querySelectorAll('[data-sb]')].map((r) => {
      if (r.dataset.type === 'video') {
        return { type: 'video', url: r.querySelector('.vd-url').value, title: r.querySelector('.vd-title').value };
      }
      if (r.dataset.type === 'question') {
        const typedQ = (r.querySelector('.sb-image-url').value || '').trim();
        const dataQ = r.querySelector('.sb-image-data').value || '';
        return {
          type: 'question',
          id: r.dataset.sid,
          question: r.querySelector('.sbq-text').value,
          image: typedQ || (dataQ.startsWith('data:') ? dataQ : ''),
          expected: r.querySelector('.sbq-expected').value,
          aiNote: r.querySelector('.sbq-ainote').value,
          whiteboard: r.querySelector('.sbq-board').checked,
        };
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
function addStoryQuestion() { syncDraft(); draft.storyboard.push(blankStoryQuestion()); render(); }
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
function addQuestion(zone) { syncDraft(); zoneQuizzes(zone)[QSET].push(blankQuestion()); render(); }
function removeQuestion(zone, qid) { syncDraft(); const z = zoneQuizzes(zone); z[QSET] = z[QSET].filter((q) => q._id !== qid); render(); }
function addChoice(zone, qid) { syncDraft(); const q = zoneQuizzes(zone)[QSET].find((x) => x._id === qid); if (q && q.choices.length < 6) q.choices.push(''); render(); }
function removeChoice(zone, qid, idx) {
  syncDraft();
  const q = zoneQuizzes(zone)[QSET].find((x) => x._id === qid);
  if (q && q.choices.length > 2) { q.choices.splice(idx, 1); if (q.correctIndex >= q.choices.length) q.correctIndex = 0; }
  render();
}
function cancelEdit() {
  if (!confirmDiscard()) return;
  draft = null; draftSnap = null; render(); window.scrollTo({ top: 0 });
}

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

/* Saving used to drop, silently, any question with no text or fewer than two
   filled choices — the teacher saw "Level saved" and the question was gone.
   Now: a question that is completely blank is still left out (that is just an
   unused card), but one that is half-written stops the save, and the card is
   marked so the teacher can see which one and why. */
function isBlankQuestion(q) {
  return !q.question.trim() && !(q.explanation || '').trim()
    && (q.type === 'written' || !(q.choices || []).some((c) => c.trim()));
}
function questionProblem(q) {
  if (isBlankQuestion(q)) return null;
  if (!q.question.trim()) return 't.qProbText';
  if (q.type === 'written') return null;
  if ((q.choices || []).filter((c) => c.trim()).length < 2) return 't.qProbChoices';
  if (!(q.choices[q.correctIndex] || '').trim()) return 't.qProbKey';
  return null;
}
function findQuestionProblems() {
  const out = [];
  ['pre', 'post'].forEach((zone) => {
    zoneQuizzes(zone)[QSET].forEach((q, i) => {
      const key = questionProblem(q);
      if (key) out.push({ zone, qid: q._id, n: i + 1, key });
    });
  });
  return out;
}

async function saveLesson() {
  syncDraft();
  if (!draft.title.trim()) { toast(t('t.needTitle'), 'bad'); return; }
  document.querySelectorAll('.qcard.q-invalid').forEach((el) => el.classList.remove('q-invalid'));
  document.querySelectorAll('.q-problem').forEach((el) => el.remove());
  const problems = findQuestionProblems();
  if (problems.length) {
    problems.forEach((p) => {
      const el = document.querySelector(`#quizList-${p.zone} .qcard[data-qid="${p.qid}"]`);
      if (!el) return;
      el.classList.add('q-invalid');
      // The reason stays on the card; the toast alone disappears in seconds.
      const note = document.createElement('div');
      note.className = 'q-problem';
      note.textContent = t(p.key);
      el.querySelector('.builder-head').after(note);
    });
    const p = problems[0];
    const where = t('t.qProbWhere', { test: p.zone === 'post' ? t('t.lvPost') : t('t.lvPre'), n: p.n });
    toast(where + ' ' + t(p.key) + (problems.length > 1 ? ' ' + t('t.qProbMore', { n: problems.length - 1 }) : ''), 'bad');
    const first = document.querySelector('.qcard.q-invalid');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  /* Empty choices are dropped (a student would otherwise see a blank option),
     and the correct answer follows its choice to the new position. */
  const mapQ = (arr) => arr
    .filter((q) => !isBlankQuestion(q))
    .map((q) => {
      if (q.type === 'written') {
        return { id: q._id, type: 'written', question: q.question, points: q.points || 1, explanation: q.explanation, whiteboard: !!q.whiteboard };
      }
      const kept = q.choices.map((c, i) => ({ c, i })).filter((x) => x.c.trim());
      return { id: q._id, type: 'mcq', question: q.question, choices: kept.map((x) => x.c),
        correctIndex: Math.max(0, kept.findIndex((x) => x.i === q.correctIndex)),
        points: q.points || 1, explanation: q.explanation, whiteboard: !!q.whiteboard };
    });
  const payload = {
    title: draft.title, description: draft.description, terrain: draft.terrain, icon: draft.icon,
    timeLimit: draft.timeLimit || 0,
    flow: draft.flow === 'test-first' ? 'test-first' : 'story-first',
    storyboard: draft.storyboard.filter((it) => {
      if (it.type === 'video') return it.url.trim();
      if (it.type === 'question') return it.question.trim() || it.image;
      return it.text.trim() || it.image;
    }),
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
    draft = null; draftSnap = null; await reload(); render(); window.scrollTo({ top: 0 });
  } catch (e) { toast(e.message, 'bad'); }
}

/* ============================ STUDENTS ============================ */
/* Eighteen students used to mean fifty-four buttons — an Edit, a key and a red
   bin on every single row, the destructive one the brightest thing on the page.
   Now: one Edit, everything else behind the row menu, and a filter box, because
   a real class is forty names and scanning is the actual task here. */
let studentQuery = '';

function setStudentQuery(v) {
  studentQuery = v;
  const body = document.getElementById('studentRows');
  if (body) body.innerHTML = studentRowsHtml();
  const count = document.getElementById('studentCount');
  if (count) count.textContent = t('t.studentsShowing', { n: filteredStudents().length, total: STUDENTS.length });
}

function filteredStudents() {
  const q = studentQuery.trim().toLowerCase();
  if (!q) return STUDENTS;
  return STUDENTS.filter((s) => (s.name || '').toLowerCase().includes(q)
    || (s.email || '').toLowerCase().includes(q));
}

function studentRowsHtml() {
  const list = filteredStudents();
  if (!list.length) {
    return `<tr><td colspan="5" class="empty">${esc(STUDENTS.length ? t('t.noStudentMatch') : t('t.noStudents'))}</td></tr>`;
  }
  return list.map((s) => `
    <tr>
      <td class="st-who">
        <span class="av">${avatarHtml(s.avatar, 30)}</span>
        <span class="st-id">
          <b>${esc(s.name)}${s.practice ? `<span class="practice-chip">${esc(t('t.practiceChip'))}</span>` : ''}</b>
          <span class="st-mail">${esc(s.email)}</span>
        </span>
      </td>
      <td class="num">${s.levelsCompleted}</td>
      <td class="num">${s.certificates}</td>
      <td class="num"><b>${s.points}</b></td>
      <td class="st-acts">
        <button class="tbtn ghost sm" onclick='editStudent("${s.id}")'>${ICON.pencil(14)} ${esc(t('t.edit'))}</button>
        ${TMenu.html('student-' + s.id, [
          { label: t('t.resetPw'), action: `resetPassword("${s.id}")`, icon: 'lock' },
          { label: t('t.deleteStudent'), action: `confirmDeleteStudent("${s.id}")`, icon: 'trash', danger: true },
        ], t('t.rowActions', { title: s.name }))}
      </td>
    </tr>`).join('');
}

function renderStudents() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'students'));

  viewEl.innerHTML = `
    <div class="t-head">
      <div>
        <h1>${esc(t('t.studentsTitle'))}</h1>
        <div class="sub" id="studentCount">${esc(t('t.studentsShowing', { n: filteredStudents().length, total: STUDENTS.length }))}</div>
      </div>
      <input class="t-input t-search" type="search" id="studentSearch"
             placeholder="${esc(t('t.studentSearchPh'))}" aria-label="${esc(t('t.studentSearchPh'))}"
             value="${esc(studentQuery)}" oninput="setStudentQuery(this.value)">
    </div>
    <div class="t-card t-tablewrap">
      <table class="t-table">
        <thead><tr>
          <th>${esc(t('t.thName'))}</th>
          <th class="num">${esc(t('t.thLevels'))}</th>
          <th class="num">${esc(t('t.thCerts'))}</th>
          <th class="num">${esc(t('t.thPoints'))}</th>
          <th></th>
        </tr></thead>
        <tbody id="studentRows">${studentRowsHtml()}</tbody>
      </table>
    </div>`;
}
function editStudent(id) {
  const s = STUDENTS.find((x) => x.id === id);
  openModal(`<h3>${t('t.editStudent')}</h3>
    <label class="t-label">${t('t.name')}</label><input id="es-name" class="t-input" value="${esc(s.name)}">
    <label class="t-label">${t('t.points')}</label>
    <input id="es-points" class="t-input" type="number" min="0" value="${s.points}">
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="saveStudent('${id}')">${t('common.save')}</button></div>`);
}
async function saveStudent(id) {
  const body = {
    name: document.getElementById('es-name').value,
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

/* ====================== PLAY-AS-STUDENT PREVIEW (read-only) ====================== */
/** The pre-test exactly as a student gets it — one set for everyone. */
function previewQuizSet(lesson) {
  return oneSet(lesson.quizzes);
}

function renderPreviewPicker() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'preview'));
  const rows = LESSONS.length ? LESSONS.map((l, i) => {
    const qCount = DIFFS.reduce((n, d) => n + ((l.quizzes && l.quizzes[d]) || []).length, 0);
    return `
      <div class="lesson-row">
        <div class="ico">${esc(l.icon || '🧪')}</div>
        <div class="info">
          <div class="t">${i + 1}. ${escChem(l.title)}</div>
          <div class="d lr-meta"><i>${ICON.book(14)}${(l.storyboard || []).length}</i><i>${ICON.question(14)}${qCount} ${t('t.questions')}</i></div>
        </div>
        <div class="acts"><button class="tbtn blue sm" onclick="startPreview('${l.id}')">${t('t.previewPlay')}</button></div>
      </div>`;
  }).join('') : `<div class="empty">${t('t.noLevels')}</div>`;
  viewEl.innerHTML = `
    <div class="t-head"><div><h1>${t('t.previewTitle')}</h1><div class="sub">${t('t.previewPickSub')}</div></div></div>
    ${practiceCardHtml()}
    <div class="t-card">${rows}</div>`;
}

/* ---- the teacher's own test student account ----
   The previews below are read-only and never touch an account. This is the
   other half: one real student account that belongs to the teacher, so the
   full student flow (saving, points, coins, Kru CJ) can be tested without
   using a real student. The server creates it on the first switch and keeps
   it off the leaderboard, the gradebook and battles with real students.
   api.js parks the teacher's session while it is in use. */
function practiceCardHtml() {
  const mine = STUDENTS.find((s) => s.practice);
  return `
    <div class="t-card practice-card">
      <span class="av">${avatarHtml(mine ? mine.avatar : 's1', 44)}</span>
      <div class="practice-info">
        <b>${esc(t('t.practiceTitle'))}</b>
        <span class="sub">${esc(t('t.practiceSub'))}</span>
      </div>
      <button class="tbtn" onclick="switchToPractice()">${ICON.play(15)} ${esc(t('t.practiceBtn'))}</button>
    </div>`;
}

async function switchToPractice() {
  try {
    const { token, user } = await API.post('/api/teacher/practice-student');
    API.startViewAs(token, user);
    location.href = '/dashboard.html';
  } catch (e) { toast(e.message, 'bad'); }
}

/** The activities a preview walks through, in the teacher's chosen order. */
function previewOrder(lesson) {
  const quiz = oneSet(lesson.quizzes);
  const base = lesson.flow === 'test-first' ? ['quiz', 'story'] : ['story', 'quiz'];
  return base.filter((p) => (p === 'story' ? (lesson.storyboard || []).length > 0 : quiz.length > 0));
}
/** Move to whatever the teacher put after `phase` (or the end screen). */
function pvAdvance(phase) {
  const i = preview.order.indexOf(phase);
  const next = preview.order[i + 1];
  preview.phase = next || 'done';
  preview.storyIndex = 0;
  preview.quizIndex = 0;
}

function startPreview(id) {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) return;
  const order = previewOrder(lesson);
  preview = { lessonId: id, order, phase: order[0] || 'done', storyIndex: 0, quizIndex: 0 };
  render();
}
function exitPreview() { preview = null; view = 'preview'; render(); }

function renderPreview() {
  const lesson = LESSONS.find((l) => l.id === preview.lessonId);
  if (!lesson) { preview = null; return render(); }
  let inner = '';
  if (preview.phase === 'story') inner = previewStoryHtml(lesson);
  else if (preview.phase === 'quiz') inner = previewQuizHtml(lesson);
  else inner = previewDoneHtml(lesson);
  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${esc(lesson.icon || '🧪')} ${esc(lesson.title)}</h1><div class="sub">${t('t.previewSub')}</div></div>
      <button class="tbtn ghost" onclick="exitPreview()">${t('t.previewExit')}</button>
    </div>
    <div class="tp-banner">${ICON.play(15)} ${t('t.previewBanner')}</div>
    <div class="t-card tp-stage">${inner}</div>`;
}

function previewStoryHtml(lesson) {
  const steps = lesson.storyboard || [];
  const step = steps[preview.storyIndex] || {};
  const last = preview.storyIndex === steps.length - 1;
  const after = preview.order[preview.order.indexOf('story') + 1];
  const nextLabel = last ? (after === 'quiz' ? t('t.previewStartQuiz') : t('t.previewFinish')) : t('lesson.next');
  let body;
  if (step.type === 'question') {
    body = `
      <div class="tp-ruby">${renderRuby('thinking', { size: 150 })}</div>
      ${step.image ? `<img class="tp-img" src="${esc(step.image)}" alt="">` : ''}
      <div class="tp-speech"><div class="tp-speaker">${esc(t('t.previewStoryQ'))}</div><div>${chemLinks(step.question || '')}</div></div>
      <textarea class="t-area" disabled placeholder="${esc(t('lesson.qAnswerPh'))}"></textarea>
      ${step.whiteboard ? `<div class="tp-written-note">${ICON.board(14)} ${esc(t('t.wbToggle'))}</div>` : ''}
      ${step.expected ? `<div class="grade-guide">${ICON.question(13)} ${esc(step.expected)}</div>` : ''}`;
  } else if (step.type === 'video') {
    const embed = youtubeEmbed(step.url);
    body = embed
      ? `${step.title ? `<div class="tp-vtitle">${ICON.video(14)} ${esc(step.title)}</div>` : ''}<div class="tp-video"><iframe src="${embed}" allowfullscreen loading="lazy"></iframe></div>`
      : `<p class="sub">${t('lesson.cantEmbed')}</p>`;
  } else {
    body = `
      <div class="tp-ruby">${renderRuby(step.mood || 'happy', { size: 150 })}</div>
      ${step.image ? `<img class="tp-img" src="${esc(step.image)}" alt="">` : ''}
      <div class="tp-speech"><div class="tp-speaker">${esc(speakerName(step.character))}</div><div>${chemLinks(step.text || '')}</div></div>`;
  }
  return `
    <div class="tp-story">${body}
      <div class="tp-dots">${steps.map((s, i) => `<i class="${i <= preview.storyIndex ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tp-nav">
        ${preview.storyIndex > 0 ? `<button class="tbtn ghost" onclick="pvStory(-1)">${t('lesson.back')}</button>` : ''}
        <button class="tbtn" onclick="pvStory(1)">${nextLabel}</button>
      </div>
    </div>`;
}
function pvStory(dir) {
  const lesson = LESSONS.find((l) => l.id === preview.lessonId);
  const steps = lesson.storyboard || [];
  const next = preview.storyIndex + dir;
  if (next < 0) return;
  if (next >= steps.length) pvAdvance('story');
  else preview.storyIndex = next;
  render();
}

function previewQuizHtml(lesson) {
  const questions = previewQuizSet(lesson);
  const q = questions[preview.quizIndex];
  if (!q) { preview.phase = 'done'; return previewDoneHtml(lesson); }
  const total = questions.length;
  const last = preview.quizIndex === total - 1;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  let body;
  if (q.type === 'written') {
    body = `
      <textarea class="t-area" disabled placeholder="${esc(t('lesson.writtenPlaceholder'))}"></textarea>
      <div class="tp-written-note">${ICON.pen(14)} ${t('t.previewWrittenNote')}</div>
      ${q.explanation ? `<div class="grade-guide">${ICON.question(13)} ${esc(q.explanation)}</div>` : ''}`;
  } else {
    body = `<div class="tp-choices">${(q.choices || []).map((c, i) => `
      <div class="tp-choice ${i === q.correctIndex ? 'correct' : ''}"><span class="ltr">${letters[i]}</span><span>${esc(c)}</span>${i === q.correctIndex ? `<span class="tp-correct-tag">${t('t.correct')}</span>` : ''}</div>`).join('')}</div>
      ${q.explanation ? `<div class="tp-explain">${esc(q.explanation)}</div>` : ''}`;
  }
  return `
    <div class="tp-quiz">
      <div class="q-counter">${t('lesson.question', { n: preview.quizIndex + 1, total })}</div>
      <div class="tp-qtext">${esc(q.question)}</div>
      ${body}
      <div class="tp-nav">
        ${preview.quizIndex > 0 ? `<button class="tbtn ghost" onclick="pvQuiz(-1)">${t('lesson.back')}</button>` : ''}
        <button class="tbtn" onclick="pvQuiz(1)">${last ? t('t.previewFinish') : t('lesson.next')}</button>
      </div>
    </div>`;
}
function pvQuiz(dir) {
  const lesson = LESSONS.find((l) => l.id === preview.lessonId);
  const total = previewQuizSet(lesson).length;
  const next = preview.quizIndex + dir;
  if (next < 0) return;
  if (next >= total) pvAdvance('quiz');
  else preview.quizIndex = next;
  render();
}

function previewDoneHtml(lesson) {
  return `
    <div class="tp-done">
      <div class="tp-ruby">${renderRuby('cheer', { size: 160 })}</div>
      <h2>${t('t.previewDone')}</h2>
      <p class="sub" style="color:var(--t-soft)">${t('t.previewDoneSub')}</p>
      <div class="tp-nav">
        <button class="tbtn ghost" onclick="restartPreview()">${t('t.previewReplay')}</button>
        <button class="tbtn" onclick="exitPreview()">${t('t.previewBackList')}</button>
      </div>
    </div>`;
}
function restartPreview() {
  preview.phase = preview.order[0] || 'done';
  preview.storyIndex = 0;
  preview.quizIndex = 0;
  render();
}

/* ============================= LEVEL PAGE =============================

   Everything about one level, in one place: Lessons & Levels -> a level ->
   its storyboard, pre-test, post-test, assignment board and challenges.

   Marking used to be a separate "To mark" queue in the sidebar that mixed
   every level's post-tests with every challenge. A teacher thinks "how did my
   class do on Level 3's post-test?", not "what is in the queue?", so the
   written answers now sit inside the test they belong to:

     Level page -> Pre-test / Post-test card -> "Mark answers" -> the cards
     Level page -> a challenge -> its Responses screen (same as Challenges)

   Where the marks are saved is unchanged and decided by `source` on each card:

     post (pre- or post-test) -> POST /api/teacher/submissions/:id/grade
     challenge                -> POST /api/teacher/challenges/responses/:id/grade

   The sidebar keeps the counts: Lessons & Levels shows the test answers
   waiting, Challenges the challenge answers waiting.                       */

function openLevel(id) {
  levelId = id;
  levelSub = null;
  boardLessonId = null;
  draft = null;
  render();
  window.scrollTo({ top: 0 });
  loadLevelOverview(id);
}
function closeLevel() {
  if (markingChanged() && !window.confirm(t('t.unsavedLeave'))) return;
  levelId = null; levelSub = null; chDetailOpen = {}; render();
}
function backToLevel() {
  if (markingChanged() && !window.confirm(t('t.unsavedLeave'))) return;
  levelSub = null; render(); window.scrollTo({ top: 0 });
}

/** The class counts on the level page. Painted when they arrive; the page does not wait. */
async function loadLevelOverview(id) {
  try {
    const r = await API.get(`/api/teacher/lessons/${encodeURIComponent(id)}/overview`);
    levelOverview = { lessonId: id, data: r.overview };
    if (levelId === id && !levelSub && !draft && !boardLessonId) renderLevel();
  } catch { /* the page still works without the counts */ }
}

/* The open level is kept in the address (#level=<id>) so switching language,
   which reloads the page, or pressing refresh brings the teacher back to it. */
function syncHash() {
  const want = view === 'lessons' && levelId ? '#level=' + levelId : '';
  if (location.hash !== want) {
    history.replaceState(null, '', location.pathname + location.search + want);
  }
}
function restoreHash() {
  const m = /^#level=([\w-]+)$/.exec(location.hash);
  if (m && LESSONS.some((l) => l.id === m[1])) {
    levelId = m[1];
    loadLevelOverview(levelId);
  }
}

/** Written answers waiting on one test of one level. */
function pendingFor(lessonId, mode) {
  return POST_PENDING.filter((s) => s.lessonId === lessonId && s.mode === mode);
}
function levelChallenges(lessonId) {
  return CHALLENGES.filter((c) => c.lessonId === lessonId);
}

function renderLevel() {
  const l = LESSONS.find((x) => x.id === levelId);
  if (!l) { levelId = null; levelSub = null; return renderLessons(); }
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'lessons'));
  if (levelSub === 'challenge') return TChallenges.render(viewEl);
  if (levelSub === 'mark-pre') return renderLevelMarking(l, 'pre');
  if (levelSub === 'mark-post') return renderLevelMarking(l, 'post');

  const ov = levelOverview && levelOverview.lessonId === l.id ? levelOverview.data : null;
  const story = l.storyboard || [];
  const lines = story.filter((s) => s.type !== 'video' && s.type !== 'question').length;
  const vids = story.filter((s) => s.type === 'video').length;
  const storyQs = story.filter((s) => s.type === 'question').length;
  const preQs = oneSet(l.quizzes);
  const pt = l.postTest || {};
  const postQs = oneSet(pt.quizzes);
  const gate = gateMode(l);
  const gateIcon = gate === 'locked' ? 'lock' : gate === 'scheduled' ? 'calendar' : 'unlock';

  const testCard = (mode) => {
    const qs = mode === 'pre' ? preQs : postQs;
    const written = qs.filter((q) => q.type === 'written').length;
    const waiting = pendingFor(l.id, mode).length;
    const taken = ov ? (mode === 'pre' ? ov.preTaken : ov.postTaken) : null;
    const passed = ov ? (mode === 'pre' ? ov.prePassed : ov.postPassed) : null;
    const markBtn = waiting
      ? `<button class="tbtn sm" onclick="openLevelMarking('${mode}')">${ICON.pen(15)} ${esc(t('t.lvMarkN', { n: waiting }))}</button>`
      : !qs.length
        ? `<span class="lv-clear lv-none">${esc(t('t.lvNoQsYet'))}</span>`
        : `<span class="lv-clear">${ICON.check(15)} ${esc(written ? t('t.lvNothingToMark') : t('t.lvAutoMarked'))}</span>`;
    return `
      <section class="lv-card ${waiting ? 'has-work' : ''}">
        <div class="lv-card-head">
          <span class="lv-card-ic">${ICON[mode === 'pre' ? 'question' : 'pen'](20)}</span>
          <h3>${esc(mode === 'pre' ? t('t.lvPre') : t('t.lvPost'))}</h3>
          ${mode === 'post' ? `<span class="lv-state ${pt.open ? 'on' : ''}">${esc(pt.open ? t('t.open') : t('t.closed'))}</span>` : ''}
          ${waiting ? `<span class="t-badge">${waiting}</span>` : ''}
        </div>
        <div class="lr-meta">
          ${metaBit('question', `${qs.length} ${t('t.questions')}`)}
          ${written ? metaBit('pen', t('t.lvWrittenN', { n: written })) : ''}
          ${metaBit('timer', fmtTimer(mode === 'pre' ? l.timeLimit : pt.timeLimit))}
        </div>
        ${ov ? `<div class="lv-stats">
          <span><b>${taken}</b>/${ov.students} ${esc(t('t.lvTaken'))}</span>
          <span><b>${passed}</b> ${esc(t('t.lvPassed'))}</span>
        </div>` : ''}
        <div class="lv-card-acts">
          ${markBtn}
          <button class="tbtn ghost sm" onclick="editLesson('${l.id}','${mode}')">${ICON.pencil(15)} ${esc(t('t.lvEditQs'))}</button>
          ${mode === 'post' && (pt.open || qs.length) ? `<button class="tbtn ghost sm" onclick="togglePostTest('${l.id}', ${pt.open ? 'false' : 'true'})">
            ${ICON[pt.open ? 'lock' : 'unlock'](15)} ${esc(pt.open ? t('t.closePostTest') : t('t.openPostTest'))}</button>` : ''}
        </div>
      </section>`;
  };

  // The two activities in the order the student meets them (the teacher's flow).
  const storyCard = `
      <section class="lv-card">
        <div class="lv-card-head">
          <span class="lv-card-ic">${ICON.book(20)}</span>
          <h3>${esc(t('t.storyboard'))}</h3>
        </div>
        <div class="lr-meta">
          ${metaBit('lines', `${lines} ${t('t.lines')}`)}
          ${metaBit('video', `${vids} ${vids === 1 ? t('t.videos') : t('t.videosPlural')}`)}
          ${storyQs ? metaBit('chat', `${storyQs} ${t('t.storyQCount')}`) : ''}
        </div>
        ${ov ? `<div class="lv-stats">
          <span><b>${ov.storyDone}</b>/${ov.students} ${esc(t('t.lvRead'))}</span>
          ${ov.storyReading ? `<span><b>${ov.storyReading}</b> ${esc(t('t.lvReading'))}</span>` : ''}
        </div>` : ''}
        <div class="lv-card-acts">
          <button class="tbtn ghost sm" onclick="editLesson('${l.id}','story')">${ICON.pencil(15)} ${esc(t('t.lvEditStory'))}</button>
          ${storyQs ? `<button class="tbtn ghost sm" onclick="openStoryAnswers()">${ICON.chat(15)} ${esc(t('t.lvStoryAnswers'))}</button>` : ''}
        </div>
      </section>`;

  const chs = levelChallenges(l.id);
  const catName = (id) => {
    const c = (typeof CH_CATS !== 'undefined' ? CH_CATS : []).find((x) => x.id === id);
    return c ? c.name : '';
  };
  const chRows = chs.length ? chs.map((c, i) => {
    const assigned = c.assign && c.assign.mode === 'some'
      ? t('t.chAssignedN', { n: (c.assign.studentIds || []).length })
      : t('t.chAssignedAll');
    const open = !!chDetailOpen[c.id];
    return `
      <div class="lv-ch-row">
        <div class="lv-ch-main">
          <div class="lv-ch-info">
            <div class="lv-ch-title">${chem(c.title)}
              <span class="t-pill ${c.published ? 'pub' : 'draft'}">${esc(c.published ? t('t.chPublished') : t('t.chDraft'))}</span>
              ${catName(c.categoryId) ? `<span class="lv-ch-cat">${esc(catName(c.categoryId))}</span>` : ''}
            </div>
            <div class="lr-meta">
              ${metaBit('question', qCountLabel(c.questionCount || 0))}
              ${metaBit('star', ptsLabel(c.maxPoints || 0))}
              ${metaBit('people', assigned)}
              ${metaBit('pen', t('t.lvHandedIn', { n: c.responses || 0 }))}
              ${c.dueAt ? metaBit('calendar', t('t.chdDue', { when: fmtWhen(c.dueAt) })) : ''}
            </div>
          </div>
          <div class="lv-ch-acts">
            <button class="tbtn ghost sm" aria-expanded="${open}" onclick="toggleChDetail('${c.id}')">
              ${ICON[open ? 'up' : 'down'](14)} ${esc(t('t.chdView'))}</button>
            <button class="tbtn ${c.pending ? '' : 'ghost'} sm" onclick="openLevelChallenge('${c.id}')">
              ${esc(c.pending ? t('t.lvMarkN', { n: c.pending }) : t('t.chResponses'))}
            </button>
            ${TMenu.html('lvch-' + c.id, [
              { label: t('t.edit'), action: `levelEditChallenge('${c.id}')`, icon: 'pencil' },
              { label: t('t.chAssign'), action: `TC.openAssign('${c.id}')`, icon: 'people' },
              { label: c.published ? t('t.chUnpublish') : t('t.chPublish'),
                action: `TC.togglePublish('${c.id}', ${c.published ? 'false' : 'true'})`,
                icon: c.published ? 'lock' : 'unlock' },
              { label: t('t.moveUp'), action: `TC.move('${c.id}','up')`, icon: 'up', disabled: i === 0 },
              { label: t('t.moveDown'), action: `TC.move('${c.id}','down')`, icon: 'down', disabled: i === chs.length - 1 },
              { label: t('t.chDelete'), action: `TC.confirmDelete('${c.id}')`, icon: 'trash', danger: true },
            ], t('t.rowActions', { title: c.title }))}
          </div>
        </div>
        <div class="lv-ch-detail" id="chd-${c.id}" ${open ? '' : 'hidden'}>${open ? chDetailBody(c.id) : ''}</div>
      </div>`;
  }).join('')
    : `<p class="lv-empty">${esc(t('t.lvNoChallenges'))}</p>`;

  viewEl.innerHTML = `
    <nav class="lv-crumbs" aria-label="${esc(t('t.lvCrumbs'))}">
      <button type="button" onclick="closeLevel()">${esc(t('t.navLessons'))}</button>
      <span aria-hidden="true">/</span>
      <span>${escChem(l.title)}</span>
    </nav>
    <div class="t-head">
      <div class="lv-title">
        <span class="lv-icon" aria-hidden="true">${esc(l.icon || '🧪')}</span>
        <div>
          <h1>${escChem(l.title)}</h1>
          <div class="sub">${esc(l.flow === 'test-first' ? t('t.flowBadgeTest') : t('t.flowBadgeStory'))}${l.description ? ' · ' + escChem(l.description) : ''}</div>
        </div>
      </div>
      <div class="row" style="gap:8px">
        <button class="tbtn ghost" onclick="closeLevel()">${t('common.back')}</button>
        <button class="tbtn" onclick="editLesson('${l.id}')">${ICON.pencil(16)} ${esc(t('t.lvEditLevel'))}</button>
      </div>
    </div>

    <div class="lr-state lv-gate">
      <button class="chip chip-${gate}" onclick="openGate('${l.id}')">
        ${ICON[gateIcon](14)}<b>${esc(t('t.access'))}</b> ${esc(gateLabel(l))}
      </button>
      ${ov ? `<span class="lv-class">${ICON.people(15)} ${esc(t('t.lvStudents', { n: ov.students }))}</span>` : ''}
    </div>

    <div class="lv-grid">
      ${l.flow === 'test-first' ? testCard('pre') + storyCard : storyCard + testCard('pre')}
      ${testCard('post')}
      <section class="lv-card lv-board-card">
        <div class="lv-card-head">
          <span class="lv-card-ic">${ICON.people(20)}</span>
          <h3>${esc(t('t.lvBoardTitle'))}</h3>
        </div>
        <p class="lv-desc">${esc(t('t.lvBoardDesc'))}</p>
        ${ov ? `<div class="lv-stats">
          <span><b>${ov.posts}</b> ${esc(t('t.lvPosts'))}</span>
          <span><b>${ov.studentPosts}</b> ${esc(t('t.lvFromStudents'))}</span>
        </div>` : ''}
        <div class="lv-card-acts">
          <button class="tbtn sm" onclick="openBoard('${l.id}')">${ICON.people(15)} ${esc(t('t.lvOpenBoard'))}</button>
        </div>
      </section>

    </div>

    <section class="t-card lv-chs">
      <div class="t-head" style="margin:0 0 6px">
        <h3 style="margin:0">${ICON.puzzle(18)} ${esc(t('t.lvChallenges'))}</h3>
        <div class="row" style="gap:8px">
          <button class="tbtn sm" onclick="levelNewChallenge()">${ICON.plus(14)} ${esc(t('t.chNewShort'))}</button>
        </div>
      </div>
      ${chRows}
      <details class="t-fold lv-cats" ${catsFoldOpen ? 'open' : ''} ontoggle="catsFoldOpen = this.open">
        <summary>${ICON.lines(15)} ${esc(t('t.lvCatsFold'))}</summary>
        <div class="t-card" id="catCard"></div>
      </details>
    </section>`;
  TChallenges.mountCategories();
}

/* ---- the level's challenges ----
   Everything the old Challenges menu item did now happens here, in the level
   the challenge belongs to. "View" opens a read-only list of a challenge's
   questions with their answer keys — published challenges included, without
   going through the editor. */

function chDetailBody(id) {
  const d = chDetailOpen[id];
  if (d === 'loading') return `<p class="lv-empty">${esc(t('common.loading'))}</p>`;
  if (!d || d === 'error') return `<p class="lv-empty">${esc(t('t.chdError'))}</p>`;
  return TChallenges.detailHtml(d);
}
async function toggleChDetail(id) {
  if (chDetailOpen[id]) { delete chDetailOpen[id]; return renderLevel(); }
  chDetailOpen[id] = 'loading';
  renderLevel();
  try { chDetailOpen[id] = await TChallenges.fetchFull(id); }
  catch { chDetailOpen[id] = 'error'; }
  if (chDetailOpen[id] && levelId && !levelSub) renderLevel();
}
function levelNewChallenge() {
  levelSub = 'challenge';
  TC.newChallenge(levelId);
  window.scrollTo({ top: 0 });
}
function levelEditChallenge(id) {
  levelSub = 'challenge';
  chDetailOpen = {};          // it may be about to change
  TC.edit(id);
  window.scrollTo({ top: 0 });
}

function openLevelMarking(mode) {
  levelSub = mode === 'pre' ? 'mark-pre' : 'mark-post';
  render();
  window.scrollTo({ top: 0 });
}

/* One test's written answers, grouped BY QUESTION: each question once at the
   top, every student's answer to it underneath. It used to be one card per
   student, each repeating every question in full, so a class set of one
   paragraph question filled screen after screen with the same words.

   A student's attempt is finalised as a whole (the server adds the written
   marks to the auto-marked part and works out pass/fail), so "Save marks"
   saves only the students whose every answer has a score. Boxes start empty
   rather than at 0 — an untouched box used to save as a real 0. Exceptions:
   a blank answer starts at 0, and Kru CJ's suggestion, if there is one,
   pre-fills its box as before. */
function markingQuestions(rows) {
  const qs = [];
  const byId = {};
  rows.forEach((s) => s.written.forEach((w) => {
    let q = byId[w.questionId];
    if (!q) {
      q = byId[w.questionId] = { qid: w.questionId, question: w.question, points: w.points, guide: w.guide, answers: [] };
      qs.push(q);
    }
    q.answers.push({ s, w });
  }));
  return qs;
}

function renderLevelMarking(l, mode) {
  const rows = pendingFor(l.id, mode);
  const testName = mode === 'pre' ? t('t.lvPre') : t('t.lvPost');
  const qs = markingQuestions(rows);
  const blocks = qs.map((q, qi) => `
    <section class="t-card mq">
      <div class="mq-head">
        <span class="grade-q-n">${qi + 1}</span>
        <div class="mq-qtext">${escChem(q.question)}</div>
        <span class="grade-qpts">${esc(t('t.outOf', { n: q.points }))}</span>
      </div>
      ${q.guide ? `<div class="grade-guide">${ICON.question(13)} ${esc(q.guide)}</div>` : ''}
      <div class="mq-ai">
        <button class="tbtn ghost sm" onclick="analyzeTestQuestion('${l.id}','${mode}','${esc(q.qid)}')">
          ${ICON.chat(14)} ${esc(t('t.anButton'))}</button>
        <span class="lg-muted">${esc(t('t.anTestHint', { n: q.answers.length }))}</span>
      </div>
      <div class="mq-answers">
        ${q.answers.map(({ s, w }) => {
          const start = w.ai ? w.ai.score : (w.answer ? '' : 0);
          return `
          <div class="mq-ans">
            <div class="mq-who"><span class="av">${avatarHtml(s.userAvatar, 28)}</span><b>${esc(s.userName)}</b></div>
            <div class="mq-text">${w.answer ? escChem(w.answer) : `<span class="grade-blank">${esc(t('t.gradeNoAnswer'))}</span>`}
              ${w.ai ? `<div class="grade-ai">${ICON.chat(13)} ${esc(t('t.aiSuggests', { s: w.ai.score, m: w.ai.outOf }))}
                ${w.ai.feedback ? `<span>${esc(w.ai.feedback)}</span>` : ''}</div>
                ${(w.ai.criteria || []).length ? `<ul class="ai-crit">${w.ai.criteria.map((c) => `
                  <li class="${c.met ? 'met' : 'unmet'}">${c.met ? ICON.check(13) : ICON.close(13)}<span>${esc(c.name)}</span></li>`).join('')}</ul>` : ''}` : ''}</div>
            <label class="mq-score">
              <span class="sr-only">${esc(t('t.mqScoreFor', { name: s.userName }))}</span>
              <input type="number" class="mq-input" min="0" max="${w.points}" step="1" placeholder="–"
                     data-sid="${esc(s.id)}" data-qid="${esc(w.questionId)}" data-max="${w.points}"
                     data-init="${start}" value="${start}" oninput="markingCount()">
              <span class="grade-outof">/ ${w.points}</span>
            </label>
          </div>`;
        }).join('')}
      </div>
    </section>`).join('');

  viewEl.innerHTML = `
    <nav class="lv-crumbs" aria-label="${esc(t('t.lvCrumbs'))}">
      <button type="button" onclick="closeLevel()">${esc(t('t.navLessons'))}</button>
      <span aria-hidden="true">/</span>
      <button type="button" onclick="backToLevel()">${escChem(l.title)}</button>
      <span aria-hidden="true">/</span>
      <span>${esc(testName)}</span>
    </nav>
    <div class="t-head">
      <div>
        <h1>${esc(t('t.lvMarkTitle', { test: testName }))}</h1>
        <div class="sub">${esc(rows.length === 1 ? t('t.mqSub1') : rows.length ? t('t.mqSub', { n: rows.length }) : t('t.markSubEmpty'))}</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="tbtn ghost" onclick="backToLevel()">${t('common.back')}</button>
        <button class="tbtn ghost" onclick="reloadLevelMarking()">${esc(t('t.refresh'))}</button>
      </div>
    </div>
    ${rows.length ? blocks + `
      <div class="mq-foot">
        <span id="mqCount"></span>
        <button class="tbtn" id="mqSave" onclick="saveLevelMarks()">${esc(t('t.mqSave'))}</button>
      </div>` : `<div class="t-card empty">${esc(t('t.lvAllMarked'))}</div>`}`;
  markingCount();
}

/** Each submission's score boxes; a student is ready when none is empty. */
function markingStudents() {
  const by = {};
  document.querySelectorAll('.mq-input').forEach((inp) => {
    (by[inp.dataset.sid] = by[inp.dataset.sid] || []).push(inp);
  });
  return Object.entries(by).map(([sid, inputs]) => ({
    sid, inputs, ready: inputs.every((i) => i.value.trim() !== ''),
  }));
}
function markingCount() {
  const st = markingStudents();
  const ready = st.filter((x) => x.ready).length;
  const el = document.getElementById('mqCount');
  if (el) el.textContent = t('t.mqReady', { r: ready, n: st.length });
  const btn = document.getElementById('mqSave');
  if (btn) btn.disabled = !ready;
}
function markingChanged() {
  if (!levelSub || !levelSub.startsWith('mark-')) return false;
  return [...document.querySelectorAll('.mq-input')].some((i) => i.value !== i.dataset.init);
}

async function saveLevelMarks() {
  const st = markingStudents();
  const ready = st.filter((x) => x.ready);
  if (!ready.length) return;
  const btn = document.getElementById('mqSave');
  if (btn) { btn.disabled = true; btn.textContent = t('t.gradeSaving'); }
  let saved = 0;
  const failed = [];
  for (const x of ready) {
    const scores = {};
    x.inputs.forEach((inp) => {
      const max = Number(inp.dataset.max) || 0;
      let v = parseInt(inp.value, 10);
      if (!Number.isFinite(v) || v < 0) v = 0; if (v > max) v = max;
      scores[inp.dataset.qid] = v;
    });
    try { await API.post(`/api/teacher/submissions/${x.sid}/grade`, { scores }); saved += 1; }
    catch (e) { failed.push(e.message); }
  }
  const left = st.length - saved;
  if (failed.length) toast(failed[0], 'bad');
  toast(left ? t('t.mqSavedSome', { n: saved, left }) : t('t.mqSavedAll', { n: saved }), saved ? 'good' : 'bad');
  /* Re-render with what is still waiting; typed-but-unsaved boxes of students
     who were not complete are kept, so a partial pass is not thrown away. */
  const keep = {};
  st.filter((x) => !x.ready).forEach((x) => x.inputs.forEach((i) => { if (i.value.trim() !== '') keep[x.sid + '|' + i.dataset.qid] = i.value; }));
  try { await reload(); } catch { /* render what we have */ }
  render();
  document.querySelectorAll('.mq-input').forEach((i) => {
    const k = keep[i.dataset.sid + '|' + i.dataset.qid];
    if (k != null) i.value = k;
  });
  markingCount();
  loadLevelOverview(levelId);
}

/* "Analyze with Kru CJ" on one question: the teacher sees the question and
   its answer guide, can change the criteria and add an instruction, then Kru
   CJ reads every student's answer to it — one request per student, so a long
   class set never hits the host's time limit and the teacher sees progress.
   Suggestions pre-fill only EMPTY score boxes; anything typed stays. */
function analyzeTestQuestion(lessonId, mode, qid) {
  const rows = pendingFor(lessonId, mode).filter((s) => s.written.some((w) => w.questionId === qid));
  const w0 = rows.length ? rows[0].written.find((w) => w.questionId === qid) : null;
  if (!w0) return;
  TAnalyze.open({
    intro: t('t.anTestIntro', { n: rows.length }),
    items: [{ id: qid, question: w0.question, expected: w0.guide || '', note: '' }],
    needExpected: true,
    run: async (overrides, progress) => {
      const o = overrides[qid];
      const typed = typedMarks();
      let done = 0;
      for (const s of rows) {
        progress(t('t.aiMarking', { n: done + 1, total: rows.length, name: s.userName }));
        await API.post(`/api/teacher/submissions/${s.id}/ai-mark`, { questionId: qid, expected: o.expected, note: o.note, lang: getLang() });
        done += 1;
      }
      try { await reload(); } catch { /* repaint what we have */ }
      render();
      restoreTypedMarks(typed);
      toast(t('t.anDone', { n: done }), 'good');
    },
  });
}
/** Score boxes the teacher has typed in (keyed submission|question), to survive a repaint. */
function typedMarks() {
  const out = {};
  document.querySelectorAll('.mq-input').forEach((i) => {
    if (i.value.trim() !== '' && i.value !== i.dataset.init) out[i.dataset.sid + '|' + i.dataset.qid] = i.value;
  });
  return out;
}
function restoreTypedMarks(map) {
  document.querySelectorAll('.mq-input').forEach((i) => {
    const k = map[i.dataset.sid + '|' + i.dataset.qid];
    if (k != null) i.value = k;
  });
  markingCount();
}

async function reloadLevelMarking() {
  try { await reload(); render(); }
  catch (e) { toast(e.message, 'bad'); }
}

/** A challenge's Responses screen, opened from the level page; Back returns here. */
function openLevelChallenge(id) {
  levelSub = 'challenge';
  TC.openResponses(id);
  window.scrollTo({ top: 0 });
}

/** The storyboard questions' answers live in Student Logs, by question. */
function openStoryAnswers() {
  view = 'logs'; draft = null; boardLessonId = null; preview = null; levelId = null; levelSub = null;
  syncHash();
  TLogs.reset();
  TLogs.openTab(viewEl, 'story');
}

/* ============================ GRADEBOOK ============================ */
/* The Total column used to add raw scores across columns with different
   maximums ("18" from /20 plus "70" from /100 read as 88 of nothing) and
   showed 0 for a student with no scores at all. It now reads
   "earned / possible · percent", where possible counts only the columns that
   have a score for that student — an empty cell is "not marked yet", not 0. */
function gbTotalHtml(grades) {
  let earned = 0, possible = 0;
  (GRADEBOOK.columns || []).forEach((c) => {
    const v = grades[c.id];
    if (v == null || v === '') return;
    earned += Number(v) || 0;
    possible += Number(c.max) || 0;
  });
  if (!possible) return '—';
  const r = (n) => Math.round(n * 100) / 100;
  return `<b>${r(earned)}</b> / ${r(possible)} <span class="gb-pct">${Math.round((earned / possible) * 100)}%</span>`;
}

async function renderGradebook() {
  document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'gradebook'));
  viewEl.innerHTML = `<div class="t-head"><div><h1>${t('t.gradebookTitle')}</h1><div class="sub">${t('t.gradebookSub')}</div></div></div>
    <div class="t-card"><p class="center" style="color:var(--t-soft)">${t('common.loading')}</p></div>`;
  try { GRADEBOOK = await API.get('/api/teacher/gradebook'); paintGradebook(); }
  catch (e) { toast(e.message, 'bad'); }
}

function paintGradebook() {
  const cols = GRADEBOOK.columns || [];
  const rows = GRADEBOOK.rows || [];
  const head = `
    <tr>
      <th class="gb-sticky gb-corner">${t('t.gbStudent')}</th>
      ${cols.map((c) => `<th class="gb-col"><button class="gb-col-edit" onclick="editGbColumn('${c.id}')" title="${esc(t('t.gbEditCol'))}">${esc(c.name)} <span class="gb-max">/${c.max}</span> ${ICON.pencil(13)}</button></th>`).join('')}
      <th class="gb-total-h">${t('t.gbTotal')}</th>
    </tr>`;
  const body = rows.length ? rows.map((r) => {
    const cells = cols.map((c) => {
      const v = r.grades[c.id];
      return `<td><input class="gb-cell" type="number" min="0" max="${c.max}" step="any" value="${v == null ? '' : v}"
        data-sid="${r.id}" data-cid="${c.id}" onchange="saveScore('${r.id}','${c.id}',this)"></td>`;
    }).join('');
    return `<tr>
      <td class="gb-sticky gb-name"><span class="av">${avatarHtml(r.avatar, 24)}</span> ${esc(r.name)}</td>
      ${cells}
      <td class="gb-total" data-sid="${r.id}">${gbTotalHtml(r.grades)}</td>
    </tr>`;
  }).join('') : `<tr><td class="gb-sticky">—</td><td colspan="${cols.length + 1}" class="empty">${t('t.gbNoStudents')}</td></tr>`;

  viewEl.innerHTML = `
    <div class="t-head">
      <div><h1>${t('t.gradebookTitle')}</h1><div class="sub">${t('t.gradebookSub')}</div></div>
      <div class="row" style="gap:8px">
        <button class="tbtn ghost" onclick="importGbScores()">${t('t.gbImport')}</button>
        <button class="tbtn" onclick="addGbColumn()">${t('t.gbAddColumn')}</button>
      </div>
    </div>
    <div class="t-card">
      ${cols.length === 0 ? `<div class="sub" style="color:var(--t-soft);margin-bottom:10px">${t('t.gbNoColumns')}</div>` : ''}
      <div class="gb-wrap">
        <table class="gb-table"><thead>${head}</thead><tbody>${body}</tbody></table>
      </div>
    </div>`;
}

function recomputeGbTotal(sid) {
  const row = (GRADEBOOK.rows || []).find((x) => x.id === sid);
  const el = document.querySelector(`.gb-total[data-sid="${sid}"]`);
  if (row && el) el.innerHTML = gbTotalHtml(row.grades);
}

async function saveScore(studentId, columnId, input) {
  const raw = input.value.trim();
  try {
    const r = await API.post('/api/teacher/gradebook/score', { studentId, columnId, score: raw === '' ? '' : Number(raw) });
    input.value = r.score == null ? '' : r.score;
    const row = GRADEBOOK.rows.find((x) => x.id === studentId);
    if (row) { if (r.score == null) delete row.grades[columnId]; else row.grades[columnId] = r.score; }
    recomputeGbTotal(studentId);
  } catch (e) { toast(e.message, 'bad'); }
}

function addGbColumn() {
  openModal(`<h3>${t('t.gbAddColumn')}</h3>
    <label class="t-label">${t('t.gbColName')}</label>
    <input id="gc-name" class="t-input" placeholder="${esc(t('t.gbColNamePh'))}" maxlength="60">
    <label class="t-label">${t('t.gbColMax')}</label>
    <input id="gc-max" class="t-input" type="number" min="1" value="100" style="max-width:140px">
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="doAddGbColumn()">${t('common.save')}</button></div>`);
  setTimeout(() => { const el = document.getElementById('gc-name'); if (el) el.focus(); }, 40);
}
async function doAddGbColumn() {
  const name = document.getElementById('gc-name').value.trim();
  const max = parseInt(document.getElementById('gc-max').value, 10) || 100;
  if (!name) { toast(t('t.gbColName'), 'bad'); return; }
  await saveGbColumns([...GRADEBOOK.columns.map((c) => ({ id: c.id, name: c.name, max: c.max })), { name, max }]);
  closeModal();
}

function editGbColumn(id) {
  const c = GRADEBOOK.columns.find((x) => x.id === id);
  if (!c) return;
  openModal(`<h3>${t('t.gbEditCol')}</h3>
    <label class="t-label">${t('t.gbColName')}</label>
    <input id="gc-name" class="t-input" value="${esc(c.name)}" maxlength="60">
    <label class="t-label">${t('t.gbColMax')}</label>
    <input id="gc-max" class="t-input" type="number" min="1" value="${c.max}" style="max-width:140px">
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn danger" onclick="deleteGbColumn('${id}')">${t('t.gbDeleteCol')}</button>
      <span style="flex:1"></span>
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="doEditGbColumn('${id}')">${t('common.save')}</button></div>`);
}
async function doEditGbColumn(id) {
  const name = document.getElementById('gc-name').value.trim();
  const max = parseInt(document.getElementById('gc-max').value, 10) || 100;
  await saveGbColumns(GRADEBOOK.columns.map((c) => c.id === id ? { id: c.id, name: name || c.name, max } : { id: c.id, name: c.name, max: c.max }));
  closeModal();
}
function deleteGbColumn(id) {
  const c = GRADEBOOK.columns.find((x) => x.id === id);
  if (!c) return;
  const n = (GRADEBOOK.rows || []).filter((r) => r.grades[id] != null && r.grades[id] !== '').length;
  openModal(`<h3>${esc(t('t.gbDeleteColQ'))}</h3>
    <p>${esc(t('t.gbDeleteColMsg', { name: c.name, n }))}</p>
    <div class="editor-actions" style="border:none;padding:0">
      <button class="tbtn ghost" onclick="editGbColumn('${id}')">${t('common.cancel')}</button>
      <button class="tbtn danger" onclick="doDeleteGbColumn('${id}')">${t('t.gbDeleteCol')}</button></div>`);
}
async function doDeleteGbColumn(id) {
  await saveGbColumns(GRADEBOOK.columns.filter((c) => c.id !== id).map((c) => ({ id: c.id, name: c.name, max: c.max })));
  closeModal();
}
async function saveGbColumns(columns) {
  try {
    await API.post('/api/teacher/gradebook/columns', { columns });
    GRADEBOOK = await API.get('/api/teacher/gradebook');
    paintGradebook();
    toast(t('t.gbSaved'), 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

function importGbScores() {
  const lessonOpts = LESSONS.map((l, i) => `<option value="${l.id}">${i + 1}. ${esc(l.title)}</option>`).join('');
  const chOpts = CHALLENGES.map((c) => `<option value="${c.id}">${esc((c.icon || '🧩') + ' ' + c.title)}</option>`).join('');
  openModal(`<h3>${t('t.gbImportTitle')}</h3>
    <p class="sub" style="color:var(--t-soft);margin-top:-4px">${t('t.gbImportHint')}</p>
    <label class="t-label">${t('t.gbImportSource')}</label>
    <select id="gi-source" class="t-select" onchange="syncGbImportUI()">
      <option value="post">${t('t.gbImportPost')}</option>
      <option value="pre">${t('t.gbImportPre')}</option>
      ${CHALLENGES.length ? `<option value="challenge">${t('t.gbImportChallenge')}</option>` : ''}
    </select>
    <div id="gi-lesson-row">
      <label class="t-label">${t('t.gbImportPick')}</label>
      <select id="gi-lesson" class="t-select">${lessonOpts}</select>
    </div>
    <div id="gi-challenge-row" style="display:none">
      <label class="t-label">${t('t.gbImportChallengePick')}</label>
      <select id="gi-challenge" class="t-select">${chOpts}</select>
    </div>
    <div class="editor-actions" style="border:none;padding-top:14px">
      <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
      <button class="tbtn" onclick="doImportGbScores()">${t('t.gbImport')}</button></div>`);
}
/** Show the level picker or the challenge picker, depending on the source. */
function syncGbImportUI() {
  const isChallenge = document.getElementById('gi-source').value === 'challenge';
  document.getElementById('gi-lesson-row').style.display = isChallenge ? 'none' : '';
  document.getElementById('gi-challenge-row').style.display = isChallenge ? '' : 'none';
}

async function doImportGbScores() {
  const source = document.getElementById('gi-source').value;
  const body = source === 'challenge'
    ? { challengeId: document.getElementById('gi-challenge').value }
    : { lessonId: document.getElementById('gi-lesson').value, source };
  try {
    GRADEBOOK = await API.post('/api/teacher/gradebook/import', body);
    closeModal();
    paintGradebook();
    toast(GRADEBOOK.updated ? t('t.gbImportUpdated') : t('t.gbImported'), 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ============================ MODAL ============================ */
/** `cls` widens the box for panes that need it ('wide'); omit it for the rest. */
function openModal(html, cls) {
  document.getElementById('modalHost').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal${cls ? ' ' + cls : ''}">${html}</div></div>`;
}
function closeModal() { document.getElementById('modalHost').innerHTML = ''; }
