/* The Lab — the games tab.
 *
 * WHAT THIS FILE IS ALLOWED TO KNOW
 * Nothing that would let a student cheat. The server picks the round, keeps the
 * answer, decides what a round is worth and awards the coins. This file renders
 * what it is given and posts back what was tapped. Opening a third clue is a
 * request, not a local reveal, so the unopened clues are never in the page.
 *
 * SCREENS
 * There is one page and three views, switched by re-rendering #content:
 *   hub    — your periodic table, and the games you can start
 *   play   — a live round
 *   result — what the answer was, why, and what you won
 * The table is the home screen on purpose: you open the Lab, see the holes in
 * your table, and hit play to fill one.
 */

const me = guard('student');
mountLangSwitch();

const HOST = document.getElementById('content');
const LANG = getLang();

/** Everything the hub needs, refreshed after every round. */
let STATE = null;

/** Elements found during THIS visit, so the drop can be animated once. */
const JUST_FOUND = new Set();

init();

async function init() {
  try {
    STATE = await API.get('/api/lab?lang=' + LANG);
    document.getElementById('navPoints').textContent = me.points || 0;
    refreshNavCoins();
    renderHub();
  } catch (err) {
    HOST.innerHTML = `<p class="center muted">${escapeHtml(err.message)}</p>`;
  }
}

/* ------------------------------------------------------------------ *
 * The hub
 * ------------------------------------------------------------------ */

function renderHub() {
  const found = new Set(STATE.found);
  const capped = STATE.coinsLeftToday <= 0;

  HOST.innerHTML = `
    <div class="lab-head">
      <div>
        <h1>${escapeHtml(t('lab.title'))}</h1>
        <p class="lab-sub">${escapeHtml(t('lab.sub'))}</p>
      </div>
      <div class="lab-count" title="${escapeHtml(t('lab.foundTitle'))}">
        ${ICON.flask(18)}
        <b id="foundCount">${found.size}</b>
        <span>/ ${STATE.total}</span>
      </div>
    </div>

    <div class="lab-games">
      <button class="game-card" type="button" data-game="guess">
        <h3>${ICON.question(20)}${escapeHtml(t('lab.guess.name'))}</h3>
        <p>${escapeHtml(t('lab.guess.blurb'))}</p>
        <span class="worth">${escapeHtml(t('lab.upTo', { n: 15 }))}</span>
      </button>
      <button class="game-card" type="button" data-game="trueweird">
        <h3>${ICON.chat(20)}${escapeHtml(t('lab.tw.name'))}</h3>
        <p>${escapeHtml(t('lab.tw.blurb'))}</p>
        <span class="worth">${escapeHtml(t('lab.upTo', { n: 5 }))}</span>
      </button>
    </div>

    ${capped ? `<div class="capped">${t('lab.capped', { n: STATE.dailyCoins })}</div>` : ''}

    <div class="lab-panel" style="margin-top:22px;">
      <div class="lab-head" style="margin-bottom:14px;">
        <div>
          <h2 style="font-size:1.15rem;margin:0;">${escapeHtml(t('lab.tableTitle'))}</h2>
          <p class="lab-sub">${escapeHtml(t('lab.tableSub'))}</p>
        </div>
      </div>
      <div class="ptable-scroll">
        <div class="ptable" id="ptable">${tableHtml(found)}</div>
      </div>
      <div id="elCard" style="margin-top:16px;" hidden></div>
    </div>`;

  HOST.querySelectorAll('.game-card').forEach((b) => {
    b.addEventListener('click', () => startRound(b.dataset.game));
  });
  wireTable();
}

/** The 118 buttons. Rows 9 and 10 are the detached lanthanide/actinide rows. */
function tableHtml(found) {
  const rows = [[], [], [], [], [], [], [], [], [], [], []];
  STATE.table.forEach((e) => { rows[e.row].push(e); });

  let html = '';
  for (let r = 1; r <= 10; r++) {
    if (r === 9) html += '<div class="spacer"></div>';
    rows[r].forEach((e) => {
      const has = found.has(e.z);
      const name = LANG === 'th' ? e.th : e.en;
      const fresh = JUST_FOUND.has(e.z) ? ' is-new' : '';
      html += `<button class="el ${has ? 'is-found cat-' + e.cat : 'is-locked'}${fresh}"
                 type="button" style="grid-column:${e.col};"
                 ${has ? `data-z="${e.z}"` : 'disabled aria-disabled="true"'}
                 title="${has ? escapeHtml(name) : escapeHtml(t('lab.notFound'))}">
                 <span class="z">${e.z}</span><span class="sym">${e.sym}</span>
               </button>`;
    });
  }
  return html;
}

function wireTable() {
  HOST.querySelectorAll('.el.is-found').forEach((b) => {
    b.addEventListener('click', () => showCard(Number(b.dataset.z)));
  });
}

async function showCard(z) {
  const host = document.getElementById('elCard');
  if (!host) return;
  try {
    const { element } = await API.get(`/api/lab/element/${z}?lang=${LANG}`);
    host.hidden = false;
    host.innerHTML = `
      <div class="el-card lab-panel">
        <div class="big cat-${element.cat}" style="background:var(--x)">${element.sym}</div>
        <div>
          <h3>${chem(element.name)}</h3>
          <p class="meta">${escapeHtml(t('lab.atomicNo', { n: element.z }))} · ${escapeHtml(t('cat.' + element.cat))}</p>
          <p class="fact">${chem(element.fact)}</p>
        </div>
      </div>`;
    /* The swatch reuses the table's group colour, so a card always matches the
       tile it came from. */
    const big = host.querySelector('.big');
    const tile = HOST.querySelector(`.el[data-z="${z}"]`);
    if (tile) big.style.background = getComputedStyle(tile).backgroundColor;
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) { toast(err.message, 'bad'); }
}

/* ------------------------------------------------------------------ *
 * Playing
 * ------------------------------------------------------------------ */

async function startRound(game) {
  try {
    const data = await API.post('/api/lab/round?lang=' + LANG, { game });
    renderPlay(data.round);
  } catch (err) { toast(err.message, 'bad'); }
}

function renderPlay(round) {
  const isGuess = round.game === 'guess';

  HOST.innerHTML = `
    <div class="play">
      <div class="play-top">
        <h2>${escapeHtml(t(isGuess ? 'lab.guess.name' : 'lab.tw.name'))}</h2>
        <span class="play-worth" id="worth">${escapeHtml(t('lab.worth', { n: round.worth }))}</span>
      </div>

      ${isGuess ? guessBody(round) : twBody(round)}

      <div class="play-actions">
        <button class="lab-btn ghost" type="button" id="quit">${escapeHtml(t('lab.backToTable'))}</button>
      </div>
    </div>`;

  document.getElementById('quit').addEventListener('click', reloadHub);

  if (isGuess) {
    const more = document.getElementById('moreClue');
    if (more) more.addEventListener('click', () => openClue(round.id));
  }
  HOST.querySelectorAll('.choice').forEach((b) => {
    b.addEventListener('click', () => answer(round, b.dataset.answer, b));
  });
}

function guessBody(round) {
  const clues = round.clues.map((c) => `<div class="clue">${chem(c)}</div>`).join('');
  const canOpen = round.revealed < round.totalClues;
  return `
    <div class="clues" id="clues">${clues}</div>
    ${canOpen ? `<button class="clue-more" type="button" id="moreClue">
        ${escapeHtml(t('lab.moreClue', { n: round.totalClues - round.revealed }))}
      </button>` : ''}
    <div class="choices">
      ${round.choices.map((sym) => `
        <button class="choice" type="button" data-answer="${escapeHtml(sym)}">${escapeHtml(sym)}</button>`).join('')}
    </div>`;
}

function twBody(round) {
  return `
    <div class="statement">${chem(round.statement)}</div>
    <div class="choices tf-row">
      <button class="choice" type="button" data-answer="true">${escapeHtml(t('lab.true'))}</button>
      <button class="choice" type="button" data-answer="false">${escapeHtml(t('lab.weird'))}</button>
    </div>`;
}

async function openClue(id) {
  try {
    const { round } = await API.post(`/api/lab/round/${id}/clue?lang=${LANG}`, {});
    renderPlay(round);
  } catch (err) { toast(err.message, 'bad'); }
}

async function answer(round, given, button) {
  /* Lock every choice the moment one is tapped: a double tap must not send a
     second answer, and the server would reject it anyway. */
  HOST.querySelectorAll('.choice').forEach((b) => { b.disabled = true; });
  const more = document.getElementById('moreClue');
  if (more) more.disabled = true;

  const payload = round.game === 'guess' ? given : given === 'true';

  try {
    const data = await API.post(`/api/lab/round/${round.id}/answer?lang=${LANG}`, { answer: payload });
    const r = data.result;

    button.classList.add(r.correct ? 'is-right' : 'is-wrong');
    if (!r.correct) markRight(round, r);
    if (r.correct) confetti(r.element ? 120 : 60);

    if (r.element) JUST_FOUND.add(r.element.z);
    STATE.coins = data.coins;
    STATE.coinsLeftToday = data.coinsLeftToday;
    STATE.streak = data.streak;
    if (r.element) STATE.found.push(r.element.z);
    refreshNavCoins();

    showResult(round, r, data);
  } catch (err) {
    toast(err.message, 'bad');
    HOST.querySelectorAll('.choice').forEach((b) => { b.disabled = false; });
  }
}

/** Light up the correct choice too, so a wrong guess still teaches. */
function markRight(round, result) {
  const want = round.game === 'guess' ? result.answer : String(result.answer);
  HOST.querySelectorAll('.choice').forEach((b) => {
    if (b.dataset.answer === want) b.classList.add('is-right');
  });
}

function showResult(round, r, data) {
  const box = document.createElement('div');
  box.className = 'result';

  const headline = r.correct ? t('lab.right') : t('lab.wrong');
  const explain = round.game === 'guess'
    ? t('lab.itWas', { name: r.answerName, sym: r.answer })
    : r.why;

  box.innerHTML = `
    <p class="verdict ${r.correct ? 'good' : 'bad'}">${escapeHtml(headline)}</p>
    <p class="why">${chem(explain)}</p>
    <div class="reward">
      ${r.coins > 0 ? `<span class="coin-won">${ICON.coin(16)} +${r.coins}</span>` : ''}
      ${r.element ? `<span class="found-el">
          <i class="cat-${r.element.cat}">${r.element.sym}</i>
          ${escapeHtml(t('lab.newElement', { name: r.element.name }))}
        </span>` : ''}
      ${r.correct && r.coins === 0 ? `<span class="capped" style="margin:0;padding:7px 14px;">
          ${escapeHtml(t('lab.cappedShort'))}</span>` : ''}
    </div>`;

  HOST.querySelector('.play').insertBefore(box, HOST.querySelector('.play-actions'));

  const actions = HOST.querySelector('.play-actions');
  actions.insertAdjacentHTML('afterbegin',
    `<button class="lab-btn primary lab-glow-grass" type="button" id="again">
       ${escapeHtml(t('lab.playAgain'))}</button>`);
  document.getElementById('again').addEventListener('click', () => startRound(round.game));

  if (r.element) {
    toast(t('lab.newElementToast', { name: r.element.name }), 'good');
  }
}

/** Back to the table, with the day's numbers refreshed from the server. */
async function reloadHub() {
  try {
    STATE = await API.get('/api/lab?lang=' + LANG);
    renderHub();
  } catch (err) { toast(err.message, 'bad'); }
}
