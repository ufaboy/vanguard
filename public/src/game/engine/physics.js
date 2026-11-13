import * as THREE from 'three';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { TileType } from '../types.js';

/** Handles tank-wall/tank-tank collisions and basic rig/angle kinematics. */
export class PhysicsController {
  constructor(engine) {
    this.engine = engine;
  }

  /** Advances a rig's track and wheel animation (rig.gear uniforms, model metres) from how far the. */
  driveGear(rig, state, x, z, hullAngle) {
    const gear = rig?.gear;
    if (state.gearX === undefined) {
      state.gearX = x;
      state.gearZ = z;
      state.gearYaw = hullAngle;
      return;
    }
    const dx = x - state.gearX;
    const dz = z - state.gearZ;
    let dyaw = hullAngle - state.gearYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    state.gearX = x;
    state.gearZ = z;
    state.gearYaw = hullAngle;
    if (!gear) return;
    let forward = dx * Math.sin(hullAngle) + dz * Math.cos(hullAngle);
    if (Math.abs(forward) > 2) forward = 0;
    const turn = dyaw * 0.42;
    gear.left.value += (forward - turn) / gear.scale;
    gear.right.value += (forward + turn) / gear.scale;
  }

  /** World-space muzzle position of a rig (falls back to a forward offset). */
  getRigMuzzle(rig, x, z, dirX, dirZ, fallbackDist = 1.4, out = { x: 0, y: 0.85, z: 0 }) {
    const { engine } = this;
    if (rig?.muzzleFlash) {
      rig.muzzleFlash.updateWorldMatrix(true, false);
      const v = rig.muzzleFlash.getWorldPosition(
        engine._tmpMuzzle || (engine._tmpMuzzle = new THREE.Vector3())
      );
      out.x = v.x;
      out.y = v.y;
      out.z = v.z;
      return out;
    }
    out.x = x + dirX * fallbackDist;
    out.y = 0.85;
    out.z = z + dirZ * fallbackDist;
    return out;
  }

  checkTankEnemyCollision(e, testX, testZ, radius) {
    const { engine } = this;
    for (let i = 0; i < engine.enemies.length; i++) {
      const other = engine.enemies[i];
      if (other === e) continue;
      const otherRadius = other.isBoss ? 1.12 : 0.72;
      const minDist = radius + otherRadius;
      const minDistSq = minDist * minDist;

      const curDistSq = (e.x - other.x) ** 2 + (e.z - other.z) ** 2;
      const nextDistSq = (testX - other.x) ** 2 + (testZ - other.z) ** 2;

      if (nextDistSq < minDistSq && nextDistSq < curDistSq) {
        return true;
      }
    }
    return false;
  }

  resolveEnemyCollisions() {
    const { engine } = this;
    const count = engine.enemies.length;
    for (let i = 0; i < count; i++) {
      const a = engine.enemies[i];
      if (!a) continue;
      const aRadius = a.isBoss ? 1.12 : 0.72;

      for (let j = i + 1; j < count; j++) {
        const b = engine.enemies[j];
        if (!b) continue;
        const bRadius = b.isBoss ? 1.12 : 0.72;
        const minDist = aRadius + bRadius;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          let nx = 1;
          let nz = 0;
          if (dist > 1e-4) {
            nx = dx / dist;
            nz = dz / dist;
          } else {
            const angle = ((a.id * 73 + b.id * 37) % 360) * (Math.PI / 180);
            nx = Math.cos(angle);
            nz = Math.sin(angle);
          }
          const overlap = minDist - dist;

          let aWeight = 0.5;
          let bWeight = 0.5;
          if (a.isBoss && !b.isBoss) {
            aWeight = 0.0;
            bWeight = 1.0;
          } else if (b.isBoss && !a.isBoss) {
            aWeight = 1.0;
            bWeight = 0.0;
          }

          if (aWeight > 0) {
            const pushAx = a.x - nx * overlap * aWeight;
            const pushAz = a.z - nz * overlap * aWeight;
            if (!engine.checkTankWallCollision(pushAx, a.z, aRadius, a.stats.canCrossWater)) {
              a.x = pushAx;
            }
            if (!engine.checkTankWallCollision(a.x, pushAz, aRadius, a.stats.canCrossWater)) {
              a.z = pushAz;
            }
          }

          if (bWeight > 0) {
            const pushBx = b.x + nx * overlap * bWeight;
            const pushBz = b.z + nz * overlap * bWeight;
            if (!engine.checkTankWallCollision(pushBx, b.z, bRadius, b.stats.canCrossWater)) {
              b.x = pushBx;
            }
            if (!engine.checkTankWallCollision(b.x, pushBz, bRadius, b.stats.canCrossWater)) {
              b.z = pushBz;
            }
          }
        }
      }
    }
  }

  checkTankWallCollision(x, z, radius, canCrossWater = false) {
    const { engine } = this;
    if (engine.defenseTurrets && engine.defenseTurrets.length > 0) {
      for (const t of engine.defenseTurrets) {
        if (t.alive && Math.hypot(x - t.x, z - t.z) < radius + t.radius) {
          return true;
        }
      }
    }

    const half = (GRID_SIZE * TILE_SIZE) / 2;
    if (
      x - radius < -half ||
      x + radius > half ||
      z - radius < -half ||
      z + radius > half
    ) {
      return true;
    }

    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(
      GRID_SIZE - 1,
      Math.floor((x + radius + half) / TILE_SIZE)
    );
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(
      GRID_SIZE - 1,
      Math.floor((z + radius + half) / TILE_SIZE)
    );

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = engine.grid[r]?.[c];
        if (!cell) continue;
        if (
          cell.type === TileType.BOXES || cell.type === TileType.BRICK ||
          cell.type === TileType.CONCRETE ||
          cell.type === TileType.BASE ||
          cell.type === TileType.ENEMY_BASE ||
          cell.type === TileType.HEDGEHOG ||
          cell.type === TileType.BARREL ||
          (cell.type === TileType.WATER && !canCrossWater)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  lerpAngle(current, target, alpha) {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * Math.min(1, alpha);
  }
}

