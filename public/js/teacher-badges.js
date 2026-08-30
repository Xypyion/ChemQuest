/**
 * Teacher Console — 🎖️ Badges.
 *
 * Same contract as teacher-quests.js / teacher-battles.js:
 *   TBadges.render(hostEl)  paint the section
 *   TBadges.reset()         forget sub-view state when the nav changes
 * Inline onclick handlers call `window.TBG`. Loaded before teacher.js.
 *
 * A badge is a picture plus a name. Attaching one to a challenge is done in the
 * challenge editor, not here — this section is the library the picker chooses
 * from, plus a way to see who has earned what.
 *
 * The picture is sent as a data URL and stored by the server, which hands back
 * a `/uploads/...` URL. That means the badge document stays small and the image
 * is cached by the browser like any other file — the same road the assignment
 * board's attachments already take.
 */
const TBadges = (() => {
  const esc = (s) => escapeHtml(s);

  /* Kept under the server's own cap so the failure happens here, where it can
     be explained, rather than as a 400 after a slow upload. */
  const MAX_IMAGE_BYTES = 512 * 1024;

  let host = null;
  let badges = [];
  let loaded = false;
  let mode = 'list';     // 'list' | 'holders'
  let holders = null;
  let draft = null;      // { id, name, description, imageData, imagePreview }

  function reset() {
    loaded = false;
    mode = 'list';
    holders = null;
    draft = null;
  }

  /* ------------------------------- loading ------------------------------ */

  async function load() {
    badges = (await API.get('/api/teacher/badges')).badges || [];
    loaded = true;
  }

  async function render(el) {
    if (el) host = el;
    if (!host) return;
    document.querySelectorAll('.t-nav button[data-view]').forEach((b) =>
      b.classList.toggle('active', b.dataset.view === 'badges'));

    if (!loaded) {
      host.innerHTML = `<div class="t-card empty">${t('common.loading')}</div>`;
      try { await load(); } catch (e) { host.innerHTML = `<div class="t-card empty">${esc(e.message)}</div>`; return; }
    }
    if (mode === 'holders') return paintHolders();
    paintList();
  }

  async function refresh() {
    loaded = false;
    await render();
  }

  /* -------------------------------- list -------------------------------- */

  function badgeCard(b) {
    return `
      <div class="bdg-card">
        <img class="bdg-img" src="${esc(b.image)}" alt="${esc(b.name)}">
        <div class="bdg-body">
          <div class="bdg-name">${esc(b.name)}</div>
          ${b.description ? `<div class="bdg-desc">${esc(b.description)}</div>` : ''}
          <div class="bdg-meta">
            ${t('t.bgUsedBy', { n: b.usedBy })} · ${t('t.bgEarnedBy', { n: b.earnedBy })}
          </div>
        </div>
        <div class="bdg-actions">
          ${b.earnedBy
            ? `<button class="tbtn sm ghost" onclick="TBG.holders('${esc(b.id)}')">${t('t.bgWhoHas')}</button>`
            : ''}
          <button class="tbtn sm indigo" onclick="TBG.edit('${esc(b.id)}')">${t('t.edit')}</button>
          <button class="tbtn sm danger" onclick="TBG.confirmDelete('${esc(b.id)}')">🗑</button>
        </div>
      </div>`;
  }

  function paintList() {
    host.innerHTML = `
      <div class="t-head">
        <div><h1>${t('t.bgTitle')}</h1><div class="sub">${t('t.bgSub')}</div></div>
        <button class="tbtn indigo" onclick="TBG.newBadge()">${t('t.bgNew')}</button>
      </div>
      <div class="t-card">
        <div class="sub" style="margin-bottom:12px">${t('t.bgHowHint')}</div>
        ${badges.length
          ? `<div class="bdg-list">${badges.map(badgeCard).join('')}</div>`
          : `<div class="empty">${t('t.bgNone')}</div>`}
      </div>`;
  }

  /* ------------------------------ the editor ----------------------------- */

  function newBadge() {
    draft = { id: null, name: '', description: '', imageData: '', imagePreview: '' };
    openEditor();
  }

  function edit(id) {
    const b = badges.find((x) => x.id === id);
    if (!b) return;
    // imageData stays empty: an edit that does not pick a new file must leave
    // the stored picture alone, and the server treats "no image" as "keep it".
    draft = { id: b.id, name: b.name, description: b.description || '', imageData: '', imagePreview: b.image };
    openEditor();
  }

  function openEditor() {
    const isNew = !draft.id;
    openModal(`
      <h3>${isNew ? t('t.bgNew') : t('t.bgEdit')}</h3>
      <div class="bdg-editor">
        <div class="bdg-drop">
          ${draft.imagePreview
            ? `<img class="bdg-preview" src="${esc(draft.imagePreview)}" alt="">`
            : `<div class="bdg-preview empty">🎖️</div>`}
          <label class="tbtn ghost sm" style="cursor:pointer">
            ${draft.imagePreview ? t('t.bgReplacePicture') : t('t.bgChoosePicture')}
            <input type="file" accept="image/*" style="display:none" onchange="TBG.pickImage(this)">
          </label>
          <div class="sub">${t('t.bgPictureHint')}</div>
        </div>
        <div class="bdg-fields">
          <label class="t-label">${t('t.bgName')}</label>
          <input class="t-input" id="bg-name" value="${esc(draft.name)}" maxlength="60" placeholder="${esc(t('t.bgNamePh'))}">
          <label class="t-label">${t('t.bgDesc')}</label>
          <textarea class="t-area" id="bg-desc" rows="2" maxlength="300" placeholder="${esc(t('t.bgDescPh'))}">${esc(draft.description)}</textarea>
        </div>
      </div>
      <div class="editor-actions" style="margin-top:14px">
        <button class="tbtn ghost" onclick="TBG.closeEditor()">${t('common.cancel')}</button>
        <button class="tbtn indigo" onclick="TBG.save()">${t('common.save')}</button>
      </div>`, 'wide');
  }

  /** Read the two text fields before a repaint throws them away. */
  function syncDraft() {
    const n = document.getElementById('bg-name');
    const d = document.getElementById('bg-desc');
    if (n) draft.name = n.value;
    if (d) draft.description = d.value;
  }

  function pickImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast(t('t.bgNotAnImage'), 'bad'); input.value = ''; return; }
    if (file.size > MAX_IMAGE_BYTES) { toast(t('t.bgTooBig'), 'bad'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      syncDraft();
      draft.imageData = reader.result;
      draft.imagePreview = reader.result;
      openEditor();
    };
    reader.onerror = () => toast(t('t.bgReadFailed'), 'bad');
    reader.readAsDataURL(file);
  }

  function closeEditor() {
    draft = null;
    closeModal();
  }

  /** Turn a server error code into a sentence. */
  function messageFor(code) {
    const key = 't.bgErr.' + code;
    const text = t(key);
    return text === key ? code : text;
  }

  async function save() {
    syncDraft();
    if (!draft.name.trim()) { toast(t('t.bgNeedName'), 'bad'); return; }
    if (!draft.id && !draft.imageData) { toast(t('t.bgNeedPicture'), 'bad'); return; }

    const payload = { name: draft.name, description: draft.description };
    // Only sent when a new file was picked — otherwise the server keeps the old.
    if (draft.imageData) payload.image = { name: 'badge.png', data: draft.imageData };

    try {
      if (draft.id) await API.put('/api/teacher/badges/' + draft.id, payload);
      else await API.post('/api/teacher/badges', payload);
      toast(t('t.bgSaved'), 'good');
      closeEditor();
      await refresh();
    } catch (e) { toast(messageFor(e.message), 'bad'); }
  }

  /* ------------------------------- deleting ------------------------------ */

  function confirmDelete(id) {
    const b = badges.find((x) => x.id === id);
    if (!b) return;
    if (b.earnedBy) {
      // The server refuses this too; saying so here saves a pointless round trip
      // and explains the way out.
      openModal(`
        <h3>${t('t.bgCannotDelete')}</h3>
        <p>${t('t.bgCannotDeleteBody', { name: esc(b.name), n: b.earnedBy })}</p>
        <div class="editor-actions"><button class="tbtn ghost" onclick="closeModal()">${t('common.close')}</button></div>`);
      return;
    }
    openModal(`
      <h3>${t('t.bgDeleteTitle')}</h3>
      <p>${t('t.bgDeleteBody', { name: esc(b.name) })}</p>
      ${b.usedBy ? `<p class="sub">${t('t.bgDeleteDetach', { n: b.usedBy })}</p>` : ''}
      <div class="editor-actions">
        <button class="tbtn ghost" onclick="closeModal()">${t('common.cancel')}</button>
        <button class="tbtn danger" onclick="TBG.doDelete('${esc(id)}')">${t('common.delete')}</button>
      </div>`);
  }

  async function doDelete(id) {
    try {
      await API.del('/api/teacher/badges/' + id);
      closeModal();
      toast(t('t.bgDeleted'), 'good');
      await refresh();
    } catch (e) { toast(messageFor(e.message), 'bad'); }
  }

  /* ------------------------------- holders ------------------------------- */

  async function holdersOf(id) {
    try {
      holders = await API.get('/api/teacher/badges/' + id + '/holders');
      mode = 'holders';
      render();
    } catch (e) { toast(e.message, 'bad'); }
  }

  function paintHolders() {
    const b = holders.badge;
    host.innerHTML = `
      <div class="t-head">
        <div><h1>${esc(b.name)}</h1><div class="sub">${t('t.bgEarnedBy', { n: b.earnedBy })}</div></div>
        <button class="tbtn ghost" onclick="TBG.backToList()">${t('common.back')}</button>
      </div>
      <div class="t-card">
        <img class="bdg-img big" src="${esc(b.image)}" alt="${esc(b.name)}">
        ${holders.holders.length ? `
          <table class="t-table">
            <thead><tr><th>${t('t.bgStudent')}</th><th>${t('t.bgFrom')}</th><th>${t('t.bgWhen')}</th></tr></thead>
            <tbody>
              ${holders.holders.map((h) => `
                <tr>
                  <td>${esc(h.userName)}</td>
                  <td>${esc(h.challengeTitle || '—')}</td>
                  <td class="sub">${esc(fmtWhen(h.awardedAt))}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : `<div class="empty">${t('t.bgNoHolders')}</div>`}
      </div>`;
  }

  function backToList() {
    mode = 'list';
    holders = null;
    render();
  }

  const api = {
    newBadge, edit, save, pickImage, closeEditor,
    confirmDelete, doDelete, holders: holdersOf, backToList,
  };
  window.TBG = api;

  return { render, reset };
})();
