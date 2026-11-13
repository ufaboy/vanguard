/** Contracts screen: armored operations board and horizontal contract banners. */
import { battlefieldUrl } from '../app/routes.js';
import { CONTRACTS_CATALOG, CONTRACT_TYPES } from '../sim/contract.js';

function getContractThumb(contractId) {
  return contractId === 'contract-blackout-protocol'
    ? './images/region-thumb-alpine.jpg'
    : './images/region-thumb-industrial.jpg';
}

function getShieldSvg(isSabotage) {
  if (isSabotage) {
    return `
      <svg viewBox="0 0 36 36" width="32" height="32" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="10" stroke="#f8fafc" stroke-width="2"/>
        <circle cx="18" cy="18" r="4" stroke="#f59e0b" stroke-width="2"/>
        <path d="M18 4v6M18 26v6M4 18h6M26 18h6" stroke="#f8fafc" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 36 36" width="32" height="32" fill="none" aria-hidden="true">
      <path d="M8 12l10-5 10 5v12l-10 5-10-5V12z" stroke="#f8fafc" stroke-width="2" stroke-linejoin="round"/>
      <path d="M8 12l10 5 10-5M18 17v12" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `;
}

export function renderContracts(selectedContractId, completedMissions = {}) {
  const selectedId =
    CONTRACTS_CATALOG.find((item) => item.id === selectedContractId)?.id || '';

  const contractBanners = CONTRACTS_CATALOG.map((item) => {
    const isSelected = item.id === selectedId;
    const isDone = Boolean(completedMissions?.[item.id]);
    const itemSabotage = item.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const modeClass = itemSabotage ? 'is-sabotage' : 'is-recovery';
    const maxPayout =
      item.payouts.PER_CARGO * 3 + item.payouts.EXTRACTION_BASE + item.payouts.THIRD_CARGO_BONUS;
    const contractHref = battlefieldUrl({ mode: 'contract', id: item.id });

    return `
      <div
        class="contract-banner ${modeClass}${isSelected ? ' is-selected' : ''}"
        data-contract-card="${item.id}"
      >
        <span class="plate-rivet tl" aria-hidden="true"></span>
        <span class="plate-rivet tr" aria-hidden="true"></span>
        <span class="plate-rivet bl" aria-hidden="true"></span>
        <span class="plate-rivet br" aria-hidden="true"></span>

        <a
          class="contract-banner-select"
          href="${contractHref}"
        >
          <div class="contract-shield-wrap">
            <div class="contract-shield">
              ${getShieldSvg(itemSabotage)}
            </div>
          </div>

          <div class="contract-thumb-wrap" aria-hidden="true">
            <img src="${getContractThumb(item.id)}" alt="" loading="lazy">
            <div class="contract-thumb-fade"></div>
          </div>

          <div class="contract-banner-info">
            <div class="contract-banner-meta">
              <span class="contract-code-badge">${item.code}</span>
              <span class="contract-status-tag${isDone ? ' is-done' : ''}">${isDone ? '✓ COMPLETED' : '2/3 REQUIRED · 3RD ★'}</span>
            </div>
            <div class="contract-banner-title-row">
              <strong class="contract-banner-title">${item.name}</strong>
              <span class="contract-banner-sub">${item.subtitle}</span>
            </div>
            <p class="contract-banner-summary">${item.summary}</p>
            <div class="contract-progress-row" aria-hidden="true">
              <div class="contract-progress-track">
                <span class="seg${isDone ? ' is-filled' : ' is-ready'}"></span>
                <span class="seg${isDone ? ' is-filled' : ' is-ready'}"></span>
                <span class="seg${isDone ? ' is-filled' : ''}"></span>
              </div>
              <span class="contract-duration">${item.targetDuration} · ${item.difficulty}</span>
            </div>
          </div>
        </a>

        <div class="contract-banner-reward">
          <div class="reward-col">
            <span class="reward-label">REWARD</span>
            <strong class="reward-amount">$${maxPayout.toLocaleString('en-US')}</strong>
            <small class="reward-sub">+$${item.payouts.PER_CARGO} / OBJ</small>
          </div>
          <a
            class="contract-quick-go"
            href="${contractHref}"
            aria-label="Deploy ${item.name}"
          >»</a>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="contracts-hero-view">
      <section class="contracts-hero-board" aria-label="Tactical contracts board">
        <span class="board-rivet top-left" aria-hidden="true"></span>
        <span class="board-rivet top-right" aria-hidden="true"></span>
        <span class="board-rivet bottom-left" aria-hidden="true"></span>
        <span class="board-rivet bottom-right" aria-hidden="true"></span>

        <img
          class="contracts-hero-art"
          src="./images/contracts-hero.jpg"
          alt="Military command tent overlooking a twilight mountain valley"
          fetchpriority="high"
          width="1920"
          height="1080"
        >
        <div class="contracts-hero-atmosphere" aria-hidden="true"></div>

        <header class="contracts-header-stage">
          <div class="contracts-crest-row">
            <span class="crest-wing left" aria-hidden="true"></span>
            <div class="contracts-title-plate">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fbbf24" stroke-width="2" aria-hidden="true">
                <rect x="5" y="4" width="14" height="17" rx="2"/>
                <path d="M9 4V2h6v2M9 11l2 2 4-4M9 16h6"/>
              </svg>
              <h2>CONTRACTS</h2>
            </div>
            <span class="crest-wing right" aria-hidden="true"></span>
          </div>
          <p class="contracts-subtitle">— Complete special missions, secure objective payouts, and extract. —</p>
        </header>

        <div class="contracts-banner-list" role="region" aria-label="Available tactical contracts">
          ${contractBanners}
        </div>
      </section>
    </div>
  `;
}
