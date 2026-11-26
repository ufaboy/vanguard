/**
 * HQ Command Skill Tree: branches, 3-level node progression, rank gates, and bonus resolution.
 * Pure simulation module (zero DOM / Three.js dependencies).
 */

import { N_, t } from '../i18n/index.js';
import { getAirStrikeRequiredRank, isAirStrikeVariantUnlocked } from './medals.js';

export const HQ_TREE_MAX_LEVEL = 3;

export const HQ_TREE_BRANCHES = Object.freeze([
  Object.freeze({ id: 'air_strike', label: N_('Air Strike') }),
  Object.freeze({ id: 'logistics', label: N_('Logistics') }),
  Object.freeze({ id: 'hq_passives', label: N_('HQ & Recon') }),
]);

export const HQ_TREE_NODES = Object.freeze([
  // --- Branch 1: Air Strike ---
  Object.freeze({
    id: 'STRIKE_BOMBS',
    branch: 'air_strike',
    strikeVariantId: 'STRIKE_BOMBS',
    name: N_('Bomber Wing'),
    summary: N_('Increases bomb payload, blast radius, and damage per sortie.'),
    costs: Object.freeze([0, 1600, 3600]),
    levels: Object.freeze([
      Object.freeze({ bombCount: 3, radiusCells: 1.5, damage: 24, label: N_('3 bombs · 1.5c radius') }),
      Object.freeze({ bombCount: 4, radiusCells: 1.7, damage: 26, label: N_('4 bombs · 1.7c radius') }),
      Object.freeze({ bombCount: 5, radiusCells: 1.9, damage: 28, label: N_('5 bombs · 1.9c radius') }),
    ]),
  }),
  Object.freeze({
    id: 'STRIKE_MINES',
    branch: 'air_strike',
    strikeVariantId: 'STRIKE_MINES',
    name: N_('Carpet Air Mines'),
    summary: N_('Expands minefield density and drop zone coverage.'),
    costs: Object.freeze([0, 1800, 3800]),
    levels: Object.freeze([
      Object.freeze({ mineCount: 7, zoneHalfCells: 4.0, label: N_('7 mines · 4.0c zone') }),
      Object.freeze({ mineCount: 10, zoneHalfCells: 4.5, label: N_('10 mines · 4.5c zone') }),
      Object.freeze({ mineCount: 14, zoneHalfCells: 5.0, label: N_('14 mines · 5.0c zone') }),
    ]),
  }),
  Object.freeze({
    id: 'STRIKE_THERMO',
    branch: 'air_strike',
    strikeVariantId: 'STRIKE_THERMO',
    name: N_('Thermobaric Missile'),
    summary: N_('Boosts fuel-air blast radius, damage, and armor penetration.'),
    costs: Object.freeze([0, 2200, 4500]),
    levels: Object.freeze([
      Object.freeze({ radiusCells: 3.5, damage: 25, penetration: 25, label: N_('3.5c blast · 25 dmg') }),
      Object.freeze({ radiusCells: 4.2, damage: 30, penetration: 30, label: N_('4.2c blast · 30 dmg') }),
      Object.freeze({ radiusCells: 5.0, damage: 36, penetration: 35, label: N_('5.0c blast · 36 dmg') }),
    ]),
  }),
  Object.freeze({
    id: 'STRIKE_AC130',
    branch: 'air_strike',
    strikeVariantId: 'STRIKE_AC130',
    name: N_('AC-130 Spooky'),
    summary: N_('Extends gunship loiter time, patrol radius, and cannon fire rate.'),
    costs: Object.freeze([0, 2500, 5000]),
    levels: Object.freeze([
      Object.freeze({ durationSec: 15, fireIntervalSec: 0.7, radiusCells: 5.5, label: N_('15s loiter · 0.7s RoF') }),
      Object.freeze({ durationSec: 20, fireIntervalSec: 0.6, radiusCells: 6.0, label: N_('20s loiter · 0.6s RoF') }),
      Object.freeze({ durationSec: 25, fireIntervalSec: 0.5, radiusCells: 6.5, label: N_('25s loiter · 0.5s RoF') }),
    ]),
  }),

  // --- Branch 2: Logistics ---
  Object.freeze({
    id: 'AIRDROP',
    branch: 'logistics',
    strikeVariantId: null,
    name: N_('Supply Air Drop'),
    summary: N_('Adds extra cannon shells, APS charges, ATGMs, and repair kits per drop.'),
    costs: Object.freeze([0, 1500, 3500]),
    levels: Object.freeze([
      Object.freeze({ shells: 50, aps: 8, missiles: 4, repairKits: 1, label: N_('50 shells · 8 APS · 1 kit') }),
      Object.freeze({ shells: 70, aps: 12, missiles: 6, repairKits: 2, label: N_('70 shells · 12 APS · 2 kits') }),
      Object.freeze({ shells: 95, aps: 16, missiles: 8, repairKits: 3, label: N_('95 shells · 16 APS · 3 kits') }),
    ]),
  }),
  Object.freeze({
    id: 'REPAIR',
    branch: 'logistics',
    strikeVariantId: null,
    name: N_('Air Repair Drone'),
    summary: N_('Increases hull HP restored and speeds up drone field repairs.'),
    costs: Object.freeze([0, 1500, 3500]),
    levels: Object.freeze([
      Object.freeze({ healAmount: 20, durationSec: 3.5, label: N_('+20 HP · 3.5s') }),
      Object.freeze({ healAmount: 30, durationSec: 3.0, label: N_('+30 HP · 3.0s') }),
      Object.freeze({ healAmount: 40, durationSec: 2.5, label: N_('+40 HP · 2.5s') }),
    ]),
  }),

  // --- Branch 3: HQ & Recon Passives ---
  Object.freeze({
    id: 'RADAR_RANGE',
    branch: 'hq_passives',
    strikeVariantId: null,
    name: N_('Tactical Radar'),
    summary: N_('Expands enemy detection radius on the tactical radar.'),
    costs: Object.freeze([0, 1600, 3600]),
    levels: Object.freeze([
      Object.freeze({ radarBonusCells: 0, label: N_('+0 cells (16c base)') }),
      Object.freeze({ radarBonusCells: 4, label: N_('+4 cells (20c range)') }),
      Object.freeze({ radarBonusCells: 8, label: N_('+8 cells (24c range)') }),
    ]),
  }),
  Object.freeze({
    id: 'RECON_OPTICS',
    branch: 'hq_passives',
    strikeVariantId: null,
    name: N_('Recon Optics'),
    summary: N_('Improves tank sight range and recon drone scan radius and orbit time.'),
    costs: Object.freeze([0, 1600, 3600]),
    levels: Object.freeze([
      Object.freeze({ sightBonusCells: 0, reconRadiusBonusCells: 0, reconDurationBonusSec: 0, label: N_('Base optics') }),
      Object.freeze({ sightBonusCells: 2, reconRadiusBonusCells: 1.5, reconDurationBonusSec: 3, label: N_('+2c sight · +3s drone') }),
      Object.freeze({ sightBonusCells: 4, reconRadiusBonusCells: 3.0, reconDurationBonusSec: 6, label: N_('+4c sight · +6s drone') }),
    ]),
  }),
  Object.freeze({
    id: 'HQ_FORTIFICATION',
    branch: 'hq_passives',
    strikeVariantId: null,
    name: N_('HQ Fortification'),
    summary: N_('Reinforces the Allied Command Base with extra structural HP.'),
    costs: Object.freeze([0, 1800, 4000]),
    levels: Object.freeze([
      Object.freeze({ baseHpMultiplier: 1.0, label: N_('+0% HQ HP') }),
      Object.freeze({ baseHpMultiplier: 1.25, label: N_('+25% HQ HP') }),
      Object.freeze({ baseHpMultiplier: 1.5, label: N_('+50% HQ HP') }),
    ]),
  }),
]);

const NODE_BY_ID = Object.freeze(
  Object.fromEntries(HQ_TREE_NODES.map((node) => [node.id, node]))
);

export function createDefaultHqTree() {
  const tree = {};
  for (const node of HQ_TREE_NODES) {
    tree[node.id] = 1;
  }
  return tree;
}

export function normalizeHqTree(raw) {
  const tree = createDefaultHqTree();
  if (!raw || typeof raw !== 'object') return tree;
  for (const node of HQ_TREE_NODES) {
    const val = Math.floor(Number(raw[node.id]) || 1);
    tree[node.id] = Math.max(1, Math.min(HQ_TREE_MAX_LEVEL, val));
  }
  return tree;
}

export function getHqNodeSpec(nodeId) {
  return NODE_BY_ID[nodeId] || null;
}

export function getHqNodeLevel(hqTree, nodeId) {
  const val = Math.floor(Number(hqTree?.[nodeId]) || 1);
  return Math.max(1, Math.min(HQ_TREE_MAX_LEVEL, val));
}

export function getHqNodeNextCost(nodeId, currentLevel) {
  const spec = getHqNodeSpec(nodeId);
  if (!spec || currentLevel >= HQ_TREE_MAX_LEVEL) return null;
  return spec.costs[currentLevel] ?? null;
}

export function canUpgradeHqNode({
  hqTree,
  nodeId,
  credits = 0,
  playerRankId = 'recruit',
  profileMode = 'campaign',
}) {
  const spec = getHqNodeSpec(nodeId);
  if (!spec) {
    return { ok: false, reason: t('Unknown HQ node'), cost: null, nextLevel: null };
  }
  const level = getHqNodeLevel(hqTree, nodeId);
  if (level >= HQ_TREE_MAX_LEVEL) {
    return { ok: false, reason: t('Maximum level reached'), cost: null, nextLevel: null };
  }
  if (
    profileMode === 'campaign' &&
    spec.strikeVariantId &&
    !isAirStrikeVariantUnlocked(spec.strikeVariantId, playerRankId, profileMode)
  ) {
    const reqRank = getAirStrikeRequiredRank(spec.strikeVariantId);
    return {
      ok: false,
      reason: t('REQUIRES RANK: {rank}', { rank: t(reqRank.title) }),
      cost: getHqNodeNextCost(nodeId, level),
      nextLevel: level + 1,
    };
  }
  const cost = getHqNodeNextCost(nodeId, level);
  if (cost == null || credits < cost) {
    return {
      ok: false,
      reason: t('Insufficient credits (${cost})', { cost: cost ?? 0 }),
      cost,
      nextLevel: level + 1,
    };
  }
  return { ok: true, reason: '', cost, nextLevel: level + 1 };
}

export function upgradeHqNode(hqTree, nodeId) {
  const next = normalizeHqTree(hqTree);
  if (!NODE_BY_ID[nodeId]) return next;
  next[nodeId] = Math.min(HQ_TREE_MAX_LEVEL, next[nodeId] + 1);
  return next;
}

export function getHqBonuses(hqTree) {
  const tree = normalizeHqTree(hqTree);
  const levelData = (id) => NODE_BY_ID[id].levels[tree[id] - 1];

  const bombs = levelData('STRIKE_BOMBS');
  const mines = levelData('STRIKE_MINES');
  const thermo = levelData('STRIKE_THERMO');
  const ac130 = levelData('STRIKE_AC130');
  const airdrop = levelData('AIRDROP');
  const repair = levelData('REPAIR');
  const radar = levelData('RADAR_RANGE');
  const optics = levelData('RECON_OPTICS');
  const fort = levelData('HQ_FORTIFICATION');

  return {
    bombCount: bombs.bombCount,
    bombRadiusCells: bombs.radiusCells,
    bombDamage: bombs.damage,
    mineCount: mines.mineCount,
    mineZoneHalfCells: mines.zoneHalfCells,
    thermoRadiusCells: thermo.radiusCells,
    thermoDamage: thermo.damage,
    thermoPenetration: thermo.penetration,
    ac130DurationSec: ac130.durationSec,
    ac130FireIntervalSec: ac130.fireIntervalSec,
    ac130RadiusCells: ac130.radiusCells,
    airdropShells: airdrop.shells,
    airdropAps: airdrop.aps,
    airdropMissiles: airdrop.missiles,
    airdropRepairKits: airdrop.repairKits,
    repairHealAmount: repair.healAmount,
    repairDurationSec: repair.durationSec,
    radarBonusCells: radar.radarBonusCells,
    sightBonusCells: optics.sightBonusCells,
    reconRadiusBonusCells: optics.reconRadiusBonusCells,
    reconDurationBonusSec: optics.reconDurationBonusSec,
    baseHpMultiplier: fort.baseHpMultiplier,
  };
}
