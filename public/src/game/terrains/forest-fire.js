/** Forest ignition, burning lifecycle, burn damage, and burnout to sand. */

import * as THREE from 'three';
import { TileType } from '../types.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { syncCellType } from './layers.js';

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

    e.burningForests.push({
      cell,
      x,
      z,
      timer: 10.0,
      maxTimer: 10.0,
      houseBurnCooldown: 1.0,
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

      if (!bf.spreadOil && progress >= 0.05) {
        bf.spreadOil = true;
        const r = bf.cell?.row;
        const c = bf.cell?.col;
        if (r != null && c != null) {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nb = e.grid?.[r + dr]?.[c + dc];
            if (nb && (nb.surface === TileType.OIL_SLICK || nb.type === TileType.OIL_SLICK) && !nb.isBurning) {
              e.terrainDestruction?.igniteOilSlick?.(nb);
            }
          }
        }
      }

      if (!bf.spreadForest && progress >= 0.22) {
        bf.spreadForest = true;
        const r = bf.cell?.row;
        const c = bf.cell?.col;
        if (r != null && c != null) {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nb = e.grid?.[r + dr]?.[c + dc];
            if (nb && nb.type === TileType.FOREST && !nb.isBurning) {
              const nbPos = e.gridToWorld(nb.row, nb.col);
              this.startBurning(nb, nbPos.x, nbPos.z);
            }
          }
        }
      }

      bf.houseBurnCooldown = (bf.houseBurnCooldown ?? 1.0) - dt;
      if (bf.houseBurnCooldown <= 0) {
        bf.houseBurnCooldown += 1.2;
        const r = bf.cell?.row;
        const c = bf.cell?.col;
        if (r != null && c != null) {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nb = e.grid?.[r + dr]?.[c + dc];
            if (!nb || (nb.type !== TileType.HOUSE_1 && nb.type !== TileType.HOUSE_2) || nb.hp <= 0) {
              continue;
            }
            const nbPos = e.gridToWorld(nb.row, nb.col);
            e.damageTileCell?.(nb, 3, nbPos.x, nbPos.z, false);
          }
        }
      }

      if (bf.cell.mesh) {
        const hScale = Math.max(0.12, 1 - progress * 0.75);
        const wScale = Math.max(0.3, 1 - progress * 0.45);
        bf.cell.mesh.scale.set(wScale, hScale, wScale);
      }

      const distPlayer = Math.hypot(e.playerX - bf.x, e.playerZ - bf.z);
      if (distPlayer < 1.15) {
        e.damagePlayer(2.5 * dt, null, 'fire');
        if (Math.random() < 0.2) {
          e.spawnSparks(e.playerX, 0.8, e.playerZ, 0xff7700, 3);
        }
      }
      for (let ei = e.enemies.length - 1; ei >= 0; ei--) {
        if (ei >= e.enemies.length) continue;
        const enemy = e.enemies[ei];
        if (!enemy || enemy.hp <= 0) continue;
        const distE = Math.hypot(enemy.x - bf.x, enemy.z - bf.z);
        if (distE < 1.15) {
          e.damageEnemy(enemy, 2.5 * dt);
        }
      }

      if (bf.timer <= 0) {
        bf.cell.isBurning = false;

        if (bf.cell.mesh) {
          e.mapGroup.remove(bf.cell.mesh);
          bf.cell.mesh = null;
        }
        if (bf.cell.surfaceMesh) {
          e.mapGroup.remove(bf.cell.surfaceMesh);
          bf.cell.surfaceMesh = null;
        }

        bf.cell.object = null;
        bf.cell.surface = TileType.SAND;
        syncCellType(bf.cell);

        const sandMesh = e.modelFactory.createSandBlock(bf.x, bf.z);
        e.mapGroup.add(sandMesh);
        bf.cell.surfaceMesh = sandMesh;
        bf.cell.mesh = sandMesh;

        e.fx.blockDestroyed(bf.x, bf.z, 'forest');
        e.fx.flash(bf.x, 0.4, bf.z, 0xffaa44, 2.0);

        const last = e.burningForests.length - 1;
        if (i !== last) e.burningForests[i] = e.burningForests[last];
        e.burningForests.pop();
      }
    }
  }
}

