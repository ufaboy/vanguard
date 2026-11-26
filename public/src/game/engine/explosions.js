import * as THREE from 'three';
import { determineHitAspect } from '../../sim/ballistics.js';
import {
  ARTILLERY,
  DURABILITY,
  LAND_MINE,
  TANK_HIT_RADIUS,
  computeEffectiveDamage,
} from '../constants.js';
import { markOwned } from '../render/dispose.js';
import { createArtilleryShellVisual } from '../effects/index.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { breachPointToward } from '../terrains/breach-models.js';
import { TileType } from '../types.js';

/**
 * Computes thermobaric blast damage at distance `dist` within `radius`:
 * - 0 -> 0.5*radius: 100% -> 75% of `damage`
 * - 0.5*radius -> radius: 75% of `damage` -> minimum 2
 */
function computeThermobaricDamage(damage, dist, radius) {
  const base = Math.max(2, damage || 0);
  if (!(radius > 0) || dist <= 0) return base;
  const half = radius * 0.5;
  const minDmg = Math.min(2, base);
  if (dist <= half) {
    return base * (1 - 0.25 * (dist / half));
  }
  const t = Math.min(1, (dist - half) / half);
  return base * 0.75 * (1 - t) + minDmg * t;
}

function collectMineMaterials(mesh) {
  const materials = [];
  if (typeof mesh?.traverse === 'function') {
    mesh.traverse((child) => {
      if (!child?.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        materials.push({
          mat,
          baseOpacity: mat.opacity ?? 1,
          baseTransparent: Boolean(mat.transparent),
        });
      }
    });
  }
  return materials;
}

function applyMineRevealAlpha(mine, alpha) {
  if (!mine?._materials?.length) return;
  const clamped = Math.max(0, Math.min(1, alpha));
  for (const entry of mine._materials) {
    const { mat, baseOpacity, baseTransparent } = entry;
    const nextTransparent = clamped < 1 || baseTransparent;
    if (mat.transparent !== nextTransparent) {
      mat.transparent = nextTransparent;
      mat.needsUpdate = true;
    }
    mat.opacity = baseOpacity * clamped;
  }
}

/** Manages land mines, artillery hazard zones, and area-of-effect explosions. */
export class ExplosionsController {
  constructor(engine) {
    this.engine = engine;
  }

  plantMineAt(x, z, opts = {}) {
    const { engine } = this;
    const mesh = engine.modelFactory.createLandMineMesh();
    mesh.position.set(x, 0, z);
    const discovered = Boolean(opts.discovered);
    const revealAlpha = discovered ? 1 : 0;
    mesh.visible = discovered;
    const mine = {
      id: engine.nextEnemyId++,
      x,
      z,
      armTimer: opts.armTimer ?? LAND_MINE.ARM_SEC,
      life: opts.life ?? LAND_MINE.LIFE_SEC,
      damage: opts.damage ?? LAND_MINE.DAMAGE,
      neutral: Boolean(opts.neutral),
      mapMine: Boolean(opts.mapMine),
      discovered,
      revealAlpha,
      _materials: collectMineMaterials(mesh),
      mesh,
    };
    if (!discovered) {
      applyMineRevealAlpha(mine, 0);
    }
    engine.entityGroup.add(mesh);
    if (!opts.silent) sound.playMinePlant();

    engine.mines.push(mine);
  }

  updateMines(dt, elapsed) {
    const { engine } = this;
    const detectRadius = LAND_MINE.DETECT_RADIUS_CELLS * TILE_SIZE;
    const fadeSec = Math.max(0.01, LAND_MINE.REVEAL_FADE_SEC || 0.25);

    for (let i = engine.mines.length - 1; i >= 0; i--) {
      const m = engine.mines[i];
      if (!m) continue;
      if (m.armTimer > 0) m.armTimer -= dt;
      if (Number.isFinite(m.life)) m.life -= dt;

      if (!m.discovered) {
        const playerNear = Math.hypot(engine.playerX - m.x, engine.playerZ - m.z) <= detectRadius;
        const reconRevealed = Boolean(engine.isPointRevealedByReconDrone?.(m.x, m.z));
        if (playerNear || reconRevealed) {
          m.discovered = true;
          if (m.mesh) m.mesh.visible = true;
          sound.playMineDetect();
        }
      }

      if (m.discovered) {
        if (m.mesh) m.mesh.rotation.y = elapsed * 1.5;
        if (m.revealAlpha < 1) {
          m.revealAlpha = Math.min(1, m.revealAlpha + dt / fadeSec);
          applyMineRevealAlpha(m, m.revealAlpha);
        }
      }

      if (m.life <= 0) {
        engine.entityGroup.remove(m.mesh);
        engine.mines.splice(i, 1);
        continue;
      }

      if (m.armTimer <= 0) {
        const hitPlayer =
          Math.hypot(engine.playerX - m.x, engine.playerZ - m.z) <= LAND_MINE.TRIGGER_RADIUS;
        const hitEnemy =
          m.neutral &&
          engine.enemies.some(
            (e) =>
              e.hp > 0 &&
              Math.hypot(e.x - m.x, e.z - m.z) <=
                LAND_MINE.TRIGGER_RADIUS + (e.isBoss ? 0.45 : 0.15)
          );
        if (hitPlayer || hitEnemy) {
          this.detonateMine(i);
          i = Math.min(i, engine.mines.length);
        }
      }
    }
  }

  detonateMine(index) {
    const { engine } = this;
    const m = engine.mines[index];
    if (!m) return;
    engine.entityGroup.remove(m.mesh);
    engine.mines.splice(index, 1);
    const blastRadius = LAND_MINE.BLAST_RADIUS_CELLS * TILE_SIZE;
    const damage = m.damage ?? LAND_MINE.DAMAGE;
    engine.fx?.shockwave?.(m.x, 0.1, m.z, 0.35, blastRadius, 0xff5a14, 0.48);
    engine.detonateExplosionAt(
      m.x,
      m.z,
      blastRadius,
      damage,
      false,
      null,
      true,
      LAND_MINE.PENETRATION
    );
    if (m.neutral) {
      const targets = [...engine.enemies];
      for (let i = targets.length - 1; i >= 0; i--) {
        const e = targets[i];
        if (!e || e.hp <= 0) continue;
        const dist = Math.hypot(e.x - m.x, e.z - m.z);
        if (dist <= blastRadius + (e.isBoss ? 1.2 : 0.7)) {
          const edgeRatio = dist > blastRadius * 0.5 ? ARTILLERY.EDGE_DAMAGE_RATIO : 1.0;
          const eGrid = engine.worldToGrid(e.x, e.z);
          const craterMult =
            engine.grid[eGrid.row]?.[eGrid.col]?.type === TileType.CRATER ? 0.7 : 1.0;
          const eff = computeEffectiveDamage(
            damage * edgeRatio * craterMult,
            LAND_MINE.PENETRATION,
            engine.blastSideArmor(e.stats, e.x, e.z, e.hullAngle, m.x, m.z)
          );
          engine.damageEnemy(e, eff, {
            aspect: determineHitAspect(e.x, e.z, e.hullAngle, m.x, m.z),
          });
        }
      }
    }
    // Chain-detonate adjacent mines caught in the blast.
    for (let i = engine.mines.length - 1; i >= 0; i--) {
      const other = engine.mines[i];
      if (!other) continue;
      if (Math.hypot(other.x - m.x, other.z - m.z) <= blastRadius * 0.85) {
        this.detonateMine(i);
        i = Math.min(i, engine.mines.length);
      }
    }
  }

  createArtilleryStrike(
    startX,
    startZ,
    targetX,
    targetZ,
    radius,
    duration,
    damage,
    fromPlayer,
    startY = 1.0,
    weaponId = 'HOWITZER'
  ) {
    const { engine } = this;
    const color = fromPlayer ? 0xf59e0b : 0xef4444;
    const ringGeo = new THREE.RingGeometry(radius - 0.14, radius, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(targetX, 0.07, targetZ);

    const fillGeo = new THREE.CircleGeometry(radius, 28);
    fillGeo.rotateX(-Math.PI / 2);
    const fillMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.set(targetX, 0.06, targetZ);
    fillMesh.scale.setScalar(0.05);

    const shellMesh = createArtilleryShellVisual(fromPlayer ? 'player' : 'enemy');
    shellMesh.position.set(startX, startY, startZ);
    shellMesh.rotation.order = 'YXZ';
    shellMesh.rotation.y = Math.atan2(targetX - startX, targetZ - startZ);
    const launchLen = Math.hypot(targetX - startX, targetZ - startZ) || 1;
    engine.fx.muzzleFlash(
      startX,
      startY,
      startZ,
      (targetX - startX) / launchLen,
      (targetZ - startZ) / launchLen,
      { scale: 0.9, tint: 0xffa040 }
    );

    markOwned(ringMesh);
    markOwned(fillMesh);
    engine.fxGroup.add(ringMesh);
    engine.fxGroup.add(fillMesh);
    engine.fxGroup.add(shellMesh);

    engine.hazardZones.push({
      x: targetX,
      z: targetZ,
      startX,
      startZ,
      startY,
      weaponId,
      radius,
      timer: duration,
      maxTimer: duration,
      damage,
      fromPlayer,
      ringMesh,
      fillMesh,
      shellMesh,
    });
  }

  updateHazardZones(dt, elapsed) {
    const { engine } = this;
    for (let i = engine.hazardZones.length - 1; i >= 0; i--) {
      const hz = engine.hazardZones[i];
      hz.timer -= dt;
      const progress = Math.min(1, Math.max(0, 1 - hz.timer / hz.maxTimer));
      hz.fillMesh.scale.setScalar(Math.max(0.05, progress));

      hz.ringMesh.visible =
        Math.floor(elapsed * ARTILLERY.MARKER_BLINK_RATE * 2) % 2 === 0;

      const curX = THREE.MathUtils.lerp(hz.startX, hz.x, progress);
      const curZ = THREE.MathUtils.lerp(hz.startZ, hz.z, progress);
      const startY = hz.startY ?? 0.8;
      const arcY =
        THREE.MathUtils.lerp(startY, 0.3, progress) +
        Math.sin(progress * Math.PI) * 6.5;
      hz.shellMesh.position.set(curX, arcY, curZ);
      const horizDist = Math.hypot(hz.x - hz.startX, hz.z - hz.startZ) || 1;
      const dy = (0.3 - startY) + Math.cos(progress * Math.PI) * Math.PI * 6.5;
      hz.shellMesh.rotation.order = 'YXZ';
      hz.shellMesh.rotation.x = Math.atan2(-dy, horizDist);
      hz.shellMesh.rotation.z += dt * 10;
      hz.trailAcc = (hz.trailAcc || 0) + dt;
      if (hz.trailAcc >= 0.03 / engine.fx.q) {
        hz.trailAcc = 0;
        engine.fx.shellSmokeTrail(curX, arcY, curZ, true);
      }

      if (hz.timer <= 0) {
        engine.fxGroup.remove(hz.ringMesh);
        engine.fxGroup.remove(hz.fillMesh);
        engine.fxGroup.remove(hz.shellMesh);
        engine.detonateExplosionAt(
          hz.x,
          hz.z,
          hz.radius,
          hz.damage,
          hz.fromPlayer,
          { zone: 'turret', aspect: 'front' },
          false,
          0,
          hz.sourceWeapon || null
        );
        engine.hazardZones.splice(i, 1);
      }
    }
  }

  detonateThermobaricAt(x, z, radius, damage, fromPlayer = false) {
    const { engine } = this;
    sound.playExplosion(1.9, { x, z });
    engine.screenShake = Math.max(engine.screenShake || 0, 0.85);
    if (engine.fx?.thermobaricExplosion) {
      engine.fx.thermobaricExplosion(x, 0.55, z, radius);
    } else {
      engine.fx?.explosion?.(x, 0.55, z, { scale: 2.0, tint: 0xff4500 });
    }

    let baseHitDmg = 0;
    let swampedWater = false;
    let rebuildWater = false;
    let rebuildIce = false;

    const searchSpan = radius + 0.5;
    const minG = engine.worldToGrid(x - searchSpan, z - searchSpan);
    const maxG = engine.worldToGrid(x + searchSpan, z + searchSpan);
    const minRow = Math.max(0, minG.row - 1);
    const maxRow = Math.min(engine.grid.length - 1, maxG.row + 1);
    const minCol = Math.max(0, minG.col - 1);
    for (let r = minRow; r <= maxRow; r++) {
      const row = engine.grid[r];
      if (!row) continue;
      const maxCol = Math.min(row.length - 1, maxG.col + 1);
      for (let c = minCol; c <= maxCol; c++) {
        const cell = row[c];
        if (!cell || cell.type === TileType.EMPTY) continue;
        const pos = engine.gridToWorld(r, c);
        const dist = Math.hypot(pos.x - x, pos.z - z);
        if (dist > searchSpan) continue;

        const tileDmg = Math.max(2, Math.round(computeThermobaricDamage(damage, dist, radius)));

        if (cell.type === TileType.WATER) {
          engine.terrainDestruction?.convertCellToSwamp?.(cell, { allowWater: true });
          swampedWater = true;
          rebuildWater = true;
        } else if (cell.type === TileType.ICE) {
          engine.terrainDestruction?.convertCellToWater?.(cell);
          rebuildWater = true;
          rebuildIce = true;
        } else if (cell.type === TileType.BOXES || cell.type === TileType.WATER_TOWER || cell.type === TileType.BRICK) {
          engine.damageTileCell(cell, tileDmg, pos.x, pos.z, fromPlayer);
        } else if (cell.type === TileType.CONTAINER || cell.type === TileType.RAIL_CAR || cell.type === TileType.LOCOMOTIVE) {
          engine.damageTileCell(cell, Math.max(4, tileDmg), pos.x, pos.z, fromPlayer);
        } else if (cell.type === TileType.TRANSFORMER || cell.type === TileType.SANDBAGS) {
          engine.damageTileCell(cell, Math.max(2, tileDmg), pos.x, pos.z, fromPlayer);
        } else if (cell.type === TileType.BARREL) {
          engine.explodeBarrel(cell, fromPlayer);
        } else if (cell.type === TileType.OIL_SLICK) {
          engine.terrainDestruction?.igniteOilSlick?.(cell);
        } else if (cell.type === TileType.FOREST) {
          engine.forestFire?.startBurning?.(cell, pos.x, pos.z);
        } else if (cell.type === TileType.CONCRETE || cell.type === TileType.HOUSE_1 || cell.type === TileType.HOUSE_2) {
          const hit = breachPointToward(pos.x, pos.z, x, z);
          engine.damageTileCell(cell, tileDmg, hit.x, hit.z, fromPlayer);
        } else if (cell.type === TileType.BASE && !fromPlayer) {
          baseHitDmg = Math.max(baseHitDmg, tileDmg);
        } else if (cell.type === TileType.ENEMY_BASE && fromPlayer) {
          engine.damageEnemyBase(cell, tileDmg, pos.x, pos.z);
        }
      }

      if (engine.trainController) {
        for (const train of engine.trainController.trains || []) {
          if (train.offscreen || train.destroyed) continue;
          for (const unit of train.units) {
            if (!unit.alive) continue;
            const d = Math.hypot(unit.x - x, unit.z - z);
            if (d <= radius + unit.hitRadius) {
              engine.trainController.damageUnit(train, unit, unit.cfg.artilleryDamage, unit.x, unit.z);
            }
          }
        }
      }
    }
    if (baseHitDmg > 0) {
      engine.terrainDestruction.damageCommandBase(baseHitDmg, x, z);
    }
    if (swampedWater) {
      engine.tileBatcher?.sync?.();
    }
    if (rebuildWater || rebuildIce) {
      engine.rebuildWaterAndIceSurfaces?.(rebuildWater, rebuildIce);
    }

    const impactGrid = engine.worldToGrid(x, z);
    const impactCell = engine.grid[impactGrid.row]?.[impactGrid.col];
    if (impactCell && impactCell.type !== TileType.RUBBLE && radius >= TILE_SIZE * 1.1) {
      engine.terrainDestruction?.convertCellToCrater?.(impactCell);
    }
    engine.terrainDestruction?.crushPropsNear?.(x, z, searchSpan);

    if (fromPlayer) {
      const targets = [...engine.enemies];
      for (let i = targets.length - 1; i >= 0; i--) {
        const e = targets[i];
        if (!e || e.hp <= 0) continue;
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= radius + (e.isBoss ? 1.2 : 0.7)) {
          const blastDmg = computeThermobaricDamage(damage, dist, radius);
          const eff = computeEffectiveDamage(
            blastDmg,
            25,
            engine.blastSideArmor(e.stats, e.x, e.z, e.hullAngle, x, z)
          );
          engine.damageEnemy(e, eff, {
            aspect: determineHitAspect(e.x, e.z, e.hullAngle, x, z),
          });
        }
      }
    } else if (engine.playerHp > DURABILITY.ZERO_HP) {
      const dist = Math.hypot(engine.playerX - x, engine.playerZ - z);
      if (dist <= radius + TANK_HIT_RADIUS.PLAYER) {
        const blastDmg = computeThermobaricDamage(damage, dist, radius);
        const eff = computeEffectiveDamage(
          blastDmg,
          25,
          engine.blastSideArmor(
            engine.playerStats,
            engine.playerX,
            engine.playerZ,
            engine.playerHullAngle,
            x,
            z
          )
        );
        engine.damagePlayer(eff, { zone: 'hull', aspect: 'front' });
      }
    }
  }

  detonateExplosionAt(
    x,
    z,
    radius,
    damage,
    fromPlayer,
    componentHit = null,
    isEnvironmental = false,
    penetration = 0,
    sourceWeapon = null
  ) {
    const { engine } = this;
    if (isEnvironmental) {
      sound.playEnvironmentalExplosion({ x, z });
    } else {
      sound.playExplosion(1.4, { x, z });
    }
    engine.screenShake = Math.max(engine.screenShake, 0.55);
    engine.fx?.explosion?.(x, 0.55, z, {
      scale: THREE.MathUtils.clamp(radius / 2.4, 0.75, 1.6),
    });

    let hitCommandBase = false;
    const searchSpan = radius + 0.5;
    const minG = engine.worldToGrid(x - searchSpan, z - searchSpan);
    const maxG = engine.worldToGrid(x + searchSpan, z + searchSpan);
    const minRow = Math.max(0, minG.row - 1);
    const maxRow = Math.min(GRID_SIZE - 1, maxG.row + 1);
    const minCol = Math.max(0, minG.col - 1);
    const maxCol = Math.min(GRID_SIZE - 1, maxG.col + 1);
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = engine.grid[r]?.[c];
        if (!cell || cell.type === TileType.EMPTY) continue;
        const pos = engine.gridToWorld(r, c);
        if (Math.hypot(pos.x - x, pos.z - z) <= searchSpan) {
          if (cell.type === TileType.BOXES) {
            engine.damageTileCell(cell, 1, pos.x, pos.z, fromPlayer);
          } else if (cell.type === TileType.RUBBLE) {
            engine.terrainDestruction?.clearRubbleCell?.(cell);
          } else if (cell.type === TileType.BRICK) {
            engine.destroyTileCell(cell);
          } else if (cell.type === TileType.BARREL) {
            engine.explodeBarrel(cell, fromPlayer);
          } else if (cell.type === TileType.WATER_TOWER) {
            engine.damageTileCell(cell, 2, pos.x, pos.z, fromPlayer);
          } else if (cell.type === TileType.CONTAINER || cell.type === TileType.RAIL_CAR || cell.type === TileType.LOCOMOTIVE) {
            engine.damageTileCell(cell, 4, pos.x, pos.z, fromPlayer);
          } else if (cell.type === TileType.TRANSFORMER || cell.type === TileType.SANDBAGS) {
            engine.damageTileCell(cell, 2, pos.x, pos.z, fromPlayer);
          } else if (cell.type === TileType.OIL_SLICK) {
            engine.terrainDestruction?.igniteOilSlick?.(cell);
          } else if (cell.type === TileType.FOREST) {
            engine.forestFire?.startBurning?.(cell, pos.x, pos.z);
          } else if (cell.type === TileType.CONCRETE) {
            const hit = breachPointToward(pos.x, pos.z, x, z);
            engine.damageTileCell(cell, 6, hit.x, hit.z);
          } else if (cell.type === TileType.HOUSE_1 || cell.type === TileType.HOUSE_2) {
            const hit = breachPointToward(pos.x, pos.z, x, z);
            engine.damageTileCell(cell, 15, hit.x, hit.z);
          } else if (cell.type === TileType.BASE && !fromPlayer && !isEnvironmental) {
            hitCommandBase = true;
          } else if (cell.type === TileType.ENEMY_BASE && fromPlayer) {
            engine.damageEnemyBase(cell, 12, pos.x, pos.z);
          }
        }
      }
    }
    if (hitCommandBase) {
      engine.terrainDestruction.damageCommandBase(Math.min(damage || 18, 22), x, z);
    }

    const impactGrid = engine.worldToGrid(x, z);
    const impactCell = engine.grid[impactGrid.row]?.[impactGrid.col];
    if (impactCell && impactCell.type !== TileType.RUBBLE && radius >= TILE_SIZE * 1.1) {
      engine.terrainDestruction?.convertCellToCrater?.(impactCell);
    }
    engine.terrainDestruction?.crushPropsNear?.(x, z, searchSpan);

    if (fromPlayer) {
      const targets = [...engine.enemies];
      for (let i = targets.length - 1; i >= 0; i--) {
        const e = targets[i];
        if (!e || e.hp <= 0) continue;
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= radius + (e.isBoss ? 1.2 : 0.7)) {
          const edgeRatio =
            dist > radius * 0.5 ? ARTILLERY.EDGE_DAMAGE_RATIO : 1.0;
          const eGrid = engine.worldToGrid(e.x, e.z);
          const craterMult = engine.grid[eGrid.row]?.[eGrid.col]?.type === TileType.CRATER ? 0.7 : 1.0;
          const eff = computeEffectiveDamage(
            damage * edgeRatio * craterMult,
            penetration,
            engine.blastSideArmor(e.stats, e.x, e.z, e.hullAngle, x, z)
          );
          engine.damageEnemy(e, eff, {
            aspect: determineHitAspect(e.x, e.z, e.hullAngle, x, z),
          });
        }
      }
    } else {
      const dist = Math.hypot(engine.playerX - x, engine.playerZ - z);
      if (dist <= radius + 0.65) {
        const edgeRatio =
          dist > radius * 0.5 ? ARTILLERY.EDGE_DAMAGE_RATIO : 1.0;
        const pGrid = engine.worldToGrid(engine.playerX, engine.playerZ);
        const craterMult = engine.grid[pGrid.row]?.[pGrid.col]?.type === TileType.CRATER ? 0.7 : 1.0;
        const eff = computeEffectiveDamage(
          damage * edgeRatio * craterMult,
          penetration,
          engine.blastSideArmor(
            engine.playerStats,
            engine.playerX,
            engine.playerZ,
            engine.playerHullAngle,
            x,
            z
          )
        );
        engine.damagePlayer(eff, componentHit, sourceWeapon);
      }
    }
  }

  /** Armour of the hull side facing a blast centre (armour always works per side). */
  blastSideArmor(stats, tankX, tankZ, hullYaw, blastX, blastZ) {
    if (!stats.directionalArmor) return stats.armor;
    if (Math.hypot(blastX - tankX, blastZ - tankZ) < 0.05) return stats.armor;
    const aspect = determineHitAspect(
      { x: tankX, z: tankZ, hullYaw: hullYaw || 0 },
      { x: blastX, z: blastZ },
      'hull'
    );
    return stats.armorByAspect[aspect] ?? stats.armor;
  }
}

