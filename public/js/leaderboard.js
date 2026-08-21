// Leaderboard: Kahoot/Quizizz-style board — crowned podium, ranked rows,
// and a sticky "your rank" bar. Points = best pre + post per level + bonus.

const me = guard('student');
mountLangSwitch();
if (me) document.getElementById('navPoints').textContent = me.points || 0;

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

(async () => {
  try {
    const { leaderboard, meId } = await API.get('/api/leaderboard');
    const podium = document.getElementById('podium');
    const list = document.getElementById('list');

    // Segmented control — All-Time is active; the weekly board isn't tracked yet,
    // so "This Week" is shown disabled rather than faking data.
    const titleEl = document.querySelector('.page-title');
    if (titleEl && !document.getElementById('lbToggle')) {
      const seg = document.createElement('div');
      seg.id = 'lbToggle'; seg.className = 'lb-seg'; seg.setAttribute('role', 'group');
      seg.innerHTML =
        `<button class="on" aria-pressed="true">${t('lb.allTime')}</button>` +
        `<button disabled title="${escapeHtml(t('lb.weekSoon'))}" aria-disabled="true">${t('lb.thisWeek')}</button>`;
      titleEl.appendChild(seg);
    }

    if (!leaderboard.length) {
      podium.innerHTML = '';
      list.innerHTML = `<p class="center muted">${t('lb.none')}</p>`;
      return;
    }

    // Podium (top 3): crown over #1, avatar disc, name, points, numbered stand.
    const top3 = leaderboard.slice(0, 3);
    podium.innerHTML = top3.map((s) => `
      <div class="col c${s.rank}">
        <div class="crown">${s.rank === 1 ? '👑' : ''}</div>
        <div class="pav ${s.id === meId ? 'me' : ''}">${s.avatar}</div>
        <div class="pname">${escapeHtml(s.name)}${s.id === meId ? t('lb.youSuffix') : ''}</div>
        <div class="ppts">${s.points} ${t('nav.pts')}</div>
        <div class="stand"><span class="stand-num">${s.rank}</span></div>
      </div>`).join('');

    // Full ranked list.
    const lowestPts = leaderboard[leaderboard.length - 1].points;
    list.innerHTML = leaderboard.map((s) => {
      const isMe = s.id === meId;
      const isLowest = leaderboard.length > 3 && s.points === lowestPts && s.rank === leaderboard.length;
      return `
      <div class="lb-row ${isMe ? 'me' : ''} ${s.rank <= 3 ? 'top3' : ''} ${isLowest ? 'lowest' : ''}">
        <div class="rank">${MEDALS[s.rank] || '#' + s.rank}</div>
        <div class="av">${s.avatar}</div>
        <div class="who">
          <div class="n">${escapeHtml(s.name)} ${isMe ? `<span class="you-tag">${t('lb.you')}</span>` : ''}</div>
          <div class="s">
            <span class="pill ${s.difficulty}" style="padding:1px 8px;font-size:.7rem">${tDiff(s.difficulty)}</span>
            · ${t('lb.levels', { n: s.levelsCompleted, s: s.levelsCompleted === 1 ? '' : 's' })} · ${s.certificates} 🎖️
            ${isLowest ? `<span class="cheer-tag">${t('lb.cheer')}</span>` : ''}
          </div>
        </div>
        <div class="pts">${s.points}</div>
      </div>`;
    }).join('');

    // Sticky "your rank" bar — computed from the array you already received.
    const mine = leaderboard.find((s) => s.id === meId);
    if (mine) {
      const bar = document.createElement('div');
      bar.className = 'your-rank';
      let msg;
      if (mine.rank === 1) {
        msg = t('lb.rankLead');
      } else {
        const above = leaderboard.find((s) => s.rank === mine.rank - 1);
        const behind = above ? Math.max(0, above.points - mine.points) : 0;
        msg = t('lb.rankBehind', { n: behind, rank: mine.rank - 1 });
      }
      bar.innerHTML =
        `<span class="yr-rank">#${mine.rank}</span>` +
        `<span class="yr-msg">${msg}</span>` +
        `<span class="yr-pts">${mine.points} ${t('nav.pts')}</span>`;
      document.querySelector('.wrap').appendChild(bar);
    }
  } catch (err) {
    document.getElementById('list').innerHTML = `<p class="center" style="color:var(--bad)">${escapeHtml(err.message)}</p>`;
  }
})();
