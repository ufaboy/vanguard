/** Moving railway trains controller: path following, transit respawn, horn warning, ramming, and destruction. */

import {
  TRAIN_DEFAULTS,
  TRAIN_UNIT_CONFIGS,
  TRAIN_UNIT_TYPES,
} from '../vehicles/trains.js';
import { TileType } from '../types.js';
import { setCellObject } from '../terrains/layers.js';
import { extractRailTracks, sampleTrackAt } from '../terrains/rail-paths.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';

function cellCenterWorld(r, c) {
  const half = (GRID_SIZE * TILE_SIZE) / 2;
  return {
    x: c * TILE_SIZE - half + TILE_SIZE / 2,
    z: r * TILE_SIZE - half + TILE_SIZE / 2,
  };
}

function worldToGridCell(x, z) {
  const half = (GRID_SIZE * TILE_SIZE) / 2;
  const col = Math.floor((x + half) / TILE_SIZE);
  const row = Math.floor((z + half) / TILE_SIZE);
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
  return { row, col };
}

/** Projects point (px, pz) onto a track polyline to find the nearest distance along it. */
function projectOntoTrack(track, px, pz) {
  const pts = track.points;
  let bestDist = 0;
  let bestErr = Infinity;
  let bestTangentX = 0;
  let bestTangentZ = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
    const qx = a.x + dx * t;
    const qz = a.z + dz * t;
    const err = Math.hypot(px - qx, pz - qz);
    if (err < bestErr) {
      bestErr = err;
      const segLen = Math.sqrt(len2);
      bestDist = a.cumDist + t * segLen;
      bestTangentX = dx / segLen;
      bestTangentZ = dz / segLen;
    }
  }
  return { dist: bestDist, err: bestErr, tx: bestTangentX, tz: bestTangentZ };
}

export class TrainController {
  constructor(engine) {
    this.engine = engine;
    this.trains = [];
    this.tracks = [];
    this.movingTrackCellSet = new Set();
    this._ramCooldowns = new Map();
  }

  clear() {
    for (const train of this.trains) {
      for (const unit of train.units) {
        if (unit.mesh && this.engine.mapGroup) {
          this.engine.mapGroup.remove(unit.mesh);
        }
      }
    }
    this.trains = [];
    this.tracks = [];
    this.movingTrackCellSet.clear();
    this._ramCooldowns.clear();
  }

  /**
   * Analyzes rail topology for the loaded sector and returns the Set of `"r,c"` cells
   * belonging to moving (`loop` or `transit`) tracks so `SectorLoaderController`
   * omits static rolling stock there and hands them over to `TrainController`.
   */
  prepareTracks(sector) {
    this.clear();
    this.tracks = extractRailTracks({
      surfaceGrid: sector.surfaceGrid,
      objectGrid: sector.objectGrid,
      railCurves: sector.railCurves || [],
      railBridges: sector.railBridges || [],
      gridSize: GRID_SIZE,
      tileSize: TILE_SIZE,
    });
    for (const track of this.tracks) {
      if (track.mode === 'loop' || track.mode === 'transit') {
        for (const k of track.cellSet) {
          this.movingTrackCellSet.add(k);
        }
      }
    }
    return this.movingTrackCellSet;
  }

  /** Spawns moving trains on all `loop` and `transit` tracks after `engine.grid` is built. */
  setup(sector) {
    const movingTracks = this.tracks.filter((t) => t.mode === 'loop' || t.mode === 'transit');
    if (movingTracks.length === 0) return;

    const overrides = Array.isArray(sector.trains) ? sector.trains : [];

    for (let idx = 0; idx < movingTracks.length; idx++) {
      const track = movingTracks[idx];
      const override = overrides[idx] || null;
      const placed = this._extractPlacedConsist(sector, track);

      const consistSpecs = override?.consist?.length
        ? override.consist.map((kind, i) => ({
            kind,
            colorIndex: i % 4,
          }))
        : placed?.specs?.length
        ? placed.specs
        : TRAIN_DEFAULTS.defaultConsist.map((kind, i) => ({
            kind,
            colorIndex: (idx + i) % 4,
          }));

      const speed = Number(override?.speed) > 0 ? Number(override.speed) : TRAIN_DEFAULTS.speed;
      const respawnSec =
        Number(override?.respawnSec) >= 0 ? Number(override.respawnSec) : TRAIN_DEFAULTS.transitRespawnSec;

      let direction = override?.direction === -1 ? -1 : 1;
      let startHeadDist =
        track.mode === 'transit'
          ? direction < 0
            ? track.totalLength + TRAIN_DEFAULTS.offscreenMargin
            : -TRAIN_DEFAULTS.offscreenMargin
          : 0;

      if (placed && placed.locoPos) {
        const proj = projectOntoTrack(track, placed.locoPos.x, placed.locoPos.z);
        startHeadDist = proj.dist;
        // Align travel direction with the locomotive's authored facing (-Z local = forward)
        const fwdX = -Math.sin(placed.locoYaw);
        const fwdZ = -Math.cos(placed.locoYaw);
        const dot = fwdX * proj.tx + fwdZ * proj.tz;
        if (dot < -0.25) direction = -1;
        else if (dot > 0.25) direction = 1;
      }

      const train = this._createTrain({
        id: `train_${idx}`,
        track,
        direction,
        speed,
        respawnSec,
        headDist: startHeadDist,
        consistSpecs,
      });
      this.trains.push(train);
      this._syncTrainVisuals(train, 0);
    }
  }

  _extractPlacedConsist(sector, track) {
    const objGrid = sector.objectGrid;
    if (!objGrid) return null;

    const fixedByAnchor = new Map();
    const tailSet = new Set();
    for (const f of sector.fixedObjects || []) {
      if (f.kind !== 'locomotive') continue;
      const tail = f.orientation === 'ew' ? { row: f.row, col: f.col + 1 } : { row: f.row + 1, col: f.col };
      fixedByAnchor.set(`${f.row},${f.col}`, f);
      tailSet.add(`${tail.row},${tail.col}`);
    }

    let locoPos = null;
    let locoYaw = 0;
    const cars = [];
    const seenCars = new Set();

    const keys = track.orderedKeys?.length ? track.orderedKeys : [...track.cellSet];
    for (let idx = 0; idx < keys.length; idx++) {
      const k = keys[idx];
      const [r, c] = k.split(',').map(Number);
      const obj = objGrid[r]?.[c];
      if (obj === TileType.LOCOMOTIVE && !tailSet.has(k) && !locoPos) {
        const fixed = fixedByAnchor.get(k);
        const orientation = fixed?.orientation || 'ns';
        const rotDeg = sector.objectRotations?.[r]?.[c] || 0;
        const center = cellCenterWorld(r, c);
        locoPos = {
          x: center.x + (orientation === 'ew' ? TILE_SIZE * 0.5 : 0),
          z: center.z + (orientation === 'ns' ? TILE_SIZE * 0.5 : 0),
        };
        locoYaw = (orientation === 'ew' ? Math.PI / 2 : 0) + (rotDeg === 180 || rotDeg === 270 ? Math.PI : 0);
      } else if (obj === TileType.RAIL_CAR && !seenCars.has(k)) {
        seenCars.add(k);
        const nextKey = keys[idx + 1];
        if (nextKey) {
          const [nr, nc] = nextKey.split(',').map(Number);
          if (objGrid[nr]?.[nc] === TileType.RAIL_CAR && !seenCars.has(nextKey)) {
            seenCars.add(nextKey);
          }
        }
        const variant = (r + c) % 2 === 0 ? 'closed' : 'open';
        const bakedColor = sector.tacticalStyles?.[r]?.[c];
        const colorIndex = bakedColor >= 0 ? bakedColor : (r * 5 + c * 11) % 4;
        cars.push({
          kind: variant === 'open' ? TRAIN_UNIT_TYPES.RAIL_CAR_OPEN : TRAIN_UNIT_TYPES.RAIL_CAR_CLOSED,
          colorIndex,
        });
      }
    }

    if (!locoPos && cars.length === 0) return null;
    const specs = [{ kind: TRAIN_UNIT_TYPES.LOCOMOTIVE, colorIndex: 0 }, ...cars];
    return { specs, locoPos, locoYaw };
  }

  _createTrain({ id, track, direction, speed, respawnSec, headDist, consistSpecs }) {
    const units = [];
    let offset = 0;
    for (let i = 0; i < consistSpecs.length; i++) {
      const spec = consistSpecs[i];
      const cfg = TRAIN_UNIT_CONFIGS[spec.kind] || TRAIN_UNIT_CONFIGS[TRAIN_UNIT_TYPES.RAIL_CAR_CLOSED];
      if (i > 0) {
        const prevCfg = units[i - 1].cfg;
        offset += prevCfg.length * 0.5 + cfg.length * 0.5 + TRAIN_DEFAULTS.unitGap;
      }
      const mesh = this._createUnitMesh(spec.kind, spec.colorIndex ?? i);
      if (mesh && this.engine.mapGroup) {
        this.engine.mapGroup.add(mesh);
      }
      units.push({
        id: `${id}_unit_${i}`,
        kind: spec.kind,
        cfg,
        isLocomotive: spec.kind === TRAIN_UNIT_TYPES.LOCOMOTIVE,
        colorIndex: spec.colorIndex ?? i,
        hp: cfg.maxHP,
        maxHp: cfg.maxHP,
        alive: true,
        offset,
        hitRadius: cfg.hitRadius,
        mesh,
        x: 0,
        z: 0,
        yOffset: 0,
        yaw: 0,
        visible: true,
      });
    }

    return {
      id,
      track,
      direction,
      speed,
      respawnSec,
      headDist,
      totalTrainLength: offset + (units[units.length - 1]?.cfg.length || 3.88) * 0.5,
      units,
      offscreen: false,
      respawnTimer: 0,
      destroyed: false,
      hornTimer: 0,
      headlightFlashTimer: 0,
    };
  }

  _createUnitMesh(kind, colorIndex) {
    const mf = this.engine.modelFactory;
    if (!mf) return null;
    let mesh = null;
    if (kind === TRAIN_UNIT_TYPES.LOCOMOTIVE && mf.createLocomotiveBlock) {
      mesh = mf.createLocomotiveBlock('ns', 2);
    } else if (mf.createRailCarBlock) {
      const variant = kind === TRAIN_UNIT_TYPES.RAIL_CAR_OPEN ? 'open' : 'closed';
      mesh = mf.createRailCarBlock('ns', variant, 2, colorIndex);
    }
    if (mesh) mesh.userData.batchTile = false;
    return mesh;
  }

  getUnits() {
    const out = [];
    for (const train of this.trains) {
      if (train.offscreen || train.destroyed) continue;
      for (const u of train.units) {
        if (u.alive && u.visible) out.push(u);
      }
    }
    return out;
  }

  update(dt, elapsed) {
    if (this.trains.length === 0) return;

    for (const [k, t] of this._ramCooldowns) {
      if (t - dt <= 0) this._ramCooldowns.delete(k);
      else this._ramCooldowns.set(k, t - dt);
    }

    for (const train of this.trains) {
      if (train.destroyed) continue;

      if (train.hornTimer > 0) train.hornTimer = Math.max(0, train.hornTimer - dt);
      if (train.headlightFlashTimer > 0) {
        train.headlightFlashTimer = Math.max(0, train.headlightFlashTimer - dt);
      }

      if (train.offscreen) {
        train.respawnTimer -= dt;
        if (train.respawnTimer <= 0) {
          train.offscreen = false;
          train.headDist =
            train.direction > 0
              ? -TRAIN_DEFAULTS.offscreenMargin
              : train.track.totalLength + TRAIN_DEFAULTS.offscreenMargin;
          this._setTrainVisibility(train, true);
        } else {
          continue;
        }
      }

      train.headDist += train.direction * train.speed * dt;

      if (train.track.mode === 'loop') {
        const total = train.track.totalLength;
        if (total > 0) {
          train.headDist = ((train.headDist % total) + total) % total;
        }
      } else if (train.track.mode === 'transit') {
        const margin = TRAIN_DEFAULTS.offscreenMargin + train.totalTrainLength;
        const exitedForward = train.direction > 0 && train.headDist > train.track.totalLength + margin;
        const exitedBackward = train.direction < 0 && train.headDist < -margin;
        if (exitedForward || exitedBackward) {
          train.offscreen = true;
          train.respawnTimer = train.respawnSec;
          this._setTrainVisibility(train, false);
          continue;
        }
      }

      this._syncTrainVisuals(train, elapsed);
      this._checkHornWarning(train);
      this._checkTankCollisions(train);
    }
  }

  _setTrainVisibility(train, visible) {
    for (const u of train.units) {
      u.visible = visible;
      if (u.mesh) u.mesh.visible = visible;
    }
  }

  _syncTrainVisuals(train, elapsed) {
    for (const u of train.units) {
      if (!u.alive) continue;
      const dist = train.headDist - train.direction * u.offset;
      const sample = sampleTrackAt(train.track, dist);
      if (!sample) continue;
      u.x = sample.x;
      u.z = sample.z;
      u.yOffset = sample.onBridge ? 0.20 : 0;
      u.yaw = train.direction > 0 ? sample.yaw : sample.yaw + Math.PI;
      if (u.mesh) {
        u.mesh.position.set(u.x, u.yOffset, u.z);
        u.mesh.rotation.y = u.yaw;
      }
    }

    const loco = train.units[0];
    if (loco?.alive && loco.mesh && this.engine.modelFactory?.tacticalModels?.ready) {
      if (train.headlightFlashTimer > 0) {
        train._headlightFlashing = true;
        const flashOn = Math.floor(elapsed * 12) % 2 === 0;
        this.engine.modelFactory.tacticalModels.recolor(loco.mesh, {
          paintHex: loco.hp <= loco.maxHp * 0.5 ? 0x334155 : TRAIN_UNIT_CONFIGS.LOCOMOTIVE.paintHex,
          glowHex: flashOn ? 0xffffff : TRAIN_UNIT_CONFIGS.LOCOMOTIVE.glowHex,
        });
      } else if (train._headlightFlashing) {
        train._headlightFlashing = false;
        this.engine.modelFactory.tacticalModels.recolor(loco.mesh, {
          paintHex: loco.hp <= loco.maxHp * 0.5 ? 0x334155 : TRAIN_UNIT_CONFIGS.LOCOMOTIVE.paintHex,
          glowHex: TRAIN_UNIT_CONFIGS.LOCOMOTIVE.glowHex,
        });
      }
    }
  }

  _checkHornWarning(train) {
    if (train.hornTimer > 0) return;
    const loco = train.units[0];
    if (!loco || !loco.alive) return;

    const fwdX = -Math.sin(loco.yaw);
    const fwdZ = -Math.cos(loco.yaw);
    const ahead = TRAIN_DEFAULTS.hornAheadDist;

    const isInCorridor = (tx, tz) => {
      const dx = tx - loco.x;
      const dz = tz - loco.z;
      const along = dx * fwdX + dz * fwdZ;
      if (along < 1.5 || along > ahead) return false;
      const perp = Math.abs(dx * -fwdZ + dz * fwdX);
      return perp <= 2.3;
    };

    let triggered = this.engine.playerHp > 0 && isInCorridor(this.engine.playerX, this.engine.playerZ);
    if (!triggered) {
      for (const e of this.engine.enemies || []) {
        if (e.hp > 0 && isInCorridor(e.x, e.z)) {
          triggered = true;
          break;
        }
      }
    }

    if (triggered) {
      train.hornTimer = TRAIN_DEFAULTS.hornCooldownSec;
      train.headlightFlashTimer = 1.6;
      sound.playTrainHorn?.({ x: loco.x, z: loco.z });
    }
  }

  _checkTankCollisions(train) {
    const engine = this.engine;

    const testUnitAgainst = (unit, tx, tz, tankRadius, key, onHit) => {
      if (this._ramCooldowns.has(key)) return;
      const fwdX = -Math.sin(unit.yaw);
      const fwdZ = -Math.cos(unit.yaw);
      const dx = tx - unit.x;
      const dz = tz - unit.z;
      const along = dx * fwdX + dz * fwdZ;
      const halfLen = unit.cfg.length * 0.5;
      const halfWid = unit.cfg.width * 0.5;
      if (Math.abs(along) > halfLen + tankRadius) return;
      const sideX = -fwdZ;
      const sideZ = fwdX;
      const lateral = dx * sideX + dz * sideZ;
      if (Math.abs(lateral) > halfWid + tankRadius) return;

      this._ramCooldowns.set(key, TRAIN_DEFAULTS.ramCooldownSec);
      const pushSign = lateral >= 0 ? 1 : -1;
      const pushDist = unit.cfg.ramKnockback;
      onHit(sideX * pushSign * pushDist, sideZ * pushSign * pushDist, unit.cfg.ramDamage);
    };

    const arenaHalf = (GRID_SIZE * TILE_SIZE) / 2;
    const applySafeKnockback = (entity, px, pz, radius, canCrossWater = false, canCrushSandbags = false) => {
      const steps = 4;
      const stepX = px / steps;
      const stepZ = pz / steps;
      let curX = entity.x;
      let curZ = entity.z;
      const clampCoord = (v) => Math.max(-arenaHalf + radius, Math.min(arenaHalf - radius, v));
      for (let s = 0; s < steps; s++) {
        const nx = clampCoord(curX + stepX);
        const nz = clampCoord(curZ + stepZ);
        if (typeof engine.checkTankWallCollision === 'function') {
          if (!engine.checkTankWallCollision(nx, nz, radius, canCrossWater, canCrushSandbags)) {
            curX = nx;
            curZ = nz;
          } else if (!engine.checkTankWallCollision(nx, curZ, radius, canCrossWater, canCrushSandbags)) {
            curX = nx;
          } else if (!engine.checkTankWallCollision(curX, nz, radius, canCrossWater, canCrushSandbags)) {
            curZ = nz;
          } else {
            break;
          }
        } else {
          curX = nx;
          curZ = nz;
        }
      }
      entity.x = curX;
      entity.z = curZ;
    };

    for (const unit of train.units) {
      if (!unit.alive) continue;
      if (engine.playerHp > 0) {
        testUnitAgainst(unit, engine.playerX, engine.playerZ, 0.85, 'player', (px, pz, dmg) => {
          const pTarget = { x: engine.playerX, z: engine.playerZ };
          applySafeKnockback(
            pTarget,
            px,
            pz,
            0.85,
            Boolean(engine.playerStats?.canCrossWater),
            Boolean(engine.playerStats?.canCrushSandbags)
          );
          engine.playerX = pTarget.x;
          engine.playerZ = pTarget.z;
          engine.damagePlayer(dmg, { zone: 'hull', aspect: 'side' }, 'TRAIN_RAM');
          engine.fx?.armorHit?.(engine.playerX, 0.85, engine.playerZ, { scale: 1.1, colorHex: 0xf97316 });
          sound.playSteelHit?.({ x: unit.x, z: unit.z });
        });
      }
      for (const enemy of engine.enemies || []) {
        if (enemy.hp <= 0) continue;
        const eRadius = enemy.isBoss ? 1.15 : 0.85;
        testUnitAgainst(unit, enemy.x, enemy.z, eRadius, `enemy_${enemy.id}`, (px, pz, dmg) => {
          applySafeKnockback(
            enemy,
            px,
            pz,
            eRadius,
            Boolean(enemy.stats?.canCrossWater),
            Boolean(enemy.stats?.canCrushSandbags)
          );
          if (typeof engine.damageEnemy === 'function') {
            engine.damageEnemy(enemy, dmg, { fromPlayer: false, aspect: 'side', hitX: enemy.x, hitZ: enemy.z });
          } else {
            enemy.hp -= dmg;
          }
          engine.fx?.armorHit?.(enemy.x, 0.85, enemy.z, { scale: 1.0, colorHex: 0xf97316 });
          sound.playSteelHit?.({ x: unit.x, z: unit.z });
        });
      }
    }
  }

  /** Tests if a projectile at `(px, pz)` hits any live moving train unit. */
  findUnitAtPoint(px, pz) {
    for (const train of this.trains) {
      if (train.offscreen || train.destroyed) continue;
      for (const unit of train.units) {
        if (!unit.alive) continue;
        const fwdX = -Math.sin(unit.yaw);
        const fwdZ = -Math.cos(unit.yaw);
        const dx = px - unit.x;
        const dz = pz - unit.z;
        const along = dx * fwdX + dz * fwdZ;
        const lateral = dx * -fwdZ + dz * fwdX;
        if (Math.abs(along) <= unit.cfg.length * 0.5 && Math.abs(lateral) <= unit.cfg.width * 0.5 + 0.15) {
          return { train, unit };
        }
      }
    }
    return null;
  }

  /** Applies shell/missile/splash damage to a train unit and triggers permanent wreck on 0 HP. */
  damageUnit(train, unit, amount, hitX = unit.x, hitZ = unit.z) {
    if (!unit.alive || train.destroyed) return;
    unit.hp = Math.max(0, unit.hp - amount);
    const engine = this.engine;
    sound.playSteelHit?.({ x: hitX, z: hitZ });
    engine.fx?.armorHit?.(hitX, 0.85, hitZ, { scale: 1.0, colorHex: 0xf97316 });

    if (unit.isLocomotive) {
      engine.modelFactory?.updateLocomotiveDamage?.(unit.mesh, unit.hp, unit.maxHp);
    } else {
      engine.modelFactory?.updateRailCarDamage?.(unit.mesh, unit.hp, unit.maxHp);
    }

    if (unit.hp <= 0) {
      this._destroyUnitAndHaltTrain(train, unit);
    }
  }

  _destroyUnitAndHaltTrain(train, destroyedUnit) {
    const engine = this.engine;
    destroyedUnit.alive = false;
    train.destroyed = true;

    engine.fx?.explosion?.(destroyedUnit.x, 0.9, destroyedUnit.z, { scale: 1.8 });
    sound.playExplosion?.(1.6, { x: destroyedUnit.x, z: destroyedUnit.z });
    engine.screenShake = Math.max(engine.screenShake || 0, 0.45);

    if (destroyedUnit.mesh && engine.mapGroup) {
      engine.mapGroup.remove(destroyedUnit.mesh);
      destroyedUnit.mesh = null;
    }

    // Replace wrecked unit & all stopped surviving units with permanent grid obstacles blocking this branch
    for (const unit of train.units) {
      const fwdX = -Math.sin(unit.yaw);
      const fwdZ = -Math.cos(unit.yaw);
      const offsets = [-0.95, 0.95];
      const occupiedCells = [];
      for (const off of offsets) {
        const gc = worldToGridCell(unit.x + fwdX * off, unit.z + fwdZ * off);
        if (!gc) continue;
        if (!occupiedCells.some((c) => c.row === gc.row && c.col === gc.col)) {
          occupiedCells.push(gc);
        }
      }

      if (unit === destroyedUnit) {
        for (const gc of occupiedCells) {
          const cell = engine.grid[gc.row]?.[gc.col];
          if (!cell) continue;
          if (cell.mesh && engine.mapGroup) {
            engine.mapGroup.remove(cell.mesh);
            cell.mesh = null;
          }
          setCellObject(cell, TileType.RUBBLE);
          cell.hp = 1;
          cell.maxHp = 1;
          if (engine.modelFactory?.createRubbleBlock && engine.mapGroup) {
            const cw = cellCenterWorld(gc.row, gc.col);
            const rubble = engine.modelFactory.createRubbleBlock('house2');
            rubble.position.set(cw.x, cell.railBridge ? 0.20 : 0, cw.z);
            engine.mapGroup.add(rubble);
            cell.mesh = rubble;
            engine.tileBatcher?.markDirty?.(rubble);
          }
        }
      } else {
        // Keep surviving stopped car mesh in place and mark its cells as blocking obstacles
        const unitCells = [];
        for (const gc of occupiedCells) {
          const cell = engine.grid[gc.row]?.[gc.col];
          if (!cell) continue;
          setCellObject(cell, unit.isLocomotive ? TileType.LOCOMOTIVE : TileType.RAIL_CAR);
          cell.hp = unit.hp;
          cell.maxHp = unit.maxHp;
          cell.mesh = unit.mesh;
          unitCells.push(cell);
        }
        if (unitCells.length === 2) {
          unitCells[0].pairPartner = unitCells[1];
          unitCells[1].pairPartner = unitCells[0];
        }
      }
    }
  }

  /** Returns true if the segment `(x0,z0)->(x1,z1)` intersects any live moving train unit. */
  blocksLineOfSight(x0, z0, x1, z1) {
    const units = this.getUnits();
    if (units.length === 0) return false;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return false;
    const steps = Math.ceil(len / 0.8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
      if (this.findUnitAtPoint(px, pz)) return true;
    }
    return false;
  }
}
