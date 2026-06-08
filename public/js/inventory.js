// Inventory: show the student's earned certificates.

const me = guard('student');
addClouds();

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
          <h2>No certificates yet!</h2>
          <p class="muted">Head to the map and complete your first level to earn a certificate.</p>
          <a class="btn big green" href="/dashboard.html">🗺️ Go to the Map</a>
        </div>`;
      return;
    }

    document.getElementById('sub').textContent =
      `You've earned ${certificates.length} certificate${certificates.length > 1 ? 's' : ''}! Keep climbing! 🎉`;

    const sorted = certificates.slice().sort((a, b) => new Date(a.dateEarned) - new Date(b.dateEarned));
    content.innerHTML = `<div class="cert-grid">` + sorted.map((c) => `
      <div class="certificate pop-in">
        <div class="score-badge">${c.score} pts</div>
        <div class="seal">🎖️</div>
        <div class="ic">${c.icon || '🧪'}</div>
        <h3>${escapeHtml(c.title)}</h3>
        <div class="muted" style="font-size:.85rem">awarded to</div>
        <div class="who">${escapeHtml(me.name)}</div>
        <div class="meta">
          <span class="pill ${c.difficulty}">${(c.difficulty || '').toUpperCase()}</span><br>
          ${new Date(c.dateEarned).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
      </div>`).join('') + `</div>`;
  } catch (err) {
    document.getElementById('content').innerHTML = `<p class="center" style="color:var(--bad)">${escapeHtml(err.message)}</p>`;
  }
})();
