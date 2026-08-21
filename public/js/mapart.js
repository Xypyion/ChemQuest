/* Map scenery — the drawn chemistry world the trail runs through.
 *
 * Every prop here is inline SVG built at a nominal 100x100 and then placed
 * with a transform, so one prop can appear at any size without a second
 * asset. Nothing loads from disk; the map has no image dependencies.
 *
 * The three terrains the teacher already authors (plain / mountain / snow)
 * become three chemistry places, which keeps the original three-part climb
 * the site started with:
 *
 *   plain    -> the lab bench     glassware, burners, racks
 *   mountain -> the crystal caves crystals, geodes, lattices
 *   snow     -> the cold room     atoms, frost, condensers
 *
 * Scenery is deliberately lower contrast than the trail and the nodes. It
 * has to fill the page without competing with the thing you press.
 *
 * REPLACING THESE WITH REAL ARTWORK: each prop is a function returning SVG
 * markup. Swap a body for an <image href="/assets/whatever.png"/> of the
 * same 100x100 box and everything else — placement, scale, animation
 * classes — keeps working.
 */

/* deterministic jitter: the same map always draws the same scene, so the
   page does not reshuffle itself on every resize */
function seeded(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/* Props sit on the deep enamel board, so they are painted the way a sign is:
   a light body, a bright fill, and the same dark outline every other object
   on this map carries. A dark-on-dark prop simply disappears. */
const GLASS = '#12233f';   /* the painted outline */
const GLINT = '#ffffff';
const STEEL = '#dfe8f5';   /* light fittings: necks, racks, burner bodies */

/* ---- individual props (all drawn inside 0 0 100 100) ---- */

function pFlask(liquid) {
  return `
    <path d="M42 12h16v24l19 41a7 7 0 0 1-6 10H29a7 7 0 0 1-6-10l19-41z"
          fill="${GLINT}" fill-opacity=".78" stroke="${GLASS}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M31 64h38l8 17a5 5 0 0 1-4 6H27a5 5 0 0 1-4-6z" fill="${liquid}"/>
    <circle class="bub b1" cx="42" cy="72" r="3.2" fill="${GLINT}" fill-opacity=".65"/>
    <circle class="bub b2" cx="55" cy="76" r="2.4" fill="${GLINT}" fill-opacity=".55"/>
    <circle class="bub b3" cx="49" cy="70" r="1.9" fill="${GLINT}" fill-opacity=".6"/>
    <rect x="39" y="6" width="22" height="9" rx="4.5" fill="${STEEL}" stroke="${GLASS}" stroke-width="3"/>`;
}

function pBeaker(liquid) {
  return `
    <path d="M27 24h46v50a9 9 0 0 1-9 9H36a9 9 0 0 1-9-9z"
          fill="${GLINT}" fill-opacity=".78" stroke="${GLASS}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M27 54h46v20a9 9 0 0 1-9 9H36a9 9 0 0 1-9-9z" fill="${liquid}"/>
    <circle class="bub b2" cx="44" cy="66" r="2.6" fill="${GLINT}" fill-opacity=".6"/>
    <circle class="bub b1" cx="57" cy="70" r="2" fill="${GLINT}" fill-opacity=".5"/>
    <rect x="22" y="18" width="56" height="9" rx="4.5" fill="${STEEL}" stroke="${GLASS}" stroke-width="3"/>
    <path d="M36 34v14" stroke="${GLASS}" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>`;
}

function pTubes(liquid) {
  const tube = (x, fill, h) => `
    <path d="M${x} 18h17v${h}a8.5 8.5 0 0 1-17 0z"
          fill="${GLINT}" fill-opacity=".8" stroke="${GLASS}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${x} ${18 + h - 22}h17v22a8.5 8.5 0 0 1-17 0z" fill="${fill}"/>`;
  return `
    ${tube(20, liquid, 54)}
    ${tube(42, liquid, 62)}
    ${tube(64, liquid, 48)}
    <rect x="12" y="60" width="76" height="10" rx="4" fill="${STEEL}" stroke="${GLASS}" stroke-width="3"/>`;
}

function pMolecule(tint) {
  return `
    <g stroke="${tint}" stroke-width="5" stroke-linecap="round">
      <path d="M30 62 60 42M60 42 82 58M60 42 54 18"/>
    </g>
    <g stroke="${GLASS}" stroke-width="3.5">
      <circle cx="30" cy="62" r="12" fill="${tint}"/>
      <circle cx="60" cy="42" r="14" fill="${tint}"/>
      <circle cx="82" cy="58" r="9" fill="${tint}"/>
      <circle cx="54" cy="18" r="9" fill="${tint}"/>
    </g>
    <circle cx="56" cy="38" r="4.5" fill="${GLINT}" fill-opacity=".5"/>`;
}

function pCrystal(tint, dark) {
  return `
    <path d="M50 6 74 40 62 92H38L26 40z" fill="${tint}" stroke="${GLASS}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M50 6 74 40 50 48z" fill="${GLINT}" fill-opacity=".3"/>
    <path d="M50 48 62 92H50z" fill="${dark}" fill-opacity=".35"/>
    <path d="M18 52 30 68 24 94H12L8 68z" fill="${tint}" stroke="${GLASS}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M82 58 92 72 88 94H78L74 72z" fill="${tint}" stroke="${GLASS}" stroke-width="3" stroke-linejoin="round"/>`;
}

function pAtom(tint) {
  return `
    <g fill="none" stroke="${tint}" stroke-width="4.5">
      <ellipse cx="50" cy="50" rx="40" ry="16"/>
      <ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(60 50 50)"/>
      <ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(120 50 50)"/>
    </g>
    <circle cx="50" cy="50" r="11" fill="${tint}" stroke="${GLASS}" stroke-width="3.5"/>`;
}

function pBurner(tint) {
  return `
    <path d="M44 40h12v26H44z" fill="${STEEL}" stroke="${GLASS}" stroke-width="3"/>
    <path d="M26 66h48l6 14H20z" fill="${STEEL}" stroke="${GLASS}" stroke-width="3" stroke-linejoin="round"/>
    <path class="flame" d="M50 12c8 10 11 15 11 21a11 11 0 0 1-22 0c0-6 3-11 11-21z" fill="${tint}" stroke="${GLASS}" stroke-width="3"/>
    <path class="flame" d="M50 24c3 5 4 7 4 10a4 4 0 0 1-8 0c0-3 1-5 4-10z" fill="${GLINT}" fill-opacity=".55"/>`;
}

/* ---- what each place is made of ---- */
const PLACES = {
  plain: {
    liquid: '#3fc4d8',
    tint: '#f7bf2e',
    dark: '#c8930f',
    props: [pFlask, pBeaker, pTubes, pBurner, pMolecule],
  },
  mountain: {
    liquid: '#c79bf0',
    tint: '#b98fe0',
    dark: '#7b57a8',
    props: [pCrystal, pMolecule, pCrystal, pFlask, pAtom],
  },
  snow: {
    liquid: '#6fd2f5',
    tint: '#8fd8f0',
    dark: '#3b8fb5',
    props: [pAtom, pCrystal, pTubes, pMolecule, pCrystal],
  },
};

/**
 * Scenery for one unit, as SVG markup.
 *
 * Props live in the margins either side of the trail column. On a narrow
 * screen those margins do not exist, so the scene thins out rather than
 * piling up behind the path — the trail must stay the clearest thing here.
 *
 * @param {string} terrain     plain | mountain | snow
 * @param {number} unitIndex   which unit, used only as a stable seed
 * @param {{top:number,bottom:number}} band  vertical extent of the unit
 * @param {number} w           full map width
 * @param {number} colLeft     left edge of the trail column
 * @param {number} colRight    right edge of the trail column
 */
function sceneryFor(terrain, unitIndex, band, w, colLeft, colRight) {
  const place = PLACES[terrain] || PLACES.plain;
  const gutter = 18;
  const margins = [
    { x0: gutter, x1: colLeft - 26 },
    { x0: colRight + 26, x1: w - gutter },
  ].filter((m) => m.x1 - m.x0 > 74);

  if (!margins.length) return '';

  const height = band.bottom - band.top;
  const perMargin = Math.max(1, Math.min(4, Math.round(height / 155)));
  const out = [];

  margins.forEach((m, mi) => {
    const room = m.x1 - m.x0;
    /* Step through the prop list rather than picking at random: pure random
       kept stacking three identical burners down one margin. The seed only
       decides where the walk starts, so each margin still differs. */
    const offset = Math.floor(seeded(unitIndex + 1, mi + 1) * place.props.length);
    for (let i = 0; i < perMargin; i++) {
      const r1 = seeded(unitIndex * 7 + mi * 3, i);
      const r2 = seeded(unitIndex * 11 + mi, i * 5 + 2);
      const r3 = seeded(unitIndex + mi * 13, i * 3 + 7);

      const size = 68 + r1 * 52;
      if (size > room) continue;

      const x = m.x0 + r2 * (room - size);
      const slot = height / perMargin;
      const y = band.top + slot * i + r3 * Math.max(10, slot - size);
      const draw = place.props[(offset + i * 2) % place.props.length];
      const tilt = (r3 - 0.5) * 9;

      out.push(`
        <g class="prop" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})
                                   scale(${(size / 100).toFixed(3)})
                                   rotate(${tilt.toFixed(1)} 50 50)">
          ${draw(draw === pCrystal ? place.tint : (draw === pMolecule || draw === pAtom || draw === pBurner ? place.tint : place.liquid), place.dark)}
        </g>`);
    }

  });

  return out.join('');
}
