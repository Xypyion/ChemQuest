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
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.endsWith('/login') && !path.endsWith('/signup')) {
      API.clear();
      location.href = '/';
      throw new Error(json.error || 'Session expired');
    }
    if (!res.ok) throw new Error(json.error || 'Something went wrong.');
    return json;
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

/* ---------- Decorative clouds (call once per page) ---------- */
function addClouds() {
  const host = document.createElement('div');
  host.className = 'clouds';
  host.innerHTML = '<div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>';
  document.body.prepend(host);
}
