/* The scenery on the course map.
 *
 * WHY THIS REPLACED props.js
 * The old props were airbrushed: radial gradients, soft shading, no outline.
 * The mascot artwork next to them is the opposite — flat colour inside a
 * thick dark keyline. Two illustration languages on one board is most of why
 * the map looked wrong, whatever else was fixed. Everything here is drawn in
 * the mascot's language so the board looks like one hand made it:
 *
 *   - a KEYLINE of INK at roughly 5/120 of the box, round joins
 *   - flat fills, no gradients
 *   - exactly one lighter shape as a highlight
 *   - a soft ground shadow so the prop stands on the ground
 *
 * Every prop is drawn inside a 0 0 120 120 box and placed with a transform,
 * so one definition serves every size. They are painted into the map's own
 * <svg>, which means they scale with the board and need no second layer.
 */

const INK = '#3b3350';

/* dark keyline + flat fill, the two attributes every shape here shares */
const line = (fill, w = 5) =>
  `fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const shade = 'fill="#000" opacity=".13"';

const ART = {
  /* ---- green ground ---- */
  tree: () => `
    <ellipse cx="60" cy="112" rx="30" ry="7" ${shade}/>
    <path d="M53 74h14v36a7 7 0 0 1-14 0z" ${line('#a06a3c')}/>
    <path d="M60 12c19 0 33 13 33 29 0 4-1 8-3 11 6 4 9 10 9 16 0 12-12 21-27 21H48c-15 0-27-9-27-21 0-6 3-12 9-16-2-3-3-7-3-11 0-16 14-29 33-29z" ${line('#63c93f')}/>
    <path d="M42 32c5-7 13-11 21-11" fill="none" stroke="#a8ee84" stroke-width="7" stroke-linecap="round"/>`,

  bush: () => `
    <ellipse cx="60" cy="110" rx="36" ry="7" ${shade}/>
    <circle cx="32" cy="80" r="26" ${line('#4fae38')}/>
    <circle cx="88" cy="80" r="26" ${line('#4fae38')}/>
    <circle cx="60" cy="56" r="32" ${line('#63c93f')}/>
    <path d="M46 42c4-6 10-9 17-10" fill="none" stroke="#a8ee84" stroke-width="7" stroke-linecap="round"/>
    <circle cx="40" cy="84" r="5" ${line('#ff6fb5', 3.5)}/>
    <circle cx="82" cy="88" r="4.5" ${line('#ffd23f', 3.5)}/>`,

  flower: (c) => `
    <ellipse cx="60" cy="112" rx="16" ry="5" ${shade}/>
    <path d="M60 58v52" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
    <path d="M60 60v50" fill="none" stroke="#4faa32" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M60 84c-9 0-16-5-18-12 8-2 15 1 18 6z" ${line('#4faa32', 4)}/>
    ${[0, 72, 144, 216, 288].map((a) =>
      `<ellipse cx="60" cy="30" rx="11" ry="17" ${line(c || '#ff6fb5')} transform="rotate(${a} 60 46)"/>`).join('')}
    <circle cx="60" cy="46" r="10" ${line('#ffd23f')}/>`,

  mushroom: () => `
    <ellipse cx="60" cy="110" rx="22" ry="6" ${shade}/>
    <path d="M48 58h24v40a12 12 0 0 1-24 0z" ${line('#f6ecd6')}/>
    <path d="M18 60C18 34 37 16 60 16s42 18 42 44z" ${line('#ef4b4b')}/>
    <circle cx="42" cy="42" r="7" ${line('#fff6f0', 3.5)}/>
    <circle cx="72" cy="36" r="6" ${line('#fff6f0', 3.5)}/>`,

  /* ---- chemistry landmarks: the reason this is a chemistry course and not
     a generic adventure. One per stretch at most — a landmark stops being one
     when it is everywhere. ---- */
  flaskSign: () => `
    <ellipse cx="60" cy="114" rx="20" ry="6" ${shade}/>
    <path d="M56 74h8v38h-8z" ${line('#a06a3c')}/>
    <path d="M50 14h20v22l16 27a9 9 0 0 1-8 14H42a9 9 0 0 1-8-14l16-27z" ${line('#eaf6ff')}/>
    <path d="M41 55h38l10 17a7 7 0 0 1-6 11H37a7 7 0 0 1-6-11z" fill="#46b6ea"/>
    <circle cx="52" cy="68" r="4" fill="#bfe9ff"/>
    <circle cx="66" cy="73" r="3" fill="#bfe9ff"/>`,

  molecule: (c) => `
    <ellipse cx="60" cy="114" rx="26" ry="6" ${shade}/>
    <path d="M60 92v22" fill="none" stroke="#8a7f5c" stroke-width="9" stroke-linecap="round"/>
    <path d="M60 62 26 40M60 62l34-22M60 62v26" fill="none" stroke="${INK}"
          stroke-width="13" stroke-linecap="round"/>
    <circle cx="26" cy="38" r="19" ${line(c || '#8ad1ff')}/>
    <circle cx="94" cy="38" r="19" ${line(c || '#8ad1ff')}/>
    <circle cx="60" cy="66" r="25" ${line('#ff8a3d')}/>
    <circle cx="51" cy="57" r="7" fill="#ffd0a8"/>`,

  /* ---- dry ground ---- */
  rock: () => `
    <ellipse cx="60" cy="106" rx="36" ry="7" ${shade}/>
    <path d="M24 98 32 56l22-16 30 8 12 34-10 16z" ${line('#b9a58c')}/>
    <path d="M32 56l22-16 30 8-26 14z" fill="#d9cbb6"/>`,

  crystal: (c) => `
    <ellipse cx="60" cy="112" rx="30" ry="7" ${shade}/>
    <path d="M60 8 84 44 72 110H48L36 44z" ${line(c || '#b08ce8')}/>
    <path d="M60 8 84 44 60 54z" fill="#ffffff" opacity=".38"/>
    <path d="M22 56 36 76 30 112H14L8 76z" ${line(c || '#b08ce8', 4)}/>
    <path d="M98 62l14 18-6 32H92l-6-32z" ${line(c || '#b08ce8', 4)}/>`,

  campfire: () => `
    <ellipse cx="60" cy="106" rx="32" ry="7" ${shade}/>
    <path d="M30 92 90 82M90 92 30 82" fill="none" stroke="#9c6b3f" stroke-width="13" stroke-linecap="round"/>
    <path d="M60 22c14 17 20 27 20 38a20 20 0 0 1-40 0c0-11 6-21 20-38z" ${line('#ff8a3d')}/>
    <path d="M60 48c6 9 9 13 9 18a9 9 0 0 1-18 0c0-5 3-9 9-18z" fill="#ffd23f"/>`,

  /* ---- cold ground ---- */
  pine: () => `
    <ellipse cx="60" cy="112" rx="26" ry="7" ${shade}/>
    <path d="M54 88h12v24H54z" ${line('#8a5e34')}/>
    <path d="M60 10 88 50H32zM60 40l30 42H30z" ${line('#3f9e7a')}/>
    <path d="M60 10 88 50H60z" fill="#eafff6" opacity=".5"/>`,

  iceRock: () => `
    <ellipse cx="60" cy="106" rx="34" ry="7" ${shade}/>
    <path d="M26 98 34 58l22-16 30 8 12 34-10 14z" ${line('#c9d6ee')}/>
    <path d="M34 58l22-16 30 8-4 10c-16 6-33 5-48-2z" ${line('#ffffff', 4)}/>`,
};

/* Which props belong on which ground, and roughly how big each is. */
/* `tint` is the colour of whatever prop takes one, and it is chosen AGAINST
   the ground it stands on: an amber crystal on amber sand is invisible no
   matter how good the drawing is. */
const SCENERY = {
  plain:    { props: ['tree', 'bush', 'flower', 'mushroom', 'bush', 'tree'], landmark: 'flaskSign',
              tint: '#ff6fb5', size: [96, 152] },
  mountain: { props: ['rock', 'crystal', 'campfire', 'rock', 'crystal'],     landmark: 'molecule',
              tint: '#9b6be0', size: [92, 142] },
  snow:     { props: ['pine', 'iceRock', 'crystal', 'pine', 'iceRock'],      landmark: 'molecule',
              tint: '#5aa9e6', size: [94, 146] },
};

/* Deterministic jitter: the same course always draws the same scene, so the
   board does not reshuffle itself every time the window is resized. */
function seeded(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Scenery for one stretch of ground, as SVG markup for the map's own <svg>.
 *
 * @param {string}   terrain   plain | mountain | snow
 * @param {number}   index     which stretch — a stable seed, nothing more
 * @param {{top:number,bot:number}} band  its vertical extent
 * @param {number}   w         board width
 * @param {(y:number)=>number} trailX  where the trail is at a given y
 */
function sceneryFor(terrain, index, band, w, trailX) {
  const kind = SCENERY[terrain] || SCENERY.plain;
  const height = band.bot - band.top;
  if (height < 90) return '';

  /* Props keep clear of the road AND of the level buttons standing on it.
     CLEAR is half the road plus half a level disc plus a margin — without it
     a tree grows through the button you are trying to press. */
  const CLEAR = 120;
  const out = [];
  const count = Math.max(2, Math.min(10, Math.round(height / 112)));

  for (let i = 0; i < count; i++) {
    const r1 = seeded(index * 31 + i, 1);
    const r2 = seeded(index * 17 + i, 2);
    const r3 = seeded(index * 53 + i, 3);

    const size = Math.round(kind.size[0] + r1 * (kind.size[1] - kind.size[0]));
    const y = band.top + 22 + ((i + 0.5) / count) * (height - 56) + (r3 - 0.5) * 30;
    if (y < band.top + 6 || y + size > band.bot + 8) continue;

    // left or right of the road, whichever has room at this height
    const tx = trailX(y + size / 2);
    const leftRoom = tx - CLEAR - 14;
    const rightRoom = w - 14 - (tx + CLEAR);
    let x = null;
    const wantRight = i % 2 === 1;
    if (wantRight && rightRoom > size) x = tx + CLEAR + r2 * (rightRoom - size);
    else if (!wantRight && leftRoom > size) x = 14 + r2 * (leftRoom - size);
    else if (rightRoom > size) x = tx + CLEAR + r2 * (rightRoom - size);
    else if (leftRoom > size) x = 14 + r2 * (leftRoom - size);
    if (x === null) continue;

    const name = (i === count - 1 && kind.landmark) ? kind.landmark : kind.props[i % kind.props.length];
    const swayed = name === 'tree' || name === 'flower' || name === 'bush';
    const tilt = swayed || name === 'pine' ? (r1 - 0.5) * 5 : 0;

    out.push(`<g class="prop${swayed ? ' sway' : ''}"
                  transform="translate(${Math.round(x)} ${Math.round(y)})
                             scale(${(size / 120).toFixed(3)})
                             rotate(${tilt.toFixed(1)} 60 110)">${ART[name](kind.tint)}</g>`);
  }
  return out.join('');
}
