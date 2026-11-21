import { battlefieldUrl } from '../app/routes.js';
import { t } from '../i18n/index.js';
import { attachSettingsModal } from '../app/shell.js';
import { renderChallengeBannerIfPresent } from '../ui/challenge-banner.js';
import { loadPlayerSave } from '../app/state.js';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from '../game/campaign.js';
import { SECTORS } from '../game/levels.js';

const NAV_ICONS = Object.freeze({
  completed:
    '<svg class="nav-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  available:
    '<svg class="nav-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 17.5L21 6V3h-3L6.5 14.5"/><path d="M11 19l-6-6"/><path d="M8 16l-4 4"/><path d="M5 21l-2-2"/></svg>',
  locked:
    '<svg class="nav-status-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 10h-1V7a4 4 0 0 0-8 0v3H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zm-7-3a2 2 0 1 1 4 0v3h-4V7zm3 8.73V17a1 1 0 1 1-2 0v-1.27a1.5 1.5 0 1 1 2 0z"/></svg>',
});

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getNextPlayableMissionId(completed) {
  const nextUncompleted = CAMPAIGN_MISSIONS.find(
    (m) =>
      m.status === 'available' &&
      isCampaignMissionUnlocked(m.id, completed) &&
      !completed[m.id]
  );
  if (nextUncompleted) return nextUncompleted.id;

  const lastUnlocked = [...CAMPAIGN_MISSIONS]
    .reverse()
    .find((m) => m.status === 'available' && isCampaignMissionUnlocked(m.id, completed));
  return lastUnlocked?.id || CAMPAIGN_MISSIONS[0].id;
}

function getCurrentChapterIndex(completed) {
  const nextId = getNextPlayableMissionId(completed);
  const idx = CAMPAIGN_CHAPTERS.findIndex((ch) => ch.missions.some((m) => m.id === nextId));
  return idx >= 0 ? idx : 0;
}

function areAllRegionsCompleted(completed) {
  return CAMPAIGN_MISSIONS.every((m) => Boolean(completed[m.id]));
}

function isMissionVisible(mission, completed, currentChapterIdx) {
  if (completed[mission.id]) return true;
  const chIdx = CAMPAIGN_CHAPTERS.findIndex((ch) => ch.id === mission.chapterId);
  return chIdx >= 0 && chIdx <= currentChapterIdx;
}

function getVisibleMissions(completed, currentChapterIdx) {
  return CAMPAIGN_MISSIONS.filter((m) => isMissionVisible(m, completed, currentChapterIdx));
}

function getMissionStatus(mission, completed) {
  if (completed[mission.id]) return 'completed';
  if (mission.status === 'available' && isCampaignMissionUnlocked(mission.id, completed)) return 'available';
  return 'locked';
}

function aggregateRoster(roster = []) {
  const counts = new Map();
  for (const entry of roster) {
    counts.set(entry.type, (counts.get(entry.type) || 0) + entry.count);
  }
  return [...counts.entries()];
}

function syncMissionUrl(missionId) {
  try {
    const url = new URL(location.href);
    url.searchParams.set('mission', missionId);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // Ignore history errors in restricted contexts.
  }
}

function renderActionHtml(selected, status, playable) {
  if (status === 'completed' && playable) {
    return `
      <button type="button" class="brief-start-btn" data-action="start-campaign-mission" data-mission="${selected.id}">
        <span class="start-content">
          <svg class="start-tank-icon" viewBox="0 0 48 22" fill="currentColor" aria-hidden="true">
            <path d="M18 4h11l2 4h14v2.5H31l1.5 3.5H13l3-6h2V4zm-8 10h28l4 4H6l4-4zm2 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
          </svg>
          <span class="start-text">${escapeHtml(t('REPLAY'))}</span>
        </span>
        <span class="start-glow" aria-hidden="true"></span>
      </button>
    `;
  }
  if (playable) {
    return `
      <button type="button" class="brief-start-btn" data-action="start-campaign-mission" data-mission="${selected.id}">
        <span class="start-content">
          <svg class="start-tank-icon" viewBox="0 0 48 22" fill="currentColor" aria-hidden="true">
            <path d="M18 4h11l2 4h14v2.5H31l1.5 3.5H13l3-6h2V4zm-8 10h28l4 4H6l4-4zm2 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
          </svg>
          <span class="start-text">${escapeHtml(t('START MISSION »'))}</span>
        </span>
        <span class="start-glow" aria-hidden="true"></span>
      </button>
    `;
  }
  return `
    <button type="button" class="brief-start-btn is-locked" disabled>
      <span class="start-text">${escapeHtml(t('LOCKED'))}</span>
      <small class="locked-sub">${escapeHtml(t('Pass Sector {n}', { n: selected.number - 1 }))}</small>
    </button>
  `;
}

function renderNavTrack(completed, currentChapterIdx, expandedRegions, selectedId) {
  const parts = [];
  for (let i = 0; i <= currentChapterIdx; i++) {
    const ch = CAMPAIGN_CHAPTERS[i];
    const isCompletedChapter = ch.missions.every((m) => Boolean(completed[m.id]));
    const isCurrent = i === currentChapterIdx;
    const isExpanded = isCurrent || expandedRegions.has(ch.id);

    if (isCompletedChapter && !isExpanded) {
      const hasSelected = ch.missions.some((m) => m.id === selectedId);
      parts.push(`
        <button
          type="button"
          class="campaign-region-chip is-completed${hasSelected ? ' has-selected' : ''}"
          style="--region-accent:${ch.color};"
          data-action="toggle-campaign-region"
          data-region="${ch.id}"
          aria-expanded="false"
        ><span>✓ ${escapeHtml(t(ch.name))}</span><span class="region-chip-count">${ch.missions.length}/${ch.missions.length}</span><span class="region-toggle-chevron" aria-hidden="true">▸</span></button>
      `);
      continue;
    }

    const buttonsHtml = ch.missions
      .map((m) => {
        const status = getMissionStatus(m, completed);
        const num = String(m.number).padStart(2, '0');
        const nameText = t(m.name);
        const isSelected = m.id === selectedId;
        const statusLabel =
          status === 'completed' ? t('completed') : status === 'available' ? t('available') : t('locked');
        const label = `${num}. ${nameText}`;
        return `
          <button
            type="button"
            class="campaign-mission-btn is-${status}${isSelected ? ' is-selected' : ''}"
            style="--region-accent:${ch.color};"
            data-action="select-campaign-mission"
            data-mission="${m.id}"
            aria-pressed="${isSelected}"
            aria-label="${escapeHtml(t('Mission {n}: {name}. {status}.', { n: m.number, name: nameText, status: statusLabel }))}"
            title="${escapeHtml(label)}"
          >${status === 'available' ? '<span class="nav-pulse" aria-hidden="true"></span>' : ''}${NAV_ICONS[status]}<span class="nav-num">${num}</span></button>
        `;
      })
      .join('');

    const regionHeader = isCompletedChapter
      ? `<button type="button" class="campaign-region-label is-collapsible" style="--region-accent:${ch.color};" data-action="toggle-campaign-region" data-region="${ch.id}" aria-expanded="true"><span>✓ ${escapeHtml(t(ch.name))}</span><span class="region-toggle-chevron" aria-hidden="true">▾</span></button>`
      : `<span class="campaign-region-label" style="--region-accent:${ch.color};">${escapeHtml(t(ch.name))}</span>`;

    parts.push(`
      <div class="campaign-region-group" style="--region-accent:${ch.color};">
        ${regionHeader}
        <div class="campaign-region-missions">${buttonsHtml}</div>
      </div>
    `);
  }

  if (!areAllRegionsCompleted(completed) && currentChapterIdx < CAMPAIGN_CHAPTERS.length - 1) {
    const nextCh = CAMPAIGN_CHAPTERS[currentChapterIdx + 1];
    parts.push(`
      <span class="campaign-next-region" aria-disabled="true">
        ${NAV_ICONS.locked}
        <span>${escapeHtml(t('Next: {region} · {n}/7', { region: t(nextCh.name), n: currentChapterIdx + 2 }))}</span>
      </span>
    `);
  }

  return parts.join('');
}

function syncCampaignPage(completedMissions, selectedId, expandedRegions) {
  const currentChapterIdx = getCurrentChapterIndex(completedMissions);
  const visible = getVisibleMissions(completedMissions, currentChapterIdx);
  let selected = visible.find((m) => m.id === selectedId);
  if (!selected) {
    const fallbackId = getNextPlayableMissionId(completedMissions);
    selected = visible.find((m) => m.id === fallbackId) || visible[0];
  }
  selectedId = selected.id;

  const track = document.querySelector('.campaign-nav-track');
  if (track) {
    track.innerHTML = renderNavTrack(completedMissions, currentChapterIdx, expandedRegions, selectedId);
  }

  const progressEl = document.querySelector('[data-campaign-progress]');
  if (progressEl) {
    const doneCount = CAMPAIGN_MISSIONS.filter((m) => Boolean(completedMissions[m.id])).length;
    progressEl.textContent = `${doneCount} / ${CAMPAIGN_MISSIONS.length}`;
  }

  const selIdx = visible.findIndex((m) => m.id === selectedId);
  const prevBtn = document.querySelector('[data-action="prev-campaign-mission"]');
  const nextBtn = document.querySelector('[data-action="next-campaign-mission"]');
  if (prevBtn) prevBtn.disabled = selIdx <= 0;
  if (nextBtn) nextBtn.disabled = selIdx < 0 || selIdx >= visible.length - 1;

  const chapter = CAMPAIGN_CHAPTERS.find((c) => c.id === selected.chapterId) || CAMPAIGN_CHAPTERS[0];
  const sector = SECTORS.find((s) => s.mapId === selected.id);
  const status = getMissionStatus(selected, completedMissions);
  const isClassified = status === 'locked';
  const playable = status !== 'locked' && Boolean(sector);

  const workspace = document.querySelector('.campaign-workspace');
  if (workspace) workspace.style.setProperty('--region-accent', chapter.color);

  const reconSquare = document.querySelector('.campaign-recon-square');
  const reconImg = document.querySelector('.campaign-recon-img');
  const classifiedSub = document.querySelector('.campaign-classified-sub');

  if (reconSquare) {
    reconSquare.classList.toggle('is-classified', isClassified);
    if (isClassified) {
      reconSquare.classList.remove('is-missing-img');
      if (reconImg) reconImg.removeAttribute('src');
      if (classifiedSub) {
        classifiedSub.textContent = t('Pass Sector {n} to unlock recon imagery', { n: selected.number - 1 });
      }
    } else {
      const imgPrefix = /^\/(es|pt-br|de|fr)(\/|$)/i.test(location.pathname) ? '../' : './';
      const numStr = String(selected.number).padStart(2, '0');
      const targetSrc = `${imgPrefix}images/campaign/mission-${numStr}.webp`;
      const reconSectorTag = reconSquare.querySelector('[data-recon-sector]');
      if (reconSectorTag) reconSectorTag.textContent = `SEC-${numStr}`;
      if (reconImg) {
        reconSquare.classList.add('is-missing-img');
        reconImg.onload = () => {
          reconSquare.classList.toggle('is-missing-img', reconImg.naturalWidth === 0);
        };
        reconImg.onerror = () => {
          reconSquare.classList.add('is-missing-img');
        };
        reconImg.src = targetSrc;
        reconImg.alt = `${t(selected.name)} — ${t('Reconnaissance map')}`;
        if (reconImg.complete && reconImg.naturalWidth > 0) {
          reconSquare.classList.remove('is-missing-img');
        }
      }
    }
  }

  const sectorEl = document.querySelector('.campaign-brief-sector');
  if (sectorEl) {
    sectorEl.textContent = `${t('SECTOR {n} // 38', { n: String(selected.number).padStart(2, '0') })} · ${t(chapter.name).toUpperCase()}`;
  }
  const diffEl = document.querySelector('.campaign-brief-difficulty');
  if (diffEl) {
    diffEl.hidden = isClassified;
    diffEl.textContent = isClassified ? '' : t(selected.difficulty);
  }
  const titleEl = document.querySelector('.campaign-brief-title');
  if (titleEl) titleEl.textContent = t(selected.name);
  const objEl = document.querySelector('.campaign-brief-objective');
  if (objEl) objEl.textContent = t(selected.objective);

  const briefDetails = document.querySelector('.campaign-brief-details');
  const briefClassified = document.querySelector('.campaign-brief-classified');
  if (briefDetails) briefDetails.hidden = isClassified;
  if (briefClassified) {
    briefClassified.hidden = !isClassified;
    if (isClassified) {
      briefClassified.textContent = t('Complete Sector {n} to decrypt tactical briefing and enemy roster.', {
        n: selected.number - 1,
      });
    }
  }

  if (!isClassified) {
    const textEl = document.querySelector('.campaign-brief-text');
    if (textEl) textEl.textContent = t(selected.briefing);
    const layoutEl = document.querySelector('.campaign-brief-layout');
    if (layoutEl) layoutEl.textContent = t(selected.layout);
    const rosterEl = document.querySelector('.campaign-roster-chips');
    if (rosterEl) {
      rosterEl.innerHTML = aggregateRoster(selected.enemyRoster)
        .map(([type, count]) => `<span class="campaign-roster-chip">${escapeHtml(type)} ×${count}</span>`)
        .join('');
    }
  }

  const actionBlock = document.querySelector('.campaign-brief-actions');
  if (actionBlock) actionBlock.innerHTML = renderActionHtml(selected, status, playable);

  return selectedId;
}

const root = document.getElementById('root');
const playerSave = loadPlayerSave();
const completedMissions = playerSave?.completedMissions || {};
const currentChapterIdx = getCurrentChapterIndex(completedMissions);
const visibleMissions = getVisibleMissions(completedMissions, currentChapterIdx);
const expandedRegions = new Set([CAMPAIGN_CHAPTERS[currentChapterIdx].id]);

const urlMission = new URLSearchParams(location.search).get('mission');
const initialMission = visibleMissions.find((m) => m.id === urlMission);
let selectedMissionId = initialMission ? initialMission.id : getNextPlayableMissionId(completedMissions);

if (initialMission) {
  const ch = CAMPAIGN_CHAPTERS.find((c) => c.id === initialMission.chapterId);
  if (ch) expandedRegions.add(ch.id);
}

if (root) {
  attachSettingsModal(root);
  renderChallengeBannerIfPresent({
    container: root.querySelector('main') || root,
    pageHint: 'campaign',
    onAccept: (challenge) => {
      const targetId = isCampaignMissionUnlocked(challenge.missionId, completedMissions)
        ? challenge.missionId
        : selectedMissionId;
      location.href = battlefieldUrl({ mode: 'campaign', mission: targetId });
    },
  });

  selectedMissionId = syncCampaignPage(completedMissions, selectedMissionId, expandedRegions);
  syncMissionUrl(selectedMissionId);

  const selectMission = (missionId) => {
    if (!missionId || !visibleMissions.some((m) => m.id === missionId)) return;
    selectedMissionId = syncCampaignPage(completedMissions, missionId, expandedRegions);
    syncMissionUrl(selectedMissionId);
  };

  const stepMission = (delta) => {
    const idx = visibleMissions.findIndex((m) => m.id === selectedMissionId);
    if (idx < 0) return;
    const next = visibleMissions[idx + delta];
    if (next) selectMission(next.id);
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    switch (action) {
      case 'select-campaign-mission':
        selectMission(btn.dataset.mission);
        break;
      case 'prev-campaign-mission':
        stepMission(-1);
        break;
      case 'next-campaign-mission':
        stepMission(1);
        break;
      case 'toggle-campaign-region': {
        const regionId = btn.dataset.region;
        if (!regionId) break;
        if (expandedRegions.has(regionId)) expandedRegions.delete(regionId);
        else expandedRegions.add(regionId);
        syncCampaignPage(completedMissions, selectedMissionId, expandedRegions);
        break;
      }
      case 'start-campaign-mission': {
        const missionId = btn.dataset.mission || selectedMissionId;
        const mission = CAMPAIGN_MISSIONS.find(
          (item) => item.id === missionId && item.status === 'available'
        );
        if (mission && isCampaignMissionUnlocked(mission.id, completedMissions)) {
          location.href = battlefieldUrl({ mode: 'campaign', mission: mission.id });
        }
        break;
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepMission(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepMission(1);
    }
  });
}
