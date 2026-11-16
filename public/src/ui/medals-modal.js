/**
 * Service Record & Medal Case modal.
 * Displays military rank progression, Service XP bar, and all 20 graded medals.
 */

import { loadPlayerSave } from '../app/state.js';
import {
  MEDAL_CATALOG,
  MEDAL_GRADES,
  RANK_LADDER,
  getRankProgress,
} from '../sim/medals.js';

const GRADE_FILTERS = Object.freeze([
  { id: 'all', label: 'All (20)' },
  { id: 'vanguard', label: 'Vanguard' },
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'bronze', label: 'Bronze' },
]);

function renderRankHeader(progress) {
  const { currentRank, nextRank, serviceXp, goldPlus, vanguard, totalUnlocked, xpProgressPct, missingGate } = progress;
  const nextLabel = nextRank
    ? `Next: ${nextRank.title} (${serviceXp.toLocaleString()} / ${nextRank.minXp.toLocaleString()} XP)`
    : 'Maximum Rank Reached';

  return `
    <div class="medal-rank-banner">
      <div class="medal-rank-left">
        <div class="medal-rank-insignia" aria-hidden="true">${currentRank.insignia}</div>
        <div>
          <span class="medal-rank-kicker">COMMANDER RANK</span>
          <h3 class="medal-rank-title">${currentRank.title}</h3>
          <p class="medal-rank-sub">${nextLabel}</p>
          ${missingGate ? `<p class="medal-rank-gate">${missingGate}</p>` : ''}
        </div>
      </div>
      <div class="medal-rank-stats">
        <div class="medal-stat-pill"><span>MEDALS</span><strong>${totalUnlocked} / ${MEDAL_CATALOG.length}</strong></div>
        <div class="medal-stat-pill"><span>GOLD+</span><strong>${goldPlus}</strong></div>
        <div class="medal-stat-pill"><span>VANGUARD</span><strong>${vanguard}</strong></div>
      </div>
    </div>
    <div class="medal-xp-bar-track" role="progressbar" aria-valuenow="${xpProgressPct}" aria-valuemin="0" aria-valuemax="100">
      <div class="medal-xp-bar-fill" style="width: ${xpProgressPct}%"></div>
    </div>
    <div class="medal-ladder-strip" aria-label="Rank ladder">
      ${RANK_LADDER.map((r) => {
        const reached = serviceXp >= r.minXp && goldPlus >= r.minGoldPlus && vanguard >= r.minVanguard;
        const active = r.id === currentRank.id;
        return `<span class="medal-ladder-node ${active ? 'is-current' : reached ? 'is-reached' : ''}" title="${r.title} (${r.minXp} XP)">${r.insignia}</span>`;
      }).join('')}
    </div>
  `;
}

function renderMedalCard(medal, entry) {
  const grade = MEDAL_GRADES[medal.grade];
  const count = entry?.count || 0;
  const unlocked = count > 0;

  return `
    <article
      class="medal-case-card ${unlocked ? 'is-unlocked' : 'is-locked'}"
      style="--medal-color: ${grade.color}; --medal-bg: ${grade.bgColor}; --medal-border: ${grade.borderColor};"
    >
      <div class="medal-case-top">
        <span class="medal-grade-badge">${grade.label.toUpperCase()}</span>
        ${unlocked ? `<span class="medal-count-badge">×${count}</span>` : `<span class="medal-xp-hint">+${grade.firstXp} XP</span>`}
      </div>
      <h4 class="medal-case-name">${medal.name}</h4>
      <p class="medal-case-desc">${medal.description}</p>
      <span class="medal-case-cat">${medal.category}</span>
    </article>
  `;
}

export function attachMedalsModal(root) {
  if (!root || root.dataset.medalsModalBound === '1') return;
  root.dataset.medalsModalBound = '1';

  let modal = document.getElementById('medals-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'medals-modal';
    modal.className = 'settings-modal-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'medals-modal-title');
    document.body.appendChild(modal);
  }

  let activeFilter = 'all';

  function renderModal() {
    const save = loadPlayerSave();
    const progress = getRankProgress(save);
    const medalsMap = save?.medals || {};
    const filtered = activeFilter === 'all'
      ? MEDAL_CATALOG
      : MEDAL_CATALOG.filter((m) => m.grade === activeFilter);

    modal.innerHTML = `
      <div class="settings-modal-panel medals-modal-panel">
        <span class="board-rivet top-left" aria-hidden="true"></span>
        <span class="board-rivet top-right" aria-hidden="true"></span>
        <span class="board-rivet bottom-left" aria-hidden="true"></span>
        <span class="board-rivet bottom-right" aria-hidden="true"></span>
        <div class="settings-modal-header">
          <div>
            <small class="settings-modal-kicker">/// SERVICE RECORD &amp; HONORS</small>
            <h2 id="medals-modal-title" class="settings-modal-title">Medals &amp; Ranks</h2>
          </div>
          <button type="button" class="menu-secondary" data-action="close-medals">Close [ESC]</button>
        </div>
        <div class="settings-modal-body medals-modal-body">
          ${renderRankHeader(progress)}
          <div class="medal-filter-bar" role="tablist" aria-label="Filter medals by grade">
            ${GRADE_FILTERS.map((f) => `
              <button
                type="button"
                role="tab"
                aria-selected="${activeFilter === f.id}"
                class="medal-filter-btn ${activeFilter === f.id ? 'is-active' : ''}"
                data-action="filter-medals"
                data-grade="${f.id}"
              >${f.label}</button>
            `).join('')}
          </div>
          <div class="medal-case-grid">
            ${filtered.map((m) => renderMedalCard(m, medalsMap[m.id])).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function openModal() {
    renderModal();
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="open-medals"]')) {
      openModal();
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-action="close-medals"]')) {
      closeModal();
      return;
    }
    const filterBtn = event.target.closest('[data-action="filter-medals"]');
    if (filterBtn) {
      activeFilter = filterBtn.dataset.grade || 'all';
      renderModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });
}
