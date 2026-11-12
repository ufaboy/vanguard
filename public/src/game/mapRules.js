/** Map Types, Game Modes & Victory/Defeat Rules Catalog. */

export const MAP_MODES = Object.freeze({
  EXTERMINATION: 'extermination',
  STRONGHOLD_ASSAULT: 'stronghold_assault',
  BASE_DEFENSE: 'base_defense',
  CONTRACT: 'contract',
  SURVIVAL: 'survival',
});

export const VICTORY_CONDITIONS = Object.freeze({
  DESTROY_ALL_ENEMIES: 'destroy_all_enemies',
  DESTROY_ENEMY_BASE: 'destroy_enemy_base',
  CONTRACT_EXTRACTION: 'contract_extraction',
  ENDLESS_SURVIVAL: 'endless_survival',
});

export const DEFEAT_CONDITIONS = Object.freeze({
  PLAYER_DESTROYED: 'player_destroyed',
  PLAYER_OR_BASE_DESTROYED: 'player_or_base_destroyed',
});

export const PLAYER_BASE_ROLES = Object.freeze({
  REPAIR_BAY_ONLY: 'repair_bay_only',
  CRITICAL_HQ_AND_REPAIR: 'critical_hq_and_repair',
});

/** Legacy and shorthand mode aliases mapped to canonical `MAP_MODES`. */
const MODE_ALIASES = Object.freeze({
  default: MAP_MODES.EXTERMINATION,
  standard: MAP_MODES.EXTERMINATION,
  assault: MAP_MODES.EXTERMINATION,
  sweep: MAP_MODES.EXTERMINATION,
  extermination: MAP_MODES.EXTERMINATION,
  stronghold: MAP_MODES.STRONGHOLD_ASSAULT,
  stronghold_assault: MAP_MODES.STRONGHOLD_ASSAULT,
  enemy_base: MAP_MODES.STRONGHOLD_ASSAULT,
  siege: MAP_MODES.STRONGHOLD_ASSAULT,
  defense: MAP_MODES.BASE_DEFENSE,
  base_defense: MAP_MODES.BASE_DEFENSE,
  contract: MAP_MODES.CONTRACT,
  logistics_raid: MAP_MODES.CONTRACT,
  survival: MAP_MODES.SURVIVAL,
  endless: MAP_MODES.SURVIVAL,
});

/** Master catalog of map mode rules and victory/defeat specifications. */
export const MAP_MODE_CONFIGS = Object.freeze({
  [MAP_MODES.EXTERMINATION]: Object.freeze({
    id: MAP_MODES.EXTERMINATION,
    code: 'MODE-01 // EXTERMINATION',
    name: 'Total Extermination',
    shortLabel: 'DESTROY ALL HOSTILES',
    accentHex: '#F59E0B',
    victoryCondition: VICTORY_CONDITIONS.DESTROY_ALL_ENEMIES,
    defeatCondition: DEFEAT_CONDITIONS.PLAYER_DESTROYED,
    playerBaseRole: PLAYER_BASE_ROLES.REPAIR_BAY_ONLY,
    defeatOnPlayerDestroyed: true,
    defeatOnBaseLoss: false,
    victoryOnAllEnemiesDestroyed: true,
    victoryOnEnemyBaseDestroyed: false,
    spawnSectorBossOnClear: true,
    hasEnemyFortifiedBase: false,
    enemyBaseMaxHp: 0,
    description:
      'Standard tactical sweep: eliminate all enemy tanks in the sector and defeat the Sector Commander. Your base serves strictly as a Field Repair Bay — losing it disables base repairs but does not cause defeat.',
    objectiveBanner: 'OBJECTIVE: ELIMINATE ALL HOSTILE ARMOR IN SECTOR',
    victoryBanner:
      'ALL HOSTILE FORCES ELIMINATED! REMAINING BATTLEFIELD LOOT AUTO-COLLECTED!',
    baseLostBanner:
      'REPAIR BASE DESTROYED! FIELD REPAIR BAY OFFLINE — CONTINUE THE ASSAULT!',
  }),

  [MAP_MODES.STRONGHOLD_ASSAULT]: Object.freeze({
    id: MAP_MODES.STRONGHOLD_ASSAULT,
    code: 'MODE-02 // STRONGHOLD SIEGE',
    name: 'Enemy Base Assault',
    shortLabel: 'DESTROY ENEMY CITADEL',
    accentHex: '#EF4444',
    victoryCondition: VICTORY_CONDITIONS.DESTROY_ENEMY_BASE,
    defeatCondition: DEFEAT_CONDITIONS.PLAYER_DESTROYED,
    playerBaseRole: PLAYER_BASE_ROLES.REPAIR_BAY_ONLY,
    defeatOnPlayerDestroyed: true,
    defeatOnBaseLoss: false,
    victoryOnAllEnemiesDestroyed: false,
    victoryOnEnemyBaseDestroyed: true,
    spawnSectorBossOnClear: false,
    hasEnemyFortifiedBase: true,
    enemyBaseMaxHp: 48,
    description:
      'Breach the enemy defensive line and destroy the heavily fortified Enemy Command Stronghold guarded by hostile armor. Destroying the enemy stronghold immediately secures victory.',
    objectiveBanner:
      'OBJECTIVE: BREACH DEFENSES & DESTROY THE FORTIFIED ENEMY STRONGHOLD',
    victoryBanner:
      'ENEMY FORTIFIED STRONGHOLD DESTROYED! SECTOR SECURED & LOOT AUTO-COLLECTED!',
    baseLostBanner:
      'REPAIR BASE DESTROYED! FIELD REPAIR BAY OFFLINE — CONTINUE THE SIEGE!',
  }),

  [MAP_MODES.BASE_DEFENSE]: Object.freeze({
    id: MAP_MODES.BASE_DEFENSE,
    code: 'MODE-03 // HQ DEFENSE',
    name: 'Fortified Base Defense',
    shortLabel: 'DEFEND ALLIED HQ',
    accentHex: '#38BDF8',
    victoryCondition: VICTORY_CONDITIONS.DESTROY_ALL_ENEMIES,
    defeatCondition: DEFEAT_CONDITIONS.PLAYER_OR_BASE_DESTROYED,
    playerBaseRole: PLAYER_BASE_ROLES.CRITICAL_HQ_AND_REPAIR,
    defeatOnPlayerDestroyed: true,
    defeatOnBaseLoss: true,
    victoryOnAllEnemiesDestroyed: true,
    victoryOnEnemyBaseDestroyed: false,
    spawnSectorBossOnClear: true,
    hasEnemyFortifiedBase: false,
    enemyBaseMaxHp: 0,
    description:
      'Hold the line against incoming armored waves. Both your tank and the Allied Command HQ must survive — if the HQ is destroyed, the mission fails immediately.',
    objectiveBanner:
      'OBJECTIVE: DEFEND ALLIED COMMAND HQ & REPEL ALL ATTACKING WAVES',
    victoryBanner:
      'ALL ATTACKING WAVES REPELLED! ALLIED HQ SECURED & LOOT AUTO-COLLECTED!',
    baseLostBanner: 'COMMAND HQ DESTROYED! SECTOR DEFENSE BREACHED!',
  }),

  [MAP_MODES.CONTRACT]: Object.freeze({
    id: MAP_MODES.CONTRACT,
    code: 'MODE-04 // CONTRACT RAID',
    name: 'Tactical Contract Raid',
    shortLabel: 'RECOVER CARGO & EXTRACT',
    accentHex: '#38BDF8',
    victoryCondition: VICTORY_CONDITIONS.CONTRACT_EXTRACTION,
    defeatCondition: DEFEAT_CONDITIONS.PLAYER_DESTROYED,
    playerBaseRole: PLAYER_BASE_ROLES.REPAIR_BAY_ONLY,
    defeatOnPlayerDestroyed: true,
    defeatOnBaseLoss: false,
    victoryOnAllEnemiesDestroyed: false,
    victoryOnEnemyBaseDestroyed: false,
    victoryOnContractExtraction: true,
    spawnSectorBossOnClear: false,
    hasEnemyFortifiedBase: false,
    enemyBaseMaxHp: 0,
    description:
      'Logistics raid: recover at least two of three sealed data containers to the southern delivery pad and trigger extraction. Eliminating all hostiles never completes the contract; losing the repair HQ disables repairs and Hangar access without causing defeat.',
    objectiveBanner:
      'CONTRACT OBJECTIVE: DELIVER 2+ DATA CONTAINERS TO SOUTH PAD & EXTRACT',
    victoryBanner:
      'CONTRACT COMPLETE! EXTRACTION CONFIRMED & PAYOUT COMMITTED!',
    baseLostBanner:
      'REPAIR HQ DESTROYED! FIELD REPAIRS & HANGAR OFFLINE — DELIVERY PAD REMAINS ACTIVE!',
  }),

  [MAP_MODES.SURVIVAL]: Object.freeze({
    id: MAP_MODES.SURVIVAL,
    code: 'MODE-05 // ENDLESS SURVIVAL',
    name: 'Endless Survival',
    shortLabel: 'SURVIVE ENDLESS WAVES',
    accentHex: '#F97316',
    victoryCondition: VICTORY_CONDITIONS.ENDLESS_SURVIVAL,
    defeatCondition: DEFEAT_CONDITIONS.PLAYER_DESTROYED,
    playerBaseRole: PLAYER_BASE_ROLES.REPAIR_BAY_ONLY,
    defeatOnPlayerDestroyed: true,
    defeatOnBaseLoss: false,
    victoryOnAllEnemiesDestroyed: false,
    victoryOnEnemyBaseDestroyed: false,
    victoryOnContractExtraction: false,
    spawnSectorBossOnClear: false,
    hasEnemyFortifiedBase: false,
    enemyBaseMaxHp: 0,
    description:
      'Endless wave holdout starting on a stock Tier I tank. Earn session credits to upgrade in the field Hangar [U]. Losing the Allied HQ disables repairs and Hangar access until a BASE_RESTORE pickup is recovered from supply crates.',
    objectiveBanner:
      'SURVIVAL OBJECTIVE: HOLD THE LINE AGAINST ENDLESS ARMORED WAVES',
    victoryBanner: 'WAVE CLEARED!',
    baseLostBanner:
      'REPAIR HQ DESTROYED! FIELD REPAIRS & HANGAR OFFLINE — BREAK SUPPLY CRATES FOR BASE RESTORE!',
  }),
});

export const MAP_MODES_LIST = Object.freeze([
  MAP_MODE_CONFIGS[MAP_MODES.EXTERMINATION],
  MAP_MODE_CONFIGS[MAP_MODES.STRONGHOLD_ASSAULT],
  MAP_MODE_CONFIGS[MAP_MODES.BASE_DEFENSE],
  MAP_MODE_CONFIGS[MAP_MODES.CONTRACT],
  MAP_MODE_CONFIGS[MAP_MODES.SURVIVAL],
]);

/** Resolves the canonical map rules object from a map JSON object or mode string. */
export function resolveMapRules(rawMapOrMode = {}) {
  if (typeof rawMapOrMode === 'string') {
    const key =
      MODE_ALIASES[rawMapOrMode.toLowerCase()] || MAP_MODES.EXTERMINATION;
    return MAP_MODE_CONFIGS[key];
  }

  const rawRules = rawMapOrMode.rules || rawMapOrMode.mapRules || {};
  const rawModeStr = String(
    rawRules.gameMode ||
      rawRules.mode ||
      rawMapOrMode.gameMode ||
      rawMapOrMode.mode ||
      MAP_MODES.EXTERMINATION
  ).toLowerCase();

  const canonicalMode = MODE_ALIASES[rawModeStr] || MAP_MODES.EXTERMINATION;
  const baseConfig =
    MAP_MODE_CONFIGS[canonicalMode] || MAP_MODE_CONFIGS[MAP_MODES.EXTERMINATION];

  const hasEnemyBase = Boolean(
    rawRules.hasEnemyFortifiedBase ??
      rawMapOrMode.hasEnemyFortifiedBase ??
      rawMapOrMode.enemyBase ??
      baseConfig.hasEnemyFortifiedBase
  );

  const victoryCondition =
    rawRules.victoryCondition ||
    rawMapOrMode.victoryCondition ||
    (hasEnemyBase
      ? VICTORY_CONDITIONS.DESTROY_ENEMY_BASE
      : baseConfig.victoryCondition);

  const defeatOnBaseLoss = Boolean(
    rawRules.defeatOnBaseLoss ??
      rawMapOrMode.defeatOnBaseLoss ??
      baseConfig.defeatOnBaseLoss
  );

  const defeatCondition = defeatOnBaseLoss
    ? DEFEAT_CONDITIONS.PLAYER_OR_BASE_DESTROYED
    : DEFEAT_CONDITIONS.PLAYER_DESTROYED;

  const enemyBaseCfg = rawMapOrMode.enemyBase || rawRules.enemyBase || {};

  return Object.freeze({
    ...baseConfig,
    gameMode: canonicalMode,
    victoryCondition,
    defeatCondition,
    defeatOnBaseLoss,
    victoryOnEnemyBaseDestroyed:
      victoryCondition === VICTORY_CONDITIONS.DESTROY_ENEMY_BASE,
    victoryOnAllEnemiesDestroyed: Boolean(
      rawRules.victoryOnAllEnemiesDestroyed ??
        (victoryCondition === VICTORY_CONDITIONS.DESTROY_ALL_ENEMIES)
    ),
    victoryOnContractExtraction:
      victoryCondition === VICTORY_CONDITIONS.CONTRACT_EXTRACTION,
    spawnSectorBossOnClear: Boolean(
      rawRules.spawnSectorBossOnClear ??
        rawMapOrMode.spawnSectorBossOnClear ??
        baseConfig.spawnSectorBossOnClear
    ),
    hasEnemyFortifiedBase: hasEnemyBase,
    enemyBaseCell: enemyBaseCfg.cell ||
      rawMapOrMode.enemyBaseCell || { row: 3, col: 17 },
    enemyBaseMaxHp: Number(
      enemyBaseCfg.maxHp ??
        rawMapOrMode.enemyBaseMaxHp ??
        (hasEnemyBase ? baseConfig.enemyBaseMaxHp || 48 : 0)
    ),
    enemyBaseName:
      enemyBaseCfg.name ||
      rawMapOrMode.enemyBaseName ||
      'Enemy Fortified Citadel',
    fortifyEnemyBasePerimeter: Boolean(
      enemyBaseCfg.fortifyPerimeter ?? true
    ),
  });
}

/** Evaluates whether the active map's victory condition has been met. */
export function checkMapVictory(rules, state) {
  const activeRules = rules || MAP_MODE_CONFIGS[MAP_MODES.EXTERMINATION];
  if (
    activeRules.victoryOnContractExtraction &&
    state.contractExtracted
  ) {
    return {
      isVictory: true,
      reason: VICTORY_CONDITIONS.CONTRACT_EXTRACTION,
      banner: activeRules.victoryBanner,
    };
  }

  const bossDone = !activeRules.spawnSectorBossOnClear || Boolean(state.bossDefeated);
  if (
    activeRules.victoryOnEnemyBaseDestroyed &&
    activeRules.hasEnemyFortifiedBase &&
    state.enemyBaseDestroyed &&
    bossDone
  ) {
    return {
      isVictory: true,
      reason: VICTORY_CONDITIONS.DESTROY_ENEMY_BASE,
      banner: activeRules.victoryBanner,
    };
  }

  if (activeRules.victoryOnAllEnemiesDestroyed) {
    const allVanguardGone =
      (state.vanguardRemainingToSpawn || 0) <= 0 &&
      (state.activeEnemiesCount || 0) === 0;
    if (allVanguardGone && bossDone) {
      return {
        isVictory: true,
        reason: VICTORY_CONDITIONS.DESTROY_ALL_ENEMIES,
        banner: activeRules.victoryBanner,
      };
    }
  }

  return { isVictory: false, reason: null, banner: null };
}

/** Evaluates whether the active map's defeat condition has been met. */
export function checkMapDefeat(rules, state) {
  const activeRules = rules || MAP_MODE_CONFIGS[MAP_MODES.EXTERMINATION];
  if (state.playerHp <= 0) {
    return {
      isDefeat: true,
      reason: DEFEAT_CONDITIONS.PLAYER_DESTROYED,
      banner: 'PLAYER TANK DESTROYED IN ACTION!',
    };
  }
  if (activeRules.defeatOnBaseLoss && state.baseAlive === false) {
    return {
      isDefeat: true,
      reason: DEFEAT_CONDITIONS.PLAYER_OR_BASE_DESTROYED,
      banner: activeRules.baseLostBanner,
    };
  }
  return { isDefeat: false, reason: null, banner: null };
}
