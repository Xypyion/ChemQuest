/* The icon set.
 *
 * ChemQuest used emoji as icons (🗺️ ⚔️ 🏆 🎖️ 🤺 🪙 ⭐ 🔒 🏁). Emoji are drawn
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

    /* the brand mark: a conical flask */
    flask: make('<path d="M9.3 1.9h5.4a1 1 0 0 1 0 2h-.5v5.4l5.5 9.2a2.4 2.4 0 0 1-2 3.6H6.3a2.4 2.4 0 0 1-2-3.6l5.5-9.2V3.9h-.5a1 1 0 1 1 0-2Zm.9 9.7-1.7 2.9h7l-1.7-2.9V3.9h-3.6v7.7Z"/>'),
  };
})();
