/* The course map.
 *
 * WHAT THE TEACHER CONTROLS, AND WHAT THIS FILE MAY ASSUME
 * The teacher authors the whole course: how many levels there are, their
 * titles, their order, and a terrain per level (plain / mountain / snow).
 * They can make one level or forty, and they can pick terrains in any
 * sequence at all. So nothing here is fixed:
 *
 *   - Terrain chooses the GROUND a stretch of the course runs over. It never
 *     names a place. The old map called the three terrains "Meadow", "Ember
 *     Canyon" and "Sky Summit", which reads as a three-part climb the teacher
 *     never wrote — and turns into nonsense the moment they go
 *     mountain -> plain -> mountain.
 *   - A stretch is labelled with the levels it actually contains
 *     ("Levels 4-6"). That is true of any course of any shape.
 *   - The teacher's LEVEL TITLE is on the map. The old map showed only
 *     "Lv.3", so the thing the teacher actually wrote was invisible.
 *
 * WHERE THE MASCOT IS
 * Once, at the level you are on. The old map put him on every node, which
 * made six copies of the same character and no sense of where you were.
 *
 * STRUCTURE
 * One <svg> paints the ground, the water and the trail; the levels stay real
 * <button>s positioned over it, so focus, hover and screen readers all work.
 */

const me = guard('student');
addClouds();
mountLangSwitch();

let LESSONS = [];

/* ---- geometry ---- */
const NODE = 78;          // level marker diameter
const NODE_NOW = 96;      // ...at the level you are on
const TOP_PAD = 150;
const BOT_PAD = 320;
const RIVER_H = 84;       // water at a terrain change

/* Terrain -> ground. Two stops for the band and one for the props, nothing
   more: on this map colour means state, and the landscape may not spend it. */
const GROUND = {
  plain:    { top: '#a9e87f', bot: '#74c94f', hill: '#8bd964', water: '#4fb3f0' },
  mountain: { top: '#f8dda6', bot: '#e0a45f', hill: '#efc98a', water: '#57b6e8' },
  snow:     { top: '#e8f3ff', bot: '#cfd9f5', hill: '#dbe8fb', water: '#7fc4f2' },
};

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

/** Runs of consecutive levels sharing a terrain. Any length, any order. */
function stretches(list) {
  const out = [];
  list.forEach((l, i) => {
    const terrain = GROUND[l.terrain] ? l.terrain : 'plain';
    const last = out[out.length - 1];
    if (last && last.terrain === terrain) last.end = i;
    else out.push({ terrain, start: i, end: i });
  });
  return out;
}

/**
 * A smooth path through the node centres (Catmull-Rom -> cubic bezier).
 * Straight segments between nodes are what made the old trail look like a
 * diagram; a course is a road, and a road bends.
 */
function trailPath(pts) {
  if (pts.length < 2) return '';
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6},` +
         ` ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6},` +
         ` ${p2.x} ${p2.y}`;
  }
  return d;
}

/* Scenery is optional: if js/mapart.js is not on the page the map still
   draws, just bare. A missing decoration must never blank the whole board. */
const drawScenery = typeof sceneryFor === 'function' ? sceneryFor : () => '';

/* ---------- painting ---------- */

function buildMap() {
  const scene = document.getElementById('scene');
  const w = scene.clientWidth || 920;
  const n = LESSONS.length;

  if (!n) return renderEmpty(scene);

  const pts = centres(n, w);
  const h = TOP_PAD + (n - 1) * spacing(w) + BOT_PAD;
  const runs = stretches(LESSONS);

  // vertical extent of each stretch: halfway between the levels either side
  runs.forEach((r, i) => {
    r.top = i === 0 ? 0 : (pts[r.start].y + pts[r.start - 1].y) / 2;
    r.bot = i === runs.length - 1 ? h : (pts[r.end].y + pts[r.end + 1].y) / 2;
  });

  scene.style.height = h + 'px';
  scene.innerHTML =
    `<svg class="map-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
          aria-hidden="true" focusable="false">${ground(runs, pts, w, h)}</svg>
     <div class="map-layer">${plates(runs)}${nodes(pts)}${marker(pts, h, w)}</div>`;

  wireNodes(scene);
}

/** Ground, water and trail — everything that is painted rather than pressed. */
function ground(runs, pts, w, h) {
  let s = '';

  runs.forEach((r, i) => {
    const g = GROUND[r.terrain];
    s += `<linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${g.top}"/>
            <stop offset="1" stop-color="${g.bot}"/>
          </linearGradient>`;
    /* A curved horizon rather than a straight cut: a rectangle band reads as
       an empty placeholder box, a curve reads as ground. */
    const t = r.top;
    s += `<path d="M0 ${t + 26} Q${w * 0.28} ${t - 12} ${w * 0.55} ${t + 14}
                   T${w} ${t + 8} L${w} ${r.bot} L0 ${r.bot} Z"
                fill="url(#g${i})"/>`;
    /* Two low hills inside the band. They are what stop a stretch of ground
       reading as a flat rectangle of colour; at .55 opacity over its own
       gradient the first attempt was invisible. */
    s += `<path d="M0 ${r.bot - 104} Q${w * 0.30} ${r.bot - 186} ${w * 0.62} ${r.bot - 110}
                   T${w} ${r.bot - 132} L${w} ${r.bot} L0 ${r.bot} Z"
                fill="${g.hill}"/>
          <path d="M0 ${r.bot - 46} Q${w * 0.46} ${r.bot - 118} ${w} ${r.bot - 58}
                   L${w} ${r.bot} L0 ${r.bot} Z"
                fill="${g.bot}" opacity=".55"/>`;
  });

  /* Water at every terrain change, with a bridge where the trail crosses it.
     The crossing is the point: it makes a change of ground feel like arriving
     somewhere rather than a colour switching. */
  const d0 = trailPath(pts);
  const bridges = [];
  runs.forEach((r, i) => {
    if (i === 0) return;
    const y = r.top, g = GROUND[r.terrain];
    /* On the trail AND along it. Averaging the two node x's puts the bridge
       beside the road; leaving it horizontal lays it across the road. Both
       need the curve's own position and heading at this exact y. */
    const cross = tangentAtY(d0, y);
    const bx = cross.x;
    s += `<rect x="-4" y="${y - RIVER_H / 2}" width="${w + 8}" height="${RIVER_H}" fill="${g.water}"/>
          <rect x="-4" y="${y - RIVER_H / 2}" width="${w + 8}" height="9" fill="#ffffff" opacity=".45"/>
          <rect x="-4" y="${y + RIVER_H / 2 - 7}" width="${w + 8}" height="7" fill="#0b3f6b" opacity=".16"/>
`;
    bridges.push(`
          <g transform="translate(${bx} ${y}) rotate(${cross.deg})">
            <rect x="-28" y="${-RIVER_H / 2 - 20}" width="56" height="${RIVER_H + 40}" rx="7"
                  fill="#7d5430" stroke="#3b3350" stroke-width="4"/>
            <rect x="-22" y="${-RIVER_H / 2 - 15}" width="44" height="${RIVER_H + 30}" rx="4" fill="#c08a52"/>
            ${Array.from({ length: 7 }, (_, k) =>
              `<rect x="-22" y="${-RIVER_H / 2 - 15 + 6 + k * 17}" width="44" height="3.5"
                     fill="#7d5430" opacity=".55"/>`).join('')}
          </g>`);
  });

  /* Scenery, once the ground exists and before the road is laid over it.
     It is drawn against the trail's own position so nothing grows through
     the level you are trying to press. */
  const trailX = (y) => tangentAtY(d0, y).x;
  runs.forEach((r, i) => {
    s += drawScenery(r.terrain, i, r, w, trailX);
  });

  /* A destination. A road that simply stops in an empty field is what made
     the bottom of the board read as unfinished; the gate gives the whole
     journey somewhere to be going, and it visibly opens when the course is
     done. */
  const end = pts[pts.length - 1];
  const gateY = end.y + 244;
  // carry the road down to the gate, or it arrives at nothing
  s += `<path d="M${end.x} ${end.y} L${end.x} ${gateY + 8}" fill="none"
              stroke="#b8894f" stroke-width="40" stroke-linecap="round"/>
        <path d="M${end.x} ${end.y} L${end.x} ${gateY + 8}" fill="none"
              stroke="#f2ddb3" stroke-width="30" stroke-linecap="round"/>`;
  const open = LESSONS.every((l) => l.completed);
  /* A finish arch, drawn so it cannot be mistaken for furniture: the banner
     is a swallow-tailed pennant strung ACROSS THE TOP of two posts, and the
     road runs between them. A flat plate with two legs under it is a table. */
  s += `<g transform="translate(${end.x} ${gateY})">
          <ellipse cx="0" cy="56" rx="96" ry="12" fill="#000" opacity=".13"/>
          <rect x="-84" y="-118" width="24" height="174" rx="10" fill="#a06a3c" stroke="#3b3350" stroke-width="5"/>
          <rect x="60" y="-118" width="24" height="174" rx="10" fill="#a06a3c" stroke="#3b3350" stroke-width="5"/>
          <rect x="-90" y="-136" width="36" height="22" rx="7" fill="#8a5e34" stroke="#3b3350" stroke-width="5"/>
          <rect x="54" y="-136" width="36" height="22" rx="7" fill="#8a5e34" stroke="#3b3350" stroke-width="5"/>
          <path d="M-72 -122h144v56L36 -94l-36 28-36-28-36 28z"
                fill="${open ? '#ffd23f' : '#cfc7dd'}" stroke="#3b3350" stroke-width="5"
                stroke-linejoin="round"/>
          <text x="0" y="-98" text-anchor="middle" font-family="Rubik, sans-serif"
                font-size="21" font-weight="800" fill="#3b3350"
                letter-spacing="2.5">${escapeHtml(t('dash.summit'))}</text>
        </g>`;

  // the trail: a dark shoulder, the road, then the walked stretch over the top
  const d = trailPath(pts);
  if (d) {
    const walkedTo = LESSONS.reduce((acc, l, i) => (l.completed ? i : acc), -1);
    s += `<path d="${d}" fill="none" stroke="#b8894f" stroke-width="40" stroke-linecap="round"/>
          <path d="${d}" fill="none" stroke="#f2ddb3" stroke-width="30" stroke-linecap="round"/>`;
    if (walkedTo > 0) {
      /* The walked stretch is the SAME path, clipped with a dash pattern. A
         second spline through a prefix of the points curves differently and
         visibly disagrees with this one at the join. */
      const len = pathLengthTo(d, pts[walkedTo]);
      s += `<path d="${d}" fill="none" stroke="#ffb02e" stroke-width="30" stroke-linecap="round"
                  stroke-dasharray="${len} 100000"/>`;
    }
  }

  s += bridges.join('');
  return s;
}

/** Where the trail crosses a given y, and which way it is heading there.
    `deg` is the rotation that lays an upright object along the road. */
function tangentAtY(d, y) {
  if (!d) return { x: 0, deg: 0 };
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  const total = el.getTotalLength();
  let lo = 0, hi = total;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (el.getPointAtLength(mid).y < y) lo = mid; else hi = mid;
  }
  const at = (lo + hi) / 2;
  const a = el.getPointAtLength(Math.max(0, at - 9));
  const b = el.getPointAtLength(Math.min(total, at + 9));
  // atan2 gives the angle from +x; an upright rect starts along +y, hence -90
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90;
  return { x: Math.round(el.getPointAtLength(at).x), deg: Math.round(deg * 10) / 10 };
}

/** Length along the drawn path up to the node nearest `target`. */
function pathLengthTo(d, target) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  const total = el.getTotalLength();
  let lo = 0, hi = total;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const p = el.getPointAtLength(mid);
    if (p.y < target.y) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** A signpost at the top of each stretch, naming the levels it holds. */
function plates(runs) {
  return runs.map((r) => {
    const done = LESSONS.slice(r.start, r.end + 1).filter((l) => l.completed).length;
    const total = r.end - r.start + 1;
    const label = total === 1
      ? t('dash.levelOne', { a: r.start + 1 })
      : t('dash.levelRange', { a: r.start + 1, b: r.end + 1 });
    /* Top-left corner, never centred: the middle of the board belongs to the
       trail, the level titles and the mascot, and a centred plate lands on
       top of all three. */
    return `<div class="stretch-plate" style="top:${Math.round(r.top + 26)}px">
              <span class="sp-name">${escapeHtml(label)}</span>
              <span class="sp-count">${done}/${total}</span>
            </div>`;
  }).join('');
}

/** The levels themselves — real buttons over the painted ground. */
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
   The figure is the avatar they picked in Settings, so the person on the trail
   is them. Kru CJ is the teacher — he narrates storyboards and answers
   questions, and standing him on the student's own position said the wrong
   thing about whose journey this is. */
function marker(pts, h, w) {
  const i = currentIndex();
  const allDone = LESSONS.length && LESSONS.every((l) => l.completed);

  if (allDone) {
    // beside the gate, which now carries the wording itself
    const end = pts[pts.length - 1];
    return `<div class="finish" style="left:${end.x - 210}px;top:${end.y + 118}px">
              ${studentFigure(me && me.avatar, 132)}
            </div>`;
  }
  if (i < 0) return '';

  /* He stands on whichever side the trail is not using, so he never lands on
     the neighbouring level or its title. */
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
