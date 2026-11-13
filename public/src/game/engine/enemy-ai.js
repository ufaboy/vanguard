import * as THREE from 'three';
import {
  BOSS_APS,
  DURABILITY,
  ENEMY_VISIBILITY,
  HYDRA,
  TITAN,
} from '../constants.js';
import { EnemyClass, TileType } from '../types.js';
import { SECTOR_BOSS_CONFIGS } from '../tanks.js';
import { BASE_CELL, GRID_SIZE, SECTORS, TILE_SIZE } from '../levels.js';
import { deckClearance } from '../models.js';
import { inContactRange, updateAbilities } from '../abilities/index.js';
import { normalizeAngleSigned } from '../../sim/ai.js';
import {
  ACTION_KIND,
  ACTION_TUNING,
  BRAIN_REPLAN_SEC,
  ROLE_CONFIGS,
  assignBearingSlots,
  createSquadDirector,
  findPath,
  findTacticalCells,
  isBossHardSolid,
  randomCellAround,
  randomCellInOtherZone,
  randomCellInZone,
  resetBrain,
  rollLuck,
  selectAction,
  stepBrain,
  updateAttackTokens,
  zoneOf,
} from '../../sim/behavior/index.js';

const HUNTER_ZIGZAG_RAD = 0.45;

export class EnemyAiController {
  constructor(engine) {
    this.engine = engine;
  }

  canEngageCommandBase(x0, z0) {
    const engine = this.engine;
    const baseWorld = engine.sectorLoader.getCommandBaseCenter();
    const dx = baseWorld.x - x0;
    const dz = baseWorld.z - z0;
    const dist = Math.hypot(dx, dz);
    if (dist > 7.5 * TILE_SIZE) return false;
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const steps = Math.max(2, Math.ceil(dist / (TILE_SIZE * 0.45)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const col = Math.floor((x0 + dx * t + half) / TILE_SIZE);
      const row = Math.floor((z0 + dz * t + half) / TILE_SIZE);
      if (engine.grid[row]?.[col]?.type === TileType.CONCRETE) return false;
    }
    return true;
  }

  hasLineOfSight(x0, z0, x1, z1) {
    const engine = this.engine;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0.5) return true;

    if (engine.isSegmentInSmoke(x0, z0, x1, z1)) return false;

    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const steps = Math.max(2, Math.ceil(dist / (TILE_SIZE * 0.45)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const sx = x0 + dx * t;
      const sz = z0 + dz * t;
      const col = Math.floor((sx + half) / TILE_SIZE);
      const row = Math.floor((sz + half) / TILE_SIZE);
      const cell = engine.grid[row]?.[col];
      if (
        cell &&
        (cell.type === TileType.BOXES || cell.type === TileType.BRICK || cell.type === TileType.CONCRETE)
      ) {
        return false;
      }
    }
    return true;
  }

  /** When an enemy tank spots the Player, it broadcasts the Player's current coordinates. */
  broadcastPlayerLocationFrom(spotter, targetX, targetZ) {
    const engine = this.engine;
    const alertRadius =
      spotter.radioAlertRadius ?? ENEMY_VISIBILITY.RADIO_ALERT_RADIUS;
    spotter.radioCooldown = ENEMY_VISIBILITY.RADIO_BROADCAST_COOLDOWN_SEC;

    for (const ally of engine.enemies) {
      if (ally === spotter) continue;
      const distToAlly = Math.hypot(ally.x - spotter.x, ally.z - spotter.z);
      if (distToAlly > alertRadius) continue;

      if (!ally.hasDetectedPlayer && ally.alertTimer <= 0) {
        if (Math.random() < ENEMY_VISIBILITY.RADIO_RESPONSE_CHANCE) {
          const scatterAngle = Math.random() * Math.PI * 2;
          const scatterDist = Math.random() * 2.5;
          ally.alertTarget = {
            x: targetX + Math.cos(scatterAngle) * scatterDist,
            z: targetZ + Math.sin(scatterAngle) * scatterDist,
          };
          ally.alertTimer = ENEMY_VISIBILITY.ALERT_PURSUIT_DURATION_SEC;
          ally.aiTimer = 0;
          if (ally.ai) {
            ally.ai.state = 'alert_move';
            ally.ai.lastKnownTargetPos = { x: targetX, z: targetZ };
          }
          engine.spawnSparks(ally.x, 1.35, ally.z, 0xf59e0b, 3);
        }
      }
    }
  }

  /** Seconds until the next role-brain re-plan. */
  enemyReplanDelay(e) {
    const random = e.behaviorRng ?? Math.random;
    const [lo, hi] = BRAIN_REPLAN_SEC;
    return lo + random() * (hi - lo);
  }

  /** What the enemy knows about its role target (the player, or a damaged ally for support). */
  enemyRoleTarget(e, { canSeePlayer, hasActiveAlert, spotted }) {
    const engine = this.engine;
    const role = e.brain?.role;
    const usesSpotters = role === 'artillery' || role === 'ewar';
    const repairTarget = role === 'support' ? engine.enemyAi.findRepairTarget(e) : null;
    const knows =
      canSeePlayer ||
      hasActiveAlert ||
      (usesSpotters && spotted) ||
      Boolean(repairTarget) ||
      Boolean(e.isBoss && !engine.inSmoke);
    return { knows, usesSpotters, repairTarget };
  }

  /** Condition of a movement action (sim/behavior/actions.js) for this enemy right now. */
  isMoveActionAvailable(e, action, situation) {
    const engine = this.engine;
    switch (action.id) {
      case 'move_to_player':
        return Boolean(e.brain) && situation.roleTarget.knows;
      case 'move_to_player_base':
        return Boolean(engine.activeMapRules?.defeatOnBaseLoss && engine.baseAlive);
      case 'defend_enemy_base': {
        const cell = engine.enemyBaseCell();
        if (!cell) return false;
        const pos = engine.gridToWorld(cell.row, cell.col);
        const trigger = (action.triggerCells ?? ACTION_TUNING.DEFEND_TRIGGER_CELLS) * TILE_SIZE;
        return Math.hypot(engine.playerX - pos.x, engine.playerZ - pos.z) <= trigger;
      }
      case 'move_to_zone':
        return Boolean(action.zone);
      case 'follow_route':
        return (e.campaignPatrolRoute?.length ?? 0) > (e.campaignPatrolIndex || 0);
      case 'patrol_zone':
        return true;
      case 'take_cover': {
        if (engine.enemyAi.movePlanActive(e, action.id)) return true;
        if (!engine.enemyAi.enemyThreatPos(situation)) return false;
        const afterHit = action.afterHitSec ?? ACTION_TUNING.COVER_AFTER_HIT_SEC;
        const lowHp = action.hpBelow !== undefined && e.hp / e.maxHp < action.hpBelow;
        return e.sinceHit <= afterHit || lowHp;
      }
      case 'ambush': {
        // Sprung: the player came close enough, the next action (usually move_to_player) takes over
        const trigger = (action.triggerCells ?? ACTION_TUNING.AMBUSH_TRIGGER_CELLS) * TILE_SIZE;
        if (situation.canSeePlayer && situation.distToPlayer <= trigger) return false;
        return engine.enemyAi.movePlanActive(e, action.id) || Boolean(engine.enemyAi.ambushAnchor(situation));
      }
      default:
        return false;
    }
  }

  /** The tank is still carrying out a movement order of this action. */
  movePlanActive(e, id) {
    const plan = e.movePlan;
    return Boolean(plan && plan.id === id && !plan.done && plan.timer > 0);
  }

  /** Where the enemy believes the player is (seen or remembered), or null. */
  enemyThreatPos(situation) {
    const engine = this.engine;
    if (situation.canSeePlayer) return { x: engine.playerX, z: engine.playerZ };
    if (situation.hasActiveAlert) return { x: situation.navTargetX, z: situation.navTargetZ };
    return null;
  }

  /** Ambush anchor: the known player position, the spotted player, else the player HQ. */
  ambushAnchor(situation) {
    const engine = this.engine;
    const threat = engine.enemyAi.enemyThreatPos(situation);
    if (threat) return threat;
    if (situation.spotted && !engine.inSmoke) return { x: engine.playerX, z: engine.playerZ };
    if (engine.activeMapRules?.defeatOnBaseLoss && engine.baseAlive) return engine.sectorLoader.getCommandBaseCenter();
    return null;
  }

  /** Best tactical cell (positions.js) around `target` for this tank, or null. */
  pickTacticalGoal(e, here, target, query) {
    const engine = this.engine;
    const avoid = [];
    for (const ally of engine.enemies) {
      if (ally !== e && ally.movePlan?.goal) avoid.push(ally.movePlan.goal);
    }
    const cells = findTacticalCells(engine.grid, {
      ...query,
      self: here,
      target,
      avoid,
      canCrossWater: Boolean(e.stats.canCrossWater),
      noise: 0.6,
      random: e.behaviorRng ?? Math.random,
    });
    return cells[0] ? { row: cells[0].row, col: cells[0].col } : null;
  }

  /** Grid cell of the living enemy base, or null. */
  enemyBaseCell() {
    const engine = this.engine;
    if (!engine.enemyBaseAlive) return null;
    if (engine._enemyBaseCell) {
      const cell = engine.grid[engine._enemyBaseCell.row]?.[engine._enemyBaseCell.col];
      if (cell && cell.type === TileType.ENEMY_BASE && cell.hp > 0) return engine._enemyBaseCell;
    }
    if (engine.grid && engine.grid.length > 0) {
      for (let r = 0; r < engine.grid.length; r++) {
        const rowCells = engine.grid[r];
        if (!rowCells) continue;
        for (let c = 0; c < rowCells.length; c++) {
          if (rowCells[c]?.type === TileType.ENEMY_BASE && rowCells[c].hp > 0) {
            engine._enemyBaseCell = { row: r, col: c };
            return engine._enemyBaseCell;
          }
        }
      }
    }
    return engine.activeMapRules?.enemyBaseCell || null;
  }

  /** World centre of the Fortified Enemy Base, or null if dead/absent. */
  getEnemyBaseCenter() {
    const engine = this.engine;
    const cell = engine.enemyBaseCell();
    if (!cell) return null;
    return engine.gridToWorld(cell.row, cell.col);
  }

  /**
   * Where a movement action wants the tank to go, before the dice roll.
   * `goal` is a cell for path-following orders; `zone` is the zone a failed roll must avoid.
   */
  intendedMoveGoal(e, action, here, situation) {
    const engine = this.engine;
    const random = e.behaviorRng ?? Math.random;
    const canCross = Boolean(e.stats.canCrossWater);
    switch (action.id) {
      case 'move_to_player': {
        const threat = engine.enemyAi.enemyThreatPos(situation);
        const pos = threat || (!engine.inSmoke ? { x: engine.playerX, z: engine.playerZ } : { x: e.x, z: e.z });
        const target = engine.worldToGrid(pos.x, pos.z);
        return { goal: null, zone: zoneOf(target.row, target.col) };
      }
      case 'move_to_player_base': {
        const baseCell = SECTORS[engine.currentSectorIndex]?.baseCell || BASE_CELL;
        const center = { row: baseCell.row, col: baseCell.col + 0.5 };
        const goal = randomCellAround(engine.grid, center, ACTION_TUNING.BASE_ATTACK_CELLS, random, canCross, (r, c) => {
          const p = engine.gridToWorld(r, c);
          return engine.enemyAi.canEngageCommandBase(p.x, p.z);
        });
        return { goal, zone: zoneOf(baseCell.row, baseCell.col), holdSec: Infinity };
      }
      case 'defend_enemy_base': {
        const cell = engine.enemyBaseCell();
        const goal = cell ? randomCellAround(engine.grid, cell, ACTION_TUNING.DEFEND_CELLS, random, canCross) : null;
        return { goal, zone: cell ? zoneOf(cell.row, cell.col) : null };
      }
      case 'move_to_zone':
        return { goal: randomCellInZone(engine.grid, action.zone, random, canCross), zone: action.zone };
      case 'follow_route': {
        const goal = e.campaignPatrolRoute[e.campaignPatrolIndex || 0];
        return { goal, zone: zoneOf(goal.row, goal.col) };
      }
      case 'patrol_zone': {
        const home = action.zone ?? e.contractHomeZone ?? zoneOf(here.row, here.col);
        const zone = {
          row: Math.max(0, home.row + Math.floor(random() * 3) - 1),
          col: Math.max(0, home.col + Math.floor(random() * 3) - 1),
        };
        const goal =
          randomCellInZone(engine.grid, zone, random, canCross) ??
          randomCellInZone(engine.grid, home, random, canCross);
        return { goal, zone: home };
      }
      case 'take_cover': {
        const pos = engine.enemyAi.enemyThreatPos(situation) ?? { x: engine.playerX, z: engine.playerZ };
        const threat = engine.worldToGrid(pos.x, pos.z);
        const [minCells, maxCells] = ACTION_TUNING.COVER_CELLS;
        const goal = engine.enemyAi.pickTacticalGoal(e, here, threat, {
          minCells,
          maxCells,
          los: false,
          coverWeight: 1.0,
          travelWeight: 0.45,
          maxTravel: ACTION_TUNING.COVER_MAX_TRAVEL,
        });
        const [lo, hi] = ACTION_TUNING.COVER_HOLD_SEC;
        return { goal, zone: zoneOf(here.row, here.col), holdSec: lo + random() * (hi - lo) };
      }
      case 'ambush': {
        const pos = engine.enemyAi.ambushAnchor(situation);
        if (!pos) return { goal: null, zone: null };
        const anchor = engine.worldToGrid(pos.x, pos.z);
        const [minCells, maxCells] = ACTION_TUNING.AMBUSH_CELLS;
        const goal = engine.enemyAi.pickTacticalGoal(e, here, anchor, {
          minCells,
          maxCells,
          los: false,
          forestBonus: 1.5,
          coverWeight: 0.8,
          chokeWeight: 1.0,
          preferCells: engine.playerTrail,
          preferWeight: 1.0,
          travelWeight: 0.2,
          maxTravel: ACTION_TUNING.AMBUSH_MAX_TRAVEL,
        });
        return { goal, zone: zoneOf(anchor.row, anchor.col), holdSec: Infinity };
      }
      default:
        return { goal: null, zone: null };
    }
  }

  /** Assigns a movement order: one dice roll against the action's luck. */
  assignMovePlan(e, action, situation) {
    const engine = this.engine;
    const random = e.behaviorRng ?? Math.random;
    const here = engine.worldToGrid(e.x, e.z);
    const intended = engine.enemyAi.intendedMoveGoal(e, action, here, situation);
    const success = rollLuck(action.luck, random);
    const goal = success
      ? intended.goal
      : randomCellInOtherZone(
          engine.grid,
          [intended.zone, zoneOf(here.row, here.col)],
          random,
          Boolean(e.stats.canCrossWater)
        );
    const [lo, hi] = success ? ACTION_TUNING.MOVE_PLAN_SEC : ACTION_TUNING.FAILED_MOVE_SEC;
    e.aiTimer = 0;
    return {
      id: action.id,
      success,
      goal,
      path: [],
      pathIdx: 0,
      timer: lo + random() * (hi - lo),
      // Seconds to stay once the goal is reached (Infinity: until the order expires)
      holdSec: success ? intended.holdSec : undefined,
      done: false,
    };
  }

  /**
   * Movement: take the first available movement action of the behavior; keep the order until
   * it ends, expires, or a higher-priority action becomes available, then roll again.
   */
  updateEnemyMovement(e, dt, elapsed, situation) {
    const engine = this.engine;
    const action = selectAction(e.actions, ACTION_KIND.MOVE, (a) => engine.enemyAi.isMoveActionAvailable(e, a, situation));
    let plan = e.movePlan;
    if (!action) {
      e.movePlan = null;
      if (e.brain && e.brain.tactic !== 'idle') resetBrain(e.brain);
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return;
    }
    if (!plan || plan.id !== action.id || plan.done || plan.timer <= 0) {
      plan = e.movePlan = engine.enemyAi.assignMovePlan(e, action, situation);
    }
    plan.timer -= dt;

    if (plan.success && plan.id === 'move_to_player') {
      engine.enemyAi.stepEnemyBrain(e, dt, elapsed, situation);
      return;
    }
    if (e.brain && e.brain.tactic !== 'idle') resetBrain(e.brain);
    e.brainHolding = false;
    e.brainCharging = false;
    if (e.ai) e.ai.state = plan.success ? plan.id : 'wander';
    engine.enemyAi.followMovePlan(e, plan, dt);
  }

  /** Drives a path-following movement order toward its goal cell. */
  followMovePlan(e, plan, dt) {
    const engine = this.engine;
    if (!plan.goal) {
      // Nothing to drive to: hold here and re-roll soon
      plan.timer = Math.min(plan.timer, 1);
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return;
    }
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const fx = (e.x + half) / TILE_SIZE;
    const fz = (e.z + half) / TILE_SIZE;
    const arrived =
      Math.hypot(fx - (plan.goal.col + 0.5), fz - (plan.goal.row + 0.5)) <= ACTION_TUNING.ARRIVE_CELLS;
    if (arrived) {
      if (plan.id === 'follow_route' && plan.success) {
        e.campaignPatrolIndex = (e.campaignPatrolIndex || 0) + 1;
      }
      // Firing positions, cover and ambush cells are held; other goals end the order
      if (plan.holdSec === undefined) plan.done = true;
      else if ((plan.holdSec -= dt) <= 0) plan.done = true;
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return;
    }
    if (e.aiTimer <= 0 || plan.pathIdx >= plan.path.length) {
      e.aiTimer = 1.0;
      const from = { row: Math.floor(fz), col: Math.floor(fx) };
      const occupiedCells = new Set();
      for (const ally of engine.enemies) {
        if (ally === e || ally.hp <= 0) continue;
        const ag = engine.worldToGrid(ally.x, ally.z);
        occupiedCells.add(ag.row * GRID_SIZE + ag.col);
      }
      const opts = {
        canCrossWater: Boolean(e.stats.canCrossWater),
        occupiedCells,
        wideClearance: Boolean(e.isBoss),
        bossCrushable: Boolean(e.isBoss),
      };
      const path =
        findPath(engine.grid, from, plan.goal, opts) ||
        (e.armed !== false ? findPath(engine.grid, from, plan.goal, { ...opts, allowBreach: true }) : null);
      if (!path) {
        plan.done = true;
        return;
      }
      plan.path = path;
      plan.pathIdx = 0;
    }
    const wpTol = e.isBoss ? 0.55 : 0.3;
    while (plan.pathIdx < plan.path.length) {
      const wp = plan.path[plan.pathIdx];
      if (Math.hypot(fx - (wp.col + 0.5), fz - (wp.row + 0.5)) > wpTol) break;
      plan.pathIdx++;
    }
    engine.enemyAi.steerEnemyToWaypoint(e, plan.path[plan.pathIdx] ?? plan.goal);
  }

  /** Steer toward a waypoint cell; a destructible wall on it becomes the breach target. */
  steerEnemyToWaypoint(e, waypoint) {
    const engine = this.engine;
    const p = engine.gridToWorld(waypoint.row, waypoint.col);
    const cell = engine.grid[waypoint.row]?.[waypoint.col];
    const shouldBreach = e.isBoss
      ? cell?.type === TileType.CONCRETE
      : cell?.type === TileType.BOXES || cell?.type === TileType.BRICK || cell?.type === TileType.CONCRETE;
    if (cell && shouldBreach && cell.hp > 0) {
      e.breachTarget = { row: waypoint.row, col: waypoint.col, x: p.x, z: p.z };
      e.targetDirX = 0;
      e.targetDirZ = 0;
      return true;
    }
    if (e.isBoss) {
      const canCross = Boolean(e.stats?.canCrossWater);
      const hardL = isBossHardSolid(engine.grid, waypoint.row, waypoint.col - 1, canCross);
      const hardR = isBossHardSolid(engine.grid, waypoint.row, waypoint.col + 1, canCross);
      if (hardL && !hardR) p.x += TILE_SIZE * 0.35;
      else if (hardR && !hardL) p.x -= TILE_SIZE * 0.35;
      const hardU = isBossHardSolid(engine.grid, waypoint.row - 1, waypoint.col, canCross);
      const hardD = isBossHardSolid(engine.grid, waypoint.row + 1, waypoint.col, canCross);
      if (hardU && !hardD) p.z += TILE_SIZE * 0.35;
      else if (hardD && !hardU) p.z -= TILE_SIZE * 0.35;
    }
    const ang = Math.atan2(p.x - e.x, p.z - e.z);
    e.targetDirX = Math.sin(ang);
    e.targetDirZ = Math.cos(ang);
    return false;
  }

  /** Role brain (sim/behavior/brain.js) drives the tank during a successful move_to_player order. */
  stepEnemyBrain(e, dt, elapsed, { canSeePlayer, navTargetX, navTargetZ, spotted, roleTarget }) {
    const engine = this.engine;
    const brain = e.brain;
    const { usesSpotters, repairTarget } = roleTarget;

    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const fx = (e.x + half) / TILE_SIZE;
    const fz = (e.z + half) / TILE_SIZE;
    const live = canSeePlayer || (usesSpotters && spotted && !engine.inSmoke);
    const hasTargetPos = live || navTargetX !== null;
    const tx = live ? engine.playerX : navTargetX ?? e.x;
    const tz = live ? engine.playerZ : navTargetZ ?? e.z;
    const target = engine.worldToGrid(tx, tz);
    const replanDue = e.aiTimer <= 0;
    if (replanDue) e.aiTimer = engine.enemyAi.enemyReplanDelay(e);

    const occupiedCells = new Set();
    const allyGoals = [];
    for (const ally of engine.enemies) {
      if (ally !== e) {
        if (ally.brain?.goal) allyGoals.push(ally.brain.goal);
        const ag = engine.worldToGrid(ally.x, ally.z);
        allyGoals.push(ag);
        occupiedCells.add(ag.row * GRID_SIZE + ag.col);
      }
    }
    const flankDir = {
      x: -Math.sin(engine.playerHullAngle),
      z: -Math.cos(engine.playerHullAngle),
    };

    const out = stepBrain(brain, {
      grid: engine.grid,
      dt,
      replanDue,
      self: {
        row: Math.floor(fz),
        col: Math.floor(fx),
        fx,
        fz,
        canCrossWater: Boolean(e.stats.canCrossWater),
      },
      isBoss: Boolean(e.isBoss),
      target,
      visible: canSeePlayer,
      distCells: hasTargetPos ? Math.hypot(tx - e.x, tz - e.z) / TILE_SIZE : Infinity,
      hp: e.hp,
      maxHp: e.maxHp,
      flankDir,
      slotDir: engine.squadFrame?.slots.get(e.id) ?? null,
      allyGoals,
      occupiedCells,
      playerTrail: engine.playerTrail,
      mines: engine.squadFrame?.mineCells ?? [],
      minesLeft: e.minesRemaining ?? 0,
      playerCanCrossWater: Boolean(engine.playerStats?.canCrossWater),
      alliesEngaged: spotted,
      specialReady: e.specialCooldown <= 0,
      repairTarget,
      bossPhase2: Boolean(e.mammothEnraged || e.hydraEnraged || e.infernoEnraged || e.titanOverload),
    });

    if (e.ai) e.ai.state = out.tactic;
    e.brainCharging = out.direct && brain.role === 'hunter';
    if (out.direct) {
      let ang = Math.atan2(engine.playerX - e.x, engine.playerZ - e.z);
      if (brain.role === 'hunter') {
        ang += Math.sin(elapsed * Math.PI * 2.5 + e.id) * HUNTER_ZIGZAG_RAD;
        if (Math.floor(elapsed * 6) !== e.chargeBlinkTick) {
          e.chargeBlinkTick = Math.floor(elapsed * 6);
          if (e.chargeBlinkTick % 2 === 0) engine.spawnSparks(e.x, 1.2, e.z, 0xef4444, 4);
        }
      }
      e.targetDirX = Math.sin(ang);
      e.targetDirZ = Math.cos(ang);
      e.brainHolding = false;
    } else if (out.waypoint) {
      e.brainHolding = engine.enemyAi.steerEnemyToWaypoint(e, out.waypoint);
    } else {
      e.targetDirX = 0;
      e.targetDirZ = 0;
      e.brainHolding = true;
    }
    return true;
  }

  /** Boss role brains take their distance bands from the boss tuning in constants.js. */
  bossBrainOverrides(enemyClass) {
    if (enemyClass === EnemyClass.BOSS_HYDRA) {
      const sightCells = (SECTOR_BOSS_CONFIGS[enemyClass]?.base.sightRadius ?? 28) / TILE_SIZE;
      return {
        standoff: {
          ...ROLE_CONFIGS.cruiser.standoff,
          minCells: HYDRA.PREFERRED_MIN_CELLS,
          maxCells: Math.min(HYDRA.PREFERRED_MAX_CELLS, sightCells - 1),
        },
        pressCells: [HYDRA.SALVO_MIN_CELLS, HYDRA.PREFERRED_MIN_CELLS],
      };
    }
    if (enemyClass === EnemyClass.BOSS_TITAN) {
      return {
        hold: {
          ...ROLE_CONFIGS.fortress.hold,
          minCells: Math.max(1, TITAN.HOLD_DISTANCE_CELLS - 1),
          maxCells: TITAN.HOLD_DISTANCE_CELLS,
        },
      };
    }
    return null;
  }

  /** ENGINEER: the most damaged ally within reach, as a grid cell with its id. */
  findRepairTarget(e) {
    const engine = this.engine;
    let best = null;
    let bestRatio = 0.8;
    for (const ally of engine.enemies) {
      if (ally === e || ally.hp <= 0) continue;
      const ratio = ally.hp / Math.max(1, ally.maxHp);
      if (ratio >= bestRatio) continue;
      if (Math.hypot(ally.x - e.x, ally.z - e.z) > 14 * TILE_SIZE) continue;
      bestRatio = ratio;
      best = ally;
    }
    if (!best) return null;
    return { id: best.id, ...engine.worldToGrid(best.x, best.z) };
  }

  /** Squad Director tick (sim/behavior/squad.js): player trail, bearing slots and tokens. */
  updateSquadDirector(dt, spottedLastFrame) {
    const engine = this.engine;
    const sector = SECTORS[engine.currentSectorIndex];
    if (!engine.squadDirector) {
      engine.squadDirector = createSquadDirector({ maxAttackers: sector?.maxAttackers });
    }
    if (!engine.playerTrail) engine.playerTrail = [];
    const cell = engine.worldToGrid(engine.playerX, engine.playerZ);
    const last = engine.playerTrail.at(-1);
    if (!last || last.row !== cell.row || last.col !== cell.col) {
      engine.playerTrail.push(cell);
      if (engine.playerTrail.length > 30) engine.playerTrail.shift();
    }

    const slotUnits = [];
    const candidates = [];
    for (const e of engine.enemies) {
      const role = e.brain?.role;
      if (e.brain && e.brain.tactic !== 'idle' && !['artillery', 'ewar', 'support', 'sniper'].includes(role)) {
        slotUnits.push(e);
      }
      if (e.isBoss || e.armed === false) continue;
      const artilleryFed = role === 'artillery' && spottedLastFrame;
      if (e.hasDetectedPlayer || artilleryFed) {
        candidates.push({ id: e.id, priority: -Math.hypot(e.x - engine.playerX, e.z - engine.playerZ) });
      }
    }
    engine.attackTokens = updateAttackTokens(engine.squadDirector, candidates, dt);
    engine.squadFrame = {
      slots: assignBearingSlots(slotUnits, { x: engine.playerX, z: engine.playerZ }),
      mineCells: engine.mines.map((m) => engine.worldToGrid(m.x, m.z)),
    };
  }

  /** SAPPER on patrol: only mine cells the player has actually driven through. */
  isOnPlayerTrail(e) {
    const engine = this.engine;
    const cell = engine.worldToGrid(e.x, e.z);
    return (engine.playerTrail || []).some(
      (t) => Math.abs(t.row - cell.row) + Math.abs(t.col - cell.col) <= 1
    );
  }

  /** Attack token check: bosses always fire; everyone else waits for a free token. */
  hasAttackToken(e) {
    const engine = this.engine;
    return e.isBoss || !engine.attackTokens || engine.attackTokens.has(e.id);
  }

  /** Updates recoil, barrel elevation, muzzle flash fade, and turret pivot positions/rotations. */
  syncEnemyTurretVisuals(e, dt) {
    if (e.turrets?.length) {
      for (const t of e.turrets) {
        const slot = t.slot;
        t.recoil = THREE.MathUtils.damp(t.recoil || 0, 0, 12, dt);
        if (slot.barrelPivot) {
          slot.barrelPivot.position.z = (slot.baseBarrelZ ?? (e.isBoss ? 0.68 : 0.46)) - t.recoil;
          t.gunElevation = THREE.MathUtils.damp(
            t.gunElevation || 0,
            deckClearance(slot, t.angle - e.hullAngle),
            10,
            dt
          );
          slot.barrelPivot.rotation.x = -t.gunElevation;
        }
        if (t.flashTimer > 0) {
          t.flashTimer -= dt;
          if (slot.muzzleFlash) slot.muzzleFlash.material.opacity = 0;
        }
        if (slot.turret) {
          const pz = slot.pivotZ || 0;
          slot.turret.position.set(
            Math.sin(e.hullAngle) * pz,
            slot.turretY ?? slot.turret.position.y,
            Math.cos(e.hullAngle) * pz
          );
          slot.turret.rotation.y = t.angle;
        }
      }
      e.turretAngle = e.turrets[0].angle;
      e.recoil = e.turrets[0].recoil;
      return;
    }

    e.recoil = THREE.MathUtils.damp(e.recoil, 0, 12, dt);
    e.rig.barrelPivot.position.z = (e.isBoss ? 0.68 : 0.46) - e.recoil;
    e.gunElevation = THREE.MathUtils.damp(
      e.gunElevation || 0,
      deckClearance(e.rig, e.turretAngle - e.hullAngle),
      10,
      dt
    );
    e.rig.barrelPivot.rotation.x = -e.gunElevation;
    if (e.flashTimer > 0) {
      e.flashTimer -= dt;
      e.rig.muzzleFlash.material.opacity = 0;
    }
    e.rig.turret.rotation.y = e.turretAngle;
  }

  /** Finds a clear escape direction (preferring inward / sidesteps over backing into borders or allies). */
  pickEscapeDirection(e, radius) {
    const engine = this.engine;
    const rawX = e.targetDirX || Math.sin(e.hullAngle);
    const rawZ = e.targetDirZ || Math.cos(e.hullAngle);
    const len = Math.hypot(rawX, rawZ) || 1;
    const hx = rawX / len;
    const hz = rawZ / len;
    const sign = e.id % 2 === 0 ? 1 : -1;
    const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
    const candidates = [
      { x: -hz * sign, z: hx * sign },
      { x: hz * sign, z: -hx * sign },
    ];
    // When hugging a border or corner, prioritize moving inward toward the arena interior
    const nearEdgeX = Math.abs(e.x) > halfArena - 4.0;
    const nearEdgeZ = Math.abs(e.z) > halfArena - 4.0;
    if (nearEdgeX || nearEdgeZ) {
      const inX = nearEdgeX ? -Math.sign(e.x) : 0;
      const inZ = nearEdgeZ ? -Math.sign(e.z) : 0;
      const inLen = Math.hypot(inX, inZ) || 1;
      candidates.unshift({ x: inX / inLen, z: inZ / inLen });
    }
    candidates.push({ x: -hx, z: -hz });

    const probeDist = radius + 0.5;
    for (const dir of candidates) {
      const midX = e.x + dir.x * (probeDist * 0.5);
      const midZ = e.z + dir.z * (probeDist * 0.5);
      const farX = e.x + dir.x * probeDist;
      const farZ = e.z + dir.z * probeDist;
      if (
        !engine.checkTankWallCollision(midX, midZ, radius, e.stats.canCrossWater) &&
        !engine.checkTankEnemyCollision(e, midX, midZ, radius) &&
        !engine.checkTankWallCollision(farX, farZ, radius, e.stats.canCrossWater) &&
        !engine.checkTankEnemyCollision(e, farX, farZ, radius)
      ) {
        return dir;
      }
    }
    return null;
  }

  updateEnemies(dt, elapsed) {
    const engine = this.engine;
    const empStunned = engine.empTimer > 0;
    const spottedLastFrame = Boolean(engine.playerSpottedByEnemies);
    engine.playerSpottedByEnemies = false;
    engine.updateSquadDirector(dt, spottedLastFrame);

    for (let i = engine.enemies.length - 1; i >= 0; i--) {
      const e = engine.enemies[i];
      if (e.phaseShieldTimer > 0) {
        e.phaseShieldTimer = Math.max(0, e.phaseShieldTimer - dt);
        engine.bossCombat.syncPhaseShieldVisual(e, elapsed);
      } else if (e.phaseShieldMesh?.visible) {
        e.phaseShieldMesh.visible = false;
      }

      if (empStunned) {
        if (Math.random() < 0.12) {
          engine.spawnSparks(e.x, 0.9, e.z, 0x06b6d4, 2);
        }
        continue;
      }

      e.aiTimer -= dt;
      e.fireCooldown -= dt;
      e.specialCooldown -= dt;
      if (e.apsRearmTimer > 0) e.apsRearmTimer = Math.max(0, e.apsRearmTimer - dt);
      if (e.isBoss && e.apsCharges < e.apsMaxCharges) {
        e.apsRechargeTimer -= dt;
        if (e.apsRechargeTimer <= 0) {
          e.apsCharges += 1;
          e.apsRechargeTimer = BOSS_APS.RECHARGE_SEC;
        }
      }
      if (e.randomShotTimer > 0) e.randomShotTimer -= dt;
      if (e.turrets?.length) {
        for (const t of e.turrets) {
          t.fireCooldown -= dt;
          if (t.randomShotTimer > 0) t.randomShotTimer -= dt;
        }
      }
      if (e.enemyClass === EnemyClass.BOSS_HYDRA) {
        e.hydraMissileCooldown -= dt;
        if (e.hydraFlameCooldown > 0) e.hydraFlameCooldown = Math.max(0, e.hydraFlameCooldown - dt);
      } else if (e.enemyClass === EnemyClass.BOSS_MAMMOTH) {
        e.mammothMissileCooldown -= dt;
      } else if (e.enemyClass === EnemyClass.BOSS_INFERNO) {
        e.infernoMissileCooldown -= dt;
        if (e.infernoDashCooldown > 0 && !(e.infernoDashWindup > 0) && !(e.infernoDashTimer > 0)) {
          e.infernoDashCooldown -= dt;
        }
      }
      if (e.stealthRevealTimer > 0) e.stealthRevealTimer -= dt;
      if (e.radioCooldown > 0) e.radioCooldown -= dt;
      if (e.alertTimer > 0) {
        e.alertTimer -= dt;
        if (e.alertTimer <= 0) {
          e.alertTimer = 0;
          e.alertTarget = null;
          if (e.ai && !e.hasDetectedPlayer) {
            e.ai.state = 'patrol';
          }
        }
      }

      if (e.rig.radarDish) {
        e.rig.radarDish.rotation.y = elapsed * 3.5;
      }

      const toPlayerX = engine.playerX - e.x;
      const toPlayerZ = engine.playerZ - e.z;
      const distToPlayer = Math.hypot(toPlayerX, toPlayerZ);

      const baseSightRadius =
        e.sightRadius ?? ENEMY_VISIBILITY.DEFAULT_SIGHT_RADIUS;
      const effectiveSightRadius = engine.inForest
        ? Math.min(baseSightRadius, ENEMY_VISIBILITY.FOREST_SIGHT_RADIUS)
        : baseSightRadius;

      const canSeePlayer =
        !engine.inSmoke &&
        distToPlayer <= effectiveSightRadius &&
        engine.hasLineOfSight(e.x, e.z, engine.playerX, engine.playerZ);

      if (canSeePlayer) {
        const newlySpotted = !e.hasDetectedPlayer;
        e.hasDetectedPlayer = true;
        engine.playerSpottedByEnemies = true;
        e.alertTarget = { x: engine.playerX, z: engine.playerZ };
        e.alertTimer =
          ENEMY_VISIBILITY.MEMORY_DURATION_SEC;
        if (e.ai) {
          e.ai.state = 'engage';
          e.ai.lastKnownTargetPos = { x: engine.playerX, z: engine.playerZ };
        }
        if (newlySpotted || e.radioCooldown <= 0) {
          engine.broadcastPlayerLocationFrom(e, engine.playerX, engine.playerZ);
        }
      } else {
        e.hasDetectedPlayer = false;
        if (e.alertTarget && e.alertTimer > 0) {
          const distToAlert = Math.hypot(
            e.alertTarget.x - e.x,
            e.alertTarget.z - e.z
          );
          if (distToAlert <= ENEMY_VISIBILITY.ALERT_ARRIVAL_RADIUS) {
            e.alertTarget = null;
            e.alertTimer = 0;
            if (e.ai) e.ai.state = 'patrol';
          }
        }
      }

      const hasActiveAlert = Boolean(e.alertTarget && e.alertTimer > 0);
      const navTargetX = canSeePlayer
        ? engine.playerX
        : hasActiveAlert
        ? e.alertTarget.x
        : e.isBoss && !engine.inSmoke
        ? engine.playerX
        : null;
      const navTargetZ = canSeePlayer
        ? engine.playerZ
        : hasActiveAlert
        ? e.alertTarget.z
        : e.isBoss && !engine.inSmoke
        ? engine.playerZ
        : null;

      if (e.enemyClass === EnemyClass.STEALTH && e.rig.stealthMaterials) {
        const revealed = distToPlayer < 6.2 || e.stealthRevealTimer > 0;
        const moving = Math.hypot(e.targetDirX, e.targetDirZ) > 0.05;
        const targetOpacity = revealed ? 0.96 : moving ? 0.3 : 0.12;
        for (const mat of e.rig.stealthMaterials) {
          mat.opacity = THREE.MathUtils.damp(mat.opacity, targetOpacity, 8, dt);
        }
        if (e.rig.hpBarBg && e.rig.hpBarFill) {
          e.rig.hpBarBg.visible = revealed;
          e.rig.hpBarFill.visible = revealed;
        }
      }

      if (inContactRange(e, distToPlayer) && engine.enemyCombat.spendContactEnemy(e)) continue;

      // Seconds since the last hit (take_cover)
      e.sinceHit = e.prevHp !== undefined && e.hp < e.prevHp ? 0 : (e.sinceHit ?? Infinity) + dt;
      e.prevHp = e.hp;

      const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
      const arenaInset = e.isBoss ? 1.25 : 1.0;
      const isInsideArena = (x, z) =>
        Math.abs(x) <= halfArena - arenaInset && Math.abs(z) <= halfArena - arenaInset;

      // Cross the out-of-bounds entry strip while keeping turret & gunnery combat-ready
      if (e.entryTarget) {
        const toTgtX = e.entryTarget.x - e.x;
        const toTgtZ = e.entryTarget.z - e.z;
        const distToTgt = Math.hypot(toTgtX, toTgtZ);
        if (isInsideArena(e.x, e.z) || distToTgt <= 0.05) {
          e.entryTarget = null;
        } else {
          e.targetDirX = toTgtX / distToTgt;
          e.targetDirZ = toTgtZ / distToTgt;
          const desiredAngle = Math.atan2(e.targetDirX, e.targetDirZ);
          e.hullAngle = engine.lerpAngle(e.hullAngle, desiredAngle, 10 * dt);
          const worldSpeed = Math.max(2.4, e.stats.moveSpeed * TILE_SIZE);
          const entryRadius = e.isBoss ? 1.12 : 0.72;
          const nextEntryX = e.x + e.targetDirX * worldSpeed * dt;
          const nextEntryZ = e.z + e.targetDirZ * worldSpeed * dt;
          if (!engine.checkTankEnemyCollision(e, nextEntryX, e.z, entryRadius)) {
            e.x = nextEntryX;
          }
          if (!engine.checkTankEnemyCollision(e, e.x, nextEntryZ, entryRadius)) {
            e.z = nextEntryZ;
          }
          if (isInsideArena(e.x, e.z)) {
            e.entryTarget = null;
          }
        }
      }

      if (!e.entryTarget) {
        const entrySafeRadius = e.isBoss ? 1.12 : 0.72;
        const maxBound = halfArena - entrySafeRadius - 0.02;
        if (Math.abs(e.x) > maxBound) e.x = Math.sign(e.x) * maxBound;
        if (Math.abs(e.z) > maxBound) e.z = Math.sign(e.z) * maxBound;
        const roleTarget = engine.enemyRoleTarget(e, { canSeePlayer, hasActiveAlert, spotted: spottedLastFrame });
        engine.updateEnemyMovement(e, dt, elapsed, {
          canSeePlayer,
          hasActiveAlert,
          navTargetX,
          navTargetZ,
          spotted: spottedLastFrame,
          distToPlayer,
          roleTarget,
        });

        let dashSpeedMult = 1.0;
        if (e.enemyClass === EnemyClass.BOSS_INFERNO) {
          dashSpeedMult = engine.updateInfernoDash(e, dt, {
            canSeePlayer,
            toPlayerX,
            toPlayerZ,
            distToPlayer,
          });
        }

        const hpRatio = e.hp / e.maxHp;
        const lowSpeedMult =
          !e.isBoss && hpRatio < DURABILITY.LOW_RATIO ? DURABILITY.LOW_SPEED_MULT : 1.0;
        const { row: eRow, col: eCol } = engine.worldToGrid(e.x, e.z);
        const eCell = engine.grid[eRow]?.[eCol];
        const eOnSand = eCell?.type === TileType.SAND && !e.stats.canHover && !e.stats.allTerrain;
        const sandSpeedMult = eOnSand ? 0.78 : 1.0;
        const worldSpeed = e.stats.moveSpeed * TILE_SIZE * lowSpeedMult * sandSpeedMult * dashSpeedMult;

        if (e.yieldTimer > 0) {
          e.yieldTimer -= dt;
          if (e.yieldDirX !== undefined && e.yieldDirZ !== undefined) {
            e.targetDirX = e.yieldDirX;
            e.targetDirZ = e.yieldDirZ;
          }
        }

        const startX = e.x;
        const startZ = e.z;
        const radius = e.isBoss ? 1.12 : 0.72;
        const nextX = e.x + e.targetDirX * worldSpeed * dt;
        const nextZ = e.z + e.targetDirZ * worldSpeed * dt;
        const isTryingToMove = Math.hypot(e.targetDirX, e.targetDirZ) > 0.1;

        if (isTryingToMove) {
          engine.enemyCombat.crushBoxObstacles(nextX, e.z, radius, false);
          if (e.isBoss) engine.crushBossObstacles(nextX, e.z, radius);
        }
        let blocked = false;
        if (
          !engine.checkTankWallCollision(nextX, e.z, radius, e.stats.canCrossWater) &&
          !engine.checkTankEnemyCollision(e, nextX, e.z, radius) &&
          Math.hypot(nextX - engine.playerX, e.z - engine.playerZ) > radius + 0.72
        ) {
          e.x = nextX;
        } else {
          blocked = true;
        }

        if (isTryingToMove) {
          engine.enemyCombat.crushBoxObstacles(e.x, nextZ, radius, false);
          if (e.isBoss) engine.crushBossObstacles(e.x, nextZ, radius);
        }
        if (
          !engine.checkTankWallCollision(e.x, nextZ, radius, e.stats.canCrossWater) &&
          !engine.checkTankEnemyCollision(e, e.x, nextZ, radius) &&
          Math.hypot(e.x - engine.playerX, nextZ - engine.playerZ) > radius + 0.72
        ) {
          e.z = nextZ;
        } else {
          blocked = true;
        }

        const distMoved = Math.hypot(e.x - startX, e.z - startZ);

        if (isTryingToMove && distMoved < 0.2 * dt * worldSpeed) {
          if (e.yieldTimer > 0) {
            e.yieldTimer = 0;
            e.aiTimer = 0;
          }
          e.stuckTimer = (e.stuckTimer || 0) + dt;
          // An unarmed rammer that sees the player keeps its charge heading instead of re-planning.
          if (e.armed !== false || !canSeePlayer) {
            e.aiTimer = 0;
          }

          // 1. Check if blocked by a destructible wall directly ahead:
          if (e.stuckTimer > 0.35 && !e.breachTarget) {
            const checkDist = radius + 0.85;
            const aheadX = e.x + (e.targetDirX || Math.sin(e.hullAngle)) * checkDist;
            const aheadZ = e.z + (e.targetDirZ || Math.cos(e.hullAngle)) * checkDist;
            const aheadGrid = engine.worldToGrid(aheadX, aheadZ);
            const aheadCell = engine.grid[aheadGrid.row]?.[aheadGrid.col];
            if (
              aheadCell &&
              (aheadCell.type === TileType.BOXES || aheadCell.type === TileType.BRICK || aheadCell.type === TileType.CONCRETE) &&
              aheadCell.hp > 0
            ) {
              const cellCenter = engine.gridToWorld(aheadGrid.row, aheadGrid.col);
              e.breachTarget = {
                row: aheadGrid.row,
                col: aheadGrid.col,
                x: cellCenter.x,
                z: cellCenter.z,
              };
              e.targetDirX = 0;
              e.targetDirZ = 0;
              e.stuckTimer = 0;
            }
          }

          // 2. Check if jammed with an ally or corner/border:
          if (e.stuckTimer > 0.55 && (e.yieldTimer || 0) <= 0) {
            const aheadDist = radius + 1.2;
            const aheadX = e.x + (e.targetDirX || Math.sin(e.hullAngle)) * aheadDist;
            const aheadZ = e.z + (e.targetDirZ || Math.cos(e.hullAngle)) * aheadDist;
            let blockingAlly = null;
            let minAllyDist = Infinity;
            for (const ally of engine.enemies) {
              if (ally === e || ally.hp <= 0) continue;
              const d = Math.hypot(ally.x - aheadX, ally.z - aheadZ);
              if (d < 1.4 && d < minAllyDist) {
                minAllyDist = d;
                blockingAlly = ally;
              }
            }

            const canYield =
              !blockingAlly ||
              (!e.isBoss &&
                (blockingAlly.isBoss || (e.id > blockingAlly.id && (blockingAlly.yieldTimer || 0) <= 0)));
            const escape = canYield ? engine.pickEscapeDirection(e, radius) : null;
            if (escape) {
              e.yieldTimer = blockingAlly ? 0.9 + (e.id % 3) * 0.2 : 0.6;
              e.yieldDirX = escape.x;
              e.yieldDirZ = escape.z;
              e.targetDirX = escape.x;
              e.targetDirZ = escape.z;
            }
            if (e.movePlan?.path) {
              e.movePlan.pathIdx = e.movePlan.path.length;
            }
            e.aiTimer = 0;
            e.stuckTimer = 0;
          }
        } else {
          e.stuckTimer = Math.max(0, (e.stuckTimer || 0) - dt * 2);
        }

        if (e.enemyClass === EnemyClass.BOSS_TITAN && canSeePlayer) {
          const turnRate = e.titanOverload ? TITAN.HULL_TURN_RATE_OVERLOAD : TITAN.HULL_TURN_RATE;
          const bearingToPlayer = Math.atan2(toPlayerX, toPlayerZ);
          // Angle the hull ~20 deg inside the frontal Aegis cone so both front and rear turrets unmask past the central citadel
          const angleSign = normalizeAngleSigned(e.hullAngle - bearingToPlayer) >= 0 ? 1 : -1;
          const dreadnoughtHeading = bearingToPlayer + angleSign * 0.34;
          e.hullAngle = engine.lerpAngle(e.hullAngle, dreadnoughtHeading, turnRate * dt);
        } else if (Math.hypot(e.targetDirX, e.targetDirZ) > 0.05) {
          const desiredHull = Math.atan2(e.targetDirX, e.targetDirZ);
          e.hullAngle = engine.lerpAngle(e.hullAngle, desiredHull, 8 * dt);
        } else if (e.brainHolding && canSeePlayer) {
          e.hullAngle = engine.lerpAngle(e.hullAngle, Math.atan2(toPlayerX, toPlayerZ), 3 * dt);
        }
      }

      // Special slot & gunnery remain active even while crossing the border onto the arena.
      const brainActive = Boolean(!e.entryTarget && e.brain && e.brain.tactic !== 'idle');
      updateAbilities(e, engine, { brainActive, canSeePlayer });

      engine.updateEnemyGunnery(e, dt, {
        canSeePlayer,
        hasActiveAlert,
        navTargetX,
        navTargetZ,
        spotted: spottedLastFrame,
        distToPlayer,
        toPlayerX,
        toPlayerZ,
      });

      const enemyHoverY = e.stats.canHover
        ? 0.05 + Math.sin(elapsed * 4.0 + e.id) * 0.012
        : 0;
      e.rig.root.position.set(e.x, enemyHoverY, e.z);
      e.rig.hull.rotation.y = e.hullAngle;
      engine.driveGear(e.rig, e, e.x, e.z, e.hullAngle);
      engine.syncEnemyTurretVisuals(e, dt);

      if (e.rig.hpBarFill) {
        const ratio = Math.max(0.01, e.hp / e.maxHp);
        e.rig.hpBarFill.scale.x = ratio;
      }
    }

    engine.resolveEnemyCollisions();
    for (let i = 0; i < engine.enemies.length; i++) {
      const e = engine.enemies[i];
      e.rig.root.position.x = e.x;
      e.rig.root.position.z = e.z;
    }

    engine.updateAiDebugOverlay();
  }
}

