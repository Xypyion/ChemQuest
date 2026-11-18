/* Badges — how a passed level is drawn.
 *
 * A badge is what the app used to call a certificate: one per level, earned
 * the first time the student passes that level's pre-test. The stored record
 * is unchanged (user.certificates, GET /api/lessons/me/certificates); this
 * file only decides how it LOOKS, so every page draws the same emblem — the
 * badge shelf, the result screen, the profile and Settings.
 *
 * The tier comes from the score the badge was earned with:
 *   gold 90%+ · silver 75%+ · bronze below that (a pass is 60%).
 *
 * Needs api.js (escapeHtml) and icons.js (ICON) loaded first.
 */

function badgeTier(score) {
  const s = Number(score) || 0;
  return s >= 90 ? 'gold' : s >= 75 ? 'silver' : 'bronze';
}

/**
 * The emblem as markup.
 * @param {{icon?:string, level?:number, score?:number, title?:string}} b
 * @param {{size?:number, state?:'earned'|'open'|'locked', shine?:boolean}} [opts]
 */
function badgeEmblem(b, opts = {}) {
  const size = opts.size || 84;
  const state = opts.state || 'earned';
  const tier = state === 'earned' ? badgeTier(b.score) : state;
  const face = state === 'locked'
    ? ICON.lock(Math.round(size * 0.3))
    : b.icon ? `<span class="bdg-emoji">${escapeHtml(b.icon)}</span>` : ICON.flask(Math.round(size * 0.34));
  const label = state === 'earned'
    ? `${b.title || ''} — ${t('badge.tier.' + tier)}`
    : (b.title || '');
  return `<span class="bdg bdg-${tier}${opts.shine && state === 'earned' ? ' bdg-shine' : ''}"
                style="--bs:${size}px" role="img" aria-label="${escapeHtml(label)}">
            <span class="bdg-shield"><span class="bdg-core">${face}</span></span>
            ${b.level ? `<span class="bdg-lv">${escapeHtml(String(b.level))}</span>` : ''}
          </span>`;
}
