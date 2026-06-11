// Student dashboard: build a vertical journey through 3 biomes with 3D-style
// models and props, from the lesson list.

const me = guard('student');
addClouds();
mountLangSwitch();

let LESSONS = [];

document.getElementById('navUser').innerHTML = `${me.avatar || '🧑‍🎓'} ${escapeHtml(me.name)}`;

const BIOMES = {
  plain: { name: () => t('biome.meadow'), grad: 'linear-gradient(180deg,#a9e87f,#73c94f)', props: ['tree', 'flower', 'mushroom', 'bush', 'log', 'flower', 'rock', 'tree'] },
  mountain: { name: () => t('biome.ember'), grad: 'linear-gradient(180deg,#f7d99a,#e3a25f)', props: ['rock', 'crystalAmber', 'campfire', 'signpost', 'crystalAmber', 'rock'] },
  snow: { name: () => t('biome.sky'), grad: 'linear-gradient(180deg,#e3f1ff,#f3d6ef)', props: ['arch', 'crystalBlue', 'portal', 'cloud', 'crystalPink', 'arch'] },
};
const PROP_SIZE = {
  tree: [98, 130], bush: [82, 112], flower: [40, 60], mushroom: [46, 70], rock: [62, 104], log: [92, 122],
  campfire: [64, 86], crystalAmber: [66, 98], crystalBlue: [66, 98], crystalPink: [60, 88], arch: [72, 102], portal: [92, 122], cloud: [110, 152], signpost: [60, 84],
};
const SWAY = new Set(['tree', 'bush', 'flower']);
const BOBBLE = new Set(['crystalAmber', 'crystalBlue', 'crystalPink', 'portal', 'cloud']);
const MOODS = ['wave', 'happy', 'excited', 'cheer', 'thinking', 'happy'];
const HATS = ['cap', 'wizard', 'crown'];

// seeded RNG so the prop layout stays stable across resizes
let _seed = 9173;
function srand() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function srange(a, b) { return a + srand() * (b - a); }
function spick(a) { return a[Math.floor(srand() * a.length)]; }

init();

async function init() {
  try {
    const data = await API.get('/api/lessons');
    LESSONS = data.lessons;
    document.getElementById('navPoints').textContent = data.points || 0;
    const done = LESSONS.filter((l) => l.completed).length;
    const pct = LESSONS.length ? Math.round((done / LESSONS.length) * 100) : 0;
    document.getElementById('progFill').style.width = pct + '%';
    document.getElementById('progLabel').textContent =
      done === LESSONS.length && LESSONS.length
        ? t('dash.progressDone', { done, total: LESSONS.length })
        : t('dash.progress', { done, total: LESSONS.length });
    buildMap();
  } catch (err) { toast(err.message, 'bad'); }
}

function propSvg(token) {
  if (token === 'crystalAmber') return PROPS.crystal('amber');
  if (token === 'crystalBlue') return PROPS.crystal('blue');
  if (token === 'crystalPink') return PROPS.crystal('pink');
  if (token === 'flower') return PROPS.flower(spick(['#ff6fb5', '#ffd23f', '#a86bff', '#ff8a3d', '#ff5d5d']));
  if (token === 'arch') return PROPS.arch('ice');
  return PROPS[token] ? PROPS[token]() : PROPS.tree();
}

function buildMap() {
  _seed = 9173;
  const scene = document.getElementById('scene');
  const W = scene.clientWidth || 920;
  const n = LESSONS.length;
  const spacing = W < 560 ? 200 : 240;
  const topPad = 150;
  const bottomPad = 150;
  const H = topPad + Math.max(0, n - 1) * spacing + bottomPad;
  scene.style.height = H + 'px';

  // node coordinates (Lv.1 at the top, descending through the biomes)
  const coords = LESSONS.map((_, i) => {
    const y = topPad + i * spacing;
    let x = W * (0.5 + 0.3 * Math.sin(i * 0.95 + 0.6));
    x = Math.max(86, Math.min(W - 86, x));
    return { x, y };
  });

  // group consecutive levels by terrain into biome bands
  const groups = [];
  LESSONS.forEach((l, i) => {
    const terr = l.terrain || 'plain';
    const last = groups[groups.length - 1];
    if (last && last.terrain === terr) last.end = i;
    else groups.push({ terrain: terr, start: i, end: i });
  });
  groups.forEach((grp, gi) => {
    grp.topY = gi === 0 ? 0 : (coords[grp.start].y + coords[grp.start - 1].y) / 2;
    grp.botY = gi === groups.length - 1 ? H : (coords[grp.end].y + coords[grp.end + 1].y) / 2;
  });

  let html = '';

  // ---- biome bands ----
  groups.forEach((grp) => {
    const b = BIOMES[grp.terrain] || BIOMES.plain;
    html += `<div class="band" style="top:${grp.topY}px;height:${grp.botY - grp.topY}px;background:${b.grad};z-index:1">
      <div class="band-label">${b.name()}</div></div>`;
  });

  // ---- props per band ----
  groups.forEach((grp) => {
    const b = BIOMES[grp.terrain] || BIOMES.plain;
    const h = grp.botY - grp.topY;
    const count = Math.max(3, Math.min(10, Math.round(h / 120)));
    for (let j = 0; j < count; j++) {
      const token = b.props[j % b.props.length];
      const left = (j % 2 === 0) ? srange(5, 22) : srange(78, 95);
      const y = grp.topY + ((j + 0.6) / count) * h + srange(-20, 20);
      const size = srange(PROP_SIZE[token][0], PROP_SIZE[token][1]);
      const anim = SWAY.has(token) ? ' sway' : BOBBLE.has(token) ? ' bobble' : '';
      html += `<div class="prop-wrap${anim}" style="left:${left}%;top:${y}px;width:${size}px;transform:translate(-50%,-50%)">${propSvg(token)}</div>`;
    }
  });

  // ---- rivers + bridges at biome boundaries ----
  groups.forEach((grp, gi) => {
    if (gi === 0) return;
    const by = grp.topY;
    const bridgeX = (coords[grp.start].x + coords[grp.start - 1].x) / 2;
    html += `<div class="river" style="top:${by - 45}px"></div>`;
    html += `<div class="bridge" style="left:${bridgeX}px;top:${by}px"></div>`;
  });

  // ---- trail (path segments) ----
  let segs = '';
  for (let i = 0; i < n - 1; i++) {
    const a = coords[i], c = coords[i + 1];
    const walked = LESSONS[i].completed;
    segs += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#b58a52" stroke-width="28" stroke-linecap="round"/>`;
    segs += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${walked ? '#ffe1a0' : '#f0d6a0'}" stroke-width="18" stroke-linecap="round"/>`;
    if (walked) segs += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#ffb43d" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 16"/>`;
  }
  html += `<svg class="trail" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none" style="z-index:4">${segs}</svg>`;

  // ---- banners ----
  html += `<div class="banner" style="top:14px;color:#236b18;background:rgba(255,255,255,.82);padding:6px 18px;border-radius:999px;box-shadow:var(--shadow-soft)">${t('dash.start')}</div>`;
  html += `<div class="banner" style="bottom:12px;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.3)"><span style="font-size:1.7rem">🏁</span><br>${t('dash.summit')}</div>`;

  // ---- level nodes (models) ----
  let currentIdx = LESSONS.findIndex((l) => !l.locked && !l.completed);
  LESSONS.forEach((l, i) => {
    const { x, y } = coords[i];
    const state = l.locked ? 'locked' : l.completed ? 'done' : 'available';
    let model, extra = '';
    if (state === 'locked') {
      model = renderRuby('thinking', { size: 92, silhouette: true });
    } else if (state === 'done') {
      const hat = (i + 1) % 3 === 0 ? HATS[Math.floor(i / 3) % HATS.length] : null;
      model = renderRuby(MOODS[i % MOODS.length], { size: 96, hat });
      extra = `<div class="score-pop">⭐ ${l.bestScore}</div>`;
    } else {
      model = renderRuby('wave', { size: 100, float: true });
      extra = `<div class="here-bubble">${t('dash.tapToPlay')}</div>`;
    }
    const tagIcon = state === 'done' ? '<span class="ck">✓</span>' : state === 'locked' ? '<span class="lk">🔒</span>' : '';
    html += `
      <div class="node ${state}" style="left:${x}px;top:${y}px" data-id="${l.id}" data-state="${state}">
        ${extra}
        <div class="model">${model}</div>
        <div class="lvtag">${tagIcon} ${t('dash.lv', { n: i + 1 })}</div>
      </div>`;
  });

  scene.innerHTML = html;

  // ---- interactions ----
  scene.querySelectorAll('.node').forEach((node) => {
    node.addEventListener('click', () => {
      if (node.dataset.state === 'locked') {
        toast(t('dash.lockedToast'), 'bad');
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 500);
        return;
      }
      // The level board (hub) opens first: start level / assignments / post-test.
      location.href = `/level.html?id=${encodeURIComponent(node.dataset.id)}`;
    });
  });

  if (currentIdx >= 0) {
    const target = scene.querySelector(`.node[data-id="${LESSONS[currentIdx].id}"]`);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  }
}

let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(buildMap, 200); });
