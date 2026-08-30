/* The course map.
 *
 * WHAT THE TEACHER CONTROLS, AND WHAT THIS FILE MAY ASSUME
 * The teacher authors the whole course: how many levels there are, their
 * titles and their order. They can make one level or forty, so nothing here is
 * fixed — the board is laid out from however many levels come back.
 *
 * The teacher's LEVEL TITLE is on the map. An earlier map showed only "Lv.3",
 * so the thing the teacher actually wrote was invisible.
 *
 * WHAT IS DELIBERATELY NOT DRAWN
 * The map used to paint a landscape under the levels: coloured terrain bands
 * per level, hills, a river with a bridge at every terrain change, scenery
 * props, a winding trail and a finish gate. It is all gone, on purpose. The
 * board shows the levels and nothing else, so the only thing carrying meaning
 * on it is the level itself — its number, its title and its state.
 *
 * Lessons still carry a `terrain` field in the database and the API; it simply
 * has nothing to draw any more. Nothing reads it, so it costs nothing to keep,
 * and a future map could use it again.
 *
 * WHERE THE MASCOT IS
 * Once, at the level you are on. An earlier map put him on every node, which
 * made six copies of the same character and no sense of where you were.
 *
 * STRUCTURE
 * The levels are real <button>s, positioned in the board, so focus, hover and
 * screen readers all work.
 */

const me = guard('student');
addClouds();
mountLangSwitch();

let LESSONS = [];

/* ---- geometry ---- */
const NODE = 78;          // level marker diameter
const NODE_NOW = 96;      // ...at the level you are on
const TOP_PAD = 110;
/* Room under the last level for its title and for the student figure, who
   stands taller than the disc he is beside. It used to be 320, which was the
   run down to a finish gate that is no longer drawn. */
const BOT_PAD = 150;

init();

async function init() {
  try {
    const data = await API.get('/api/lessons');
    LESSONS = data.lessons || [];
    document.getElementById('navPoints').textContent = data.points || 0;
    refreshNavCoins();

    const done = LESSONS.filter((l) => l.completed).length;
    const pct = LESSONS.length ? Math.round((done / LESSONS.length) * 100) : 0;
    document.getElementById('progFill').style.transform = `scaleX(${pct / 100})`;
    document.getElementById('progLabel').textContent =
      LESSONS.length && done === LESSONS.length
        ? t('dash.progressDone', { done, total: LESSONS.length })
        : t('dash.progress', { done, total: LESSONS.length });

    buildMap();
  } catch (err) { toast(err.message, 'bad'); }
}

/* ---------- the shape of the course ---------- */

/** Serpentine node centres, kept inside a readable column. */
function centres(n, w) {
  const amp = Math.min(w * 0.30, 210);
  const mid = w / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(mid + amp * Math.sin(i * 0.95 + 0.6)),
    y: TOP_PAD + i * spacing(w),
  }));
}
function spacing(w) { return w < 620 ? 186 : 218; }

/* ---------- painting ---------- */

function buildMap() {
  const scene = document.getElementById('scene');
  const w = scene.clientWidth || 920;
  const n = LESSONS.length;

  if (!n) return renderEmpty(scene);

  const pts = centres(n, w);
  const h = TOP_PAD + (n - 1) * spacing(w) + BOT_PAD;

  scene.style.height = h + 'px';
  scene.innerHTML = `<div class="map-layer">${nodes(pts)}${marker(pts, w)}</div>`;

  wireNodes(scene);
}

/** The levels themselves. */
function nodes(pts) {
  return LESSONS.map((l, i) => {
    const state = l.locked ? 'locked' : l.completed ? 'done' : 'open';
    const now = !l.locked && !l.completed && i === currentIndex();
    const size = now ? NODE_NOW : NODE;

    const face = state === 'done' ? ICON.check(30)
      : state === 'locked' ? ICON.lock(28)
      : `<span class="node-n">${i + 1}</span>`;

    /* No "Tap to play" flag. The gold disc, the larger title, the mascot and
       his "You are here" tag already say it four times over, and the flag was
       the one that landed on the previous level's title. */
    let flag = '';
    if (state === 'locked' && l.lockReason === 'scheduled' && l.opensAt) {
      flag = `<span class="node-when">${ICON.calendar(14)} ${escapeHtml(fmtWhen(l.opensAt))}</span>`;
    }

    /* The button's accessible name is the teacher's title plus the state, so a
       screen reader gets what a sighted student gets from the colour. */
    const stateWord = t('dash.state.' + state);
    return `
      <button class="node is-${state}${now ? ' is-now' : ''}" type="button"
              style="left:${pts[i].x}px;top:${pts[i].y}px;--size:${size}px"
              data-id="${escapeHtml(l.id)}" data-state="${state}"
              data-reason="${escapeHtml(l.lockReason || '')}"
              data-opens-at="${escapeHtml(l.opensAt || '')}"
              aria-label="${escapeHtml(t('dash.lv', { n: i + 1 }) + ' — ' + l.title + ' — ' + stateWord)}">
        ${flag}
        <span class="node-disc"><span class="node-face">${face}</span></span>
        <span class="node-title">${chem(l.title)}</span>
      </button>`;
  }).join('');
}

function currentIndex() {
  return LESSONS.findIndex((l) => !l.locked && !l.completed);
}

/* Who stands on the map: THE STUDENT, not Kru CJ.
   The figure is the avatar they picked in Settings, so the person on the board
   is them. Kru CJ is the teacher — he narrates storyboards and answers
   questions, and standing him on the student's own position said the wrong
   thing about whose journey this is. */
function marker(pts, w) {
  const i = currentIndex();
  const allDone = LESSONS.length && LESSONS.every((l) => l.completed);

  /* Finished the course: he stands by the last level with the banner, since
     there is no longer a gate at the bottom for him to stand beside. */
  if (allDone) {
    const end = pts[pts.length - 1];
    const side = end.x > w / 2 ? 'left' : 'right';
    return `<div class="you done to-${side}" style="left:${end.x}px;top:${end.y}px">
              ${studentFigure(me && me.avatar, 118)}
              <span class="you-tag">${escapeHtml(t('dash.summit'))}</span>
            </div>`;
  }
  if (i < 0) return '';

  /* He stands to one side of the disc, never on it, so he never lands on the
     neighbouring level or its title. */
  const side = pts[i].x > w / 2 ? 'left' : 'right';
  return `<div class="you to-${side}" style="left:${pts[i].x}px;top:${pts[i].y}px">
            ${studentFigure(me && me.avatar, 118)}
            <span class="you-tag">${escapeHtml(t('dash.youAreHere'))}</span>
          </div>`;
}

/** No levels yet — the teacher has not published any. */
function renderEmpty(scene) {
  scene.style.height = 'auto';
  scene.innerHTML = `
    <div class="map-empty">
      ${renderRuby('shrug', { size: 170 })}
      <h2>${escapeHtml(t('dash.emptyTitle'))}</h2>
      <p>${escapeHtml(t('dash.emptyBody'))}</p>
    </div>`;
}

/* ---------- interaction ---------- */

function wireNodes(scene) {
  scene.querySelectorAll('.node').forEach((node) => {
    node.addEventListener('click', () => {
      if (node.dataset.state === 'locked') {
        toast(lockedToastFor(node.dataset.reason, node.dataset.opensAt), 'bad');
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 500);
        return;
      }
      // the level board opens first: start level / assignments / post-test
      location.href = `/level.html?id=${encodeURIComponent(node.dataset.id)}`;
    });
  });

  /* Bring the current level into view without yanking the header off screen:
     only scroll when it is actually below the fold. */
  const now = scene.querySelector('.node.is-now');
  if (now) {
    setTimeout(() => {
      const box = now.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 40) {
        now.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 250);
  }
}

/** Why is this locked? */
function lockedToastFor(reason, opensAt) {
  if (reason === 'teacher') return t('dash.lockedTeacher');
  if (reason === 'scheduled') return t('dash.lockedSchedule', { time: opensAt ? fmtWhen(opensAt) : '' });
  if (reason === 'posttest') return t('dash.lockedPost');
  return t('dash.lockedToast');
}

let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(buildMap, 180); });
