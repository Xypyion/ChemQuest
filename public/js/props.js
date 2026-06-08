/* Biome decoration props — original inline-SVG illustrations with gradient
   shading and cast shadows so they read as little 3D models on the map. */

let _propId = 0;
const _pid = () => 'pp' + (++_propId);

const PROPS = {
  tree() {
    const g = _pid();
    return `<svg viewBox="0 0 120 140" class="prop">
      <ellipse cx="60" cy="132" rx="34" ry="8" fill="rgba(0,0,0,.16)"/>
      <rect x="52" y="82" width="16" height="44" rx="7" fill="#9c6b3f"/><rect x="52" y="82" width="7" height="44" rx="3" fill="#7d5430"/>
      <defs><radialGradient id="${g}" cx="36%" cy="28%" r="78%"><stop offset="0" stop-color="#9be86f"/><stop offset="1" stop-color="#3f9e36"/></radialGradient></defs>
      <circle cx="38" cy="68" r="26" fill="url(#${g})"/><circle cx="84" cy="68" r="26" fill="url(#${g})"/><circle cx="60" cy="50" r="40" fill="url(#${g})"/>
      <ellipse cx="46" cy="36" rx="15" ry="9" fill="#bff58e" opacity=".55"/></svg>`;
  },
  bush() {
    const g = _pid();
    return `<svg viewBox="0 0 120 80" class="prop">
      <ellipse cx="60" cy="72" rx="40" ry="7" fill="rgba(0,0,0,.14)"/>
      <defs><radialGradient id="${g}" cx="36%" cy="28%" r="80%"><stop offset="0" stop-color="#8fe06a"/><stop offset="1" stop-color="#48a93b"/></radialGradient></defs>
      <circle cx="34" cy="48" r="22" fill="url(#${g})"/><circle cx="86" cy="48" r="22" fill="url(#${g})"/><circle cx="60" cy="40" r="28" fill="url(#${g})"/>
      <circle cx="50" cy="34" r="3" fill="#ff6fb5"/><circle cx="74" cy="40" r="3" fill="#ffd23f"/></svg>`;
  },
  flower(c) {
    c = c || '#ff6fb5';
    return `<svg viewBox="0 0 70 95" class="prop">
      <rect x="32" y="42" width="5" height="46" rx="2" fill="#3f9e36"/>
      <ellipse cx="22" cy="66" rx="9" ry="5" fill="#54b33b" transform="rotate(-30 22 66)"/>
      ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="35" cy="22" rx="9" ry="15" fill="${c}" transform="rotate(${a} 35 34)"/>`).join('')}
      <circle cx="35" cy="34" r="9" fill="#ffd23f"/></svg>`;
  },
  mushroom() {
    const g = _pid();
    return `<svg viewBox="0 0 90 100" class="prop">
      <ellipse cx="45" cy="92" rx="22" ry="6" fill="rgba(0,0,0,.15)"/>
      <rect x="36" y="50" width="18" height="40" rx="9" fill="#f4ead2"/>
      <defs><radialGradient id="${g}" cx="40%" cy="28%" r="72%"><stop offset="0" stop-color="#ff8a8a"/><stop offset="1" stop-color="#e23b3b"/></radialGradient></defs>
      <path d="M12 54 Q45 4 78 54 Z" fill="url(#${g})"/>
      <circle cx="33" cy="40" r="6" fill="#fff" opacity=".9"/><circle cx="56" cy="33" r="5" fill="#fff" opacity=".9"/><circle cx="50" cy="48" r="4" fill="#fff" opacity=".85"/></svg>`;
  },
  rock() {
    const g = _pid();
    return `<svg viewBox="0 0 100 80" class="prop">
      <ellipse cx="50" cy="70" rx="34" ry="7" fill="rgba(0,0,0,.16)"/>
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdc3b1"/><stop offset="1" stop-color="#8d7c64"/></linearGradient></defs>
      <path d="M16 66 Q8 34 36 28 Q54 14 76 30 Q98 38 86 66 Z" fill="url(#${g})"/>
      <path d="M30 38 Q44 30 60 36" stroke="#fff" stroke-width="3" fill="none" opacity=".3"/></svg>`;
  },
  log() {
    const g = _pid();
    return `<svg viewBox="0 0 130 80" class="prop">
      <ellipse cx="65" cy="68" rx="50" ry="8" fill="rgba(0,0,0,.15)"/>
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b88150"/><stop offset="1" stop-color="#7d5430"/></linearGradient></defs>
      <rect x="22" y="30" width="86" height="34" rx="17" fill="url(#${g})"/>
      <ellipse cx="22" cy="47" rx="11" ry="17" fill="#c98f56"/><ellipse cx="22" cy="47" rx="6" ry="10" fill="#a06a38"/>
      <circle cx="72" cy="26" r="5" fill="#ffd23f"/><circle cx="88" cy="28" r="4" fill="#ff8fc7"/></svg>`;
  },
  crystal(c) {
    const cols = { amber: ['#ffd86b', '#ff9d2e', '#cf6f00'], pink: ['#ffc8ea', '#ff7ec4', '#cf4e98'], blue: ['#cdeeff', '#74c0ff', '#3a72d6'] }[c || 'amber'];
    const g = _pid();
    return `<svg viewBox="0 0 120 120" class="prop glow">
      <ellipse cx="60" cy="108" rx="32" ry="7" fill="rgba(0,0,0,.15)"/>
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cols[0]}"/><stop offset="1" stop-color="${cols[2]}"/></linearGradient></defs>
      <polygon points="34,52 46,106 22,106" fill="url(#${g})"/><polygon points="86,46 100,106 72,106" fill="url(#${g})"/>
      <polygon points="60,16 80,72 40,72" fill="url(#${g})"/><polygon points="60,16 70,68 60,72" fill="${cols[1]}" opacity=".75"/>
      <polygon points="60,28 67,40 53,40" fill="#fff" opacity=".7"/></svg>`;
  },
  campfire() {
    const g = _pid();
    return `<svg viewBox="0 0 100 100" class="prop">
      <ellipse cx="50" cy="86" rx="34" ry="8" fill="rgba(0,0,0,.18)"/>
      <rect x="22" y="74" width="56" height="11" rx="5" fill="#8d6239" transform="rotate(12 50 80)"/>
      <rect x="22" y="74" width="56" height="11" rx="5" fill="#a06a38" transform="rotate(-12 50 80)"/>
      <defs><radialGradient id="${g}" cx="50%" cy="72%" r="68%"><stop offset="0" stop-color="#ffe23a"/><stop offset="55%" stop-color="#ff7a1a"/><stop offset="100%" stop-color="#ef3e36"/></radialGradient></defs>
      <path d="M50 22 Q72 50 58 70 Q76 64 66 42 Q82 60 70 80 Q62 90 50 90 Q28 90 30 66 Q31 50 46 56 Q36 38 50 22 Z" fill="url(#${g})" class="flame"/>
      <path d="M50 48 Q60 64 52 78 Q44 70 48 60 Q44 54 50 48Z" fill="#ffe98a"/></svg>`;
  },
  cloud() {
    return `<svg viewBox="0 0 150 74" class="prop">
      <g fill="#ffffff"><circle cx="42" cy="44" r="26"/><circle cx="78" cy="34" r="32"/><circle cx="112" cy="46" r="22"/><rect x="32" y="44" width="86" height="24" rx="12"/></g>
      <ellipse cx="68" cy="30" rx="40" ry="10" fill="#fff" opacity=".7"/></svg>`;
  },
  arch(c) {
    const cols = (c === 'ice') ? ['#e4f3ff', '#a8cef0'] : ['#ebe2cd', '#bda988'];
    const g = _pid();
    return `<svg viewBox="0 0 90 160" class="prop">
      <ellipse cx="45" cy="150" rx="28" ry="7" fill="rgba(0,0,0,.15)"/>
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${cols[0]}"/><stop offset="1" stop-color="${cols[1]}"/></linearGradient></defs>
      <rect x="20" y="22" width="50" height="126" rx="10" fill="url(#${g})"/>
      <rect x="12" y="10" width="66" height="18" rx="7" fill="${cols[1]}"/>
      <rect x="32" y="42" width="26" height="100" rx="12" fill="#ffffff" opacity=".28"/></svg>`;
  },
  portal() {
    const g = _pid();
    return `<svg viewBox="0 0 110 124" class="prop glow">
      <ellipse cx="55" cy="112" rx="34" ry="8" fill="rgba(0,0,0,.15)"/>
      <path d="M28 106 L24 72 Q55 58 86 72 L82 106 Z" fill="#7e6bb0"/>
      <ellipse cx="55" cy="72" rx="31" ry="13" fill="#4a3a78"/>
      <defs><radialGradient id="${g}" cx="50%" cy="50%" r="62%"><stop offset="0" stop-color="#ffffff"/><stop offset="50%" stop-color="#7ad9ff"/><stop offset="100%" stop-color="#5a8bff"/></radialGradient></defs>
      <ellipse cx="55" cy="70" rx="26" ry="10" fill="url(#${g})"/><ellipse cx="55" cy="66" rx="14" ry="5" fill="#fff" opacity=".85"/></svg>`;
  },
  signpost() {
    const g = _pid();
    return `<svg viewBox="0 0 90 110" class="prop">
      <ellipse cx="45" cy="102" rx="20" ry="6" fill="rgba(0,0,0,.15)"/>
      <rect x="40" y="34" width="10" height="66" rx="4" fill="#7d5430"/>
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#caa06a"/><stop offset="1" stop-color="#a87b45"/></linearGradient></defs>
      <path d="M16 30 H66 L78 44 L66 58 H16 Z" fill="url(#${g})"/><circle cx="30" cy="44" r="4" fill="#fff" opacity=".7"/></svg>`;
  },
};
