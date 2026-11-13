/** 3D Codex turntable stage, showcase item loading, and live effect demos. */

import * as THREE from 'three';
import { EnemyClass } from '../public/src/game/types.js';
import { createProjectileVisual, createMissileVisual, animateMissileVisual } from '../public/src/game/fx.js';
import { sound } from '../public/src/game/sound.js';

export class CodexStage {
  constructor(engine) {
    this.engine = engine;
  }

  setup() {
    const e = this.engine;
    e.codexGroup.visible = false;

    const floorMat = new THREE.MeshStandardMaterial({
      map: e.modelFactory.groundTex,
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.18,
    });
    const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(18, 48), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.26;
    floorMesh.receiveShadow = true;
    e.codexGroup.add(floorMesh);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.72,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      metalness: 0.85,
    });
    const pedestalOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(3.45, 3.85, 0.24, 24),
      rimMat
    );
    pedestalOuter.position.y = -0.13;
    pedestalOuter.receiveShadow = true;
    e.codexGroup.add(pedestalOuter);

    const pedestalTop = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.35, 0.06, 24),
      baseMat
    );
    pedestalTop.position.y = -0.03;
    pedestalTop.receiveShadow = true;
    e.codexGroup.add(pedestalTop);

    const ringGeo = new THREE.RingGeometry(2.95, 3.08, 48);
    ringGeo.rotateX(-Math.PI / 2);
    e.codexRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, e.codexRingMat);
    ringMesh.position.y = 0.01;
    e.codexGroup.add(ringMesh);

    const innerRingGeo = new THREE.RingGeometry(1.85, 1.9, 36);
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.position.y = 0.01;
    e.codexGroup.add(innerRing);

    e.codexGroup.add(e.codexStageGroup);
    e.codexGroup.add(e.codexFxGroup);
  }

  setMode(enabled, item = null, previewUpgrades = null) {
    const e = this.engine;
    e.codexOpen = Boolean(enabled);
    if (previewUpgrades) {
      e.codexPreviewUpgrades = {
        ...e.codexPreviewUpgrades,
        ...previewUpgrades,
      };
    } else if (e.codexOpen && !item) {
      e.codexPreviewUpgrades = {
        ...e.upgrades,
        aps: true,
        missile: true,
      };
    }

    e.mapGroup.visible = !e.codexOpen;
    e.entityGroup.visible = !e.codexOpen;
    e.fxGroup.visible = !e.codexOpen;
    e.fx.root.visible = !e.codexOpen;
    if (e.groundMesh) e.groundMesh.visible = !e.codexOpen;
    if (e.perimeterMesh) e.perimeterMesh.visible = !e.codexOpen;
    if (e.aimReticle) e.aimReticle.visible = !e.codexOpen;
    e.codexGroup.visible = e.codexOpen;

    if (e.codexOpen) {
      e.frustumSize = 10.2;
      e.handleResize();
      if (item) {
        this.loadShowcaseItem(item);
      }
    } else {
      e.clearGroup(e.codexStageGroup);
      e.clearGroup(e.codexFxGroup);
      e._codexFx?.clear();
      if (e.inspectMode) {
        e.frustumSize = 11.5;
        e.handleResize();
      } else {
        e.cycleCameraPreset(e.cameraPreset);
      }
    }
    e.syncAudioPauseState();
  }

  updatePreviewUpgrades(previewUpgrades) {
    const e = this.engine;
    e.codexPreviewUpgrades = {
      ...e.codexPreviewUpgrades,
      ...previewUpgrades,
    };
    if (e.codexOpen && e.codexItem?.isPlayerMbt && e.codexTankRig) {
      const hoverActive =
        (e.codexPreviewUpgrades.chassis || 1) >= 5;
      const apsArr = e.codexPreviewUpgrades.aps ? [3, 3, 3, 3] : [0, 0, 0, 0];
      const missileCount = e.codexPreviewUpgrades.missile ? 4 : 0;
      e.modelFactory.updatePlayerTankVisuals(
        e.codexTankRig,
        e.codexPreviewUpgrades,
        hoverActive,
        missileCount,
        apsArr,
        0,
        e.clock ? e.clock.getElapsed() : 0
      );
    }
  }

  loadShowcaseItem(item) {
    const e = this.engine;
    if (!item) return;
    e.codexItem = item;
    e.clearGroup(e.codexStageGroup);
    e.clearGroup(e.codexFxGroup);
    e._codexFx?.clear();
    e.codexMines = null;
    e.codexMissile = null;
    e.codexArcPrev = 0;
    e.codexTankRig = null;
    e.codexSecondaryRig = null;
    e.codexHazardRing = null;
    e.codexHazardFill = null;
    e.codexArcShell = null;
    e.codexDemoTimer = 0.6;
    e.codexRecoil = 0;
    e.codexBarrelRecoils = [0, 0];
    e.codexNextBarrel = 0;
    e.codexFlashTimer = 0;

    if (e.codexRingMat && item.accentHex) {
      e.codexRingMat.color.set(item.accentHex);
    }

    if (item.category === 'TANKS') {
      if (item.isPlayerMbt) {
        e.codexTankRig = e.modelFactory.createPlayerTank();
        e.codexStageGroup.add(e.codexTankRig.root);
        this.updatePreviewUpgrades(e.codexPreviewUpgrades);
      } else if (item.enemyClass) {
        e.codexTankRig = e.modelFactory.createEnemyTank(item.enemyClass);
        e.codexStageGroup.add(e.codexTankRig.root);
      }
    } else if (item.category === 'SURFACES') {
      if (item.turretType) {
        const rig = e.modelFactory.createDefenseTurretRig(item.turretType);
        rig.root.position.set(0, 0, 0);
        rig.root.scale.setScalar(1.25);
        if (rig.hpBarBg) rig.hpBarBg.visible = false;
        if (rig.hpBarFill) rig.hpBarFill.visible = false;
        e.codexStageGroup.add(rig.root);
        e.codexTankRig = rig;
        return;
      }
      const offsets = [
        { x: -1.05, z: -1.05 },
        { x: 1.05, z: -1.05 },
        { x: -1.05, z: 1.05 },
        { x: 1.05, z: 1.05 },
      ];
      offsets.forEach((pos, idx) => {
        let block = null;
        if (item.surfaceType === 'BRICK') {
          const brick = e.modelFactory.createBrickBlock();
          if (idx === 1) e.modelFactory.updateBrickBlockDamage(brick.group, 2);
          block = brick.group;
        } else if (
          item.surfaceType === 'CONCRETE' ||
          item.surfaceType === 'STEEL'
        ) {
          block = e.modelFactory.createConcreteBlock();
          if (idx === 1) {
            e.modelFactory.updateConcreteBlockDamage(block, 12, 16);
          } else if (idx === 3) {
            e.modelFactory.updateConcreteBlockDamage(block, 6, 16);
          }
        } else if (item.surfaceType === 'FOREST') {
          block = e.modelFactory.createForestBlock();
        } else if (item.surfaceType === 'WATER') {
          if (idx === 0) e.codexStageGroup.add(e.modelFactory.createWaterBlock([[1, 1], [1, 1]]));
          return;
        } else if (item.surfaceType === 'ICE') {
          if (idx === 0) e.codexStageGroup.add(e.modelFactory.createIceBlock([[1, 1], [1, 1]]));
          return;
        } else if (item.surfaceType === 'BASE') {
          if (idx === 0) {
            const hq = e.modelFactory.createCommandBaseBlock();
            hq.position.set(0, 0, 0.7);
            hq.scale.setScalar(0.9);
            e.codexStageGroup.add(hq);

            // The concrete line that covers the HQ from the enemy side, one free lane away.
            for (const x of [-0.9, 0.9]) {
              const concrete = e.modelFactory.createConcreteBlock();
              concrete.position.set(x, 0, -1.6);
              concrete.scale.setScalar(0.8);
              e.codexStageGroup.add(concrete);
            }
          }
          return;
        } else if (item.surfaceType === 'HEDGEHOG') {
          block = e.modelFactory.createHedgehogBlock();
        } else if (item.surfaceType === 'BOXES') {
          block = e.modelFactory.createBoxesBlock();
          if (idx > 0) e.modelFactory.updateBoxesDamage(block, 1);
        } else if (item.surfaceType === 'BARREL') {
          block = e.modelFactory.createBarrelBlock();
        } else if (item.surfaceType === 'ENEMY_BASE') {
          if (idx === 0) {
            const citadel = e.modelFactory.createEnemyBaseBlock();
            citadel.position.set(0, -0.2, 0.4);
            citadel.scale.setScalar(0.95);
            e.codexStageGroup.add(citadel);

            const leftConcrete = e.modelFactory.createConcreteBlock();
            leftConcrete.position.set(-1.6, 0, -1.1);
            leftConcrete.scale.setScalar(0.8);
            e.codexStageGroup.add(leftConcrete);

            const rightConcrete = e.modelFactory.createConcreteBlock();
            rightConcrete.position.set(1.6, 0, -1.1);
            rightConcrete.scale.setScalar(0.8);
            e.codexStageGroup.add(rightConcrete);
          }
          return;
        }
        if (block) {
          block.position.set(pos.x, 0, pos.z);
          e.codexStageGroup.add(block);
        }
      });
    } else if (item.category === 'POWERUPS') {
      const crate = e.modelFactory.createPowerUpMesh(item.powerupType);
      crate.scale.setScalar(1.5);
      crate.position.set(0, 0.35, 0);
      e.codexStageGroup.add(crate);
      e.codexTankRig = { root: crate, isCrate: true };
    } else if (item.category === 'EFFECTS') {
      this.setupEffectScene(item.effectType);
    }
  }

  setupEffectScene(effectType) {
    const e = this.engine;
    if (effectType === 'CANNON') {
      e.codexTankRig = e.modelFactory.createPlayerTank();
      e.codexTankRig.root.position.set(-1.35, 0, 0);
      e.codexTankRig.hull.rotation.y = Math.PI / 2;
      e.codexTankRig.turret.rotation.y = Math.PI / 2;
      e.modelFactory.updatePlayerTankVisuals(
        e.codexTankRig,
        { cannon: 4, vehicleFrame: 3, engine: 3, armor: 3 },
        false,
        2,
        [1, 1, 1, 1],
        0,
        0
      );
      e.codexStageGroup.add(e.codexTankRig.root);

      const targetConcrete = e.modelFactory.createConcreteBlock();
      e.modelFactory.updateConcreteBlockDamage(targetConcrete, 7, 16);
      targetConcrete.position.set(1.65, 0, 0);
      e.codexStageGroup.add(targetConcrete);
    } else if (effectType === 'MISSILE') {
      e.codexTankRig = e.modelFactory.createPlayerTank();
      e.codexTankRig.root.position.set(-1.35, 0, 0);
      e.codexTankRig.hull.rotation.y = Math.PI / 2;
      e.codexTankRig.turret.rotation.y = Math.PI / 2;
      e.modelFactory.updatePlayerTankVisuals(
        e.codexTankRig,
        { cannon: 3, vehicleFrame: 2, engine: 3, armor: 3 },
        false,
        4,
        [1, 1, 1, 1],
        0,
        0
      );
      e.codexStageGroup.add(e.codexTankRig.root);

      e.codexSecondaryRig = e.modelFactory.createEnemyTank(EnemyClass.HEAVY);
      e.codexSecondaryRig.root.position.set(1.55, 0, 0);
      e.codexSecondaryRig.hull.rotation.y = -Math.PI / 2;
      e.codexSecondaryRig.turret.rotation.y = -Math.PI / 2;
      e.codexStageGroup.add(e.codexSecondaryRig.root);
    } else if (effectType === 'ARTILLERY') {
      e.codexTankRig = e.modelFactory.createEnemyTank(EnemyClass.ARTILLERY);
      e.codexTankRig.root.position.set(-1.45, 0, 0);
      e.codexTankRig.hull.rotation.y = Math.PI / 2;
      e.codexTankRig.turret.rotation.y = Math.PI / 2;
      e.codexStageGroup.add(e.codexTankRig.root);

      const ringGeo = new THREE.RingGeometry(1.05, 1.2, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      e.codexHazardRing = new THREE.Mesh(ringGeo, ringMat);
      e.codexHazardRing.position.set(1.25, 0.05, 0);
      e.codexStageGroup.add(e.codexHazardRing);

      const fillGeo = new THREE.CircleGeometry(1.2, 28);
      fillGeo.rotateX(-Math.PI / 2);
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.28,
      });
      e.codexHazardFill = new THREE.Mesh(fillGeo, fillMat);
      e.codexHazardFill.position.set(1.25, 0.04, 0);
      e.codexStageGroup.add(e.codexHazardFill);

      e.codexArcShell = createProjectileVisual(0xff5a2a, {
        radius: 0.2,
        length: 0.3,
        glow: 1.2,
      });
      e.codexStageGroup.add(e.codexArcShell);
    } else if (effectType === 'APS') {
      e.codexTankRig = e.modelFactory.createPlayerTank();
      e.modelFactory.updatePlayerTankVisuals(
        e.codexTankRig,
        { cannon: 3, vehicleFrame: 3, engine: 3, armor: 3 },
        false,
        2,
        [3, 3, 3, 3],
        0,
        0
      );
      e.codexStageGroup.add(e.codexTankRig.root);
    } else if (effectType === 'FLAME') {
      e.codexTankRig = e.modelFactory.createEnemyTank(EnemyClass.FLAMETHROWER);
      e.codexTankRig.root.position.set(-1.1, 0, 0);
      e.codexTankRig.hull.rotation.y = Math.PI / 2;
      e.codexTankRig.turret.rotation.y = Math.PI / 2;
      e.codexStageGroup.add(e.codexTankRig.root);

      const forest = e.modelFactory.createForestBlock();
      forest.position.set(1.4, 0, 0);
      e.codexStageGroup.add(forest);
    } else if (effectType === 'MINE') {
      e.codexTankRig = e.modelFactory.createEnemyTank(EnemyClass.MINE_LAYER);
      e.codexTankRig.root.position.set(-1.15, 0, 0);
      e.codexTankRig.hull.rotation.y = -Math.PI / 2;
      e.codexTankRig.turret.rotation.y = -Math.PI / 2;
      e.codexStageGroup.add(e.codexTankRig.root);

      const positions = [
        [0.8, 0],
        [1.55, 0.75],
        [1.55, -0.75],
      ];
      e.codexMines = positions.map(([mx, mz]) => {
        const group = e.modelFactory.createLandMineMesh();
        group.position.set(mx, 0, mz);
        group.scale.setScalar(1.3);
        e.codexStageGroup.add(group);
        return { group, lightMesh: group.children[1] };
      });
    } else if (effectType === 'JAMMER') {
      e.codexTankRig = e.modelFactory.createEnemyTank(EnemyClass.JAMMER);
      e.codexStageGroup.add(e.codexTankRig.root);
    } else if (effectType === 'REPAIR') {
      const hq = e.modelFactory.createCommandBaseBlock();
      hq.position.set(-1.7, 0, -0.4);
      hq.scale.setScalar(0.8);
      e.codexStageGroup.add(hq);

      e.codexTankRig = e.modelFactory.createPlayerTank();
      e.codexTankRig.root.position.set(1.05, 0, 0);
      e.modelFactory.updatePlayerTankVisuals(
        e.codexTankRig,
        e.upgrades,
        false,
        2,
        [1, 1, 1, 1],
        0,
        0
      );
      e.codexStageGroup.add(e.codexTankRig.root);
    }
  }

  triggerDemo() {
    const e = this.engine;
    if (!e.codexOpen || !e.codexItem) return;
    e.codexDemoTimer = 0.01;
    if (e.codexItem.turretType === 'MLRS') {
      sound.playMissileLaunch();
    } else {
      sound.playCannonShot(true);
    }
  }

  /** Muzzle position of a Codex rig in Codex-FX local space (stage and FX rotate together). */
  getMuzzle(rig, fallbackX, fallbackY, fallbackZ) {
    const e = this.engine;
    if (!rig?.muzzleFlash) return { x: fallbackX, y: fallbackY, z: fallbackZ };
    rig.muzzleFlash.updateWorldMatrix(true, false);
    const v = rig.muzzleFlash.getWorldPosition(e._tmpMuzzle || (e._tmpMuzzle = new THREE.Vector3()));
    e.codexFx.root.updateWorldMatrix(true, false);
    e.codexFx.root.worldToLocal(v);
    return { x: v.x, y: v.y, z: v.z };
  }

  update(dt, elapsed) {
    const e = this.engine;
    if (e.codexAutoRotate && !e.codexDragging) {
      e.codexTurntableAngle += dt * 0.42;
    }
    e.codexStageGroup.rotation.y = e.codexTurntableAngle;
    e.codexFxGroup.rotation.y = e.codexTurntableAngle;
    e.codexFx.root.rotation.y = e.codexTurntableAngle;

    const item = e.codexItem;
    if (!item) return;

    if (item.category === 'TANKS' && e.codexTankRig) {
      e.codexRecoil = THREE.MathUtils.damp(e.codexRecoil, 0, 14, dt);
      e.codexBarrelRecoils[0] = THREE.MathUtils.damp(
        e.codexBarrelRecoils[0],
        0,
        16,
        dt
      );
      e.codexBarrelRecoils[1] = THREE.MathUtils.damp(
        e.codexBarrelRecoils[1],
        0,
        16,
        dt
      );
      if (e.codexTankRig.turrets?.length > 1) {
        const [t0, t1] = e.codexTankRig.turrets;
        t0.turret.rotation.y = Math.sin(elapsed * 0.85) * 0.52;
        t1.turret.rotation.y = Math.PI + Math.cos(elapsed * 0.72) * 0.58;
        t0.barrelPivot.position.z = (t0.baseBarrelZ ?? 0.38) - e.codexBarrelRecoils[0];
        t1.barrelPivot.position.z = (t1.baseBarrelZ ?? 0.38) - e.codexBarrelRecoils[1];
        if (e.codexFlashTimer > 0) {
          e.codexFlashTimer -= dt;
          t0.muzzleFlash.material.opacity = 0;
          t1.muzzleFlash.material.opacity = 0;
        }
      } else {
        if (e.codexTankRig.barrelPivot) {
          const baseZ = item.id?.startsWith('boss_') ? 0.68 : 0.46;
          e.codexTankRig.barrelPivot.position.z = baseZ - e.codexRecoil;
        }
        if (e.codexTankRig.c5Barrels) {
          e.codexTankRig.c5Barrels[0].position.z = -e.codexBarrelRecoils[0];
          e.codexTankRig.c5Barrels[1].position.z = -e.codexBarrelRecoils[1];
        }
        if (e.codexFlashTimer > 0) {
          e.codexFlashTimer -= dt;
          if (e.codexTankRig.muzzleFlash) {
            e.codexTankRig.muzzleFlash.material.opacity = 0;
          }
        }
        if (e.codexTankRig.turret) {
          e.codexTankRig.turret.rotation.y = Math.sin(elapsed * 0.9) * 0.45;
        }
      }
      if (e.codexTankRig.gear) {
        const gear = e.codexTankRig.gear;
        gear.left.value += (dt * 0.9) / gear.scale;
        gear.right.value += (dt * 0.9) / gear.scale;
      }
      if (e.codexTankRig.radarDish) {
        e.codexTankRig.radarDish.rotation.y = elapsed * 3.5;
      }
      if (item.isPlayerMbt) {
        const hoverActive = (e.codexPreviewUpgrades.chassis || 1) >= 5;
        const hoverY = hoverActive ? 0.05 + Math.sin(elapsed * 4.0) * 0.012 : 0;
        e.codexTankRig.root.position.y = hoverY;
        const apsArr = e.codexPreviewUpgrades.aps ? [3, 3, 3, 3] : [0, 0, 0, 0];
        const missileCount = e.codexPreviewUpgrades.missile ? 4 : 0;
        e.modelFactory.updatePlayerTankVisuals(
          e.codexTankRig,
          e.codexPreviewUpgrades,
          hoverActive,
          missileCount,
          apsArr,
          dt * 2.2,
          elapsed
        );
      }

      e.codexDemoTimer -= dt;
      if (e.codexDemoTimer <= 0) {
        if (e.codexTankRig.turrets?.length > 1) {
          const tIdx = e.codexNextBarrel % e.codexTankRig.turrets.length;
          e.codexNextBarrel = (tIdx + 1) % e.codexTankRig.turrets.length;
          const slot = e.codexTankRig.turrets[tIdx];
          e.codexDemoTimer = 1.05;
          e.codexFlashTimer = 0.08;
          e.codexBarrelRecoils[tIdx] = 0.22;
          const tAngle = slot.turret.rotation.y || 0;
          const dirX = Math.sin(tAngle);
          const dirZ = Math.cos(tAngle);
          const perpX = Math.cos(tAngle);
          const perpZ = -Math.sin(tAngle);
          const m = this.getMuzzle(slot, dirX * 1.45, 0.95, slot.pivotZ + dirZ * 1.45);
          for (const lat of [-0.14, 0.14]) {
            e.codexFx.muzzleFlash(
              m.x + perpX * lat,
              m.y,
              m.z + perpZ * lat,
              dirX,
              dirZ,
              { scale: 1.15 }
            );
          }
        } else {
          const isC5 =
            item.isPlayerMbt && (e.codexPreviewUpgrades.cannon || 1) === 5;
          e.codexDemoTimer = isC5 ? 0.55 : 2.2;
          e.codexFlashTimer = 0.08;
          const turretAngle = e.codexTankRig.turret?.rotation.y || 0;
          const dirX = Math.sin(turretAngle);
          const dirZ = Math.cos(turretAngle);
          const perpX = Math.cos(turretAngle);
          const perpZ = -Math.sin(turretAngle);

          if (isC5) {
            const bIdx = e.codexNextBarrel % 2;
            e.codexNextBarrel = (bIdx + 1) % 2;
            e.codexRecoil = 0.06;
            e.codexBarrelRecoils[bIdx] = 0.24;
            const lat = bIdx === 0 ? -0.14 : 0.14;
            if (e.codexTankRig.muzzleFlash) {
              e.codexTankRig.muzzleFlash.position.x = lat;
            }
            const m = this.getMuzzle(
              e.codexTankRig,
              dirX * 1.65 + perpX * lat,
              0.9,
              dirZ * 1.65 + perpZ * lat
            );
            e.codexFx.muzzleFlash(m.x, m.y, m.z, dirX, dirZ, { scale: 0.85 });
          } else {
            e.codexRecoil = 0.22;
            if (e.codexTankRig.muzzleFlash) {
              e.codexTankRig.muzzleFlash.position.x = 0;
            }
            const m = this.getMuzzle(e.codexTankRig, dirX * 1.45, 0.9, dirZ * 1.45);
            e.codexFx.muzzleFlash(m.x, m.y, m.z, dirX, dirZ, {
              scale: item.isBoss || item.id?.startsWith('boss_') ? 1.2 : 0.95,
            });
          }
        }
      }
    }

    if (item.turretType && e.codexTankRig) {
      e.codexRecoil = THREE.MathUtils.damp(e.codexRecoil, 0, 12, dt);
      if (e.codexTankRig.barrelPivot) {
        e.codexTankRig.barrelPivot.position.z = -e.codexRecoil;
      }
      if (e.codexTankRig.turret) {
        e.codexTankRig.turret.rotation.y = Math.sin(elapsed * 0.95) * 0.45;
      }
      e.codexDemoTimer -= dt;
      if (e.codexDemoTimer <= 0) {
        const tType = item.turretType;
        const reloadTime = tType === 'HOWITZER' ? 3.8 : tType === 'MLRS' ? 3.2 : 2.0;
        e.codexDemoTimer = reloadTime;
        const turretAngle = e.codexTankRig.turret?.rotation.y || 0;
        const dirX = Math.sin(turretAngle);
        const dirZ = Math.cos(turretAngle);
        e.codexRecoil = tType === 'HOWITZER' ? 0.28 : tType === 'MLRS' ? 0.16 : 0.24;
        const muzzleDist = e.codexTankRig.muzzleDist || 1.4;
        const mX = dirX * muzzleDist;
        const mY = 0.85;
        const mZ = dirZ * muzzleDist;

        if (tType === 'HOWITZER') {
          sound.playCannonShot(true);
          e.codexFx.muzzleFlash(mX, mY, mZ, dirX, dirZ, { scale: 1.45, tint: 0x2dd4bf });
          e.codexFx.shockwave(mX, 0.05, mZ, 0.2, 2.2, 0x2dd4bf, 0.35, 0.85);
        } else if (tType === 'MLRS') {
          sound.playMissileLaunch();
          e.codexFx.muzzleFlash(mX, mY, mZ, dirX, dirZ, { scale: 1.15, tint: 0xf87171, smoke: true });
          e.codexFx.sparks(mX, mY, mZ, 0xf87171, 6);
        } else {
          sound.playCannonShot(false);
          e.codexFx.muzzleFlash(mX, mY, mZ, dirX, dirZ, { scale: 1.25, tint: 0x38bdf8 });
        }
      }
    }

    if (item.category === 'POWERUPS' && e.codexTankRig?.isCrate) {
      const crate = e.codexTankRig.root;
      crate.position.y = 0.35 + Math.sin(elapsed * 3) * 0.1;
      crate.rotation.y = elapsed * 1.2;
      const grounded = crate.userData.grounded;
      if (grounded) {
        grounded.position.y = -crate.position.y / crate.scale.y;
        grounded.rotation.y = -crate.rotation.y;
      }
    }

    if (item.category === 'EFFECTS') {
      const fx = item.effectType;
      e.codexDemoTimer -= dt;

      if (fx === 'CANNON' && e.codexTankRig) {
        e.codexRecoil = THREE.MathUtils.damp(e.codexRecoil, 0, 14, dt);
        e.codexTankRig.barrelPivot.position.z = 0.46 - e.codexRecoil;
        if (e.codexDemoTimer <= 0) {
          e.codexDemoTimer = 1.6;
          e.codexRecoil = 0.22;
          const m = this.getMuzzle(e.codexTankRig, 0.3, 0.85, 0);
          e.codexFx.muzzleFlash(m.x, m.y, m.z, 1, 0, { scale: 1.1 });
          const impactX = 0.68;
          e.codexFx.schedule(0.04, () => {
            e.codexFx.shellTrail(m.x + 0.2, m.y, m.z, impactX, m.y, m.z, 0xffb030, 0.2, 0.16);
          });
          e.codexFx.schedule(0.07, () => {
            e.codexFx.masonryHit(impactX, m.y, m.z, { concrete: true, heavy: true });
            e.codexFx.point('glow', {
              x: impactX, y: m.y, z: m.z,
              life: 0.1, size: 1.4, tex: 3, color: [1, 0.95, 0.8],
            });
          });
        }
      } else if (fx === 'MISSILE') {
        this.updateMissile(dt);
        if (e.codexDemoTimer <= 0) {
          e.codexDemoTimer = 2.6;
          this.launchMissile();
        }
      } else if (fx === 'ARTILLERY') {
        const cycle = (elapsed * 0.6) % 1;
        if (e.codexHazardFill) {
          e.codexHazardFill.scale.setScalar(Math.max(0.08, cycle));
        }
        if (e.codexHazardRing) {
          e.codexHazardRing.visible = Math.floor(elapsed * 10) % 2 === 0;
        }
        const wrapped = cycle < (e.codexArcPrev ?? 0);
        e.codexArcPrev = cycle;
        const m = this.getMuzzle(e.codexTankRig, -0.6, 1.2, 0);
        if (wrapped) {
          e.codexFx.explosion(1.25, 0.3, 0, { scale: 0.75, scorchLife: 2.5 });
          e.codexFx.muzzleFlash(m.x, m.y, m.z, 1, 0, { scale: 1.0, light: false });
        }
        if (e.codexArcShell) {
          const sx = THREE.MathUtils.lerp(m.x, 1.25, cycle);
          const sz = THREE.MathUtils.lerp(m.z, 0, cycle);
          const sy = THREE.MathUtils.lerp(m.y, 0.3, cycle) + Math.sin(cycle * Math.PI) * 3.2;
          e.codexArcShell.position.set(sx, sy, sz);
          e.codexArcShell.visible = true;
          e.codexFx.shellSmokeTrail(sx, sy, sz, true);
        }
      } else if (fx === 'APS' && e.codexTankRig) {
        e.modelFactory.updatePlayerTankVisuals(
          e.codexTankRig,
          { cannon: 3, vehicleFrame: 3, engine: 3, armor: 3 },
          false,
          2,
          [3, 3, 3, 3],
          0,
          elapsed
        );
        if (e.codexDemoTimer <= 0) {
          e.codexDemoTimer = 1.3;
          const angle = Math.random() * Math.PI * 2;
          const cx = Math.cos(angle);
          const cz = Math.sin(angle);
          const startR = 3.4;
          const killR = 1.85;
          const speed = 16;
          e.codexFx.streak({
            x: cx * startR, y: 0.95, z: cz * startR,
            vx: -cx * speed, vy: 0, vz: -cz * speed,
            life: (startR - killR) / speed,
            len: 0.03,
            width: 0.16,
            color: [1, 0.4, 0.15],
            cool: false,
            shrink: false,
          });
          e.codexFx.schedule((startR - killR) / speed, () => {
            e.codexFx.apsIntercept(
              Math.sign(cx || 1) * 0.55,
              1.0,
              Math.sign(cz || 1) * 0.7,
              cx * killR,
              0.95,
              cz * killR
            );
          });
        }
      } else if (fx === 'FLAME') {
        const m = this.getMuzzle(e.codexTankRig, -0.25, 0.72, 0);
        e.codexFlameAcc = (e.codexFlameAcc || 0) + dt;
        const step = 1 / 45 / e.codexFx.q;
        while (e.codexFlameAcc >= step) {
          e.codexFlameAcc -= step;
          for (let k = 0; k < 2; k++) {
            const reach = Math.random();
            const spread = (Math.random() - 0.5) * 0.35 * reach;
            e.codexFx.flameJet(m.x + reach * 1.7, m.y + reach * 0.05, m.z + spread, 6, 0, reach);
          }
        }
        if (e.codexDemoTimer <= 0) {
          e.codexDemoTimer = 2.5;
          e.codexFx.addEmitter('burn', 1.4, 0.55, 0, 3.0, 0.9);
        }
      } else if (fx === 'MINE' && e.codexMines) {
        const blink = Math.floor(elapsed * 6) % 2 === 0;
        e.codexMines.forEach((m) => {
          m.lightMesh.visible = blink;
        });
        if (e.codexDemoTimer <= 0) {
          e.codexDemoTimer = 2.0;
          e.codexMineIdx = ((e.codexMineIdx ?? -1) + 1) % e.codexMines.length;
          const mine = e.codexMines[e.codexMineIdx];
          if (mine.group.visible) {
            const { x, z } = mine.group.position;
            mine.group.visible = false;
            e.codexFx.explosion(x, 0.15, z, { scale: 0.6, scorchLife: 3 });
            sound.playEnvironmentalExplosion({ x, z });
            e.codexFx.schedule(1.5, () => {
              mine.group.visible = true;
            });
          }
        }
      } else if (fx === 'JAMMER' && e.codexTankRig) {
        if (e.codexTankRig.radarDish) {
          e.codexTankRig.radarDish.rotation.y = elapsed * 4.0;
        }
        e.codexArcTimer = (e.codexArcTimer || 0) - dt;
        if (e.codexArcTimer <= 0) {
          e.codexArcTimer = 0.22;
          e.codexFx.electric(0, 1.4, 0, 0xc084fc, 1, 0.6);
        }
        if (e.codexDemoTimer <= 0) {
          e.codexDemoTimer = 1.5;
          e.codexFx.jammerPulse(0, 1.2, 0, 3.0);
        }
      } else if (fx === 'REPAIR') {
        e.codexRepairTimer = (e.codexRepairTimer || 0) - dt;
        if (e.codexRepairTimer <= 0) {
          e.codexRepairTimer = 0.14;
          e.codexFx.repair(1.05, 0.75, 0, 2);
        }
        if (e.codexDemoTimer <= 0) {
          e.codexDemoTimer = 1.6;
          e.codexFx.segment(-1.2, 1.45, 0, 1.05, 1.0, 0, [0.3, 1, 0.6], 0.1, 0.45, 0.9);
          e.codexFx.shockwave(-1.2, 0.05, 0, 0.4, 2.8, 0x34d399, 0.8, 0.6);
          e.codexFx.repair(1.05, 0.9, 0, 6);
        }
      }
    }
  }

  launchMissile() {
    const e = this.engine;
    if (e.codexMissile) {
      e.codexFxGroup.remove(e.codexMissile.mesh);
      e.codexMissile = null;
    }
    const mesh = createMissileVisual('player', 0.8);
    e.codexFxGroup.add(mesh);
    const start = { x: -0.95, y: 1.35, z: 0.25 };
    const end = { x: 1.3, y: 0.85, z: 0 };
    e.codexMissile = { mesh, t: 0, dur: 0.85, start, end, prevX: start.x, prevZ: start.z };
    e.codexFx.missileLaunch(start.x - 0.2, start.y, start.z, 1, 0, { scale: 0.6, light: false });
    sound.playMissileLaunch();
  }

  updateMissile(dt) {
    const e = this.engine;
    const ms = e.codexMissile;
    if (!ms) return;
    ms.t += dt;
    const k = Math.min(1, ms.t / ms.dur);
    const x = THREE.MathUtils.lerp(ms.start.x, ms.end.x, k);
    const z = THREE.MathUtils.lerp(ms.start.z, ms.end.z, k) + Math.sin(k * Math.PI * 2) * 0.18;
    const y = THREE.MathUtils.lerp(ms.start.y, ms.end.y, k) + Math.sin(k * Math.PI) * 0.7;
    const dx = x - ms.prevX;
    const dz = z - ms.prevZ;
    const len = Math.hypot(dx, dz) || 1;
    ms.mesh.position.set(x, y, z);
    const heading = Math.atan2(dx, dz);
    let turn = heading - ms.mesh.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    ms.mesh.rotation.y = heading;
    animateMissileVisual(ms.mesh, dt, dt > 0 ? turn / dt : 0);
    e.codexFx.missileExhaust(x, y, z, dx / len, dz / len, {
      smokeEvery: true,
      prevX: ms.prevX,
      prevZ: ms.prevZ,
    });
    ms.prevX = x;
    ms.prevZ = z;
    if (k >= 1) {
      e.codexFxGroup.remove(ms.mesh);
      e.codexMissile = null;
      e.codexFx.missileImpact(ms.end.x, ms.end.y, ms.end.z, dx / len, dz / len, { scale: 0.7 });
      sound.playExplosion(0.9);
    }
  }
}

