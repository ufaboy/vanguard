/**
 * Medals, Grades, Battle Telemetry Tracker, and Military Rank Progression.
 * Pure simulation module (zero DOM / Three.js dependencies).
 */
import { N_, t } from '../i18n/index.js';

const MEDAL_GRADES = Object.freeze({
  bronze: Object.freeze({
    id: 'bronze',
    label: N_('Bronze'),
    order: 1,
    color: '#CD7F32',
    bgColor: 'rgba(205, 127, 50, 0.14)',
    borderColor: 'rgba(205, 127, 50, 0.55)',
    firstXp: 50,
    repeatXp: 15,
  }),
  silver: Object.freeze({
    id: 'silver',
    label: N_('Silver'),
    order: 2,
    color: '#CBD5E1',
    bgColor: 'rgba(203, 213, 225, 0.14)',
    borderColor: 'rgba(203, 213, 225, 0.55)',
    firstXp: 150,
    repeatXp: 40,
  }),
  gold: Object.freeze({
    id: 'gold',
    label: N_('Gold'),
    order: 3,
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.65)',
    firstXp: 350,
    repeatXp: 90,
  }),
  vanguard: Object.freeze({
    id: 'vanguard',
    label: N_('Vanguard'),
    order: 4,
    color: '#38BDF8',
    bgColor: 'rgba(56, 189, 248, 0.16)',
    borderColor: 'rgba(56, 189, 248, 0.72)',
    firstXp: 700,
    repeatXp: 175,
  }),
});

export const RANK_LADDER = Object.freeze([
  Object.freeze({ id: 'recruit', title: N_('Recruit'), insignia: 'I', minXp: 0, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'gunner', title: N_('Gunner'), insignia: 'II', minXp: 200, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'corporal', title: N_('Corporal'), insignia: 'III', minXp: 500, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'sergeant', title: N_('Sergeant'), insignia: 'IV', minXp: 950, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'lieutenant', title: N_('Lieutenant'), insignia: 'V', minXp: 1550, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'captain', title: N_('Captain'), insignia: 'VI', minXp: 2350, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'major', title: N_('Major'), insignia: 'VII', minXp: 3400, minGoldPlus: 0, minVanguard: 0 }),
  Object.freeze({ id: 'colonel', title: N_('Colonel'), insignia: 'VIII', minXp: 4800, minGoldPlus: 2, minVanguard: 0 }),
  Object.freeze({ id: 'brigadier', title: N_('Brigadier'), insignia: 'IX', minXp: 6600, minGoldPlus: 4, minVanguard: 0 }),
  Object.freeze({ id: 'vanguard_marshal', title: N_('Vanguard Marshal'), insignia: 'X', minXp: 9000, minGoldPlus: 4, minVanguard: 1 }),
]);

export const AIR_STRIKE_RANK_REQUIREMENTS = Object.freeze({
  STRIKE_BOMBS: Object.freeze({ rankId: 'recruit', label: N_('3× Light Bombs') }),
  STRIKE_MINES: Object.freeze({ rankId: 'corporal', label: N_('Carpet Air Mines') }),
  STRIKE_THERMO: Object.freeze({ rankId: 'lieutenant', label: N_('Thermobaric Missile') }),
  STRIKE_AC130: Object.freeze({ rankId: 'major', label: N_('AC-130 Spooky (15s)') }),
});

const RANK_INDEX_BY_ID = Object.freeze(
  Object.fromEntries(RANK_LADDER.map((rank, index) => [rank.id, index]))
);

function normalizeStrikeVariantId(variantId) {
  if (variantId === 'MINES') return 'STRIKE_MINES';
  return variantId;
}

/** Returns the RANK_LADDER entry required to unlock a strike variant. */
export function getAirStrikeRequiredRank(variantId) {
  const key = normalizeStrikeVariantId(variantId);
  const req = AIR_STRIKE_RANK_REQUIREMENTS[key];
  if (!req) return RANK_LADDER[0];
  const idx = RANK_INDEX_BY_ID[req.rankId] ?? 0;
  return RANK_LADDER[idx] || RANK_LADDER[0];
}

/**
 * Returns true if the given strike variant is unlocked for the player's rank and mode.
 * Rank gating applies only in Campaign; Survival and Contracts unlock all variants.
 */
export function isAirStrikeVariantUnlocked(variantId, rankOrId = 'recruit', profileMode = 'campaign') {
  if (profileMode && profileMode !== 'campaign') return true;
  const rankId = typeof rankOrId === 'string' ? rankOrId : rankOrId?.id || 'recruit';
  const currentIdx = RANK_INDEX_BY_ID[rankId] ?? 0;
  const reqRank = getAirStrikeRequiredRank(variantId);
  const reqIdx = RANK_INDEX_BY_ID[reqRank.id] ?? 0;
  return currentIdx >= reqIdx;
}

/** Returns air support strike variants unlocked specifically at the given rankId. */
export function getRankAirSupportUnlocks(rankId) {
  return Object.entries(AIR_STRIKE_RANK_REQUIREMENTS)
    .filter(([, meta]) => meta.rankId === rankId)
    .map(([id, meta]) => ({ id, label: meta.label }));
}

/** Returns air support strike variants newly unlocked when advancing from previousRankId to currentRankId. */
export function getNewlyUnlockedAirSupport(previousRankId, currentRankId) {
  const prevIdx = RANK_INDEX_BY_ID[previousRankId] ?? 0;
  const currIdx = RANK_INDEX_BY_ID[currentRankId] ?? 0;
  if (currIdx <= prevIdx) return [];
  const unlocked = [];
  for (let i = prevIdx + 1; i <= currIdx; i += 1) {
    const rank = RANK_LADDER[i];
    if (rank) unlocked.push(...getRankAirSupportUnlocks(rank.id));
  }
  return unlocked;
}

const BOSS_CLASSES = new Set(['BOSS_MAMMOTH', 'BOSS_HYDRA', 'BOSS_INFERNO', 'BOSS_TITAN']);

const ENEMY_CLASS_CANONICAL = Object.freeze({
  scout: 'SCOUT',
  standard: 'STANDARD',
  sapper: 'SAPPER',
  kamikaze: 'KAMIKAZE',
  hover: 'HOVER',
  flamethrower: 'FLAMETHROWER',
  jammer: 'JAMMER',
  engineer: 'ENGINEER',
  striker: 'STRIKER',
  stealth: 'STEALTH',
  howitzer: 'HOWITZER',
  armor: 'ARMOR',
  bossmammoth: 'BOSS_MAMMOTH',
  bosshydra: 'BOSS_HYDRA',
  bossinferno: 'BOSS_INFERNO',
  bosstitan: 'BOSS_TITAN',
});

function normalizeEnemyClass(raw) {
  if (!raw) return '';
  const key = String(raw).trim();
  return ENEMY_CLASS_CANONICAL[key.toLowerCase()] || key.toUpperCase();
}

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
  // --- TIERED CAREER MEDALS (BRONZE → SILVER → GOLD) ---
  Object.freeze({
    id: 'tank_ace',
    name: N_('Tank Ace'),
    grade: 'bronze',
    category: N_('Tactics'),
    progressKey: 'totalKills',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 100 }),
      Object.freeze({ grade: 'silver', threshold: 250 }),
      Object.freeze({ grade: 'gold', threshold: 500 }),
    ]),
    description: N_('Destroy enemy tanks across battles.'),
  }),
  Object.freeze({
    id: 'double_strike',
    name: N_('Double Strike'),
    grade: 'bronze',
    category: N_('Tactics'),
    progressKey: 'doubleKills',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 3 }),
      Object.freeze({ grade: 'silver', threshold: 10 }),
      Object.freeze({ grade: 'gold', threshold: 25 }),
    ]),
    description: N_('Destroy 2+ enemy tanks within 1.5 seconds of each other.'),
  }),
  Object.freeze({
    id: 'air_support_ace',
    name: N_('Air Support Ace'),
    grade: 'bronze',
    category: N_('Arsenal'),
    progressKey: 'airSupportKills',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 10 }),
      Object.freeze({ grade: 'silver', threshold: 35 }),
      Object.freeze({ grade: 'gold', threshold: 80 }),
    ]),
    description: N_('Destroy enemies using Air Support strikes or air-dropped mines.'),
  }),
  Object.freeze({
    id: 'mine_sweeper',
    name: N_('Mine Sweeper'),
    grade: 'bronze',
    category: N_('Tactics'),
    progressKey: 'minesAndSappers',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 5 }),
      Object.freeze({ grade: 'silver', threshold: 20 }),
      Object.freeze({ grade: 'gold', threshold: 50 }),
    ]),
    description: N_('Destroy enemy mines or eliminate Sappers before they lay a mine.'),
  }),
  Object.freeze({
    id: 'demolition_crew',
    name: N_('Demolition Crew'),
    grade: 'bronze',
    category: N_('Tactics'),
    progressKey: 'blocksDestroyed',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 150 }),
      Object.freeze({ grade: 'silver', threshold: 600 }),
      Object.freeze({ grade: 'gold', threshold: 1500 }),
    ]),
    description: N_('Destroy terrain cover blocks across battles.'),
  }),
  Object.freeze({
    id: 'flank_master',
    name: N_('Flank Master'),
    grade: 'bronze',
    category: N_('Tactics'),
    progressKey: 'flankHeavyKills',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 3 }),
      Object.freeze({ grade: 'silver', threshold: 10 }),
      Object.freeze({ grade: 'gold', threshold: 25 }),
    ]),
    description: N_('Destroy Armor tanks or Sector Bosses with side or rear hits.'),
  }),
  Object.freeze({
    id: 'counter_battery',
    name: N_('Counter-Battery'),
    grade: 'bronze',
    category: N_('Tactics'),
    progressKey: 'counterBatteryKills',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 3 }),
      Object.freeze({ grade: 'silver', threshold: 10 }),
      Object.freeze({ grade: 'gold', threshold: 25 }),
    ]),
    description: N_('Destroy Howitzers before they complete their second artillery barrage.'),
  }),
  Object.freeze({
    id: 'ghost_hunter',
    name: N_('Ghost Hunter'),
    grade: 'bronze',
    category: N_('Tactics'),
    progressKey: 'ghostHunterKills',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 3 }),
      Object.freeze({ grade: 'silver', threshold: 10 }),
      Object.freeze({ grade: 'gold', threshold: 25 }),
    ]),
    description: N_('Destroy camouflaged Stealth tanks or Jammers from inside their 5-cell ECM bubble.'),
  }),
  Object.freeze({
    id: 'amphibious_assault',
    name: N_('Amphibious Assault'),
    grade: 'bronze',
    category: N_('Arsenal'),
    progressKey: 'waterKills',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 5 }),
      Object.freeze({ grade: 'silver', threshold: 15 }),
      Object.freeze({ grade: 'gold', threshold: 40 }),
    ]),
    description: N_('Destroy enemies while operating from deep water with CH4 / CH5 chassis.'),
  }),
  Object.freeze({
    id: 'fortress_guardian',
    name: N_('Fortress Guardian'),
    grade: 'bronze',
    category: N_('Defense'),
    progressKey: 'fortressVictories',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 3 }),
      Object.freeze({ grade: 'silver', threshold: 10 }),
      Object.freeze({ grade: 'gold', threshold: 25 }),
    ]),
    description: N_('Win missions with 100% Command HQ integrity.'),
  }),
  Object.freeze({
    id: 'hard_mode_veteran',
    name: N_('Hard Mode Veteran'),
    grade: 'bronze',
    category: N_('Challenge'),
    progressKey: 'hardModeVictories',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 5 }),
      Object.freeze({ grade: 'silver', threshold: 15 }),
      Object.freeze({ grade: 'gold', threshold: 30 }),
    ]),
    description: N_('Win missions in Hard Mode.'),
  }),
  Object.freeze({
    id: 'survival_veteran',
    name: N_('Paris Survivor'),
    grade: 'bronze',
    category: N_('Survival'),
    progressKey: 'bestSurvivalWaves',
    tiers: Object.freeze([
      Object.freeze({ grade: 'bronze', threshold: 3 }),
      Object.freeze({ grade: 'silver', threshold: 7 }),
      Object.freeze({ grade: 'gold', threshold: 10 }),
    ]),
    description: N_('Survive waves in a single Survival run.'),
  }),

  // --- SINGLE-BATTLE TACTICAL & ARSENAL MEDALS ---
  Object.freeze({
    id: 'saboteur',
    name: N_('Saboteur'),
    grade: 'bronze',
    category: N_('Tactics'),
    description: N_('Destroy an Engineer while it is repairing an ally or building fortifications.'),
    evaluate: ({ tracker }) => tracker.engineerKilledWhileActing >= 1,
  }),
  Object.freeze({
    id: 'bunker_buster',
    name: N_('Bunker Buster'),
    grade: 'bronze',
    category: N_('Tactics'),
    description: N_('Breach reinforced concrete and hit an enemy shortly after destroying the cover.'),
    evaluate: ({ tracker }) => tracker.bunkerBusterHits >= 1,
  }),
  Object.freeze({
    id: 'apex_vanguard',
    name: N_('Apex Vanguard'),
    grade: 'bronze',
    category: N_('Arsenal'),
    description: N_('Win a mission with all 5 core tank systems upgraded to Tier 5.'),
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
  Object.freeze({
    id: 'matador',
    name: N_('Matador'),
    grade: 'silver',
    category: N_('Tactics'),
    description: N_('Destroy a charging Kamikaze at close range before its warhead detonates.'),
    evaluate: ({ tracker }) => tracker.matadorKills >= 1,
  }),
  Object.freeze({
    id: 'iron_dome',
    name: N_('Iron Dome'),
    grade: 'silver',
    category: N_('Arsenal'),
    description: N_('Intercept 5+ incoming shells or missiles with the Active Protection System in one battle.'),
    evaluate: ({ tracker }) => tracker.apsIntercepts >= 5,
  }),
  Object.freeze({
    id: 'last_stand',
    name: N_('Last Stand'),
    grade: 'gold',
    category: N_('Defense'),
    description: N_('Destroy 2+ enemies while below 33% hull integrity and survive to win.'),
    evaluate: ({ isVictory, tracker }) => isVictory && tracker.lastStandKills >= 2,
  }),
  Object.freeze({
    id: 'twin_thunder',
    name: N_('Twin Thunder'),
    grade: 'gold',
    category: N_('Arsenal'),
    description: N_('Destroy two different enemies with a single dual-salvo of Cannon Mk5.'),
    evaluate: ({ tracker }) => tracker.twinThunderTriggered,
  }),
  Object.freeze({
    id: 'sky_hammer',
    name: N_('Sky Hammer'),
    grade: 'gold',
    category: N_('Arsenal'),
    description: N_('Destroy 3+ enemies with a single Air Support strike.'),
    evaluate: ({ tracker }) => tracker.skyHammerTriggered,
  }),

  // --- BOSSES & CONTRACTS (GOLD) ---
  Object.freeze({
    id: 'mammoth_slayer',
    name: N_('Mammoth Slayer'),
    grade: 'gold',
    category: N_('Bosses'),
    description: N_('Defeat BOSS_MAMMOTH.'),
    evaluate: ({ tracker }) => tracker.defeatedBosses.includes('BOSS_MAMMOTH'),
  }),
  Object.freeze({
    id: 'hydra_dodger',
    name: N_('Hydra Dodger'),
    grade: 'gold',
    category: N_('Bosses'),
    description: N_('Defeat BOSS_HYDRA.'),
    evaluate: ({ tracker }) => tracker.defeatedBosses.includes('BOSS_HYDRA'),
  }),
  Object.freeze({
    id: 'inferno_tamer',
    name: N_('Inferno Tamer'),
    grade: 'gold',
    category: N_('Bosses'),
    description: N_('Defeat BOSS_INFERNO.'),
    evaluate: ({ tracker }) => tracker.defeatedBosses.includes('BOSS_INFERNO'),
  }),
  Object.freeze({
    id: 'titan_breaker',
    name: N_('Titan Breaker'),
    grade: 'gold',
    category: N_('Bosses'),
    description: N_('Defeat BOSS_TITAN.'),
    evaluate: ({ tracker }) => tracker.defeatedBosses.includes('BOSS_TITAN'),
  }),
  Object.freeze({
    id: 'perfect_extraction',
    name: N_('Perfect Extraction'),
    grade: 'gold',
    category: N_('Contracts'),
    description: N_('Complete a Contract mission with all 3/3 cargo containers delivered.'),
    evaluate: ({ isVictory, hud }) => {
      if (!isVictory) return false;
      const delivered = Number(hud?.lastSettlementSummary?.deliveredCount ?? hud?.contract?.deliveredCount ?? 0);
      return Boolean(hud?.gameMode === 'contract' && delivered >= 3);
    },
  }),

  // --- VANGUARD ---
  Object.freeze({
    id: 'untouchable',
    name: N_('Untouchable'),
    grade: 'vanguard',
    category: N_('Challenge'),
    description: N_('Win a mission without taking any hull damage.'),
    evaluate: ({ isVictory, tracker }) => isVictory && tracker.playerDamageTaken === 0 && tracker.killsByClassTotal > 0,
  }),
  Object.freeze({
    id: 'exploit_the_gap',
    name: N_('Exploit the Gap'),
    grade: 'vanguard',
    category: N_('Bosses'),
    description: N_('Finish off BOSS_TITAN with a rear-aspect hit during its Overload phase (< 30% HP).'),
    evaluate: ({ isVictory, tracker }) => isVictory && tracker.titanOverloadRearKill,
  }),
  Object.freeze({
    id: 'david_vs_goliath',
    name: N_('David vs Goliath'),
    grade: 'vanguard',
    category: N_('Challenge'),
    description: N_('Win a mission using the stock Cannon Mk1 without firing ATGM missiles.'),
    evaluate: ({ isVictory, upgrades, tracker }) => {
      if (!isVictory) return false;
      const cannonTier = Number(upgrades?.cannon) || 1;
      return cannonTier === 1 && !tracker.missileFired;
    },
  }),
  Object.freeze({
    id: 'iron_will',
    name: N_('Iron Will'),
    grade: 'vanguard',
    category: N_('Challenge'),
    description: N_('Win every Campaign sector from the first mission through the finale in Hard Mode.'),
    evaluate: ({ isVictory, hardMode, campaignHardModeComplete }) =>
      Boolean(isVictory && hardMode && campaignHardModeComplete),
  }),
]);

const MEDAL_BY_ID = Object.freeze(
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
      doubleKills: 0,
      pendingPairStartMs: -Infinity,
      airSupportKills: 0,
      airStrikeKillsById: new Map(), // airStrikeId -> count
      skyHammerTriggered: false,
      defeatedBosses: [],
      hydraMlrsHitsTaken: 0,
      infernoRamHitsTaken: 0,
      titanRailHitsTaken: 0,
      titanOverloadRearKill: false,
      playerDamageTaken: 0,
      missileFired: false,
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

    recordPlayerMissileFired() {
      state.missileFired = true;
    },

    recordPlayerDamage({ amount = 0, sourceWeapon = null } = {}) {
      const dmg = Math.max(0, Number(amount) || 0);
      if (dmg > 0) state.playerDamageTaken += dmg;
      if (sourceWeapon === 'HYDRA_MLRS') state.hydraMlrsHitsTaken += 1;
      if (sourceWeapon === 'INFERNO_RAM') state.infernoRamHitsTaken += 1;
      if (sourceWeapon === 'BOSS_DUAL') state.titanRailHitsTaken += 1;
    },

    recordEnemyKill({
      enemyClass,
      aspect = 'front',
      playerHpRatio = 1,
      playerInWater = false,
      salvoId = null,
      isAirSupport = false,
      airStrikeId = null,
      nowMs = Date.now(),
      minesPlaced = 0,
      engineerActing = false,
      kamikazeChargingClose = false,
      howitzerBarrages = 0,
      stealthCamouflaged = false,
      jammerPulsing = false,
      bossOverloaded = false,
    } = {}) {
      const normalizedClass = normalizeEnemyClass(enemyClass);
      if (!normalizedClass) return;
      state.killsByClass[normalizedClass] = (state.killsByClass[normalizedClass] || 0) + 1;
      state.killsByClassTotal += 1;

      if (normalizedClass === 'SAPPER' && minesPlaced === 0) {
        state.sapperKilledBeforeMining += 1;
      }
      if (normalizedClass === 'ENGINEER' && engineerActing) {
        state.engineerKilledWhileActing += 1;
      }
      if ((normalizedClass === 'ARMOR' || BOSS_CLASSES.has(normalizedClass)) && (aspect === 'side' || aspect === 'left' || aspect === 'right' || aspect === 'rear')) {
        state.flankHeavyKills += 1;
      }
      if (normalizedClass === 'KAMIKAZE' && kamikazeChargingClose) {
        state.matadorKills += 1;
      }
      if (normalizedClass === 'HOWITZER' && howitzerBarrages < 2) {
        state.counterBatteryKills += 1;
      }
      if ((normalizedClass === 'STEALTH' && stealthCamouflaged) || (normalizedClass === 'JAMMER' && jammerPulsing)) {
        state.ghostHunterKills += 1;
      }
      if (playerInWater) {
        state.waterKills += 1;
      }
      if (playerHpRatio > 0 && playerHpRatio < 0.33) {
        state.lastStandKills += 1;
      }
      if (salvoId != null) {
        for (const [key, entry] of state.salvoHistory.entries()) {
          if (nowMs - entry.timeMs > 1200) {
            state.salvoHistory.delete(key);
          }
        }
        const prev = state.salvoHistory.get(salvoId);
        if (prev) {
          prev.count += 1;
          if (prev.count >= 2) {
            state.twinThunderTriggered = true;
          }
        } else {
          state.salvoHistory.set(salvoId, { count: 1, timeMs: nowMs });
        }
      }
      if (nowMs - state.pendingPairStartMs <= 1500) {
        state.doubleKills += 1;
        state.pendingPairStartMs = -Infinity;
      } else {
        state.pendingPairStartMs = nowMs;
      }
      if (isAirSupport) {
        state.airSupportKills += 1;
        if (airStrikeId != null) {
          const nextCount = (state.airStrikeKillsById.get(airStrikeId) || 0) + 1;
          state.airStrikeKillsById.set(airStrikeId, nextCount);
          if (nextCount >= 3) {
            state.skyHammerTriggered = true;
          }
        }
      }
      if (BOSS_CLASSES.has(normalizedClass)) {
        if (!state.defeatedBosses.includes(normalizedClass)) {
          state.defeatedBosses.push(normalizedClass);
        }
        if (normalizedClass === 'BOSS_TITAN' && bossOverloaded && aspect === 'rear') {
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
 * Returns true if every mission in the Campaign has been completed in Hard Mode.
 */
export function isCampaignHardModeComplete(completedMissions = {}, campaignMissions = []) {
  if (!Array.isArray(campaignMissions) || campaignMissions.length === 0) return false;
  return campaignMissions.every((mission) => Boolean(completedMissions?.[mission.id]?.hardMode));
}

/**
 * Computes updated cumulative career progress for tiered medals without mutating existingProgress.
 */
function computeNextMedalProgress(
  existingProgress = {},
  { tracker, hud, isVictory = false, hardMode = false, isSurvival = false } = {}
) {
  const prev = existingProgress && typeof existingProgress === 'object' ? existingProgress : {};
  const tState = tracker || {};
  const baseMaxHp = Number(hud?.baseMaxHp) || 0;
  const baseHp = Number(hud?.baseHp) || 0;
  const fullHqVictory = isVictory && baseMaxHp > 0 && baseHp >= baseMaxHp;
  const survivalWavesCleared = isSurvival
    ? Math.max(
        0,
        Number(hud?.survival?.recordSummary?.wavesCleared ?? hud?.survival?.wavesCleared ?? 0) || 0
      )
    : 0;

  return {
    totalKills: (Number(prev.totalKills) || 0) + (Number(tState.killsByClassTotal) || 0),
    doubleKills: (Number(prev.doubleKills) || 0) + (Number(tState.doubleKills) || 0),
    airSupportKills: (Number(prev.airSupportKills) || 0) + (Number(tState.airSupportKills) || 0),
    minesAndSappers:
      (Number(prev.minesAndSappers) || 0) +
      (Number(tState.minesShot) || 0) +
      (Number(tState.sapperKilledBeforeMining) || 0),
    blocksDestroyed:
      (Number(prev.blocksDestroyed) || 0) + (Number(hud?.blocksDestroyed) || 0),
    flankHeavyKills:
      (Number(prev.flankHeavyKills) || 0) + (Number(tState.flankHeavyKills) || 0),
    counterBatteryKills:
      (Number(prev.counterBatteryKills) || 0) + (Number(tState.counterBatteryKills) || 0),
    ghostHunterKills:
      (Number(prev.ghostHunterKills) || 0) + (Number(tState.ghostHunterKills) || 0),
    waterKills: (Number(prev.waterKills) || 0) + (Number(tState.waterKills) || 0),
    fortressVictories: (Number(prev.fortressVictories) || 0) + (fullHqVictory ? 1 : 0),
    hardModeVictories: (Number(prev.hardModeVictories) || 0) + (isVictory && hardMode ? 1 : 0),
    bestSurvivalWaves: Math.max(Number(prev.bestSurvivalWaves) || 0, survivalWavesCleared),
  };
}

/**
 * Resolves the current display & progression state of a medal (supports both single-grade and tiered medals).
 */
export function getMedalCurrentState(medal, entry = null, medalProgress = {}) {
  const count = Number(entry?.count) || 0;
  if (!Array.isArray(medal?.tiers) || medal.tiers.length === 0) {
    return {
      isTiered: false,
      unlocked: count > 0,
      grade: medal.grade,
      count,
      progress: null,
      nextThreshold: null,
      maxThreshold: null,
      isMaxTier: count > 0,
    };
  }

  const progress = Math.max(
    0,
    Number(medalProgress?.[medal.progressKey] ?? entry?.progress ?? 0) || 0
  );
  let achievedGrade = null;
  let achievedOrder = 0;

  for (const tier of medal.tiers) {
    const order = MEDAL_GRADES[tier.grade]?.order || 0;
    if (progress >= tier.threshold && order > achievedOrder) {
      achievedGrade = tier.grade;
      achievedOrder = order;
    }
  }

  // Preserve legacy or previously recorded grade if higher than threshold-derived grade
  const entryGrade = entry?.grade && MEDAL_GRADES[entry.grade] ? entry.grade : count > 0 ? medal.tiers[0].grade : null;
  if (entryGrade && (MEDAL_GRADES[entryGrade]?.order || 0) > achievedOrder) {
    achievedGrade = entryGrade;
    achievedOrder = MEDAL_GRADES[entryGrade].order;
  }

  const nextTier = medal.tiers.find((tier) => (MEDAL_GRADES[tier.grade]?.order || 0) > achievedOrder) || null;
  const maxThreshold = medal.tiers[medal.tiers.length - 1]?.threshold ?? null;

  return {
    isTiered: true,
    unlocked: Boolean(achievedGrade),
    grade: achievedGrade || medal.tiers[0].grade,
    achievedGrade,
    count,
    progress,
    nextThreshold: nextTier ? nextTier.threshold : null,
    nextGrade: nextTier ? nextTier.grade : null,
    maxThreshold,
    isMaxTier: !nextTier && Boolean(achievedGrade),
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
  isSurvival = false,
  existingMedals = {},
  existingProgress = {},
  hardMode = false,
  campaignHardModeComplete = false,
} = {}) {
  const tracker = trackerState || createBattleMedalTracker().snapshot();
  const survivalMode = Boolean(isSurvival || hud?.gameMode === 'survival');
  const nextProgress = computeNextMedalProgress(existingProgress, {
    tracker,
    hud: hud || {},
    isVictory: Boolean(isVictory),
    hardMode: Boolean(hardMode),
    isSurvival: survivalMode,
  });
  const context = {
    tracker,
    hud: hud || {},
    upgrades: upgrades || {},
    equippedModules,
    isVictory: Boolean(isVictory),
    hardMode: Boolean(hardMode),
    campaignHardModeComplete: Boolean(campaignHardModeComplete),
  };

  const earnedMedals = [];
  for (const medal of MEDAL_CATALOG) {
    if (Array.isArray(medal.tiers) && medal.tiers.length > 0) {
      const prevState = getMedalCurrentState(medal, existingMedals?.[medal.id], existingProgress);
      const nextState = getMedalCurrentState(medal, existingMedals?.[medal.id], nextProgress);
      const prevOrder = prevState.achievedGrade ? MEDAL_GRADES[prevState.achievedGrade]?.order || 0 : 0;
      const nextOrder = nextState.achievedGrade ? MEDAL_GRADES[nextState.achievedGrade]?.order || 0 : 0;
      if (nextOrder > prevOrder && nextState.achievedGrade) {
        const gradeMeta = MEDAL_GRADES[nextState.achievedGrade];
        earnedMedals.push({
          id: medal.id,
          name: medal.name,
          grade: nextState.achievedGrade,
          previousGrade: prevState.achievedGrade || null,
          tierUp: true,
          gradeLabel: gradeMeta.label,
          color: gradeMeta.color,
          category: medal.category,
          description: medal.description,
          isNew: prevOrder === 0,
          xpAwarded: gradeMeta.firstXp,
          progress: nextState.progress,
          nextThreshold: nextState.nextThreshold,
        });
      }
      continue;
    }

    if (medal.evaluate(context)) {
      const gradeMeta = MEDAL_GRADES[medal.grade];
      const alreadyOwned = Boolean(existingMedals?.[medal.id]?.count > 0);
      const xpAwarded = alreadyOwned ? gradeMeta.repeatXp : gradeMeta.firstXp;
      earnedMedals.push({
        id: medal.id,
        name: medal.name,
        grade: medal.grade,
        tierUp: false,
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
    nextProgress,
    combatXp,
    medalXp,
    totalXp,
  };
}

/**
 * Counts how many unique medals of Gold+ and Vanguard grades a player has unlocked.
 */
function countMedalGrades(medalsMap = {}) {
  let goldPlus = 0;
  let vanguard = 0;
  let totalUnlocked = 0;

  for (const [id, entry] of Object.entries(medalsMap || {})) {
    if (!entry || (entry.count || 0) <= 0) continue;
    const def = MEDAL_BY_ID[id];
    if (!def) continue;
    totalUnlocked += 1;
    const effectiveGrade = entry.grade || def.grade || def.tiers?.[0]?.grade;
    if (effectiveGrade === 'gold' || effectiveGrade === 'vanguard') {
      goldPlus += 1;
    }
    if (effectiveGrade === 'vanguard') {
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
        missingGate = t('Requires {n} Vanguard medal', { n: nextRank.minVanguard });
      } else if (goldPlus < nextRank.minGoldPlus) {
        missingGate = t('Requires {n} Gold+ medals ({have}/{n})', { n: nextRank.minGoldPlus, have: goldPlus });
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
  if (evaluation.nextProgress && typeof evaluation.nextProgress === 'object') {
    playerSave.medalProgress = { ...evaluation.nextProgress };
  }

  const newlyUnlockedIds = [];
  const nowIso = new Date().toISOString();

  for (const medal of evaluation.earnedMedals || []) {
    const prev = playerSave.medals[medal.id];
    if (prev && prev.count > 0) {
      prev.count += 1;
      prev.lastEarnedAt = nowIso;
      if (medal.grade) prev.grade = medal.grade;
      if (medal.progress != null) prev.progress = medal.progress;
    } else {
      playerSave.medals[medal.id] = {
        count: 1,
        grade: medal.grade,
        ...(medal.progress != null ? { progress: medal.progress } : {}),
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
