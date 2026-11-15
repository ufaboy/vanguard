/**
 * Survival Mode: "Paris: Last Stand" — Timed 7-Minute Holdout, Overtime & Survival Records.
 *
 * Rules:
 * - Every Survival run deploys in fortified central Paris on a stock Tier I tank with $500 session credits.
 * - Objective: Defend the Élysée Palace HQ (120 HP) for at least 7:00 (420s). Losing the HQ or player tank
 *   causes defeat.
 * - Waves arrive on a strict 60s timer (0:00, 1:00, ..., 5:00) even if prior waves are still active.
 * - Wave 7 at 6:00 deploys the Finale Sector Boss (MAMMOTH MK-V) with an armored escort.
 * - Reaching 7:00 with the HQ standing achieves Victory; the player may Extract or continue into Endless
 *   Overtime (rotating Sector Bosses every 5th wave: waves 10, 15, 20, 25...) to set higher records.
 * - Credits earned in Survival are spent in the field Hangar [U] during the run and never carry over
 *   to the main Campaign/Contracts profile.
 */

import { EnemyClass } from '../game/tanks.js';

export const SURVIVAL_CONFIG = Object.freeze({
  MAP_ID: 'survival-paris-last-stand',
  CODE: 'SURVIVAL S-01 // PARIS: LAST STAND',
  NAME: 'Paris: Last Stand',
  SUBTITLE: 'DEFEND THE ÉLYSÉE PALACE',
  STARTING_CREDITS: 500,
  HOLD_DURATION_SEC: 420.0,
  WAVE_INTERVAL_SEC: 60.0,
  FINALE_WAVE: 7,
  INTERMISSION_SEC: 15.0,
  EARLY_CALL_BONUS: 150,
  WAVE_BASE_REWARD: 250,
  WAVE_STEP_REWARD: 50,
  BOSS_WAVE_BONUS: 600,
  SUPPLY_CRATES_PER_WAVE: 3,
  BARRELS_PER_WAVE: 2,
});

const BOSS_ROTATION = Object.freeze([
  Object.freeze({
    bossClass: EnemyClass.BOSS_MAMMOTH,
    bossName: 'MAMMOTH MK-V',
    bossTitle: 'Super-Heavy Siege Dreadnought',
    title: 'FINAL ASSAULT // SIEGE DREADNOUGHT',
    escortBase: [
      EnemyClass.STANDARD,
      EnemyClass.ARMOR,
      EnemyClass.ENGINEER,
      EnemyClass.SAPPER,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
    ],
  }),
  Object.freeze({
    bossClass: EnemyClass.BOSS_HYDRA,
    bossName: 'HYDRA MLRS-X',
    bossTitle: 'Amphibious Rocket-Artillery Cruiser',
    title: 'SEINE FLOTILLA // ROCKET BARRAGE',
    escortBase: [
      EnemyClass.HOVER,
      EnemyClass.STRIKER,
      EnemyClass.HOVER,
      EnemyClass.HOWITZER,
      EnemyClass.ENGINEER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.SCOUT,
    ],
  }),
  Object.freeze({
    bossClass: EnemyClass.BOSS_INFERNO,
    bossName: 'CERBERUS-T',
    bossTitle: 'Thermobaric Siege Leviathan',
    title: 'THERMOBARIC LEVIATHAN ASSAULT',
    escortBase: [
      EnemyClass.FLAMETHROWER,
      EnemyClass.KAMIKAZE,
      EnemyClass.ARMOR,
      EnemyClass.SAPPER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
    ],
  }),
  Object.freeze({
    bossClass: EnemyClass.BOSS_TITAN,
    bossName: 'SUPREME DREADNOUGHT',
    bossTitle: 'Twin-Turret Supreme Dreadnought',
    title: 'SUPREME DREADNOUGHT SPEARHEAD',
    escortBase: [
      EnemyClass.ARMOR,
      EnemyClass.JAMMER,
      EnemyClass.ENGINEER,
      EnemyClass.STRIKER,
      EnemyClass.STEALTH,
      EnemyClass.ARMOR,
      EnemyClass.HOWITZER,
      EnemyClass.FLAMETHROWER,
    ],
  }),
]);

const WAVE_PRESETS = Object.freeze({
  1: {
    title: 'RECON PROBE',
    roster: [
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
      EnemyClass.SAPPER,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
    ],
  },
  2: {
    title: 'BOULEVARD BRIDGEHEAD',
    roster: [
      EnemyClass.STANDARD,
      EnemyClass.ARMOR,
      EnemyClass.SCOUT,
      EnemyClass.ENGINEER,
      EnemyClass.STANDARD,
      EnemyClass.SAPPER,
      EnemyClass.SCOUT,
    ],
  },
  3: {
    title: 'SEINE RIVER RAIDERS',
    roster: [
      EnemyClass.HOVER,
      EnemyClass.HOVER,
      EnemyClass.HOWITZER,
      EnemyClass.STANDARD,
      EnemyClass.FLAMETHROWER,
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
      EnemyClass.SAPPER,
    ],
  },
  4: {
    title: 'CHAMPS-ÉLYSÉES BREACHERS',
    roster: [
      EnemyClass.ARMOR,
      EnemyClass.ARMOR,
      EnemyClass.KAMIKAZE,
      EnemyClass.SAPPER,
      EnemyClass.STRIKER,
      EnemyClass.STANDARD,
      EnemyClass.ENGINEER,
      EnemyClass.HOWITZER,
      EnemyClass.SCOUT,
    ],
  },
  5: {
    title: 'ELECTRONIC SIEGE',
    roster: [
      EnemyClass.JAMMER,
      EnemyClass.STEALTH,
      EnemyClass.STRIKER,
      EnemyClass.ARMOR,
      EnemyClass.HOWITZER,
      EnemyClass.ENGINEER,
      EnemyClass.HOVER,
      EnemyClass.SAPPER,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
    ],
  },
  6: {
    title: 'GRAND PINCER',
    roster: [
      EnemyClass.ARMOR,
      EnemyClass.HOVER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.STRIKER,
      EnemyClass.KAMIKAZE,
      EnemyClass.STANDARD,
      EnemyClass.SAPPER,
      EnemyClass.HOWITZER,
      EnemyClass.ENGINEER,
      EnemyClass.ARMOR,
      EnemyClass.SCOUT,
    ],
  },
  8: {
    title: 'OVERTIME // SHOCK SPEARHEAD',
    roster: [
      EnemyClass.ARMOR,
      EnemyClass.STRIKER,
      EnemyClass.JAMMER,
      EnemyClass.HOVER,
      EnemyClass.ENGINEER,
      EnemyClass.HOWITZER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.ARMOR,
      EnemyClass.KAMIKAZE,
      EnemyClass.SAPPER,
      EnemyClass.STANDARD,
      EnemyClass.HOVER,
      EnemyClass.SCOUT,
    ],
  },
  9: {
    title: 'OVERTIME // MISSILE BATTERY',
    roster: [
      EnemyClass.STRIKER,
      EnemyClass.HOWITZER,
      EnemyClass.ARMOR,
      EnemyClass.JAMMER,
      EnemyClass.ENGINEER,
      EnemyClass.HOVER,
      EnemyClass.STRIKER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.ARMOR,
      EnemyClass.KAMIKAZE,
      EnemyClass.HOWITZER,
      EnemyClass.SAPPER,
      EnemyClass.STANDARD,
      EnemyClass.ENGINEER,
    ],
  },
  11: {
    title: 'OVERTIME // PHANTOM OVERWATCH',
    roster: [
      EnemyClass.STEALTH,
      EnemyClass.STRIKER,
      EnemyClass.ARMOR,
      EnemyClass.JAMMER,
      EnemyClass.HOVER,
      EnemyClass.ENGINEER,
      EnemyClass.STEALTH,
      EnemyClass.FLAMETHROWER,
      EnemyClass.HOWITZER,
      EnemyClass.ARMOR,
      EnemyClass.SAPPER,
      EnemyClass.STRIKER,
      EnemyClass.KAMIKAZE,
      EnemyClass.HOVER,
    ],
  },
  12: {
    title: 'OVERTIME // IRON PHALANX',
    roster: [
      EnemyClass.ARMOR,
      EnemyClass.ENGINEER,
      EnemyClass.ARMOR,
      EnemyClass.STRIKER,
      EnemyClass.JAMMER,
      EnemyClass.HOWITZER,
      EnemyClass.STEALTH,
      EnemyClass.FLAMETHROWER,
      EnemyClass.HOVER,
      EnemyClass.ARMOR,
      EnemyClass.ENGINEER,
      EnemyClass.KAMIKAZE,
      EnemyClass.STRIKER,
      EnemyClass.SAPPER,
      EnemyClass.HOWITZER,
    ],
  },
  13: {
    title: 'OVERTIME // COMBINED ARMS BLITZ',
    roster: [
      EnemyClass.STRIKER,
      EnemyClass.STEALTH,
      EnemyClass.HOVER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.JAMMER,
      EnemyClass.ARMOR,
      EnemyClass.HOWITZER,
      EnemyClass.ENGINEER,
      EnemyClass.KAMIKAZE,
      EnemyClass.STRIKER,
      EnemyClass.STEALTH,
      EnemyClass.ARMOR,
      EnemyClass.HOVER,
      EnemyClass.SAPPER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.HOWITZER,
    ],
  },
  14: {
    title: 'OVERTIME // CITADEL VANGUARD',
    roster: [
      EnemyClass.ARMOR,
      EnemyClass.STRIKER,
      EnemyClass.STEALTH,
      EnemyClass.JAMMER,
      EnemyClass.ENGINEER,
      EnemyClass.HOWITZER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.HOVER,
      EnemyClass.ARMOR,
      EnemyClass.STRIKER,
      EnemyClass.KAMIKAZE,
      EnemyClass.ENGINEER,
      EnemyClass.STEALTH,
      EnemyClass.HOWITZER,
      EnemyClass.ARMOR,
      EnemyClass.HOVER,
      EnemyClass.SAPPER,
    ],
  },
});

const ENDLESS_CYCLE_POOL = Object.freeze([
  EnemyClass.ARMOR,
  EnemyClass.STRIKER,
  EnemyClass.STEALTH,
  EnemyClass.HOVER,
  EnemyClass.HOWITZER,
  EnemyClass.FLAMETHROWER,
  EnemyClass.JAMMER,
  EnemyClass.ENGINEER,
  EnemyClass.KAMIKAZE,
  EnemyClass.SAPPER,
  EnemyClass.STANDARD,
  EnemyClass.SCOUT,
]);

/**
 * Boss waves occur on Wave 7 (the 6:00 Finale) and then every 5th wave in Overtime (10, 15, 20, 25...).
 */
function isSurvivalBossWave(waveNumber = 1) {
  const wave = Math.max(1, Math.floor(waveNumber));
  return wave === SURVIVAL_CONFIG.FINALE_WAVE || (wave >= 10 && wave % 5 === 0);
}

/** Builds the deterministic wave specification for a 1-based Survival wave number. */
export function buildSurvivalWaveSpec(waveNumber = 1) {
  const wave = Math.max(1, Math.floor(waveNumber));
  const isBossWave = isSurvivalBossWave(wave);
  const maxConcurrentEnemies = Math.min(9, 4 + Math.floor(wave / 2));
  const maxAttackers = wave <= 2 ? 2 : wave <= 6 ? 3 : wave <= 14 ? 4 : 5;
  const spawnIntervalSec = Math.max(1.05, Number((2.25 - wave * 0.065).toFixed(2)));
  const waveRewardCredits =
    SURVIVAL_CONFIG.WAVE_BASE_REWARD +
    wave * SURVIVAL_CONFIG.WAVE_STEP_REWARD +
    (isBossWave ? SURVIVAL_CONFIG.BOSS_WAVE_BONUS : 0);

  if (isBossWave) {
    const bossSlot = wave === SURVIVAL_CONFIG.FINALE_WAVE ? 0 : Math.floor(wave / 5) - 1;
    const bossIndex = bossSlot % BOSS_ROTATION.length;
    const cycleTier = Math.floor(bossSlot / BOSS_ROTATION.length);
    const bossEntry = BOSS_ROTATION[bossIndex];
    const extraEscortCount = cycleTier * 3;
    const roster = [...bossEntry.escortBase];
    for (let i = 0; i < extraEscortCount; i++) {
      roster.push(ENDLESS_CYCLE_POOL[(wave + i * 3) % ENDLESS_CYCLE_POOL.length]);
    }
    return {
      wave,
      title: bossEntry.title,
      isBossWave: true,
      bossClass: bossEntry.bossClass,
      bossName: bossEntry.bossName,
      bossTitle: bossEntry.bossTitle,
      roster,
      totalHostiles: roster.length + 1,
      maxConcurrentEnemies,
      maxAttackers,
      spawnIntervalSec,
      waveRewardCredits,
    };
  }

  if (WAVE_PRESETS[wave]) {
    const preset = WAVE_PRESETS[wave];
    return {
      wave,
      title: preset.title,
      isBossWave: false,
      bossClass: null,
      bossName: null,
      bossTitle: null,
      roster: [...preset.roster],
      totalHostiles: preset.roster.length,
      maxConcurrentEnemies,
      maxAttackers,
      spawnIntervalSec,
      waveRewardCredits,
    };
  }

  // Wave 16+ endless combined-arms escalation (stats stay canonical; volume & composition scale)
  const count = 16 + (wave - 15) * 2;
  const roster = [];
  for (let i = 0; i < count; i++) {
    const idx = (wave * 5 + i * 7) % ENDLESS_CYCLE_POOL.length;
    roster.push(ENDLESS_CYCLE_POOL[idx]);
  }
  return {
    wave,
    title: `OVERTIME ASSAULT // ECHELON ${wave}`,
    isBossWave: false,
    bossClass: null,
    bossName: null,
    bossTitle: null,
    roster,
    totalHostiles: roster.length,
    maxConcurrentEnemies,
    maxAttackers,
    spawnIntervalSec,
    waveRewardCredits,
  };
}

export function createDefaultSurvivalRecords() {
  return {
    bestWave: 0,
    bestWavesCleared: 0,
    bestKills: 0,
    bestTimeSec: 0,
    bestHoldSec: 0,
    parisVictories: 0,
    totalRuns: 0,
    totalKills: 0,
    bossesDefeated: 0,
    lastRun: null,
  };
}

export function createSurvivalState() {
  const waveSpec = buildSurvivalWaveSpec(1);
  return {
    wave: 1,
    wavesCleared: 0,
    phase: 'combat', // 'combat' | 'intermission'
    waveTimer: SURVIVAL_CONFIG.WAVE_INTERVAL_SEC,
    waveDuration: SURVIVAL_CONFIG.WAVE_INTERVAL_SEC,
    intermissionTimer: 0,
    intermissionDuration: SURVIVAL_CONFIG.INTERMISSION_SEC,
    elapsedSec: 0,
    holdTargetSec: SURVIVAL_CONFIG.HOLD_DURATION_SEC,
    victoryAchieved: false,
    overtime: false,
    currentWaveCleared: false,
    bossesDefeated: 0,
    earlyWaveCalls: 0,
    lastWaveReward: 0,
    waveSpec,
    nextWaveSpec: buildSurvivalWaveSpec(2),
    recordSummary: null,
  };
}

/** Updates persistent Survival Records in `playerSave` without modifying campaign credits or upgrades. */
export function recordSurvivalRun(playerSave, survivalState, kills = 0) {
  const prev = {
    ...createDefaultSurvivalRecords(),
    ...(playerSave?.survivalRecords || {}),
  };
  const waveReached = survivalState?.wave || 1;
  const wavesCleared = survivalState?.wavesCleared || 0;
  const timeSec = Math.round(survivalState?.elapsedSec || 0);
  const bosses = survivalState?.bossesDefeated || 0;
  const victoryAchieved = Boolean(
    survivalState?.victoryAchieved || timeSec >= SURVIVAL_CONFIG.HOLD_DURATION_SEC
  );
  const alreadyRecordedVictory = Boolean(survivalState?._victoryCounted);

  const isNewWaveRecord = waveReached > prev.bestWave || wavesCleared > prev.bestWavesCleared;
  const isNewKillRecord = kills > prev.bestKills;
  const isNewTimeRecord = timeSec > prev.bestTimeSec;

  const updated = {
    bestWave: Math.max(prev.bestWave, waveReached),
    bestWavesCleared: Math.max(prev.bestWavesCleared, wavesCleared),
    bestKills: Math.max(prev.bestKills, kills),
    bestTimeSec: Math.max(prev.bestTimeSec, timeSec),
    bestHoldSec: Math.max(prev.bestHoldSec || 0, timeSec),
    parisVictories:
      (prev.parisVictories || 0) + (victoryAchieved && !alreadyRecordedVictory ? 1 : 0),
    totalRuns: (prev.totalRuns || 0) + (alreadyRecordedVictory ? 0 : 1),
    totalKills: (prev.totalKills || 0) + (alreadyRecordedVictory ? 0 : kills),
    bossesDefeated: (prev.bossesDefeated || 0) + (alreadyRecordedVictory ? 0 : bosses),
    lastRun: {
      waveReached,
      wavesCleared,
      kills,
      timeSec,
      victoryAchieved,
      bossesDefeated: bosses,
      recordedAt: Date.now(),
    },
  };

  if (survivalState && victoryAchieved) {
    survivalState._victoryCounted = true;
  }

  if (playerSave) {
    playerSave.survivalRecords = updated;
  }

  return {
    waveReached,
    wavesCleared,
    kills,
    timeSec,
    victoryAchieved,
    bossesDefeated: bosses,
    isNewWaveRecord,
    isNewKillRecord,
    isNewTimeRecord,
    records: updated,
  };
}

export function buildSurvivalHudSnapshot(
  survivalState,
  activeEnemiesCount = 0,
  vanguardRemaining = 0
) {
  if (!survivalState) return null;
  const spec = survivalState.waveSpec;
  const nextSpec = survivalState.nextWaveSpec;
  const bossPending = spec?.isBossWave && vanguardRemaining === 0 && activeEnemiesCount === 0 ? 1 : 0;
  const elapsedSec = Math.floor(survivalState.elapsedSec || 0);
  const holdTargetSec = survivalState.holdTargetSec || SURVIVAL_CONFIG.HOLD_DURATION_SEC;
  const holdRemainingSec = Math.max(0, Math.ceil(holdTargetSec - (survivalState.elapsedSec || 0)));
  const waveTimer = Math.max(0, survivalState.waveTimer ?? survivalState.intermissionTimer ?? 0);
  const waveDuration = survivalState.waveDuration || SURVIVAL_CONFIG.WAVE_INTERVAL_SEC;
  return {
    wave: survivalState.wave,
    wavesCleared: survivalState.wavesCleared,
    phase: survivalState.phase,
    title: spec?.title || `WAVE ${survivalState.wave}`,
    isBossWave: Boolean(spec?.isBossWave),
    bossName: spec?.bossName || null,
    waveTimer,
    waveDuration,
    nextWaveCountdown: waveTimer,
    intermissionTimer: Math.max(0, survivalState.intermissionTimer || waveTimer),
    intermissionDuration: survivalState.intermissionDuration || SURVIVAL_CONFIG.INTERMISSION_SEC,
    earlyCallBonus: SURVIVAL_CONFIG.EARLY_CALL_BONUS,
    elapsedSec,
    holdTargetSec,
    holdRemainingSec,
    victoryAchieved: Boolean(survivalState.victoryAchieved),
    overtime: Boolean(survivalState.overtime),
    bossesDefeated: survivalState.bossesDefeated || 0,
    hostilesRemaining: activeEnemiesCount + vanguardRemaining + bossPending,
    totalWaveHostiles: spec?.totalHostiles || 1,
    waveRewardCredits: spec?.waveRewardCredits || 300,
    nextWaveNumber: nextSpec?.wave || survivalState.wave + 1,
    nextWaveTitle: nextSpec?.title || '',
    nextWaveIsBoss: Boolean(nextSpec?.isBossWave),
    nextWaveBossName: nextSpec?.bossName || null,
    recordSummary: survivalState.recordSummary || null,
  };
}
