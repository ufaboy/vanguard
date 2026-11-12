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
  { x: 10.5, y: 77.0 },
  { x: 15.8, y: 75.8 },
  { x: 21.2, y: 79.2 },
  { x: 27.2, y: 80.5 },
  { x: 33.2, y: 82.2 },
  // 16-20: Coastal Wetlands
  { x: 41.8, y: 83.5 },
  { x: 49.8, y: 81.2 },
  { x: 57.0, y: 82.2 },
  { x: 64.0, y: 84.2 },
  { x: 70.5, y: 84.8 },
  // 21-25: Frozen Highlands
  { x: 78.2, y: 81.8 },
  { x: 78.2, y: 73.5 },
  { x: 81.0, y: 66.5 },
  { x: 85.5, y: 62.5 },
  { x: 83.0, y: 55.0 },
  // 26-30: Industrial Belt
  { x: 83.5, y: 45.5 },
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
    y: 69.0,
    color: '#f59e0b',
    iconSvg: '<path d="M12 3v18M8 8v4a4 4 0 008 0V7M5 12h3M16 11h3"/>',
  },
  {
    id: 'coast',
    name: 'Coastal Wetlands',
    x: 42.0,
    y: 69.5,
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
    y: 43.5,
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

export function renderCampaignBrief(selected, completedMissions = {}, drawerOpen = true) {
  const sector = SECTORS.find((item) => item.mapId === selected.id);
  const chapter = CAMPAIGN_CHAPTERS.find((c) => c.missions.some((m) => m.id === selected.id)) || CAMPAIGN_CHAPTERS[0];
  const available = selected.status === 'available' && Boolean(sector);
  const playable = available && isCampaignMissionUnlocked(selected.id, completedMissions);
  const completed = Boolean(completedMissions[selected.id]);

  const bossNote = sector?.rules.spawnSectorBossOnClear
    ? `Sector boss: ${sector.bossName}.`
    : 'No sector boss.';
  const statusSummary = sector?.rules.victoryOnEnemyBaseDestroyed
    ? `Destroy the enemy command core${sector?.rules.spawnSectorBossOnClear ? ' and sector boss' : ''}. Up to ${selected.enemyTotal} hostiles; clearing all defenders is optional. Your base provides repairs. ${bossNote}`
    : sector?.defeatOnBaseLoss
    ? `Defend the allied HQ and clear all ${selected.enemyTotal} hostiles. Losing the HQ ends the mission. ${bossNote}`
    : `Clear all ${selected.enemyTotal} hostiles. Your base provides repairs; losing it does not end the mission. ${bossNote}`;

  const roster = selected.enemyRoster
    .map((group) => {
      const isBoss = group.phase === 'boss';
      const isEscort = group.phase === 'bossEscort';
      const label = group.type.replaceAll('_', ' ');
      return `<li><span>${label}${
        isBoss
          ? ' <small class="text-rose-400 font-bold">(BOSS)</small>'
          : isEscort
          ? ' <small class="text-amber-400 font-semibold">(ESCORT)</small>'
          : ''
      }</span><strong>× ${group.count}</strong></li>`;
    })
    .join('');

  return `
    <aside
      class="cinematic-brief-drawer ${drawerOpen ? 'is-open' : 'is-closed'}"
      aria-label="Selected mission briefing"
      style="--chapter-color:${selected.color};"
    >
      <div class="drawer-handle-bar">
        <div class="drawer-header-left">
          <span class="drawer-tag" style="border-color:${selected.color};color:${selected.color};background:${selected.color}15;">
            ${chapter.name}
          </span>
          <span class="drawer-sector-code">SECTOR ${String(selected.number).padStart(2, '0')} / 35</span>
          <h2 class="drawer-title">${selected.name}</h2>
        </div>
        <div class="drawer-header-right">
          <span class="drawer-status-pill is-${completed ? 'completed' : playable ? 'available' : 'locked'}">
            ${completed ? '✓ COMPLETED' : playable ? '● READY TO DEPLOY' : '🔒 LOCKED'}
          </span>
          <button
            type="button"
            class="drawer-toggle-btn"
            data-action="toggle-campaign-brief"
            aria-label="${drawerOpen ? 'Hide briefing drawer' : 'Open briefing drawer'}"
          >
            ${drawerOpen ? '✕' : '▲'}
          </button>
        </div>
      </div>

      <div class="drawer-body">
        <div class="drawer-grid">
          <!-- Col 1: Recon & Objectives -->
          <div class="drawer-col drawer-recon">
            <div class="drawer-section-heading">TACTICAL RECON</div>
            <dl class="drawer-recon-list">
              <dt>Objective</dt>
              <dd>${selected.objective}</dd>
              <dt>Battlefield Geography</dt>
              <dd>${selected.layout}</dd>
              <dt>Combat Conditions</dt>
              <dd>${statusSummary}</dd>
            </dl>
          </div>

          <!-- Col 2: Hostile Palette & Deployment -->
          <div class="drawer-col drawer-hostiles">
            <div class="drawer-section-heading">HOSTILE DETECTIONS · ${selected.enemyTotal} TOTAL</div>
            <ul class="cinematic-roster">
              ${roster}
            </ul>
            <div class="drawer-deployment-intel">
              <strong>DEPLOYMENT:</strong> ${selected.deploymentPlan.initialCount} initial / ${selected.deploymentPlan.maxConcurrent} max concurrent
              <p>${selected.deploymentPlan.notes}</p>
            </div>
          </div>

          <!-- Col 3: Deploy Action -->
          <div class="drawer-col drawer-action">
            <div class="drawer-difficulty-badge is-${selected.difficulty.toLowerCase()}">
              DIFFICULTY: ${selected.difficulty.toUpperCase()}
            </div>

            ${
              playable
                ? `
              <button class="cinematic-deploy-btn" data-action="start-campaign-mission" data-mission="${selected.id}">
                <span class="deploy-label">Start</span>
              </button>
            `
                : `
              <button class="cinematic-deploy-btn is-disabled" disabled>
                <span class="deploy-label">Locked</span>
                <small class="deploy-sub">Complete mission ${selected.number - 1} first</small>
              </button>
            `
            }
          </div>
        </div>
      </div>
    </aside>
  `;
}

export function renderCampaign(selectedId, completedMissions = {}, drawerOpen = true) {
  const selected = CAMPAIGN_MISSIONS.find((m) => m.id === selectedId) || CAMPAIGN_MISSIONS[0];
  const completedCount = CAMPAIGN_MISSIONS.filter((m) => Boolean(completedMissions[m.id])).length;
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
    const isDone = Boolean(completedMissions[mission.id]);
    const isAvail = mission.status === 'available';
    const isUnlock = isCampaignMissionUnlocked(mission.id, completedMissions);
    const nodeStatus = isDone ? 'completed' : !isAvail ? 'planned' : isUnlock ? 'available' : 'locked';
    const isSelected = selected.id === mission.id;
    const nodeNum = String(mission.number).padStart(2, '0');

    let badgeContent = '';
    if (nodeStatus === 'completed') {
      badgeContent = `<span class="node-num">${nodeNum}</span><span class="node-stars" aria-label="3 stars">★★★</span>`;
    } else if (nodeStatus === 'available') {
      badgeContent = `<span class="node-num">${nodeNum}</span>`;
    } else {
      badgeContent = `<span class="node-num">${nodeNum}</span><span class="node-lock" aria-label="Locked">🔒</span>`;
    }

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
        ${nodeStatus === 'available' ? '<div class="node-pulse" aria-hidden="true"></div>' : ''}
        <div class="node-badge">
          ${badgeContent}
        </div>
      </button>
    `;
  }).join('');

  return `
    <div class="cinematic-campaign">
      <!-- Top Tactical Bar -->
      <div class="cinematic-top-bar">
        <div class="cinematic-lead">
          <strong>ROAD TO THE CAPITAL</strong>
          <span>35 Missions · Seven Regions · Linear Campaign</span>
        </div>
        <div class="cinematic-legend">
          <span class="legend-pill is-avail"><i class="legend-dot"></i> Available</span>
          <span class="legend-pill is-done"><i class="legend-star">★</i> Completed</span>
          <span class="legend-pill is-locked"><i class="legend-lock">🔒</i> Locked</span>
          <div class="cinematic-progress-counter">
            <strong>${completedCount} / 35</strong> SECURED
          </div>
        </div>
      </div>

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
