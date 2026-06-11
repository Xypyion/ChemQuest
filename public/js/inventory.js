// Inventory: show the student's earned certificates.

const me = guard('student');
addClouds();
mountLangSwitch();

(async () => {
  try {
    const meData = await API.get('/api/auth/me');
    API.updateUser(meData.user);
    document.getElementById('navPoints').textContent = meData.user.points || 0;

    const { certificates } = await API.get('/api/lessons/me/certificates');
    const content = document.getElementById('content');

    if (!certificates.length) {
      content.innerHTML = `
        <div class="empty-state card">
          <div>${renderRuby('happy', { size: 160, float: true })}</div>
          <h2>${t('inv.none')}</h2>
          <p class="muted">${t('inv.noneSub')}</p>
          <a class="btn big green" href="/dashboard.html">${t('inv.goMap')}</a>
        </div>`;
      return;
    }

    document.getElementById('sub').textContent =
      t('inv.earned', { n: certificates.length, s: certificates.length > 1 ? 's' : '' });

    const sorted = certificates.slice().sort((a, b) => new Date(a.dateEarned) - new Date(b.dateEarned));
    content.innerHTML = `<div class="cert-grid">` + sorted.map((c) => `
      <div class="certificate pop-in">
        <div class="score-badge">${c.score} pts</div>
        <div class="seal">🎖️</div>
        <div class="ic">${c.icon || '🧪'}</div>
        <h3>${escapeHtml(c.title)}</h3>
        <div class="muted" style="font-size:.85rem">${t('inv.awardedTo')}</div>
        <div class="who">${escapeHtml(me.name)}</div>
        <div class="meta">
          <span class="pill ${c.difficulty}">${tDiff(c.difficulty)}</span><br>
          ${new Date(c.dateEarned).toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
      </div>`).join('') + `</div>`;
  } catch (err) {
    document.getElementById('content').innerHTML = `<p class="center" style="color:var(--bad)">${escapeHtml(err.message)}</p>`;
  }
})();
