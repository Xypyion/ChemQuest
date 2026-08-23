/**
 * Chemistry keys — a way to actually TYPE H₂O.
 *
 * StoiVenture already renders formulas properly: `chem()` in api.js lowers the
 * digits when text is *displayed*. But an <input> shows raw characters, so a
 * student typing an answer sees "H2O", and the value that gets stored and
 * graded is whatever they typed. Neither a Thai phone keyboard nor a school
 * Windows keyboard offers ₂, so there was no way to produce one.
 *
 * This attaches a small key bar to any chemistry field, on both platforms:
 *
 *   • the subscript digits ₀–₉, inserted at the cursor,
 *   • an "H₂O" button that formats the whole field in one go — the fast path on
 *     a computer, where typing "Fe2(SO4)3" and pressing one key beats ten taps,
 *   • the symbols a stoichiometry course needs that no keyboard has: → ⇌ · and
 *     the ⁺ ⁻ of an ion charge.
 *
 * WHY THE VALUE, NOT JUST THE LOOK
 * The pad inserts real characters rather than styling the field, because the
 * text is submitted, stored and compared. `norm()` in src/challenges.js folds
 * ₂ back to 2 when marking, so a student who ignores this pad entirely and
 * types "H2O" is still marked correct — the pad is a convenience, never a
 * requirement.
 *
 * Load AFTER i18n.js and api.js (needs `t()` and `toSubscript()`).
 */
const ChemKey = (() => {
  /* Fields that hold chemistry. Listed here rather than sprinkled through five
     render sites, so there is one place to read and one place to extend.
     `[data-chem]` opts anything else in — used on the titles a teacher writes. */
  const FIELDS = [
    // student: challenge + quest players (js/qrender.js), the pre/post test,
    // and the tutor chat, where "how do I balance H2O" is the usual question
    '.ch-input', '.ch-cell', '.ch-area', '.written-input', '.tutor-input',
    // teacher: the question editors, shared by challenges, quests and battles
    '.q-text', '.q-choice-text', '.q-accepted', '.q-cell-text', '.q-cell-answer',
    '.q-explain', '.q-col', '.sb-text',
    '[data-chem]',
  ].join(',');

  const SUBS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  const SYMBOLS = ['→', '⇌', '·', '⁺', '⁻', '²⁻', '³⁺'];

  let bar = null;
  let field = null;   // the input the bar is currently serving

  /* ------------------------------ the bar ------------------------------ */

  function build() {
    bar = document.createElement('div');
    bar.className = 'chemkey';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('chem.keys'));
    bar.hidden = true;

    const keys = SUBS
      .map((c, i) => key(c, t('chem.subAria', { n: i }), 'chemkey-sub'))
      .concat(['<span class="chemkey-sep"></span>'])
      .concat(SYMBOLS.map((c) => key(c, c, '')))
      .join('');

    bar.innerHTML = `
      <div class="chemkey-scroll">${keys}</div>
      <button type="button" class="chemkey-auto" data-auto title="${escapeHtml(t('chem.autoTitle'))}">
        ${escapeHtml(t('chem.auto'))}
      </button>
      <button type="button" class="chemkey-close" data-close aria-label="${escapeHtml(t('chem.hide'))}">✕</button>`;

    // Pressing a key must not move focus, or the caret position is lost and the
    // character lands at the end. Cancelling the pointer-down keeps the field
    // focused and the selection intact.
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    bar.addEventListener('click', onKey);

    document.body.appendChild(bar);
  }

  const key = (ch, label, cls) =>
    `<button type="button" class="chemkey-key ${cls}" data-ch="${escapeHtml(ch)}"
      aria-label="${escapeHtml(label)}">${escapeHtml(ch)}</button>`;

  function onKey(e) {
    const btn = e.target.closest('button');
    if (!btn || !field) return;
    if (btn.dataset.close !== undefined) return hide();
    if (btn.dataset.auto !== undefined) return autoFormat();
    if (btn.dataset.ch) insert(btn.dataset.ch);
  }

  /* ---------------------------- editing text ---------------------------- */

  /**
   * Tell the page the value changed.
   * The teacher editors read `.value` back into their draft on every structural
   * change, and some fields have their own listeners — dispatching the event a
   * real keystroke would fire keeps all of that working.
   */
  function fire() {
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Insert at the caret, replacing any selection, and leave the caret after it. */
  function insert(ch) {
    const start = field.selectionStart;
    if (start == null) {           // a field that has no caret (shouldn't happen)
      field.value += ch;
      fire();
      return;
    }
    field.setRangeText(ch, start, field.selectionEnd, 'end');
    // Set the caret explicitly rather than trusting setRangeText's 'end': the
    // next tap has to land after the character just inserted, and ²⁻ is two of
    // them. Getting this wrong types formulas backwards.
    const caret = start + ch.length;
    fire();
    field.focus();
    field.setSelectionRange(caret, caret);
  }

  /**
   * Format every formula in the field: "Fe2(SO4)3" -> "Fe₂(SO₄)₃".
   * Uses the same element table as the display path, so "Level 2" and the
   * school's "M4" year groups are left alone.
   */
  function autoFormat() {
    const before = field.value;
    const after = toSubscript(before);
    if (after === before) {
      toast(t('chem.autoNothing'), '');
      field.focus();
      return;
    }
    // Replace through the undo stack where the browser supports it, so Ctrl+Z
    // still works; fall back to a plain assignment where it does not.
    field.select();
    if (!document.execCommand || !document.execCommand('insertText', false, after)) {
      field.value = after;
    }
    fire();
    field.focus();
    field.setSelectionRange(after.length, after.length);
  }

  /* ----------------------------- positioning ---------------------------- */

  /* Two placements, because the constraint is different on each platform.
     On a phone the on-screen keyboard covers the bottom of the window, so the
     bar rides just above it — visualViewport is what actually knows where the
     keyboard ends. On a computer there is no keyboard in the way, so the bar
     sits under the field it belongs to, where the eye already is. */
  const onPhone = () => window.matchMedia('(pointer: coarse)').matches;

  function place() {
    if (!field || bar.hidden) return;
    const vv = window.visualViewport;

    if (onPhone()) {
      bar.classList.add('docked');
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      bar.style.top = `${Math.round(bottom - bar.offsetHeight)}px`;
      bar.style.left = '0px';
      bar.style.width = '100%';
      return;
    }

    bar.classList.remove('docked');
    const r = field.getBoundingClientRect();
    const w = bar.offsetWidth;
    // keep it on screen when the field is near the right edge
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6;
    const fits = below + bar.offsetHeight < window.innerHeight - 8;
    bar.style.width = '';
    bar.style.left = `${Math.round(left)}px`;
    bar.style.top = `${Math.round(fits ? below : r.top - bar.offsetHeight - 6)}px`;
  }

  /* ------------------------------ show/hide ----------------------------- */

  function show(el) {
    if (!bar) build();
    field = el;
    bar.hidden = false;
    place();
    // On a phone the browser scrolls the focused field into view a beat later;
    // re-place once that has settled or the bar lands at the old position.
    setTimeout(place, 150);
  }

  function hide() {
    if (!bar || bar.hidden) return;
    bar.hidden = true;
    field = null;
  }

  /* ------------------------------- wiring ------------------------------- */

  function wire() {
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      // number, email and password fields never hold a formula
      if (el.matches && el.matches(FIELDS) && !el.matches('input[type=number],input[type=email],input[type=password]')) {
        show(el);
      } else if (!bar || !bar.contains(el)) {
        hide();
      }
    });

    // A field can also vanish under us: the teacher editors repaint their whole
    // pane on every structural change, which detaches the element we are serving.
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        if (field && !document.contains(field)) hide();
      }, 0);
    });

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', place);
      window.visualViewport.addEventListener('scroll', place);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  return { show, hide, insert, autoFormat, FIELDS };
})();
