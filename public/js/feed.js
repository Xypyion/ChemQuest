/**
 * Assignment board feed — shared by the student level board and the teacher
 * console. Facebook-group style: composer with file attachments (image
 * previews), posts, likes, comments, and a private "ask the teacher" box.
 *
 * Usage: Feed.mount(containerEl, lessonId, { teacher: bool })
 */
const Feed = (() => {
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_FILES = 6;

  let el = null;          // container
  let lessonId = null;
  let opts = {};
  let posts = [];
  let pendingFiles = [];  // [{ name, type, size, data }]

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
  function fileEmoji(type, name) {
    if (isImage(type)) return '🖼️';
    if (/pdf/.test(type) || /\.pdf$/i.test(name)) return '📕';
    if (/word|officedocument.word/.test(type)) return '📘';
    if (/sheet|excel/.test(type)) return '📗';
    if (/zip|compressed/.test(type)) return '🗜️';
    if (/video/.test(type)) return '🎞️';
    if (/audio/.test(type)) return '🎵';
    return '📄';
  }

  async function mount(container, lid, options) {
    el = container; lessonId = lid; opts = options || {};
    el.innerHTML = `<p class="center muted">${t('common.loading')}</p>`;
    await refresh();
  }

  async function refresh() {
    try {
      posts = (await API.get('/api/posts/lesson/' + encodeURIComponent(lessonId))).posts;
      render();
    } catch (e) { el.innerHTML = `<div class="feed-empty">${escapeHtml(e.message)}</div>`; }
  }

  /* ------------------------------ rendering ------------------------------ */

  function render() {
    const chips = pendingFiles.map((f, i) => `
      <div class="file-chip">
        ${isImage(f.type) ? `<img src="${f.data}" alt="">` : `<span>${fileEmoji(f.type, f.name)}</span>`}
        <span class="fc-name">${escapeHtml(f.name)}</span>
        <button type="button" aria-label="${t('common.delete')}" onclick="Feed.removeFile(${i})">✕</button>
      </div>`).join('');

    const composer = `
      <div class="composer">
        <textarea id="feedText" placeholder="${escapeHtml(opts.teacher ? t('feed.composerPhTeacher') : t('feed.composerPh'))}"></textarea>
        ${chips ? `<div class="file-chips">${chips}</div>` : ''}
        <div class="comp-actions">
          <label class="btn ghost" style="cursor:pointer;padding:8px 14px;font-size:.85rem">
            ${t('feed.attach')}<input id="feedFiles" type="file" multiple style="display:none">
          </label>
          <span class="attach-hint">${t('feed.attachHint')}</span>
          <button class="btn ${opts.teacher ? '' : 'green'}" style="padding:10px 18px" id="feedPostBtn">
            ${opts.teacher ? t('feed.postAssignment') : t('feed.post')}
          </button>
        </div>
      </div>`;

    const list = posts.length
      ? posts.map(renderPost).join('')
      : `<div class="feed-empty">${t('feed.empty')}</div>`;

    el.innerHTML = `<div class="feed">${composer}${list}</div>`;

    document.getElementById('feedFiles').addEventListener('change', onPickFiles);
    document.getElementById('feedPostBtn').addEventListener('click', submitPost);
  }

  function renderPost(p) {
    const atts = (p.attachments || []).map((a) => isImage(a.type)
      ? `<a class="att-img" href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.name)}" loading="lazy"></a>`
      : `<a class="att-file" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" download="${escapeHtml(a.name)}">
           ${fileEmoji(a.type, a.name)} ${escapeHtml(a.name)} <span class="af-size">${fmtSize(a.size || 0)}</span></a>`).join('');

    const comments = (p.comments || []).map((c) => `
      <div class="comment">
        <span class="c-av">${escapeHtml(c.author.avatar)}</span>
        <div class="c-body">
          <div class="c-name">${escapeHtml(c.author.name)}${c.author.role === 'teacher' ? ` <span class="ph-role">${t('feed.teacherBadge')}</span>` : ''}</div>
          <div class="c-text">${escapeHtml(c.text)}</div>
        </div>
        ${(opts.teacher || c.author.id === API.user().id) ? `<button class="c-del" aria-label="${t('common.delete')}" onclick="Feed.delComment('${p.id}','${c.id}')">🗑</button>` : ''}
      </div>`).join('');

    // Private question area:
    //  - student: a small private box under the comments + their own sent questions
    //  - teacher: a panel listing every student's private question
    let privateBlock = '';
    if (opts.teacher) {
      if ((p.questions || []).length) {
        privateBlock = `<div class="private-qs">
          <div class="pq-title">${t('feed.privateQuestions')}</div>
          ${p.questions.map((qq) => `<div class="pq-item"><span>${escapeHtml(qq.author.avatar)}</span><b>${escapeHtml(qq.author.name)}:</b><span>${escapeHtml(qq.text)}</span></div>`).join('')}
        </div>`;
      }
    } else if (p.isAssignment) {
      // The private "ask the teacher" box only appears on the teacher's assignment post.
      const mine = (p.questions || []).map((qq) => `<div class="mine">🙋 ${escapeHtml(qq.text)}</div>`).join('');
      privateBlock = `<div class="ask-teacher">
        <div class="at-note">${t('feed.askTeacherNote')}</div>
        ${mine}
        <div class="comment-row">
          <input type="text" id="ask-${p.id}" placeholder="${escapeHtml(t('feed.askTeacherPh'))}" aria-label="${escapeHtml(t('feed.askTeacherPh'))}">
          <button onclick="Feed.ask('${p.id}')">${t('common.send')}</button>
        </div>
      </div>`;
    }

    return `
      <div class="post-card ${p.isAssignment ? 'assignment' : ''}">
        ${p.isAssignment ? `<span class="assign-banner">${t('feed.assignment')}</span>` : ''}
        <div class="post-head">
          <span class="ph-av">${escapeHtml(p.author.avatar)}</span>
          <span class="ph-name">${escapeHtml(p.author.name)}</span>
          ${p.author.role === 'teacher' ? `<span class="ph-role">${t('feed.teacherBadge')}</span>` : ''}
          <span class="ph-time">${fmtTime(p.createdAt)}</span>
          ${p.canDelete ? `<button class="ph-del" aria-label="${t('common.delete')}" onclick="Feed.delPost('${p.id}')">🗑</button>` : ''}
        </div>
        ${p.text ? `<div class="post-text">${escapeHtml(p.text)}</div>` : ''}
        ${atts ? `<div class="att-grid">${atts}</div>` : ''}
        <div class="post-actions">
          <button class="like-btn ${p.likedByMe ? 'liked' : ''}" aria-pressed="${p.likedByMe}" onclick="Feed.like('${p.id}')">
            ${p.likedByMe ? '❤️' : '🤍'} ${t('feed.like')}${p.likes.length ? ' · ' + p.likes.length : ''}
          </button>
        </div>
        ${comments ? `<div class="comments">${comments}</div>` : ''}
        <div class="comment-row">
          <input type="text" id="cm-${p.id}" placeholder="${escapeHtml(t('feed.commentPh'))}" aria-label="${escapeHtml(t('feed.commentPh'))}"
                 onkeydown="if(event.key==='Enter')Feed.comment('${p.id}')">
          <button onclick="Feed.comment('${p.id}')">${t('common.send')}</button>
        </div>
        ${privateBlock}
      </div>`;
  }

  /* ------------------------------ actions ------------------------------ */

  function onPickFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    for (const f of files) {
      if (pendingFiles.length >= MAX_FILES) { toast(t('feed.maxFiles'), 'bad'); break; }
      if (f.size > MAX_FILE_BYTES) { toast(t('feed.fileTooBig', { name: f.name }), 'bad'); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        pendingFiles.push({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: reader.result });
        keepTextAndRender();
      };
      reader.readAsDataURL(f);
    }
  }

  function keepTextAndRender() {
    const txtEl = document.getElementById('feedText');
    const txt = txtEl ? txtEl.value : '';
    render();
    const again = document.getElementById('feedText');
    if (again) again.value = txt;
  }

  function removeFile(i) { pendingFiles.splice(i, 1); keepTextAndRender(); }

  async function submitPost() {
    const text = (document.getElementById('feedText').value || '').trim();
    if (!text && !pendingFiles.length) { toast(t('feed.empty.attachment'), 'bad'); return; }
    const btn = document.getElementById('feedPostBtn');
    btn.disabled = true; btn.textContent = t('feed.posting');
    try {
      await API.post('/api/posts/lesson/' + encodeURIComponent(lessonId), { text, attachments: pendingFiles });
      pendingFiles = [];
      toast(t('feed.posted'), 'good');
      await refresh();
    } catch (e) { toast(e.message, 'bad'); btn.disabled = false; btn.textContent = opts.teacher ? t('feed.postAssignment') : t('feed.post'); }
  }

  async function like(id) {
    try { await API.post(`/api/posts/${id}/like`); await refresh(); } catch (e) { toast(e.message, 'bad'); }
  }

  async function comment(id) {
    const input = document.getElementById('cm-' + id);
    const text = (input.value || '').trim();
    if (!text) return;
    try { await API.post(`/api/posts/${id}/comment`, { text }); await refresh(); } catch (e) { toast(e.message, 'bad'); }
  }

  async function delComment(pid, cid) {
    try { await API.del(`/api/posts/${pid}/comment/${cid}`); await refresh(); } catch (e) { toast(e.message, 'bad'); }
  }

  async function ask(id) {
    const input = document.getElementById('ask-' + id);
    const text = (input.value || '').trim();
    if (!text) return;
    try { await API.post(`/api/posts/${id}/question`, { text }); toast(t('feed.askSent'), 'good'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function delPost(id) {
    if (!confirm(t('feed.deletePost'))) return;
    try { await API.del('/api/posts/' + id); toast(t('feed.deleted'), 'good'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return { mount, refresh, removeFile, like, comment, delComment, ask, delPost };
})();
