/* Player profile — what a classmate sees when they tap someone's name on the
 * leaderboard or on a level board. Laid out like a social-media profile: a
 * cover banner, the avatar, the name, a row of counts, then tabs for the
 * player's badges and their board posts.
 *
 * Everything shown comes from GET /api/users/:id/profile, which returns only
 * what classmates can already see elsewhere (see src/routes/users.routes.js).
 * /profile.html with no ?id= opens your own.
 */

const me = guard();          // students and the teacher may both look
addClouds();
mountLangSwitch();

const PROFILE_ID = new URLSearchParams(location.search).get('id') || (me && me.id);
let data = null;
let tab = 'badges';

(async () => {
  const content = document.getElementById('content');
  if (me && me.role === 'student') refreshNavCoins();
  try {
    const [{ profile }, lessons] = await Promise.all([
      API.get(`/api/users/${encodeURIComponent(PROFILE_ID)}/profile`),
      // The levels, to draw the badges still to earn. Only a student has a map.
      me && me.role === 'student' ? API.get('/api/lessons').catch(() => null) : Promise.resolve(null),
    ]);
    data = profile;
    if (lessons) {
      data.allLevels = lessons.lessons || [];
      const pts = document.getElementById('navPoints');
      if (pts) pts.textContent = lessons.points || 0;
    }
    document.title = `StoiVenture: ${profile.name}`;
    render();
  } catch (err) {
    content.innerHTML = `
      <div class="card empty-state">
        <div>${renderRuby('shrug', { size: 150 })}</div>
        <h2>${escapeHtml(t('prof.notFound'))}</h2>
        <a class="btn secondary" href="/leaderboard.html">${escapeHtml(t('prof.backBoard'))}</a>
      </div>`;
  }
})();

function fmtDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function render() {
  const p = data;
  const latest = p.badges.slice().sort((a, b) => new Date(b.dateEarned || 0) - new Date(a.dateEarned || 0))[0];

  document.getElementById('content').innerHTML = `
    <article class="prof pop-in">
      <div class="prof-cover">
        ${p.rank ? `<div class="prof-rankbig"><small>${escapeHtml(t('prof.rankWord'))}</small>#${p.rank}</div>` : ''}
      </div>
      <header class="prof-head">
        <div class="prof-idrow">
          <div>
            <div class="prof-avatar">${avatarHtml(p.avatar, 116)}</div>
            <h1 class="prof-name">${escapeHtml(p.name)}</h1>
            <div class="prof-sub">
              <span>${ICON.leaderboard(16)} ${escapeHtml(p.rank ? t('prof.rank', { rank: p.rank }) : t('prof.unranked'))}</span>
              ${p.joinedAt ? `<span>${ICON.calendar(16)} ${escapeHtml(t('prof.joined', { date: fmtDay(p.joinedAt) }))}</span>` : ''}
            </div>
          </div>
          <div class="prof-actions">
            ${p.isMe ? `<a class="btn ghost" href="/settings.html">${ICON.pen(16)} ${escapeHtml(t('prof.edit'))}</a>` : ''}
          </div>
        </div>

        <div class="prof-stats">
          <div class="prof-stat"><b>${p.points}</b><span>${escapeHtml(t('prof.points'))}</span></div>
          <div class="prof-stat"><b>${p.badges.length}</b><span>${escapeHtml(t('prof.badges'))}</span></div>
          <div class="prof-stat"><b>${p.levelsDone}/${p.levelsTotal}</b><span>${escapeHtml(t('prof.levels'))}</span></div>
          <div class="prof-stat"><b>${p.coins}</b><span>${escapeHtml(t('prof.coins'))}</span></div>
        </div>

        ${latest ? `
        <div class="prof-latest">
          ${badgeEmblem(latest, { size: 58, shine: true })}
          <div>
            <div class="pl-label">${escapeHtml(t('prof.latest'))}</div>
            <div class="pl-title">${chem(latest.title)}</div>
            <div class="pl-meta">${escapeHtml(t('badge.tier.' + badgeTier(latest.score)))} · ${latest.score} ${escapeHtml(t('nav.pts'))}${latest.dateEarned ? ' · ' + escapeHtml(fmtDay(latest.dateEarned)) : ''}</div>
          </div>
        </div>` : ''}
      </header>

      <div class="prof-tabs" role="tablist">
        <button role="tab" id="tabBadges" aria-selected="${tab === 'badges'}" onclick="showTab('badges')">
          ${ICON.certificates(17)} ${escapeHtml(t('prof.tabBadges'))} <span class="count">${p.badges.length}</span></button>
        <button role="tab" id="tabPosts" aria-selected="${tab === 'posts'}" onclick="showTab('posts')">
          ${ICON.chat(17)} ${escapeHtml(t('prof.tabPosts'))} <span class="count">${p.posts.length}</span></button>
      </div>
      <section id="tabBody" role="tabpanel">${tab === 'badges' ? badgesHtml() : postsHtml()}</section>
    </article>`;
}

function showTab(which) {
  tab = which;
  document.getElementById('tabBadges').setAttribute('aria-selected', String(which === 'badges'));
  document.getElementById('tabPosts').setAttribute('aria-selected', String(which === 'posts'));
  document.getElementById('tabBody').innerHTML = which === 'badges' ? badgesHtml() : postsHtml();
}

function badgesHtml() {
  const p = data;
  const earned = p.badges.map((b) => `
    <div class="prof-badge">
      ${badgeEmblem(b, { size: 84, shine: true })}
      <div class="pb-title">${chem(b.title)}</div>
      <div class="pb-meta">${escapeHtml(t('badge.tier.' + badgeTier(b.score)))} · ${b.score} ${escapeHtml(t('nav.pts'))}</div>
    </div>`).join('');

  // Your own profile also shows the silhouettes still to earn.
  const have = new Set(p.badges.map((b) => b.lessonId));
  const todo = p.isMe && p.allLevels
    ? p.allLevels.map((l, i) => ({ l, i })).filter(({ l }) => !have.has(l.id)).map(({ l, i }) => `
      <div class="prof-badge locked">
        ${badgeEmblem({ icon: l.icon, level: i + 1, title: l.title }, { size: 84, state: l.locked ? 'locked' : 'open' })}
        <div class="pb-title">${chem(l.title)}</div>
        <div class="pb-meta">${escapeHtml(l.locked ? t('inv.locked') : t('inv.available'))}</div>
      </div>`).join('')
    : '';

  if (!earned && !todo) {
    return `<div class="prof-empty">${escapeHtml(p.isMe ? t('prof.noBadgesMe') : t('prof.noBadges', { name: p.name }))}</div>`;
  }
  return `<p class="tier-hint">${escapeHtml(t('badge.tierHint'))}</p><div class="prof-badges">${earned}${todo}</div>`;
}

function postsHtml() {
  const p = data;
  if (!p.posts.length) return `<div class="prof-empty">${escapeHtml(t('prof.noPosts'))}</div>`;
  return `<div class="prof-posts">${p.posts.map((post) => {
    const imgs = post.attachments.filter((a) => /^image\//.test(a.type || ''));
    const files = post.attachments.length - imgs.length;
    const where = post.lessonTitle
      ? (me && me.role === 'student'
        ? `<a href="/level.html?id=${encodeURIComponent(post.lessonId)}">${chem(post.lessonTitle)}</a>`
        : chem(post.lessonTitle))
      : '';
    return `
      <div class="prof-post">
        <div class="pp-head">
          ${avatarHtml(p.avatar, 34)}
          <div>
            <div class="pp-who">${escapeHtml(p.name)}</div>
            <div class="pp-where">${where}${where ? ' · ' : ''}${escapeHtml(fmtWhen(post.createdAt))}</div>
          </div>
        </div>
        ${post.text ? `<div class="pp-text">${chemLinks(post.text)}</div>` : ''}
        ${imgs.length ? `<div class="pp-imgs">${imgs.map((a) => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.name || '')}" loading="lazy"></a>`).join('')}</div>` : ''}
        <div class="pp-foot">
          <span>${ICON.heart(15)} ${escapeHtml(t('prof.likes', { n: post.likes }))}</span>
          <span>${ICON.chat(15)} ${escapeHtml(t('prof.comments', { n: post.comments }))}</span>
          ${files ? `<span>${ICON.file(15)} ${escapeHtml(t('prof.files', { n: files }))}</span>` : ''}
        </div>
      </div>`;
  }).join('')}</div>`;
}
