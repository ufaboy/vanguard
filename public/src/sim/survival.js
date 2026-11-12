/**
 * Survival Mode: Endless Wave Director, Session Rules & Survival Records.
 *
 * Rules:
 * - Every Survival run starts from a clean Tier I tank (all 5 tracks at level 1) with $500 session credits.
 * - Credits earned in Survival are spent in the field Hangar [U] during the run and never carry over
 *   to the main Campaign/Contracts profile.
 * - Destroying the Allied HQ disables field repairs and Hangar [U] access until a BASE_RESTORE pickup
 *   is recovered from battlefield supply crates; the run continues as long as the player tank survives.
 * - Every 5th wave deploys a Sector Boss (MAMMOTH -> HYDRA -> TITAN rotation) with an armored escort.
 */

import { EnemyClass } from '../game/tanks.js';

export const SURVIVAL_CONFIG = Object.freeze({
  MAP_ID: 'survival-iron-crucible',
  CODE: 'SURVIVAL S-01 // IRON CRUCIBLE',
  NAME: 'Iron Crucible',
  SUBTITLE: 'ENDLESS ARMORED HOLDOUT',
  STARTING_CREDITS: 500,
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
    title: 'SIEGE DREADNOUGHT ASSAULT',
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
    title: 'AMPHIBIOUS ROCKET BARRAGE',
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
    title: 'RECON VANGUARD',
    roster: [
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
      EnemyClass.SAPPER,
      EnemyClass.SCOUT,
    ],
  },
  2: {
    title: 'SAPPER CORDONS',
    roster: [
      EnemyClass.STANDARD,
      EnemyClass.SAPPER,
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
      EnemyClass.SAPPER,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
    ],
  },
  3: {
    title: 'HEAVY BREACHERS',
    roster: [
      EnemyClass.ARMOR,
      EnemyClass.STANDARD,
      EnemyClass.HOWITZER,
      EnemyClass.SCOUT,
      EnemyClass.SAPPER,
      EnemyClass.ARMOR,
      EnemyClass.KAMIKAZE,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
    ],
  },
  4: {
    title: 'ARTILLERY & DEMOLITION',
    roster: [
      EnemyClass.ARMOR,
      EnemyClass.HOWITZER,
      EnemyClass.STANDARD,
      EnemyClass.KAMIKAZE,
      EnemyClass.SAPPER,
      EnemyClass.ARMOR,
      EnemyClass.HOWITZER,
      EnemyClass.SCOUT,
      EnemyClass.ENGINEER,
      EnemyClass.STANDARD,
    ],
  },
  6: {
    title: 'RIVER FLANKERS',
    roster: [
      EnemyClass.HOVER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.STANDARD,
      EnemyClass.HOVER,
      EnemyClass.ARMOR,
      EnemyClass.SAPPER,
      EnemyClass.HOWITZER,
      EnemyClass.ENGINEER,
      EnemyClass.FLAMETHROWER,
      EnemyClass.SCOUT,
      EnemyClass.STANDARD,
    ],
  },
  7: {
    title: 'NAPALM & ELECTRONIC WARFARE',
    roster: [
      EnemyClass.FLAMETHROWER,
      EnemyClass.JAMMER,
      EnemyClass.ARMOR,
      EnemyClass.HOVER,
      EnemyClass.HOWITZER,
      EnemyClass.KAMIKAZE,
      EnemyClass.ENGINEER,
      EnemyClass.STANDARD,
      EnemyClass.FLAMETHROWER,
      EnemyClass.SAPPER,
      EnemyClass.ARMOR,
      EnemyClass.HOVER,
    ],
  },
  8: {
    title: 'SHOCK SPEARHEAD',
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
    title: 'MISSILE & SIEGE BATTERY',
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
    title: 'PHANTOM OVERWATCH',
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
    title: 'IRON PHALANX',
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
    title: 'COMBINED ARMS BLITZ',
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
    title: 'CITADEL VANGUARD',
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

/** Builds the deterministic wave specification for a 1-based Survival wave number. */
export function buildSurvivalWaveSpec(waveNumber = 1) {
  const wave = Math.max(1, Math.floor(waveNumber));
  const isBossWave = wave % 5 === 0;
  const maxConcurrentEnemies = Math.min(9, 4 + Math.floor(wave / 3));
  const maxAttackers = wave <= 2 ? 2 : wave <= 6 ? 3 : wave <= 14 ? 4 : 5;
  const spawnIntervalSec = Math.max(1.05, Number((2.25 - wave * 0.065).toFixed(2)));
  const waveRewardCredits =
    SURVIVAL_CONFIG.WAVE_BASE_REWARD +
    wave * SURVIVAL_CONFIG.WAVE_STEP_REWARD +
    (isBossWave ? SURVIVAL_CONFIG.BOSS_WAVE_BONUS : 0);

  if (isBossWave) {
    const bossIndex = (Math.floor(wave / 5) - 1) % BOSS_ROTATION.length;
    const cycleTier = Math.floor((wave - 1) / (BOSS_ROTATION.length * 5));
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
    title: `ENDLESS ASSAULT // ECHELON ${wave}`,
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
    intermissionTimer: 0,
    intermissionDuration: SURVIVAL_CONFIG.INTERMISSION_SEC,
    elapsedSec: 0,
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

  const isNewWaveRecord = waveReached > prev.bestWave || wavesCleared > prev.bestWavesCleared;
  const isNewKillRecord = kills > prev.bestKills;
  const isNewTimeRecord = timeSec > prev.bestTimeSec;

  const updated = {
    bestWave: Math.max(prev.bestWave, waveReached),
    bestWavesCleared: Math.max(prev.bestWavesCleared, wavesCleared),
    bestKills: Math.max(prev.bestKills, kills),
    bestTimeSec: Math.max(prev.bestTimeSec, timeSec),
    totalRuns: (prev.totalRuns || 0) + 1,
    totalKills: (prev.totalKills || 0) + kills,
    bossesDefeated: (prev.bossesDefeated || 0) + bosses,
    lastRun: {
      waveReached,
      wavesCleared,
      kills,
      timeSec,
      bossesDefeated: bosses,
      recordedAt: Date.now(),
    },
  };

  if (playerSave) {
    playerSave.survivalRecords = updated;
  }

  return {
    waveReached,
    wavesCleared,
    kills,
    timeSec,
    bossesDefeated: bosses,
    isNewWaveRecord,
    isNewKillRecord,
    isNewTimeRecord,
    records: updated,
  };
}

export function buildSurvivalHudSnapshot(survivalState, activeEnemiesCount = 0, vanguardRemaining = 0) {
  if (!survivalState) return null;
  const spec = survivalState.waveSpec;
  const nextSpec = survivalState.nextWaveSpec;
  const bossPending = spec?.isBossWave && vanguardRemaining === 0 && activeEnemiesCount === 0 ? 1 : 0;
  return {
    wave: survivalState.wave,
    wavesCleared: survivalState.wavesCleared,
    phase: survivalState.phase,
    title: spec?.title || `WAVE ${survivalState.wave}`,
    isBossWave: Boolean(spec?.isBossWave),
    bossName: spec?.bossName || null,
    intermissionTimer: Math.max(0, survivalState.intermissionTimer || 0),
    intermissionDuration: survivalState.intermissionDuration || SURVIVAL_CONFIG.INTERMISSION_SEC,
    earlyCallBonus: SURVIVAL_CONFIG.EARLY_CALL_BONUS,
    elapsedSec: Math.floor(survivalState.elapsedSec || 0),
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

