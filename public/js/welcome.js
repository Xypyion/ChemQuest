// Welcome page: tabs, difficulty picker, login & signup.

addClouds();
mountLangSwitch().classList.add('floating');
document.getElementById('rubyStage').innerHTML = renderRuby('wave', { size: 230, float: true });
document.title = t('welcome.title');

// If already logged in, skip straight to the right place.
(function () {
  const u = API.user();
  if (API.token() && u) {
    location.href = u.role === 'teacher' ? '/teacher.html' : '/dashboard.html';
  }
})();

let difficulty = 'easy';

function showTab(which) {
  const login = which === 'login';
  document.getElementById('tabLogin').classList.toggle('active', login);
  document.getElementById('tabSignup').classList.toggle('active', !login);
  document.getElementById('loginForm').classList.toggle('hidden', !login);
  document.getElementById('signupForm').classList.toggle('hidden', login);
}
window.showTab = showTab;

// Difficulty cards
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
    document.getElementById('loginForm').classList.add('shake');
    setTimeout(() => document.getElementById('loginForm').classList.remove('shake'), 500);
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
    document.getElementById('signupForm').classList.add('shake');
    setTimeout(() => document.getElementById('signupForm').classList.remove('shake'), 500);
  } finally {
    btn.disabled = false;
  }
});
