import { SECTORS } from '../game/levels.js';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_MISSIONS, isCampaignMissionUnlocked } from '../game/campaign.js';

function position(index) {
  const row = Math.floor(index / 5);
  const column = row % 2 ? 4 - index % 5 : index % 5;
  return { x: 82 + column * 124, y: 100 + row * 150 };
}

export function renderCampaign(selectedId, completedMissions = {}) {
  const selected = CAMPAIGN_MISSIONS.find(mission => mission.id === selectedId) || CAMPAIGN_MISSIONS[0];
  const sector = SECTORS.find(item => item.mapId === selected.id);
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
  const roster = selected.enemyRoster.map(group => `<li><span>${group.type.replaceAll('_', ' ')}${group.phase === 'bossEscort' ? ' <small>(Titan escort)</small>' : group.phase === 'boss' ? ' <small>(boss)</small>' : ''}</span><strong>× ${group.count}</strong></li>`).join('');
  const points = CAMPAIGN_MISSIONS.map((_, index) => position(index));
  const route = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const terrain = CAMPAIGN_CHAPTERS.map((chapter, row) => {
    const y = row * 150;
    let marks = '';
    for (let i = 0; i < 12; i++) {
      const x = 22 + i * 56;
      if (row === 1) marks += `<path d="M${x} ${y + 130} l12 -26 l12 26 Z"/>`;
      else if (row === 2 || row === 3) marks += `<path d="M${x} ${y + 133} q14 -14 28 0 t28 0" fill="none"/>`;
      else if (row === 4) marks += `<path d="M${x} ${y + 140} l22 -40 l22 40 Z"/>`;
      else marks += `<rect x="${x}" y="${y + 121}" width="22" height="19"/><rect x="${x + 27}" y="${y + 127}" width="12" height="13"/>`;
    }
    return `<g stroke="${chapter.color}" fill="${chapter.color}" opacity=".14"><rect x="0" y="${y}" width="660" height="150" fill-opacity=".3" stroke="none"/>${marks}</g>`;
  }).join('');
  const regions = CAMPAIGN_CHAPTERS.map((chapter, row) => `<div class="campaign-region" style="top:${row * 150 + 22}px;--chapter-color:${chapter.color}"><span>0${row + 1} / ${chapter.name}</span><small>${String(row * 5 + 1).padStart(2, '0')}—${String(row * 5 + 5).padStart(2, '0')}</small></div>`).join('');
  const checkpoints = CAMPAIGN_MISSIONS.map((mission, index) => {
    const point = points[index];
    const status = completedMissions[mission.id] ? 'completed' : mission.status !== 'available' ? 'planned' : isCampaignMissionUnlocked(mission.id, completedMissions) ? 'available' : 'locked';
    return `<button class="campaign-checkpoint ${selected.id === mission.id ? 'is-selected' : ''} is-${status}" style="left:${point.x}px;top:${point.y}px;--chapter-color:${mission.color}" data-action="select-campaign-mission" data-mission="${mission.id}" aria-pressed="${selected.id === mission.id}" aria-label="Mission ${mission.number}: ${mission.name}. ${mission.theme}. ${status}." title="${mission.name}">${String(mission.number).padStart(2, '0')}</button>`;
  }).join('');
  return `<p class="menu-lead">35 missions. Seven regions. One road to the capital.<br>Complete each mission to unlock the next battlefield. Inspect any checkpoint for its briefing.</p><div class="campaign-summary"><span>01 → 35 / LINEAR CAMPAIGN</span><span>◇ AVAILABLE</span><span>✓ COMPLETED</span><span>◇ LOCKED UNTIL PREVIOUS VICTORY</span><span>○ PLANNED</span><span>● SELECTED BRIEFING</span></div><div class="campaign-layout"><section class="campaign-map-scroll" aria-label="Campaign route map" tabindex="0"><div class="campaign-map"><svg viewBox="0 0 660 1050" width="660" height="1050" aria-hidden="true">${terrain}<path d="${route}" fill="none" stroke="#0b1017" stroke-width="12" stroke-linejoin="round"/><path d="${route}" fill="none" stroke="#8b9b91" stroke-width="2" stroke-dasharray="6 7" stroke-linejoin="round"/></svg>${regions}${checkpoints}</div></section><aside class="campaign-brief" aria-label="Selected mission briefing" style="--chapter-color:${selected.color}"><div class="menu-kicker">MISSION ${String(selected.number).padStart(2, '0')} / 35</div><h2>${selected.name}</h2><p class="campaign-theme">${selected.theme}</p><dl><dt>Objective</dt><dd>${selected.objective}</dd><dt>Battlefield plan</dt><dd>${selected.layout}</dd><dt>Enemy palette · ${selected.enemyTotal} tanks total</dt><dd><ul class="campaign-roster">${roster}</ul></dd><dt>Deployment plan</dt><dd>${selected.deploymentPlan.initialCount} initial / ${selected.deploymentPlan.maxConcurrent} maximum live<p class="campaign-deployment-note">${selected.deploymentPlan.notes}</p></dd><dt>Target difficulty</dt><dd>${selected.difficulty}</dd></dl><div class="campaign-planned"><strong>${playable ? completed ? 'COMPLETED' : 'READY TO DEPLOY' : available ? 'LOCKED' : 'IN PLANNING'}</strong><p>${playable ? statusSummary : available ? 'Complete the previous campaign mission to unlock this battlefield.' : 'This battlefield has not been built yet. Deployment is unavailable.'}</p></div>${playable ? `<button class="menu-primary" data-action="start-campaign-mission" data-mission="${selected.id}">${completed ? 'Replay' : 'Deploy'} ${selected.name} →</button>` : '<button class="menu-secondary" disabled>Deployment unavailable</button>'}<div class="campaign-brief-nav"><button class="menu-secondary" data-action="select-campaign-mission" data-mission="${CAMPAIGN_MISSIONS[selected.number - 2]?.id || selected.id}" ${selected.number === 1 ? 'disabled' : ''} aria-label="Previous mission">← Previous</button><button class="menu-secondary" data-action="select-campaign-mission" data-mission="${CAMPAIGN_MISSIONS[selected.number]?.id || selected.id}" ${selected.number === 35 ? 'disabled' : ''} aria-label="Next mission">Next →</button></div></aside></div>`;
}
