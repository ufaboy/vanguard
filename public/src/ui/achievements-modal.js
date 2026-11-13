import { loadPlayerSave } from '../app/state.js';
import { getAchievementsCatalog } from '../sim/achievements.js';

function getCardTone(item) {
  if (!item.unlocked) {
    return 'border-slate-800 bg-slate-900/50 opacity-70';
  }
  if (item.rarity === 'epic') {
    return 'border-amber-400/60 bg-amber-950/25';
  }
  if (item.rarity === 'rare') {
    return 'border-sky-400/50 bg-sky-950/25';
  }
  return 'border-emerald-500/45 bg-emerald-950/20';
}

function renderCatalogCards(catalog) {
  return catalog
    .map((item) => {
      const dateStr =
        item.unlocked && item.unlockedAt
          ? new Date(item.unlockedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '';
      const meta = item.unlocked
        ? `<span class="text-[10px] text-emerald-300 font-mono">UNLOCKED${item.count > 1 ? ` ×${item.count}` : ''}${dateStr ? ` · ${dateStr}` : ''}</span>`
        : `<span class="text-[10px] text-amber-300/80 font-mono">FIRST UNLOCK: +$${item.rewardCredits}</span>`;
      return `
        <div class="flex items-start gap-3 p-3 rounded border ${getCardTone(item)}">
          <span class="text-2xl leading-none shrink-0 mt-0.5 ${item.unlocked ? '' : 'grayscale opacity-50'}" aria-hidden="true">${item.icon}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold uppercase tracking-wider ${item.unlocked ? 'text-white' : 'text-slate-300'}">${item.title}</span>
              <span class="text-[10px] font-mono uppercase ${
                item.rarity === 'epic'
                  ? 'text-amber-300'
                  : item.rarity === 'rare'
                  ? 'text-sky-300'
                  : 'text-emerald-300'
              }">${item.rarity}</span>
            </div>
            <p class="text-[11px] text-slate-300 leading-snug mt-1">${item.description}</p>
            <div class="mt-1.5">${meta}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

/** Attaches the Medals & Achievements Showcase modal to any page root. */
export function attachAchievementsModal(root) {
  let modal = document.getElementById('achievements-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'achievements-modal';
    modal.className = 'settings-modal-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'achievements-modal-title');
    document.body.appendChild(modal);
  }

  function renderModal() {
    const save = loadPlayerSave();
    const catalog = getAchievementsCatalog(save?.achievements || {});
    const unlockedCount = catalog.filter((a) => a.unlocked).length;
    const stats = save?.stats || {};

    modal.innerHTML = `
      <div class="settings-modal-panel" style="width:min(780px,94vw);max-height:88vh;display:flex;flex-direction:column;">
        <span class="board-rivet top-left" aria-hidden="true"></span>
        <span class="board-rivet top-right" aria-hidden="true"></span>
        <span class="board-rivet bottom-left" aria-hidden="true"></span>
        <span class="board-rivet bottom-right" aria-hidden="true"></span>
        <div class="settings-modal-header">
          <div>
            <small class="settings-modal-kicker">/// SERVICE RECORD & MEDALS</small>
            <h2 id="achievements-modal-title" class="settings-modal-title">Medals (${unlockedCount}/${catalog.length})</h2>
          </div>
          <button type="button" class="menu-secondary" data-action="close-achievements">Close [ESC]</button>
        </div>
        <div class="grid grid-cols-3 gap-2.5 p-3 mb-3 rounded border border-slate-800 bg-slate-900/90 font-mono">
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">CAREER KILLS</span>
            <span class="text-base font-bold text-emerald-400 tabular-nums">${Number(stats.totalKills) || 0}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">SORTIES / WINS</span>
            <span class="text-base font-bold text-sky-300 tabular-nums">${Number(stats.totalBattles) || 0} / ${Number(stats.totalVictories) || 0}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 uppercase block">BLOCKS SMASHED</span>
            <span class="text-base font-bold text-amber-300 tabular-nums">${Number(stats.totalBlocksDestroyed) || 0}</span>
          </div>
        </div>
        <div class="overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          ${renderCatalogCards(catalog)}
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
    if (event.target.closest('[data-action="open-achievements"]')) {
      openModal();
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-action="close-achievements"]')) {
      closeModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  return { openModal, closeModal };
}

