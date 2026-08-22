/* Shared front-end helpers: session, fetch wrapper, guards, toasts, confetti. */

const API = {
  token() { return localStorage.getItem('cq_token'); },
  user() {
    try { return JSON.parse(localStorage.getItem('cq_user')); } catch { return null; }
  },
  setSession(token, user) {
    localStorage.setItem('cq_token', token);
    localStorage.setItem('cq_user', JSON.stringify(user));
  },
  updateUser(user) { localStorage.setItem('cq_user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('cq_token'); localStorage.removeItem('cq_user'); },

  async call(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(API.token() ? { Authorization: 'Bearer ' + API.token() } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error('Cannot reach the server. Is it running?');
    }
    // Not every failure comes back as JSON — a host can reject an oversized
    // upload or time the function out before the app is reached, and those
    // reply in plain text or HTML. Fall back to a message that says what
    // actually happened instead of a blank "something went wrong".
    const json = await res.json().catch(() => null);
    if (res.status === 401 && !path.endsWith('/login') && !path.endsWith('/signup')) {
      API.clear();
      location.href = '/';
      throw new Error((json && json.error) || 'Session expired');
    }
    if (!res.ok) {
      if (json && json.error) throw new Error(json.error);
      if (res.status === 413) throw new Error('That upload is too large. Try smaller images, or fewer of them in one save.');
      if (res.status === 504 || res.status === 408) throw new Error('The server took too long to respond. Your change may not have been saved.');
      if (res.status >= 500) throw new Error(`The server could not complete that (error ${res.status}). Your change was not saved.`);
      throw new Error(`Request failed (${res.status}).`);
    }
    return json || {};
  },
  get(p) { return API.call('GET', p); },
  post(p, b) { return API.call('POST', p, b); },
  put(p, b) { return API.call('PUT', p, b); },
  patch(p, b) { return API.call('PATCH', p, b); },
  del(p) { return API.call('DELETE', p); },
};

/** Redirect to the right place if not logged in / wrong role. Returns the user. */
function guard(role) {
  const user = API.user();
  if (!API.token() || !user) { location.href = '/'; return null; }
  if (role && user.role !== role) {
    location.href = user.role === 'teacher' ? '/teacher.html' : '/dashboard.html';
    return null;
  }
  return user;
}

function logout() {
  API.clear();
  location.href = '/';
}

/* ---------- Toast notifications ---------- */
function toast(message, kind = '') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

/* ---------- Confetti burst ---------- */
function confetti(count = 130) {
  const colors = ['#ff8a3d', '#36b9ff', '#a86bff', '#ffd23f', '#ef3e36', '#7ed957', '#ff6fb5'];
  const host = document.createElement('div');
  host.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.style.left = Math.random() * 100 + 'vw';
    bit.style.background = colors[(Math.random() * colors.length) | 0];
    bit.style.animationDuration = 2 + Math.random() * 2 + 's';
    bit.style.animationDelay = Math.random() * 0.6 + 's';
    bit.style.width = bit.style.height = 8 + Math.random() * 8 + 'px';
    if (Math.random() > 0.5) bit.style.borderRadius = '50%';
    host.appendChild(bit);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 4500);
}

/* ---------- Small utilities ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Turn any YouTube URL/ID into an embeddable URL, or null if unrecognisable. */
function youtubeEmbed(url) {
  if (!url) return null;
  url = url.trim();
  let id = null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const re of patterns) { const m = url.match(re); if (m) { id = m[1]; break; } }
  if (!id && /^[\w-]{11}$/.test(url)) id = url;
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/* ---------- Decorative clouds (call once per page) ---------- */
function addClouds() {
  const host = document.createElement('div');
  host.className = 'clouds';
  host.innerHTML = '<div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>';
  document.body.prepend(host);
}

/* ---------- Daily-quest coin balance in the topbar ---------- */

/** Write a balance into the #navCoins pill, if the page has one. */
function setNavCoins(n) {
  const el = document.getElementById('navCoins');
  if (el) el.textContent = n || 0;
}

/**
 * Fetch the balance and show it. Pages that render from the cached
 * localStorage user must not trust it for a number that changes as the
 * student plays, so this asks the server.
 */
async function refreshNavCoins() {
  if (!document.getElementById('navCoins')) return;
  try {
    const me = await API.get('/api/auth/me');
    API.updateUser(me.user);
    setNavCoins(me.user.coins);
  } catch { /* the pill just stays at 0 — never block a page over it */ }
}

/* ---------- The top bar ---------- *

   Every student page used to hand-write its own topbar, and every one wrote a
   DIFFERENT one: a different set of destinations, in a different order, with a
   different button coloured. The map showed four (no Map), Battle showed three
   (no Certificates), Leaderboard highlighted Certificates in purple for no
   reason. So the buttons genuinely moved, changed colour and changed count on
   every single navigation.

   One renderer, one order, on every page. The page you are on is MARKED, never
   removed — taking it out is what made the row change length. Which page you
   are on comes from <body data-page="…">.

   The destinations are pushed to the right edge (see .nav-links in theme.css).
   That matters: the coins and points pills are different widths on different
   pages, and anchoring the row to the right means that difference can never
   push the destinations sideways.
*/

const NAV_ITEMS = [
  { page: 'map',          href: '/dashboard.html',   key: 'nav.map',          icon: 'map' },
  { page: 'quests',       href: '/quests.html',      key: 'nav.quests',       icon: 'quests' },
  { page: 'battle',       href: '/battle.html',      key: 'nav.battle',       icon: 'battle' },
  { page: 'certificates', href: '/inventory.html',   key: 'nav.certificates', icon: 'certificates' },
  { page: 'leaderboard',  href: '/leaderboard.html', key: 'nav.leaderboard',  icon: 'leaderboard' },
];

function mountNav() {
  const host = document.querySelector('.topbar');
  if (!host || host.dataset.mounted) return;
  host.dataset.mounted = '1';

  const here = document.body.dataset.page || '';
  const user = API.user();

  const links = NAV_ITEMS.map((item) => {
    const on = item.page === here;
    return `<a class="nav-link${on ? ' is-current' : ''}" href="${item.href}"
               ${on ? 'aria-current="page"' : ''}>${ICON[item.icon](19)}<span
               data-i18n="${item.key}">${escapeHtml(t(item.key))}</span></a>`;
  }).join('');

  host.innerHTML = `
    <a class="brand" href="/dashboard.html">${ICON.brand(26)}<span
      class="wordmark">Stoi<b>Venture</b></span></a>

    <div class="nav-stats">
      <span class="pill coins">${ICON.coin(16)} <b id="navCoins">0</b>
        <span data-i18n="nav.coins">${escapeHtml(t('nav.coins'))}</span></span>
      <span class="pill points">${ICON.star(16)} <b id="navPoints">0</b>
        <span data-i18n="nav.pts">${escapeHtml(t('nav.pts'))}</span></span>
    </div>

    <nav class="nav-links" aria-label="${escapeHtml(t('nav.sections'))}">${links}</nav>

    <div class="nav-account">
      <a class="nav-who${here === 'settings' ? ' is-current' : ''}" href="/settings.html"
         ${here === 'settings' ? 'aria-current="page"' : ''}
         title="${escapeHtml(t('nav.settings'))}">
        <span class="nav-av">${user ? escapeHtml(user.avatar || '🧑‍🎓') : ''}</span>
        <span class="nav-name" id="navUser">${user ? escapeHtml(user.name) : ''}</span>
      </a>
      <span id="langHost"></span>
      <button class="nav-out" onclick="logout()">${ICON.logout(18)}<span
        data-i18n="nav.logout">${escapeHtml(t('nav.logout'))}</span></button>
    </div>`;

  /* Below the breakpoint the five destinations scroll sideways. Fade the
     trailing edge so it is visible that the row continues, and drop the fade
     once there is nothing left to scroll to — a permanent fade reads as a bug. */
  const strip = host.querySelector('.nav-links');
  const atEnd = () => strip.classList.toggle(
    'is-end', strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2);
  strip.addEventListener('scroll', atEnd, { passive: true });
  window.addEventListener('resize', atEnd);
  /* Scroll the strip only, and only when it actually overflows: calling
     scrollIntoView() unconditionally scrolls the PAGE and throws the header
     off the first viewport on arrival. */
  const mark = strip.querySelector('.is-current');
  if (mark && strip.scrollWidth > strip.clientWidth + 2) {
    strip.scrollLeft = mark.offsetLeft - (strip.clientWidth - mark.offsetWidth) / 2;
  }
  atEnd();
}

/* The three in-level pages (level, lesson, challenge) deliberately do NOT use
   the shared bar: theirs carries the level title, the difficulty and the quiz
   timer, which page scripts fill by id. Mounting the global nav over them
   would delete those elements.

   They are told apart by <body data-page>, which only the global-nav pages
   set. Without this guard mountNav ran on them too and threw "ICON is not
   defined" — a red error in the console on three of the app's busiest pages,
   on every visit. It was invisible because mountNav() is the last statement
   in this file, so the throw took nothing else down with it.

   Note the guard is still required now that those pages DO load icons.js for
   the brand mark: with ICON defined, mountNav would stop throwing and start
   succeeding, and succeeding is the worse outcome — it would overwrite their
   topbar and delete the very pills this comment is about. */
function mountBrandMarks() {
  document.querySelectorAll('[data-brand-mark]').forEach((el) => {
    if (typeof ICON !== 'undefined') el.innerHTML = ICON.brand(Number(el.dataset.brandMark) || 26);
  });
}

if (document.body.dataset.page) mountNav();
mountBrandMarks();
