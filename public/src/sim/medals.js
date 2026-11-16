/**
 * Medals, Grades, Battle Telemetry Tracker, and Military Rank Progression.
 * Pure simulation module (zero DOM / Three.js dependencies).
 */

export const MEDAL_GRADES = Object.freeze({
  bronze: Object.freeze({
    id: 'bronze',
    label: 'Bronze',
    order: 1,
    color: '#CD7F32',
    bgColor: 'rgba(205, 127, 50, 0.14)',
    borderColor: 'rgba(205, 127, 50, 0.55)',
    firstXp: 50,
    repeatXp: 15,
  }),
  silver: Object.freeze({
    id: 'silver',
    label: 'Silver',
    order: 2,
    color: '#CBD5E1',
    bgColor: 'rgba(203, 213, 225, 0.14)',
    borderColor: 'rgba(203, 213, 225, 0.55)',
    firstXp: 150,
    repeatXp: 40,
  }),
  gold: Object.freeze({
    id: 'gold',
    label: 'Gold',
    order: 3,
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.65)',
    firstXp: 350,
    repeatXp: 90,
  }),
  vanguard: Object.freeze({
    id: 'vanguard',
    label: 'Vanguard',
    order: 4,
    color: '#38BDF8',
    bgColor: 'rgba(56, 189, 248, 0.16)',
    borderColor: 'rgba(56, 189, 248, 0.72)',
    firstXp: 700,
    repeatXp: 175,
  }),
});

export const RANK_LADDER = Object.freeze([
  Object.freeze({ id: 'recruit', title: 'Recruit', insignia: 'I', minXp: 0, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'gunner', title: 'Gunner', insignia: 'II', minXp: 200, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'corporal', title: 'Corporal', insignia: 'III', minXp: 500, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'sergeant', title: 'Sergeant', insignia: 'IV', minXp: 950, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'lieutenant', title: 'Lieutenant', insignia: 'V', minXp: 1550, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'captain', title: 'Captain', insignia: 'VI', minXp: 2350, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'major', title: 'Major', insignia: 'VII', minXp: 3400, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'colonel', title: 'Colonel', insignia: 'VIII', minXp: 4800, minGoldPlus: 2, minVanguard: 0 }),
  Object.freeze({ id: 'brigadier', title: 'Brigadier', insignia: 'IX', minXp: 6600, minGoldPlus: 4, minVanguard: 0 }),
  Object.freeze({ id: 'vanguard_marshal', title: 'Vanguard Marshal', insignia: 'X', minXp: 9000, minGoldPlus: 4, minVanguard: 1 }),
]);

const BOSS_CLASSES = new Set(['BOSS_MAMMOTH', 'BOSS_HYDRA', 'BOSS_INFERNO', 'BOSS_TITAN']);

const KILL_XP_BY_CLASS = Object.freeze({
  SCOUT: 10,
  STANDARD: 15,
  SAPPER: 20,
  KAMIKAZE: 20,
  HOVER: 20,
  FLAMETHROWER: 25,
  JAMMER: 25,
  ENGINEER: 25,
  STRIKER: 25,
  STEALTH: 25,
  HOWITZER: 30,
  ARMOR: 30,
  BOSS_MAMMOTH: 150,
  BOSS_HYDRA: 200,
  BOSS_INFERNO: 225,
  BOSS_TITAN: 250,
});

export const MEDAL_CATALOG = Object.freeze([
  // --- BRONZE ---
  Object.freeze({
    id: 'mine_sweeper',
    name: 'Mine Sweeper',
    grade: 'bronze',
    category: 'Tactics',
    description: 'Destroy 3+ enemy mines by shooting them or eliminate a Sapper before it lays its first mine.',
    evaluate: ({ tracker }) => tracker.minesShot >= 3 || tracker.sapperKilledBeforeMining >= 1,
  }),
  Object.freeze({
    id: 'saboteur',
    name: 'Saboteur',
    grade: 'bronze',
    category: 'Tactics',
    description: 'Destroy an Engineer while it is repairing an ally or building fortifications.',
    evaluate: ({ tracker }) => tracker.engineerKilledWhileActing >= 1,
  }),
  Object.freeze({
    id: 'bunker_buster',
    name: 'Bunker Buster',
    grade: 'bronze',
    category: 'Tactics',
    description: 'Breach reinforced concrete and hit an enemy shortly after destroying the cover.',
    evaluate: ({ tracker }) => tracker.bunkerBusterHits >= 1,
  }),
  Object.freeze({
    id: 'demolition_crew',
    name: 'Demolition Crew',
    grade: 'bronze',
    category: 'Tactics',
    description: 'Destroy 50+ terrain cover blocks in a single battle.',
    evaluate: ({ hud }) => (Number(hud?.blocksDestroyed) || 0) >= 50,
  }),
  Object.freeze({
    id: 'apex_vanguard',
    name: 'Apex Vanguard',
    grade: 'bronze',
    category: 'Arsenal',
    description: 'Win a mission with all 5 core tank systems upgraded to Tier 5.',
    evaluate: ({ isVictory, upgrades }) => {
      if (!isVictory || !upgrades) return false;
      return (
        Number(upgrades.cannon) >= 5 &&
        Number(upgrades.chassis) >= 5 &&
        Number(upgrades.frame) >= 5 &&
        Number(upgrades.engine) >= 5 &&
        Number(upgrades.armor) >= 5
      );
    },
  }),

  // --- SILVER ---
  Object.freeze({
    id: 'flank_master',
    name: 'Flank Master',
    grade: 'silver',
    category: 'Tactics',
    description: 'Destroy an Armor tank or Sector Boss with a decisive side or rear hit.',
    evaluate: ({ tracker }) => tracker.flankHeavyKills >= 1,
  }),
  Object.freeze({
    id: 'matador',
    name: 'Matador',
    grade: 'silver',
    category: 'Tactics',
    description: 'Destroy a charging Kamikaze at close range before its warhead detonates.',
    evaluate: ({ tracker }) => tracker.matadorKills >= 1,
  }),
  Object.freeze({
    id: 'counter_battery',
    name: 'Counter-Battery',
    grade: 'silver',
    category: 'Tactics',
    description: 'Destroy a Howitzer before it completes its second artillery barrage.',
    evaluate: ({ tracker }) => tracker.counterBatteryKills >= 1,
  }),
  Object.freeze({
    id: 'ghost_hunter',
    name: 'Ghost Hunter',
    grade: 'silver',
    category: 'Tactics',
    description: 'Destroy a stationary camouflaged Stealth tank or a Jammer during its ECM pulse.',
    evaluate: ({ tracker }) => tracker.ghostHunterKills >= 1,
  }),
  Object.freeze({
    id: 'iron_dome',
    name: 'Iron Dome',
    grade: 'silver',
    category: 'Arsenal',
    description: 'Intercept 5+ incoming shells or missiles with the Active Protection System in one battle.',
    evaluate: ({ tracker }) => tracker.apsIntercepts >= 5,
  }),
  Object.freeze({
    id: 'amphibious_assault',
    name: 'Amphibious Assault',
    grade: 'silver',
    category: 'Arsenal',
    description: 'Destroy 2+ enemies while operating from deep water (CH4 / CH5 chassis).',
    evaluate: ({ tracker }) => tracker.waterKills >= 2,
  }),

  // --- GOLD ---
  Object.freeze({
    id: 'fortress_guardian',
    name: 'Fortress Guardian',
    grade: 'gold',
    category: 'Defense',
    description: 'Win a mission with 100% Command HQ integrity.',
    evaluate: ({ isVictory, hud }) => {
      if (!isVictory) return false;
      const maxHp = Number(hud?.baseMaxHp) || 0;
      const hp = Number(hud?.baseHp) || 0;
      return maxHp > 0 && hp >= maxHp;
    },
  }),
  Object.freeze({
    id: 'last_stand',
    name: 'Last Stand',
    grade: 'gold',
    category: 'Defense',
    description: 'Destroy 2+ enemies while below 33% hull integrity and survive to win.',
    evaluate: ({ isVictory, tracker }) => isVictory && tracker.lastStandKills >= 2,
  }),
  Object.freeze({
    id: 'twin_thunder',
    name: 'Twin Thunder',
    grade: 'gold',
    category: 'Arsenal',
    description: 'Destroy two different enemies with a single dual-salvo of Cannon Mk5.',
    evaluate: ({ tracker }) => tracker.twinThunderTriggered,
  }),
  Object.freeze({
    id: 'mammoth_slayer',
    name: 'Mammoth Slayer',
    grade: 'gold',
    category: 'Bosses',
    description: 'Defeat BOSS_MAMMOTH in Sector 01.',
    evaluate: ({ isVictory, tracker }) => isVictory && tracker.defeatedBosses.includes('BOSS_MAMMOTH'),
  }),
  Object.freeze({
    id: 'hydra_dodger',
    name: 'Hydra Dodger',
    grade: 'gold',
    category: 'Bosses',
    description: 'Defeat BOSS_HYDRA without taking a single hit from its MLRS rocket salvo.',
    evaluate: ({ isVictory, tracker }) =>
      isVictory && tracker.defeatedBosses.includes('BOSS_HYDRA') && tracker.hydraMlrsHitsTaken === 0,
  }),
  Object.freeze({
    id: 'titan_breaker',
    name: 'Titan Breaker',
    grade: 'gold',
    category: 'Bosses',
    description: 'Defeat BOSS_TITAN without taking a single hit from its TITAN_RAIL cannon.',
    evaluate: ({ isVictory, tracker }) =>
      isVictory && tracker.defeatedBosses.includes('BOSS_TITAN') && tracker.titanRailHitsTaken === 0,
  }),

  // --- VANGUARD ---
  Object.freeze({
    id: 'untouchable',
    name: 'Untouchable',
    grade: 'vanguard',
    category: 'Challenge',
    description: 'Win a mission without taking any hull damage.',
    evaluate: ({ isVictory, tracker }) => isVictory && tracker.playerDamageTaken === 0 && tracker.killsByClassTotal > 0,
  }),
  Object.freeze({
    id: 'exploit_the_gap',
    name: 'Exploit the Gap',
    grade: 'vanguard',
    category: 'Bosses',
    description: 'Finish off BOSS_TITAN with a rear-aspect hit during its Overload phase (< 30% HP).',
    evaluate: ({ isVictory, tracker }) => isVictory && tracker.titanOverloadRearKill,
  }),
  Object.freeze({
    id: 'david_vs_goliath',
    name: 'David vs Goliath',
    grade: 'vanguard',
    category: 'Challenge',
    description: 'Win a mission using the stock Cannon Mk1 and no optional modules equipped.',
    evaluate: ({ isVictory, upgrades, equippedModules }) => {
      if (!isVictory) return false;
      const cannonTier = Number(upgrades?.cannon) || 1;
      const moduleCount = Array.isArray(equippedModules) ? equippedModules.length : 0;
      return cannonTier === 1 && moduleCount === 0;
    },
  }),
]);

export const MEDAL_BY_ID = Object.freeze(
  Object.fromEntries(MEDAL_CATALOG.map((medal) => [medal.id, medal])),
);

/**
 * Per-battle telemetry collector for medal and Service XP evaluation.
 * Designed to be reset at the start of every mission/run.
 */
export function createBattleMedalTracker() {
  let state = createEmptyTrackerState();

  function createEmptyTrackerState() {
    return {
      minesShot: 0,
      sapperKilledBeforeMining: 0,
      engineerKilledWhileActing: 0,
      lastConcreteBreachAtMs: -Infinity,
      bunkerBusterHits: 0,
      flankHeavyKills: 0,
      matadorKills: 0,
      counterBatteryKills: 0,
      ghostHunterKills: 0,
      apsIntercepts: 0,
      waterKills: 0,
      lastStandKills: 0,
      twinThunderTriggered: false,
      salvoHistory: new Map(), // salvoId -> { count, timeMs }
      defeatedBosses: [],
      hydraMlrsHitsTaken: 0,
      titanRailHitsTaken: 0,
      titanOverloadRearKill: false,
      playerDamageTaken: 0,
      killsByClass: {},
      killsByClassTotal: 0,
    };
  }

  return {
    reset() {
      state = createEmptyTrackerState();
    },

    recordMineShot() {
      state.minesShot += 1;
    },

    recordConcreteDestroyed(nowMs = Date.now()) {
      state.lastConcreteBreachAtMs = nowMs;
    },

    recordEnemyHit({ nowMs = Date.now() } = {}) {
      if (nowMs - state.lastConcreteBreachAtMs <= 4000) {
        state.bunkerBusterHits += 1;
      }
    },

    recordApsIntercept() {
      state.apsIntercepts += 1;
    },

    recordPlayerDamage({ amount = 0, sourceWeapon = null } = {}) {
      const dmg = Math.max(0, Number(amount) || 0);
      if (dmg > 0) state.playerDamageTaken += dmg;
      if (sourceWeapon === 'HYDRA_MLRS') state.hydraMlrsHitsTaken += 1;
      if (sourceWeapon === 'TITAN_RAIL') state.titanRailHitsTaken += 1;
    },

    recordEnemyKill({
      enemyClass,
      aspect = 'front',
      playerHpRatio = 1,
      playerInWater = false,
      salvoId = null,
      nowMs = Date.now(),
      minesPlaced = 0,
      engineerActing = false,
      kamikazeChargingClose = false,
      howitzerBarrages = 0,
      stealthCamouflaged = false,
      jammerPulsing = false,
      bossOverloaded = false,
    } = {}) {
      if (!enemyClass) return;
      state.killsByClass[enemyClass] = (state.killsByClass[enemyClass] || 0) + 1;
      state.killsByClassTotal += 1;

      if (enemyClass === 'SAPPER' && minesPlaced === 0) {
        state.sapperKilledBeforeMining += 1;
      }
      if (enemyClass === 'ENGINEER' && engineerActing) {
        state.engineerKilledWhileActing += 1;
      }
      if ((enemyClass === 'ARMOR' || BOSS_CLASSES.has(enemyClass)) && (aspect === 'side' || aspect === 'left' || aspect === 'right' || aspect === 'rear')) {
        state.flankHeavyKills += 1;
      }
      if (enemyClass === 'KAMIKAZE' && kamikazeChargingClose) {
        state.matadorKills += 1;
      }
      if (enemyClass === 'HOWITZER' && howitzerBarrages < 2) {
        state.counterBatteryKills += 1;
      }
      if ((enemyClass === 'STEALTH' && stealthCamouflaged) || (enemyClass === 'JAMMER' && jammerPulsing)) {
        state.ghostHunterKills += 1;
      }
      if (playerInWater) {
        state.waterKills += 1;
      }
      if (playerHpRatio > 0 && playerHpRatio < 0.33) {
        state.lastStandKills += 1;
      }
      if (salvoId != null) {
        const prev = state.salvoHistory.get(salvoId);
        if (prev && nowMs - prev.timeMs <= 1200) {
          prev.count += 1;
          if (prev.count >= 2) {
            state.twinThunderTriggered = true;
          }
        } else {
          state.salvoHistory.set(salvoId, { count: 1, timeMs: nowMs });
        }
      }
      if (BOSS_CLASSES.has(enemyClass)) {
        if (!state.defeatedBosses.includes(enemyClass)) {
          state.defeatedBosses.push(enemyClass);
        }
        if (enemyClass === 'BOSS_TITAN' && bossOverloaded && aspect === 'rear') {
          state.titanOverloadRearKill = true;
        }
      }
    },

    snapshot() {
      return {
        ...state,
        defeatedBosses: [...state.defeatedBosses],
        killsByClass: { ...state.killsByClass },
      };
    },
  };
}

/**
 * Evaluates which medals were earned in the completed battle and calculates Service XP.
 */
export function evaluateMissionMedals({
  trackerState,
  hud,
  upgrades,
  equippedModules = [],
  isVictory = false,
  existingMedals = {},
} = {}) {
  const tracker = trackerState || createBattleMedalTracker().snapshot();
  const context = {
    tracker,
    hud: hud || {},
    upgrades: upgrades || {},
    equippedModules,
    isVictory: Boolean(isVictory),
  };

  const earnedMedals = [];
  for (const medal of MEDAL_CATALOG) {
    if (medal.evaluate(context)) {
      const gradeMeta = MEDAL_GRADES[medal.grade];
      const alreadyOwned = Boolean(existingMedals?.[medal.id]?.count > 0);
      const xpAwarded = alreadyOwned ? gradeMeta.repeatXp : gradeMeta.firstXp;
      earnedMedals.push({
        id: medal.id,
        name: medal.name,
        grade: medal.grade,
        gradeLabel: gradeMeta.label,
        color: gradeMeta.color,
        category: medal.category,
        description: medal.description,
        isNew: !alreadyOwned,
        xpAwarded,
      });
    }
  }

  // Sort highest grade first for debriefing display
  earnedMedals.sort((a, b) => MEDAL_GRADES[b.grade].order - MEDAL_GRADES[a.grade].order);

  // Compute Combat Service XP
  let combatXp = 0;
  for (const [enemyClass, count] of Object.entries(tracker.killsByClass || {})) {
    combatXp += (KILL_XP_BY_CLASS[enemyClass] || 15) * count;
  }
  if (isVictory) {
    combatXp += 100;
    const baseMaxHp = Number(hud?.baseMaxHp) || 0;
    const baseHp = Number(hud?.baseHp) || 0;
    if (baseMaxHp > 0 && baseHp >= baseMaxHp) {
      combatXp += 50;
    }
  }

  const medalXp = earnedMedals.reduce((sum, m) => sum + m.xpAwarded, 0);
  const totalXp = combatXp + medalXp;

  return {
    earnedMedals,
    combatXp,
    medalXp,
    totalXp,
  };
}

/**
 * Counts how many unique medals of Gold+ and Vanguard grades a player has unlocked.
 */
export function countMedalGrades(medalsMap = {}) {
  let goldPlus = 0;
  let vanguard = 0;
  let totalUnlocked = 0;

  for (const [id, entry] of Object.entries(medalsMap || {})) {
    if (!entry || (entry.count || 0) <= 0) continue;
    const def = MEDAL_BY_ID[id];
    if (!def) continue;
    totalUnlocked += 1;
    if (def.grade === 'gold' || def.grade === 'vanguard') {
      goldPlus += 1;
    }
    if (def.grade === 'vanguard') {
      vanguard += 1;
    }
  }

  return { goldPlus, vanguard, totalUnlocked };
}

/**
 * Computes current rank, next rank, and missing requirements from playerSave.
 */
export function getRankProgress(playerSave = {}) {
  const serviceXp = Math.max(0, Math.floor(Number(playerSave?.serviceXp) || 0));
  const { goldPlus, vanguard, totalUnlocked } = countMedalGrades(playerSave?.medals);

  let currentRank = RANK_LADDER[0];
  let currentIndex = 0;

  for (let i = 0; i < RANK_LADDER.length; i += 1) {
    const rank = RANK_LADDER[i];
    if (serviceXp >= rank.minXp && goldPlus >= rank.minGoldPlus && vanguard >= rank.minVanguard) {
      currentRank = rank;
      currentIndex = i;
    } else {
      break;
    }
  }

  const nextRank = currentIndex < RANK_LADDER.length - 1 ? RANK_LADDER[currentIndex + 1] : null;
  let xpProgressPct = 100;
  let missingGate = null;

  if (nextRank) {
    const span = Math.max(1, nextRank.minXp - currentRank.minXp);
    const gained = Math.max(0, serviceXp - currentRank.minXp);
    xpProgressPct = Math.min(100, Math.round((gained / span) * 100));

    if (serviceXp >= nextRank.minXp) {
      if (vanguard < nextRank.minVanguard) {
        missingGate = `Requires ${nextRank.minVanguard} Vanguard medal`;
      } else if (goldPlus < nextRank.minGoldPlus) {
        missingGate = `Requires ${nextRank.minGoldPlus} Gold+ medals (${goldPlus}/${nextRank.minGoldPlus})`;
      }
    }
  }

  return {
    currentRank,
    nextRank,
    serviceXp,
    goldPlus,
    vanguard,
    totalUnlocked,
    xpProgressPct,
    missingGate,
  };
}

/**
 * Persists newly earned medals and Service XP into playerSave.
 */
export function recordMedalsAndRank(playerSave, evaluation) {
  if (!playerSave || !evaluation) {
    return {
      previousRank: RANK_LADDER[0],
      currentRank: RANK_LADDER[0],
      promoted: false,
      newlyUnlockedIds: [],
    };
  }

  const before = getRankProgress(playerSave).currentRank;
  if (!playerSave.medals || typeof playerSave.medals !== 'object') {
    playerSave.medals = {};
  }

  const newlyUnlockedIds = [];
  const nowIso = new Date().toISOString();

  for (const medal of evaluation.earnedMedals || []) {
    const prev = playerSave.medals[medal.id];
    if (prev && prev.count > 0) {
      prev.count += 1;
      prev.lastEarnedAt = nowIso;
    } else {
      playerSave.medals[medal.id] = {
        count: 1,
        firstEarnedAt: nowIso,
        lastEarnedAt: nowIso,
      };
      newlyUnlockedIds.push(medal.id);
    }
  }

  playerSave.serviceXp = Math.max(0, Math.floor(Number(playerSave.serviceXp) || 0)) + (Number(evaluation.totalXp) || 0);
  const after = getRankProgress(playerSave).currentRank;

  return {
    previousRank: before,
    currentRank: after,
    promoted: after.id !== before.id,
    newlyUnlockedIds,
  };
}
