// Level board (hub): clicking a level on the map lands here first.
// Tabs: 🏠 Board · 📒 Assignments · 🧩 Challenges.
//
// The board menu lists every activity of the level in the order the teacher
// chose. The storyboard and the pre-test are two SEPARATE activities: the
// teacher decides which one comes first (lesson.activities.flow) and the other
// one stays locked until the first is finished.

guard('student');
mountLangSwitch();

const params = new URLSearchParams(location.search);
const LESSON_ID = params.get('id');
const boardEl = document.getElementById('board');

let lesson = null;
let challenges = null;   // { challenges: [], categories: [] } once loaded
let tab = ['assignments', 'challenges'].includes(params.get('tab')) ? params.get('tab') : 'board';

init();

async function init() {
  if (!LESSON_ID) { boardEl.innerHTML = errBox(t('lesson.noLevel')); return; }
  try {
    lesson = (await API.get('/api/lessons/' + encodeURIComponent(LESSON_ID))).lesson;
    document.getElementById('lessonTitlePill').textContent = lesson.icon + ' ' + lesson.title;
    const dp = document.getElementById('diffPill');
    dp.className = 'pill ' + lesson.difficulty;
    dp.textContent = tDiff(lesson.difficulty);
    loadChallenges();
    render();
  } catch (e) { boardEl.innerHTML = errBox(e.message); }
}

/** Challenges load in the background so the board paints immediately. */
async function loadChallenges() {
  try {
    challenges = await API.get('/api/challenges/lesson/' + encodeURIComponent(LESSON_ID));
  } catch (e) {
    challenges = { challenges: [], categories: [], error: e.message };
  }
  render();
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

/** One row of the board menu. `href` null = not clickable. */
function menuItem({ emoji, title, sub, state, cls, href, onclick }) {
  const action = href ? `onclick="location.href='${href}'"` : onclick ? `onclick="${onclick}"` : 'aria-disabled="true"';
  return `
    <button class="board-item ${cls || ''}" ${action}>
      <span class="bi-emoji">${emoji}</span>
      <span class="bi-text"><span class="bi-title">${title}</span><br><span class="bi-sub">${sub}</span></span>
      ${state || ''}
    </button>`;
}

/** 📖 Storyboard — its own activity now. */
function storyItem(act) {
  const href = `/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=story`;
  if (!act.hasStory) {
    return menuItem({
      emoji: '📖', title: t('board.storyboard'), sub: t('board.storyboardNone'),
      state: `<span class="bi-state">—</span>`, cls: 'locked',
    });
  }
  if (act.storyLocked) {
    return menuItem({
      emoji: '📖', title: t('board.storyboard'), sub: t('board.storyboardLocked'),
      state: `<span class="bi-state">🔒</span>`, cls: 'locked',
    });
  }
  return menuItem({
    emoji: '📖', title: t('board.storyboard'),
    sub: act.storyDone ? t('board.storyboardDone') : t('board.storyboardSub'),
    state: act.storyDone ? `<span class="bi-state done">✓</span>` : `<span class="bi-state go">${t('board.play')}</span>`,
    href,
  });
}

/** ❓ Pre-test — its own activity now. */
function preItem(act) {
  const href = `/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=pre`;
  if (!act.hasPre) {
    return menuItem({
      emoji: '❓', title: t('board.preTest'), sub: t('board.preTestNone'),
      state: `<span class="bi-state">—</span>`, cls: 'locked',
    });
  }
  if (act.preLocked) {
    return menuItem({
      emoji: '❓', title: t('board.preTest'), sub: t('board.preTestLocked'),
      state: `<span class="bi-state">🔒</span>`, cls: 'locked',
    });
  }
  return menuItem({
    emoji: '❓', title: t('board.preTest'),
    sub: lesson.preDone ? t('board.replay') : t('board.preTestSub'),
    state: lesson.preDone
      ? `<span class="bi-state done">${t('board.preDone', { score: lesson.preBestScore })}</span>`
      : `<span class="bi-state go">${t('board.play')}</span>`,
    href,
  });
}

/** 🧩 Challenges — sits directly under Assignments. */
function challengesItem() {
  const list = (challenges && challenges.challenges) || [];
  const todo = list.filter((c) => c.status === 'todo').length;
  const sub = !challenges ? t('common.loading')
    : !list.length ? t('ch.none')
      : todo ? t('ch.meta', { q: list.length, s: list.length === 1 ? '' : 's', p: list.reduce((n, c) => n + c.maxPoints, 0) })
        : t('board.challengesSub');
  return menuItem({
    emoji: '🧩', title: t('board.challenges'), sub,
    state: todo ? `<span class="bi-state go">${todo}</span>` : list.length ? `<span class="bi-state done">✓</span>` : '',
    onclick: "setTab('challenges')",
  });
}

function render() {
  const pt = lesson.postTest || {};
  const act = lesson.activities || { flow: 'story-first', hasStory: true, hasPre: true };
  const tabBtn = (key, label) =>
    `<button role="tab" aria-selected="${tab === key}" class="${tab === key ? 'on' : ''}" onclick="setTab('${key}')">${label}</button>`;
  const tabs = `
    <div class="board-tabs" role="tablist">
      ${tabBtn('board', t('board.tabBoard'))}
      ${tabBtn('assignments', t('board.tabAssignments'))}
      ${tabBtn('challenges', t('board.tabChallenges'))}
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
    // 1 & 2) Storyboard + pre-test, in the order the teacher picked.
    const first = act.flow === 'test-first' ? preItem(act) : storyItem(act);
    const second = act.flow === 'test-first' ? storyItem(act) : preItem(act);

    // 4) Post-test — one attempt only; not re-enterable once submitted.
    const ptOpen = pt.open && pt.questionCount > 0;
    const ptTaken = !!pt.done; // already submitted (graded or awaiting grading)
    let ptSub, ptState, ptCls = '', ptClickable = false;
    if (ptTaken) {
      ptCls = 'taken';
      if (pt.awaitingGrading) { ptSub = t('board.postTestAwaiting'); ptState = `<span class="bi-state done">⏳</span>`; }
      else { ptSub = t('board.postTestDone', { score: pt.bestScore }); ptState = `<span class="bi-state done">✓</span>`; }
    } else if (ptOpen) {
      ptSub = t('board.postTestOpenSub'); ptState = `<span class="bi-state go">${t('board.go')}</span>`; ptClickable = true;
    } else {
      ptCls = 'locked';
      ptSub = pt.questionCount === 0 && pt.open ? t('board.postTestNoQ') : t('board.postTestLockedSub');
      ptState = `<span class="bi-state">🔒</span>`;
    }

    body = `
      <div class="flow-note">🔀 ${act.flow === 'test-first' ? t('board.flowTestFirst') : t('board.flowStoryFirst')}</div>
      <div class="board-menu">
        ${first}
        ${second}
        ${menuItem({
          emoji: '📒', title: t('board.assignments'), sub: t('board.assignmentsSub'),
          onclick: "setTab('assignments')",
        })}
        ${challengesItem()}
        ${menuItem({
          emoji: '🧾', title: t('board.postTest'), sub: ptSub, state: ptState, cls: ptCls,
          href: ptClickable ? `/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=post` : null,
        })}
      </div>`;
  } else if (tab === 'assignments') {
    body = `<div id="feedHost"></div>`;
  } else {
    body = renderChallenges();
  }

  boardEl.innerHTML = hero + tabs + body;
  if (tab === 'assignments') {
    Feed.mount(document.getElementById('feedHost'), LESSON_ID, { teacher: false, title: lesson.title, icon: lesson.icon });
  }
}

/* ----------------------------- challenges tab ---------------------------- */

function renderChallenges() {
  if (!challenges) return `<p class="center muted">${t('common.loading')}</p>`;
  const list = challenges.challenges || [];
  if (!list.length) {
    return `<div class="card center stack" style="padding:26px">
      <div>${renderRuby('thinking', { size: 130 })}</div>
      <h3>${t('ch.title')}</h3>
      <p class="muted">${t('ch.none')}</p>
    </div>`;
  }

  // Group by the teacher's categories, keeping their order; anything without a
  // category falls into a final "other" group.
  const cats = (challenges.categories || []).slice();
  const groups = cats.map((c) => ({ key: c.id, label: `${c.icon || '📂'} ${c.name}`, items: [] }));
  const other = { key: null, label: t('ch.uncategorized'), items: [] };
  list.forEach((c) => {
    const g = groups.find((x) => x.key === c.categoryId);
    (g || other).items.push(c);
  });
  if (other.items.length) groups.push(other);

  return `<div class="ch-groups">${groups.filter((g) => g.items.length).map(challengeGroup).join('')}</div>`;
}

function challengeGroup(g) {
  return `
    <section class="ch-group">
      <h3 class="ch-group-title">${escapeHtml(g.label)}</h3>
      <div class="ch-list">${g.items.map(challengeCard).join('')}</div>
    </section>`;
}

function challengeCard(c) {
  const status = c.status === 'graded'
    ? `<span class="ch-status done">${t('ch.statusGraded', { e: c.earned, m: c.maxPoints })}</span>`
    : c.status === 'submitted'
      ? `<span class="ch-status wait">${t('ch.statusSubmitted')}</span>`
      : `<span class="ch-status todo">${t('ch.statusTodo')}</span>`;
  const due = c.dueAt
    ? `<span class="ch-due ${new Date(c.dueAt) < new Date() ? 'late' : ''}">${
        new Date(c.dueAt) < new Date() ? t('ch.overdue', { time: fmtWhen(c.dueAt) }) : t('ch.due', { time: fmtWhen(c.dueAt) })
      }</span>`
    : '';
  const cta = c.status === 'todo' ? t('ch.start') : c.status === 'graded' ? t('ch.view') : t('ch.continue');
  return `
    <button class="ch-card" onclick="location.href='/challenge.html?id=${encodeURIComponent(c.id)}'">
      <span class="ch-icon">${escapeHtml(c.icon || '🧩')}</span>
      <span class="ch-body">
        <span class="ch-name">${escapeHtml(c.title)}</span>
        ${c.description ? `<span class="ch-desc">${escapeHtml(c.description)}</span>` : ''}
        <span class="ch-meta">${t('ch.meta', { q: c.questionCount, s: c.questionCount === 1 ? '' : 's', p: c.maxPoints })} ${due}</span>
        ${status}
      </span>
      <span class="ch-go">${cta}</span>
    </button>`;
}
