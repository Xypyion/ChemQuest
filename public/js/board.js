// Level board (hub): clicking a level on the map lands here first.
// Tabs: 🏠 Board (start the level / post-test) and 📒 Assignments (the feed).

guard('student');
addClouds();
mountLangSwitch();

const params = new URLSearchParams(location.search);
const LESSON_ID = params.get('id');
const boardEl = document.getElementById('board');

let lesson = null;
let tab = params.get('tab') === 'assignments' ? 'assignments' : 'board';

init();

async function init() {
  if (!LESSON_ID) { boardEl.innerHTML = errBox(t('lesson.noLevel')); return; }
  try {
    lesson = (await API.get('/api/lessons/' + encodeURIComponent(LESSON_ID))).lesson;
    document.getElementById('lessonTitlePill').textContent = lesson.icon + ' ' + lesson.title;
    const dp = document.getElementById('diffPill');
    dp.className = 'pill ' + lesson.difficulty;
    dp.textContent = lesson.difficulty.toUpperCase();
    render();
  } catch (e) { boardEl.innerHTML = errBox(e.message); }
}

function errBox(msg) {
  return `<div class="center stack card" style="padding:26px">
    <div>${renderRuby('sad', { size: 150 })}</div>
    <h2>${t('common.oops')}</h2>
    <p class="muted">${escapeHtml(msg)}</p>
    <a class="btn secondary" href="/dashboard.html">${t('lesson.backToMap')}</a>
  </div>`;
}

function setTab(which) {
  tab = which;
  render();
}

function render() {
  const pt = lesson.postTest || {};
  const tabs = `
    <div class="board-tabs" role="tablist">
      <button role="tab" aria-selected="${tab === 'board'}" class="${tab === 'board' ? 'on' : ''}" onclick="setTab('board')">${t('board.tabBoard')}</button>
      <button role="tab" aria-selected="${tab === 'assignments'}" class="${tab === 'assignments' ? 'on' : ''}" onclick="setTab('assignments')">${t('board.tabAssignments')}</button>
    </div>`;

  const hero = `
    <div class="board-hero pop-in">
      <div>${renderRuby(lesson.preDone ? 'cheer' : 'wave', { size: 110, float: true })}</div>
      <div class="bh-info">
        <h1>${escapeHtml(lesson.icon)} ${escapeHtml(lesson.title)}</h1>
        <div class="bh-desc">${escapeHtml(lesson.description || t('board.welcome'))}</div>
      </div>
    </div>`;

  let body = '';
  if (tab === 'board') {
    // 1) Start the level (story + video + pre-test)
    const preState = lesson.preDone
      ? `<span class="bi-state done">${t('board.preDone', { score: lesson.preBestScore })}</span>`
      : `<span class="bi-state go">PLAY ▶</span>`;
    const preSub = lesson.preDone ? t('board.replay') : t('board.startLevelSub');

    // 2) Assignments
    // 3) Post-test (locked until the teacher opens it)
    const ptOpen = pt.open && pt.questionCount > 0;
    let ptSub, ptState, ptCls = '';
    if (ptOpen) {
      ptSub = pt.done ? t('board.postTestDone', { score: pt.bestScore }) : t('board.postTestOpenSub');
      ptState = pt.done ? `<span class="bi-state done">✓</span>` : `<span class="bi-state go">GO ▶</span>`;
    } else {
      ptCls = 'locked';
      ptSub = pt.questionCount === 0 && pt.open ? t('board.postTestNoQ') : t('board.postTestLockedSub');
      ptState = `<span class="bi-state">🔒</span>`;
    }

    body = `
      <div class="board-menu">
        <button class="board-item" onclick="location.href='/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=pre'">
          <span class="bi-emoji">📖</span>
          <span class="bi-text"><span class="bi-title">${t('board.startLevel')}</span><br><span class="bi-sub">${preSub}</span></span>
          ${preState}
        </button>

        <button class="board-item" onclick="setTab('assignments')">
          <span class="bi-emoji">📒</span>
          <span class="bi-text"><span class="bi-title">${t('board.assignments')}</span><br><span class="bi-sub">${t('board.assignmentsSub')}</span></span>
        </button>

        <button class="board-item ${ptCls}" ${ptOpen ? `onclick="location.href='/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=post'"` : 'aria-disabled="true"'}>
          <span class="bi-emoji">🧾</span>
          <span class="bi-text"><span class="bi-title">${t('board.postTest')}</span><br><span class="bi-sub">${ptSub}</span></span>
          ${ptState}
        </button>
      </div>`;
  } else {
    body = `<div id="feedHost"></div>`;
  }

  boardEl.innerHTML = hero + tabs + body;
  if (tab === 'assignments') Feed.mount(document.getElementById('feedHost'), LESSON_ID, { teacher: false });
}
