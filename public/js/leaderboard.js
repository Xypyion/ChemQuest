// Leaderboard: podium for the top 3 + full ranking (highest to lowest).

const me = guard('student');
addClouds();
mountLangSwitch();
if (me) document.getElementById('navPoints').textContent = me.points || 0;

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

(async () => {
  try {
    const { leaderboard, meId } = await API.get('/api/leaderboard');
    const podium = document.getElementById('podium');
    const list = document.getElementById('list');

    if (!leaderboard.length) {
      podium.innerHTML = '';
      list.innerHTML = `<p class="center muted">${t('lb.none')}</p>`;
      return;
    }

    // Podium (top 3)
    const top3 = leaderboard.slice(0, 3);
    podium.innerHTML = top3.map((s) => `
      <div class="col c${s.rank}">
        <div class="av">${s.avatar}</div>
        <div class="pname">${escapeHtml(s.name)}${s.id === meId ? t('lb.youSuffix') : ''}</div>
        <div class="ppts">${s.points} ${t('nav.pts')}</div>
        <div class="stand">${MEDALS[s.rank] || s.rank}</div>
      </div>`).join('');

    // Full list
    const lowestPts = leaderboard[leaderboard.length - 1].points;
    list.innerHTML = leaderboard.map((s) => {
      const isMe = s.id === meId;
      const isLowest = leaderboard.length > 3 && s.points === lowestPts && s.rank === leaderboard.length;
      return `
      <div class="lb-row ${isMe ? 'me' : ''} ${s.rank === 1 ? 'top1' : ''} ${isLowest ? 'lowest' : ''}">
        <div class="medal">${MEDALS[s.rank] || ''}</div>
        <div class="rank">#${s.rank}</div>
        <div class="av">${s.avatar}</div>
        <div class="who">
          <div class="n">${escapeHtml(s.name)} ${isMe ? `<span class="pill" style="padding:1px 8px;font-size:.7rem">${t('lb.you')}</span>` : ''}</div>
          <div class="s">
            <span class="pill ${s.difficulty}" style="padding:1px 8px;font-size:.7rem">${tDiff(s.difficulty)}</span>
            · ${t('lb.levels', { n: s.levelsCompleted, s: s.levelsCompleted === 1 ? '' : 's' })} · ${s.certificates} 🎖️
            ${isLowest ? `<span class="cheer-tag">${t('lb.cheer')}</span>` : ''}
          </div>
        </div>
        <div class="pts">${s.points}</div>
      </div>`;
    }).join('');
  } catch (err) {
    document.getElementById('list').innerHTML = `<p class="center" style="color:var(--bad)">${escapeHtml(err.message)}</p>`;
  }
})();
