// Level board (hub): clicking a level on the map lands here first.
// Tabs: 🏠 Board · 📒 Assignments · 🧩 Challenges.
//
// The Board tab draws the level's activities as a short trail of nodes rather
// than a list of rows, so a level reads as somewhere you move through. The
// storyboard and the pre-test are two SEPARATE activities: the teacher decides
// which one comes first (lesson.activities.flow) and the other one stays
// locked until the first is finished. See THE HUB, below.

guard('student');
addClouds();
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

/* ---------------------------------------------------------------------------
   THE HUB — one level's activities as a short trail of nodes.

   Every node is the same shape (a disc, a name, and a line under it when it
   has something to say) and its COLOUR carries the state: green done, gold
   open, grey locked or not-built-yet. That is the grammar the course map
   already uses for levels one layer up, so a node reads as a node in both
   places — but the classes are this board's own, because the two layouts
   solve different problems and need to change independently.

   Nothing here decides anything. The order of the storyboard and the pre-test
   is the teacher's (lesson.activities.flow), the locks come from the server's
   activityState, and the post-test opens when the server says so.
--------------------------------------------------------------------------- */

/* These labels already carry their own emoji in both languages ("📖
   Storyboard" / "📖 เนื้อเรื่อง"). The disc wants the emoji and the plate
   wants the words, so split one string rather than keep a parallel set of
   icon-less keys at parity forever. */
function splitIcon(label) {
  const m = /^(\P{L}+?)\s+(.+)$/u.exec(String(label));
  return m ? { icon: m[1], text: m[2] } : { icon: '•', text: String(label) };
}

function stateWord(state) {
  return state === 'empty' ? t('board.stateEmpty') : t('dash.state.' + state);
}

/**
 * One node on the trail.
 * state: 'done' | 'open' | 'locked' | 'empty'
 * Without `go` the node is not pressable — clicking it explains itself
 * instead of doing nothing, which is why `sub` doubles as the reason.
 */
function hubNode({ label, sub, state, size, go, count, tag, eyebrow, final, next }) {
  const { icon, text } = splitIcon(label);
  const cls = ['hub-node', 'is-' + state];
  if (final) cls.push('is-final');
  if (next) cls.push('is-next');
  return `
    <button class="${cls.join(' ')}" type="button" style="--size:${size || 78}px"
            data-go="${escapeHtml(go || '')}" data-why="${escapeHtml(sub || '')}"
            ${go ? '' : 'aria-disabled="true"'}
            aria-label="${escapeHtml(text + ' — ' + stateWord(state))}">
      ${eyebrow ? `<span class="hub-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
      <span class="hub-disc">
        <span class="hub-face">${icon}</span>
        ${count ? `<span class="hub-count">${escapeHtml(String(count))}</span>` : ''}
      </span>
      <span class="hub-name">${escapeHtml(text)}</span>
      ${sub ? `<span class="hub-sub">${escapeHtml(sub)}</span>` : ''}
      ${tag ? `<span class="hub-tag">${escapeHtml(tag)}</span>` : ''}
    </button>`;
}

/** 📖 Storyboard. */
function storyNode(act) {
  if (!act.hasStory) {
    return { label: t('board.storyboard'), state: 'empty', sub: t('board.storyboardNone') };
  }
  if (act.storyLocked) {
    return { label: t('board.storyboard'), state: 'locked', sub: t('board.storyboardLocked') };
  }
  return {
    label: t('board.storyboard'),
    state: act.storyDone ? 'done' : 'open',
    sub: act.storyDone ? '' : t('board.storyboardSub'),
    go: `/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=story`,
  };
}

/** ❓ Pre-test. */
function preNode(act) {
  if (!act.hasPre) {
    return { label: t('board.preTest'), state: 'empty', sub: t('board.preTestNone') };
  }
  if (act.preLocked) {
    return { label: t('board.preTest'), state: 'locked', sub: t('board.preTestLocked') };
  }
  return {
    label: t('board.preTest'),
    state: lesson.preDone ? 'done' : 'open',
    sub: lesson.preDone ? t('board.preDone', { score: lesson.preBestScore }) : t('board.preTestSub'),
    go: `/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=pre`,
  };
}

/** 🧩 Challenges — one node for however many the teacher wrote. */
function challengeNode() {
  const list = (challenges && challenges.challenges) || [];
  const todo = list.filter((c) => c.status === 'todo').length;
  if (!challenges) return { label: t('board.challenges'), state: 'empty', sub: t('common.loading') };
  if (!list.length) return { label: t('board.challenges'), state: 'empty', sub: t('ch.none') };
  return {
    label: t('board.challenges'),
    state: todo ? 'open' : 'done',
    sub: t('ch.meta', {
      q: list.reduce((n, c) => n + c.questionCount, 0),
      s: list.reduce((n, c) => n + c.questionCount, 0) === 1 ? '' : 's',
      p: list.reduce((n, c) => n + c.maxPoints, 0),
    }),
    count: todo || 0,
    /* A simulation is the most involved thing a level can hold, and it is
       otherwise invisible until you are three taps deep. */
    tag: list.some((c) => c.hasSimulation) ? t('board.lab') : '',
    go: 'tab:challenges',
  };
}

/** 🧾 Post-test — one attempt, ever, so it does not look like the rest. */
function finalNode(pt) {
  const base = { label: t('board.postTest'), final: true, size: 108 };
  if (pt.done) {
    return Object.assign(base, {
      state: 'done',
      eyebrow: t('board.finalTag'),
      sub: pt.awaitingGrading ? t('board.postTestAwaiting') : t('board.postTestDone', { score: pt.bestScore }),
    });
  }
  if (pt.open && pt.questionCount > 0) {
    return Object.assign(base, {
      state: 'open',
      eyebrow: t('board.finalTag'),
      sub: t('board.postTestOpenSub'),
      go: `/lesson.html?id=${encodeURIComponent(LESSON_ID)}&mode=post`,
    });
  }
  return Object.assign(base, {
    state: pt.open && pt.questionCount === 0 ? 'empty' : 'locked',
    eyebrow: t('board.finalTag'),
    sub: pt.open && pt.questionCount === 0 ? t('board.postTestNoQ') : t('board.postTestLockedSub'),
  });
}

/** What Kru CJ says, and the face he says it with. */
function hubGreeting(trail, final) {
  if (final.state === 'done') return { mood: 'medal', line: t('board.sayDone') };
  if (final.state === 'open') return { mood: 'grade', line: t('board.sayFinal') };
  if (trail.some((n) => n.state === 'done')) return { mood: 'excited', line: t('board.sayGoing') };
  return { mood: 'wave', line: t('board.sayStart') };
}

/** The whole board tab. */
function hubView(act, pt) {
  // The teacher's order, then the challenges everyone can reach.
  const trail = act.flow === 'test-first'
    ? [preNode(act), storyNode(act)]
    : [storyNode(act), preNode(act)];
  trail.push(challengeNode());

  const final = finalNode(pt);
  const say = hubGreeting(trail, final);

  // Exactly one node pulses: the first thing actually waiting to be done.
  const nextIdx = trail.findIndex((n) => n.state === 'open');
  if (nextIdx >= 0) trail[nextIdx].next = true;
  else if (final.state === 'open') final.next = true;

  const aside = hubNode({
    label: t('board.assignments'),
    state: 'open',
    sub: '',
    go: 'tab:assignments',
  });

  return `
    <div class="hub">
      <div class="hub-say">
        ${renderRuby(say.mood, { size: 92 })}
        <p class="hub-bubble">${escapeHtml(say.line)}</p>
      </div>
      <div class="hub-trail" role="group" aria-label="${escapeHtml(t('board.trailAria'))}">
        ${trail.map((n) => `<div class="hub-step">${hubNode(n)}</div>`).join('')}
      </div>
      <div class="hub-aside">${aside}</div>
      <div class="hub-final">${hubNode(final)}</div>
    </div>`;
}

/** Nodes carry their destination in data-go; a node with none says why not. */
function wireHub(host) {
  host.querySelectorAll('.hub-node').forEach((node) => {
    node.addEventListener('click', () => {
      const go = node.dataset.go;
      if (!go) {
        if (node.dataset.why) toast(node.dataset.why, 'bad');
        return;
      }
      if (go.startsWith('tab:')) setTab(go.slice(4));
      else location.href = go;
    });
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
        <h1>${escapeHtml(lesson.icon)} ${chem(lesson.title)}</h1>
        <div class="bh-desc">${escapeHtml(lesson.description || t('board.welcome'))}</div>
      </div>
    </div>`;

  let body = '';
  if (tab === 'board') {
    body = hubView(act, pt);
  } else if (tab === 'assignments') {
    body = `<div id="feedHost"></div>`;
  } else {
    body = renderChallenges();
  }

  boardEl.innerHTML = hero + tabs + body;
  if (tab === 'board') wireHub(boardEl);
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
