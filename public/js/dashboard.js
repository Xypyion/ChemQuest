// Student course map: levels drawn as element tiles, grouped into units by
// terrain and joined by bond lines. Position is the sequence, colour is the
// unit, the border is the state.

const me = guard('student');
mountLangSwitch();

let LESSONS = [];

document.getElementById('navUser').textContent = me.name;

// Terrain already groups consecutive levels, so units come from the data the
// teacher authors today — no extra field required.
const UNIT_LABEL = {
  plain: () => t('unit.one'),
  mountain: () => t('unit.two'),
  snow: () => t('unit.three'),
};

const ICON = {
  check: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
};

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

// Words that carry no meaning in a title, so they never decide a symbol.
const SKIP_WORDS = new Set(['a', 'an', 'the', 'is', 'are', 'of', 'on', 'in', 'to', 'and', 'or', 'for', 'with', 'what']);

/**
 * The tile symbol. The teacher may set one explicitly; otherwise it derives
 * from the title they already wrote, so no new required field is introduced.
 *
 * Latin: the first two letters of the first meaningful word, so
 * "States of Matter" becomes "St". Thai and other non-Latin scripts have no
 * clean two-letter form and slicing them mangles the word, so those tiles
 * carry the level number and let the title underneath do the work.
 *
 * `used` keeps symbols unique across the map — two tiles both reading "Mi"
 * would defeat the point of having a symbol at all.
 */
function symbolFor(lesson, index, used) {
  const num = String(index + 1).padStart(2, '0');
  const explicit = (lesson.symbol || '').trim();
  if (explicit) {
    const key = explicit.toLowerCase();
    if (used.has(key)) return { text: num, long: false };
    used.add(key);
    return { text: explicit, long: explicit.length > 2 };
  }

  const title = (lesson.title || '').trim();
  if (!title) return { text: num, long: false };

  // Non-Latin script (Thai included): the level number is the honest symbol.
  const isAscii = Array.from(title).every((ch) => ch.charCodeAt(0) < 128);
  if (!isAscii) return { text: num, long: false };

  const words = title.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  const meaningful = words.filter((w) => !SKIP_WORDS.has(w.toLowerCase()));
  const base = meaningful[0] || words[0];
  if (!base) return { text: num, long: false };

  const cap = (a, b) => a.toUpperCase() + (b || '').toLowerCase();

  // first two letters, then the first paired with each later letter,
  // then the next word's initial, and finally the number
  const tries = [cap(base[0], base[1])];
  for (let i = 2; i < base.length; i++) tries.push(cap(base[0], base[i]));
  if (meaningful[1]) tries.push(cap(base[0], meaningful[1][0]));

  for (const c of tries) {
    if (!used.has(c.toLowerCase())) { used.add(c.toLowerCase()); return { text: c, long: false }; }
  }
  return { text: num, long: false };
}

function buildMap() {
  const usedSymbols = new Set();
  const scene = document.getElementById('scene');

  if (!LESSONS.length) {
    scene.innerHTML = `
      <div class="map-empty">
        <img src="/assets/mascot-wave.png" alt="" />
        <h2>${escapeHtml(t('dash.emptyTitle'))}</h2>
        <p>${escapeHtml(t('dash.emptyBody'))}</p>
      </div>`;
    return;
  }

  // group consecutive levels sharing a terrain into units
  const groups = [];
  LESSONS.forEach((l, i) => {
    const terrain = l.terrain || 'plain';
    const last = groups[groups.length - 1];
    if (last && last.terrain === terrain) last.items.push({ lesson: l, index: i });
    else groups.push({ terrain, items: [{ lesson: l, index: i }] });
  });

  const currentIdx = LESSONS.findIndex((l) => !l.locked && !l.completed);

  const html = groups.map((grp) => {
    const label = (UNIT_LABEL[grp.terrain] || UNIT_LABEL.plain)();
    const cleared = grp.items.filter((it) => it.lesson.completed).length;
    const hasNow = grp.items.some((it) => it.index === currentIdx);

    const chain = grp.items.map((it, j) => {
      const prev = grp.items[j - 1];
      const bond = j === 0 ? '' :
        `<span class="bond${prev.lesson.completed ? ' walked' : ''}" aria-hidden="true"></span>`;
      return bond + tileHtml(it.lesson, it.index, it.index === currentIdx, usedSymbols);
    }).join('');

    return `
      <section class="unit u-${escapeHtml(grp.terrain)}" aria-label="${escapeHtml(label)}">
        <div class="unit-head">
          <span class="unit-chip">${escapeHtml(label)}</span>
          <span class="unit-count">${cleared} / ${grp.items.length}</span>
        </div>
        <div class="chain${hasNow ? ' has-now' : ''}">${chain}</div>
      </section>`;
  }).join('');

  scene.innerHTML = `
    <div class="units">${html}</div>
    <div class="map-legend">
      <span class="leg"><span class="sw done"></span> ${escapeHtml(t('dash.legendDone'))}</span>
      <span class="leg"><span class="sw now"></span> ${escapeHtml(t('dash.legendNow'))}</span>
      <span class="leg"><span class="sw locked"></span> ${escapeHtml(t('dash.legendLocked'))}</span>
    </div>`;

  scene.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      if (tile.dataset.state === 'locked') {
        toast(lockedToastFor(tile.dataset.reason, tile.dataset.opensAt), 'bad');
        tile.classList.add('shake');
        setTimeout(() => tile.classList.remove('shake'), 450);
        return;
      }
      location.href = `/level.html?id=${encodeURIComponent(tile.dataset.id)}`;
    });
  });

  // bring the open level into view inside its own horizontal chain
  const now = scene.querySelector('.tile.is-now');
  if (now) {
    setTimeout(() => {
      now.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 250);
  }
}

function tileHtml(lesson, index, isNow, used) {
  const state = lesson.locked ? 'locked' : lesson.completed ? 'done' : (isNow ? 'now' : 'open');
  const sym = symbolFor(lesson, index, used);
  const n = String(index + 1).padStart(2, '0');

  const mark =
    state === 'done' ? `<span class="t-mark">${ICON.check}</span>`
    : state === 'locked' ? `<span class="t-mark">${ICON.lock}</span>`
    : '';

  const aria = t('dash.tileAria', {
    n: index + 1,
    title: lesson.title || '',
    state: t('dash.state.' + state),
  });

  const tile = `
    <button type="button" class="tile is-${state}" data-id="${escapeHtml(lesson.id)}"
            data-state="${state === 'now' || state === 'open' ? 'open' : state}"
            data-reason="${escapeHtml(lesson.lockReason || '')}"
            data-opens-at="${escapeHtml(lesson.opensAt || '')}"
            ${state === 'locked' ? 'aria-disabled="true"' : ''}
            aria-label="${escapeHtml(aria)}">
      <span class="t-no">${n}</span>
      ${mark}
      <span class="t-sym${sym.long ? ' long' : ''}">${escapeHtml(sym.text)}</span>
      <span class="t-name">${escapeHtml(lesson.title || '')}</span>
    </button>`;

  if (!isNow) return tile;

  return `
    <span class="now-slot">
      <img class="now-ruby" src="/assets/mascot-wave.png" alt="" />
      ${tile}
      <span class="now-label">${escapeHtml(t('dash.youAreHere'))}</span>
    </span>`;
}

// Pick the right "why is this locked" message for a tile.
function lockedToastFor(reason, opensAt) {
  if (reason === 'teacher') return t('dash.lockedTeacher');
  if (reason === 'scheduled') return t('dash.lockedSchedule', { time: opensAt ? fmtWhen(opensAt) : '' });
  if (reason === 'posttest') return t('dash.lockedPost');
  return t('dash.lockedToast');
}
