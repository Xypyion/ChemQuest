/**
 * The online whiteboard — a white board a student can write their working on
 * (เขียนทด), then send to their teacher with one button.
 *
 * A teacher switches it on per question ("this question uses the whiteboard")
 * in the challenge editor, the pre/post-test editor, or on a storyboard
 * question. The player shows ONE button at the bottom-left of the screen
 * (`dock()`, below) for the question on screen; pressing it opens this board.
 *
 * What is sent is a picture (PNG, or JPEG if the PNG is large). The server
 * stores it (POST /api/work/whiteboard) and then Kru CJ reads it FOR THE
 * TEACHER (POST /api/work/whiteboard/:id/analyze, fired without waiting).
 * The student never sees a score from it — it is working, not an answer.
 *
 * Usage:
 *   Whiteboard.dock({ key, label, open })   -> show the bottom-left button for a question
 *   Whiteboard.dock(null)                   -> hide it
 *   Whiteboard.open({ key, question, payload, getAnswer })
 *
 * `key` is anything unique to the question on this page. The strokes are kept
 * per key while the page is open, so closing the board and opening it again
 * brings the working back, and sending it again sends the updated board.
 *
 * Load after i18n.js, icons.js and api.js.
 */
const Whiteboard = (() => {
  const W = 1200;                 // the board's own resolution; CSS scales it to fit
  const H = 750;
  const COLORS = ['#1f1b2e', '#1355d4', '#d6264f', '#14895a'];
  const SIZES = [3, 6, 12];
  const MAX_PNG = 1400 * 1024;    // past this, send a JPEG instead

  const boards = new Map();       // key -> { strokes:[], redo:[] }
  const sent = new Set();         // keys sent at least once on this page

  let cur = null;                 // the open board: { key, opts, strokes, redo }
  let tool = { color: COLORS[0], size: SIZES[1], erase: false };
  let drawing = null;             // the stroke under the pointer
  let canvas = null;
  let ctx = null;

  const esc = (s) => escapeHtml(s);

  /* ------------------------------- markup ------------------------------- */

  function open(opts) {
    close();
    const state = boards.get(opts.key) || { strokes: [], redo: [] };
    boards.set(opts.key, state);
    cur = { key: opts.key, opts, state };

    const host = document.createElement('div');
    host.className = 'wb-overlay';
    host.id = 'wbOverlay';
    host.innerHTML = `
      <div class="wb-panel" role="dialog" aria-modal="true" aria-labelledby="wbTitle">
        <div class="wb-head">
          <div class="wb-head-text">
            <h2 id="wbTitle">${ICON.board(20)} ${esc(t('wb.title'))}</h2>
            ${opts.question ? `<div class="wb-question">${chemLinks(opts.question)}</div>` : ''}
          </div>
          <button type="button" class="wb-x" onclick="Whiteboard.close()" aria-label="${esc(t('wb.close'))}">${ICON.close(16)}</button>
        </div>

        <div class="wb-tools" role="toolbar" aria-label="${esc(t('wb.tools'))}">
          <div class="wb-group">
            <button type="button" class="wb-tool" data-tool="pen" aria-pressed="true" onclick="Whiteboard.setTool('pen')">${ICON.pen(16)} ${esc(t('wb.pen'))}</button>
            <button type="button" class="wb-tool" data-tool="erase" aria-pressed="false" onclick="Whiteboard.setTool('erase')">${ICON.eraser(16)} ${esc(t('wb.eraser'))}</button>
          </div>
          <div class="wb-group" aria-label="${esc(t('wb.color'))}">
            ${COLORS.map((c, i) => `<button type="button" class="wb-swatch" data-color="${c}" style="--sw:${c}"
              aria-label="${esc(t('wb.color'))} ${i + 1}" onclick="Whiteboard.setColor('${c}')"></button>`).join('')}
          </div>
          <div class="wb-group" aria-label="${esc(t('wb.size'))}">
            ${SIZES.map((s) => `<button type="button" class="wb-size" data-size="${s}" aria-label="${esc(t('wb.size'))} ${s}"
              onclick="Whiteboard.setSize(${s})"><i style="--d:${Math.max(4, s + 2)}px"></i></button>`).join('')}
          </div>
          <div class="wb-group">
            <button type="button" class="wb-tool" onclick="Whiteboard.undo()" title="Ctrl+Z">${ICON.undo(16)} ${esc(t('wb.undo'))}</button>
            <button type="button" class="wb-tool" onclick="Whiteboard.clearBoard()">${ICON.trash(16)} ${esc(t('wb.clear'))}</button>
          </div>
        </div>

        <div class="wb-canvas-wrap"><canvas class="wb-canvas" width="${W}" height="${H}"></canvas></div>

        <div class="wb-foot">
          <p class="wb-note">${esc(t('wb.note'))}</p>
          <div class="wb-foot-acts">
            <button type="button" class="btn ghost" onclick="Whiteboard.close()">${esc(t('wb.close'))}</button>
            <button type="button" class="btn green" id="wbSend" onclick="Whiteboard.send()">
              ${esc(sent.has(opts.key) ? t('wb.resend') : t('wb.send'))}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(host);
    document.body.classList.add('wb-locked');

    canvas = host.querySelector('canvas');
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);
    host.addEventListener('click', (e) => { if (e.target === host) close(); });
    document.addEventListener('keydown', onKey);

    paintTools();
    redraw();
  }

  function close() {
    const host = document.getElementById('wbOverlay');
    if (host) host.remove();
    document.body.classList.remove('wb-locked');
    document.removeEventListener('keydown', onKey);
    cur = null; canvas = null; ctx = null; drawing = null;
  }

  /* ------------------------------- tools -------------------------------- */

  function paintTools() {
    const host = document.getElementById('wbOverlay');
    if (!host) return;
    host.querySelectorAll('.wb-tool[data-tool]').forEach((b) => {
      b.setAttribute('aria-pressed', String((b.dataset.tool === 'erase') === tool.erase));
    });
    host.querySelectorAll('.wb-swatch').forEach((b) => {
      b.setAttribute('aria-pressed', String(!tool.erase && b.dataset.color === tool.color));
    });
    host.querySelectorAll('.wb-size').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.size) === tool.size));
    });
  }
  function setTool(name) { tool.erase = name === 'erase'; paintTools(); }
  function setColor(c) { tool.color = c; tool.erase = false; paintTools(); }
  function setSize(s) { tool.size = s; paintTools(); }

  function undo() {
    if (!cur || !cur.state.strokes.length) return;
    cur.state.redo.push(cur.state.strokes.pop());
    redraw();
  }
  function clearBoard() {
    if (!cur || !cur.state.strokes.length) return;
    if (!confirm(t('wb.clearConfirm'))) return;
    cur.state.strokes = [];
    cur.state.redo = [];
    redraw();
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  }

  /* ------------------------------ drawing ------------------------------- */

  /** Pointer position in board pixels, whatever size the canvas is shown at. */
  function pos(e) {
    // Measured against the drawing surface inside the border, not the border box.
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - canvas.clientLeft;
    const y = e.clientY - r.top - canvas.clientTop;
    return [
      Math.round((x / canvas.clientWidth) * W * 10) / 10,
      Math.round((y / canvas.clientHeight) * H * 10) / 10,
    ];
  }

  function onDown(e) {
    if (!cur || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = {
      color: tool.erase ? '#ffffff' : tool.color,
      // The eraser is wider than the pen: rubbing out is a broad gesture.
      size: tool.erase ? tool.size * 4 : tool.size,
      points: [pos(e)],
    };
    cur.state.strokes.push(drawing);
    cur.state.redo = [];
    redraw();
  }
  function onMove(e) {
    if (!drawing) return;
    e.preventDefault();
    drawing.points.push(pos(e));
    redraw();
  }
  function onUp() { drawing = null; }

  function strokePath(s) {
    const p = s.points;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size;
    if (p.length === 1) {                          // a tap is a dot
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Curves through the midpoints, so a fast stroke is smooth, not jagged.
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2;
      const my = (p[i][1] + p[i + 1][1]) / 2;
      ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
    }
    const end = p[p.length - 1];
    ctx.lineTo(end[0], end[1]);
    ctx.stroke();
  }

  function redraw() {
    if (!ctx) return;
    // A real white background, not transparency: the picture is read by a
    // model and opened by a teacher, and both expect paper.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    cur.state.strokes.forEach(strokePath);
  }

  /* ------------------------------ sending ------------------------------- */

  function snapshot() {
    let url = canvas.toDataURL('image/png');
    if (url.length > MAX_PNG) url = canvas.toDataURL('image/jpeg', 0.8);
    return url;
  }

  async function send() {
    if (!cur) return;
    const hasInk = cur.state.strokes.some((s) => s.color !== '#ffffff');
    if (!hasInk) { toast(t('wb.empty'), 'bad'); return; }

    const btn = document.getElementById('wbSend');
    if (btn) { btn.disabled = true; btn.textContent = t('wb.sending'); }
    const { key, opts } = cur;
    try {
      const body = {
        ...opts.payload,
        image: snapshot(),
        answer: opts.getAnswer ? String(opts.getAnswer() || '') : '',
        lang: getLang(),
      };
      const r = await API.post('/api/work/whiteboard', body);
      sent.add(key);
      paintDock();
      toast(t('wb.sent'), 'good');
      // Kru CJ reads it for the teacher. Not awaited: the student is done the
      // moment the board is saved, and the teacher can re-run this later.
      if (r.needsAnalysis) {
        API.post(`/api/work/whiteboard/${encodeURIComponent(r.id)}/analyze`, { lang: getLang() }).catch(() => {});
      }
      if (typeof opts.onSent === 'function') opts.onSent(r);
      close();
    } catch (e) {
      const MSG = { BOARD_TOO_BIG: 'wb.tooBig', NO_WHITEBOARD: 'wb.off', BAD_IMAGE: 'wb.tooBig' };
      toast(MSG[e.message] ? t(MSG[e.message]) : e.message, 'bad');
      if (btn) { btn.disabled = false; btn.textContent = sent.has(key) ? t('wb.resend') : t('wb.send'); }
    }
  }

  /** Mark a key as already sent (e.g. the server says so on page load). */
  function markSent(key) { sent.add(key); paintDock(); }

  /* ------------------------------- the dock ------------------------------ *
   * ONE whiteboard button, fixed at the bottom-left of the screen, instead of a
   * button under every question. The page tells it which question it is for
   * right now — `dock({ key, label, open })` — or hides it with `dock(null)`:
   * the lesson player when it changes question, the challenge player as the
   * student scrolls from one question to the next. Bottom-LEFT because the
   * bottom-right already holds Kru CJ (the quiz mascot and the tutor panel).  */

  let docked = null;

  function dock(target) {
    docked = target || null;
    paintDock();
  }

  function paintDock() {
    let el = document.getElementById('wbDock');
    if (!docked) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.id = 'wbDock';
      el.className = 'wb-dock';
      el.addEventListener('click', () => { if (docked && docked.open) docked.open(); });
      document.body.appendChild(el);
    }
    const done = sent.has(docked.key);
    el.hidden = false;
    el.classList.toggle('is-sent', done);
    el.dataset.wbKey = docked.key;
    el.innerHTML = `${ICON.board(20)}<span class="wb-dock-text"><b>${esc(done ? t('wb.openSent') : t('wb.open'))}</b>`
      + `${docked.label ? `<small>${esc(docked.label)}</small>` : ''}</span>`;
    el.setAttribute('aria-label', t('wb.open') + (docked.label ? ' — ' + docked.label : ''));
  }

  return { open, close, setTool, setColor, setSize, undo, clearBoard, send, markSent, dock };
})();
