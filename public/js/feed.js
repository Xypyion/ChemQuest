/**
 * Assignment board — shared by the student level board and the teacher
 * console. Google-Classroom style:
 *
 *   ASSIGNMENTS (teacher posts). A level can have many, and each has its OWN
 *   rating criteria. Students hand their work in UNDER the assignment, and
 *   that work is rated (1-5 stars per criterion) on that assignment's
 *   criteria by classmates and the teacher.
 *
 *   CLASS POSTS. Anything a student shares that is not a hand-in: liked and
 *   commented on, never rated.
 *
 * It used to be one mixed feed with one set of criteria for the whole level,
 * and student work that belonged to no assignment.
 *
 * Usage: Feed.mount(containerEl, lessonId, { teacher: bool, title, icon })
 */
const Feed = (() => {
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_FILES = 6;
  const MAX_CRITERIA = 8;

  let el = null;          // container
  let lessonId = null;
  let opts = {};
  let posts = [];
  let legacyCriteria = []; // the old level-wide list (teacher only) — a starting point
  let pending = {};       // composer key -> [{ name, type, size, data }]
  let newOpen = false;    // teacher: is the "new assignment" form open?
  let newCrit = [];       // teacher: criteria being typed for a new assignment
  let editId = null;      // teacher: assignment whose title/criteria are being edited
  let editCrit = [];
  let editTitle = '';

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Math.random().toString(36).slice(2));
  const esc = (s) => escapeHtml(s);
  function isImage(type) { return /^image\//.test(type || ''); }
  function fmtSize(n) {
    if (n > 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    if (n > 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    const sameDay = new Date().toDateString() === d.toDateString();
    return sameDay
      ? d.toLocaleTimeString(getLang() === 'th' ? 'th-TH' : undefined, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(getLang() === 'th' ? 'th-TH' : undefined, { day: 'numeric', month: 'short' }) +
        ' · ' + d.toLocaleTimeString(getLang() === 'th' ? 'th-TH' : undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function fileIcon(type) {
    if (isImage(type)) return ICON.image(18);
    if (/video/.test(type)) return ICON.video(18);
    return ICON.file(18);
  }

  async function mount(container, lid, options) {
    el = container; lessonId = lid; opts = options || {};
    pending = {}; newOpen = false; newCrit = []; editId = null;
    el.innerHTML = `<p class="center muted">${t('common.loading')}</p>`;
    await refresh();
  }

  async function refresh() {
    try {
      const data = await API.get('/api/posts/lesson/' + encodeURIComponent(lessonId));
      posts = data.posts;
      legacyCriteria = data.legacyCriteria || [];
      render();
    } catch (e) { el.innerHTML = `<div class="feed-empty">${esc(e.message)}</div>`; }
  }

  /* --------------------------- grouping --------------------------- */

  function assignments() { return posts.filter((p) => p.isAssignment); }
  function workFor(aid) { return posts.filter((p) => !p.isAssignment && p.assignmentId === aid); }
  /** Student posts that are not a hand-in (or whose assignment was deleted). */
  function classPosts() {
    const ids = new Set(assignments().map((a) => a.id));
    return posts.filter((p) => !p.isAssignment && !(p.assignmentId && ids.has(p.assignmentId)));
  }

  /* --------------------------- rendering --------------------------- */

  /** Typed text survives a repaint (a file added, a star given, ...). */
  function keepInputs() {
    const kept = {};
    el.querySelectorAll('[data-keep]').forEach((i) => { kept[i.id] = i.value; });
    return kept;
  }
  function restoreInputs(kept) {
    Object.keys(kept).forEach((id) => { const i = document.getElementById(id); if (i) i.value = kept[id]; });
  }

  function render() {
    const kept = el.querySelector('.feed') ? keepInputs() : {};
    const as = assignments();
    const cls = classPosts();

    const banner = opts.title ? `
      <div class="class-banner">
        <div class="cb-icon">${opts.icon ? esc(opts.icon) : ICON.pen(28)}</div>
        <div class="cb-info">
          <div class="cb-title">${esc(opts.title)}</div>
          <div class="cb-sub">${esc(t('feed.boardSub', { a: as.length, n: posts.length - as.length }))}</div>
        </div>
      </div>` : '';

    const assignList = as.length
      ? as.map(renderAssignment).join('')
      : `<div class="feed-empty">${esc(opts.teacher ? t('feed.noAssignmentsTeacher') : t('feed.noAssignments'))}</div>`;

    el.innerHTML = `<div class="feed">
      ${banner}
      ${opts.teacher ? newAssignmentHtml() : ''}
      <h3 class="feed-sec">${esc(t('feed.assignmentsTitle'))}</h3>
      ${assignList}
      <h3 class="feed-sec">${esc(t('feed.classPosts'))}</h3>
      <p class="feed-sec-sub">${esc(t('feed.classPostsSub'))}</p>
      ${opts.teacher ? '' : composerHtml('class', t('feed.composerPh'), t('feed.post'))}
      ${cls.length ? cls.map((p) => renderPost(p, false)).join('') : `<div class="feed-empty">${esc(t('feed.empty'))}</div>`}
    </div>`;

    restoreInputs(kept);
    el.querySelectorAll('input[type=file][data-key]').forEach((inp) => inp.addEventListener('change', onPickFiles));
  }

  /** A text box + attachments + a send button. `key` names the composer. */
  function composerHtml(key, placeholder, sendLabel) {
    const chips = (pending[key] || []).map((f, i) => `
      <div class="file-chip">
        ${isImage(f.type) ? `<img src="${f.data}" alt="">` : `<span>${fileIcon(f.type)}</span>`}
        <span class="fc-name">${esc(f.name)}</span>
        <button type="button" aria-label="${t('common.delete')}" onclick="Feed.removeFile('${key}', ${i})">✕</button>
      </div>`).join('');
    return `
      <div class="composer" data-composer="${key}">
        <textarea id="txt-${key}" data-keep placeholder="${esc(placeholder)}"></textarea>
        ${chips ? `<div class="file-chips">${chips}</div>` : ''}
        <div class="comp-actions">
          <label class="btn ghost" style="cursor:pointer;padding:8px 14px;font-size:.85rem">
            ${t('feed.attach')}<input type="file" multiple style="display:none" data-key="${key}">
          </label>
          <span class="attach-hint">${t('feed.attachHint')}</span>
          <button class="btn green" style="padding:10px 18px" id="send-${key}" onclick="Feed.send('${key}')">${esc(sendLabel)}</button>
        </div>
      </div>`;
  }

  /** Teacher: the criteria list editor (used for a new assignment and for editing one). */
  function criteriaEditor(scope, list) {
    const rows = list.map((c, i) => `
      <div class="crit-row">
        <input class="t-input crit-in" data-scope="${scope}" data-i="${i}" value="${esc(c.label)}"
               placeholder="${esc(t('rate.critPh'))}" maxlength="80" aria-label="${esc(t('feed.critN', { n: i + 1 }))}">
        <button type="button" class="btn ghost crit-x" onclick="Feed.removeCrit('${scope}', ${i})" aria-label="${esc(t('common.delete'))}">✕</button>
      </div>`).join('');
    return `
      <div class="crit-editor">
        <label class="t-label">${esc(t('feed.critTitle'))}</label>
        <div class="crit-hint">${esc(t('feed.critHint'))}</div>
        ${rows || `<div class="crit-hint">${esc(t('feed.critNone'))}</div>`}
        ${list.length < MAX_CRITERIA ? `<button type="button" class="btn ghost crit-add" onclick="Feed.addCrit('${scope}')">${esc(t('rate.addCrit'))}</button>` : ''}
      </div>`;
  }

  function newAssignmentHtml() {
    if (!newOpen) {
      return `<button class="btn feed-new" onclick="Feed.openNew()">${esc(t('feed.newAssignment'))}</button>`;
    }
    return `
      <div class="new-assign">
        <div class="na-head">${esc(t('feed.newAssignment'))}</div>
        <label class="t-label" for="as-title">${esc(t('feed.assignTitle'))}</label>
        <input id="as-title" data-keep class="t-input" maxlength="120" placeholder="${esc(t('feed.assignTitlePh'))}">
        ${composerHtml('assign', t('feed.composerPhTeacher'), t('feed.postAssignment'))}
        ${criteriaEditor('new', newCrit)}
        <button type="button" class="btn ghost" onclick="Feed.closeNew()">${esc(t('common.cancel'))}</button>
      </div>`;
  }

  function attachmentsHtml(p) {
    return (p.attachments || []).map((a) => isImage(a.type)
      ? `<a class="att-img" href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy"></a>`
      : `<a class="att-file" href="${esc(a.url)}" target="_blank" rel="noopener" download="${esc(a.name)}">
           ${fileIcon(a.type)} ${esc(a.name)} <span class="af-size">${fmtSize(a.size || 0)}</span></a>`).join('');
  }

  function commentsHtml(p) {
    const list = (p.comments || []).map((c) => `
      <div class="comment">
        <span class="c-av">${avatarHtml(c.author.avatar, 26)}</span>
        <div class="c-body">
          <div class="c-name">${esc(c.author.name)}${c.author.role === 'teacher' ? ` <span class="ph-role">${t('feed.teacherBadge')}</span>` : ''}</div>
          <div class="c-text">${chemLinks(c.text)}</div>
        </div>
        ${(opts.teacher || c.author.id === API.user().id) ? `<button class="c-del" aria-label="${t('common.delete')}" onclick="Feed.delComment('${p.id}','${c.id}')">${ICON.trash(14)}</button>` : ''}
      </div>`).join('');
    return `
      ${list ? `<div class="comments">${list}</div>` : ''}
      <div class="comment-row">
        <input type="text" id="cm-${p.id}" data-keep placeholder="${esc(t('feed.commentPh'))}" aria-label="${esc(t('feed.commentPh'))}"
               onkeydown="if(event.key==='Enter')Feed.comment('${p.id}')">
        <button onclick="Feed.comment('${p.id}')">${t('common.send')}</button>
      </div>`;
  }

  function headHtml(p) {
    return `
      <div class="post-head">
        <span class="ph-av">${avatarHtml(p.author.avatar, 32)}</span>
        <span class="ph-name">${esc(p.author.name)}</span>
        ${p.author.role === 'teacher' ? `<span class="ph-role">${t('feed.teacherBadge')}</span>` : ''}
        <span class="ph-time">${fmtTime(p.createdAt)}</span>
        ${p.canDelete ? `<button class="ph-del" aria-label="${t('common.delete')}" onclick="Feed.delPost('${p.id}')">${ICON.trash(16)}</button>` : ''}
      </div>`;
  }

  function likeHtml(p) {
    return `
      <div class="post-actions">
        <button class="like-btn ${p.likedByMe ? 'liked' : ''}" aria-pressed="${p.likedByMe}" onclick="Feed.like('${p.id}')">
          ${ICON.heart(16)} ${t('feed.like')}${p.likes.length ? ' · ' + p.likes.length : ''}
        </button>
      </div>`;
  }

  function renderAssignment(a) {
    const crit = a.criteria || [];
    const work = workFor(a.id);
    const me = API.user();
    const mine = work.filter((w) => w.author.id === me.id).length;

    let critBlock;
    if (opts.teacher && editId === a.id) {
      critBlock = `
        <div class="as-edit">
          <label class="t-label" for="ed-title-${a.id}">${esc(t('feed.assignTitle'))}</label>
          <input id="ed-title-${a.id}" class="t-input" maxlength="120" value="${esc(editTitle)}">
          ${criteriaEditor('edit', editCrit)}
          <div class="as-edit-acts">
            <button class="btn ghost" onclick="Feed.cancelEdit()">${esc(t('common.cancel'))}</button>
            <button class="btn" onclick="Feed.saveEdit('${a.id}')">${esc(t('feed.saveAssignment'))}</button>
          </div>
        </div>`;
    } else {
      critBlock = `
        <div class="as-crit">
          <b>${esc(t('feed.ratedOn'))}</b>
          ${crit.length ? crit.map((c) => `<span class="as-crit-chip">${esc(c.label)}</span>`).join('') : `<span class="muted">${esc(t('feed.notRated'))}</span>`}
          ${opts.teacher ? `<button class="btn ghost as-edit-btn" onclick="Feed.startEdit('${a.id}')">${esc(t('feed.editAssignment'))}</button>` : ''}
        </div>`;
    }

    // Private "ask the teacher": the teacher sees every question, a student their own.
    let privateBlock = '';
    if (opts.teacher) {
      if ((a.questions || []).length) {
        privateBlock = `<div class="private-qs">
          <div class="pq-title">${t('feed.privateQuestions')}</div>
          ${a.questions.map((qq) => `<div class="pq-item"><span>${avatarHtml(qq.author.avatar, 22)}</span><b>${esc(qq.author.name)}:</b><span>${esc(qq.text)}</span></div>`).join('')}
        </div>`;
      }
    } else {
      const myQs = (a.questions || []).map((qq) => `<div class="mine">${ICON.chat(14)} ${esc(qq.text)}</div>`).join('');
      privateBlock = `<div class="ask-teacher">
        <div class="at-note">${t('feed.askTeacherNote')}</div>
        ${myQs}
        <div class="comment-row">
          <input type="text" id="ask-${a.id}" data-keep placeholder="${esc(t('feed.askTeacherPh'))}" aria-label="${esc(t('feed.askTeacherPh'))}">
          <button onclick="Feed.ask('${a.id}')">${t('common.send')}</button>
        </div>
      </div>`;
    }

    return `
      <div class="post-card assignment" id="as-${a.id}">
        <span class="assign-banner">${t('feed.assignment')}</span>
        ${headHtml(a)}
        ${a.title ? `<h3 class="as-title">${chem(a.title)}</h3>` : ''}
        ${a.text ? `<div class="post-text">${chemLinks(a.text)}</div>` : ''}
        ${attachmentsHtml(a) ? `<div class="att-grid">${attachmentsHtml(a)}</div>` : ''}
        ${critBlock}
        ${likeHtml(a)}
        ${commentsHtml(a)}
        ${privateBlock}
        <div class="as-work">
          <div class="as-work-head">${esc(t('feed.studentWork', { n: work.length }))}
            ${!opts.teacher && mine ? `<span class="as-mine">${esc(t('feed.youHandedIn'))}</span>` : ''}</div>
          ${opts.teacher ? '' : composerHtml('hand-' + a.id, t('feed.handInPh'), t('feed.handIn'))}
          ${work.length ? work.map((w) => renderPost(w, true)).join('') : `<div class="feed-empty small">${esc(t('feed.noWork'))}</div>`}
        </div>
      </div>`;
  }

  /** A student's post: a hand-in (rated on its assignment's criteria) or a class post. */
  function renderPost(p, handIn) {
    return `
      <div class="post-card ${handIn ? 'work' : ''}">
        ${headHtml(p)}
        ${p.text ? `<div class="post-text">${chemLinks(p.text)}</div>` : ''}
        ${attachmentsHtml(p) ? `<div class="att-grid">${attachmentsHtml(p)}</div>` : ''}
        ${likeHtml(p)}
        ${handIn ? renderRating(p) : ''}
        ${commentsHtml(p)}
      </div>`;
  }

  /* ------------------------------ ratings ------------------------------ */

  // Five stars for one criterion. Interactive (my rating) or read-only (average).
  function starRow(postId, critId, value, interactive) {
    let out = `<span class="stars" data-crit="${critId}">`;
    for (let v = 1; v <= 5; v++) {
      const on = v <= Math.round(value);
      out += interactive
        ? `<button class="star ${on ? 'on' : ''}" aria-label="${v}" onclick="Feed.rate('${postId}','${critId}',${v})">${on ? '★' : '☆'}</button>`
        : `<span class="star ${on ? 'on' : ''}">${on ? '★' : '☆'}</span>`;
    }
    return out + '</span>';
  }

  function renderRating(p) {
    const a = posts.find((x) => x.id === p.assignmentId);
    const criteria = (a && a.criteria) || [];
    if (!criteria.length) return '';
    const r = p.rating || { perCriterion: {}, mine: null, teacher: null, raters: 0 };
    const canRate = !!r.canRate; // false on your own work
    const rows = criteria.map((c) => {
      const per = r.perCriterion[c.id] || { avg: 0, count: 0 };
      const mineVal = (r.mine && r.mine[c.id]) || 0;
      const teacherVal = (r.teacher && r.teacher[c.id]) || 0;
      const stars = canRate ? starRow(p.id, c.id, mineVal, true) : starRow(p.id, c.id, per.avg, false);
      const meta = `${per.count ? `${per.avg}★ · ${t('rate.raters', { n: per.count })}` : t('rate.none')}`
        + `${teacherVal ? ` · ${t('feed.teacherBadge')} ${teacherVal}★` : ''}`;
      return `<div class="rating-row">
        <span class="rc-label">${esc(c.label)}</span>
        ${stars}
        <span class="rc-meta">${meta}</span>
      </div>`;
    }).join('');
    const title = canRate
      ? (opts.teacher ? t('rate.titleTeacher') : t('rate.title'))
      : t('rate.average');
    return `<div class="rating-block">
      <div class="rating-title">${ICON.star(16)} ${title}</div>
      ${rows}
    </div>`;
  }

  async function rate(postId, critId, val) {
    const p = posts.find((x) => x.id === postId);
    const scores = { ...(p && p.rating && p.rating.mine ? p.rating.mine : {}), [critId]: val };
    try {
      const res = await API.post(`/api/posts/${postId}/rate`, { scores });
      if (p) p.rating = res.rating; // update in place then re-render
      render();
      toast(t('rate.thanks'), 'good');
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* ------------------------- criteria editing ------------------------- */

  function listOf(scope) { return scope === 'new' ? newCrit : editCrit; }
  function syncCrit() {
    el.querySelectorAll('.crit-in').forEach((i) => {
      const l = listOf(i.dataset.scope)[+i.dataset.i];
      if (l) l.label = i.value;
    });
    const tIn = editId && document.getElementById('ed-title-' + editId);
    if (tIn) editTitle = tIn.value;
  }
  function addCrit(scope) { syncCrit(); const l = listOf(scope); if (l.length < MAX_CRITERIA) l.push({ id: uid(), label: '' }); render(); }
  function removeCrit(scope, i) { syncCrit(); listOf(scope).splice(i, 1); render(); }

  function openNew() {
    newOpen = true;
    // The first assignment on a level starts from the old level-wide criteria, if there were any.
    newCrit = !assignments().length && legacyCriteria.length
      ? legacyCriteria.map((c) => ({ id: uid(), label: c.label }))
      : [];
    render();
  }
  function closeNew() { newOpen = false; newCrit = []; delete pending.assign; render(); }

  function startEdit(id) {
    const a = posts.find((x) => x.id === id);
    if (!a) return;
    editId = id;
    editTitle = a.title || '';
    editCrit = (a.criteria || []).map((c) => ({ id: c.id, label: c.label }));
    render();
  }
  function cancelEdit() { editId = null; render(); }
  async function saveEdit(id) {
    syncCrit();
    try {
      await API.patch(`/api/posts/${id}/assignment`, { title: editTitle, criteria: editCrit.filter((c) => c.label.trim()) });
      editId = null;
      toast(t('feed.assignmentSaved'), 'good');
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* ------------------------------ actions ------------------------------ */

  function onPickFiles(e) {
    const key = e.target.dataset.key;
    const files = [...(e.target.files || [])];
    e.target.value = '';
    pending[key] = pending[key] || [];
    for (const f of files) {
      if (pending[key].length >= MAX_FILES) { toast(t('feed.maxFiles'), 'bad'); break; }
      if (f.size > MAX_FILE_BYTES) { toast(t('feed.fileTooBig', { name: f.name }), 'bad'); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        pending[key].push({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: reader.result });
        syncCrit();
        render();
      };
      reader.readAsDataURL(f);
    }
  }

  function removeFile(key, i) { syncCrit(); (pending[key] || []).splice(i, 1); render(); }

  /** Send one composer: a new assignment, a hand-in, or a class post. */
  async function send(key) {
    syncCrit();
    const text = ((document.getElementById('txt-' + key) || {}).value || '').trim();
    const files = pending[key] || [];
    const body = { text, attachments: files };
    if (key === 'assign') {
      body.title = ((document.getElementById('as-title') || {}).value || '').trim();
      body.criteria = newCrit.filter((c) => c.label.trim());
      if (!body.title && !text && !files.length) { toast(t('feed.empty.attachment'), 'bad'); return; }
    } else {
      if (!text && !files.length) { toast(t('feed.empty.attachment'), 'bad'); return; }
      if (key.startsWith('hand-')) body.assignmentId = key.slice(5);
    }
    const btn = document.getElementById('send-' + key);
    if (btn) { btn.disabled = true; btn.textContent = t('feed.posting'); }
    try {
      await API.post('/api/posts/lesson/' + encodeURIComponent(lessonId), body);
      delete pending[key];
      const box = document.getElementById('txt-' + key);
      if (box) box.value = '';
      if (key === 'assign') { newOpen = false; newCrit = []; const ti = document.getElementById('as-title'); if (ti) ti.value = ''; }
      toast(key.startsWith('hand-') ? t('feed.handedIn') : t('feed.posted'), 'good');
      await refresh();
    } catch (e) {
      toast(e.message, 'bad');
      if (btn) btn.disabled = false;
      render();
    }
  }

  async function like(id) {
    try { await API.post(`/api/posts/${id}/like`); await refresh(); } catch (e) { toast(e.message, 'bad'); }
  }

  async function comment(id) {
    const input = document.getElementById('cm-' + id);
    const text = (input.value || '').trim();
    if (!text) return;
    try { await API.post(`/api/posts/${id}/comment`, { text }); input.value = ''; await refresh(); } catch (e) { toast(e.message, 'bad'); }
  }

  async function delComment(pid, cid) {
    try { await API.del(`/api/posts/${pid}/comment/${cid}`); await refresh(); } catch (e) { toast(e.message, 'bad'); }
  }

  async function ask(id) {
    const input = document.getElementById('ask-' + id);
    const text = (input.value || '').trim();
    if (!text) return;
    try { await API.post(`/api/posts/${id}/question`, { text }); input.value = ''; toast(t('feed.askSent'), 'good'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function delPost(id) {
    const p = posts.find((x) => x.id === id);
    const msg = p && p.isAssignment && workFor(id).length
      ? t('feed.deleteAssignmentQ', { n: workFor(id).length })
      : t('feed.deletePost');
    if (!confirm(msg)) return;
    try { await API.del('/api/posts/' + id); toast(t('feed.deleted'), 'good'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return {
    mount, refresh, removeFile, send, like, comment, delComment, ask, delPost, rate,
    openNew, closeNew, addCrit, removeCrit, startEdit, cancelEdit, saveEdit,
  };
})();
