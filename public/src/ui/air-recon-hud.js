import { AIR_SUPPORT } from '../game/constants.js';
import { N_, formatNumber, t } from '../i18n/index.js';
import { getAirStrikeRequiredRank, isAirStrikeVariantUnlocked } from '../sim/medals.js';
import { setHtml } from './dom-helpers.js';

const STRIKE_SILHOUETTES = Object.freeze({
  STRIKE_BOMBS: `
    <svg viewBox="0 0 120 72" class="air-recon-svg" aria-hidden="true">
      <!-- Twin-engine tactical bomber -->
      <path d="M60 8 L66 22 L106 34 L106 40 L67 34 L65 48 L77 54 L77 58 L60 54 L43 58 L43 54 L55 48 L53 34 L14 40 L14 34 L54 22 Z" fill="currentColor" opacity="0.9"/>
      <rect x="40" y="24" width="5" height="12" rx="2" fill="currentColor"/>
      <rect x="75" y="24" width="5" height="12" rx="2" fill="currentColor"/>
      <!-- 3 falling bombs -->
      <path d="M46 58 L50 58 L51 64 L48 68 L45 64 Z" fill="#fbbf24"/>
      <path d="M58 58 L62 58 L63 64 L60 68 L57 64 Z" fill="#fbbf24"/>
      <path d="M70 58 L74 58 L75 64 L72 68 L69 64 Z" fill="#fbbf24"/>
    </svg>
  `,
  STRIKE_THERMO: `
    <svg viewBox="0 0 120 72" class="air-recon-svg" aria-hidden="true">
      <!-- Exhaust plume -->
      <path d="M16 50 L32 41 L28 35 Z" fill="#f97316" opacity="0.85"/>
      <path d="M22 46 L34 40 L31 37 Z" fill="#fde047"/>
      <!-- Cruise / thermobaric missile body angled up-right -->
      <g transform="rotate(-24 62 36)">
        <path d="M26 32 L86 32 L102 36 L86 40 L26 40 Z" fill="currentColor"/>
        <!-- Swept wings & tail fins -->
        <path d="M48 32 L40 18 L52 18 L62 32 Z" fill="currentColor" opacity="0.85"/>
        <path d="M48 40 L40 54 L52 54 L62 40 Z" fill="currentColor" opacity="0.85"/>
        <path d="M28 32 L22 23 L32 23 L37 32 Z" fill="currentColor" opacity="0.75"/>
        <path d="M28 40 L22 49 L32 49 L37 40 Z" fill="currentColor" opacity="0.75"/>
        <!-- Warhead band -->
        <rect x="76" y="32" width="5" height="8" fill="#f97316"/>
      </g>
    </svg>
  `,
  STRIKE_AC130: `
    <svg viewBox="0 0 120 72" class="air-recon-svg" aria-hidden="true">
      <!-- Side-firing cannon cone -->
      <path d="M54 41 L36 66 L66 66 Z" fill="#38bdf8" opacity="0.16"/>
      <line x1="53" y1="41" x2="43" y2="63" stroke="#38bdf8" stroke-width="1.6" stroke-dasharray="3 2"/>
      <line x1="59" y1="41" x2="55" y2="63" stroke="#38bdf8" stroke-width="1.6" stroke-dasharray="3 2"/>
      <!-- AC-130 4-prop gunship silhouette -->
      <path d="M16 34 L30 31 L34 15 L40 15 L44 30 L84 29 L104 34 L106 37 L96 40 L30 40 L16 37 Z" fill="currentColor"/>
      <!-- High wing & 4 turboprops -->
      <path d="M46 28 L82 28 L76 23 L52 23 Z" fill="currentColor" opacity="0.85"/>
      <rect x="44" y="34" width="3" height="8" fill="currentColor"/>
      <rect x="56" y="34" width="3" height="8" fill="currentColor"/>
      <rect x="68" y="34" width="3" height="8" fill="currentColor"/>
      <rect x="80" y="34" width="3" height="8" fill="currentColor"/>
      <!-- Side gun barrels -->
      <rect x="50" y="39" width="3" height="5" fill="#38bdf8"/>
      <rect x="58" y="39" width="3" height="5" fill="#38bdf8"/>
    </svg>
  `,
  STRIKE_MINES: `
    <svg viewBox="0 0 120 72" class="air-recon-svg" aria-hidden="true">
      <!-- Cargo/minelayer aircraft -->
      <path d="M60 7 L65 18 L98 26 L98 31 L65 27 L64 36 L74 41 L74 44 L60 41 L46 44 L46 41 L56 36 L55 27 L22 31 L22 26 L55 18 Z" fill="currentColor" opacity="0.88"/>
      <!-- Deployed air mine cluster -->
      <g fill="#f59e0b" stroke="#f59e0b" stroke-width="1.4">
        <circle cx="42" cy="54" r="4"/>
        <line x1="36" y1="54" x2="48" y2="54"/>
        <line x1="42" y1="48" x2="42" y2="60"/>
        <circle cx="60" cy="50" r="4"/>
        <line x1="54" y1="50" x2="66" y2="50"/>
        <line x1="60" y1="44" x2="60" y2="56"/>
        <circle cx="78" cy="54" r="4"/>
        <line x1="72" y1="54" x2="84" y2="54"/>
        <line x1="78" y1="48" x2="78" y2="60"/>
        <circle cx="51" cy="63" r="3.5"/>
        <circle cx="69" cy="63" r="3.5"/>
      </g>
    </svg>
  `,
  AIRDROP: `
    <svg viewBox="0 0 120 72" class="air-recon-svg" aria-hidden="true">
      <!-- Parachute canopy -->
      <path d="M32 28 C34 10, 86 10, 88 28 Z" fill="currentColor" opacity="0.9"/>
      <path d="M46 28 C48 14, 72 14, 74 28" fill="none" stroke="#0b0f17" stroke-width="1.5" opacity="0.45"/>
      <!-- Suspension lines -->
      <line x1="34" y1="28" x2="48" y2="46" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
      <line x1="60" y1="28" x2="60" y2="46" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
      <line x1="86" y1="28" x2="72" y2="46" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
      <!-- Supply crate -->
      <rect x="44" y="46" width="32" height="20" rx="2" fill="#34d399" opacity="0.22" stroke="#34d399" stroke-width="2"/>
      <path d="M57 51 h6 v3 h3 v4 h-3 v3 h-6 v-3 h-3 v-4 h3 Z" fill="#34d399"/>
    </svg>
  `,
});

export function renderAirReconHud(container, hud) {
  if (!container) return;
  const targeting = hud?.airSupportTargeting;
  if (!targeting) {
    container.__airReconKey = '';
    return;
  }

  const credits = hud.credits ?? 0;
  const profileMode = hud.profileMode || 'campaign';
  const playerRankId = hud.playerRankId || 'recruit';
  const renderKey = `${targeting.type}|${targeting.strikeVariant}|${credits}|${profileMode}|${playerRankId}`;
  if (container.__airReconKey === renderKey) return;
  container.__airReconKey = renderKey;

  let dockHtml = '';
  if (targeting.type === 'STRIKE') {
    const variants = [
      AIR_SUPPORT.STRIKE_BOMBS,
      AIR_SUPPORT.STRIKE_THERMO,
      AIR_SUPPORT.STRIKE_AC130,
      { ...AIR_SUPPORT.MINES, id: 'STRIKE_MINES', label: N_('Air Mines') },
    ];
    dockHtml = `
      <div class="air-recon-dock pointer-events-auto">
        ${variants
          .map((v, idx) => {
            const unlocked = isAirStrikeVariantUnlocked(v.id, playerRankId, profileMode);
            const reqRank = getAirStrikeRequiredRank(v.id);
            const active = unlocked && targeting.strikeVariant === v.id;
            const affordable = credits >= v.cost;
            const enabled = unlocked && affordable;
            const stateClass = !unlocked
              ? 'is-locked'
              : `${active ? 'is-active' : ''}${affordable ? '' : ' is-poor'}`;
            const statusText = !unlocked
              ? t('LOCKED')
              : active
              ? t('ARMED')
              : `$${formatNumber(v.cost)}`;
            const footerHtml = unlocked
              ? `<span class="air-recon-card-cost">$${formatNumber(v.cost)}</span>`
              : `<span class="air-recon-card-req">${t('Req: {rank}', { rank: t(reqRank.title) })}</span>`;

            return `
              <button
                type="button"
                data-action="air-strike-variant"
                data-variant="${v.id}"
                ${enabled ? '' : 'disabled'}
                class="air-recon-card ${stateClass}"
              >
                <div class="air-recon-card-top">
                  <span class="air-recon-key">${idx + 1}</span>
                  <span class="air-recon-badge">${statusText}</span>
                </div>
                <div class="air-recon-figure">
                  ${STRIKE_SILHOUETTES[v.id] || STRIKE_SILHOUETTES.STRIKE_BOMBS}
                </div>
                <div class="air-recon-card-foot">
                  <span class="air-recon-card-name">${t(v.label)}</span>
                  ${footerHtml}
                </div>
              </button>
            `;
          })
          .join('')}
      </div>
    `;
  } else {
    const dropCfg = AIR_SUPPORT.AIRDROP;
    const affordable = credits >= dropCfg.cost;
    dockHtml = `
      <div class="air-recon-dock pointer-events-auto">
        <div class="air-recon-card is-active is-drop ${affordable ? '' : 'is-poor'}">
          <div class="air-recon-card-top">
            <span class="air-recon-key">5</span>
            <span class="air-recon-badge">${t('READY')}</span>
          </div>
          <div class="air-recon-figure">
            ${STRIKE_SILHOUETTES.AIRDROP}
          </div>
          <div class="air-recon-card-foot">
            <span class="air-recon-card-name">${t(dropCfg.label)}</span>
            <span class="air-recon-card-cost">$${formatNumber(dropCfg.cost)}</span>
          </div>
        </div>
      </div>
    `;
  }

  setHtml(
    container,
    `
    <div class="air-recon-frame" aria-hidden="true">
      <span class="air-recon-corner top-left"></span>
      <span class="air-recon-corner top-right"></span>
      <span class="air-recon-corner bottom-left"></span>
      <span class="air-recon-corner bottom-right"></span>
      <div class="air-recon-crosshair"></div>
    </div>
    <div class="air-recon-topbar pointer-events-auto">
      <div class="air-recon-top-left">
        <span class="air-recon-rec-dot" aria-hidden="true"></span>
        <span class="air-recon-callsign">${t('RECON-01 // AIR SUPPORT OPTICS')}</span>
        <span class="air-recon-credits">$${formatNumber(credits)}</span>
      </div>
      <div class="air-recon-top-hint">
        ${t('CLICK MAP TO DESIGNATE TARGET · WASD PAN · SCROLL ZOOM')}
      </div>
      <button type="button" data-action="air-support-cancel" class="air-recon-abort-btn">
        ${t('ABORT [RMB / ESC]')}
      </button>
    </div>
    ${dockHtml}
  `
  );
}
