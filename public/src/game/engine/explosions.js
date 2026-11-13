import * as THREE from 'three';
import { determineHitAspect } from '../../sim/ballistics.js';
import {
  ARTILLERY,
  DURABILITY,
  INFERNO,
  LAND_MINE,
  TANK_HIT_RADIUS,
  computeEffectiveDamage,
} from '../constants.js';
import { markOwned } from '../render/dispose.js';
import { createProjectileVisual } from '../effects/index.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { TileType } from '../types.js';

/** Manages land mines, artillery hazard zones, and area-of-effect explosions. */
export class ExplosionsController {
  constructor(engine) {
    this.engine = engine;
  }

  plantMineAt(x, z) {
    const { engine } = this;
    const mesh = engine.modelFactory.createLandMineMesh();
    mesh.position.set(x, 0, z);
    engine.entityGroup.add(mesh);
    sound.playMinePlant();

    engine.mines.push({
      id: engine.nextEnemyId++,
      x,
      z,
      armTimer: LAND_MINE.ARM_SEC,
      life: LAND_MINE.LIFE_SEC,
      damage: LAND_MINE.DAMAGE,
      mesh,
    });
  }

  updateMines(dt, elapsed) {
    const { engine } = this;
    for (let i = engine.mines.length - 1; i >= 0; i--) {
      const m = engine.mines[i];
      if (!m) continue;
      if (m.armTimer > 0) m.armTimer -= dt;
      m.life -= dt;

      m.mesh.rotation.y = elapsed * 1.5;

      if (m.life <= 0) {
        engine.entityGroup.remove(m.mesh);
        engine.mines.splice(i, 1);
        continue;
      }

      if (
        m.armTimer <= 0 &&
        Math.hypot(engine.playerX - m.x, engine.playerZ - m.z) <= LAND_MINE.TRIGGER_RADIUS
      ) {
        engine.detonateMine(i);
        i = Math.min(i, engine.mines.length);
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
    engine.fx?.shockwave?.(m.x, 0.1, m.z, 0.35, blastRadius, 0xff5a14, 0.48);
    engine.detonateExplosionAt(
      m.x,
      m.z,
      blastRadius,
      m.damage ?? LAND_MINE.DAMAGE,
      false,
      null,
      true,
      LAND_MINE.PENETRATION
    );
    // Chain-detonate adjacent mines caught in the blast.
    for (let i = engine.mines.length - 1; i >= 0; i--) {
      const other = engine.mines[i];
      if (!other) continue;
      if (Math.hypot(other.x - m.x, other.z - m.z) <= blastRadius * 0.85) {
        engine.detonateMine(i);
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

    const shellMesh = createProjectileVisual(fromPlayer ? 0xffb030 : 0xff5a2a, {
      radius: 0.2,
      length: 0.34,
      glow: 1.25,
    });
    shellMesh.position.set(startX, startY, startZ);
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
      const arcY =
        THREE.MathUtils.lerp(hz.startY ?? 0.8, 0.3, progress) +
        Math.sin(progress * Math.PI) * 6.5;
      hz.shellMesh.position.set(curX, arcY, curZ);
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
          { zone: 'turret', aspect: 'front' }
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

    let rebuildWater = false;
    let rebuildIce = false;
    let touchedSand = false;

    for (let r = 0; r < engine.grid.length; r++) {
      const row = engine.grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        const pos = engine.gridToWorld(r, c);
        if (Math.hypot(pos.x - x, pos.z - z) > radius + 0.35) continue;

        if (
          cell.type === TileType.FOREST ||
          cell.type === TileType.BRICK ||
          cell.type === TileType.CONCRETE ||
          cell.type === TileType.ICE ||
          cell.type === TileType.WATER
        ) {
          if (cell.type === TileType.WATER) rebuildWater = true;
          if (cell.type === TileType.ICE) rebuildIce = true;
          engine.convertCellToSand(cell);
          touchedSand = true;
        } else if (cell.type === TileType.BARREL) {
          engine.explodeBarrel(cell, fromPlayer);
        } else if (cell.type === TileType.BOXES) {
          engine.damageTileCell(cell, 2, pos.x, pos.z, fromPlayer);
        } else if (cell.type === TileType.SPAWNER) {
          engine.destroyTileCell(cell);
        } else if (cell.type === TileType.BASE && !fromPlayer) {
          engine.terrainDestruction.destroyCommandBase();
        } else if (cell.type === TileType.ENEMY_BASE && fromPlayer) {
          engine.damageEnemyBase(cell, 16, pos.x, pos.z);
        }
      }
    }

    if (touchedSand) {
      engine.tileBatcher?.sync();
      engine.rebuildWaterAndIceSurfaces(rebuildWater, rebuildIce);
    }

    if (fromPlayer) {
      for (let i = engine.enemies.length - 1; i >= 0; i--) {
        const e = engine.enemies[i];
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= radius + (e.isBoss ? 1.2 : 0.7)) {
          const edgeRatio = dist > radius * 0.5 ? INFERNO.EDGE_DAMAGE_RATIO : 1.0;
          const eff = computeEffectiveDamage(
            damage * edgeRatio,
            25,
            engine.blastSideArmor(e.stats, e.x, e.z, e.hullAngle, x, z)
          );
          engine.damageEnemy(e, eff);
        }
      }
    } else if (engine.playerHp > DURABILITY.ZERO_HP) {
      const dist = Math.hypot(engine.playerX - x, engine.playerZ - z);
      if (dist <= radius + TANK_HIT_RADIUS.PLAYER) {
        const edgeRatio = dist > radius * 0.5 ? INFERNO.EDGE_DAMAGE_RATIO : 1.0;
        const eff = computeEffectiveDamage(
          damage * edgeRatio,
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
    penetration = 0
  ) {
    const { engine } = this;
    if (isEnvironmental) {
      sound.playEnvironmentalExplosion({ x, z });
    } else {
      sound.playExplosion(1.4, { x, z });
    }
    engine.screenShake = Math.max(engine.screenShake, 0.55);
    engine.fx.explosion(x, 0.55, z, {
      scale: THREE.MathUtils.clamp(radius / 2.4, 0.75, 1.6),
    });

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = engine.grid[r][c];
        if (cell.type === TileType.EMPTY) continue;
        const pos = engine.gridToWorld(r, c);
        if (Math.hypot(pos.x - x, pos.z - z) <= radius + 0.5) {
          if (cell.type === TileType.BOXES) {
            engine.damageTileCell(cell, 1, pos.x, pos.z, fromPlayer);
          } else if (cell.type === TileType.BRICK || cell.type === TileType.SPAWNER) {
            engine.destroyTileCell(cell);
          } else if (cell.type === TileType.BARREL) {
            engine.explodeBarrel(cell, fromPlayer);
          } else if (cell.type === TileType.CONCRETE) {
            engine.damageTileCell(cell, 6, pos.x, pos.z);
          } else if (cell.type === TileType.BASE && !fromPlayer) {
            engine.terrainDestruction.destroyCommandBase();
          } else if (cell.type === TileType.ENEMY_BASE && fromPlayer) {
            engine.damageEnemyBase(cell, 12, pos.x, pos.z);
          }
        }
      }
    }

    if (fromPlayer) {
      for (let i = engine.enemies.length - 1; i >= 0; i--) {
        const e = engine.enemies[i];
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= radius + (e.isBoss ? 1.2 : 0.7)) {
          const edgeRatio =
            dist > radius * 0.5 ? ARTILLERY.EDGE_DAMAGE_RATIO : 1.0;
          const eff = computeEffectiveDamage(
            damage * edgeRatio,
            penetration,
            engine.blastSideArmor(e.stats, e.x, e.z, e.hullAngle, x, z)
          );
          engine.damageEnemy(e, eff);
        }
      }
    } else {
      const dist = Math.hypot(engine.playerX - x, engine.playerZ - z);
      if (dist <= radius + 0.65) {
        const edgeRatio =
          dist > radius * 0.5 ? ARTILLERY.EDGE_DAMAGE_RATIO : 1.0;
        const eff = computeEffectiveDamage(
          damage * edgeRatio,
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
        engine.damagePlayer(eff, componentHit);
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

