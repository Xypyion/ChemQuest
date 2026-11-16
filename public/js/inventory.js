// Badges — a progress-driven achievement shelf: overall progress bar, the
// latest badge featured, and a grid showing every level's badge as earned
// (gold / silver / bronze by score), available or locked.
//
// A badge is the record the app has always called a certificate
// (GET /api/lessons/me/certificates); only its name and its look changed.
// The emblem is drawn by badgeEmblem() in js/badges.js.

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

    const [{ certificates }, lessonsData] = await Promise.all([
      API.get('/api/lessons/me/certificates'),
      API.get('/api/lessons'),
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
    const latestLevel = latest ? lessons.findIndex((l) => l.id === latest.lessonId) + 1 : 0;
    const featured = latest ? `
      <div class="cert-featured pop-in">
        ${badgeEmblem({ icon: latest.icon, level: latestLevel || null, score: latest.score, title: latest.title }, { size: 64, shine: true })}
        <div class="cf-body">
          <div class="cf-label">${t('inv.latest')}</div>
          <div class="cf-title">${latest.icon ? escapeHtml(latest.icon) + ' ' : ''}${escapeHtml(latest.title)}</div>
          <div class="cf-meta">${t('inv.earnedOn', {
            date: new Date(latest.dateEarned).toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined, { day: 'numeric', month: 'short' }),
            score: latest.score,
          })}</div>
        </div>
      </div>` : '';

    // Badge grid — one tile per level.
    const badges = lessons.map((l, i) => {
      const cert = certByLesson[l.id];
      const label = chem(l.title);
      const emblem = (state) => badgeEmblem({ icon: l.icon, level: i + 1, score: cert && cert.score, title: l.title },
        { size: 76, state, shine: state === 'earned' });
      if (cert) {
        const tier = badgeTier(cert.score);
        return `<div class="badge earned">
          ${emblem('earned')}
          <div class="badge-name">${label}</div>
          <div class="badge-tier ${tier}">${escapeHtml(t('badge.tier.' + tier))}</div>
          <div class="badge-meta earned-meta">${cert.score} ${t('lesson.pts')}</div>
        </div>`;
      }
      if (l.locked) {
        const reason = l.lockReason === 'scheduled' && l.opensAt
          ? t('inv.opensAt', { time: fmtWhen(l.opensAt) })
          : t('inv.locked');
        return `<div class="badge locked">
          ${emblem('locked')}
          <div class="badge-name">${label}</div>
          <div class="badge-meta">${reason}</div>
        </div>`;
      }
      // Unlocked but not yet earned — available / in progress.
      const started = l.preDone || (l.bestScore || 0) > 0;
      return `<a class="badge avail" href="/level.html?id=${encodeURIComponent(l.id)}">
        ${emblem('open')}
        <div class="badge-name">${label}</div>
        <div class="badge-meta">${started ? t('inv.inProgress') : t('inv.available')}</div>
      </a>`;
    }).join('');

    content.innerHTML = `
      <div class="shelf-progress">
        <div class="sp-row"><span class="sp-label">${t('inv.progressLabel')}</span><span class="sp-count">${t('inv.progress', { earned, total })}</span></div>
        <div class="sp-bar"><span style="width:${pct}%"></span></div>
      </div>
      ${featured}
      ${badges ? `<p class="tier-hint">${escapeHtml(t('badge.tierHint'))}</p>
      <div class="badge-grid">${badges}</div>
      <p class="center" style="margin-top:22px"><a class="btn ghost" href="/profile.html">${ICON.people(16)} ${escapeHtml(t('prof.viewMine'))}</a></p>` : `
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
