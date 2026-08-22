/* The StoiVenture mascot.
 *
 * This file used to draw the character as inline SVG. It now renders Jerry's
 * hand-drawn artwork instead — a Thai student in school uniform, one PNG per
 * mood, cut from the sheets in Graphics/ and living in /assets/mascot/.
 *
 * The FUNCTION SIGNATURE IS UNCHANGED on purpose. Eight files call
 * renderRuby(mood, opts) and setRubyMood(el, mood, opts); swapping the
 * artwork behind the same two functions moves the whole app to the new
 * character without touching any of them.
 *
 *   renderRuby('cheer', { size: 160, float: true })
 *
 * opts.size        rendered HEIGHT in px (the art is portrait; width follows)
 * opts.float       gentle bob, respected by prefers-reduced-motion
 * opts.silhouette  flatten to a dark shape — used for a level you cannot open
 * opts.alt         accessible text; omit for decorative use (the default)
 * opts.className   extra classes on the wrapper
 *
 * ADDING A MOOD: cut the pose, save it as /assets/mascot/<name>.png at 440px
 * tall, and add one line to POSE. Nothing else needs to know.
 */

const MASCOT_DIR = '/assets/mascot/';

/* Every mood the app asks for, mapped to a pose. Callers use the five on the
   left; the rest are available to new code. */
const POSE = {
  wave: 'wave',          // greeting, both feet planted — the default
  happy: 'flask',        // pleased, holding a flask — on-theme, not a repeat of wave
  cheer: 'cheer',        // both arms up — something was just won
  sad: 'sad',            // wiping eyes — a wrong answer, an empty shelf
  thinking: 'think',     // finger to chin — considering, or locked

  excited: 'excited',    // mid-jump
  run: 'run',
  walk: 'walk',
  read: 'read',
  medal: 'medal',
  grade: 'grade',
  shrug: 'shrug',
  sleep: 'sleep',
  flask: 'flask',
};

/* Native pixel height of every pose, so the browser can reserve the box before
   the image arrives and the layout does not jump. Width comes from the art's
   own aspect ratio. */
const POSE_W = {
  wave: 352, flask: 349, cheer: 410, sad: 279, think: 281, excited: 267,
  run: 345, walk: 277, read: 307, medal: 391, grade: 378, shrug: 408, sleep: 460,
};
const POSE_H = { sleep: 380 };

/**
 * The mascot as markup. Returns a wrapper element sized in CSS pixels.
 * @returns {string} HTML
 */
function renderRuby(mood = 'happy', opts = {}) {
  const pose = POSE[mood] || POSE.happy;
  const size = Math.round(opts.size || 120);
  const nativeH = POSE_H[pose] || 440;
  const width = Math.round((POSE_W[pose] || 352) * (size / nativeH));

  const cls = ['ruby'];
  if (opts.float) cls.push('floaty');
  if (opts.silhouette) cls.push('is-locked');
  if (opts.className) cls.push(opts.className);

  /* Decorative by default: the mascot repeats the state the surrounding text
     already gives, so announcing her every time is noise. Pass opts.alt only
     where she carries meaning nothing else does. */
  const alt = opts.alt ? ` alt="${escapeHtml(opts.alt)}"` : ' alt="" aria-hidden="true"';

  return `<span class="${cls.join(' ')}" style="width:${width}px;height:${size}px">
    <img src="${MASCOT_DIR}${pose}.png" width="${width}" height="${size}"${alt}
         loading="lazy" decoding="async" draggable="false">
  </span>`;
}

/** Swap an already-rendered mascot to another mood in place. */
function setRubyMood(el, mood, opts) { if (el) el.innerHTML = renderRuby(mood, opts); }
