// Certificates — a progress-driven achievement shelf: overall progress bar,
// a featured latest certificate, and a grid showing every level as
// earned / in-progress / locked.
//
// Below that sits the BADGE shelf, which is a different thing wearing a similar
// word. A certificate is automatic — one per level, earned by passing its
// pre-test. A badge is a picture the teacher drew and hung on a specific
// challenge (see src/badges.js). The level grid keeps the `.badge` classes it
// has always had; the teacher's badges use `.bdg-*`, so the two never collide.

const me = guard('student');
addClouds();
mountLangSwitch();

(async () => {
  const content = document.getElementById('content');
  try {
    const meData = await API.get('/api/auth/me');
    API.updateUser(meData.user);
    document.getElementById('navPoints').textContent = meData.user.points || 0;
    setNavCoins(meData.user.coins);

    const [{ certificates }, lessonsData, badgeData] = await Promise.all([
      API.get('/api/lessons/me/certificates'),
      API.get('/api/lessons'),
      // A shelf that fails to load must not blank the certificates above it.
      API.get('/api/badges/me').catch(() => ({ earned: [], locked: [] })),
    ]);
    const lessons = lessonsData.lessons || [];
    const certByLesson = {};
    certificates.forEach((c) => { certByLesson[c.lessonId] = c; });

    const earned = certificates.length;
    const total = lessons.length || earned;
    const pct = total ? Math.round((earned / total) * 100) : 0;

    document.getElementById('sub').textContent = earned
      ? t('inv.earned', { n: earned, s: earned > 1 ? 's' : '' })
      : t('inv.noneSub');

    // Featured latest certificate (most recent by dateEarned).
    const latest = certificates.slice().sort((a, b) => new Date(b.dateEarned) - new Date(a.dateEarned))[0];
    const featured = latest ? `
      <div class="cert-featured pop-in">
        <div class="cf-medal">⭐</div>
        <div class="cf-body">
          <div class="cf-label">${t('inv.latest')}</div>
          <div class="cf-title">${escapeHtml(latest.icon || '🧪')} ${escapeHtml(latest.title)}</div>
          <div class="cf-meta">${t('inv.earnedOn', {
            date: new Date(latest.dateEarned).toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined, { day: 'numeric', month: 'short' }),
            score: latest.score,
          })}</div>
        </div>
        <span class="pill ${latest.difficulty}">${tDiff(latest.difficulty)}</span>
      </div>` : '';

    // Badge grid — one tile per level.
    const badges = lessons.map((l, i) => {
      const cert = certByLesson[l.id];
      const label = `${l.icon || '🧪'} ${chem(l.title)}`;
      if (cert) {
        return `<div class="badge earned">
          <div class="badge-medal gold">⭐</div>
          <div class="badge-name">${label}</div>
          <div class="badge-meta earned-meta">${cert.score} ${t('lesson.pts')}</div>
        </div>`;
      }
      if (l.locked) {
        const reason = l.lockReason === 'scheduled' && l.opensAt
          ? t('inv.opensAt', { time: fmtWhen(l.opensAt) })
          : t('inv.locked');
        return `<div class="badge locked">
          <div class="badge-medal lock">🔒</div>
          <div class="badge-name">${label}</div>
          <div class="badge-meta">${reason}</div>
        </div>`;
      }
      // Unlocked but not yet earned — available / in progress.
      const started = l.preDone || (l.bestScore || 0) > 0;
      const ringPct = Math.max(0, Math.min(100, Math.round(l.bestScore || 0)));
      const ringStyle = started ? ` style="background:conic-gradient(var(--grass) ${ringPct}%, #eae4f7 0)"` : '';
      return `<a class="badge avail" href="/level.html?id=${encodeURIComponent(l.id)}">
        <div class="badge-medal ring${started ? ' on' : ''}"${ringStyle}><span class="ring-ic">${l.icon || '🧪'}</span></div>
        <div class="badge-name">${label}</div>
        <div class="badge-meta">${started ? t('inv.inProgress') : t('inv.available')}</div>
      </a>`;
    }).join('');

    /* ---- the teacher's badges ---- */
    const earnedBadges = (badgeData && badgeData.earned) || [];
    const lockedBadges = (badgeData && badgeData.locked) || [];

    const badgeTiles = earnedBadges.map((b) => `
      <div class="bdg-tile earned" title="${escapeHtml(b.name)}">
        <img class="bdg-tile-img" src="${escapeHtml(b.image)}" alt="${escapeHtml(b.name)}">
        <div class="bdg-tile-name">${escapeHtml(b.name)}</div>
        <div class="bdg-tile-meta">${escapeHtml(b.challengeTitle || '')}</div>
      </div>`).join('')
      /* Locked ones show as a silhouette with their NAME but not their picture:
         the name is the goal, the artwork is the reward. The server does not
         send the image for these, so there is nothing here to spoil. */
      + lockedBadges.map((b) => `
      <div class="bdg-tile locked" title="${escapeHtml(b.name)}">
        <div class="bdg-tile-img empty">🎖️</div>
        <div class="bdg-tile-name">${escapeHtml(b.name)}</div>
        <div class="bdg-tile-meta">${t('inv.badgeLocked')}</div>
      </div>`).join('');

    const badgeShelf = (earnedBadges.length || lockedBadges.length) ? `
      <div class="bdg-shelf">
        <div class="sp-row">
          <span class="sp-label">${t('inv.badgesTitle')}</span>
          <span class="sp-count">${t('inv.badgesCount', { n: earnedBadges.length })}</span>
        </div>
        <div class="bdg-tiles">${badgeTiles}</div>
      </div>` : '';

    content.innerHTML = `
      <div class="shelf-progress">
        <div class="sp-row"><span class="sp-label">${t('inv.progressLabel')}</span><span class="sp-count">${t('inv.progress', { earned, total })}</span></div>
        <div class="sp-bar"><span style="width:${pct}%"></span></div>
      </div>
      ${featured}
      ${badgeShelf}
      ${badges ? `<div class="badge-grid">${badges}</div>` : `
        <div class="empty-state card">
          <div>${renderRuby('happy', { size: 150, float: true })}</div>
          <h2>${t('inv.none')}</h2>
          <p class="muted">${t('inv.noneSub')}</p>
          <a class="btn big green" href="/dashboard.html">${t('inv.goMap')}</a>
        </div>`}`;
  } catch (err) {
    content.innerHTML = `<p class="center" style="color:var(--bad)">${escapeHtml(err.message)}</p>`;
  }
})();
