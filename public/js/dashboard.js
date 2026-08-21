/* Student course map — a trail through green ground.
 *
 * Two layers that must stay in step:
 *   1. one <svg> holding the ground, the unit bands and the trail, sized to
 *      the container in real pixels (no preserveAspectRatio stretching, so
 *      stroke weights stay honest at every width);
 *   2. the level nodes as real <button>s positioned on top of it, so they
 *      keep the focus, hover and screen-reader behaviour that a drawn shape
 *      would throw away.
 *
 * Both are laid out from one array of node centres, recomputed on resize.
 */

const me = guard('student');
mountLangSwitch();

let LESSONS = [];

document.getElementById('navUser').textContent = me.name;

/* ---- geometry -------------------------------------------------------- */
const NODE_NOW = 96;    /* the current node is deliberately bigger */
const SPACING = 138;    /* vertical gap between node centres */
const TOP_PAD = 196;    /* headroom: Ruby + her flag stand above the first node */
const BOT_PAD = 96;     /* room for the last title */
const AMP = 0.34;       /* serpentine swing, as a fraction of the trail column */
const PERIOD = 5;       /* nodes per full weave — a slower wave reads lopsided */
const COL = 560;        /* the trail stays a column even when the card is wide */
const UNIT_GAP = 62;    /* extra air at a unit boundary, so its label has room */
const BAND_PAD = 34;    /* how far a unit band extends past its nodes */

/* Terrain already groups consecutive levels, so units come from the data the
   teacher authors today — no extra field required. */
const UNIT_LABEL = {
  plain: () => t('unit.one'),
  mountain: () => t('unit.two'),
  snow: () => t('unit.three'),
};

const ICON = {
  check: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
};

const r = (n) => Math.round(n * 10) / 10;

init();

async function init() {
  try {
    const data = await API.get('/api/lessons');
    LESSONS = data.lessons;
    document.getElementById('navPoints').textContent = data.points || 0;
    refreshNavCoins();

    const done = LESSONS.filter((l) => l.completed).length;
    const total = LESSONS.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    document.getElementById('progFill').style.transform = `scaleX(${pct / 100})`;
    document.getElementById('progPct').textContent = pct + '%';
    document.getElementById('progLabel').textContent =
      done === total && total
        ? t('dash.progressDone', { done, total })
        : t('dash.progress', { done, total });

    buildMap();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

/* ---- layout ---------------------------------------------------------- */

/**
 * Node centres for a map `n` long inside a container `w` wide.
 * The landscape fills the whole card, but the trail itself is held to a
 * centred column — spread across a wide desktop it stops reading as a path
 * and starts reading as scattered dots.
 */
function centres(n, w, lift, half) {
  const col = Math.min(w, COL);
  const x0 = (w - col) / 2;
  /* clamp on the widest part of a node, which is its title, not its disc —
     otherwise a long title overhangs the card edge and gets clipped */
  const lo = x0 + Math.min(half, col / 2);
  const hi = x0 + Math.max(col - half, col / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const raw = x0 + col * (0.5 + AMP * Math.sin((i * 2 * Math.PI) / PERIOD));
    out.push({ x: Math.max(lo, Math.min(hi, raw)), y: TOP_PAD + i * SPACING + lift[i] });
  }
  return out;
}

/**
 * Extra vertical space carried by each node because of the unit boundaries
 * above it. Without this the unit label lands in the same strip as the node
 * before it — and, on the current level, in Ruby's airspace.
 */
function unitLift(groups, n) {
  const lift = new Array(n).fill(0);
  let extra = 0;
  groups.forEach((grp, gi) => {
    if (gi > 0) extra += UNIT_GAP;
    grp.items.forEach((it) => { lift[it.index] = extra; });
  });
  return lift;
}

/**
 * A Catmull-Rom spline through every centre, emitted as cubic beziers, so
 * the trail actually passes through the nodes instead of near them.
 */
function trailPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${r(p2.x)} ${r(p2.y)}`;
  }
  return d;
}

/**
 * How far along `path` the node at `target` sits.
 * The walked trail is the same path clipped with a dash pattern rather than a
 * second spline, because a spline through a prefix of the points curves
 * differently and the two would visibly disagree at the join.
 */
function lengthAt(path, target) {
  const total = path.getTotalLength();
  let best = 0, bestD = Infinity;
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const len = (total * i) / steps;
    const p = path.getPointAtLength(len);
    const dx = p.x - target.x, dy = p.y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = len; }
  }
  return best;
}

/* ---- render ---------------------------------------------------------- */

function buildMap() {
  const scene = document.getElementById('scene');

  if (!LESSONS.length) {
    scene.innerHTML = `
      <div class="map-empty">
        <div class="map-empty-ruby">${renderRuby('happy', { size: 150, float: true })}</div>
        <h2>${escapeHtml(t('dash.emptyTitle'))}</h2>
        <p>${escapeHtml(t('dash.emptyBody'))}</p>
      </div>`;
    return;
  }

  const currentIdx = LESSONS.findIndex((l) => !l.locked && !l.completed);

  /* group consecutive levels sharing a terrain into units */
  const groups = [];
  LESSONS.forEach((l, i) => {
    const terrain = l.terrain || 'plain';
    const last = groups[groups.length - 1];
    if (last && last.terrain === terrain) last.items.push({ lesson: l, index: i });
    else groups.push({ terrain, items: [{ lesson: l, index: i }] });
  });

  scene.innerHTML = `
    <div class="path-map" id="pathMap">
      <svg class="path-svg" id="pathSvg" aria-hidden="true" focusable="false"></svg>
      <div class="path-nodes" id="pathNodes"></div>
    </div>
    <div class="map-legend">
      <span class="leg"><span class="sw done"></span> ${escapeHtml(t('dash.legendDone'))}</span>
      <span class="leg"><span class="sw now"></span> ${escapeHtml(t('dash.legendNow'))}</span>
      <span class="leg"><span class="sw locked"></span> ${escapeHtml(t('dash.legendLocked'))}</span>
    </div>`;

  const map = document.getElementById('pathMap');
  const lift = unitLift(groups, LESSONS.length);
  map.style.height =
    TOP_PAD + (LESSONS.length - 1) * SPACING + lift[LESSONS.length - 1] + BOT_PAD + 'px';

  paintNodes(groups, currentIdx);
  layout(groups, currentIdx, lift);

  /* The trail is measured in pixels, so it has to be redrawn whenever the
     column changes width. ResizeObserver catches the cases a window resize
     does not (the sidebar, zoom, a font swap reflowing the card); the resize
     listener is the fallback for anywhere the observer is unavailable. */
  let frame = 0;
  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => layout(groups, currentIdx, lift));
  };
  if (window.ResizeObserver) new ResizeObserver(redraw).observe(map);
  window.addEventListener('resize', redraw);

  const now = map.querySelector('.node.is-now');
  if (now) setTimeout(() => now.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

/** The nodes themselves — written once, then only repositioned. */
function paintNodes(groups, currentIdx) {
  const host = document.getElementById('pathNodes');

  const chips = groups.map((grp) => {
    const label = (UNIT_LABEL[grp.terrain] || UNIT_LABEL.plain)();
    const cleared = grp.items.filter((it) => it.lesson.completed).length;
    return `
      <div class="unit-chip" data-first="${grp.items[0].index}">
        <span class="uc-name">${escapeHtml(label)}</span>
        <span class="uc-count">${cleared} / ${grp.items.length}</span>
      </div>`;
  }).join('');

  const nodes = LESSONS.map((lesson, i) => nodeHtml(lesson, i, i === currentIdx)).join('');

  /* Ruby stands beside the node with her flag at her feet, so she covers
     neither the level title above nor the unit label on the hill crest, and
     the button keeps a clean hit area and a single accessible name. */
  const marker = currentIdx < 0 ? '' : `
    <div class="now-marker" id="nowMarker">
      <div class="now-ruby">${renderRuby('wave', { size: 104, float: true })}</div>
      <div class="now-flag">${escapeHtml(t('dash.youAreHere'))}</div>
    </div>`;

  host.innerHTML = chips + nodes + marker;

  host.querySelectorAll('.node').forEach((node) => {
    node.addEventListener('click', () => {
      if (node.dataset.state === 'locked') {
        toast(lockedToastFor(node.dataset.reason, node.dataset.opensAt), 'bad');
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 450);
        return;
      }
      location.href = `/level.html?id=${encodeURIComponent(node.dataset.id)}`;
    });
  });
}

function nodeHtml(lesson, index, isNow) {
  const state = lesson.locked ? 'locked' : lesson.completed ? 'done' : (isNow ? 'now' : 'open');
  const n = index + 1;

  const face =
    state === 'done' ? ICON.check
    : state === 'locked' ? ICON.lock
    : `<span class="node-n">${n}</span>`;

  const aria = t('dash.tileAria', {
    n,
    title: lesson.title || '',
    state: t('dash.state.' + state),
  });

  return `
    <button type="button" class="node is-${state}" data-i="${index}"
            data-id="${escapeHtml(lesson.id)}"
            data-state="${state === 'now' || state === 'open' ? 'open' : state}"
            data-reason="${escapeHtml(lesson.lockReason || '')}"
            data-opens-at="${escapeHtml(lesson.opensAt || '')}"
            ${state === 'locked' ? 'aria-disabled="true"' : ''}
            aria-label="${escapeHtml(aria)}">
      <span class="node-face">
        <span class="hex hex-edge" aria-hidden="true"></span>
        <span class="hex hex-top">${face}</span>
      </span>
      <span class="node-title">${escapeHtml(lesson.title || '')}</span>
    </button>`;
}

/** Position everything for the current width, and draw the ground + trail. */
function layout(groups, currentIdx, lift) {
  const map = document.getElementById('pathMap');
  if (!map) return;
  const w = map.clientWidth;
  const h = map.clientHeight;
  if (!w) return;

  /* measured, not assumed: .node narrows at the mobile breakpoint */
  const first = map.querySelector('.node');
  const half = Math.max(NODE_NOW / 2 + 10, (first ? first.offsetWidth : 132) / 2 + 4);
  const pts = centres(LESSONS.length, w, lift, half);

  map.querySelectorAll('.node').forEach((node) => {
    const p = pts[+node.dataset.i];
    node.style.left = p.x + 'px';
    node.style.top = p.y + 'px';
  });

  /* sit each label on its own hill crest, hard left — centred it collides
     with the trail and with Ruby's flag */
  map.querySelectorAll('.unit-chip').forEach((chip) => {
    chip.style.top = pts[+chip.dataset.first].y - SPACING * 0.5 - UNIT_GAP * 0.5 + 'px';
  });

  const marker = document.getElementById('nowMarker');
  if (marker && currentIdx >= 0) {
    const p = pts[currentIdx];
    marker.style.left = p.x + 'px';
    marker.style.top = p.y + 'px';
    marker.classList.toggle('to-left', p.x > w / 2);
    marker.classList.toggle('to-right', p.x <= w / 2);
  }

  drawGround(groups, pts, w, h, currentIdx);
}

/**
 * The ground and the trail.
 *
 * Each unit is a hill layer with a curved top edge rather than a rounded box —
 * rectangles here read as empty placeholder blocks, a horizon reads as a place.
 * The layers stack downward, so later units sit "behind" earlier ones.
 *
 * Progress, not hue, separates them, which keeps green the one dominant
 * colour: ground already walked reads richer, the unit in play is lightest,
 * everything still ahead recedes.
 */
function drawGround(groups, pts, w, h, currentIdx) {
  const svg = document.getElementById('pathSvg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);

  const hills = groups.map((grp, gi) => {
    const firstY = pts[grp.items[0].index].y;
    const top = gi === 0 ? -40 : firstY - SPACING * 0.5 - UNIT_GAP * 0.5;
    const cleared = grp.items.every((it) => it.lesson.completed);
    const holdsNow = grp.items.some((it) => it.index === currentIdx);
    const cls = cleared ? 'is-cleared' : holdsNow ? 'is-now' : 'is-ahead';

    /* a gentle, slightly different roll per unit so the horizons do not
       stamp out identically down a long course */
    const sway = gi % 2 ? -1 : 1;
    const d = [
      `M 0 ${r(h)}`,
      `L 0 ${r(top + 26)}`,
      `C ${r(w * 0.28)} ${r(top - 22 * sway)},`,
      `${r(w * 0.68)} ${r(top + 46 * sway)},`,
      `${r(w)} ${r(top + 12)}`,
      `L ${r(w)} ${r(h)} Z`,
    ].join(' ');
    return `<path class="hill ${cls}" d="${d}"/>`;
  }).join('');

  /* The drawn world, in the margins either side of the trail column.
     js/mapart.js is a separate file, and script load order in this app is
     load-bearing - a stale cached dashboard.html without that tag used to
     take the whole map down with a ReferenceError. Scenery is decoration,
     so its absence must cost the decoration and nothing else. */
  const col = Math.min(w, COL);
  const colLeft = (w - col) / 2;
  const drawScenery = typeof sceneryFor === 'function' ? sceneryFor : () => '';
  const scenery = groups.map((grp, gi) => {
    const firstY = pts[grp.items[0].index].y;
    const lastY = pts[grp.items[grp.items.length - 1].index].y;
    const top = gi === 0 ? 8 : firstY - SPACING * 0.5 - UNIT_GAP * 0.5;
    const bottom = gi === groups.length - 1
      ? h - 12
      : pts[groups[gi + 1].items[0].index].y - SPACING * 0.5 - UNIT_GAP * 0.5;
    return drawScenery(grp.terrain, gi, { top, bottom: Math.max(bottom, lastY + 40) },
                       w, colLeft, colLeft + col);
  }).join('');

  const d = trailPath(pts);
  const trail = d ? `
    <path class="trail-under" d="${d}"/>
    <path class="trail" d="${d}"/>
    <path class="trail-walked" id="trailWalked" d="${d}"/>` : '';

  svg.innerHTML = `<rect class="sky" x="0" y="0" width="${r(w)}" height="${r(h)}"/>`
                  + hills + scenery + trail;

  /* clip the walked trail to the node the student has actually reached */
  const walked = document.getElementById('trailWalked');
  if (!walked || !d) return;
  const doneCount = LESSONS.filter((l) => l.completed).length;
  const upTo = currentIdx < 0 ? pts.length - 1 : (doneCount === 0 ? -1 : currentIdx);
  if (upTo < 0) { walked.style.display = 'none'; return; }
  walked.style.display = '';
  const total = walked.getTotalLength();
  const len = lengthAt(walked, pts[upTo]);
  walked.style.strokeDasharray = `${len} ${total}`;
}

/** Pick the right "why is this locked" message for a node. */
function lockedToastFor(reason, opensAt) {
  if (reason === 'teacher') return t('dash.lockedTeacher');
  if (reason === 'scheduled') return t('dash.lockedSchedule', { time: opensAt ? fmtWhen(opensAt) : '' });
  if (reason === 'posttest') return t('dash.lockedPost');
  return t('dash.lockedToast');
}
