// Login ("Laboratory Entry") page: mascot + entry card, with the sign-up flow
// (name / email / password / difficulty) reachable via "Create new account".

mountLangSwitch(document.getElementById('langHost'));
document.title = t('welcome.title');

// If already logged in, skip straight to the right place.
(function () {
  const u = API.user();
  if (API.token() && u) {
    location.href = u.role === 'teacher' ? '/teacher.html' : '/dashboard.html';
  }
})();

let difficulty = 'easy';

/* ---------- switch between the login and sign-up cards ---------- */
function showSignup() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('signupForm').classList.remove('hidden');
  const el = document.getElementById('suName');
  if (el) el.focus();
}
function showLogin() {
  document.getElementById('signupForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  const el = document.getElementById('loginEmail');
  if (el) el.focus();
}
document.getElementById('toSignup').addEventListener('click', showSignup);
document.getElementById('toLogin').addEventListener('click', showLogin);

// There is no email-based reset flow; teachers reset student passwords in the
// console (🔑). Point the student there honestly rather than faking a reset.
document.getElementById('forgotLink').addEventListener('click', () => {
  toast(t('welcome.forgotHint'), 'good');
});

// Difficulty cards (sign-up)
document.getElementById('diffGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.diff');
  if (!card) return;
  document.querySelectorAll('.diff').forEach((d) => d.classList.remove('sel'));
  card.classList.add('sel');
  difficulty = card.dataset.diff;
});

// Redirect helper
function goHome(user) {
  location.href = user.role === 'teacher' ? '/teacher.html' : '/dashboard.html';
}

function shakeForm(id) {
  const form = document.getElementById(id);
  form.classList.add('shake');
  setTimeout(() => form.classList.remove('shake'), 500);
}

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const { token, user } = await API.post('/api/auth/login', {
      email: document.getElementById('loginEmail').value,
      password: document.getElementById('loginPassword').value,
    });
    API.setSession(token, user);
    toast(t('welcome.welcomeBack', { name: user.name }), 'good');
    setTimeout(() => goHome(user), 400);
  } catch (err) {
    errEl.textContent = err.message;
    shakeForm('loginForm');
  } finally {
    btn.disabled = false;
  }
});

// Signup
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('signupErr');
  errEl.textContent = '';
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const { token, user } = await API.post('/api/auth/signup', {
      name: document.getElementById('suName').value,
      email: document.getElementById('suEmail').value,
      password: document.getElementById('suPassword').value,
      difficulty,
    });
    API.setSession(token, user);
    confetti();
    toast(t('welcome.adventureStarts', { name: user.name }), 'good');
    setTimeout(() => goHome(user), 700);
  } catch (err) {
    errEl.textContent = err.message;
    shakeForm('signupForm');
  } finally {
    btn.disabled = false;
  }
});
