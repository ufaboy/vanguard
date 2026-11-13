/** Forest ignition, burning lifecycle, burn damage, and burnout to sand. */

import * as THREE from 'three';
import { TileType } from './types.js';
import { GRID_SIZE, TILE_SIZE } from './levels.js';
import { sound } from './sound.js';

export class ForestFireController {
  constructor(engine) {
    this.engine = engine;
  }

  checkAndIgniteOnEnemyKill(enemy) {
    const e = this.engine;
    const { row, col } = e.worldToGrid(enemy.x, enemy.z);
    const centerCell = e.grid[row]?.[col];
    const isInsideOrNearForest =
      centerCell?.type === TileType.FOREST || this.hasForestNearby(enemy.x, enemy.z, 1.1);

    if (isInsideOrNearForest) {
      const radius = enemy.isBoss ? 2.2 : 1.35;
      this.igniteAt(enemy.x, enemy.z, radius);
    }
  }

  hasForestNearby(x, z, radius) {
    const e = this.engine;
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + radius + half) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor((z + radius + half) / TILE_SIZE));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (e.grid[r]?.[c]?.type === TileType.FOREST) {
          const pos = e.gridToWorld(r, c);
          if (Math.hypot(pos.x - x, pos.z - z) <= radius + 0.6) return true;
        }
      }
    }
    return false;
  }

  igniteAt(x, z, radius = 1.35) {
    const e = this.engine;
    const half = (GRID_SIZE * TILE_SIZE) / 2;
    const minCol = Math.max(0, Math.floor((x - radius + half) / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + radius + half) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius + half) / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor((z + radius + half) / TILE_SIZE));

    let ignitedAny = false;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = e.grid[r]?.[c];
        if (!cell || cell.type !== TileType.FOREST || cell.isBurning) continue;

        const cellPos = e.gridToWorld(r, c);
        if (Math.hypot(cellPos.x - x, cellPos.z - z) <= radius + 0.6) {
          this.startBurning(cell, cellPos.x, cellPos.z);
          ignitedAny = true;
        }
      }
    }
    if (ignitedAny) {
      sound.playFlamethrower();
      e.screenShake = Math.max(e.screenShake, 0.45);
    }
  }

  startBurning(cell, x, z) {
    const e = this.engine;
    cell.isBurning = true;
    if (cell.mesh) {
      cell.mesh.userData.batchTile = false;
    }
    if (e.tileBatcher) {
      e.tileBatcher.sync();
    }

    e.burningForests.push({
      cell,
      x,
      z,
      timer: 10.0,
      maxTimer: 10.0,
    });
  }

  update(dt, _elapsed) {
    const e = this.engine;
    for (let i = e.burningForests.length - 1; i >= 0; i--) {
      const bf = e.burningForests[i];
      bf.timer -= dt;

      const progress = THREE.MathUtils.clamp(1 - bf.timer / bf.maxTimer, 0, 1);

      e.fx.flameJet(
        bf.x + (Math.random() - 0.5) * 1.2,
        0.35 + Math.random() * 0.4,
        bf.z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.6
      );

      if (Math.random() < 0.4) {
        e.fx.point('smoke', {
          x: bf.x + (Math.random() - 0.5) * 0.9,
          y: 0.7 + Math.random() * 0.6,
          z: bf.z + (Math.random() - 0.5) * 0.9,
          vx: (Math.random() - 0.5) * 0.25,
          vy: 0.9 + Math.random() * 0.9,
          vz: (Math.random() - 0.5) * 0.25,
          life: 1.2,
          size: 0.45,
          size1: 1.5,
          color: [0.15, 0.14, 0.13],
          alpha: 0.55,
          tex: 2,
          ramp: 3,
          fadeIn: 0.1,
          rotV: (Math.random() - 0.5) * 2,
        });
      }

      if (Math.random() < 0.08) {
        e.fx.flash(bf.x, 0.5, bf.z, 0xff5500, 1.8);
      }

      if (bf.cell.mesh) {
        const hScale = Math.max(0.12, 1 - progress * 0.75);
        const wScale = Math.max(0.3, 1 - progress * 0.45);
        bf.cell.mesh.scale.set(wScale, hScale, wScale);
      }

      const distPlayer = Math.hypot(e.playerX - bf.x, e.playerZ - bf.z);
      if (distPlayer < 1.15) {
        e.damagePlayer(2.5 * dt);
        if (Math.random() < 0.2) {
          e.spawnSparks(e.playerX, 0.8, e.playerZ, 0xff7700, 3);
        }
      }
      for (const enemy of e.enemies) {
        const distE = Math.hypot(enemy.x - bf.x, enemy.z - bf.z);
        if (distE < 1.15) {
          enemy.hp -= 2.5 * dt;
          if (enemy.hp <= 0.0001) {
            e.damageEnemy(enemy, 1);
          }
        }
      }

      if (bf.timer <= 0) {
        bf.cell.isBurning = false;

        if (bf.cell.mesh) {
          e.mapGroup.remove(bf.cell.mesh);
          bf.cell.mesh = null;
        }

        bf.cell.type = TileType.SAND;

        const sandMesh = e.modelFactory.createSandBlock(bf.x, bf.z);
        e.mapGroup.add(sandMesh);
        bf.cell.mesh = sandMesh;

        e.fx.blockDestroyed(bf.x, bf.z, 'forest');
        e.fx.flash(bf.x, 0.4, bf.z, 0xffaa44, 2.0);

        if (e.tileBatcher) {
          e.tileBatcher.sync();
        }

        e.burningForests.splice(i, 1);
      }
    }
  }
}

