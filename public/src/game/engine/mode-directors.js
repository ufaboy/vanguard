/** Survival wave director and Contract mission director (cargo, sabotage, extraction). */

import { DURABILITY } from '../constants.js';
import { GameStatus, TileType } from '../types.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { sound } from '../sound.js';
import { createSquadDirector } from '../../sim/behavior/index.js';
import {
  CARGO_STATUS,
  CONTRACT_TIMING,
  CONTRACT_TYPES,
  LAST_CARGO_GATES,
  buildContractHudSnapshot,
  commitContractCargoDelivery,
  startCargoLoading,
  startContractExtraction,
  stepContractCargo,
  stepContractScheduler,
} from '../../sim/contract.js';
import { SURVIVAL_CONFIG, buildSurvivalWaveSpec } from '../../sim/survival.js';

export class SurvivalDirector {
  constructor(engine) {
    this.engine = engine;
  }

  startWave(waveNumber = 1, isEarlyCall = false) {
    const e = this.engine;
    if (!e.survivalState) return;
    const spec = buildSurvivalWaveSpec(waveNumber);
    e.survivalState.wave = spec.wave;
    e.survivalState.phase = 'combat';
    e.survivalState.intermissionTimer = 0;
    e.survivalState.waveSpec = spec;
    e.survivalState.nextWaveSpec = buildSurvivalWaveSpec(spec.wave + 1);

    e.enemySpawnQueue = [...spec.roster];
    e.vanguardRemainingToSpawn = e.enemySpawnQueue.length;
    e.bossSpawned = false;
    e.spawnTimer = 0.7;
    e.squadDirector = createSquadDirector({ maxAttackers: spec.maxAttackers });

    if (spec.wave >= 2) {
      this.spawnWaveSupplies(
        SURVIVAL_CONFIG.SUPPLY_CRATES_PER_WAVE,
        SURVIVAL_CONFIG.BARRELS_PER_WAVE
      );
    }

    const openingBatch = Math.min(3, spec.maxConcurrentEnemies, e.vanguardRemainingToSpawn);
    for (let i = 0; i < openingBatch; i++) {
      e.spawnVanguardEnemy();
    }

    if (isEarlyCall) {
      e.setStatusBanner(
        `WAVE ${spec.wave}: ${spec.title} (+$${SURVIVAL_CONFIG.EARLY_CALL_BONUS} EARLY CALL BONUS)`,
        3.6
      );
    } else if (spec.isBossWave) {
      sound.playBossAlarm();
      e.setStatusBanner(
        `⚠ BOSS WAVE ${spec.wave}: ${spec.bossName} & ESCORT INBOUND!`,
        4.2
      );
    } else {
      e.setStatusBanner(
        `WAVE ${spec.wave}: ${spec.title} (${spec.totalHostiles} HOSTILES)`,
        3.4
      );
    }
    e.emitHudUpdate();
  }

  spawnWaveSupplies(crateCount = 3, barrelCount = 2) {
    const e = this.engine;
    let cratesPlaced = 0;
    for (let attempt = 0; attempt < 60 && cratesPlaced < crateCount; attempt++) {
      const r = 6 + Math.floor(Math.random() * (GRID_SIZE - 12));
      const c = 3 + Math.floor(Math.random() * (GRID_SIZE - 6));
      const cell = e.grid[r]?.[c];
      if (!cell || cell.type !== TileType.EMPTY) continue;
      const { x, z } = e.gridToWorld(r, c);
      if (Math.hypot(e.playerX - x, e.playerZ - z) < 3.5) continue;
      if (e.enemies.some((enemy) => Math.hypot(enemy.x - x, enemy.z - z) < 3.0)) continue;
      const mesh = e.modelFactory.createBoxesBlock();
      mesh.position.set(x, 0, z);
      e.mapGroup.add(mesh);
      cell.type = TileType.BOXES;
      cell.hp = 2;
      cell.maxHp = 2;
      cell.mesh = mesh;
      cell.subMeshes = undefined;
      cratesPlaced++;
    }

    let barrelsPlaced = 0;
    for (let attempt = 0; attempt < 40 && barrelsPlaced < barrelCount; attempt++) {
      const r = 5 + Math.floor(Math.random() * (GRID_SIZE - 12));
      const c = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      const cell = e.grid[r]?.[c];
      if (!cell || cell.type !== TileType.EMPTY) continue;
      const { x, z } = e.gridToWorld(r, c);
      if (Math.hypot(e.playerX - x, e.playerZ - z) < 4.5) continue;
      if (e.enemies.some((enemy) => Math.hypot(enemy.x - x, enemy.z - z) < 3.0)) continue;
      const barrel = e.modelFactory.createBarrelBlock();
      barrel.position.set(x, 0, z);
      e.mapGroup.add(barrel);
      cell.type = TileType.BARREL;
      cell.hp = 1;
      cell.maxHp = 1;
      cell.mesh = barrel;
      cell.subMeshes = undefined;
      cell._exploding = false;
      barrelsPlaced++;
    }
    e.tileBatcher?.sync();
  }

  onWaveCleared() {
    const e = this.engine;
    if (!e.survivalState || e.survivalState.phase === 'intermission') return;
    const spec = e.survivalState.waveSpec;
    e.survivalState.wavesCleared = e.survivalState.wave;
    const reward = spec?.waveRewardCredits || 300;
    if (e.playerSave) {
      e.playerSave.credits = (e.playerSave.credits || 0) + reward;
    }
    e.creditsEarnedThisMission = (e.creditsEarnedThisMission || 0) + reward;
    e.survivalState.lastWaveReward = reward;

    if (spec?.isBossWave && e.baseAlive) {
      e.setBasePerimeterMaterial(TileType.CONCRETE);
    }

    e.survivalState.phase = 'intermission';
    e.survivalState.intermissionTimer = SURVIVAL_CONFIG.INTERMISSION_SEC;
    e.survivalState.intermissionDuration = SURVIVAL_CONFIG.INTERMISSION_SEC;
    sound.playPowerUp();
    e.setStatusBanner(
      `WAVE ${e.survivalState.wave} CLEARED! +$${reward} CREDITS · 15s REARM INTERMISSION ([N] CALL NEXT WAVE +$${SURVIVAL_CONFIG.EARLY_CALL_BONUS})`,
      4.5
    );
    e.emitHudUpdate();
  }

  callNextWave() {
    const e = this.engine;
    if (
      !e.survivalState ||
      e.survivalState.phase !== 'intermission' ||
      e.status !== GameStatus.PLAYING
    ) {
      return false;
    }
    const bonus = SURVIVAL_CONFIG.EARLY_CALL_BONUS;
    if (e.playerSave) {
      e.playerSave.credits = (e.playerSave.credits || 0) + bonus;
    }
    e.creditsEarnedThisMission = (e.creditsEarnedThisMission || 0) + bonus;
    e.survivalState.earlyWaveCalls = (e.survivalState.earlyWaveCalls || 0) + 1;
    sound.playPowerUp();
    this.startWave(e.survivalState.wave + 1, true);
    return true;
  }
}

export class ContractDirector {
  constructor(engine) {
    this.engine = engine;
  }

  spawnEnemy(enemyClass, assignment, groupEntry) {
    const e = this.engine;
    const gateIds = [
      assignment?.gateId,
      groupEntry?.primaryGateId,
      groupEntry?.secondaryGateId,
    ].filter(Boolean);
    const uniqueGateIds = [...new Set(gateIds)];

    for (const gateId of uniqueGateIds) {
      const gate = LAST_CARGO_GATES[gateId];
      if (!gate) continue;
      for (const dc of [0, -1, 1]) {
        const col = gate.col + dc;
        const entryRow = gate.entryTarget?.row ?? 3;
        const cell = e.grid[0]?.[col];
        if (!cell || cell.type !== TileType.EMPTY) continue;
        const borderPos = e.gridToWorld(0, col);
        // Never spawn near the player or on top of an existing enemy
        if (Math.hypot(e.playerX - borderPos.x, e.playerZ - borderPos.z) < 10.0) continue;
        if (e.enemies.some((enemy) => Math.hypot(enemy.x - borderPos.x, enemy.z - borderPos.z) < 2.3)) continue;

        const targetPos = e.gridToWorld(entryRow, col);
        const spawnZ = -((GRID_SIZE * TILE_SIZE) / 2) - 2.8;
        e.createEnemyAt(enemyClass, borderPos.x, spawnZ, false, targetPos);
        const spawned = e.enemies.at(-1);
        if (spawned) {
          spawned.campaignPatrolRoute = assignment?.patrolRoute || [{ row: entryRow, col }];
          spawned.contractHomeZone = assignment?.homeZone || null;
          spawned.contractAssignment = assignment || null;
        }
        return true;
      }
    }
    return false;
  }

  isPlayerMoving() {
    const e = this.engine;
    const moveKeysPressed = Boolean(
      e.keys.KeyW ||
        e.keys.ArrowUp ||
        e.keys.KeyS ||
        e.keys.ArrowDown ||
        e.keys.KeyA ||
        e.keys.ArrowLeft ||
        e.keys.KeyD ||
        e.keys.ArrowRight
    );
    return moveKeysPressed || Math.abs(e.playerForwardSpeed || 0) > 0.15;
  }

  startCargoLoad() {
    const e = this.engine;
    if (!e.contractState || e.status !== GameStatus.PLAYING) return false;
    const isSabotage = e.contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const res = startCargoLoading(
      e.contractState,
      e.playerX,
      e.playerZ,
      this.isPlayerMoving(),
      TILE_SIZE
    );
    if (res.started && !res.alreadyLoading) {
      sound.playCargoLoad();
      e.setStatusBanner(
        isSabotage
          ? 'ARMING DEMOLITION CHARGE — HOLD POSITION FOR 2.5s!'
          : 'LOADING DATA CONTAINER — HOLD POSITION FOR 2.0s',
        2.2
      );
      e.emitHudUpdate();
      return true;
    }
    if (!res.started && res.reason) {
      e.setStatusBanner(res.reason.toUpperCase(), 2.0);
    }
    return false;
  }

  startExtract() {
    const e = this.engine;
    if (!e.contractState || e.status !== GameStatus.PLAYING) return false;
    const res = startContractExtraction(e.contractState, e.playerX, e.playerZ);
    if (res.started && !res.alreadyActive) {
      sound.playContractExtract();
      e.setStatusBanner('EXTRACTION INITIATED — STAY ON PAD FOR 3.0s!', 3.0);
      e.emitHudUpdate();
      return true;
    }
    if (!res.started && res.reason) {
      e.setStatusBanner(res.reason.toUpperCase(), 2.0);
    }
    return false;
  }

  interactObjective() {
    const e = this.engine;
    if (!e.contractState || e.status !== GameStatus.PLAYING) return false;
    const isSabotage = e.contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const snap = buildContractHudSnapshot(e.contractState, e.playerX, e.playerZ, TILE_SIZE);
    if (snap?.canLoadCargo) {
      return this.startCargoLoad();
    }
    if (snap?.canExtract) {
      return this.startExtract();
    }
    if (snap?.armedCargo) {
      e.setStatusBanner('CHARGE ARMED — CLEAR THE 3-CELL BLAST ZONE BEFORE DETONATION!', 2.4);
    } else if (snap?.carriedCargo) {
      e.setStatusBanner('DRIVE ONTO THE SOUTHERN DELIVERY PAD AND HOLD FOR 2.0s TO UNLOAD', 2.4);
    } else {
      e.setStatusBanner(
        isSabotage
          ? 'STOP WITHIN 1.5 CELLS OF A RADAR RELAY AND PRESS [E] TO PLANT CHARGE'
          : 'STOP WITHIN 1.5 CELLS OF A DATA CONTAINER AND PRESS [E] TO LOAD',
        2.4
      );
    }
    return false;
  }

  detonateSabotageRelay(relay) {
    const e = this.engine;
    if (!relay) return;
    const { x, z, row, col } = relay;
    sound.playEnvironmentalExplosion({ x, z });
    e.screenShake = Math.max(e.screenShake, 0.9);
    e.fx.explosion(x, 0.7, z, { scale: 2.25, boss: true, tint: 0xa855f7 });
    e.fx.shockwave(x, 0.12, z, 0.5, 6.2, 0xc084fc, 0.55);
    e.fx.scorch(x, z, 3.2);
    e.fx.sparks(x, 0.7, z, 0xe879f9, 32, { speed: 2.8, up: 1.8 });

    const blastRadius = CONTRACT_TIMING.BLAST_RADIUS_CELLS * TILE_SIZE;
    const maxDamage = 42;

    for (let i = e.enemies.length - 1; i >= 0; i--) {
      const enemy = e.enemies[i];
      if (!enemy || enemy.hp <= 0) continue;
      const dist = Math.hypot(enemy.x - x, enemy.z - z);
      if (dist <= blastRadius) {
        const falloff = 1 - (dist / blastRadius) * 0.45;
        const dmg = Math.round(maxDamage * Math.max(0.45, falloff));
        e.damageEnemy(enemy, dmg, x, z);
        e.fx.armorHit(enemy.x, 0.6, enemy.z, { scale: 1.35, colorHex: 0xc084fc });
      }
    }

    if (e.playerHp > DURABILITY.ZERO_HP) {
      const pDist = Math.hypot(e.playerX - x, e.playerZ - z);
      if (pDist <= blastRadius) {
        const falloff = 1 - (pDist / blastRadius) * 0.5;
        const dmg = Math.round(32 * Math.max(0.35, falloff));
        e.damagePlayer(dmg);
        e.fx.armorHit(e.playerX, 0.6, e.playerZ, { scale: 1.35, colorHex: 0xef4444 });
      }
    }

    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.hypot(dr, dc) > 2.3) continue;
        const neighbor = e.grid[row + dr]?.[col + dc];
        if (!neighbor || neighbor.type === TileType.EMPTY) continue;
        const nPos = e.gridToWorld(neighbor.row, neighbor.col);
        if (neighbor.type === TileType.BRICK || neighbor.type === TileType.FOREST) {
          e.destroyTileCell(neighbor);
        } else if (neighbor.type === TileType.CONCRETE) {
          e.damageTileCell(neighbor, 6, nPos.x, nPos.z);
        } else if (neighbor.type === TileType.BARREL && !neighbor._exploding) {
          e.explodeBarrel(neighbor, true);
        }
      }
    }
  }

  update(dt, elapsed) {
    const e = this.engine;
    if (!e.contractState) return;
    const isSabotage = e.contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const isMoving = this.isPlayerMoving();
    const events = stepContractCargo(e.contractState, dt, {
      playerX: e.playerX,
      playerZ: e.playerZ,
      isMoving,
      tileSize: TILE_SIZE,
    });

    if (events.loadCancelled) {
      e.setStatusBanner(
        isSabotage
          ? 'CHARGE ARMING CANCELLED — REMAIN STATIONARY WITHIN 1.5 CELLS'
          : 'CARGO LOADING CANCELLED — REMAIN STATIONARY WITHIN 1.5 CELLS',
        2.2
      );
      e.emitHudUpdate();
    }

    if (events.armedCargo) {
      sound.playBossAlarm();
      const extra =
        events.triggeredGroup === 'G1'
          ? ' · STEALTH HUNTERS alerted!'
          : events.triggeredGroup
          ? ` · ${events.triggeredGroup} QRF INBOUND!`
          : '';
      e.setStatusBanner(
        `CHARGE ARMED ON ${events.armedCargo.name.toUpperCase()} — DETONATION IN 8.0s! CLEAR 3-CELL RADIUS!${extra}`,
        4.2
      );
      e.emitHudUpdate();
    }

    if (events.loadedCargo) {
      sound.playCargoLoad();
      const extra =
        events.triggeredGroup === 'G1'
          ? ' · TERMINAL ALARM TRIGGERED!'
          : events.triggeredGroup
          ? ` · ${events.triggeredGroup} REINFORCEMENTS QUEUED!`
          : '';
      e.setStatusBanner(
        `${events.loadedCargo.name.toUpperCase()} LOADED — RETURN TO SOUTH DELIVERY PAD${extra}`,
        3.6
      );
      e.emitHudUpdate();
    }

    if (events.unloadReset) {
      e.setStatusBanner('UNLOADING RESET — REMAIN ON DELIVERY PAD FOR 2.0s', 2.2);
      e.emitHudUpdate();
    }

    if (events.detonatedCargo) {
      this.detonateSabotageRelay(events.detonatedCargo);
    }

    if (events.deliveredCargo) {
      if (!events.detonatedCargo) {
        sound.playCargoDeliver();
      }
      const payout = commitContractCargoDelivery(
        e.playerSave,
        e.activeMissionRun,
        events.deliveredCargo.id
      );
      if (payout.paid) {
        events.deliveredCargo.rewardPaid = true;
        e.creditsEarnedThisMission = (e.creditsEarnedThisMission || 0) + payout.amount;
        e.saveRepo.savePlayerSave(e.playerSave);
        e.syncCampaignCredits();
      }
      const delivered = e.contractState.deliveredCount;
      const objLabel = isSabotage ? 'RELAY' : 'CARGO';
      const actionVerb = isSabotage ? 'DEMOLISHED' : 'DELIVERED';
      if (delivered === 1) {
        e.setStatusBanner(
          `${objLabel} ${events.deliveredCargo.code} ${actionVerb} (+$${payout.amount} SECURED) — 1/2 ${actionVerb}!`,
          3.6
        );
      } else if (delivered === 2) {
        e.setStatusBanner(
          `${objLabel} ${events.deliveredCargo.code} ${actionVerb} (+$${payout.amount} SECURED) — EXTRACTION READY [E] OR RISK 3RD ${objLabel} (+$4,000)!`,
          4.5
        );
      } else {
        e.setStatusBanner(
          `ALL 3 ${objLabel}S ${actionVerb} (+$${payout.amount} SECURED) — HEAD SOUTH TO EXTRACTION PAD [E]!`,
          4.5
        );
      }
      e.emitHudUpdate();
    }

    if (events.extractCancelled) {
      e.setStatusBanner('EXTRACTION CANCELLED — REMAIN ON THE EXTRACTION PAD!', 2.4);
      e.emitHudUpdate();
    }

    if (events.extracted) {
      sound.playContractExtract();
      e.triggerMissionVictory(
        e.contractState.deliveredCount >= 3
          ? isSabotage
            ? 'BLACKOUT PROTOCOL COMPLETE — ALL 3 RELAYS DEMOLISHED & BONUS SECURED!'
            : 'FULL CONTRACT EXTRACTION COMPLETE — ALL 3 CONTAINERS & BONUS SECURED!'
          : isSabotage
          ? 'BLACKOUT PROTOCOL COMPLETE — RADAR RELAYS DEMOLISHED!'
          : 'CONTRACT EXTRACTION COMPLETE — DATA CONTAINERS SECURED!'
      );
      return;
    }

    stepContractScheduler(
      e.contractState,
      dt,
      e.enemies.length,
      (unitType, assignment, groupEntry) => this.spawnEnemy(unitType, assignment, groupEntry),
      (group) => {
        sound.playBossAlarm();
        const gateLabel = LAST_CARGO_GATES[group.primaryGateId]?.label || 'NORTH GATE';
        e.setStatusBanner(`${group.label} · ${gateLabel} IN 6s`, 3.6);
      }
    );
    e.vanguardRemainingToSpawn =
      e.contractState.scheduler.totalBudget - e.contractState.scheduler.totalSpawned;

    // Update 3D visuals for containers / relays, carried indicator, and delivery pad
    if (e.contractCargoMeshes) {
      for (const c of e.contractState.containers) {
        const mesh = e.contractCargoMeshes.get(c.id);
        if (!mesh) continue;
        const isArmed = c.status === CARGO_STATUS.ARMED;
        const visible =
          c.status === CARGO_STATUS.AVAILABLE ||
          c.status === CARGO_STATUS.LOADING ||
          isArmed;
        mesh.visible = visible;
        if (visible && mesh.userData) {
          if (mesh.userData.dataCrest) {
            mesh.userData.dataCrest.rotation.y = elapsed * (isArmed ? 9.5 : 2.2);
          }
          if (mesh.userData.ringMat) {
            mesh.userData.ringMat.opacity =
              c.status === CARGO_STATUS.LOADING || isArmed
                ? 0.55 + Math.sin(elapsed * 16) * 0.4
                : 0.85;
          }
          if (mesh.userData.blastRing && mesh.userData.blastRingMat) {
            mesh.userData.blastRing.visible = isArmed;
            if (isArmed) {
              mesh.userData.blastRingMat.opacity = 0.45 + Math.sin(elapsed * 18) * 0.35;
            }
          }
        }
      }
    }

    if (e.carriedCargoIndicator) {
      const isCarrying = Boolean(e.contractState.carriedCargoId);
      e.carriedCargoIndicator.visible = isCarrying;
      if (isCarrying && e.carriedCargoIndicator.userData?.diamond) {
        e.carriedCargoIndicator.userData.diamond.rotation.y = elapsed * 2.6;
      }
    }

    if (e.contractPadMesh?.userData?.borderMat) {
      const mat = e.contractPadMesh.userData.borderMat;
      if (e.contractState.extraction.available) {
        mat.color.setHex(0x10b981);
        mat.emissive.setHex(0x059669);
      } else if (e.contractState.carriedCargoId) {
        mat.color.setHex(0xf59e0b);
        mat.emissive.setHex(0xd97706);
      } else {
        mat.color.setHex(0x38bdf8);
        mat.emissive.setHex(0x0284c7);
      }
    }
  }
}

