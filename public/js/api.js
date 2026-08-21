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

/* ---------- Shared student navigation ----------
 * One source of truth for the topbar on every hub page. Before this, each
 * page hand-wrote its own list: the links appeared in a different order,
 * took different button colours, and the link to the page you were already
 * on was deleted entirely - so the row visibly reshuffled every time you
 * moved. The set is now identical everywhere and the current page is
 * marked rather than removed, which is also what a screen reader needs.
 *
 * The lesson flow (level / lesson / challenge) deliberately keeps its own
 * minimal bar and is not touched by this.
 */
const NAV_ITEMS = [
  { page: 'map',          href: '/dashboard.html',   key: 'nav.map' },
  { page: 'quests',       href: '/quests.html',      key: 'nav.quests' },
  { page: 'battle',       href: '/battle.html',      key: 'nav.battle' },
  { page: 'certificates', href: '/inventory.html',   key: 'nav.certificates' },
  { page: 'leaderboard',  href: '/leaderboard.html', key: 'nav.leaderboard' },
];

/** Fill #navActions for the page named by <body data-page="...">. */
function mountNav() {
  const host = document.getElementById('navActions');
  if (!host) return;
  const here = document.body.dataset.page || '';

  const links = NAV_ITEMS.map((item) => {
    const current = item.page === here;
    return `<a class="nav-link${current ? ' is-current' : ''}"
               href="${item.href}"${current ? ' aria-current="page"' : ''}
               data-i18n="${item.key}">${escapeHtml(t(item.key))}</a>`;
  }).join('');

  /* Three groups, not one undifferentiated row: what you have, where you can
     go, and who you are. The destinations share a single plaque so they read
     as one control rather than five loose buttons competing with the pills. */
  host.innerHTML = `
    <div class="nav-stats">
      <span class="pill coins"><b id="navCoins">0</b> <span data-i18n="nav.coins">${escapeHtml(t('nav.coins'))}</span></span>
      <span class="pill points"><b id="navPoints">0</b> <span data-i18n="nav.pts">${escapeHtml(t('nav.pts'))}</span></span>
    </div>
    <nav class="nav-links" aria-label="${escapeHtml(t('nav.sections'))}">${links}</nav>
    <div class="nav-account">
      <span class="nav-who" id="navUser"></span>
      <span id="langHost"></span>
      <button class="btn ghost nav-out" onclick="logout()" data-i18n="nav.logout">${escapeHtml(t('nav.logout'))}</button>
    </div>`;

  // every hub page shows who is signed in; pages that know better overwrite it
  const user = API.user();
  const badge = document.getElementById('navUser');
  if (badge && user) badge.textContent = user.name;
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

/* api.js is loaded after the topbar markup on every page, so the nav can be
   filled immediately. Pages without a #navActions host (the lesson flow, the
   teacher console, login) are left alone. */
mountNav();
