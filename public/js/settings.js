/* Settings — the one page a student owns.
 *
 * Four cards: who they are (a read-only summary), how they appear, their
 * password, and this device. Everything editable here is editable because the
 * SERVER lets it be. Difficulty is shown with no control, because it picks the
 * question bank a graded quiz draws from and belongs to the teacher — see the
 * comment above the routes in src/routes/auth.routes.js.
 *
 * Each card saves on its own. One page-wide Save would mean a student who only
 * wanted a new avatar still has to look at the password fields first.
 */

const me = guard('student');
addClouds();
mountLangSwitch();

let profile = null;      // { user, avatars, stats }
let pickedAvatar = null; // chosen but not yet saved

(async () => {
  try {
    profile = await API.get('/api/auth/profile');
    API.updateUser(profile.user);
    pickedAvatar = profile.user.avatar;
    render();
  } catch (e) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state"><p>' + escapeHtml(e.message) + '</p></div>';
  }
})();

function render() {
  const u = profile.user;
  const s = profile.stats;
  const pct = s.levelsTotal ? Math.round((s.levelsDone / s.levelsTotal) * 100) : 0;

  document.getElementById('content').innerHTML = `
    <div class="set-grid">

      <section class="set-card set-hero pop-in">
        <div class="set-hero-face" id="heroFace">${avatarHtml(u.avatar, 76)}</div>
        <div class="set-hero-body">
          <h2 class="set-hero-name" id="heroName">${escapeHtml(u.name)}</h2>
          <p class="set-hero-mail">${escapeHtml(u.email)}</p>
          <div class="set-chips">
            <span class="pill ${escapeHtml(u.difficulty)}">${escapeHtml(tDiff(u.difficulty))}</span>
            <span class="pill points">${ICON.star(14)} ${s.points} ${escapeHtml(t('nav.pts'))}</span>
            <span class="pill">${ICON.coin(14)} ${s.coins} ${escapeHtml(t('nav.coins'))}</span>
            <span class="pill">${ICON.certificates(14)} ${s.certificates}</span>
          </div>
          <div class="set-progress">
            <div class="set-progress-bar"><span style="width:${pct}%"></span></div>
            <span class="set-progress-txt">${escapeHtml(t('set.progress', { done: s.levelsDone, total: s.levelsTotal }))}</span>
          </div>
          ${s.joinedAt ? `<p class="set-joined">${escapeHtml(t('set.joined', { date: fmtDate(s.joinedAt) }))}</p>` : ''}
        </div>
      </section>

      <section class="set-card pop-in">
        <h2 class="set-h">${ICON.people(19)} <span data-i18n="set.lookTitle">How you appear</span></h2>
        <p class="set-note" data-i18n="set.lookNote">This is the name and face your classmates see on the leaderboard, in Coin Battles and on every post.</p>

        <label class="set-label" for="nameInput" data-i18n="set.nameLabel">Display name</label>
        <input id="nameInput" class="set-input" type="text" maxlength="40"
               value="${escapeHtml(u.name)}" autocomplete="nickname" />

        <span class="set-label" id="avatarLabel" data-i18n="set.avatarLabel">Avatar</span>
        <div class="set-avatars" role="radiogroup" aria-labelledby="avatarLabel">
          ${profile.avatars.map((a, i) => `
            <button type="button" class="set-av${a === pickedAvatar ? ' picked' : ''}"
                    role="radio" aria-checked="${a === pickedAvatar}"
                    data-avatar="${escapeHtml(a)}" tabindex="${a === pickedAvatar ? 0 : -1}"
                    onclick="pickAvatar(${i})">${avatarHtml(a, 52)}</button>`).join('')}
        </div>

        <div class="set-actions">
          <button class="btn" id="saveLook" onclick="saveLook()" data-i18n="common.save">💾 Save</button>
        </div>
      </section>

      <section class="set-card pop-in">
        <h2 class="set-h">${ICON.lock(19)} <span data-i18n="set.pwTitle">Password</span></h2>
        <p class="set-note" data-i18n="set.pwNote">Choose something only you know. If you forget it, your teacher can set a new one for you.</p>

        <label class="set-label" for="pwCur" data-i18n="set.pwCurrent">Current password</label>
        <input id="pwCur" class="set-input" type="password" autocomplete="current-password" />

        <label class="set-label" for="pwNew" data-i18n="set.pwNew">New password</label>
        <input id="pwNew" class="set-input" type="password" autocomplete="new-password" />

        <label class="set-label" for="pwConfirm" data-i18n="set.pwConfirm">Repeat new password</label>
        <input id="pwConfirm" class="set-input" type="password" autocomplete="new-password" />
        <p class="set-hint" data-i18n="set.pwHint">At least 6 characters.</p>

        <div class="set-actions">
          <button class="btn" id="savePw" onclick="savePassword()" data-i18n="set.pwSave">Change password</button>
        </div>
      </section>

      <section class="set-card pop-in">
        <h2 class="set-h">${ICON.lock(19)} <span data-i18n="set.diffTitle">Difficulty</span></h2>
        <p class="set-note" data-i18n="set.diffNote">Your teacher sets this. It decides which set of questions your quizzes use — ask them if you would like to move up or down.</p>
        <div class="set-diff-row">
          ${['easy', 'medium', 'hard'].map((d) => `
            <span class="pill ${d} set-diff${d === u.difficulty ? ' on' : ''}">${escapeHtml(tDiff(d))}</span>`).join('')}
        </div>

        <hr class="set-rule" />

        <h2 class="set-h">${ICON.logout(19)} <span data-i18n="set.sessionTitle">This device</span></h2>
        <p class="set-note" data-i18n="set.sessionNote">Logging out clears your account from this computer. Always do this on a shared school machine.</p>
        <div class="set-actions">
          <button class="btn danger" onclick="logout()" data-i18n="nav.logout">Log out</button>
        </div>
      </section>

    </div>`;

  applyI18n();

  /* mountNav() renders the coin and point pills at 0 and leaves each page to
     fill them. This page already holds both numbers from /profile, so it
     writes them straight in rather than making refreshNavCoins() ask again. */
  setNavCoins(s.coins);
  const pts = document.getElementById('navPoints');
  if (pts) pts.textContent = s.points;
}

/* ---- avatar picking ---- */

function pickAvatar(i) {
  const a = profile.avatars[i];
  if (!a) return;
  pickedAvatar = a;
  document.querySelectorAll('.set-av').forEach((b) => {
    const on = b.dataset.avatar === a;
    b.classList.toggle('picked', on);
    b.setAttribute('aria-checked', on);
    b.tabIndex = on ? 0 : -1;
  });
  /* Show it on the hero immediately. Nothing is saved until Save is pressed,
     but watching the face change is the entire point of picking one. */
  document.getElementById('heroFace').innerHTML = avatarHtml(a, 76);
}

/* ---- saving ---- */

async function saveLook() {
  const btn = document.getElementById('saveLook');
  const name = document.getElementById('nameInput').value.trim();
  if (!name) { toast(t('set.nameEmpty'), 'bad'); return; }

  btn.disabled = true;
  try {
    const { user } = await API.patch('/api/auth/me', { name, avatar: pickedAvatar });
    profile.user = user;
    API.updateUser(user);
    document.getElementById('heroName').textContent = user.name;
    /* innerHTML, not textContent: a drawn avatar is an <img>, and assigning the
       value as text put the literal string "s3" on the page. */
    document.getElementById('heroFace').innerHTML = avatarHtml(user.avatar, 76);
    /* The topbar shows the same name and avatar and would otherwise keep the
       old pair until the next navigation. */
    const navAv = document.querySelector('.nav-av');
    const navName = document.getElementById('navUser');
    if (navAv) navAv.innerHTML = avatarHtml(user.avatar, 26);
    if (navName) navName.textContent = user.name;
    toast(t('set.lookSaved'), 'good');
  } catch (e) {
    toast(e.message, 'bad');
    /* Put the controls back to what the server actually holds, so the page
       never sits there displaying a value that was rejected. */
    document.getElementById('nameInput').value = profile.user.name;
    pickedAvatar = profile.user.avatar;
    document.getElementById('heroFace').innerHTML = avatarHtml(profile.user.avatar, 76);
    document.querySelectorAll('.set-av').forEach((b) => {
      const on = b.dataset.avatar === pickedAvatar;
      b.classList.toggle('picked', on);
      b.setAttribute('aria-checked', on);
    });
  } finally {
    btn.disabled = false;
  }
}

async function savePassword() {
  const btn = document.getElementById('savePw');
  const cur = document.getElementById('pwCur');
  const next = document.getElementById('pwNew');
  const again = document.getElementById('pwConfirm');

  if (!cur.value) { toast(t('set.pwNeedCurrent'), 'bad'); return; }
  if (next.value.length < 6) { toast(t('set.pwTooShort'), 'bad'); return; }
  /* Checked here and nowhere else: the repeat field is never sent, it exists
     only to catch a typo before it becomes the password. */
  if (next.value !== again.value) { toast(t('set.pwMismatch'), 'bad'); return; }

  btn.disabled = true;
  try {
    const { token } = await API.post('/api/auth/password', {
      currentPassword: cur.value,
      newPassword: next.value,
    });
    /* Take the fresh token, or this tab carries on with the old one. */
    if (token) API.setSession(token, profile.user);
    cur.value = '';
    next.value = '';
    again.value = '';
    toast(t('set.pwSaved'), 'good');
  } catch (e) {
    toast(e.message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

/* ---- helpers ---- */

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(getLang() === 'th' ? 'th-TH' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric' });
}
