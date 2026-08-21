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
