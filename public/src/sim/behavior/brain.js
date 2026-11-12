/**
 * Role brains: pick a tactic for the current situation, choose a tactical cell,
 * path to it with A* and hand the engine the next waypoint to steer toward.
 *
 * The brain decides WHERE to go and WHEN a role special is wanted (mine, jam).
 * Gunnery stays in gunner.js; the engine still owns collisions, weapons and specials.
 */

import { findPath, isPassableCell } from './navgrid.js';
import { cellStillValid, findTacticalCells } from './positions.js';

/** Role tuning. Distances are in grid cells, times in seconds. */
export const ROLE_CONFIGS = Object.freeze({
  // STANDARD: bounding overwatch - shoot from a firing cell, then duck behind cover
  line: Object.freeze({
    engage: { minCells: 4, maxCells: 9, los: true, coverWeight: 0.6, travelWeight: 0.25, maxTravel: 9, slotWeight: 1.2 },
    engageSec: [3.0, 5.0],
    cover: { minCells: 3, maxCells: 9, los: false, coverWeight: 1.0, travelWeight: 0.45, maxTravel: 6 },
    coverSec: [1.4, 2.4],
    retreat: { minCells: 7, maxCells: 12, los: false, coverWeight: 1.2, travelWeight: 0.1, maxTravel: 14 },
    retreatSec: 4.0,
    retreatHpRatio: 0.35,
    retreatCooldownSec: 14,
  }),
  // SCOUT: keep range, circle to the player's flank / rear, break contact when hit
  flanker: Object.freeze({
    flank: { minCells: 6, maxCells: 10, los: true, flankWeight: 2.2, slotWeight: 1.0, travelWeight: 0.08, maxTravel: 14 },
    flankSec: [2.8, 4.2],
    kiteBelowCells: 5,
    evade: { minCells: 6, maxCells: 11, los: false, coverWeight: 0.8, travelWeight: 0.2, maxTravel: 10 },
    evadeSec: 2.0,
    evadeCooldownSec: 5,
  }),
  // ARMOR: push straight into close range and hold glacis-first; never retreats
  spearhead: Object.freeze({
    advance: { minCells: 2, maxCells: 4, los: true, travelWeight: 0.3, maxTravel: 20, slotWeight: 0.8 },
    advanceSec: [2.0, 3.0],
  }),
  // HOWITZER: hidden firing position fed by spotters; shoot and scoot; flee close threats
  artillery: Object.freeze({
    emplace: { minCells: 7, maxCells: 11, los: false, coverWeight: 1.0, forestBonus: 1.0, travelWeight: 0.15, maxTravel: 14 },
    relocateAfterShots: [2, 3],
    fleeBelowCells: 5,
    flee: { minCells: 8, maxCells: 12, los: false, coverWeight: 0.5, travelWeight: 0.05, maxTravel: 16 },
    fleeSec: 3.0,
  }),
  // SAPPER: mine chokepoints on the player's recent route; avoid fights; mine while retreating
  minelayer: Object.freeze({
    mine: { minCells: 3, maxCells: 9, los: false, chokeWeight: 2.5, preferWeight: 3.0, preferFrom: 'trail', travelWeight: 0.15, maxTravel: 12, avoidFrom: 'mines', avoidRadius: 3 },
    evadeBelowCells: 4,
    evade: { minCells: 7, maxCells: 11, los: false, coverWeight: 0.8, travelWeight: 0.15, maxTravel: 12 },
    evadeSec: 2.5,
    mineWhileEvadingCells: 8,
  }),
  // HOVER: hit from (or next to) water the player cannot cross, then withdraw
  raider: Object.freeze({
    strike: { minCells: 5, maxCells: 8, los: true, waterBonus: 1.0, travelWeight: 0.1, maxTravel: 14, slotWeight: 0.8 },
    strikeSec: [2.5, 3.5],
    withdraw: { minCells: 8, maxCells: 12, los: false, waterBonus: 1.0, travelWeight: 0.1, maxTravel: 12 },
    withdrawSec: [1.8, 2.6],
    waterBonusVsDryPlayer: 3.0,
  }),
  // KAMIKAZE: approach through cells hidden from the player, then a telegraphed zigzag charge
  hunter: Object.freeze({
    stalk: { minCells: 2, maxCells: 5, los: false, coverWeight: 0.3, travelWeight: 0.2, maxTravel: 20 },
    chargeBelowCells: 5,
    chargeKeepCells: 7,
  }),
  // FLAMETHROWER: wait hidden near the player (forest, corners), rush when they come close
  ambusher: Object.freeze({
    lurk: { minCells: 3, maxCells: 6, los: false, forestBonus: 1.5, coverWeight: 0.8, chokeWeight: 1.0, travelWeight: 0.2, maxTravel: 12 },
    rushBelowCells: 6,
    rushKeepCells: 8,
  }),
  // JAMMER: shadow the squad out of sight; dash into jam range only while allies are engaged
  ewar: Object.freeze({
    jamRun: { minCells: 3, maxCells: 5, los: null, coverWeight: 0.4, travelWeight: 0.1, maxTravel: 14 },
    jamCells: 5.5,
    shadow: { minCells: 8, maxCells: 12, los: false, coverWeight: 0.8, travelWeight: 0.15, maxTravel: 12 },
    withdrawSec: 3.0,
  }),
  // ENGINEER: repair the most damaged ally out of sight; otherwise fortify; flee close threats
  support: Object.freeze({
    repair: { minCells: 1, maxCells: 2.5, los: false, coverWeight: 0.5, travelWeight: 0.1, maxTravel: 16, anchor: 'repair' },
    fortify: { minCells: 6, maxCells: 9, los: null, coverWeight: 0.6, travelWeight: 0.2, maxTravel: 10 },
    fleeBelowCells: 5,
    flee: { minCells: 8, maxCells: 12, los: false, coverWeight: 0.8, travelWeight: 0.1, maxTravel: 14 },
    fleeSec: 2.5,
  }),
  // STRIKER: stand-off missile carrier; needs LOS; shifts sideways after each launch
  standoff: Object.freeze({
    launch: { minCells: 7, maxCells: 10, los: true, coverWeight: 0.4, travelWeight: 0.25, maxTravel: 8, slotWeight: 0.6 },
    relocateAfterShots: [1, 2],
    backoffBelowCells: 5,
    backoff: { minCells: 8, maxCells: 11, los: true, travelWeight: 0.05, maxTravel: 12 },
    backoffSec: 2.0,
  }),
  // STEALTH: still overwatch on a long sight lane; one shot, then slip away and re-set
  sniper: Object.freeze({
    overwatch: { minCells: 8, maxCells: 11, los: true, coverWeight: 0.5, forestBonus: 1.0, travelWeight: 0.2, maxTravel: 10 },
    relocateAfterShots: [1, 1],
    reposition: { minCells: 7, maxCells: 11, los: false, coverWeight: 0.6, travelWeight: 0.25, maxTravel: 6 },
    repositionSec: [1.5, 2.5],
    tooCloseCells: 5,
  }),
  // BOSS_MAMMOTH: brawler; grinds into 3-6 cells and side-steps every other cycle
  dreadnought: Object.freeze({
    advance: { minCells: 3, maxCells: 6, los: true, travelWeight: 0.25, maxTravel: 20, slotWeight: 0.6 },
    advanceSec: [2.5, 3.5],
    shiftEvery: 2,
  }),
  // BOSS_HYDRA: stand-off rocket cruiser; strafes inside its band, presses closer in phase 2
  cruiser: Object.freeze({
    standoff: { minCells: 10, maxCells: 13, los: true, waterBonus: 1.5, travelWeight: 0.1, maxTravel: 16 },
    strafeSec: [2.0, 3.0],
    pressCells: [6, 10],
  }),
  // BOSS_TITAN: fortress; advances glacis-first to its hold distance and stays there
  fortress: Object.freeze({
    hold: { minCells: 3, maxCells: 4, los: true, travelWeight: 0.3, maxTravel: 24 },
    holdSec: [2.5, 3.5],
  }),
  // BOSS_INFERNO: juggernaut; aggressively presses into 3-7 cells and shifts flank every cycle
  juggernaut: Object.freeze({
    advance: { minCells: 3, maxCells: 7, los: true, travelWeight: 0.2, maxTravel: 24, slotWeight: 0.5 },
    advanceSec: [2.0, 3.0],
    shiftEvery: 1,
  }),
});

/**
 * @param {string} role  key of ROLE_CONFIGS
 * @param {() => number} random
 * @param {object} [overrides]  top-level cfg keys to replace (e.g. boss bands from constants.js)
 */
export function createBrain(role, random = Math.random, overrides = null) {
  if (!ROLE_CONFIGS[role]) return null;
  return {
    role,
    cfg: overrides ? { ...ROLE_CONFIGS[role], ...overrides } : ROLE_CONFIGS[role],
    cycle: 0,
    random,
    tactic: 'idle',
    tacticTimer: 0,
    query: null,
    goal: null,
    path: [],
    pathIdx: 0,
    direct: false,
    approach: false,
    lastHp: null,
    retreatCooldown: 0,
    evadeCooldown: 0,
    shotsSinceMove: 0,
    relocateAfter: 1,
    repairId: null,
    justJammed: false,
    wantMine: false,
    wantJam: false,
  };
}

/** Engine hook: the tank fired from its current position (shoot-and-scoot roles). */
export function notifyBrainFired(brain) {
  if (brain) brain.shotsSinceMove++;
}

/** Engine hook: a mine was planted; pick the next mining spot. */
export function notifyBrainMined(brain) {
  if (!brain || brain.tactic !== 'mine') return;
  brain.tactic = 'idle';
  brain.goal = null;
}

/** Engine hook: an ECM pulse went off; withdraw out of sight. */
export function notifyBrainJammed(brain) {
  if (!brain) return;
  brain.justJammed = true;
  brain.tactic = 'idle';
}

/** Brain loses control (no contact): forget the current plan. */
export function resetBrain(brain) {
  if (!brain) return;
  brain.tactic = 'idle';
  brain.tacticTimer = 0;
  brain.query = null;
  brain.goal = null;
  brain.path = [];
  brain.pathIdx = 0;
  brain.direct = false;
  brain.wantMine = false;
  brain.wantJam = false;
}

/** Seconds between brain re-plans while it drives the tank (random in [min, max]). */
export const BRAIN_REPLAN_SEC = Object.freeze([0.6, 1.0]);

function range(random, [lo, hi]) {
  return lo + random() * (hi - lo);
}

/** Random score noise in tactical cell choice, so tanks of one role do not all pick the same cell. */
const POSITION_NOISE = 0.6;
/** Chance that a flanker breaks contact after taking a hit. */
const FLANKER_EVADE_CHANCE = 0.65;

function setPath(brain, ctx, goal, allowBreach = false) {
  const path = findPath(ctx.grid, ctx.self, goal, {
    canCrossWater: ctx.self.canCrossWater,
    allowBreach,
    occupiedCells: ctx.occupiedCells,
    wideClearance: Boolean(ctx.isBoss),
    bossCrushable: Boolean(ctx.isBoss),
  });
  if (!path) return false;
  brain.goal = { row: goal.row, col: goal.col };
  brain.path = path;
  brain.pathIdx = 0;
  brain.isBreachPath = allowBreach;
  return true;
}

function queryTarget(ctx, query) {
  return query?.anchor === 'repair' && ctx.repairTarget ? ctx.repairTarget : ctx.target;
}

/** Pick a tactical cell for `query` and path to it; falls back step by step. */
function planQuery(brain, ctx, query) {
  const target = queryTarget(ctx, query);
  const avoid = [...(ctx.allyGoals || [])];
  if (query.avoidFrom === 'mines' && ctx.mines) avoid.push(...ctx.mines);
  if (query.avoidSelfGoal && brain.goal) avoid.push(brain.goal);
  const full = {
    ...query,
    self: ctx.self,
    target,
    flankDir: query.flankWeight ? ctx.flankDir : null,
    slotDir: query.slotWeight ? ctx.slotDir : null,
    preferCells: query.preferFrom === 'trail' ? ctx.playerTrail : null,
    avoid,
    canCrossWater: ctx.self.canCrossWater,
    noise: POSITION_NOISE,
    random: brain.random,
  };
  brain.query = full;
  brain.approach = false;
  for (const cell of findTacticalCells(ctx.grid, full)) {
    if (setPath(brain, ctx, cell)) return true;
  }
  // Nothing in reach: accept a longer drive to a matching cell
  for (const cell of findTacticalCells(ctx.grid, { ...full, maxTravel: Infinity })) {
    if (setPath(brain, ctx, cell)) return true;
  }
  // Open ground with no hidden / visible cell in the band: keep the band, drop the LOS rule
  if (full.los !== null) {
    for (const cell of findTacticalCells(ctx.grid, { ...full, los: null, maxTravel: Infinity })) {
      if (setPath(brain, ctx, cell)) return true;
    }
  }
  // Still nothing (e.g. target walled off): close in and re-query on every re-plan
  if (setPath(brain, ctx, target)) {
    brain.approach = true;
    return true;
  }
  // Try breach pathfinding towards target through destructible walls!
  if (setPath(brain, ctx, target, true)) {
    brain.approach = true;
    return true;
  }
  brain.goal = null;
  brain.path = [];
  return false;
}

/** Path to the (last known) target cell or the nearest reachable cell next to it. */
function planInvestigate(brain, ctx) {
  brain.query = null;
  if (isPassableCell(ctx.grid, ctx.target.row, ctx.target.col, ctx.self.canCrossWater)) {
    if (setPath(brain, ctx, ctx.target)) return true;
  }
  if (planQuery(brain, ctx, { minCells: 0, maxCells: 3, los: null, travelWeight: 0.05, maxTravel: 36 })) return true;
  return setPath(brain, ctx, ctx.target, true);
}

function startTactic(brain, ctx, tactic, query, durationSec) {
  brain.tactic = tactic;
  brain.tacticTimer = durationSec;
  brain.direct = false;
  if (tactic === 'investigate') return planInvestigate(brain, ctx);
  return planQuery(brain, ctx, query);
}

/** Drive straight at the player (final charge / rush); the engine steers directly. */
function startDirect(brain, tactic) {
  brain.tactic = tactic;
  brain.tacticTimer = 0;
  brain.direct = true;
  brain.query = null;
  brain.goal = null;
  brain.path = [];
  brain.pathIdx = 0;
}

function shootAndScoot(brain, cfg) {
  brain.shotsSinceMove = 0;
  brain.relocateAfter = Math.round(range(brain.random, cfg.relocateAfterShots));
}

const TIMED_TACTICS = new Set(['cover', 'retreat', 'evade', 'flee', 'withdraw', 'reposition', 'backoff']);
const timedActive = (brain) => TIMED_TACTICS.has(brain.tactic) && brain.tacticTimer > 0;
const investigating = (brain) => brain.tactic === 'investigate' && brain.goal;

function decideLine(brain, ctx, cfg) {
  if (ctx.hpRatio < cfg.retreatHpRatio && brain.retreatCooldown <= 0 && brain.tactic !== 'retreat') {
    brain.retreatCooldown = cfg.retreatCooldownSec;
    return startTactic(brain, ctx, 'retreat', cfg.retreat, cfg.retreatSec);
  }
  if (timedActive(brain)) return null;
  // After ducking into cover the crew peeks out again rather than charging blindly
  const fromCover = brain.tactic === 'cover' || brain.tactic === 'retreat';
  if (!ctx.visible && !fromCover) {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (brain.tactic === 'engage' && brain.tacticTimer > 0) return null;
  if (brain.tactic === 'engage') {
    return startTactic(brain, ctx, 'cover', cfg.cover, range(brain.random, cfg.coverSec));
  }
  return startTactic(brain, ctx, 'engage', cfg.engage, range(brain.random, cfg.engageSec));
}

function decideFlanker(brain, ctx, cfg) {
  if (ctx.tookHit && brain.evadeCooldown <= 0 && brain.random() < FLANKER_EVADE_CHANCE) {
    brain.evadeCooldown = cfg.evadeCooldownSec;
    return startTactic(brain, ctx, 'evade', cfg.evade, cfg.evadeSec);
  }
  if (timedActive(brain)) return null;
  if (!ctx.visible && brain.tactic !== 'evade') {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (ctx.distCells < cfg.kiteBelowCells && brain.tactic !== 'kite') {
    return startTactic(brain, ctx, 'kite', cfg.flank, range(brain.random, cfg.flankSec));
  }
  if ((brain.tactic === 'flank' || brain.tactic === 'kite') && brain.tacticTimer > 0) return null;
  return startTactic(brain, ctx, 'flank', cfg.flank, range(brain.random, cfg.flankSec));
}

function decideSpearhead(brain, ctx, cfg) {
  if (!ctx.visible) {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (brain.tactic === 'advance' && brain.tacticTimer > 0) return null;
  return startTactic(brain, ctx, 'advance', cfg.advance, range(brain.random, cfg.advanceSec));
}

function decideArtillery(brain, ctx, cfg) {
  if (ctx.distCells < cfg.fleeBelowCells && brain.tactic !== 'flee') {
    return startTactic(brain, ctx, 'flee', cfg.flee, cfg.fleeSec);
  }
  if (timedActive(brain)) return null;
  if (brain.tactic === 'emplace' && brain.goal && brain.shotsSinceMove < brain.relocateAfter) {
    return null;
  }
  shootAndScoot(brain, cfg);
  return startTactic(brain, ctx, 'emplace', cfg.emplace, 0);
}

function decideMinelayer(brain, ctx, cfg) {
  if ((ctx.minesLeft ?? 0) <= 0) return decideLine(brain, ctx, ROLE_CONFIGS.line);
  if (ctx.visible && ctx.distCells < cfg.evadeBelowCells && brain.tactic !== 'evade') {
    return startTactic(brain, ctx, 'evade', cfg.evade, cfg.evadeSec);
  }
  if (timedActive(brain)) return null;
  if (brain.tactic === 'mine' && brain.goal) return null;
  return startTactic(brain, ctx, 'mine', cfg.mine, 0);
}

function decideRaider(brain, ctx, cfg) {
  const water = ctx.playerCanCrossWater ? 1 : cfg.waterBonusVsDryPlayer;
  if (timedActive(brain)) return null;
  if (!ctx.visible && brain.tactic !== 'withdraw') {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (brain.tactic === 'strike' && brain.tacticTimer > 0) return null;
  if (brain.tactic === 'strike') {
    return startTactic(brain, ctx, 'withdraw', { ...cfg.withdraw, waterBonus: water }, range(brain.random, cfg.withdrawSec));
  }
  return startTactic(brain, ctx, 'strike', { ...cfg.strike, waterBonus: water }, range(brain.random, cfg.strikeSec));
}

function decideHunter(brain, ctx, cfg) {
  const charging = brain.tactic === 'charge' && ctx.distCells < cfg.chargeKeepCells;
  if ((ctx.visible && ctx.distCells <= cfg.chargeBelowCells) || charging) {
    if (brain.tactic !== 'charge') startDirect(brain, 'charge');
    return null;
  }
  if (!ctx.visible) {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (brain.tactic === 'stalk' && brain.goal && brain.pathIdx < brain.path.length) return null;
  return startTactic(brain, ctx, 'stalk', cfg.stalk, 0);
}

function decideAmbusher(brain, ctx, cfg) {
  const rushing = brain.tactic === 'rush' && ctx.visible && ctx.distCells < cfg.rushKeepCells;
  if ((ctx.visible && ctx.distCells <= cfg.rushBelowCells) || rushing) {
    if (brain.tactic !== 'rush') startDirect(brain, 'rush');
    return null;
  }
  // Waiting in ambush is the point: keep the lurk cell while it still fits
  if (brain.tactic === 'lurk' && brain.goal) return null;
  return startTactic(brain, ctx, 'lurk', cfg.lurk, 0);
}

function decideEwar(brain, ctx, cfg) {
  if (brain.justJammed) {
    brain.justJammed = false;
    return startTactic(brain, ctx, 'withdraw', cfg.shadow, cfg.withdrawSec);
  }
  if (timedActive(brain)) return null;
  if (ctx.alliesEngaged && ctx.specialReady) {
    if (brain.tactic === 'jam' && brain.goal) return null;
    return startTactic(brain, ctx, 'jam', cfg.jamRun, 0);
  }
  if (brain.tactic === 'shadow' && brain.goal) return null;
  return startTactic(brain, ctx, 'shadow', cfg.shadow, 0);
}

function decideSupport(brain, ctx, cfg) {
  if (ctx.visible && ctx.distCells < cfg.fleeBelowCells && brain.tactic !== 'flee') {
    return startTactic(brain, ctx, 'flee', cfg.flee, cfg.fleeSec);
  }
  if (timedActive(brain)) return null;
  if (ctx.repairTarget) {
    if (brain.tactic === 'repair' && brain.goal && brain.repairId === ctx.repairTarget.id) return null;
    brain.repairId = ctx.repairTarget.id;
    return startTactic(brain, ctx, 'repair', cfg.repair, 0);
  }
  brain.repairId = null;
  if (brain.tactic === 'fortify' && brain.goal) return null;
  return startTactic(brain, ctx, 'fortify', cfg.fortify, 0);
}

function decideStandoff(brain, ctx, cfg) {
  if (ctx.visible && ctx.distCells < cfg.backoffBelowCells && brain.tactic !== 'backoff') {
    return startTactic(brain, ctx, 'backoff', cfg.backoff, cfg.backoffSec);
  }
  if (timedActive(brain)) return null;
  if (!ctx.visible && brain.tactic !== 'backoff') {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (brain.tactic === 'launch' && brain.goal && brain.shotsSinceMove < brain.relocateAfter) return null;
  const shifting = brain.tactic === 'launch';
  shootAndScoot(brain, cfg);
  // Shift sideways: same band, away from the cell it just fired from
  return startTactic(brain, ctx, 'launch', shifting ? { ...cfg.launch, avoidSelfGoal: true, avoidRadius: 3 } : cfg.launch, 0);
}

function decideSniper(brain, ctx, cfg) {
  if (ctx.visible && ctx.distCells < cfg.tooCloseCells && brain.tactic !== 'reposition') {
    return startTactic(brain, ctx, 'reposition', cfg.reposition, range(brain.random, cfg.repositionSec));
  }
  if (timedActive(brain)) return null;
  if (brain.tactic === 'overwatch' && brain.goal && brain.shotsSinceMove >= brain.relocateAfter) {
    shootAndScoot(brain, cfg);
    return startTactic(brain, ctx, 'reposition', cfg.reposition, range(brain.random, cfg.repositionSec));
  }
  if (brain.tactic === 'overwatch' && brain.goal) return null;
  shootAndScoot(brain, cfg);
  // Overwatch the (last known) player cell even without current contact: no blind charge
  return startTactic(brain, ctx, 'overwatch', cfg.overwatch, 0);
}

function decideDreadnought(brain, ctx, cfg) {
  if (!ctx.visible) {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (brain.tactic === 'advance' && brain.tacticTimer > 0) return null;
  brain.cycle++;
  const shift = brain.tactic === 'advance' && brain.cycle % cfg.shiftEvery === 0;
  const query = shift ? { ...cfg.advance, avoidSelfGoal: true, avoidRadius: 2.5 } : cfg.advance;
  return startTactic(brain, ctx, 'advance', query, range(brain.random, cfg.advanceSec));
}

function decideCruiser(brain, ctx, cfg) {
  if (!ctx.visible) {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  // Phase 2: no more retreating, press into salvo range
  const tactic = ctx.bossPhase2 ? 'press' : 'standoff';
  if (brain.tactic === tactic && brain.tacticTimer > 0) return null;
  const band = ctx.bossPhase2
    ? { ...cfg.standoff, minCells: cfg.pressCells[0], maxCells: cfg.pressCells[1] }
    : cfg.standoff;
  // Re-picking inside the same band = strafe away from the current cell
  const query = brain.tactic === tactic ? { ...band, avoidSelfGoal: true, avoidRadius: 3 } : band;
  return startTactic(brain, ctx, tactic, query, range(brain.random, cfg.strafeSec));
}

function decideFortress(brain, ctx, cfg) {
  if (!ctx.visible) {
    if (investigating(brain)) return null;
    return startTactic(brain, ctx, 'investigate', null, 0);
  }
  if (brain.tactic === 'hold' && brain.tacticTimer > 0) return null;
  return startTactic(brain, ctx, 'hold', cfg.hold, range(brain.random, cfg.holdSec));
}

const DECIDERS = {
  dreadnought: decideDreadnought,
  juggernaut: decideDreadnought,
  cruiser: decideCruiser,
  fortress: decideFortress,
  line: decideLine,
  flanker: decideFlanker,
  spearhead: decideSpearhead,
  artillery: decideArtillery,
  minelayer: decideMinelayer,
  raider: decideRaider,
  hunter: decideHunter,
  ambusher: decideAmbusher,
  ewar: decideEwar,
  support: decideSupport,
  standoff: decideStandoff,
  sniper: decideSniper,
};

/**
 * Advance a brain one frame.
 * @param {object} brain
 * @param {object} ctx
 * @param {Array} ctx.grid
 * @param {number} ctx.dt
 * @param {boolean} ctx.replanDue  movement re-plan tick (BRAIN_REPLAN_SEC)
 * @param {{row,col,fx,fz,canCrossWater}} ctx.self  cell + fractional cell position (col+0.5 = centre)
 * @param {{row,col}} ctx.target  player cell if visible, else last known / reported cell
 * @param {boolean} ctx.visible
 * @param {number} ctx.distCells
 * @param {number} ctx.hp / ctx.maxHp
 * @param {{x,z}|null} ctx.flankDir  unit (col, row) vector from target toward its rear
 * @param {{x,z}|null} ctx.slotDir   squad bearing slot, unit (col, row) vector from target
 * @param {Array<{row,col}>} ctx.allyGoals
 * Role extras: playerTrail, mines, minesLeft, playerCanCrossWater, alliesEngaged,
 * specialReady, repairTarget {id,row,col}, bossPhase2.
 * @returns {{tactic: string, waypoint: {row,col}|null, direct: boolean, wantMine: boolean, wantJam: boolean}}
 */
export function stepBrain(brain, ctx) {
  const cfg = brain.cfg ?? ROLE_CONFIGS[brain.role];
  brain.tacticTimer -= ctx.dt;
  brain.retreatCooldown -= ctx.dt;
  brain.evadeCooldown -= ctx.dt;
  const hpRatio = ctx.hp / Math.max(1, ctx.maxHp);
  const tookHit = brain.lastHp !== null && ctx.hp < brain.lastHp;
  brain.lastHp = ctx.hp;
  const full = { ...ctx, hpRatio, tookHit };

  const before = brain.tactic;
  const reachedGoal = brain.goal && brain.pathIdx >= brain.path.length;
  const finishedInvestigate = reachedGoal && brain.tactic === 'investigate';
  // Re-decide on the movement tick, on a hit, or when an untimed move finished
  if (ctx.replanDue || tookHit || brain.tactic === 'idle' || finishedInvestigate) {
    if (finishedInvestigate) brain.goal = null;
    DECIDERS[brain.role](brain, full, cfg);
    // Same tactic kept: refresh the path, re-pick the cell if it no longer fits
    if (brain.tactic === before && ctx.replanDue && !brain.direct) {
      const target = queryTarget(full, brain.query);
      if (brain.query && (brain.approach || !brain.goal)) {
        planQuery(brain, full, brain.query);
      } else if (brain.query && !cellStillValid(ctx.grid, brain.goal, { ...brain.query, target })) {
        planQuery(brain, full, brain.query);
      } else if (brain.goal) {
        setPath(brain, full, brain.goal);
      }
    }
  }

  // Path following: advance past waypoints whose centre we have reached
  const wpTol = ctx.isBoss ? 0.55 : 0.3;
  while (brain.pathIdx < brain.path.length) {
    const wp = brain.path[brain.pathIdx];
    const d = Math.hypot(ctx.self.fx - (wp.col + 0.5), ctx.self.fz - (wp.row + 0.5));
    if (d > wpTol) break;
    brain.pathIdx++;
  }
  const atGoal = Boolean(brain.goal) && brain.pathIdx >= brain.path.length;
  brain.wantMine =
    brain.role === 'minelayer' &&
    ((brain.tactic === 'mine' && atGoal) ||
      (brain.tactic === 'evade' && ctx.distCells < cfg.mineWhileEvadingCells));
  brain.wantJam = brain.role === 'ewar' && brain.tactic === 'jam' && ctx.distCells <= cfg.jamCells;

  const waypoint = !brain.direct && brain.pathIdx < brain.path.length ? brain.path[brain.pathIdx] : null;
  return {
    tactic: brain.tactic,
    waypoint,
    direct: brain.direct,
    wantMine: brain.wantMine,
    wantJam: brain.wantJam,
    isBreachPath: Boolean(brain.isBreachPath),
  };
}
