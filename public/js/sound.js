/* Game sound — effects and background music for the student pages.
 *
 * EVERYTHING IS SYNTHESISED with the Web Audio API: there are no audio files,
 * so nothing to download, host, license or keep in sync. Each effect is a few
 * oscillators and a noise burst; each music track is a small step sequencer
 * (pad, arpeggio, bass, light drums) that plays a four-chord loop.
 *
 * WHEN IT PLAYS
 * Browsers only allow sound after the person has interacted with the page,
 * so nothing plays until the first tap, click or key press on each page. The
 * music then starts and loops. Lessons and challenges get NO music (they are
 * for thinking), the battle arena gets a faster track, everything else the
 * calm lobby track. Music pauses while the tab is hidden.
 *
 * WHAT TRIGGERS EFFECTS
 * - Any button or link press (a click), hovering the game's big controls
 *   (a soft tick) — wired here, globally, so page scripts did not change.
 * - toast(): good / bad / plain notices, and confetti(): a fanfare — both
 *   wrapped here, so every existing call site already makes a sound.
 * - A handful of explicit calls in page scripts: sfx('correct'),
 *   sfx('wrong'), sfx('coin'), sfx('badge'), sfx('lose'), sfx('tick').
 *   They are written as `window.sfx && sfx(...)`, so a page without this file
 *   simply stays silent.
 *
 * SETTINGS
 * Stored per browser in localStorage under `cq_sound`:
 *   { sfx: true, music: true, volume: 0.6 }
 * A speaker button in the top bar (or the phone's More sheet) mutes and
 * unmutes everything; Settings has a card with each switch and a volume
 * slider. A failing or missing AudioContext just means silence — never an
 * error on the page.
 *
 * Load order: after i18n.js and api.js (it wraps toast/confetti and uses t()).
 */

const SFX = (() => {
  const KEY = 'cq_sound';
  const DEFAULTS = { sfx: true, music: true, volume: 0.6 };

  let prefs = load();
  let ctx = null;
  let master = null, fxBus = null, musicBus = null;
  let noiseBuf = null;
  let unlocked = false;
  let lastBig = 0;        // when the last "event" sound played, so notices do not pile on top
  let lastHover = 0;

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode: keep it for this page */ }
  }

  /* ---------- the audio graph ---------- */
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
      master = ctx.createGain();
      master.gain.value = prefs.volume;
      // a gentle limiter so stacked effects never clip
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      fxBus = ctx.createGain(); fxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    return ctx;
  }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /** One enveloped oscillator note. */
  function tone(freq, o = {}) {
    const t0 = (o.at != null ? o.at : ctx.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const peak = o.gain || 0.2;
    const atk = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = g;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lowpass; f.Q.value = o.q || 0.7;
      g.connect(f); out = f;
    }
    osc.connect(g);
    out.connect(o.bus || fxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A filtered noise burst — whooshes, hats, shimmer. */
  function noise(o = {}) {
    const t0 = (o.at != null ? o.at : ctx.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.12;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 2000, t0);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.1, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(o.bus || fxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  /* ---------- the effects ---------- */
  const BIG = new Set(['correct', 'wrong', 'celebrate', 'badge', 'coin', 'lose', 'win']);

  const FX = {
    click() { tone(1320, { type: 'square', dur: 0.045, gain: 0.05, slide: 880, lowpass: 3200 }); },
    hover() { tone(2400, { type: 'sine', dur: 0.03, gain: 0.025 }); },
    nav() { noise({ freq: 600, sweep: 4200, dur: 0.22, gain: 0.06, q: 0.8 }); tone(520, { type: 'triangle', dur: 0.16, gain: 0.05, slide: 1040 }); },
    tick() { tone(1050, { type: 'sine', dur: 0.05, gain: 0.12 }); tone(2100, { type: 'sine', dur: 0.02, gain: 0.04 }); },
    notify() { tone(midi(84), { type: 'sine', dur: 0.18, gain: 0.08 }); tone(midi(91), { type: 'sine', dur: 0.22, gain: 0.05, delay: 0.06 }); },
    success() {
      [72, 76, 79].forEach((n, i) => tone(midi(n), { type: 'triangle', dur: 0.2, gain: 0.1, delay: i * 0.06 }));
    },
    error() {
      tone(midi(58), { type: 'square', dur: 0.12, gain: 0.07, lowpass: 1600 });
      tone(midi(53), { type: 'square', dur: 0.2, gain: 0.07, lowpass: 1400, delay: 0.1 });
    },
    correct() {
      [76, 83, 88].forEach((n, i) => tone(midi(n), { type: 'triangle', dur: 0.24, gain: 0.13, delay: i * 0.07 }));
      noise({ filter: 'highpass', freq: 6000, dur: 0.25, gain: 0.03, delay: 0.12 });
    },
    wrong() {
      tone(180, { type: 'sawtooth', dur: 0.28, gain: 0.11, slide: 95, lowpass: 900 });
      tone(186, { type: 'sawtooth', dur: 0.28, gain: 0.07, slide: 98, lowpass: 900 });
    },
    coin() {
      tone(midi(83), { type: 'square', dur: 0.08, gain: 0.07, lowpass: 5000 });
      tone(midi(88), { type: 'square', dur: 0.32, gain: 0.07, lowpass: 5000, delay: 0.07 });
    },
    lose() {
      [67, 63, 60, 55].forEach((n, i) => tone(midi(n), { type: 'triangle', dur: 0.26, gain: 0.1, delay: i * 0.16 }));
    },
    celebrate() {
      const seq = [60, 64, 67, 72];
      seq.forEach((n, i) => tone(midi(n), { type: 'square', dur: 0.14, gain: 0.07, lowpass: 3500, delay: i * 0.09 }));
      [72, 76, 79, 84].forEach((n) => tone(midi(n), { type: 'triangle', dur: 0.9, gain: 0.07, delay: 0.38, attack: 0.02 }));
      noise({ filter: 'highpass', freq: 5000, dur: 0.9, gain: 0.035, delay: 0.38, attack: 0.05 });
    },
    badge() {
      for (let i = 0; i < 8; i++) tone(midi(84 + i * 2), { type: 'sine', dur: 0.12, gain: 0.05, delay: i * 0.035 });
      [64, 67, 71, 76].forEach((n) => tone(midi(n), { type: 'sawtooth', dur: 1.2, gain: 0.03, delay: 0.3, attack: 0.05, lowpass: 2400 }));
      tone(midi(88), { type: 'triangle', dur: 1.1, gain: 0.08, delay: 0.3 });
    },
  };

  function play(name) {
    if (!prefs.sfx || !FX[name] || !unlocked) return;
    if (!ensure()) return;
    if (BIG.has(name)) lastBig = performance.now();
    try { FX[name](); } catch { /* a sound must never break the page */ }
  }

  /** Notices wait a moment: if an event sound fires alongside, the notice stays quiet. */
  function playNotice(name) {
    setTimeout(() => { if (performance.now() - lastBig > 450) play(name); }, 40);
  }

  /* ---------- music ---------- */
  // Chords as MIDI note numbers. Lobby: Am F C G. Battle: Em C D B.
  const TRACKS = {
    lobby: { bpm: 96, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], arp: [0, 1, 2, 1, 2, 1, 0, 2], rate: 2, drums: false },
    battle: { bpm: 132, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], arp: [0, 2, 1, 2, 0, 2, 1, 2], rate: 1, drums: true },
  };
  let track = null, timer = null, step = 0, nextAt = 0;

  function pageTrack() {
    const b = document.body.dataset;
    if (b.navFlow) return null;                  // lessons and challenges: no music
    if (b.page === 'battle') return 'battle';
    return 'lobby';
  }

  function schedule() {
    const tr = TRACKS[track];
    const sixteenth = 60 / tr.bpm / 4;
    while (nextAt < ctx.currentTime + 0.12) {
      const bar = Math.floor(step / 16) % tr.chords.length;
      const s = step % 16;
      const ch = tr.chords[bar];
      const at = nextAt;
      const bus = musicBus;
      if (s === 0) {   // pad: the whole bar
        ch.forEach((n) => tone(midi(n), { at, type: 'sawtooth', dur: sixteenth * 16, gain: 0.022, attack: 0.35, lowpass: 900, detune: 6, bus }));
      }
      if (s % tr.rate === 0) {   // arpeggio
        const n = ch[tr.arp[(s / tr.rate) % tr.arp.length]] + 12;
        tone(midi(n), { at, type: 'triangle', dur: sixteenth * 1.8, gain: 0.05, bus });
      }
      if (tr.drums) {
        if (s % 2 === 0) tone(midi(ch[0] - 24), { at, type: 'square', dur: sixteenth * 0.9, gain: 0.05, lowpass: 600, bus });
        if (s % 4 === 0) tone(130, { at, type: 'sine', dur: 0.16, gain: 0.22, slide: 45, bus });
        if (s % 4 === 2) noise({ at, filter: 'highpass', freq: 7000, dur: 0.04, gain: 0.03, bus });
      } else {
        if (s === 0 || s === 8) tone(midi(ch[0] - 12), { at, type: 'sine', dur: sixteenth * 7, gain: 0.12, bus });
        if (s === 4 || s === 12) noise({ at, filter: 'highpass', freq: 8000, dur: 0.035, gain: 0.018, bus });
      }
      nextAt += sixteenth;
      step++;
    }
  }

  function startMusic() {
    if (!prefs.music || !unlocked || timer) return;
    track = pageTrack();
    if (!track || !ensure()) return;
    step = 0;
    nextAt = ctx.currentTime + 0.08;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);    // fade in
    timer = setInterval(() => { try { schedule(); } catch { stopMusic(); } }, 30);
  }

  function stopMusic() {
    if (timer) { clearInterval(timer); timer = null; }
    if (ctx && musicBus) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
      musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    }
  }

  /* ---------- preferences ---------- */
  function set(partial) {
    prefs = { ...prefs, ...partial };
    prefs.volume = Math.max(0, Math.min(1, Number(prefs.volume)));
    save();
    if (master && ctx) master.gain.setTargetAtTime(prefs.volume, ctx.currentTime, 0.05);
    if (prefs.music) startMusic(); else stopMusic();
    paintToggles();
  }
  const muted = () => !prefs.sfx && !prefs.music;
  function toggleAll() {
    if (muted()) set({ sfx: true, music: true });
    else set({ sfx: false, music: false });
    if (!muted()) play('success');
  }

  /* ---------- unlock on first interaction ---------- */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensure();
    startMusic();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, unlock, { capture: true, passive: true }));

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (unlocked) ctx.resume().catch(() => {});
  });

  /* ---------- clicks and hovers, everywhere ---------- */
  const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], label.switch, summary';
  const HOVERABLE = '.btn, .nav-link, .lm-item, .node, .hub-node, .badge, .lb-row, .b-opp, .b-diff, .q-card, .ch-card, .dock-link, .board-tabs button';

  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest(PRESSABLE);
    if (!el || el.disabled || el.closest('[data-sfx="none"]')) return;
    // answer buttons speak for themselves (right / wrong), so no click under them
    if (el.matches('.choice, .ch-choice')) return;
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    const leaving = href && !href.startsWith('#') && !el.target && !href.startsWith('javascript');
    play(leaving ? 'nav' : 'click');
  }, true);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest(HOVERABLE);
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
    play('hover');
  });

  /* ---------- the existing notice and celebration helpers ---------- */
  if (typeof window.toast === 'function') {
    const plainToast = window.toast;
    window.toast = function (message, kind) {
      playNotice(kind === 'good' ? 'success' : kind === 'bad' ? 'error' : 'notify');
      return plainToast.apply(this, arguments);
    };
  }
  if (typeof window.confetti === 'function') {
    const plainConfetti = window.confetti;
    window.confetti = function () {
      play('celebrate');
      return plainConfetti.apply(this, arguments);
    };
  }

  /* ---------- the speaker button ---------- */
  const ICON_ON = '<svg class="ic" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const ICON_OFF = '<svg class="ic" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

  function toggleMarkup(cls) {
    const off = muted();
    return `<button type="button" class="${cls}" data-snd-toggle aria-pressed="${!off}"
              title="${escapeHtml(t(off ? 'snd.turnOn' : 'snd.turnOff'))}"
              aria-label="${escapeHtml(t(off ? 'snd.turnOn' : 'snd.turnOff'))}">${off ? ICON_OFF : ICON_ON}</button>`;
  }
  function paintToggles() {
    document.querySelectorAll('[data-snd-toggle]').forEach((b) => {
      const off = muted();
      b.innerHTML = off ? ICON_OFF : ICON_ON;
      b.setAttribute('aria-pressed', String(!off));
      b.title = t(off ? 'snd.turnOn' : 'snd.turnOff');
      b.setAttribute('aria-label', b.title);
    });
    const card = document.getElementById('sndCardBody');
    if (card) fillCard(card);
  }

  function mountToggles() {
    const acct = document.querySelector('.topbar .nav-account');
    if (acct && !acct.querySelector('[data-snd-toggle]')) acct.insertAdjacentHTML('afterbegin', toggleMarkup('nav-snd'));
    const sheet = document.querySelector('.more-sheet .sheet-lang');
    if (sheet && !document.querySelector('.more-sheet [data-snd-toggle]')) {
      sheet.insertAdjacentHTML('beforebegin', `<div class="sheet-lang sheet-snd"><span>${escapeHtml(t('snd.title'))}</span>${toggleMarkup('sheet-snd-btn')}</div>`);
    }
    // a page with no top bar (the login page) gets a small floating button
    if (!document.querySelector('.topbar') && !document.querySelector('.snd-fab')) {
      document.body.insertAdjacentHTML('beforeend', toggleMarkup('snd-fab'));
    }
    document.querySelectorAll('[data-snd-toggle]').forEach((b) => {
      if (b.dataset.wired) return;
      b.dataset.wired = '1';
      b.addEventListener('click', (e) => { e.stopPropagation(); unlock(); toggleAll(); });
    });
  }

  /* ---------- the Settings card ---------- */
  function fillCard(body) {
    body.innerHTML = `
      <label class="snd-row"><span>${escapeHtml(t('snd.sfx'))}</span>
        <input type="checkbox" class="snd-switch" id="sndFx" ${prefs.sfx ? 'checked' : ''}></label>
      <label class="snd-row"><span>${escapeHtml(t('snd.music'))}</span>
        <input type="checkbox" class="snd-switch" id="sndMusic" ${prefs.music ? 'checked' : ''}></label>
      <label class="snd-row snd-vol"><span>${escapeHtml(t('snd.volume'))}</span>
        <input type="range" id="sndVol" min="0" max="100" step="5" value="${Math.round(prefs.volume * 100)}"
               aria-valuetext="${Math.round(prefs.volume * 100)}%"></label>
      <div class="set-actions"><button type="button" class="btn secondary" id="sndTest">${escapeHtml(t('snd.test'))}</button></div>`;
    body.querySelector('#sndFx').onchange = (e) => { unlock(); set({ sfx: e.target.checked }); };
    body.querySelector('#sndMusic').onchange = (e) => { unlock(); set({ music: e.target.checked }); };
    const vol = body.querySelector('#sndVol');
    vol.oninput = () => { vol.setAttribute('aria-valuetext', vol.value + '%'); prefs.volume = vol.value / 100;
      if (master && ctx) master.gain.setTargetAtTime(prefs.volume, ctx.currentTime, 0.05); };
    vol.onchange = () => { set({ volume: vol.value / 100 }); play('coin'); };
    body.querySelector('#sndTest').onclick = (e) => { e.stopPropagation(); unlock(); play('correct'); setTimeout(() => play('badge'), 450); };
  }

  /** Settings calls this with an empty <section>; the card fills itself. */
  function mountSettings(section) {
    if (!section) return;
    section.innerHTML = `
      <h2 class="set-h">${ICON_ON} <span>${escapeHtml(t('snd.title'))}</span></h2>
      <p class="set-note">${escapeHtml(t('snd.note'))}</p>
      <div id="sndCardBody"></div>`;
    fillCard(section.querySelector('#sndCardBody'));
  }

  /* ---------- a few styles, kept with the module ---------- */
  const css = document.createElement('style');
  css.textContent = `
    .nav-snd { display: inline-grid; place-items: center; width: 38px; height: 38px; border: none; cursor: pointer;
      border-radius: 999px; background: none; color: var(--ink-soft); }
    .nav-snd:hover { background: #fff; color: var(--ink); }
    .topbar .nav-snd[aria-pressed="true"] { color: var(--secondary-dark); }
    .sheet-snd-btn { display: inline-grid; place-items: center; width: 44px; height: 44px; border: none; border-radius: 50%;
      background: #f1eef9; color: var(--ink); cursor: pointer; }
    .snd-fab { position: fixed; left: 14px; bottom: 14px; z-index: 50; width: 44px; height: 44px; border: none; border-radius: 50%;
      display: grid; place-items: center; cursor: pointer; background: rgba(255,255,255,.9); color: var(--ink);
      box-shadow: 0 6px 18px rgba(40,30,80,.2); }
    .snd-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 12px 0; font-weight: 700; color: var(--ink); }
    .snd-switch { appearance: none; -webkit-appearance: none; width: 48px; height: 28px; padding: 0; flex: none; border: none;
      border-radius: 999px; background: #d8d2ec; position: relative; cursor: pointer; transition: background .15s; }
    .snd-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
      background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.2); transition: transform .15s; }
    .snd-switch:checked { background: var(--grass-dark); }
    .snd-switch:checked::after { transform: translateX(20px); }
    .snd-switch:focus-visible { outline: 3px solid var(--secondary-dark); outline-offset: 2px; box-shadow: none; }
    .snd-vol input[type=range] { width: 60%; padding: 0; border: none; background: none; accent-color: var(--brand-pink, #ec2a6b); }
  `;
  document.head.appendChild(css);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToggles);
  else mountToggles();

  /** For checking in the browser console: is audio running, and which track? */
  function status() {
    return { unlocked, context: ctx ? ctx.state : 'none', music: !!timer, track, prefs: { ...prefs } };
  }

  return { play, set, prefs: () => ({ ...prefs }), mountSettings, startMusic, stopMusic, status };
})();

/** Play one effect by name. Page scripts call it as `window.sfx && sfx('correct')`. */
function sfx(name) { SFX.play(name); }
