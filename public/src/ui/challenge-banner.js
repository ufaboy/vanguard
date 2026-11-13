import { parseBattleShareChallenge } from '../sim/achievements.js';

const RIVETS_HTML = `<span class="btn-rivet top-left" aria-hidden="true"></span><span class="btn-rivet top-right" aria-hidden="true"></span><span class="btn-rivet bottom-left" aria-hidden="true"></span><span class="btn-rivet bottom-right" aria-hidden="true"></span>`;
const ICON_TANK = `<svg viewBox="0 0 48 22" fill="currentColor" aria-hidden="true"><path d="M18 4h11l2 4h14v2.5H31l1.5 3.5H13l3-6h2V4zm-8 10h28l4 4H6l4-4zm2 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`;
const ICON_CHEVRONS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

function renderAchievementsList(achievements) {
  if (!achievements || achievements.length === 0) {
    return `
      <div class="challenge-ach-section">
        <div class="challenge-ach-heading">CHALLENGER MEDALS</div>
        <p class="challenge-ach-desc">No medals were earned on this sortie — beat their benchmark and claim your own commendations!</p>
      </div>
    `;
  }

  const items = achievements
    .map((ach) => {
      const tone = ach.rarity === 'epic' ? 'is-epic' : ach.rarity === 'rare' ? 'is-rare' : '';
      return `
        <div class="challenge-ach-item ${tone}">
          <span class="challenge-ach-icon" aria-hidden="true">${ach.icon}</span>
          <div>
            <div class="challenge-ach-title">${ach.title}</div>
            <div class="challenge-ach-desc">${ach.description}</div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="challenge-ach-section">
      <div class="challenge-ach-heading">CHALLENGER MEDALS EARNED (${achievements.length})</div>
      <div class="challenge-ach-list">
        ${items}
      </div>
    </div>
  `;
}

/**
 * Renders a prominent armored challenge card overlay when a page is opened
 * from a shared battle report URL.
 */
export function renderChallengeBannerIfPresent({
  container,
  pageHint,
  onAccept,
}) {
  if (!container || typeof location === 'undefined') return null;
  const challenge = parseBattleShareChallenge(location.search, pageHint);
  if (!challenge) return null;

  const metricsHtml = (challenge.metrics || [])
    .map(
      (m) => `
      <div class="challenge-metric-tile">
        <span class="challenge-metric-label">${m.label}</span>
        <span class="challenge-metric-val is-${m.tone || 'amber'}">${m.value}</span>
      </div>
    `
    )
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'challenge-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', challenge.title);
  overlay.innerHTML = `
    <div class="challenge-card">
      ${RIVETS_HTML}
      <div class="challenge-header">
        <div>
          <div class="challenge-kicker">/// INCOMING BATTLE CHALLENGE</div>
          <h2 class="challenge-title">${challenge.title}</h2>
          <div class="challenge-sub">${challenge.subtitle || ''}</div>
        </div>
      </div>

      <div class="challenge-metrics">
        ${metricsHtml}
      </div>

      ${renderAchievementsList(challenge.achievements)}

      <div class="battle-modal-actions">
        <button type="button" data-action="accept-challenge" class="battle-btn-primary">
          ${RIVETS_HTML}${ICON_TANK}<span>${challenge.ctaLabel}</span>${ICON_CHEVRONS}
        </button>
        <button type="button" data-action="dismiss-challenge" class="battle-btn-secondary">
          ${RIVETS_HTML}<span>DISMISS</span>
        </button>
      </div>
    </div>
  `;

  function closeOverlay() {
    overlay.remove();
    window.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') closeOverlay();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="dismiss-challenge"]')) {
      closeOverlay();
    } else if (e.target.closest('[data-action="accept-challenge"]')) {
      onAccept?.(challenge);
    }
  });
  window.addEventListener('keydown', onKeyDown);

  document.body.appendChild(overlay);
  return challenge;
}
