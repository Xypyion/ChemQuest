/**
 * Teacher Console — 📋 Student Logs.
 *
 * Everything a student has done in StoiVenture, in one place: test scores,
 * challenges, quests, battles, what they asked Kru CJ, their answers to the
 * storyboard questions and the whiteboards they sent — with Kru CJ's reading
 * of each, and an overall profile on request.
 *
 * Driven by teacher.js like the other console sections:
 *   TLogs.render(hostEl)  — paint the current sub-view
 *   TLogs.reset()         — leave the section
 *
 * Sub-views: 'students' (the class) → 'student' (one record), plus two class
 * views across students: 'story' (every storyboard question and its answers)
 * and 'boards' (every whiteboard sent). Inline handlers call `TL`.
 *
 * Whiteboard pictures are never in the list payloads (src/routes/work.routes.js
 * explains why); `loadImages()` fetches them one by one after a paint.
 */
const TLogs = (() => {
  const esc = (s) => escapeHtml(s);
  const LEVELS = ['strong', 'mixed', 'struggling'];

  let host = null;
  let mode = 'students';     // 'students' | 'student' | 'story' | 'boards'
  let students = null;       // overview rows
  let aiEnabled = false;
  let record = null;         // one student's full record
  let storyData = null;      // the by-question view
  let boardsData = null;     // every whiteboard
  let query = '';
  const images = new Map();  // whiteboard id -> data URL

  function reset() { mode = 'students'; students = null; record = null; storyData = null; boardsData = null; }

  /* ------------------------------- loading ------------------------------ */

  async function render(el) {
    host = el || host;
    document.querySelectorAll('.t-nav button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'logs'));
    try {
      if (mode === 'student' && record) return paintStudent();
      if (mode === 'story') {
        if (!storyData) { loading(); const d = await API.get('/api/teacher/logs/story'); storyData = d.lessons; aiEnabled = d.aiEnabled; }
        return paintStory();
      }
      if (mode === 'boards') {
        if (!boardsData) { loading(); const d = await API.get('/api/teacher/logs/whiteboards'); boardsData = d.whiteboards; aiEnabled = d.aiEnabled; }
        return paintBoards();
      }
      if (!students) { loading(); const d = await API.get('/api/teacher/logs'); students = d.students; aiEnabled = d.aiEnabled; }
      paintStudents();
    } catch (e) {
      host.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`;
    }
  }

  function loading() { host.innerHTML = `<div class="t-card empty">${esc(t('common.loading'))}</div>`; }

  function setTab(m) { mode = m; record = null; render(); }
  /** Open a tab from elsewhere in the console (a level's page links to the story answers). */
  function openTab(el, m) { host = el; mode = m; record = null; return render(); }

  async function refresh() {
    students = null; storyData = null; boardsData = null;
    if (mode === 'student' && record) return openStudent(record.student.id);
    render();
  }

  /* ------------------------------ shared bits --------------------------- */

  function tabs() {
    const tab = (key, label, icon) =>
      `<button class="${mode === key ? 'active' : ''}" onclick="TL.setTab('${key}')">${ICON[icon](15)} ${esc(label)}</button>`;
    return `
      <div class="lg-tabs" role="tablist">
        ${tab('students', t('lg.tabStudents'), 'people')}
        ${tab('story', t('lg.tabStory'), 'chat')}
        ${tab('boards', t('lg.tabBoards'), 'board')}
      </div>`;
  }

  function head(sub) {
    return `
      <div class="t-head">
        <div><h1>${esc(t('lg.title'))}</h1><div class="sub">${esc(sub)}</div></div>
        <button class="tbtn ghost" onclick="TL.refresh()">${ICON.timer(15)} ${esc(t('t.refresh'))}</button>
      </div>`;
  }

  const pctText = (v) => (v == null ? '—' : v + '%');
  const when = (iso) => (iso ? fmtWhen(iso) : '—');

  function levelChip(level) {
    if (!LEVELS.includes(level)) return '';
    return `<span class="lg-level lv-${level}">${esc(t('t.aiLevel.' + level))}</span>`;
  }

  function aiError(code) {
    const known = {
      AI_DISABLED: 't.aiDisabled', AI_DAILY_LIMIT: 't.aiDailyLimit', AI_BUSY: 't.aiBusy',
      AI_BAD_KEY: 't.aiBadKey', AI_FAILED: 't.aiFailed',
      ANSWER_CHANGED: 'lg.aiChanged', BOARD_CHANGED: 'lg.aiChanged',
    };
    return known[code] ? t(known[code]) : code;
  }

  const bullets = (items) => (items || []).length ? `<ul class="lg-bul">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  function row(label, body) { return body ? `<div class="lg-row"><b>${esc(label)}</b><div>${body}</div></div>` : ''; }

  /** Kru CJ's reading of a storyboard answer. */
  function storyAiHtml(ai) {
    if (!ai) return '';
    return `
      <div class="lg-ai level-${esc(ai.level)}">
        <div class="lg-ai-head">${ICON.chat(14)} ${esc(t('lg.aiRead'))} ${levelChip(ai.level)}
          ${ai.onTask === false ? `<span class="lg-warn">${esc(t('lg.offTask'))}</span>` : ''}</div>
        <p>${esc(ai.summary)}</p>
        ${row(t('lg.understands'), bullets(ai.understands))}
        ${row(t('t.aiGaps'), bullets(ai.gaps))}
        ${row(t('lg.misconceptions'), bullets(ai.misconceptions))}
        ${row(t('t.aiNextStep'), ai.nextStep ? esc(ai.nextStep) : '')}
        <div class="lg-ai-at">${esc(fmtWhen(ai.at))}</div>
      </div>`;
  }

  /** Kru CJ's reading of a whiteboard. */
  function boardAiHtml(ai) {
    if (!ai) return '';
    return `
      <div class="lg-ai level-${esc(ai.level)}">
        <div class="lg-ai-head">${ICON.chat(14)} ${esc(t('lg.aiRead'))} ${levelChip(ai.level)}
          ${ai.legible === false ? `<span class="lg-warn">${esc(t('lg.illegible'))}</span>` : ''}</div>
        <p>${esc(ai.summary)}</p>
        ${row(t('lg.method'), ai.method ? esc(ai.method) : '')}
        ${(ai.steps || []).length ? row(t('lg.steps'), `<ol class="lg-bul">${ai.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`) : ''}
        ${row(t('lg.errors'), bullets(ai.errors))}
        ${row(t('t.aiStrengths'), bullets(ai.strengths))}
        ${row(t('lg.reached'), ai.reachedAnswer ? esc(ai.reachedAnswer) : '')}
        ${row(t('t.aiNextStep'), ai.nextStep ? esc(ai.nextStep) : '')}
        <div class="lg-ai-at">${esc(fmtWhen(ai.at))}</div>
      </div>`;
  }

  function analyzeBtn(kind, id, has) {
    if (!aiEnabled) return `<span class="lg-muted">${esc(t('t.aiDisabled'))}</span>`;
    return `<button class="tbtn ${has ? 'ghost' : 'blue'} sm" data-an="${esc(id)}" onclick="TL.analyze('${kind}','${esc(id)}', this)">
      ${ICON.chat(14)} ${esc(has ? t('lg.reanalyze') : t('lg.analyze'))}</button>`;
  }

  /* --------------------------- the class: students ----------------------- */

  function filtered() {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
  }

  function setQuery(v) {
    query = v;
    const body = document.getElementById('lgRows');
    if (body) body.innerHTML = studentRows();
  }

  function aiMix(a) {
    const n = (a.strong || 0) + (a.mixed || 0) + (a.struggling || 0);
    if (!n) return '<span class="lg-muted">—</span>';
    return `<span class="lg-mix">${LEVELS.filter((l) => a[l]).map((l) =>
      `<span class="lv-${l}" title="${esc(t('t.aiLevel.' + l))}">${a[l]}</span>`).join('')}</span>`;
  }

  function studentRows() {
    const list = filtered();
    if (!list.length) return `<tr><td colspan="9" class="empty">${esc(students.length ? t('t.noStudentMatch') : t('t.noStudents'))}</td></tr>`;
    return list.map((s) => `
      <tr class="lg-click" onclick="TL.openStudent('${esc(s.id)}')" tabindex="0"
          onkeydown="if(event.key==='Enter')TL.openStudent('${esc(s.id)}')">
        <td class="st-who">
          <span class="av">${avatarHtml(s.avatar, 30)}</span>
          <span class="st-id"><b>${esc(s.name)}</b><span class="st-mail">${esc(s.email)}</span></span>
        </td>
        <td class="num">${s.levelsDone}/${s.levelsTotal}</td>
        <td class="num">${pctText(s.preAvg)}</td>
        <td class="num">${pctText(s.postAvg)}</td>
        <td class="num">${pctText(s.challengePct)}</td>
        <td class="num">${s.storyAnswers}</td>
        <td class="num">${s.whiteboards}</td>
        <td>${s.insightLevel ? levelChip(s.insightLevel) : aiMix(s.aiLevels)}</td>
        <td class="lg-when">${esc(when(s.lastActive))}</td>
      </tr>`).join('');
  }

  function paintStudents() {
    host.innerHTML = `
      ${head(t('lg.sub'))}
      ${tabs()}
      <div class="lg-toolbar">
        <input class="t-input t-search" type="search" placeholder="${esc(t('t.studentSearchPh'))}"
               aria-label="${esc(t('t.studentSearchPh'))}" value="${esc(query)}" oninput="TL.setQuery(this.value)">
      </div>
      <div class="t-card t-tablewrap">
        <table class="t-table lg-table">
          <thead><tr>
            <th>${esc(t('t.thName'))}</th>
            <th class="num">${esc(t('lg.thLevels'))}</th>
            <th class="num">${esc(t('lg.thPre'))}</th>
            <th class="num">${esc(t('lg.thPost'))}</th>
            <th class="num">${esc(t('lg.thChallenges'))}</th>
            <th class="num">${esc(t('lg.thStory'))}</th>
            <th class="num">${esc(t('lg.thBoards'))}</th>
            <th>${esc(t('lg.thAi'))}</th>
            <th>${esc(t('lg.thLast'))}</th>
          </tr></thead>
          <tbody id="lgRows">${studentRows()}</tbody>
        </table>
      </div>
      <p class="lg-foot">${esc(t('lg.listHint'))}</p>`;
  }

  /* ------------------------------ one student ---------------------------- */

  async function openStudent(id) {
    mode = 'student';
    loading();
    try {
      const d = await API.get('/api/teacher/logs/student/' + encodeURIComponent(id));
      record = d;
      aiEnabled = d.aiEnabled;
      paintStudent();
    } catch (e) {
      host.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`;
    }
  }

  function backToList() { mode = 'students'; record = null; students = null; render(); }

  function tile(label, value, sub) {
    return `<div class="lg-tile"><div class="lg-tile-v">${value}</div><div class="lg-tile-l">${esc(label)}</div>${sub ? `<div class="lg-tile-s">${esc(sub)}</div>` : ''}</div>`;
  }

  function section(id, icon, title, count, body, open) {
    return `
      <details class="t-card lg-sec" id="lgs-${id}" ${open ? 'open' : ''}>
        <summary>${ICON[icon](17)} <span>${esc(title)}</span>${count != null ? `<span class="lg-count">${count}</span>` : ''}</summary>
        <div class="lg-sec-body">${body}</div>
      </details>`;
  }

  function insightHtml() {
    const ins = record.insight;
    const btn = aiEnabled
      ? `<button class="tbtn ${ins ? 'ghost' : 'blue'}" id="lgInsightBtn" onclick="TL.summarize()">${ICON.chat(15)} ${esc(ins ? t('lg.reSummarize') : t('lg.summarize'))}</button>`
      : `<span class="lg-muted">${esc(t('t.aiDisabled'))}</span>`;
    if (!ins) {
      return `
        <div class="t-card lg-insight empty-ins">
          <div><h3>${ICON.chat(17)} ${esc(t('lg.insightTitle'))}</h3><p class="lg-muted">${esc(t('lg.insightNone'))}</p></div>
          ${btn}
        </div>`;
    }
    return `
      <div class="t-card lg-insight level-${esc(ins.level)}">
        <div class="lg-insight-top">
          <h3>${ICON.chat(17)} ${esc(t('lg.insightTitle'))} ${levelChip(ins.level)}
            <span class="lg-trend tr-${esc(ins.trend)}">${esc(t('lg.trend.' + ins.trend))}</span></h3>
          ${btn}
        </div>
        <p class="lg-insight-sum">${esc(ins.overview)}</p>
        <div class="lg-insight-grid">
          ${row(t('t.aiStrengths'), bullets(ins.strengths))}
          ${row(t('lg.weaknesses'), bullets(ins.weaknesses))}
          ${row(t('lg.patterns'), bullets(ins.patterns))}
          ${row(t('lg.engagement'), ins.engagement ? esc(ins.engagement) : '')}
          ${row(t('lg.recommend'), bullets(ins.recommendations))}
        </div>
        <div class="lg-ai-at">${esc(t('lg.insightAt', { when: fmtWhen(ins.at) }))}</div>
      </div>`;
  }

  function levelsHtml() {
    const rows = record.levels.map((l) => {
      const pre = l.pre
        ? `${pctText(l.pre.percent)} <span class="lg-muted">· ${esc(t('lg.ptsShort', { n: l.pre.bestScore }))} · ${esc(t('lg.tries', { n: l.pre.attempts }))}</span>
           ${l.pre.awaiting ? `<span class="lg-tag wait">${esc(t('lg.awaiting'))}</span>` : l.pre.passed ? `<span class="lg-tag ok">${esc(t('lg.passed'))}</span>` : ''}`
        : `<span class="lg-muted">${esc(t('lg.notTaken'))}</span>`;
      const post = l.post
        ? `${pctText(l.post.percent)} <span class="lg-muted">· ${esc(t('lg.ptsShort', { n: l.post.bestScore }))}</span>
           ${l.post.awaiting ? `<span class="lg-tag wait">${esc(t('lg.awaiting'))}</span>` : l.post.passed ? `<span class="lg-tag ok">${esc(t('lg.passed'))}</span>` : `<span class="lg-tag no">${esc(t('lg.notPassed'))}</span>`}`
        : `<span class="lg-muted">${esc(t('lg.notTaken'))}</span>`;
      return `
        <tr>
          <td><b>${esc(l.icon)} ${chem(l.title)}</b> ${l.done ? `<span class="lg-tag ok">${esc(t('lg.levelDone'))}</span>` : ''}</td>
          <td>${l.storyDone ? `${ICON.check(14)} <span class="lg-muted">${esc(when(l.storyAt))}</span>` : `<span class="lg-muted">—</span>`}</td>
          <td class="num">${l.storyQuestions ? `${l.storyAnswered}/${l.storyQuestions}` : '—'}</td>
          <td>${pre}</td>
          <td>${post}</td>
        </tr>`;
    }).join('');
    return `
      <div class="t-tablewrap"><table class="t-table lg-table">
        <thead><tr><th>${esc(t('lg.thLevel'))}</th><th>${esc(t('lg.thStoryRead'))}</th><th class="num">${esc(t('lg.thStoryQ'))}</th>
          <th>${esc(t('lg.thPre'))}</th><th>${esc(t('lg.thPost'))}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="empty">${esc(t('t.noLevels'))}</td></tr>`}</tbody>
      </table></div>`;
  }

  function storyAnswerCard(a, withName) {
    const hist = (a.history || []).length
      ? `<details class="lg-hist"><summary>${esc(t('lg.earlier', { n: a.history.length }))}</summary>
          ${a.history.slice().reverse().map((h) => `<div class="lg-hist-item"><span class="lg-muted">${esc(when(h.at))}</span><div>${esc(h.answer)}</div></div>`).join('')}
        </details>` : '';
    return `
      <div class="lg-item" id="sa-${esc(a.id)}">
        <div class="lg-item-head">
          ${withName ? `<span class="av">${avatarHtml(a.userAvatar, 26)}</span><b>${esc(a.userName)}</b>` : `<b>${chem(a.lessonTitle)}</b>`}
          <span class="lg-muted">${esc(when(a.updatedAt))}</span>
          ${a.ai ? levelChip(a.ai.level) : `<span class="lg-tag wait">${esc(a.aiError ? aiError(a.aiError) : t('lg.notAnalyzed'))}</span>`}
        </div>
        ${withName ? '' : `<div class="lg-q">${ICON.question(14)} ${chemLinks(a.question)}</div>`}
        <div class="lg-answer">${esc(a.answer)}</div>
        ${hist}
        ${storyAiHtml(a.ai)}
        <div class="lg-item-acts">${analyzeBtn('story', a.id, !!a.ai)}</div>
      </div>`;
  }

  const KIND_KEY = { story: 'lg.kindStory', pre: 'lg.kindPre', post: 'lg.kindPost', challenge: 'lg.kindChallenge' };

  function boardCard(w, withName) {
    return `
      <div class="lg-item lg-board" id="wb-${esc(w.id)}">
        <div class="lg-item-head">
          ${withName ? `<span class="av">${avatarHtml(w.userAvatar, 26)}</span><b>${esc(w.userName)}</b>` : ''}
          <span class="lg-kind">${esc(t(KIND_KEY[w.kind] || 'lg.kindChallenge'))}</span>
          <b>${chem(w.title)}</b>
          <span class="lg-muted">${esc(when(w.updatedAt))}${w.sends > 1 ? ' · ' + esc(t('lg.sentTimes', { n: w.sends })) : ''}</span>
          ${w.ai ? levelChip(w.ai.level) : `<span class="lg-tag wait">${esc(w.aiError ? aiError(w.aiError) : t('lg.notAnalyzed'))}</span>`}
        </div>
        ${w.question ? `<div class="lg-q">${ICON.question(14)} ${chemLinks(w.question)}</div>` : ''}
        ${w.answer ? `<div class="lg-muted lg-final">${esc(t('lg.finalAnswer'))}: ${esc(w.answer)}</div>` : ''}
        <div class="lg-board-body">
          <button class="lg-board-img" onclick="TL.zoomBoard('${esc(w.id)}')" aria-label="${esc(t('lg.zoom'))}">
            <img data-wb="${esc(w.id)}" alt="${esc(t('lg.boardAlt', { name: w.userName }))}">
          </button>
          <div class="lg-board-ai">${boardAiHtml(w.ai) || `<p class="lg-muted">${esc(t('lg.boardNoAi'))}</p>`}
            <div class="lg-item-acts">${analyzeBtn('board', w.id, !!w.ai)}</div></div>
        </div>
      </div>`;
  }

  function testsHtml() {
    if (!record.tests.length) return `<p class="lg-muted">${esc(t('lg.none'))}</p>`;
    return record.tests.map((s) => `
      <div class="lg-item">
        <div class="lg-item-head">
          <b>${esc(s.lessonIcon || '')} ${chem(s.lessonTitle)}</b>
          <span class="lg-kind">${esc(s.mode === 'post' ? t('lg.kindPost') : t('lg.kindPre'))}</span>
          <span class="lg-muted">${esc(when(s.createdAt))}</span>
          ${s.status === 'graded'
            ? `<span class="lg-tag ${s.passed ? 'ok' : 'no'}">${esc(t('lg.scoreOf', { e: s.finalEarned, m: s.maxPoints }))}</span>`
            : `<span class="lg-tag wait">${esc(t('lg.awaiting'))}</span>`}
        </div>
        <div class="lg-muted">${esc(t('lg.mcqLine', { c: s.mcqCorrect, t: s.mcqTotal }))}</div>
        ${s.written.map((w) => `
          <div class="lg-written">
            <div class="lg-q">${chem(w.question)} <span class="lg-muted">(${w.awarded == null ? '?' : w.awarded}/${w.points})</span></div>
            <div class="lg-answer">${w.answer ? esc(w.answer) : `<span class="lg-muted">${esc(t('t.gradeNoAnswer'))}</span>`}</div>
          </div>`).join('')}
      </div>`).join('');
  }

  function challengesHtml() {
    if (!record.challenges.length) return `<p class="lg-muted">${esc(t('lg.none'))}</p>`;
    return record.challenges.map((c) => {
      const d = c.aiDiagnosis;
      return `
        <div class="lg-item">
          <div class="lg-item-head">
            <b>${esc(c.icon || '🧩')} ${chem(c.title)}</b>
            <span class="lg-muted">${esc(when(c.createdAt))}</span>
            <span class="lg-tag ${c.status === 'graded' ? 'ok' : 'wait'}">${esc(t('lg.scoreOf', { e: c.earned == null ? '?' : c.earned, m: c.maxPoints }))}${c.percent != null ? ` · ${c.percent}%` : ''}</span>
            ${c.status !== 'graded' ? `<span class="lg-tag wait">${esc(t('lg.awaiting'))}</span>` : ''}
          </div>
          ${c.feedback ? `<div class="lg-muted">${esc(t('lg.teacherFeedback'))}: ${esc(c.feedback)}</div>` : ''}
          ${d ? `<div class="lg-ai level-${esc(d.level)}">
            <div class="lg-ai-head">${ICON.chat(14)} ${esc(t('t.aiDiagnosis'))} ${levelChip(d.level)}</div>
            <p>${esc(d.summary)}</p>
            ${row(t('t.aiStrengths'), bullets(d.strengths))}
            ${row(t('t.aiGaps'), bullets(d.gaps))}
            ${row(t('t.aiNextStep'), d.nextStep ? esc(d.nextStep) : '')}</div>` : ''}
        </div>`;
    }).join('');
  }

  function questsHtml() {
    if (!record.quests.length) return `<p class="lg-muted">${esc(t('lg.none'))}</p>`;
    return `<div class="t-tablewrap"><table class="t-table lg-table">
      <thead><tr><th>${esc(t('lg.thQuest'))}</th><th class="num">${esc(t('lg.thScore'))}</th><th class="num">${esc(t('lg.thCoins'))}</th><th>${esc(t('lg.thWhen'))}</th></tr></thead>
      <tbody>${record.quests.map((q) => `<tr><td>${esc(q.icon || '⚔️')} ${chem(q.title)}</td>
        <td class="num">${q.earned}/${q.maxPoints}</td><td class="num">${q.coins}</td><td class="lg-when">${esc(when(q.createdAt))}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function battlesHtml() {
    const b = record.battles;
    const d = record.duels;
    const recent = b.recent.map((x) => `
      <li><span class="lg-muted">${esc(when(x.at))}</span>
        ${esc(t(x.attacking ? 'lg.battleVs' : 'lg.battleBy', { name: x.opponent }))} · ${esc(tDiff(x.difficulty))}
        <span class="lg-tag ${x.open ? 'wait' : x.won ? 'ok' : 'no'}">${esc(x.open ? t('lg.res.open') : x.won ? t('lg.res.won') : t('lg.res.lost'))}</span></li>`).join('');
    return `
      <div class="lg-mini">
        ${tile(t('lg.battlesTotal'), b.total)}
        ${tile(t('lg.battlesWon'), b.won)}
        ${tile(t('lg.duelsSent'), d.sent)}
        ${tile(t('lg.duelsRight'), `${d.answeredRight}/${d.received}`)}
      </div>
      ${recent ? `<ul class="lg-list">${recent}</ul>` : ''}`;
  }

  function tutorHtml() {
    if (!record.tutor.length) return `<p class="lg-muted">${esc(t('lg.none'))}</p>`;
    return record.tutor.map((l) => `
      <div class="lg-item">
        <div class="lg-item-head">
          <span class="lg-kind">${esc(l.kind === 'check' ? t('lg.tutorCheck') : t('lg.tutorAsk'))}</span>
          ${l.challengeTitle ? `<b>${chem(l.challengeTitle)}</b>` : ''}
          <span class="lg-muted">${esc(when(l.at))}</span>
          ${l.error ? `<span class="lg-tag no">${esc(t('lg.tutorFailed'))}</span>` : l.refused ? `<span class="lg-tag no">${esc(t('lg.tutorRefused'))}</span>` : ''}
        </div>
        ${l.questionText ? `<div class="lg-q">${ICON.question(14)} ${chem(l.questionText)}</div>` : ''}
        <div class="lg-chat"><div class="me">${esc(l.asked)}</div>${l.reply ? `<div class="bot">${esc(l.reply)}</div>` : ''}</div>
      </div>`).join('');
  }

  const EV_ICON = {
    signup: 'people', login: 'unlock', story: 'book', prePass: 'question', postDone: 'pen', certificate: 'certificates',
    preSubmit: 'question', postSubmit: 'pen', preGraded: 'check', postGraded: 'check',
    challenge: 'puzzle', challengeGraded: 'check', quest: 'quests', battleAttack: 'battle', battleDefend: 'battle',
    duelSent: 'battle', duelAnswered: 'battle', duelDeclined: 'battle', tutorAsk: 'chat', tutorCheck: 'chat',
    storyAnswer: 'chat', whiteboard: 'board', boardPost: 'people', boardComment: 'chat', boardQuestion: 'question', lab: 'flask',
  };

  /** One timeline line, in the console's language. */
  function eventText(e) {
    const p = { ...e.p };
    if (p.result) p.result = t('lg.res.' + p.result);
    if (p.diff) p.diff = tDiff(p.diff);
    if (p.kind) p.kind = t(KIND_KEY[p.kind] || 'lg.kindChallenge');
    if (p.game) p.game = t(p.game === 'guess' ? 'lab.guess.name' : 'lab.tw.name');
    return t('lg.ev.' + e.type, p);
  }

  function timelineHtml() {
    if (!record.timeline.length) return `<p class="lg-muted">${esc(t('lg.none'))}</p>`;
    let lastDay = '';
    return `<ol class="lg-tl">${record.timeline.map((e) => {
      const day = new Date(e.at).toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined, { dateStyle: 'medium' });
      const dayHead = day !== lastDay ? `<li class="lg-tl-day">${esc(day)}</li>` : '';
      lastDay = day;
      const lv = e.p && e.p.level ? levelChip(e.p.level) : '';
      return `${dayHead}<li class="lg-tl-ev ev-${esc(e.type)}">
        <span class="lg-tl-time">${esc(new Date(e.at).toLocaleTimeString(getLang() === 'th' ? 'th-TH' : undefined, { hour: '2-digit', minute: '2-digit' }))}</span>
        <span class="lg-tl-ico">${ICON[EV_ICON[e.type] || 'lines'](14)}</span>
        <span>${chem(eventText(e))} ${lv}</span></li>`;
    }).join('')}</ol>`;
  }

  function paintStudent() {
    const s = record.student;
    host.innerHTML = `
      <div class="t-head">
        <div><h1>${esc(t('lg.title'))}</h1><div class="sub">${esc(t('lg.studentSub'))}</div></div>
        <div class="row" style="gap:8px">
          <button class="tbtn ghost" onclick="TL.refresh()">${ICON.timer(15)} ${esc(t('t.refresh'))}</button>
          <button class="tbtn ghost" onclick="TL.backToList()">${esc(t('common.back'))}</button>
        </div>
      </div>

      <div class="t-card lg-profile">
        <span class="av">${avatarHtml(s.avatar, 56)}</span>
        <div class="lg-profile-id">
          <h2>${esc(s.name)}</h2>
          <div class="lg-muted">${esc(s.email)}</div>
          <div class="lg-muted">${esc(t('lg.joined', { when: when(s.joinedAt) }))} · ${esc(t('lg.lastLogin', { when: when(s.lastLoginAt) }))} · ${esc(t('lg.logins', { n: s.loginCount }))}</div>
        </div>
      </div>

      <div class="lg-tiles">
        ${tile(t('t.thPoints'), s.points)}
        ${tile(t('lg.coins'), s.coins, t('lg.coinsEarned', { n: s.coinsEarned }))}
        ${tile(t('lg.thLevels'), `${s.levelsDone}/${s.levelsTotal}`)}
        ${tile(t('lg.thPre'), pctText(s.preAvg), t('lg.avg'))}
        ${tile(t('lg.thPost'), pctText(s.postAvg), t('lg.avg'))}
        ${tile(t('lg.thChallenges'), pctText(s.challengePct), t('lg.nDone', { n: s.challenges }))}
        ${tile(t('t.thCerts'), s.certificates)}
        ${tile(t('lg.elements'), s.elements)}
      </div>

      ${insightHtml()}

      ${section('levels', 'map', t('lg.secLevels'), record.levels.length, levelsHtml(), true)}
      ${section('story', 'chat', t('lg.secStory'), record.storyAnswers.length,
        record.storyAnswers.length ? record.storyAnswers.map((a) => storyAnswerCard(a, false)).join('') : `<p class="lg-muted">${esc(t('lg.none'))}</p>`, true)}
      ${section('boards', 'board', t('lg.secBoards'), record.whiteboards.length,
        record.whiteboards.length ? record.whiteboards.map((w) => boardCard(w, false)).join('') : `<p class="lg-muted">${esc(t('lg.none'))}</p>`, true)}
      ${section('tests', 'pen', t('lg.secTests'), record.tests.length, testsHtml(), false)}
      ${section('challenges', 'puzzle', t('lg.secChallenges'), record.challenges.length, challengesHtml(), false)}
      ${section('quests', 'quests', t('lg.secQuests'), record.quests.length, questsHtml(), false)}
      ${section('battles', 'battle', t('lg.secBattles'), record.battles.total, battlesHtml(), false)}
      ${section('tutor', 'chat', t('lg.secTutor'), record.tutor.length, tutorHtml(), false)}
      ${section('other', 'people', t('lg.secOther'), null, `
        <div class="lg-mini">
          ${tile(t('lg.boardPosts'), record.board.posts)}
          ${tile(t('lg.boardComments'), record.board.comments)}
          ${tile(t('lg.boardQuestions'), record.board.questions)}
          ${tile(t('lg.labRounds'), `${record.lab.correct}/${record.lab.rounds}`, t('lg.labRight'))}
        </div>`, false)}
      ${section('timeline', 'calendar', t('lg.secTimeline'), record.timeline.length, timelineHtml(), false)}`;
    loadImages();
  }

  /* ------------------------- class view: story Qs ------------------------ */

  function paintStory() {
    const body = storyData.length ? storyData.map((l) => `
      <div class="t-card">
        <h3 style="margin-top:0">${esc(l.icon)} ${chem(l.title)}</h3>
        ${l.questions.map((q, i) => {
          const counts = { strong: 0, mixed: 0, struggling: 0 };
          // A whiteboard question is answered on the board; a typed one in text.
          const items = q.whiteboard ? (q.boards || []) : q.answers;
          items.forEach((a) => { if (a.ai && counts[a.ai.level] != null) counts[a.ai.level]++; });
          return `
            <details class="lg-sq" ${i === 0 ? 'open' : ''}>
              <summary>
                <span class="lg-sq-n">${i + 1}</span>
                <span class="lg-sq-text">${chemLinks(q.question)}</span>
                ${q.whiteboard ? `<span class="lg-kind">${ICON.board(13)} ${esc(t('wb.open'))}</span>` : ''}
                <span class="lg-count">${items.length}</span>
                ${aiMix(counts)}
              </summary>
              ${q.expected ? `<div class="grade-guide">${ICON.question(13)} ${esc(t('lg.expected'))}: ${esc(q.expected)}</div>` : ''}
              ${items.length
                ? items.map((a) => (q.whiteboard ? boardCard(a, true) : storyAnswerCard(a, true))).join('')
                : `<p class="lg-muted">${esc(t('lg.noAnswersYet'))}</p>`}
            </details>`;
        }).join('')}
      </div>`).join('')
      : `<div class="t-card empty">${esc(t('lg.noStoryQs'))}</div>`;
    host.innerHTML = `${head(t('lg.storySub'))}${tabs()}${body}`;
    loadImages();
  }

  /* ------------------------- class view: boards -------------------------- */

  function paintBoards() {
    const body = boardsData.length
      ? boardsData.map((w) => boardCard(w, true)).join('')
      : `<div class="t-card empty">${esc(t('lg.noBoards'))}</div>`;
    host.innerHTML = `${head(t('lg.boardsSub'))}${tabs()}<div class="lg-boards">${body}</div>`;
    loadImages();
  }

  /* --------------------------- pictures, lazily -------------------------- */

  async function loadImages() {
    const imgs = [...host.querySelectorAll('img[data-wb]')];
    const fill = (id) => host.querySelectorAll(`img[data-wb="${CSS.escape(id)}"]`).forEach((im) => { im.src = images.get(id); });
    for (const img of imgs) {
      const id = img.dataset.wb;
      if (images.has(id)) { fill(id); continue; }
      try {
        const r = await API.get(`/api/teacher/logs/whiteboard/${encodeURIComponent(id)}/image`);
        images.set(id, r.image);
        fill(id);
      } catch { /* the card still shows Kru CJ's reading */ }
    }
  }

  function zoomBoard(id) {
    const src = images.get(id);
    if (!src) return;
    openModal(`
      <img class="lg-zoom" src="${esc(src)}" alt="">
      <div class="editor-actions" style="border:none;padding-top:12px">
        <a class="tbtn ghost" href="${esc(src)}" download="whiteboard.png">${esc(t('lg.download'))}</a>
        <button class="tbtn" onclick="closeModal()">${esc(t('wb.close'))}</button>
      </div>`, 'wide');
  }

  /* ------------------------------ Kru CJ --------------------------------- */

  /** Find a story answer / board in whatever is loaded, and update it in place. */
  function patchLoaded(kind, id, ai) {
    const lists = [];
    if (kind === 'story') {
      if (record) lists.push(record.storyAnswers);
      if (storyData) storyData.forEach((l) => l.questions.forEach((q) => lists.push(q.answers)));
    } else {
      if (record) lists.push(record.whiteboards);
      if (boardsData) lists.push(boardsData);
      if (storyData) storyData.forEach((l) => l.questions.forEach((q) => lists.push(q.boards || [])));
    }
    lists.forEach((arr) => arr.forEach((x) => { if (x.id === id) { x.ai = ai; x.aiError = null; } }));
  }

  async function analyze(kind, id, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = `${ICON.chat(14)} ${esc(t('lg.analyzing'))}`; }
    try {
      const url = kind === 'story'
        ? `/api/teacher/logs/story-answer/${encodeURIComponent(id)}/analyze`
        : `/api/teacher/logs/whiteboard/${encodeURIComponent(id)}/analyze`;
      const r = await API.post(url, { lang: getLang() });
      patchLoaded(kind, id, r.ai);
      toast(t('lg.analyzed'), 'good');
      render();
    } catch (e) {
      toast(aiError(e.message), 'bad');
      if (btn) { btn.disabled = false; btn.innerHTML = `${ICON.chat(14)} ${esc(t('lg.analyze'))}`; }
    }
  }

  async function summarize() {
    const btn = document.getElementById('lgInsightBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = `${ICON.chat(15)} ${esc(t('lg.summarizing'))}`; }
    try {
      const r = await API.post(`/api/teacher/logs/student/${encodeURIComponent(record.student.id)}/summary`, { lang: getLang() });
      record.insight = r.insight;
      toast(t('lg.analyzed'), 'good');
      paintStudent();
    } catch (e) {
      toast(aiError(e.message), 'bad');
      if (btn) { btn.disabled = false; btn.innerHTML = `${ICON.chat(15)} ${esc(t('lg.summarize'))}`; }
    }
  }

  const api = { setTab, setQuery, refresh, openStudent, backToList, analyze, summarize, zoomBoard };
  window.TL = api;
  return { render, reset, openTab, ...api };
})();
