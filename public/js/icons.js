/* The icon set.
 *
 * StoiVenture used emoji as icons (🗺️ ⚔️ 🏆 🎖️ 🤺 🪙 ⭐ 🔒 🏁). Emoji are drawn
 * by the OS, so the same button was a different picture on Windows, on an
 * Android phone and on the school's machines — and several of them render as
 * flat monochrome glyphs on Windows, which is where most of this class will
 * open it. These are drawn once and look identical everywhere.
 *
 * House style, so a new icon matches without a discussion: SOLID shapes in a
 * 24x24 box, no strokes, rounded corners, `currentColor`, and enough weight to
 * survive next to Rubik 700 and the thick keyline on the mascot art. Thin
 * outline icons would look borrowed from a different product.
 *
 *   ICON.map()            -> <svg> markup at 24px
 *   ICON.map(20)          -> at 20px
 *   ICON.map(20, 'foo')   -> with an extra class
 */

const ICON = (() => {
  const svg = (body, size, cls) =>
    `<svg class="ic${cls ? ' ' + cls : ''}" width="${size}" height="${size}"
          viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;

  const make = (body) => (size = 24, cls = '') => svg(body, size, cls);

  /* Brand colours for ICON.brand(). Token first so a future retheme has one
     place to change, literal second so the mark still renders standalone. */
  const PINK = 'var(--brand-pink, #ec2a6b)';
  const BLUE = 'var(--brand-blue, #1355d4)';
  /* With the orbit gone the flask alone occupies about two thirds of the box,
     which would hang it undersized next to the 24x24 icons it sits beside in
     the topbar. Grow it back to the same optical weight instead of leaving a
     ring of empty space where the orbit used to be. */
  const BRAND_FILL = 'translate(16 16.05) scale(1.146) translate(-16 -16.05)';
  const BRAND_ORBIT =
    '<ellipse cx="16" cy="19" rx="14.6" ry="5.6" transform="rotate(-24 16 19)" ' +
    `fill="none" stroke="${BLUE}" stroke-width="1.9" opacity=".5"/>`;

  return {
    /* A folded paper map. The alternating panel heights ARE the icon: with
       all three panels level it reads as three bars, which is what the first
       attempt did. */
    map: make('<path d="M2 6.6 8.3 4.3v13.1L2 19.7V6.6Z"/>' +
              '<path d="M9.7 4.3 14.3 6v13.1L9.7 17.4V4.3Z" opacity=".55"/>' +
              '<path d="M15.7 6 22 3.7v13.1l-6.3 2.3V6Z"/>' +
              '<circle cx="12" cy="10.4" r="2.5"/>'),

    /* A clipboard with a tick — a Daily Quest is a checklist, and a
       checklist reads at 19px where a scroll's curls do not. */
    quests: make('<path d="M9 1.6h6a1.6 1.6 0 0 1 1.6 1.6v1.3a1.6 1.6 0 0 1-1.6 1.6H9a1.6 1.6 0 0 1-1.6-1.6V3.2A1.6 1.6 0 0 1 9 1.6Z"/>' +
                 '<path d="M5.6 3.3h.6v1.2A2.9 2.9 0 0 0 9.1 7.4h5.8a2.9 2.9 0 0 0 2.9-2.9V3.3h.6A2.6 2.6 0 0 1 21 5.9v13.5a2.6 2.6 0 0 1-2.6 2.6H5.6A2.6 2.6 0 0 1 3 19.4V5.9a2.6 2.6 0 0 1 2.6-2.6Zm11.1 7.2a1.2 1.2 0 0 0-1.8-1.6l-3.7 4.2-1.6-1.7a1.2 1.2 0 1 0-1.7 1.7l2.5 2.6a1.2 1.2 0 0 0 1.8 0l4.5-5.2Z"/>'),

    /* Two crossed swords, drawn with real mass: a tapered blade, a solid
       cross-guard and a pommel. The first attempt was hairlines that
       collapsed into a plain X. */
    battle: make('<path d="M3.6 1.7 7 2.4l11.3 11.3-2.6 2.6L4.4 5 3.6 1.7Z"/>' +
                 '<path d="M20.4 1.7 19.6 5 8.3 16.3l2.6 2.6L22.2 7.6l.2-3.4-2-2.5Z" opacity=".6"/>' +
                 '<path d="M17.2 16.4a1.4 1.4 0 0 1 2 0l2.4 2.4a1.4 1.4 0 0 1-2 2l-2.4-2.4a1.4 1.4 0 0 1 0-2ZM19.9 12.6l3.1 3.1-1.7 1.7-3.1-3.1 1.7-1.7Z"/>' +
                 '<path d="M6.8 16.4a1.4 1.4 0 0 0-2 0l-2.4 2.4a1.4 1.4 0 0 0 2 2l2.4-2.4a1.4 1.4 0 0 0 0-2ZM4.1 12.6 1 15.7l1.7 1.7 3.1-3.1-1.7-1.7Z"/>'),

    /* an award rosette: disc plus two ribbon tails */
    certificates: make('<path d="M8.4 14.3 6.2 21a.7.7 0 0 0 1 .8l2.9-1.5 1.3 2.4a.7.7 0 0 0 1.2 0l1.3-2.4 2.9 1.5a.7.7 0 0 0 1-.8l-2.2-6.7H8.4Z" opacity=".55"/>' +
                       '<path d="M12 1.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3.1 1.4 2.6 2.9.5-2 2.1.4 2.9-2.7-1.3-2.7 1.3.4-2.9-2-2.1 2.9-.5L12 4.6Z"/>'),

    /* a podium — three columns, the middle one tallest */
    leaderboard: make('<path d="M2.8 13.5h4.9a.9.9 0 0 1 .9.9v6.7a.9.9 0 0 1-.9.9H2.8a.9.9 0 0 1-.9-.9v-6.7a.9.9 0 0 1 .9-.9Z" opacity=".55"/>' +
                      '<path d="M16.3 10.4h4.9a.9.9 0 0 1 .9.9v9.8a.9.9 0 0 1-.9.9h-4.9a.9.9 0 0 1-.9-.9v-9.8a.9.9 0 0 1 .9-.9Z" opacity=".78"/>' +
                      '<path d="M9.6 5.3h4.9a.9.9 0 0 1 .9.9v14.9a.9.9 0 0 1-.9.9H9.6a.9.9 0 0 1-.9-.9V6.2a.9.9 0 0 1 .9-.9Z"/>'),

    /* a coin, seen slightly on edge */
    coin: make('<path d="M12 2.6c-5 0-9 2-9 4.5S7 11.6 12 11.6s9-2 9-4.5-4-4.5-9-4.5Z"/>' +
               '<path d="M21 10.2c-1.7 1.6-5 2.6-9 2.6s-7.3-1-9-2.6v3.1c0 2.5 4 4.5 9 4.5s9-2 9-4.5v-3.1Z" opacity=".62"/>' +
               '<path d="M21 16.3c-1.7 1.6-5 2.6-9 2.6s-7.3-1-9-2.6V18c0 2.5 4 4.5 9 4.5s9-2 9-4.5v-1.7Z" opacity=".38"/>'),

    /* points */
    star: make('<path d="m12 1.9 3 6.1 6.7 1-4.8 4.7 1.1 6.7-6-3.2-6 3.2 1.1-6.7L2.3 9l6.7-1 3-6.1Z"/>'),

    /* a door with an arrow leaving it */
    logout: make('<path d="M4 3.4h7.6a1 1 0 0 1 0 2H5.4v13.2h6.2a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z"/>' +
                 '<path d="m16.7 7.3 4.1 4a1 1 0 0 1 0 1.4l-4.1 4a1 1 0 0 1-1.4-1.4l2.3-2.3H9.8a1 1 0 0 1 0-2h7.8l-2.3-2.3a1 1 0 0 1 1.4-1.4Z"/>'),

    /* padlock, shackle closed */
    lock: make('<path d="M12 1.6a5 5 0 0 0-5 5V9h2.4V6.6a2.6 2.6 0 0 1 5.2 0V9H17V6.6a5 5 0 0 0-5-5Z"/>' +
               '<path d="M6.4 9.6h11.2a1.6 1.6 0 0 1 1.6 1.6v9.2a1.6 1.6 0 0 1-1.6 1.6H6.4a1.6 1.6 0 0 1-1.6-1.6v-9.2A1.6 1.6 0 0 1 6.4 9.6Zm5.6 3.6a1.9 1.9 0 0 0-1 3.5v1.8a1 1 0 0 0 2 0v-1.8a1.9 1.9 0 0 0-1-3.5Z"/>'),

    /* a tick */
    check: make('<path d="M20.3 5.3a1.5 1.5 0 0 1 .1 2.1l-9.4 10.3a1.5 1.5 0 0 1-2.2 0l-4.7-5a1.5 1.5 0 1 1 2.2-2l3.6 3.9 8.3-9.2a1.5 1.5 0 0 1 2.1-.1Z"/>'),

    /* calendar, for a level that opens at a set time */
    calendar: make('<path d="M7.5 1.8a1 1 0 0 1 1 1v1.1h7V2.8a1 1 0 1 1 2 0v1.1h1.1A2.4 2.4 0 0 1 21 6.3v13A2.4 2.4 0 0 1 18.6 21H5.4A2.4 2.4 0 0 1 3 19.3v-13a2.4 2.4 0 0 1 2.4-2.4h1.1V2.8a1 1 0 0 1 1-1ZM5 9.4v9.9h14V9.4H5Z"/>' +
                   '<path d="M7.6 11.6h3v3h-3v-3Zm5.8 0h3v3h-3v-3Z"/>'),

    /* a checkered finish flag */
    flag: make('<path d="M4.4 1.6a1.2 1.2 0 0 1 1.2 1.2v18.4a1.2 1.2 0 0 1-2.4 0V2.8a1.2 1.2 0 0 1 1.2-1.2Z"/>' +
               '<path d="M7 3.1h13.4a.8.8 0 0 1 .7 1.2l-2.2 4 2.2 4a.8.8 0 0 1-.7 1.2H7V3.1Z"/>'),

    /* ---- the teacher console's own vocabulary ---- */

/* An open book with a visible spine — Lessons & Levels. Two even panels
       read as the folded map icon, which is the student's. */
    book: make('<path d="M2.4 4.9c2.9-1.4 5.7-1.8 8.4-1.1v14.9c-2.7-.7-5.5-.3-8.4 1.1a1 1 0 0 1-1.4-.9V5.8a1 1 0 0 1 1.4-.9Z"/>' +
               '<path d="M21.6 4.9c-2.9-1.4-5.7-1.8-8.4-1.1v14.9c2.7-.7 5.5-.3 8.4 1.1a1 1 0 0 0 1.4-.9V5.8a1 1 0 0 0-1.4-.9Z" opacity=".5"/>' +
               '<path d="M11.1 3.4h1.8v15.9h-1.8z" opacity=".85"/>'),

/* One clean jigsaw piece — Challenges. Two overlapping pieces at different
       opacities turned to mush at 20px. */
    puzzle: make('<path d="M3.4 8.1h2.9a2.2 2.2 0 0 0 2-3.2 2.5 2.5 0 0 1 2.3-3.5 2.5 2.5 0 0 1 2.3 3.5 2.2 2.2 0 0 0 2 3.2h2.9a1.8 1.8 0 0 1 1.8 1.8v2.7a2.2 2.2 0 0 0-3.2 2 2.5 2.5 0 0 0 3.2 2v2.7a1.8 1.8 0 0 1-1.8 1.8h-2.7a2.2 2.2 0 0 1 2-3.2 2.5 2.5 0 0 0-3.5-2.3 2.5 2.5 0 0 0-2.3 3.5 2.2 2.2 0 0 1 2 2H5.2a1.8 1.8 0 0 1-1.8-1.8V9.9a1.8 1.8 0 0 1 1.8-1.8Z" transform="translate(0.6 0)"/>'),

    /* a fountain pen — Writing Grading */
    pen: make('<path d="M17.4 1.9a2.4 2.4 0 0 1 3.4 0l1.3 1.3a2.4 2.4 0 0 1 0 3.4l-1.9 1.9-4.7-4.7 1.9-1.9Z"/>' +
              '<path d="m14.1 5.4 4.7 4.7-9.2 9.2-6.2 1.5 1.5-6.2 9.2-9.2Zm-8.4 10 2.9 2.9-3.9.9.9-3.8Z"/>'),

    /* a grid of scores — Gradebook */
    table: make('<path d="M4.6 2.8h14.8a2.6 2.6 0 0 1 2.6 2.6v13.2a2.6 2.6 0 0 1-2.6 2.6H4.6A2.6 2.6 0 0 1 2 18.6V5.4a2.6 2.6 0 0 1 2.6-2.6Zm-.2 6.4v3.2h5V9.2h-5Zm7 0v3.2h5.2V9.2h-5.2Zm7.2 0v3.2h1.6V9.2h-1.6Zm-14.2 5.2v3.2a.8.8 0 0 0 .8.8h4.2v-4h-5Zm7 0v4h5.2v-4h-5.2Zm7.2 0v4h.8a.8.8 0 0 0 .8-.8v-3.2h-1.6Z"/>'),

    /* two figures — Students */
    people: make('<circle cx="9" cy="7.1" r="4.3"/>' +
                 '<path d="M9 12.8c-4 0-7.2 2.3-7.2 5.2v1.7a1.4 1.4 0 0 0 1.4 1.4h11.6a1.4 1.4 0 0 0 1.4-1.4V18c0-2.9-3.2-5.2-7.2-5.2Z"/>' +
                 '<path d="M17.2 3.5a3.8 3.8 0 0 1 0 7.4 5.6 5.6 0 0 0 0-7.4Zm1 9.6c2.6.5 4.4 2.2 4.4 4.3v1.5a1.3 1.3 0 0 1-1.3 1.3h-3.1c.1-.3.2-.7.2-1.1V18c0-1.9-.8-3.6-2.1-4.9h1.9Z" opacity=".55"/>'),

    /* a play triangle in a rounded frame — Play as student */
    play: make('<path d="M5 2.6h14a2.8 2.8 0 0 1 2.8 2.8v13.2A2.8 2.8 0 0 1 19 21.4H5a2.8 2.8 0 0 1-2.8-2.8V5.4A2.8 2.8 0 0 1 5 2.6Zm4.6 4.9v9l7.4-4.5-7.4-4.5Z"/>'),

    /* ---- the small marks on a level row ---- */

    /* lines of dialogue */
    lines: make('<path d="M4 4.4h16a1.2 1.2 0 0 1 0 2.4H4a1.2 1.2 0 0 1 0-2.4Zm0 5.4h16a1.2 1.2 0 0 1 0 2.4H4a1.2 1.2 0 1 1 0-2.4Zm0 5.4h10.4a1.2 1.2 0 0 1 0 2.4H4a1.2 1.2 0 0 1 0-2.4Z"/>'),

    /* a video clip */
    video: make('<path d="M3.4 5.2h11.4a2.4 2.4 0 0 1 2.4 2.4v8.8a2.4 2.4 0 0 1-2.4 2.4H3.4A2.4 2.4 0 0 1 1 16.4V7.6a2.4 2.4 0 0 1 2.4-2.4Z"/>' +
                '<path d="m19.4 9.5 2.2-1.6a.9.9 0 0 1 1.4.8v6.6a.9.9 0 0 1-1.4.8l-2.2-1.6V9.5Z" opacity=".6"/>'),

    /* a quiz question */
    question: make('<path d="M12 1.8a10.2 10.2 0 1 0 0 20.4 10.2 10.2 0 0 0 0-20.4Zm.1 15.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm2.6-7.3c-.4.5-.9.9-1.4 1.2-.3.2-.4.4-.4.7v.4a1.2 1.2 0 0 1-2.4 0v-.6c0-1.1.5-1.9 1.4-2.5.5-.3.8-.6 1-.8a1.4 1.4 0 0 0-1-2.3 1.5 1.5 0 0 0-1.4 1 1.2 1.2 0 1 1-2.3-.7 3.9 3.9 0 0 1 7.6 1.1c0 .9-.4 1.7-1.1 2.5Z"/>'),

    /* a stopwatch */
    timer: make('<path d="M9.4 1.4h5.2a1.2 1.2 0 0 1 0 2.4h-1.4v1.5a8.6 8.6 0 1 1-2.4 0V3.8H9.4a1.2 1.2 0 1 1 0-2.4Zm2.6 7.2a1.1 1.1 0 0 0-1.1 1.1v4.2a1.1 1.1 0 0 0 .5 1l2.9 1.7a1.1 1.1 0 1 0 1.1-2l-2.3-1.3V9.7a1.1 1.1 0 0 0-1.1-1.1Z"/>'),

    /* an open padlock — the counterpart to lock */
    unlock: make('<path d="M12 1.6a5 5 0 0 0-5 5V9h2.4V6.6a2.6 2.6 0 0 1 5.2 0V9H17V6.6a5 5 0 0 0-5-5Z" opacity=".45"/>' +
                 '<path d="M4.4 9.6h11.2a1.6 1.6 0 0 1 1.6 1.6v9.2a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6v-9.2a1.6 1.6 0 0 1 1.6-1.6Zm5.6 3.6a1.9 1.9 0 0 0-1 3.5v1.8a1 1 0 0 0 2 0v-1.8a1.9 1.9 0 0 0-1-3.5Z"/>'),

    /* a pencil — edit */
    pencil: make('<path d="M16.8 2.1a2.6 2.6 0 0 1 3.7 0l1.4 1.4a2.6 2.6 0 0 1 0 3.7l-1.5 1.5-5.1-5.1 1.5-1.5Z"/>' +
                 '<path d="m13.6 4.9 5.1 5.1-9.4 9.4-6.6 1.5 1.5-6.6 9.4-9.4Z"/>'),

    /* a waste basket */
    trash: make('<path d="M9.4 1.8h5.2a2 2 0 0 1 2 2v.9h4a1.2 1.2 0 0 1 0 2.4H3.4a1.2 1.2 0 0 1 0-2.4h4v-.9a2 2 0 0 1 2-2Zm.4 2.9h4.4v-.5H9.8v.5Z"/>' +
                '<path d="M5.2 9.4h13.6l-.9 10.4a2.4 2.4 0 0 1-2.4 2.2H8.5a2.4 2.4 0 0 1-2.4-2.2L5.2 9.4Zm4.2 2.8a1 1 0 0 0-1 1v5.6a1 1 0 0 0 2 0v-5.6a1 1 0 0 0-1-1Zm5.2 0a1 1 0 0 0-1 1v5.6a1 1 0 0 0 2 0v-5.6a1 1 0 0 0-1-1Z"/>'),

    /* move up / move down */
    up: make('<path d="M12 3.2a1.4 1.4 0 0 1 1 .4l7 7a1.4 1.4 0 0 1-2 2l-4.6-4.6v11.8a1.4 1.4 0 0 1-2.8 0V8l-4.6 4.6a1.4 1.4 0 1 1-2-2l7-7a1.4 1.4 0 0 1 1-.4Z"/>'),
    down: make('<path d="M12 20.8a1.4 1.4 0 0 1-1-.4l-7-7a1.4 1.4 0 0 1 2-2L10.6 16V4.2a1.4 1.4 0 0 1 2.8 0V16l4.6-4.6a1.4 1.4 0 1 1 2 2l-7 7a1.4 1.4 0 0 1-1 .4Z"/>'),

    /* dismiss / remove one item from a list */
    close: make('<path d="M5.3 3.6a1.6 1.6 0 0 0-2.3 2.3l6.1 6.1-6.1 6.1a1.6 1.6 0 1 0 2.3 2.3l6.1-6.1 6.1 6.1a1.6 1.6 0 0 0 2.3-2.3L13.7 12l6.1-6.1a1.6 1.6 0 0 0-2.3-2.3L11.4 9.7 5.3 3.6Z"/>'),

    /* add something */
    plus: make('<path d="M12 2.6a1.5 1.5 0 0 1 1.5 1.5v6.4h6.4a1.5 1.5 0 0 1 0 3h-6.4v6.4a1.5 1.5 0 0 1-3 0v-6.4H4.1a1.5 1.5 0 0 1 0-3h6.4V4.1A1.5 1.5 0 0 1 12 2.6Z"/>'),

    /* a conical flask, monochrome — still used wherever a flask is just an
       icon (a lesson row, an empty state) rather than the logo. */
    flask: make('<path d="M9.3 1.9h5.4a1 1 0 0 1 0 2h-.5v5.4l5.5 9.2a2.4 2.4 0 0 1-2 3.6H6.3a2.4 2.4 0 0 1-2-3.6l5.5-9.2V3.9h-.5a1 1 0 1 1 0-2Zm.9 9.7-1.7 2.9h7l-1.7-2.9V3.9h-3.6v7.7Z"/>'),

    /* The StoiVenture mark: a flask of pink reagent inside an electron orbit.
       Three deliberate breaks from the house style above.

       It is two-colour and ignores `currentColor`. Every other icon here is
       tinted by whatever it sits next to; a logo is not allowed to be, and
       pink-in-blue IS the brand. The colours come from the --brand-* tokens
       with the hex inlined as a fallback, so the mark survives being dropped
       into a context that never loaded theme.css (the favicon, an og:image).

       The glass is an outline rather than a solid. A solid flask at topbar
       size reads as a blue blob with no chemistry in it — the empty neck and
       the liquid line are the whole silhouette.

       The orbit is dropped below 30px. A 1.9px ellipse crossing the flask
       that small collapses into grey fringing on the non-retina monitors in
       the school lab, and what is left is a smudge through the middle of the
       mark. The flask on its own is still unmistakably the same logo, so the
       small sizes simply do without. */
    brand: (size = 26, cls = '') => `<svg class="ic brand-mark${cls ? ' ' + cls : ''}"
        width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"
        aria-hidden="true" focusable="false">
        ${size >= 30 ? BRAND_ORBIT : ''}
        <g transform="${size >= 30 ? '' : BRAND_FILL}">
        <path fill="${PINK}" d="M11 19h10l3.3 5.8a1 1 0 0 1-.9 1.5H8.6a1 1 0 0 1-.9-1.5L11 19Z"/>
        <circle cx="16.9" cy="16.2" r="1.6" fill="${PINK}"/>
        <circle cx="13.7" cy="17.4" r="1" fill="${PINK}"/>
        <circle cx="16" cy="10.5" r=".9" fill="${PINK}"/>
        <path fill="${BLUE}" fill-rule="evenodd" d="M11.7 3.4h8.7a1.5 1.5 0 0 1 0 3h-.9v6.2l6.9 12.2a2.6 2.6 0 0 1-2.3 3.9H8a2.6 2.6 0 0 1-2.3-3.9l6.9-12.2V6.4h-.9a1.5 1.5 0 0 1 0-3Zm2.6 3v6.7l-6.6 11.7a1 1 0 0 0 .9 1.5h14.8a1 1 0 0 0 .9-1.5l-6.6-11.7V6.4h-3.4Z"/>
        </g>
      </svg>`,
  };
})();
