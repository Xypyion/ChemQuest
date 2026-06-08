/* Ruby — ChemQuest's friendly red guide mascot.
   An original cartoon character (a round red explorer with a little atom
   antenna), drawn as inline SVG with glossy shading so she reads as a 3D-ish
   model. renderRuby(mood, opts) returns SVG markup.
   opts: { size, float, silhouette (grey locked look), hat: 'cap'|'wizard'|'crown' } */

let _rubyCount = 0;

function renderRuby(mood = 'happy', opts = {}) {
  const size = opts.size || 220;
  const uid = 'r' + (++_rubyCount);
  const floatCls = opts.float ? ' ruby-bob' : '';
  const waveCls = mood === 'wave' && !opts.silhouette ? ' wave' : '';
  const sil = !!opts.silhouette;
  const hat = opts.hat;

  let mouth = '', leftPupil = 0, rightPupil = 0, pupilY = 0, browR = '';
  let armLeft = arm(false, 'left'), armRight = arm(false, 'right');

  if (!sil) {
    switch (mood) {
      case 'excited':
        mouth = `<path d="M78 150 Q100 178 122 150 Q100 162 78 150 Z" fill="#7a1f1b"/><path d="M92 165 q8 10 16 0 z" fill="#ff8e8e"/>`;
        armLeft = arm(true, 'left'); armRight = arm(true, 'right'); break;
      case 'cheer':
        mouth = `<path d="M76 148 Q100 184 124 148 Q100 168 76 148 Z" fill="#7a1f1b"/>`;
        armLeft = arm(true, 'left'); armRight = arm(true, 'right'); break;
      case 'thinking':
        mouth = `<circle cx="104" cy="153" r="6" fill="#7a1f1b"/>`; pupilY = -3; leftPupil = 2; rightPupil = 2;
        browR = `<path d="M112 102 q10 -6 18 -1" stroke="#7a1f1b" stroke-width="4" fill="none" stroke-linecap="round"/>`; break;
      case 'sad':
        mouth = `<path d="M82 156 Q100 142 118 156" stroke="#7a1f1b" stroke-width="5" fill="none" stroke-linecap="round"/>`; pupilY = 2;
        armLeft = arm(false, 'left'); armRight = arm(false, 'right'); break;
      case 'wave':
        mouth = `<path d="M82 148 Q100 166 118 148" stroke="#7a1f1b" stroke-width="5" fill="none" stroke-linecap="round"/>`;
        armRight = arm(true, 'right'); break;
      default:
        mouth = `<path d="M82 148 Q100 168 118 148" stroke="#7a1f1b" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    }
  }

  const bodyFill = sil ? `url(#sil-${uid})` : `url(#body-${uid})`;
  const showAntenna = !hat && !sil;

  const face = sil
    ? `<text x="100" y="150" text-anchor="middle" font-size="78" font-weight="bold" fill="#ffffff" opacity=".85" font-family="sans-serif">?</text>`
    : `<ellipse cx="100" cy="128" rx="50" ry="48" fill="#fff2ec"/>
       <ellipse cx="70" cy="142" rx="11" ry="7" fill="#ffb0c2" opacity=".8"/>
       <ellipse cx="130" cy="142" rx="11" ry="7" fill="#ffb0c2" opacity=".8"/>
       ${browR}
       <g class="blink">
         <circle cx="82" cy="120" r="13" fill="#fff"/><circle cx="118" cy="120" r="13" fill="#fff"/>
         <circle cx="${82 + leftPupil}" cy="${120 + pupilY}" r="7" fill="#3a3357"/>
         <circle cx="${118 + rightPupil}" cy="${120 + pupilY}" r="7" fill="#3a3357"/>
         <circle cx="${85 + leftPupil}" cy="${117 + pupilY}" r="2.4" fill="#fff"/>
         <circle cx="${121 + rightPupil}" cy="${117 + pupilY}" r="2.4" fill="#fff"/>
       </g>
       ${mouth}`;

  return `
  <svg class="ruby${floatCls}${waveCls}" viewBox="0 0 200 240" width="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="Ruby the chemistry mascot">
    <defs>
      <radialGradient id="body-${uid}" cx="38%" cy="30%" r="78%">
        <stop offset="0%" stop-color="#ff7c6f"/><stop offset="55%" stop-color="#f0463c"/><stop offset="100%" stop-color="#cf2a23"/>
      </radialGradient>
      <radialGradient id="sil-${uid}" cx="38%" cy="30%" r="78%">
        <stop offset="0%" stop-color="#d7d3e6"/><stop offset="100%" stop-color="#a9a3c2"/>
      </radialGradient>
    </defs>

    <ellipse cx="100" cy="224" rx="54" ry="11" fill="rgba(0,0,0,.16)"/>

    ${showAntenna ? `
    <path d="M100 60 q-6 -22 4 -34" stroke="#e0322b" stroke-width="6" fill="none" stroke-linecap="round"/>
    <g class="ruby-atom" transform="translate(106 22)">
      <ellipse rx="13" ry="5" fill="none" stroke="#36b9ff" stroke-width="2.5"/>
      <ellipse rx="13" ry="5" fill="none" stroke="#a86bff" stroke-width="2.5" transform="rotate(60)"/>
      <ellipse rx="13" ry="5" fill="none" stroke="#ffd23f" stroke-width="2.5" transform="rotate(120)"/>
      <circle r="5" fill="#ff8a3d"/>
    </g>` : (sil ? `<path d="M100 60 q-6 -20 3 -30" stroke="#a9a3c2" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="103" cy="28" r="6" fill="#bdb8d4"/>` : '')}

    ${armLeft}${armRight}

    <rect x="40" y="58" width="120" height="150" rx="58" fill="${bodyFill}"/>
    <ellipse cx="78" cy="92" rx="24" ry="16" fill="#fff" opacity="${sil ? 0.25 : 0.22}"/>
    <ellipse cx="74" cy="210" rx="20" ry="13" fill="${sil ? '#9690b0' : '#c92d27'}"/>
    <ellipse cx="126" cy="210" rx="20" ry="13" fill="${sil ? '#9690b0' : '#c92d27'}"/>

    ${face}
    ${hat && !sil ? renderHat(hat) : ''}
  </svg>`;

  function arm(up, side) {
    const x = side === 'left' ? 30 : 150;
    const rot = up ? (side === 'left' ? -55 : 55) : (side === 'left' ? 18 : -18);
    const cls = side === 'right' ? 'arm-r' : 'arm-l';
    const fill = sil ? '#a9a3c2' : '#e0322b';
    const hand = sil ? '#bdb8d4' : '#ff6a5e';
    return `<g class="${cls}" transform="translate(${x} 120) rotate(${rot})">
              <rect x="-9" y="0" width="18" height="56" rx="9" fill="${fill}"/>
              <circle cx="0" cy="58" r="11" fill="${hand}"/></g>`;
  }
}

function renderHat(kind) {
  if (kind === 'wizard') {
    return `<g transform="translate(0 -6)">
      <path d="M100 6 L130 74 L70 74 Z" fill="#7e5bd6"/>
      <path d="M100 6 L116 42 L84 42 Z" fill="#9b78ee" opacity=".7"/>
      <ellipse cx="100" cy="74" rx="38" ry="10" fill="#6a49c0"/>
      <text x="96" y="52" font-size="12" fill="#ffd23f">✦</text>
      <circle cx="100" cy="8" r="5" fill="#ffd23f"/></g>`;
  }
  if (kind === 'crown') {
    return `<g><path d="M66 72 L74 46 L88 64 L100 40 L112 64 L126 46 L134 72 Z" fill="#ffd23f" stroke="#e0a900" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="100" cy="44" r="4" fill="#ff6fb5"/><rect x="66" y="70" width="68" height="8" rx="4" fill="#f0b400"/></g>`;
  }
  // cap
  return `<g>
    <path d="M58 64 Q100 22 142 64 Z" fill="#4f7cff"/>
    <ellipse cx="100" cy="64" rx="42" ry="14" fill="#4f7cff"/>
    <path d="M138 64 q28 0 34 14 q-20 6 -38 -2 z" fill="#3a63d6"/>
    <ellipse cx="100" cy="44" rx="6" ry="6" fill="#ffd23f"/></g>`;
}

function setRubyMood(el, mood, opts) { if (el) el.innerHTML = renderRuby(mood, opts); }
