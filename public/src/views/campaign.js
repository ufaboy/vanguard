import { SECTORS } from '../game/levels.js';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from '../game/campaign.js';

const CAMPAIGN_COORDINATES = Object.freeze([
  // 01-05: City Outskirts
  { x: 10.5, y: 21.5 },
  { x: 17.0, y: 21.5 },
  { x: 23.5, y: 24.0 },
  { x: 30.0, y: 24.8 },
  { x: 36.2, y: 27.6 },
  // 06-10: Forest Frontier
  { x: 11.2, y: 35.0 },
  { x: 17.2, y: 39.5 },
  { x: 18.5, y: 47.5 },
  { x: 16.2, y: 56.2 },
  { x: 22.2, y: 58.5 },
  // 11-15: Desert Crossing
  { x: 10.5, y: 72.0 },
  { x: 16.2, y: 71.0 },
  { x: 21.8, y: 72.5 },
  { x: 27.5, y: 73.2 },
  { x: 33.2, y: 73.0 },
  // 16-20: Coastal Wetlands
  { x: 41.5, y: 72.5 },
  { x: 49.5, y: 69.5 },
  { x: 57.5, y: 71.5 },
  { x: 64.5, y: 72.5 },
  { x: 71.5, y: 72.8 },
  // 21-25: Frozen Highlands
  { x: 78.2, y: 81.8 },
  { x: 78.2, y: 73.5 },
  { x: 75.5, y: 66.5 },
  { x: 85.5, y: 62.5 },
  { x: 83.0, y: 55.0 },
  // 26-30: Industrial Belt
  { x: 82.5, y: 49.0 },
  { x: 76.5, y: 49.5 },
  { x: 71.8, y: 49.0 },
  { x: 68.5, y: 43.5 },
  { x: 62.5, y: 37.5 },
  // 31-35: Capital City
  { x: 55.8, y: 30.0 },
  { x: 59.5, y: 24.5 },
  { x: 66.8, y: 24.5 },
  { x: 73.5, y: 24.5 },
  { x: 81.5, y: 22.8 },
]);

const CAMPAIGN_REGIONS = Object.freeze([
  {
    id: 'urban',
    name: 'City Outskirts',
    x: 6.5,
    y: 13.0,
    color: '#38bdf8',
    iconSvg: '<path d="M3 21h18M5 21V7l8-4v18M13 10h4v11M9 9h1M9 13h1M9 17h1M15 14h1M15 17h1"/>',
  },
  {
    id: 'forest',
    name: 'Forest Frontier',
    x: 3.5,
    y: 43.5,
    color: '#4ade80',
    iconSvg: '<path d="M12 2L6 12h4l-3 7h10l-3-7h4L12 2zM12 19v3"/>',
  },
  {
    id: 'desert',
    name: 'Desert Crossing',
    x: 3.5,
    y: 64.0,
    color: '#f59e0b',
    iconSvg: '<path d="M12 3v18M8 8v4a4 4 0 008 0V7M5 12h3M16 11h3"/>',
  },
  {
    id: 'coast',
    name: 'Coastal Wetlands',
    x: 42.0,
    y: 63.5,
    color: '#2dd4bf',
    iconSvg: '<path d="M2 20c3-1 6-1 9 0s6 1 9 0M2 16c3-1 6-1 9 0s6 1 9 0M6 4v10M12 2v12M18 6v8"/>',
  },
  {
    id: 'alpine',
    name: 'Frozen Highlands',
    x: 85.0,
    y: 69.5,
    color: '#67e8f9',
    iconSvg: '<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93M8 4l4 4-4 4M16 4l-4 4 4 4M8 20l4-4-4-4M16 20l-4-4 4-4"/>',
  },
  {
    id: 'industrial',
    name: 'Industrial Belt',
    x: 85.0,
    y: 41.5,
    color: '#fb923c',
    iconSvg: '<path d="M2 20h20M4 20V10l6 4V10l6 4V4h4v16"/>',
  },
  {
    id: 'capital',
    name: 'Capital City',
    x: 84.0,
    y: 13.0,
    color: '#f43f5e',
    iconSvg: '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6M9 13h6"/>',
  },
]);

function buildSvgPath(maxIdx, width = 1376, height = 768) {
  if (maxIdx <= 0) return '';
  const pts = CAMPAIGN_COORDINATES.slice(0, maxIdx + 1).map((p) => ({
    x: Math.round((p.x * width) / 100),
    y: Math.round((p.y * height) / 100),
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const curr = pts[i];
    if (i === 5) {
      d += ` Q ${Math.round((23 * width) / 100)} ${Math.round((33 * height) / 100)}, ${curr.x} ${curr.y}`;
    } else if (i === 10) {
      d += ` Q ${Math.round((15 * width) / 100)} ${Math.round((68 * height) / 100)}, ${curr.x} ${curr.y}`;
    } else {
      d += ` L ${curr.x} ${curr.y}`;
    }
  }
  return d;
}

export function renderCampaignBrief(selectedOrId, completedMissions = {}, drawerOpen = true) {
  const selected = typeof selectedOrId === 'string'
    ? CAMPAIGN_MISSIONS.find((m) => m.id === selectedOrId) || CAMPAIGN_MISSIONS[0]
    : selectedOrId || CAMPAIGN_MISSIONS[0];
  const sector = SECTORS.find((item) => item.mapId === selected.id);
  const chapter = CAMPAIGN_CHAPTERS.find((c) => c.missions.some((m) => m.id === selected.id)) || CAMPAIGN_CHAPTERS[0];
  const region = CAMPAIGN_REGIONS.find((r) => r.id === chapter.id) || CAMPAIGN_REGIONS[0];
  const available = selected.status === 'available' && Boolean(sector);
  const playable = available && isCampaignMissionUnlocked(selected.id, completedMissions);
  const completed = Boolean(completedMissions[selected.id]);

  const starCount = completed ? 3 : playable ? 2 : 0;
  const starsHtml = `
    <span class="star-item ${starCount >= 1 ? 'is-filled' : ''}">★</span>
    <span class="star-item ${starCount >= 2 ? 'is-filled' : ''}">★</span>
    <span class="star-item ${starCount >= 3 ? 'is-filled' : ''}">★</span>
  `;

  return `
    <aside
      class="cinematic-brief-drawer ${drawerOpen ? 'is-open' : 'is-closed'}"
      aria-label="Selected mission briefing"
      style="--chapter-color:${selected.color};--region-color:${region.color};"
    >
      <!-- Top Center Armored Pull Handle -->
      <button
        type="button"
        class="brief-handle-btn"
        data-action="toggle-campaign-brief"
        aria-label="${drawerOpen ? 'Collapse briefing drawer' : 'Expand briefing drawer'}"
      >
        <span class="btn-rivet left" aria-hidden="true"></span>
        <span class="handle-chevron" aria-hidden="true">${drawerOpen ? '︾' : '︽'}</span>
        <span class="btn-rivet right" aria-hidden="true"></span>
      </button>

      <div class="brief-card-chassis">
        <!-- Corner Rivets -->
        <span class="btn-rivet top-left" aria-hidden="true"></span>
        <span class="btn-rivet top-right" aria-hidden="true"></span>
        <span class="btn-rivet bottom-left" aria-hidden="true"></span>
        <span class="btn-rivet bottom-right" aria-hidden="true"></span>

        <!-- Left Block: Landscape Preview Frame -->
        <div class="brief-thumb-frame">
          <img
            class="brief-thumb-img"
            src="/images/region-thumb-${chapter.id}.jpg"
            alt="${chapter.name} terrain preview"
            loading="lazy"
            width="360"
            height="200"
          />
          <div class="brief-thumb-overlay" aria-hidden="true"></div>
        </div>

        <!-- Center Block: Region Badge & Mission Identity -->
        <div class="brief-info-block">
          <div class="brief-region-badge">
            <svg class="region-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              ${region.iconSvg}
            </svg>
            <span class="region-badge-name">${chapter.name.toUpperCase()}</span>
          </div>

          <div class="brief-mission-details">
            <div class="brief-sector-code">SECTOR ${String(selected.number).padStart(2, '0')} // 35</div>
            <h2 class="brief-mission-title">${selected.name}</h2>
            <p class="brief-mission-desc">${selected.objective} · ${selected.enemyTotal} hostiles</p>
          </div>

          <!-- Subtle Background Tank Watermark Silhouette -->
          <svg class="brief-tank-watermark" viewBox="0 0 160 48" fill="none" aria-hidden="true">
            <rect x="88" y="22" width="16" height="3" rx="1" fill="currentColor"/>
            <path d="M72 21H88L85 27H74L72 21Z" fill="currentColor"/>
            <path d="M66 27H94L98 33H62L66 27Z" fill="currentColor"/>
            <rect x="62" y="33" width="36" height="7" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="67" cy="36.5" r="2" fill="currentColor"/>
            <circle cx="73.5" cy="36.5" r="2" fill="currentColor"/>
            <circle cx="80" cy="36.5" r="2" fill="currentColor"/>
            <circle cx="86.5" cy="36.5" r="2" fill="currentColor"/>
            <circle cx="93" cy="36.5" r="2" fill="currentColor"/>
          </svg>
        </div>

        <!-- Right Block: Massive Start Button -->
        <div class="brief-action-block">
          ${
            playable
              ? `
            <button
              type="button"
              class="brief-start-btn"
              data-action="start-campaign-mission"
              data-mission="${selected.id}"
            >
              <span class="start-text">START »</span>
              <span class="start-glow" aria-hidden="true"></span>
            </button>
          `
              : `
            <button
              type="button"
              class="brief-start-btn is-locked"
              disabled
            >
              <span class="start-text">LOCKED</span>
              <small class="locked-sub">Pass Sector ${selected.number - 1}</small>
            </button>
          `
          }
        </div>
      </div>
    </aside>
  `;
}

const HEX_POINTS = '28,5.2 72,5.2 94,43.3 72,81.4 28,81.4 6,43.3';
const HEX_INNER_POINTS = '30.5,9.5 69.5,9.5 89,43.3 69.5,77.1 30.5,77.1 11,43.3';

const NODE_ICONS = Object.freeze({
  completed:
    '<svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  available:
    '<svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 17.5L21 6V3h-3L6.5 14.5"/><path d="M11 19l-6-6"/><path d="M8 16l-4 4"/><path d="M5 21l-2-2"/></svg>',
  locked:
    '<svg class="node-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 10h-1V7a4 4 0 0 0-8 0v3H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zm-7-3a2 2 0 1 1 4 0v3h-4V7zm3 8.73V17a1 1 0 1 1-2 0v-1.27a1.5 1.5 0 1 1 2 0z"/></svg>',
});

function getMissionNodeView(mission, completedMissions = {}) {
  const isDone = Boolean(completedMissions[mission.id]);
  const isAvail = mission.status === 'available';
  const isUnlock = isCampaignMissionUnlocked(mission.id, completedMissions);
  const nodeStatus = isDone ? 'completed' : !isAvail ? 'planned' : isUnlock ? 'available' : 'locked';
  const nodeNum = String(mission.number).padStart(2, '0');
  const iconHtml = NODE_ICONS[nodeStatus] || NODE_ICONS.locked;

  const badgeContent = `
    <svg class="node-hex-svg" viewBox="0 0 100 86.6" aria-hidden="true">
      <polygon class="node-hex-fill" points="${HEX_POINTS}" />
      ${nodeStatus === 'available' ? `<polygon class="node-hex-inner" points="${HEX_INNER_POINTS}" />` : ''}
    </svg>
    ${iconHtml}
    <span class="node-num">${nodeNum}</span>
  `;
  return { nodeStatus, badgeContent };
}

/** Updates campaign map node states, active route path, and drawer in-place without re-rendering the whole page. */
export function syncCampaignMapState(completedMissions = {}, selectedId = null, drawerOpen = true) {
  const selected = CAMPAIGN_MISSIONS.find((m) => m.id === selectedId) || CAMPAIGN_MISSIONS[0];
  const highestUnlockedIndex = CAMPAIGN_MISSIONS.reduce(
    (max, m, idx) => (isCampaignMissionUnlocked(m.id, completedMissions) ? Math.max(max, idx) : max),
    0
  );

  document.querySelectorAll('.cinematic-node[data-mission]').forEach((nodeEl) => {
    const mission = CAMPAIGN_MISSIONS.find((m) => m.id === nodeEl.dataset.mission);
    if (!mission) return;
    const { nodeStatus, badgeContent } = getMissionNodeView(mission, completedMissions);
    const isSelected = selected.id === mission.id;

    nodeEl.classList.remove('is-completed', 'is-available', 'is-locked', 'is-planned');
    nodeEl.classList.add(`is-${nodeStatus}`);
    nodeEl.classList.toggle('is-selected', isSelected);
    nodeEl.setAttribute('aria-pressed', String(isSelected));
    nodeEl.setAttribute('aria-label', `Mission ${mission.number}: ${mission.name}. ${nodeStatus}.`);

    const existingPulse = nodeEl.querySelector('.node-pulse');
    if (nodeStatus === 'available' && !existingPulse) {
      const pulse = document.createElement('div');
      pulse.className = 'node-pulse';
      pulse.setAttribute('aria-hidden', 'true');
      pulse.innerHTML = `<svg viewBox="0 0 100 86.6" aria-hidden="true"><polygon points="${HEX_POINTS}"/></svg>`;
      nodeEl.prepend(pulse);
    } else if (nodeStatus !== 'available' && existingPulse) {
      existingPulse.remove();
    }

    const badge = nodeEl.querySelector('.node-badge');
    if (badge && badge.innerHTML !== badgeContent) {
      badge.innerHTML = badgeContent;
    }
  });

  const activePath = document.querySelector('.cinematic-path-svg .path-active');
  if (activePath) {
    activePath.setAttribute('d', buildSvgPath(highestUnlockedIndex));
  }

  const drawer = document.querySelector('.cinematic-brief-drawer');
  if (drawer) {
    const isOpen = drawer.classList.contains('is-open');
    drawer.outerHTML = renderCampaignBrief(selected, completedMissions, isOpen ?? drawerOpen);
  }
}

export function renderCampaign(selectedId, completedMissions = {}, drawerOpen = true) {
  const selected = CAMPAIGN_MISSIONS.find((m) => m.id === selectedId) || CAMPAIGN_MISSIONS[0];
  const highestUnlockedIndex = CAMPAIGN_MISSIONS.reduce(
    (max, m, idx) => (isCampaignMissionUnlocked(m.id, completedMissions) ? Math.max(max, idx) : max),
    0
  );

  // SVG Paths
  const fullRoutePath = buildSvgPath(CAMPAIGN_MISSIONS.length - 1);
  const activeRoutePath = buildSvgPath(highestUnlockedIndex);

  // Region Badges
  const regionBadgesHtml = CAMPAIGN_REGIONS.map(
    (r) => `
    <div class="cinematic-region-badge" style="left:${r.x}%;top:${r.y}%;--region-color:${r.color};--region-glow:${r.color}66;" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="region-badge-icon">${r.iconSvg}</svg>
      <span>${r.name}</span>
    </div>
  `
  ).join('');

  // 35 Nodes
  const nodesHtml = CAMPAIGN_MISSIONS.map((mission, index) => {
    const pt = CAMPAIGN_COORDINATES[index] || { x: 50, y: 50 };
    const { nodeStatus, badgeContent } = getMissionNodeView(mission, completedMissions);
    const isSelected = selected.id === mission.id;

    return `
      <button
        type="button"
        class="cinematic-node is-${nodeStatus} ${isSelected ? 'is-selected' : ''}"
        style="left:${pt.x}%;top:${pt.y}%;--node-accent:${mission.color};"
        data-action="select-campaign-mission"
        data-mission="${mission.id}"
        aria-pressed="${isSelected}"
        aria-label="Mission ${mission.number}: ${mission.name}. ${nodeStatus}."
        title="${mission.number}. ${mission.name}"
      >
        ${nodeStatus === 'available' ? `<div class="node-pulse" aria-hidden="true"><svg viewBox="0 0 100 86.6" aria-hidden="true"><polygon points="${HEX_POINTS}"/></svg></div>` : ''}
        <div class="node-badge">
          ${badgeContent}
        </div>
      </button>
    `;
  }).join('');

  return `
    <div class="cinematic-campaign">
      <!-- Main Map Board -->
      <div class="cinematic-map-scroll">
        <div class="cinematic-map-board">
          <svg viewBox="0 0 1376 768" class="cinematic-path-svg" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id="gold-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <!-- Contrast casing under the route -->
            <path d="${fullRoutePath}" class="path-casing" />
            <!-- Background base path for locked sectors -->
            <path d="${fullRoutePath}" class="path-base" />
            <!-- Active / completed glowing path -->
            <path d="${activeRoutePath}" class="path-active" filter="url(#gold-glow)" />
          </svg>

          <!-- 7 Region Badges -->
          ${regionBadgesHtml}

          <!-- 35 Checkpoint Nodes -->
          ${nodesHtml}

          <!-- Sliding Bottom Briefing Drawer -->
          ${renderCampaignBrief(selected, completedMissions, drawerOpen)}
        </div>
      </div>
    </div>
  `;
}
