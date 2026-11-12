/** 3D procedural meshes, texture application, and tank rigs. */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { APS, POWERUP, POWERUP_TYPES } from './constants.js';
import { disposeOwned, markMaterialOwned, markOwned } from './dispose.js';
import { createPowerUpEmblemCanvas, POWERUP_FAMILY } from './icons.js';
import { EnemyClass } from './types.js';
import { GRID_SIZE, TILE_SIZE } from './levels.js';
import { TextureGenerator, mulberry32 } from './texture-gen.js';
import { BrickModels } from './terrains/brick-models.js';
import { applyBrickFinish } from './terrains/brick-finish.js';
import { createWaterSurface } from './terrains/water.js';
import { createIceSurface } from './terrains/ice.js';
import { createMountainPerimeter } from './terrains/mountains.js';
import { buildEnemyStronghold } from './terrains/enemy-stronghold.js';
import { createSandCanvas, createSandPatchMask } from './terrains/sand.js';

/** Runtime sand patches: rim variants, share of the patch the cell occupies, and pattern repeat in cells. */
const SAND_PATCH_VARIANTS = 6;
const SAND_PATCH_CELL_FRACTION = 0.6;
const SAND_PATTERN_CELLS = 4;

const HYDRA_GLB_MODEL = Object.freeze({
  url: './models/tank_boss_hydra.glb',
  scale: 0.28,
  turretY: 1.55,
  gunY: 2.55,
  muzzleX: 2.23,
  muzzleY: 3.0,
  barrelBaseZ: 0.68,
});
const TITAN_GLB_MODEL = Object.freeze({
  url: './models/tank_boss_titan.glb',
  scale: 0.33,
  turretY: 2.15,
  gunY: 2.62,
  muzzleX: 7.55,
  barrelBaseZ: 0.38,
  turrets: Object.freeze([
    Object.freeze({
      turretPrefix: 'Turret_Front',
      gunPrefix: 'Gun_Front',
      pivotX: 3.10,
      gunX: 4.25,
      turretY: 2.15,
      gunY: 2.62,
      muzzleX: 7.55,
      bakedDir: 1,
      defaultYawOffset: 0,
    }),
    Object.freeze({
      turretPrefix: 'Turret_Rear',
      gunPrefix: 'Gun_Rear',
      pivotX: -3.10,
      gunX: -4.25,
      turretY: 2.15,
      gunY: 2.62,
      muzzleX: -7.55,
      bakedDir: -1,
      defaultYawOffset: Math.PI,
    }),
  ]),
});
const MAMMOTH_GLB_MODEL = Object.freeze({
  url: './models/tank_boss_mammoth.glb',
  scale: 0.3,
  turretY: 2.05,
  gunY: 2.62,
  muzzleX: 9.75,
  barrelBaseZ: 0.68,
});
const INFERNO_GLB_MODEL = Object.freeze({
  url: './models/tank_boss_inferno.glb',
  scale: 0.33,
  turretY: 2.02,
  gunY: 3.16,
  muzzleX: 6.33,
  barrelBaseZ: 0.66,
});
const GLB_TANK_MODELS = Object.freeze({
  [EnemyClass.STANDARD]: { url: './models/tank_standard.glb', scale: 0.26, turretY: 1.55, gunY: 1.94, muzzleX: 7.25 },
  [EnemyClass.SCOUT]: { url: './models/tank_scout.glb', scale: 0.29, turretY: 1.36, gunY: 1.68, muzzleX: 5.18 },
  [EnemyClass.HOWITZER]: { url: './models/tank_howitzer.glb', scale: 0.26, turretY: 1.55, gunY: 2.2, muzzleX: 6.91, muzzleY: 4.84 },
  [EnemyClass.ARMOR]: { url: './models/tank_armor.glb', scale: 0.29, turretY: 1.78, gunY: 2.3, muzzleX: 8.27 },
  [EnemyClass.SAPPER]: { url: './models/tank_sapper.glb', scale: 0.26, turretY: 2.32, gunY: 2.58, muzzleX: 5.12 },
  [EnemyClass.HOVER]: { url: './models/tank_hover.glb', scale: 0.26, turretY: 1.3, gunY: 1.62, muzzleX: 6.49 },
  [EnemyClass.FLAMETHROWER]: { url: './models/tank_flamethrower.glb', scale: 0.27, turretY: 1.62, gunY: 2.05, muzzleX: 4.9 },
  [EnemyClass.KAMIKAZE]: { url: './models/tank_kamikaze.glb', scale: 0.25, turretY: 1.3, gunY: 1.3, muzzleX: 4.6 },
  [EnemyClass.JAMMER]: { url: './models/tank_jammer.glb', scale: 0.26, turretY: 1.55, gunY: 1.94, muzzleX: 7.21 },
  [EnemyClass.ENGINEER]: { url: './models/tank_engineer.glb', scale: 0.23, turretY: 1.55, gunY: 1.92, muzzleX: 5.93, glow: { value: 0.66 } },
  [EnemyClass.STRIKER]: {
    url: './models/tank_striker.glb',
    scale: 0.28,
    turretY: 1.55,
    gunY: 1.94,
    muzzleX: 7.21,
    missileMounts: [[0.43, 1.72], [0.43, -1.72]],
  },
  [EnemyClass.STEALTH]: { url: './models/tank_stealth.glb', scale: 0.26, turretY: 1.36, gunY: 1.62, muzzleX: 8.07, stealth: true },
  [EnemyClass.BOSS_MAMMOTH]: MAMMOTH_GLB_MODEL,
  [EnemyClass.BOSS_HYDRA]: HYDRA_GLB_MODEL,
  [EnemyClass.BOSS_INFERNO]: INFERNO_GLB_MODEL,
  [EnemyClass.BOSS_TITAN]: TITAN_GLB_MODEL,
});
const ENEMY_BARREL_BASE_Z = 0.46;

const PLAYER_GLB_MODEL = Object.freeze({
  url: './models/tank_player.glb',
  scale: 0.26,
  turretY: 1.55,
  gunY: 1.94,
  muzzleX: Object.freeze([6.52, 7.21, 7.67, 7.9, 7.92]),
  glow: { sat: 0.76 },
});
const PLAYER_BARREL_BASE_Z = 0.46;

const GLB_DEFENSE_TURRETS = Object.freeze({
  CANNON: Object.freeze({ url: './models/turret_cannon.glb', scale: 1.0, turretY: 0.62, muzzleDist: 1.6 }),
  HOWITZER: Object.freeze({ url: './models/turret_howitzer.glb', scale: 1.0, turretY: 0.62, muzzleDist: 1.4 }),
  MLRS: Object.freeze({ url: './models/turret_mlrs.glb', scale: 1.0, turretY: 0.62, muzzleDist: 1.4 }),
});

/** The GLB bakes every part into one colour texture, so lights, lenses and nozzles lose their. */
function addBakedGlow(material, { value = 0.8, sat = 0.6, intensity = 1.6 } = {}) {
  if (!material?.map) return material;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        vec3 glowTexel = texture2D( map, vMapUv ).rgb;
        float glowMax = max( glowTexel.r, max( glowTexel.g, glowTexel.b ) );
        float glowSat = ( glowMax - min( glowTexel.r, min( glowTexel.g, glowTexel.b ) ) ) / max( glowMax, 1e-4 );
        totalEmissiveRadiance += glowTexel * ${intensity.toFixed(2)}
          * smoothstep( ${value.toFixed(3)}, ${(value + 0.06).toFixed(3)}, glowMax )
          * smoothstep( ${sat.toFixed(3)}, ${(sat + 0.04).toFixed(3)}, glowSat );
      }`
    );
  };
  material.customProgramCacheKey = () => `baked-glow-${value}-${sat}-${intensity}`;
  material.needsUpdate = true;
  return material;
}

/** Running-gear animation baked into the GLBs (assets/blender/common/tankkit.py + bake_export.py):. */
const GEAR_ATTRIBUTES = Object.freeze({ _whl: 3, _trk: 3, _trkstep: 1 });

function hasGearData(geometry) {
  return !!(geometry?.attributes?._whl || geometry?.attributes?._trk);
}

function completeGearAttributes(geometry) {
  if (!hasGearData(geometry)) return;
  const count = geometry.attributes.position.count;
  Object.entries(GEAR_ATTRIBUTES).forEach(([name, size]) => {
    if (!geometry.attributes[name]) {
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size));
    }
  });
}

const UNMERGED_PARTS = new Set(['Turret_Dish']);

/** Merges the meshes of one pivot group (hull, turret or gun) into a single mesh when they. */
function mergePivotGroup(meshes) {
  const pool = meshes.filter((m) => !UNMERGED_PARTS.has(m.name));
  const kept = meshes.filter((m) => UNMERGED_PARTS.has(m.name));
  if (pool.length < 2) return meshes;
  const [ref] = pool;
  const sameMaterial = pool.every((m) => m.material === ref.material);
  const sameTransform = pool.every(
    (m) => m.position.equals(ref.position) && m.quaternion.equals(ref.quaternion) && m.scale.equals(ref.scale)
  );
  if (!sameMaterial || !sameTransform) return meshes;
  if (pool.some((m) => hasGearData(m.geometry))) {
    pool.forEach((m) => {
      const count = m.geometry.attributes.position.count;
      Object.entries(GEAR_ATTRIBUTES).forEach(([name, size]) => {
        if (!m.geometry.attributes[name]) {
          m.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size));
        }
      });
    });
  }
  const geometry = mergeGeometries(pool.map((m) => m.geometry));
  if (!geometry) return meshes;
  const merged = new THREE.Mesh(geometry, ref.material);
  merged.name = pool.map((m) => m.name).join('+');
  merged.position.copy(ref.position);
  merged.quaternion.copy(ref.quaternion);
  merged.scale.copy(ref.scale);
  merged.castShadow = true;
  merged.receiveShadow = true;
  pool.forEach((m) => m.geometry.dispose());
  return [merged, ...kept];
}

function createGearUniforms(scale) {
  return { left: { value: 0 }, right: { value: 0 }, scale };
}

function addGearMotion(material, gear) {
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile?.call(material, shader, renderer);
    shader.uniforms.uGearLeft = gear.left;
    shader.uniforms.uGearRight = gear.right;
    shader.vertexShader =
      `attribute vec3 _whl;
      attribute vec3 _trk;
      attribute float _trkstep;
      uniform float uGearLeft;
      uniform float uGearRight;
      ` +
      shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          float gearDist = position.z < 0.0 ? uGearLeft : uGearRight;
          // Draco quantization can leave "zero" as a tiny value: real wheels and links are > 1 cm
          float gearAng = _whl.z > 0.01 ? -gearDist / _whl.z : 0.0;
          mat2 gearRot = mat2( cos( gearAng ), sin( gearAng ), -sin( gearAng ), cos( gearAng ) );
          objectNormal.xy = gearRot * objectNormal.xy;
          #ifdef USE_TANGENT
            objectTangent.xy = gearRot * objectTangent.xy;
          #endif`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          if ( _whl.z > 0.01 ) transformed.xy = _whl.xy + gearRot * ( transformed.xy - _whl.xy );
          if ( abs( _trkstep ) > 0.01 ) transformed += _trk * fract( gearDist / _trkstep );`
        );
  };
  material.customProgramCacheKey = () => `${prevKey()}|gear`;
  material.needsUpdate = true;
  return material;
}

const CLEARANCE_BUCKETS = 72;
const CLEARANCE_MAX_ELEV = 0.6;
const BARREL_RADIUS_M = 0.16;
const _clearVec = new THREE.Vector3();

/** Builds a clearance profile from GLB-space meshes (metres, +X forward, Y up). */
function buildClearanceProfile(meshes, gunY, muzzleReach, trunnionOffset, turretCenterX = 0) {
  const profile = new Float32Array(CLEARANCE_BUCKETS);
  let any = false;
  const bucketSize = (Math.PI * 2) / CLEARANCE_BUCKETS;
  meshes.forEach((mesh) => {
    const pos = mesh.geometry?.attributes?.position;
    if (!pos) return;
    mesh.updateMatrix();
    for (let i = 0; i < pos.count; i++) {
      _clearVec.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      const dx = _clearVec.x - turretCenterX;
      const dz = _clearVec.z;
      const r = Math.hypot(dx, dz);
      const d = r - trunnionOffset;
      const rise = _clearVec.y + BARREL_RADIUS_M - gunY;
      if (d < 0.3 || r > muzzleReach + 0.1 || rise <= 0) continue;
      const elev = Math.min(CLEARANCE_MAX_ELEV, Math.atan2(rise, d));
      const yaw = Math.atan2(-dz, dx);
      const span = Math.atan2(BARREL_RADIUS_M * 1.5, r) + bucketSize * 0.5;
      const b0 = Math.floor((yaw - span) / bucketSize);
      const b1 = Math.floor((yaw + span) / bucketSize);
      for (let b = b0; b <= b1; b++) {
        const idx = ((b % CLEARANCE_BUCKETS) + CLEARANCE_BUCKETS) % CLEARANCE_BUCKETS;
        if (elev > profile[idx]) profile[idx] = elev;
      }
      any = true;
    }
  });
  return any ? profile : null;
}

/** Barrel elevation (rad, positive = up) a rig needs so its gun clears the hull at turret yaw. */
export function deckClearance(rig, relYaw) {
  const sources = rig?.clearanceSources;
  if (!sources?.length) return 0;
  const bucketSize = (Math.PI * 2) / CLEARANCE_BUCKETS;
  const b = ((Math.floor(relYaw / bucketSize) % CLEARANCE_BUCKETS) + CLEARANCE_BUCKETS) % CLEARANCE_BUCKETS;
  let elev = 0;
  for (const src of sources) {
    if (src.group && !src.group.visible) continue;
    if (src.profile[b] > elev) elev = src.profile[b];
  }
  return elev;
}

function skipMatrixWorldUpdate() {}

/** Shows or hides a tier variant. While hidden, the per-frame matrix pass skips its whole. */
function setPartActive(group, active) {
  group.visible = active;
  const skipping = Object.hasOwn(group, 'updateMatrixWorld');
  if (active && skipping) {
    delete group.updateMatrixWorld;
    group.matrixWorldNeedsUpdate = true;
  } else if (!active && !skipping) {
    group.updateMatrixWorld = skipMatrixWorldUpdate;
  }
}

let tankGltfLoader = null;
function getTankGltfLoader(renderer) {
  if (!tankGltfLoader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath('./vendor/three/examples/jsm/libs/basis/');
    ktx2.detectSupport(renderer);
    tankGltfLoader = new GLTFLoader();
    tankGltfLoader.setDRACOLoader(draco);
    tankGltfLoader.setKTX2Loader(ktx2);
  }
  return tankGltfLoader;
}

export class ModelFactory extends TextureGenerator {
  /** @param {object} [pregenerated] results of texture-worker.js keyed by generator name;. */
  constructor(renderer, isSoftwareGl, pregenerated = null) {
    super({ maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
    this.pregenerated = pregenerated || {};
    this.renderer = renderer;
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    this.isSoftwareGl = isSoftwareGl;
    this.brickTex = this.generated('createBrickTextures');
    const brickSideMat = new THREE.MeshStandardMaterial({
      map: this.brickTex.side,
      bumpMap: isSoftwareGl ? null : this.brickTex.sideBump,
      bumpScale: 1.6,
      roughness: 0.86,
      metalness: 0.02,
    });
    const brickTopMat = new THREE.MeshStandardMaterial({
      map: this.brickTex.top,
      bumpMap: isSoftwareGl ? null : this.brickTex.topBump,
      bumpScale: 1.6,
      roughness: 0.9,
      metalness: 0.02,
    });
    applyBrickFinish(brickSideMat);
    applyBrickFinish(brickTopMat);
    this.brickMaterials = [brickSideMat, brickSideMat, brickTopMat, brickSideMat, brickSideMat, brickSideMat];
    this.brickDamageMaterials = new Map([[4, this.brickMaterials]]);
    for (let hp = 0; hp < 4; hp++) {
      const side = applyBrickFinish(brickSideMat.clone(), hp);
      const top = applyBrickFinish(brickTopMat.clone(), hp);
      side.bumpScale *= hp / 4;
      top.bumpScale *= hp / 4;
      this.brickDamageMaterials.set(hp, [side, side, top, side, side, side]);
    }
    this.brickModels = new BrickModels();
    this.useBlenderBricks = !isSoftwareGl;
    if (this.useBlenderBricks) {
      this.brickModels.load()
        .then(ready => { if (ready) this.onBrickModelsReady?.(); })
        .catch(error => { console.warn('BRICK models unavailable; using procedural fallback.', error); });
    }
    this.concreteTex = this.generated('createConcreteTextures');
    this.groundTex = this.generated('createGroundTexture');
    this.iceTex = this.generated('createIceTextures');
    this.waterTex = this.generated('createWaterTextures');
    this.shadowTex = this.generated('createShadowTexture');
    this.tankArmorTex = this.generated('createTankArmorTexture');
    this.trackTreadTex = this.generated('createTrackTreadTexture');
    this.powerUpTexCache = new Map();
    this.glbTankParts = new Map();
    this.playerGlbParts = null;
    this.pendingPlayerRigs = [];
    this.playerClearance = null;
    this.pendingEnemyRigs = new Map();
    this.onModelReady = null;
    this.glbClassesByUrl = new Map();
    Object.entries(GLB_TANK_MODELS).forEach(([enemyClass, cfg]) => {
      this.glbClassesByUrl.set(cfg.url, [...(this.glbClassesByUrl.get(cfg.url) || []), enemyClass]);
    });
    this.glbRequestedUrls = new Set();
    this.glbTurretParts = new Map();
    this.pendingTurretRigs = new Map();
    this.glbTurretRequestedUrls = new Set();
    if (!isSoftwareGl) {
      this.loadPlayerGlbModel();
    }
  }

  /** Result of a texture generator: precomputed by the worker when available, else built now. */
  generated(name) {
    const pre = this.pregenerated[name];
    if (pre) {
      delete this.pregenerated[name];
      return pre;
    }
    return this[name]();
  }

  /** Quality switches that take effect the next time the affected materials are built. */
  setQuality({ physicalWater = true } = {}) {
    if (this.physicalWater === physicalWater) return;
    this.physicalWater = physicalWater;
    this.waterMat = null;
    this.iceMat = null;
  }

  /** Starts loading the GLBs of the given enemy classes (no-op for loaded or loading ones). */
  ensureEnemyModels(enemyClasses) {
    if (this.isSoftwareGl) return;
    for (const enemyClass of enemyClasses) {
      const url = GLB_TANK_MODELS[enemyClass]?.url;
      if (!url || this.glbRequestedUrls.has(url)) continue;
      this.glbRequestedUrls.add(url);
      this.loadGlbTankModel(this.glbClassesByUrl.get(url), url);
    }
  }

  loadPlayerGlbModel() {
    getTankGltfLoader(this.renderer).load(
      PLAYER_GLB_MODEL.url,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const parts = new Map();
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          const mesh = node.clone();
          node.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          addBakedGlow(mesh.material, PLAYER_GLB_MODEL.glow);
          completeGearAttributes(mesh.geometry);
          parts.set(node.name, mesh);
        });
        this.playerGlbParts = parts;
        const cfg = PLAYER_GLB_MODEL;
        const pivotX = PLAYER_BARREL_BASE_Z / cfg.scale;
        const muzzleX = Math.max(...cfg.muzzleX);
        this.playerClearance = new Map();
        parts.forEach((mesh, name) => {
          if (!/^(Hull_Base|CH\d|F\d|E\d|A\d_Hull)/.test(name)) return;
          const profile = buildClearanceProfile([mesh], cfg.gunY, muzzleX, pivotX);
          if (profile) this.playerClearance.set(name, profile);
        });
        this.pendingPlayerRigs.forEach((rig) => this.applyPlayerGlb(rig));
        this.pendingPlayerRigs = [];
        this.onModelReady?.('player');
      },
      undefined,
      (err) => {
        this.pendingPlayerRigs = [];
        console.warn('Player tank GLB unavailable, using procedural rig.', err);
      }
    );
  }

  applyPlayerGlb(rig) {
    const cfg = PLAYER_GLB_MODEL;
    const parts = this.playerGlbParts;
    const s = cfg.scale;
    const turretY = cfg.turretY * s;
    const gunY = cfg.gunY * s;
    const gunZ = PLAYER_BARREL_BASE_Z;
    rig.gear = createGearUniforms(s);
    const part = (name) => {
      const mesh = parts.get(name)?.clone();
      if (mesh && hasGearData(mesh.geometry)) {
        mesh.material = markMaterialOwned(
          addGearMotion(addBakedGlow(mesh.material.clone(), cfg.glow), rig.gear)
        );
      }
      return mesh;
    };
    const wrap = (names, offsetY = 0, offsetZ = 0) => {
      const group = new THREE.Group();
      group.rotation.y = -Math.PI / 2;
      group.scale.setScalar(s);
      group.position.set(0, offsetY, offsetZ);
      names.forEach((name) => {
        const mesh = part(name);
        if (mesh) group.add(mesh);
      });
      return group;
    };
    const drop = (parent, child) => {
      disposeOwned(child);
      parent.remove(child);
    };
    const refill = (group, child) => {
      group.children.slice().forEach((c) => drop(group, c));
      group.add(child);
    };

    const hullTierGroups = new Set([
      ...rig.chassisGroups,
      ...rig.frameHullGroups,
      ...rig.engineGroups,
      ...rig.hullArmorGroups,
    ]);
    rig.hull.children.filter((c) => !hullTierGroups.has(c)).forEach((c) => drop(rig.hull, c));
    rig.hull.add(wrap(['Hull_Base']));
    rig.chassisGroups.forEach((g, i) => {
      refill(g, wrap([`CH${i + 1}`]));
    });
    rig.frameHullGroups.forEach((g, i) => refill(g, wrap([`F${i + 1}`])));
    rig.engineGroups.forEach((g, i) => refill(g, wrap([`E${i + 1}`, ...(i === 3 ? ['E4_Rotor'] : [])])));
    rig.hullArmorGroups.forEach((g, i) => refill(g, wrap([`A${i + 1}_Hull`])));
    const apsWrap = wrap(['APS_Pod_0', 'APS_Pod_1', 'APS_Pod_2', 'APS_Pod_3']);
    rig.hull.add(apsWrap);
    rig.apsPods = [...apsWrap.children];
    rig.engineFan = rig.engineGroups[3].children[0].children.find((m) => m.name === 'E4_Rotor') || null;

    const turretKeep = new Set([...rig.turretArmorGroups, rig.barrelPivot]);
    rig.turret.children.filter((c) => !turretKeep.has(c)).forEach((c) => drop(rig.turret, c));
    rig.turret.position.set(0, turretY, 0);
    const turretWrap = wrap(['Turret_Base', 'Missile_Pod', 'Missile_Warhead_0', 'Missile_Warhead_1'], -turretY);
    rig.turret.add(turretWrap);
    rig.missilePodGroup = turretWrap;
    rig.missileWarheads = turretWrap.children.filter((m) => m.name.startsWith('Missile_Warhead'));
    rig.turretArmorGroups.forEach((g, i) => refill(g, wrap([`A${i + 1}_Turret`], -turretY)));

    const gunKeep = new Set([...rig.cannonGroups, rig.muzzleFlash]);
    rig.barrelPivot.children.filter((c) => !gunKeep.has(c)).forEach((c) => drop(rig.barrelPivot, c));
    rig.barrelPivot.position.set(0, gunY - turretY, gunZ);
    rig.barrelPivot.add(wrap(['Gun_Base'], -gunY, -gunZ));
    rig.cannonGroups.forEach((g, i) => {
      if (i < 4) refill(g, wrap([`C${i + 1}`], -gunY, -gunZ));
    });
    const c5 = rig.cannonGroups[4];
    refill(c5, wrap(['C5_Housing'], -gunY, -gunZ));
    rig.c5Barrels = ['C5_Barrel_R', 'C5_Barrel_L'].map((name) => {
      const recoilGroup = new THREE.Group();
      recoilGroup.add(wrap([name], -gunY, -gunZ));
      c5.add(recoilGroup);
      return recoilGroup;
    });
    rig.flashOffsets = cfg.muzzleX.map((x) => x * s - gunZ);

    const clearance = this.playerClearance || new Map();
    const source = (group, name) => (clearance.has(name) ? { group, profile: clearance.get(name) } : null);
    rig.clearanceSources = [
      source(null, 'Hull_Base'),
      ...rig.chassisGroups.map((g, i) => source(g, `CH${i + 1}`)),
      ...rig.frameHullGroups.map((g, i) => source(g, `F${i + 1}`)),
      ...rig.engineGroups.map((g, i) => source(g, `E${i + 1}`)),
      ...rig.hullArmorGroups.map((g, i) => source(g, `A${i + 1}_Hull`)),
    ].filter(Boolean);
  }

  loadGlbTankModel(enemyClasses, url) {
    getTankGltfLoader(this.renderer).load(
      url,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const rawMeshes = [];
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          const mesh = node.clone();
          node.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          completeGearAttributes(mesh.geometry);
          rawMeshes.push(mesh);
        });
        enemyClasses.forEach((enemyClass) => {
          const cfg = GLB_TANK_MODELS[enemyClass];
          rawMeshes.forEach((m) => addBakedGlow(m.material, cfg.glow));
          let classParts;
          if (cfg.turrets?.length) {
            const hullMeshes = mergePivotGroup(
              rawMeshes.filter((m) => !m.name.startsWith('Turret') && !m.name.startsWith('Gun')).map((m) => m.clone())
            );
            const turretEntries = cfg.turrets.map((tCfg) => ({
              turret: mergePivotGroup(
                rawMeshes.filter((m) => m.name.startsWith(tCfg.turretPrefix)).map((m) => m.clone())
              ),
              gun: mergePivotGroup(
                rawMeshes.filter((m) => m.name.startsWith(tCfg.gunPrefix)).map((m) => m.clone())
              ),
              clearance: buildClearanceProfile(
                hullMeshes,
                tCfg.gunY ?? cfg.gunY,
                Math.abs(tCfg.muzzleX - tCfg.pivotX),
                Math.abs(tCfg.gunX - tCfg.pivotX),
                tCfg.pivotX
              ),
            }));
            classParts = {
              hull: hullMeshes,
              turret: turretEntries[0]?.turret || [],
              gun: turretEntries[0]?.gun || [],
              turrets: turretEntries,
              clearance: null,
            };
          } else {
            const hullMeshes = mergePivotGroup(
              rawMeshes.filter((m) => !m.name.startsWith('Turret') && !m.name.startsWith('Gun')).map((m) => m.clone())
            );
            const turretMeshes = mergePivotGroup(
              rawMeshes.filter((m) => m.name.startsWith('Turret')).map((m) => m.clone())
            );
            const gunMeshes = mergePivotGroup(
              rawMeshes.filter((m) => m.name.startsWith('Gun')).map((m) => m.clone())
            );
            classParts = {
              hull: hullMeshes,
              turret: turretMeshes,
              gun: gunMeshes,
              clearance: buildClearanceProfile(
                hullMeshes,
                cfg.gunY,
                cfg.muzzleX,
                (cfg.barrelBaseZ ?? ENEMY_BARREL_BASE_Z) / cfg.scale
              ),
            };
          }
          this.glbTankParts.set(enemyClass, classParts);
          (this.pendingEnemyRigs.get(enemyClass) || []).forEach((rig) => this.applyGlbTankModel(enemyClass, rig));
          this.pendingEnemyRigs.delete(enemyClass);
          this.onModelReady?.(enemyClass);
        });
      },
      undefined,
      (err) => {
        enemyClasses.forEach((enemyClass) => this.pendingEnemyRigs.delete(enemyClass));
        console.warn(`${enemyClasses.join(', ')} tank GLB unavailable, using procedural rig.`, err);
      }
    );
  }

  applyGlbTankModel(enemyClass, rig) {
    const { hull, turret, barrelPivot, muzzleFlash } = rig;
    const cfg = GLB_TANK_MODELS[enemyClass];
    const parts = this.glbTankParts.get(enemyClass);
    const s = cfg.scale;
    const turretY = cfg.turretY * s;
    const gunY = cfg.gunY * s;
    const gunZ = cfg.barrelBaseZ ?? ENEMY_BARREL_BASE_Z;
    const stealthMaterials = cfg.stealth ? [] : null;
    const gear = createGearUniforms(s);
    rig.gear = gear;
    const wrap = (meshes, offsetY, offsetZ, bakedDir = 1) => {
      const group = new THREE.Group();
      group.rotation.y = -bakedDir * (Math.PI / 2);
      group.scale.setScalar(s);
      group.position.set(0, offsetY, offsetZ);
      meshes.forEach((mesh) => {
        const copy = mesh.clone();
        const gearMesh = hasGearData(copy.geometry);
        if (stealthMaterials || gearMesh) {
          copy.material = markMaterialOwned(addBakedGlow(copy.material.clone(), cfg.glow));
          if (gearMesh) addGearMotion(copy.material, gear);
        }
        if (stealthMaterials) {
          copy.material.transparent = true;
          copy.material.opacity = 0.22;
          copy.castShadow = false;
          stealthMaterials.push(copy.material);
        }
        group.add(copy);
      });
      return group;
    };

    hull.children.forEach(disposeOwned);
    hull.clear();
    hull.add(wrap(parts.hull, 0, 0));

    if (cfg.turrets?.length && parts.turrets?.length && rig.turrets?.length) {
      cfg.turrets.forEach((tCfg, idx) => {
        const slot = rig.turrets[idx];
        const tParts = parts.turrets[idx];
        if (!slot || !tParts) return;
        const bakedDir = tCfg.bakedDir ?? 1;
        const slotTurretY = (tCfg.turretY ?? cfg.turretY) * s;
        const slotGunY = (tCfg.gunY ?? cfg.gunY) * s;
        const pivotZ = tCfg.pivotX * s;
        const baseBarrelZ = Math.abs(tCfg.gunX - tCfg.pivotX) * s;
        const muzzleLocalZ = Math.abs(tCfg.muzzleX - tCfg.gunX) * s;

        slot.turret.children.filter((c) => c !== slot.barrelPivot).forEach(disposeOwned);
        slot.barrelPivot.children.filter((c) => c !== slot.muzzleFlash).forEach(disposeOwned);
        slot.turret.children.filter((c) => c !== slot.barrelPivot).forEach((c) => slot.turret.remove(c));
        slot.barrelPivot.children.filter((c) => c !== slot.muzzleFlash).forEach((c) => slot.barrelPivot.remove(c));

        slot.pivotZ = pivotZ;
        slot.turretY = slotTurretY;
        slot.baseBarrelZ = baseBarrelZ;
        slot.muzzleDist = baseBarrelZ + muzzleLocalZ;
        slot.defaultYawOffset = tCfg.defaultYawOffset ?? 0;
        slot.clearanceSources = tParts.clearance ? [{ group: null, profile: tParts.clearance }] : [];

        const hullYaw = hull.rotation.y || 0;
        slot.turret.position.set(Math.sin(hullYaw) * pivotZ, slotTurretY, Math.cos(hullYaw) * pivotZ);
        slot.barrelPivot.position.set(0, slotGunY - slotTurretY, baseBarrelZ);
        slot.turret.add(wrap(tParts.turret, -slotTurretY, -bakedDir * tCfg.pivotX * s, bakedDir));
        slot.barrelPivot.add(wrap(tParts.gun, -slotGunY, -bakedDir * tCfg.gunX * s, bakedDir));
        slot.muzzleFlash.position.set(0, 0, muzzleLocalZ);
      });
      rig.muzzleDist = rig.turrets[0].muzzleDist;
      rig.radarDish = null;
      rig.missileMounts = null;
      rig.clearanceSources = [];
      return;
    }

    turret.children.filter((c) => c !== barrelPivot).forEach(disposeOwned);
    barrelPivot.children.filter((c) => c !== muzzleFlash).forEach(disposeOwned);
    turret.children.filter((c) => c !== barrelPivot).forEach((c) => turret.remove(c));
    barrelPivot.children.filter((c) => c !== muzzleFlash).forEach((c) => barrelPivot.remove(c));

    turret.position.set(0, turretY, 0);
    barrelPivot.position.set(0, gunY - turretY, gunZ);
    const turretWrap = wrap(parts.turret, -turretY, 0);
    turret.add(turretWrap);
    barrelPivot.add(wrap(parts.gun, -gunY, -gunZ));
    muzzleFlash.position.set(0, ((cfg.muzzleY ?? cfg.gunY) - cfg.gunY) * s, cfg.muzzleX * s - gunZ);
    rig.radarDish = turretWrap.children.find((m) => m.name === 'Turret_Dish') || null;
    if (stealthMaterials && rig.stealthMaterials) {
      rig.stealthMaterials.splice(0, rig.stealthMaterials.length, ...stealthMaterials);
    }
    rig.muzzleDist = cfg.muzzleX * s;
    rig.missileMounts = cfg.missileMounts
      ? cfg.missileMounts.map(([fwd, left]) => ({ forward: fwd * s, left: left * s }))
      : null;
    rig.clearanceSources = parts.clearance ? [{ group: null, profile: parts.clearance }] : [];
  }

  createDefenseTurretRig(turretType = 'CANNON') {
    const root = new THREE.Group();
    const hull = new THREE.Group();
    const turret = new THREE.Group();
    const barrelPivot = new THREE.Group();

    // Procedural fallback base (reinforced octagonal concrete barbette)
    const baseGeo = new THREE.CylinderGeometry(0.86, 0.96, 0.54, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      map: this.concreteTex?.diffuse || null,
      color: 0x475569,
      roughness: 0.92,
      metalness: 0.05,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.27;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    hull.add(baseMesh);

    const collarGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.08, 16);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.85,
    });
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.position.y = 0.58;
    collarMesh.castShadow = true;
    hull.add(collarMesh);

    // Procedural fallback turret dome
    turret.position.set(0, 0.62, 0);
    const armorColor = turretType === 'HOWITZER' ? 0x0f766e : turretType === 'MLRS' ? 0x991b1b : 0x334155;
    const turretMat = new THREE.MeshStandardMaterial({
      color: armorColor,
      roughness: 0.62,
      metalness: 0.65,
    });
    const turretMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.38, 1.1), turretMat);
    turretMesh.position.y = 0.19;
    turretMesh.castShadow = true;
    turret.add(turretMesh);

    // Procedural fallback weapon mount
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.88,
    });
    if (turretType === 'HOWITZER') {
      const howitzerGun = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 1.15, 16), gunMat);
      howitzerGun.rotation.x = Math.PI / 2 - Math.PI / 6;
      howitzerGun.position.set(0, 0.25, 0.62);
      barrelPivot.add(howitzerGun);
    } else if (turretType === 'MLRS') {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.52, 1.15), turretMat);
      pod.rotation.x = -Math.PI / 9;
      pod.position.set(0, 0.26, 0.45);
      barrelPivot.add(pod);
    } else {
      const cannonGun = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 1.55, 16), gunMat);
      cannonGun.rotation.x = Math.PI / 2;
      cannonGun.position.set(0, 0.18, 0.85);
      barrelPivot.add(cannonGun);
    }
    turret.add(barrelPivot);

    root.add(hull);
    root.add(turret);

    // Health bar above turret
    const hpBarBg = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.1, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x111827 })
    );
    hpBarBg.position.set(0, 1.45, 0);

    const hpBarFill = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.08, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    hpBarFill.position.set(0, 1.45, 0.01);
    root.add(hpBarBg);
    root.add(hpBarFill);

    const rig = {
      root,
      hull,
      turret,
      barrelPivot,
      hpBarBg,
      hpBarFill,
      muzzleDist: turretType === 'HOWITZER' ? 1.4 : turretType === 'MLRS' ? 1.4 : 1.6,
    };

    if (this.glbTurretParts.has(turretType)) {
      this.applyGlbDefenseTurretModel(turretType, rig);
    } else if (!this.isSoftwareGl) {
      const pending = this.pendingTurretRigs.get(turretType) || [];
      pending.push(rig);
      this.pendingTurretRigs.set(turretType, pending);
      this.loadDefenseTurretGlbModel(turretType);
    }

    return rig;
  }

  loadDefenseTurretGlbModel(turretType) {
    const cfg = GLB_DEFENSE_TURRETS[turretType];
    if (!cfg || this.glbTurretRequestedUrls.has(cfg.url)) return;
    this.glbTurretRequestedUrls.add(cfg.url);

    getTankGltfLoader(this.renderer).load(
      cfg.url,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const parts = { hull: [], turret: [], gun: [] };
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          const mesh = node.clone();
          node.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (node.name.startsWith('Turret')) parts.turret.push(mesh);
          else if (node.name.startsWith('Gun')) parts.gun.push(mesh);
          else parts.hull.push(mesh);
        });
        this.glbTurretParts.set(turretType, parts);
        const pending = this.pendingTurretRigs.get(turretType) || [];
        pending.forEach((rig) => this.applyGlbDefenseTurretModel(turretType, rig));
        this.pendingTurretRigs.delete(turretType);
      },
      undefined,
      (err) => {
        this.pendingTurretRigs.delete(turretType);
        console.warn(`Defense turret GLB ${turretType} unavailable, using procedural rig.`, err);
      }
    );
  }

  applyGlbDefenseTurretModel(turretType, rig) {
    const { hull, turret, barrelPivot } = rig;
    const parts = this.glbTurretParts.get(turretType);
    if (!parts) return;

    hull.children.forEach(disposeOwned);
    turret.children.filter((c) => c !== barrelPivot).forEach(disposeOwned);
    barrelPivot.children.forEach(disposeOwned);
    hull.clear();
    turret.children.filter((c) => c !== barrelPivot).forEach((c) => turret.remove(c));
    barrelPivot.clear();

    const wrap = (meshes, offsetY = 0) => {
      const group = new THREE.Group();
      group.rotation.y = -Math.PI / 2;
      group.position.set(0, offsetY, 0);
      meshes.forEach((mesh) => {
        group.add(mesh.clone());
      });
      return group;
    };

    turret.position.set(0, 0.62, 0);
    barrelPivot.position.set(0, 0, 0);
    hull.add(wrap(parts.hull, 0));
    turret.add(wrap(parts.turret, -0.62));
    barrelPivot.add(wrap(parts.gun, -0.62));
  }

  createGroundDecalMesh(span) {
    const size = this.isSoftwareGl ? 512 : 1024;
    const px = size / span;
    const rand = mulberry32(7777);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;

    for (let i = 0; i < 70; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = (2 + rand() * 6) * px;
      const dust = rand() < 0.45;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, dust ? 'rgba(120, 130, 150, 0.09)' : 'rgba(64, 48, 32, 0.16)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const gauge = 0.95 * px;
    for (let t = 0; t < 14; t++) {
      const x = rand() * size;
      const y = rand() * size;
      const heading = Math.floor(rand() * 4) * (Math.PI / 2);
      const steps = 40 + Math.floor(rand() * 60);
      ctx.lineWidth = 0.32 * px;
      ctx.strokeStyle = 'rgba(4, 6, 10, 0.42)';
      ctx.setLineDash([0.12 * px, 0.1 * px]);
      for (const side of [-1, 1]) {
        let sx = x;
        let sy = y;
        let h = heading;
        const r2 = mulberry32(t * 97 + 13);
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(h + Math.PI / 2) * gauge * side, sy + Math.sin(h + Math.PI / 2) * gauge * side);
        for (let s = 0; s < steps; s++) {
          if (r2() < 0.06) h += (r2() < 0.5 ? -1 : 1) * (Math.PI / 2) * 0.25;
          sx += Math.cos(h) * px * 0.6;
          sy += Math.sin(h) * px * 0.6;
          ctx.lineTo(sx + Math.cos(h + Math.PI / 2) * gauge * side, sy + Math.sin(h + Math.PI / 2) * gauge * side);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    for (let i = 0; i < 22; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = (0.6 + rand() * 1.4) * px;
      const burn = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      burn.addColorStop(0, 'rgba(2, 2, 4, 0.55)');
      burn.addColorStop(0.45, 'rgba(10, 8, 8, 0.3)');
      burn.addColorStop(1, 'rgba(10, 8, 8, 0)');
      ctx.fillStyle = burn;
      ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
      ctx.strokeStyle = 'rgba(110, 120, 140, 0.08)';
      for (let k = 0; k < 5; k++) {
        const a0 = rand() * TAU;
        ctx.lineWidth = (0.06 + rand() * 0.1) * px;
        ctx.beginPath();
        ctx.arc(x, y, r * (0.9 + rand() * 0.25), a0, a0 + 0.4 + rand() * 0.8);
        ctx.stroke();
      }
      for (let k = 0; k < 14; k++) {
        const a = rand() * TAU;
        const d = r * (1.1 + rand() * 1.4);
        ctx.fillStyle = 'rgba(6, 6, 8, 0.45)';
        ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.1 * px, 0.1 * px);
      }
    }

    for (let i = 0; i < 12; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rx = (0.4 + rand() * 0.9) * px;
      const ry = rx * (0.5 + rand() * 0.4);
      const a = rand() * Math.PI;
      ctx.fillStyle = 'rgba(2, 3, 6, 0.4)';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, a, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 70, 140, 0.16)';
      ctx.lineWidth = 0.06 * px;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.8, ry * 0.8, a, 0, TAU);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    tex.needsUpdate = true;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -0.5,
        polygonOffsetUnits: -0.5,
      })
    );
    mesh.position.z = 0.004;
    mesh.receiveShadow = true;
    return mesh;
  }

  updateAnimatedTextures(dt) {
    this.animTime = (this.animTime || 0) + dt;
    const water = this.waterTex;
    if (water) {
      water.color.offset.x = (water.color.offset.x + dt * 0.012) % 1;
      water.color.offset.y = (water.color.offset.y + dt * 0.02) % 1;
      water.normal.offset.x = (water.normal.offset.x - dt * 0.03) % 1;
      water.normal.offset.y = (water.normal.offset.y + dt * 0.045) % 1;
    }
    const sp = this.spawnerMats;
    if (sp) {
      sp.glowTex.rotation = (sp.glowTex.rotation + dt * 0.6) % (Math.PI * 2);
      sp.coreTex.rotation = sp.glowTex.rotation;
      const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 3.2);
      sp.coreTop.emissiveIntensity = 0.9 + pulse * 0.9;
      sp.coreSide.emissiveIntensity = 0.6 + pulse * 0.6;
    }
    if (this.hqMats) {
      const r = this.hqMats.repairTex;
      r.rotation = (r.rotation - dt * 0.08) % (Math.PI * 2);
    }
    if (this.enemyBaseMats) {
      const m = this.enemyBaseMats;
      m.ringTex.rotation = (m.ringTex.rotation + dt * 0.5) % (Math.PI * 2);
      m.core.emissiveIntensity = 1.4 + 0.8 * (0.5 + 0.5 * Math.sin(this.animTime * 4));
      m.lamp.emissiveIntensity = Math.sin(this.animTime * 3) > 0.2 ? 3 : 0.4;
      m.glow.emissiveIntensity = 1.4 + 0.25 * Math.sin(this.animTime * 1.6);
    }
  }

  /**
   * Lazily generates and caches a crisp holographic "LOADING..." badge texture.
   */
  getLoadingBadgeTexture() {
    if (this._loadingBadgeTex) return this._loadingBadgeTex;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = 'rgba(11, 15, 23, 0.88)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(4, 4, 248, 56, 12);
    } else {
      ctx.rect(4, 4, 248, 56);
    }
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px "Consolas", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⬡ LOADING...', 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this._loadingBadgeTex = tex;
    return tex;
  }

  /**
   * Creates an ultra-lightweight, holographic proxy tank used while GLB 3D models are downloading.
   * Visually indicates that the tank asset is actively loading via glowing cyan wireframe edges,
   * a translucent cybernetic hull, ground calibration ring, and a floating "LOADING..." badge.
   */
  createLoadingTankRig({ isPlayer = false, enemyClass = null } = {}) {
    const root = new THREE.Group();
    const hull = new THREE.Group();
    const turret = new THREE.Group();
    const barrelPivot = new THREE.Group();

    const isBoss =
      enemyClass === EnemyClass.BOSS_MAMMOTH ||
      enemyClass === EnemyClass.BOSS_HYDRA ||
      enemyClass === EnemyClass.BOSS_INFERNO ||
      enemyClass === EnemyClass.BOSS_TITAN;

    const scale = isBoss
      ? 1.48
      : enemyClass === EnemyClass.SCOUT || enemyClass === EnemyClass.KAMIKAZE
      ? 0.86
      : 1.0;

    // Ground shadow plane
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4 * scale, 2.6 * scale),
      shadowMat
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    root.add(shadowMesh);

    // Glowing ground calibration ring (holographic projection pad)
    const ringGeo = new THREE.RingGeometry(0.85 * scale, 0.95 * scale, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.025;
    hull.add(ringMesh);

    // Holographic cyber materials
    const holoMat = new THREE.MeshStandardMaterial({
      map: this.tankArmorTex,
      color: 0x0f2b3c,
      roughness: 0.35,
      metalness: 0.7,
      transparent: true,
      opacity: 0.58,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    });
    const trackMat = new THREE.MeshStandardMaterial({
      map: this.trackTreadTex,
      color: 0x091e2f,
      roughness: 0.45,
      metalness: 0.6,
      transparent: true,
      opacity: 0.65,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
    });
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });

    const addHoloBox = (parent, w, h, d, x = 0, y = 0, z = 0, rx = 0, mat = holoMat) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      mesh.castShadow = true;
      parent.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat);
      mesh.add(edges);
      return mesh;
    };

    const addHoloCylinder = (parent, rt, rb, h, segs, x = 0, y = 0, z = 0, rx = 0) => {
      const geo = new THREE.CylinderGeometry(rt, rb, h, segs);
      const mesh = new THREE.Mesh(geo, holoMat);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      mesh.castShadow = true;
      parent.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat);
      mesh.add(edges);
      return mesh;
    };

    // Hull & tracks
    addHoloBox(hull, 1.15 * scale, 0.36 * scale, 1.8 * scale, 0, 0.28 * scale, 0);
    addHoloBox(hull, 1.05 * scale, 0.22 * scale, 0.6 * scale, 0, 0.2 * scale, 0.95 * scale, -0.35);
    addHoloBox(hull, 0.32 * scale, 0.38 * scale, 2.1 * scale, -0.72 * scale, 0.22 * scale, 0, 0, trackMat);
    addHoloBox(hull, 0.32 * scale, 0.38 * scale, 2.1 * scale, 0.72 * scale, 0.22 * scale, 0, 0, trackMat);
    root.add(hull);

    // Turret & Gun Barrel
    turret.position.set(0, 0.46 * scale, 0);
    addHoloBox(turret, 0.8 * scale, 0.32 * scale, 1.05 * scale, 0, 0.16 * scale, 0);
    addHoloBox(turret, 0.52 * scale, 0.24 * scale, 0.35 * scale, 0, 0.14 * scale, 0.55 * scale);

    // Floating Holographic "LOADING..." Badge on turret
    const badgeTex = this.getLoadingBadgeTexture();
    if (badgeTex) {
      const badgeMat = new THREE.SpriteMaterial({
        map: badgeTex,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const badge = new THREE.Sprite(badgeMat);
      badge.scale.set(1.4 * scale, 0.35 * scale, 1);
      badge.position.set(0, 0.82 * scale, 0);
      turret.add(badge);
    }

    barrelPivot.position.set(0, 0.14 * scale, 0.55 * scale);
    addHoloCylinder(barrelPivot, 0.06 * scale, 0.075 * scale, 1.25 * scale, 12, 0, 0, 0.65 * scale, Math.PI / 2);
    addHoloCylinder(barrelPivot, 0.095 * scale, 0.095 * scale, 0.18 * scale, 12, 0, 0, 1.28 * scale, Math.PI / 2);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
    });
    const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 8, 8), flashMat);
    muzzleFlash.visible = false;
    muzzleFlash.castShadow = false;
    muzzleFlash.receiveShadow = false;
    muzzleFlash.position.set(0, 0, 1.35 * scale);
    barrelPivot.add(muzzleFlash);
    turret.add(barrelPivot);
    root.add(turret);

    let turrets = null;
    let hpBarBg = null;
    let hpBarFill = null;

    if (!isPlayer) {
      // Enemy HP bar meshes
      const hpBgMat = new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      });
      hpBarBg = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * scale, 0.12 * scale), hpBgMat);
      hpBarBg.rotation.x = -Math.PI / 2;
      hpBarBg.position.set(0, 1.65 * scale, 0);
      hpBarBg.visible = false;

      const hpFillMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
      hpBarFill = new THREE.Mesh(new THREE.PlaneGeometry(1.16 * scale, 0.08 * scale), hpFillMat);
      hpBarFill.rotation.x = -Math.PI / 2;
      hpBarFill.position.set(0, 1.66 * scale, 0);
      hpBarFill.visible = false;

      root.add(hpBarBg);
      root.add(hpBarFill);

      if (enemyClass === EnemyClass.BOSS_TITAN) {
        const frontPivotZ = 1.023;
        const rearPivotZ = -1.023;
        turret.position.set(0, 0.46 * scale, frontPivotZ);

        const rearTurret = new THREE.Group();
        rearTurret.position.set(0, 0.46 * scale, rearPivotZ);
        rearTurret.rotation.y = Math.PI;
        addHoloBox(rearTurret, 0.8 * scale, 0.32 * scale, 1.05 * scale, 0, 0.16 * scale, 0);
        addHoloBox(rearTurret, 0.52 * scale, 0.24 * scale, 0.35 * scale, 0, 0.14 * scale, 0.55 * scale);

        if (badgeTex) {
          const rearBadgeMat = new THREE.SpriteMaterial({
            map: badgeTex,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
          });
          const rearBadge = new THREE.Sprite(rearBadgeMat);
          rearBadge.scale.set(1.4 * scale, 0.35 * scale, 1);
          rearBadge.position.set(0, 0.82 * scale, 0);
          rearTurret.add(rearBadge);
        }

        const rearBarrelPivot = new THREE.Group();
        rearBarrelPivot.position.set(0, 0.14 * scale, 0.55 * scale);
        addHoloCylinder(rearBarrelPivot, 0.06 * scale, 0.075 * scale, 1.25 * scale, 12, 0, 0, 0.65 * scale, Math.PI / 2);
        addHoloCylinder(rearBarrelPivot, 0.095 * scale, 0.095 * scale, 0.18 * scale, 12, 0, 0, 1.28 * scale, Math.PI / 2);

        const rearFlash = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 8, 8), flashMat);
        rearFlash.visible = false;
        rearFlash.castShadow = false;
        rearFlash.receiveShadow = false;
        rearFlash.position.set(0, 0, 1.35 * scale);
        rearBarrelPivot.add(rearFlash);
        rearTurret.add(rearBarrelPivot);
        root.add(rearTurret);

        turrets = [
          {
            turret,
            barrelPivot,
            muzzleFlash,
            pivotZ: frontPivotZ,
            turretY: turret.position.y,
            baseBarrelZ: barrelPivot.position.z,
            muzzleDist: barrelPivot.position.z + muzzleFlash.position.z,
            defaultYawOffset: 0,
            clearanceSources: [],
          },
          {
            turret: rearTurret,
            barrelPivot: rearBarrelPivot,
            muzzleFlash: rearFlash,
            pivotZ: rearPivotZ,
            turretY: rearTurret.position.y,
            baseBarrelZ: rearBarrelPivot.position.z,
            muzzleDist: rearBarrelPivot.position.z + rearFlash.position.z,
            defaultYawOffset: Math.PI,
            clearanceSources: [],
          },
        ];
      }
    }

    // Player-specific upgrade track slot groups
    const chassisGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;
    const frameHullGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;
    const engineGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;
    const hullArmorGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;
    const turretArmorGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;
    const cannonGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;

    if (isPlayer) {
      chassisGroups.forEach((g) => hull.add(g));
      frameHullGroups.forEach((g) => hull.add(g));
      engineGroups.forEach((g) => hull.add(g));
      hullArmorGroups.forEach((g) => hull.add(g));
      turretArmorGroups.forEach((g) => turret.add(g));
      cannonGroups.forEach((g) => barrelPivot.add(g));
    }

    const rig = {
      root,
      hull,
      turret,
      barrelPivot,
      muzzleFlash,
      shadowMesh,
      turrets,
      hpBarBg,
      hpBarFill,
      radarDish: null,
      stealthMaterials: null,
      muzzleDist: barrelPivot.position.z + muzzleFlash.position.z,
      missileMounts: null,
      clearanceSources: [],
      flashOffsets: isPlayer ? [1.25, 1.44, 1.62, 1.74, 1.82] : null,
      chassisGroups,
      frameHullGroups,
      engineGroups,
      hullArmorGroups,
      turretArmorGroups,
      cannonGroups,
      c5Barrels: null,
      engineFan: null,
      missilePodGroup: null,
      missileWarheads: [],
      apsPods: [],
    };

    return rig;
  }

  /**
   * Creates a player tank rig. While the player GLB is loading, uses the lightweight holographic loading proxy.
   */
  createPlayerTank() {
    const rig = this.createLoadingTankRig({ isPlayer: true });
    markOwned(rig.root);
    if (this.playerGlbParts) {
      this.applyPlayerGlb(rig);
    } else if (!this.isSoftwareGl) {
      this.pendingPlayerRigs.push(rig);
    }

    this.updatePlayerTankVisuals(
      rig,
      { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 },
      false,
      2,
      [1, 0, 0, 1],
      0,
      0
    );

    return rig;
  }

  /** Synchronizes the player tank's 3D meshes with current upgrade levels (1..5). */
  updatePlayerTankVisuals(
    rig,
    upgrades,
    hoverActive = false,
    missileAmmo = 0,
    apsAmmo = [0, 0, 0, 0],
    wheelDelta = 0,
    elapsed = 0
  ) {
    if (!rig) return;
    void hoverActive;
    void wheelDelta;

    const cannonIdx = Math.max(0, Math.min(4, (upgrades?.cannon || 1) - 1));
    const rawChassisLvl = upgrades?.chassis || upgrades?.vehicleFrame || 1;
    const chassisIdx = Math.max(0, Math.min(4, rawChassisLvl - 1));
    const rawFrameLvl = upgrades?.frame || upgrades?.vehicleFrame || 1;
    const frameIdx = Math.max(0, Math.min(4, rawFrameLvl - 1));
    const engineIdx = Math.max(0, Math.min(4, (upgrades?.engine || 1) - 1));
    const armorIdx = Math.max(0, Math.min(4, (upgrades?.armor || 1) - 1));

    if (rig.cannonGroups) {
      rig.cannonGroups.forEach((g, idx) => {
        setPartActive(g, idx === cannonIdx);
      });
      const flashOffsets = rig.flashOffsets || [1.25, 1.44, 1.62, 1.74, 1.82];
      rig.muzzleFlash.position.z = flashOffsets[cannonIdx] || 1.35;
    }

    if (rig.chassisGroups) {
      rig.chassisGroups.forEach((g, idx) => {
        setPartActive(g, idx === chassisIdx);
      });
    }

    if (rig.frameHullGroups) {
      rig.frameHullGroups.forEach((g, idx) => {
        setPartActive(g, idx === frameIdx);
      });
    }

    if (rig.engineGroups) {
      rig.engineGroups.forEach((g, idx) => {
        setPartActive(g, idx === engineIdx);
      });
    }

    if (rig.hullArmorGroups) {
      rig.hullArmorGroups.forEach((g, idx) => {
        setPartActive(g, idx === armorIdx);
      });
    }

    if (rig.turretArmorGroups) {
      rig.turretArmorGroups.forEach((g, idx) => {
        setPartActive(g, idx === armorIdx);
      });
    }

    if (rig.apsPods && Array.isArray(apsAmmo)) {
      rig.apsPods.forEach((pod, idx) => {
        pod.visible = (apsAmmo[idx] || 0) > 0;
        pod.rotation.y = elapsed * 1.8 + idx * 1.5;
      });
    }

    if (rig.missileWarheads) {
      rig.missileWarheads.forEach((wh, idx) => {
        wh.visible = idx < missileAmmo;
      });
    }

    if (rig.engineFan && engineIdx === 3) {
      rig.engineFan.rotation.y = -elapsed * 15.0;
    }
  }

  /**
   * Creates an enemy tank rig. While the enemy GLB is loading, uses the lightweight holographic loading proxy.
   */
  createEnemyTank(enemyClass) {
    const rig = this.createLoadingTankRig({ isPlayer: false, enemyClass });
    markOwned(rig.root);
    if (this.glbTankParts.has(enemyClass)) {
      this.applyGlbTankModel(enemyClass, rig);
    } else if (!this.isSoftwareGl && GLB_TANK_MODELS[enemyClass]) {
      const pending = this.pendingEnemyRigs.get(enemyClass) || [];
      pending.push(rig);
      this.pendingEnemyRigs.set(enemyClass, pending);
      this.ensureEnemyModels([enemyClass]);
    }
    return rig;
  }

  createLandMineMesh() {
    const group = new THREE.Group();
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.75,
    });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.48, 0.14, 12),
      casingMat
    );
    disc.position.y = 0.07;
    group.add(disc);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.18, 10),
      beaconMat
    );
    core.position.y = 0.1;
    group.add(core);

    const ringGeo = new THREE.RingGeometry(0.68, 0.78, 22);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.03;
    group.add(ring);

    return markOwned(group);
  }

  getCommandBaseMaterials() {
    if (this.hqMats) return this.hqMats;
    const t = this.generated('createCommandBaseTextures');
    const std = (params) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1, ...params });
    this.hqMats = {
      wall: std({ map: t.wall, roughness: 0.88 }),
      roof: std({ color: 0x575d67, roughness: 0.9 }),
      trim: std({ color: 0x9aa0aa, roughness: 0.85 }),
      interior: std({ color: 0x4a4f58, emissive: 0x3a2a10, emissiveIntensity: 0.6, roughness: 0.95 }),
      apron: std({ map: t.apron, roughness: 0.92 }),
      bay: std({ map: t.bay, emissive: 0x2a2010, emissiveIntensity: 0.8, roughness: 0.92 }),
      hazard: std({ map: t.hazard, roughness: 0.7 }),
      red: std({ color: 0xb3261e, roughness: 0.6 }),
      crane: std({ color: 0xe0a815, roughness: 0.5, metalness: 0.35 }),
      steel: std({ color: 0x3a3f47, roughness: 0.5, metalness: 0.6 }),
      sign: std({ map: t.sign, alphaTest: 0.5, roughness: 0.6 }),
      lamp: std({ color: 0x6b4a10, emissive: 0xffc861, emissiveIntensity: 2.2 }),
      fuel: std({ map: t.fuel, roughness: 0.55, metalness: 0.35 }),
      fuelCap: std({ color: 0x4b553a, roughness: 0.55, metalness: 0.35 }),
      crate: std({ map: t.crate, roughness: 0.9 }),
      tank: std({ color: 0x9a9258, roughness: 0.7, metalness: 0.15 }),
      track: std({ color: 0x2c2f33, roughness: 0.9, metalness: 0.3 }),
      cabinet: std({ color: 0x5c626b, roughness: 0.6, metalness: 0.4 }),
      repair: new THREE.MeshBasicMaterial({
        map: t.repair,
        color: 0x10b981,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      repairTex: t.repair,
    };
    return this.hqMats;
  }

  /**
   * Allied HQ: a two-bay drive-through tank workshop on a 2x1-cell apron (origin at the footprint centre,
   * long side along X). Both bay faces are open, so the parked tank shows from either camera side.
   */
  createCommandBaseBlock() {
    const group = new THREE.Group();
    const m = this.getCommandBaseMaterials();
    const add = (parent, mesh, x, y, z, shadow) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (w, h, d, mat, x, y, z, shadow = true, parent = group) =>
      add(parent, new THREE.Mesh(this.sharedGeometry('BoxGeometry', w, h, d), mat), x, y, z, shadow);
    const W = TILE_SIZE * 2 - 0.1;
    const D = TILE_SIZE - 0.1;

    // Apron slab with low kerbs, corner bollards and kerb lights.
    box(W, 0.1, D, m.apron, 0, 0.05, 0, false);
    for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) {
      for (const x of [-1.45, 1.45]) box(0.9, 0.12, 0.1, m.trim, x, 0.16, z);
    }
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
      box(0.1, 0.12, D, m.trim, x, 0.16, 0);
      for (const z of [-0.45, 0.45]) box(0.02, 0.04, 0.16, m.lamp, x + Math.sign(x) * 0.05, 0.16, z, false);
      for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) box(0.16, 0.24, 0.16, m.trim, x - Math.sign(x) * 0.05, 0.22, z);
    }

    // Hangar shell: three full-depth piers, roof deck, and headers with a red band over both open faces.
    const HX = -0.15;
    const HW = 2.5;
    const HD = 1.5;
    const pierW = 0.2;
    const wallH = 1.15;
    const doorH = 0.76;
    const headerH = wallH - doorH;
    for (const x of [HX - HW / 2, HX, HX + HW / 2]) {
      // End piers rise above the roof deck like the buttresses of the concept; the centre pier sits flush.
      const pierH = wallH + (x === HX ? 0.12 : 0.3);
      box(pierW, pierH, HD + 0.08, m.wall, x, 0.1 + pierH / 2, 0);
      if (x !== HX) box(pierW + 0.04, 0.04, HD + 0.12, m.trim, x, 0.12 + pierH, 0, false);
      for (const z of [-1, 1]) box(pierW + 0.01, 0.42, 0.02, m.hazard, x, 0.33, z * (HD / 2 + 0.05), false);
    }
    box(HW, 0.12, HD + 0.04, m.roof, HX, 0.1 + wallH + 0.06, 0);
    for (const i of [-3, -2, -1, 1, 2, 3]) {
      box(0.02, 0.02, HD - 0.1, m.trim, HX + (i * HW) / 8, 0.1 + wallH + 0.13, 0, false);
    }
    for (const z of [-1, 1]) {
      const fz = z * (HD / 2 - 0.04);
      const headerY = 0.1 + doorH + headerH / 2;
      box(HW, headerH, 0.12, m.wall, HX, headerY, fz);
      box(HW + 0.01, 0.07, 0.13, m.red, HX, headerY + 0.02, fz);
      for (const bx of [HX - HW / 4, HX + HW / 4]) box(0.22, 0.03, 0.05, m.lamp, bx, 0.1 + doorH - 0.02, fz - z * 0.06, false);
      const sign = add(group, new THREE.Mesh(this.sharedGeometry('PlaneGeometry', 0.92, 0.345), m.sign), HX, headerY, z * (HD / 2 + 0.065), false);
      if (z < 0) sign.rotation.y = Math.PI;
    }

    // Bays: dark floor plates, ceiling lights and a yellow gantry crane with a hook in each bay.
    for (const bx of [HX - HW / 4, HX + HW / 4]) {
      box(HW / 2 - pierW, 0.012, HD - 0.04, m.bay, bx, 0.106, 0, false);
      box(HW / 2 - pierW, 0.02, HD, m.interior, bx, 0.1 + wallH - 0.01, 0, false);
      box(HW / 2 - pierW, 0.08, 0.1, m.crane, bx, 0.1 + doorH - 0.08, 0);
      box(0.12, 0.08, 0.1, m.crane, bx + 0.12, 0.1 + doorH - 0.15, 0);
      box(0.015, 0.12, 0.015, m.steel, bx + 0.12, 0.1 + doorH - 0.25, 0, false);
      box(0.06, 0.05, 0.03, m.crane, bx + 0.12, 0.1 + doorH - 0.33, 0, false);
      for (const z of [-0.3, 0.3]) box(0.16, 0.025, 0.06, m.lamp, bx, 0.1 + wallH - 0.03, z, false);
    }

    // Parked tank on service ramps in the west bay.
    const tank = new THREE.Group();
    for (const z of [-0.26, 0.26]) box(0.9, 0.04, 0.12, m.steel, 0, 0.02, z, true, tank);
    for (const x of [-0.26, 0.26]) box(0.14, 0.15, 0.82, m.track, x, 0.13, 0, true, tank);
    box(0.42, 0.14, 0.86, m.tank, 0, 0.21, 0, true, tank);
    box(0.66, 0.03, 0.78, m.tank, 0, 0.22, 0, true, tank);
    box(0.36, 0.13, 0.38, m.tank, 0, 0.345, 0.05, true, tank);
    box(0.12, 0.05, 0.14, m.tank, 0.08, 0.43, 0.08, true, tank);
    const barrel = add(tank, new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 0.03, 0.035, 0.42, 8), m.tank), 0, 0.35, -0.33, true);
    barrel.rotation.x = Math.PI / 2;
    tank.position.set(HX - HW / 4, 0.11, 0.06);
    tank.scale.setScalar(0.95);
    group.add(tank);

    // East bay: tool chest and parts cabinet.
    const toolX = HX + HW / 2 - pierW / 2 - 0.15;
    box(0.26, 0.2, 0.14, m.red, toolX, 0.2, -0.3);
    box(0.27, 0.02, 0.15, m.steel, toolX, 0.31, -0.3, false);
    box(0.16, 0.36, 0.2, m.cabinet, toolX + 0.03, 0.28, 0.32);

    // Fuel depot at the east end: tank on saddles inside a yellow guard rail.
    const fuelX = W / 2 - 0.36;
    const fuelTank = add(group, new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 0.2, 0.2, 0.86, 16), m.fuel), fuelX, 0.36, 0, true);
    fuelTank.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    for (const z of [-1, 1]) {
      const cap = add(group, new THREE.Mesh(this.sharedGeometry('SphereGeometry', 0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.fuelCap), fuelX, 0.36, z * 0.43, false);
      cap.scale.set(1, 0.35, 1);
      cap.rotation.x = z * Math.PI / 2;
    }
    for (const z of [-0.25, 0.25]) box(0.32, 0.14, 0.08, m.steel, fuelX, 0.17, z);
    box(0.08, 0.06, 0.08, m.fuelCap, fuelX, 0.58, -0.32);
    const railY = 0.32;
    for (const x of [fuelX - 0.29, fuelX + 0.29]) {
      box(0.025, 0.025, 1.1, m.crane, x, railY, 0, false);
      for (const z of [-0.54, 0, 0.54]) box(0.025, railY - 0.1, 0.025, m.crane, x, 0.1 + (railY - 0.1) / 2, z, false);
    }
    for (const z of [-0.55, 0.55]) box(0.6, 0.025, 0.025, m.crane, fuelX, railY, z, false);

    // Ammunition crates at the west end.
    const crateX = -W / 2 + 0.3;
    box(0.36, 0.3, 0.42, m.crate, crateX, 0.25, 0.26);
    box(0.26, 0.2, 0.26, m.crate, crateX + 0.02, 0.2, -0.3).rotation.y = 0.25;
    box(0.22, 0.16, 0.24, m.crate, crateX - 0.01, 0.48, 0.24).rotation.y = -0.15;

    const repairGeo = new THREE.CircleGeometry(7.0, 64);
    repairGeo.rotateX(-Math.PI / 2);
    const repairZone = new THREE.Mesh(repairGeo, m.repair);
    repairZone.position.y = 0.03;
    repairZone.renderOrder = 1;
    // Only the repair disc geometry is per-instance; hangar parts use the shared geometry cache.
    group.add(markOwned(repairZone, { materials: false }));
    return group;
  }

  getEnemyBaseMaterials() {
    if (this.enemyBaseMats) return this.enemyBaseMats;
    const t = this.generated('createEnemyBaseTextures');
    const tiled = (texture, repeatX) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, 1);
      texture.needsUpdate = true;
      return texture;
    };
    const standard = (params) => new THREE.MeshStandardMaterial(params);
    this.enemyBaseMats = {
      stone: standard({ map: tiled(t.stone, 4), roughness: 0.88, metalness: 0.05 }),
      metal: standard({ color: 0x2b313a, roughness: 0.55, metalness: 0.55 }),
      wall: standard({ map: t.wall, roughness: 0.5, metalness: 0.6 }),
      glow: standard({ color: 0x991b1b, emissive: 0xff1010, emissiveIntensity: 1.5, roughness: 0.4 }),
      hazard: standard({ map: tiled(t.hazard, 8), roughness: 0.7, metalness: 0.1 }),
      barrier: standard({ map: t.barrier, roughness: 0.7, metalness: 0.05 }),
      banner: standard({
        map: t.banner,
        emissive: 0xffffff,
        emissiveMap: t.banner,
        emissiveIntensity: 0.35,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.8,
      }),
      rail: standard({ color: 0xeab308, roughness: 0.5, metalness: 0.3 }),
      dome: standard({ color: 0x7f1d1d, emissive: 0xff1a1a, emissiveIntensity: 1.1, roughness: 0.2, flatShading: true }),
      dish: standard({ color: 0xcbd5e1, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
      lamp: standard({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2.5 }),
      pad: standard({ map: t.pad, emissive: 0xffffff, emissiveMap: t.padGlow, emissiveIntensity: 0.9, roughness: 0.9, metalness: 0.05 }),
      core: standard({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.8,
        roughness: 0.15,
        flatShading: true,
      }),
      ring: new THREE.MeshBasicMaterial({
        map: t.ring,
        color: 0xff4d4d,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      ringTex: t.ring,
    };
    return this.enemyBaseMats;
  }

  createEnemyBaseBlock() {
    const group = buildEnemyStronghold(this.getEnemyBaseMaterials(), () => this.animTime || 0);
    return markOwned(group, { materials: false });
  }

  createBrickBlock() {
    const group = new THREE.Group();
    group.userData.brickHp = 4;
    group.userData.batchTile = true;
    if (this.useBlenderBricks && this.brickModels.apply(group, 4)) return { group };
    const subMeshes = [];
    const mat = this.brickMaterials;

    const half = TILE_SIZE / 2;
    const offsets = [
      [-half / 2, -half / 2],
      [half / 2, -half / 2],
      [-half / 2, half / 2],
      [half / 2, half / 2],
    ];

    for (const [ox, oz] of offsets) {
      const geo = this.sharedGeometry('BoxGeometry', half - 0.04, 1.35, half - 0.04);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(ox, 0.675, oz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      subMeshes.push(mesh);
    }

    group.userData.batchTile = true;
    return { group, subMeshes };
  }

  updateBrickBlockDamage(group, hp) {
    if (!group) return;
    group.userData.brickHp = hp;
    if (this.useBlenderBricks && this.brickModels.states.size) {
      this.brickModels.apply(group, hp);
    } else {
      const state = Math.max(0, Math.min(4, Math.ceil(hp)));
      group.children.forEach((mesh, index) => {
        mesh.visible = index < state;
        mesh.material = this.brickDamageMaterials.get(state);
      });
      group.userData.batchRevision = (group.userData.batchRevision || 0) + 1;
    }
  }

  createBoxesBlock() {
    this.boxMats ||= [0x9b693b, 0xb58550, 0x79502d, 0x493a2a].map(color => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.94 });
      mat.userData.batchKey = `boxes-${color}`;
      return mat;
    });
    const group = new THREE.Group();
    group.userData.batchTile = true;
    // Four freestanding crates; the front pair breaks before the rear pair.
    for (let i = 0; i < 4; i++) {
      const crate = new THREE.Group();
      const height = i < 2 ? 0.9 : 1.25;
      crate.position.set(i % 2 ? 0.48 : -0.48, 0, i < 2 ? 0.48 : -0.48);
      const add = (w, h, d, x, y, z, mat) => {
        const mesh = new THREE.Mesh(this.sharedGeometry('BoxGeometry', w, h, d), this.boxMats[mat]);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        crate.add(mesh);
        return mesh;
      };
      add(0.87, height, 0.87, 0, height / 2, 0, 2);
      for (let n = 0; n < 5; n++) {
        const offset = (n - 2) * 0.172;
        for (const sign of [-1, 1]) {
          add(0.166, height - 0.04, 0.025, offset, height / 2, sign * 0.445, (i + n) % 2);
          add(0.025, height - 0.04, 0.166, sign * 0.445, height / 2, offset, (i + n + 1) % 2);
        }
        add(0.166, 0.03, 0.88, offset, height + 0.015, 0, n % 2);
      }
      for (const sign of [-1, 1]) {
        for (const y of [0.11, height - 0.11]) {
          add(0.91, 0.12, 0.055, 0, y, sign * 0.47, 1);
          add(0.055, 0.12, 0.91, sign * 0.47, y, 0, 1);
        }
        const brace = add(0.09, Math.hypot(0.65, height - 0.24), 0.055, 0, height / 2, sign * 0.475, 1);
        brace.rotation.z = Math.atan2(0.65, height - 0.24) * sign;
        for (const x of [-0.35, 0.35]) {
          for (const y of [0.11, height - 0.11]) add(0.035, 0.035, 0.012, x, y, sign * 0.505, 3);
        }
      }
      group.add(crate);
    }
    return group;
  }

  updateBoxesDamage(group, hp) {
    if (!group) return;
    group.children.forEach((crate, index) => { crate.visible = hp > 1 || (hp > 0 && index >= 2); });
  }

  getConcreteMaterials() {
    if (this.concreteMats) return this.concreteMats;
    const tex = this.concreteTex;
    const bump = (map) => (this.isSoftwareGl ? null : map);
    const side = new THREE.MeshStandardMaterial({
      map: tex.side,
      bumpMap: bump(tex.sideBump),
      bumpScale: 1.4,
      color: 0xcbd5e1,
      roughness: 0.9,
      metalness: 0.04,
    });
    const top = new THREE.MeshStandardMaterial({
      map: tex.top,
      bumpMap: bump(tex.topBump),
      bumpScale: 1.2,
      roughness: 0.86,
      metalness: 0.04,
    });
    top.color = side.color;
    const cap = new THREE.MeshStandardMaterial({
      map: tex.top,
      bumpMap: bump(tex.topBump),
      bumpScale: 1.2,
      color: 0xb8c2ce,
      roughness: 0.82,
      metalness: 0.06,
    });
    const rebar = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.82 });
    const rustRebar = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.65, metalness: 0.58 });
    const fracture = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.92, metalness: 0.08 });
    side.userData.batchKey = 'concrete-side';
    top.userData.batchKey = 'concrete-top';
    cap.userData.batchKey = 'concrete-cap';
    rebar.userData.batchKey = 'concrete-rebar';
    rustRebar.userData.batchKey = 'concrete-rebar-rust';
    fracture.userData.batchKey = 'concrete-fracture';
    this.concreteMats = { side, top, cap, rebar, rustRebar, fracture };
    return this.concreteMats;
  }

  createConcreteBlock() {
    const group = new THREE.Group();
    const mats = this.getConcreteMaterials();
    const concreteSideMat = mats.side;
    const concreteTopMat = mats.top;
    const concreteMat = concreteSideMat;
    const capMat = mats.cap;
    const rebarMat = mats.rebar;
    const rustRebarMat = mats.rustRebar;
    const fractureMat = mats.fracture;

    const base = new THREE.Mesh(
      this.sharedGeometry('BoxGeometry', TILE_SIZE - 0.06, 1.48, TILE_SIZE - 0.06),
      [concreteSideMat, concreteSideMat, concreteTopMat, concreteSideMat, concreteSideMat, concreteSideMat]
    );
    base.position.y = 0.74;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const topPlate = new THREE.Mesh(
      this.sharedGeometry('BoxGeometry', TILE_SIZE - 0.28, 0.14, TILE_SIZE - 0.28),
      capMat
    );
    topPlate.position.y = 1.52;
    topPlate.castShadow = true;
    group.add(topPlate);

    const cornerOffset = (TILE_SIZE - 0.08) / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pilaster = new THREE.Mesh(
          this.sharedGeometry('BoxGeometry', 0.16, 1.46, 0.16),
          rebarMat
        );
        pilaster.position.set(sx * cornerOffset, 0.73, sz * cornerOffset);
        group.add(pilaster);
      }
    }

    const crackGroup = new THREE.Group();
    crackGroup.visible = false;
    const crack1 = new THREE.Mesh(
      this.sharedGeometry('BoxGeometry', TILE_SIZE - 0.02, 0.09, 0.34),
      fractureMat
    );
    crack1.position.set(0, 0.95, 0);
    crack1.rotation.y = 0.42;
    crackGroup.add(crack1);

    const crack2 = new THREE.Mesh(
      this.sharedGeometry('BoxGeometry', 0.32, 0.68, TILE_SIZE - 0.02),
      fractureMat
    );
    crack2.position.set(0.18, 0.88, 0);
    crack2.rotation.z = -0.28;
    crackGroup.add(crack2);
    group.add(crackGroup);

    const rebarGroup = new THREE.Group();
    rebarGroup.visible = false;
    for (const offset of [-0.52, 0, 0.52]) {
      const rodX = new THREE.Mesh(
        this.sharedGeometry('CylinderGeometry', 0.036, 0.036, TILE_SIZE + 0.04, 6),
        rustRebarMat
      );
      rodX.rotation.z = Math.PI / 2;
      rodX.position.set(0, 1.36, offset);
      rebarGroup.add(rodX);

      const rodZ = new THREE.Mesh(
        this.sharedGeometry('CylinderGeometry', 0.036, 0.036, TILE_SIZE + 0.04, 6),
        rebarMat
      );
      rodZ.rotation.x = Math.PI / 2;
      rodZ.position.set(offset, 1.32, 0);
      rebarGroup.add(rodZ);

      const rodV = new THREE.Mesh(
        this.sharedGeometry('CylinderGeometry', 0.035, 0.035, 1.62, 6),
        rustRebarMat
      );
      rodV.position.set(offset, 0.81, offset * -0.7);
      rodV.rotation.z = offset * 0.12;
      rebarGroup.add(rodV);
    }
    group.add(rebarGroup);

    group.userData = {
      batchTile: true,
      isConcreteBlock: true,
      slabMesh: base,
      capMesh: topPlate,
      crackGroup,
      rebarGroup,
      concreteMat,
    };

    return group;
  }

  updateConcreteBlockDamage(blockGroup, hp, maxHp = 16) {
    if (!blockGroup?.userData?.isConcreteBlock) return;
    const { slabMesh, capMesh, crackGroup, rebarGroup, concreteMat } =
      blockGroup.userData;
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));

    if (crackGroup) {
      crackGroup.visible = ratio < 0.95;
    }
    if (capMesh) {
      capMesh.visible = ratio > 0.65;
    }
    if (rebarGroup) {
      rebarGroup.visible = ratio <= 0.65;
    }
    if (slabMesh) {
      const heightScale = 0.58 + ratio * 0.42;
      slabMesh.scale.y = heightScale;
      slabMesh.position.y = 0.74 * heightScale;
    }
    if (concreteMat) {
      const shade = Math.round(145 + ratio * 58);
      this.ownConcreteSlabMaterials(blockGroup)
        .color.setRGB(shade / 255, (shade + 8) / 255, (shade + 18) / 255, THREE.SRGBColorSpace);
    }
  }

  /** Gives a block its own slab materials before its tint changes (they start shared). */
  ownConcreteSlabMaterials(blockGroup) {
    const data = blockGroup.userData;
    if (data.ownSlabMaterials) return data.concreteMat;
    const shared = this.getConcreteMaterials();
    const side = markMaterialOwned(shared.side.clone());
    const top = markMaterialOwned(shared.top.clone());
    top.color = side.color;
    if (Array.isArray(data.slabMesh?.material)) {
      data.slabMesh.material = data.slabMesh.material.map((mat) =>
        mat === shared.side ? side : mat === shared.top ? top : mat
      );
    }
    data.concreteMat = side;
    data.ownSlabMaterials = true;
    return side;
  }

  /** Geometry shared by every tile built with the same parameters (map tiles are thousands of. */
  sharedGeometry(kind, ...args) {
    this.geometryCache ||= new Map();
    const key = `${kind}:${args.join(',')}`;
    let geometry = this.geometryCache.get(key);
    if (!geometry) {
      geometry = new THREE[kind](...args);
      this.geometryCache.set(key, geometry);
    }
    return geometry;
  }

  getForestMaterials() {
    if (this.forestMats) return this.forestMats;
    const tex = this.generated('createForestTextures');
    const bump = (map) => (this.isSoftwareGl ? null : map);
    this.forestMats = {
      trunk: new THREE.MeshStandardMaterial({
        map: tex.bark,
        bumpMap: bump(tex.bark),
        bumpScale: 2,
        roughness: 0.95,
        metalness: 0,
      }),
      foliage1: new THREE.MeshStandardMaterial({
        map: tex.foliage,
        bumpMap: bump(tex.foliage),
        bumpScale: 2.5,
        color: 0xdfeedd,
        roughness: 0.8,
        metalness: 0,
        transparent: true,
        opacity: 0.9,
      }),
      foliage2: new THREE.MeshStandardMaterial({
        map: tex.foliage,
        bumpMap: bump(tex.foliage),
        bumpScale: 2.5,
        color: 0xffffff,
        roughness: 0.75,
        metalness: 0,
        transparent: true,
        opacity: 0.9,
      }),
      floor: new THREE.MeshStandardMaterial({
        map: tex.floor,
        roughness: 1,
        metalness: 0,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    };
    return this.forestMats;
  }

  createForestBlock() {
    const group = new THREE.Group();
    const mats = this.getForestMaterials();
    const trunkMat = mats.trunk;
    const foliageMat1 = mats.foliage1;
    const foliageMat2 = mats.foliage2;

    const floor = new THREE.Mesh(this.sharedGeometry('PlaneGeometry', TILE_SIZE * 1.1, TILE_SIZE * 1.1), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2);
    floor.position.y = 0.015;
    floor.receiveShadow = true;
    group.add(floor);

    const positions = [
      [-0.45, -0.42, 1.0],
      [0.48, -0.35, 0.88],
      [0.0, 0.45, 1.08],
    ];

    for (const [px, pz, s] of positions) {
      const tree = new THREE.Group();
      tree.position.set(px, 0, pz);
      tree.rotation.y = Math.random() * Math.PI * 2;

      const trunk = new THREE.Mesh(
        this.sharedGeometry('CylinderGeometry', 0.11 * s, 0.15 * s, 0.6 * s, 7),
        trunkMat
      );
      trunk.position.y = 0.3 * s;
      tree.add(trunk);

      const cone1 = new THREE.Mesh(
        this.sharedGeometry('ConeGeometry', 0.58 * s, 0.95 * s, 7),
        foliageMat1
      );
      cone1.position.y = 0.88 * s;
      cone1.castShadow = true;
      tree.add(cone1);

      const cone2 = new THREE.Mesh(
        this.sharedGeometry('ConeGeometry', 0.44 * s, 0.8 * s, 7),
        foliageMat2
      );
      cone2.position.y = 1.35 * s;
      cone2.castShadow = true;
      tree.add(cone2);

      group.add(tree);
    }

    group.userData.batchTile = true;
    return group;
  }

  /**
   * Runtime sand patch for one cell (burned forest, destroyed turret) centred at world (x, z).
   * The rim is ragged and feathered through an alpha mask (uv1), while the sand pattern is
   * world-aligned (uv) so neighbouring patches merge into one continuous sand field.
   */
  createSandBlock(x = 0, z = 0) {
    if (!this.sandPatchMats) {
      // sRGB colour space like every other colour map; without it the sand washes out to white.
      const sandTex = this.configureColorTexture(new THREE.CanvasTexture(createSandCanvas(256, SAND_PATTERN_CELLS, 42)));
      sandTex.wrapS = THREE.RepeatWrapping;
      sandTex.wrapT = THREE.RepeatWrapping;
      this.sandPatchMats = Array.from({ length: SAND_PATCH_VARIANTS }, (_, variant) => {
        const mask = new THREE.CanvasTexture(createSandPatchMask(128, variant, SAND_PATCH_CELL_FRACTION));
        mask.channel = 1;
        return new THREE.MeshStandardMaterial({
          map: sandTex,
          alphaMap: mask,
          transparent: true,
          depthWrite: false,
          // Same response as the ground plane, so a patch matches sand painted into the map ground.
          roughness: 0.85,
          metalness: 0.1,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
      });
    }

    const span = TILE_SIZE / SAND_PATCH_CELL_FRACTION;
    const geometry = new THREE.PlaneGeometry(span, span);
    geometry.setAttribute('uv1', geometry.attributes.uv.clone());
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const patternSpan = TILE_SIZE * SAND_PATTERN_CELLS;
    for (let i = 0; i < pos.count; i++) {
      // The plane is laid flat with rotation.x = -PI/2, so local +y points to world -z.
      uv.setXY(i, (x + pos.getX(i)) / patternSpan, (z - pos.getY(i)) / patternSpan);
    }

    const cellHash = Math.abs(Math.round(x / TILE_SIZE) * 73856093 ^ Math.round(z / TILE_SIZE) * 19349663);
    const floor = new THREE.Mesh(geometry, this.sandPatchMats[cellHash % SAND_PATCH_VARIANTS]);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.012;
    floor.receiveShadow = true;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(floor);
    return markOwned(group, { materials: false });
  }

  /** Water / ice material: physically based clearcoat on the High preset, plain standard. */
  createSurfaceMaterial(params, clearcoatParams) {
    return this.physicalWater === false
      ? new THREE.MeshStandardMaterial(params)
      : new THREE.MeshPhysicalMaterial({ ...params, ...clearcoatParams });
  }

  createWaterBlock(grid = [[1]], waterType = 1) {
    if (!this.waterMat) {
      const ripples = this.isSoftwareGl ? null : this.waterTex.normal;
      this.waterMat = this.createSurfaceMaterial(
        {
          map: this.waterTex.color,
          normalMap: ripples,
          normalScale: new THREE.Vector2(0.3, 0.3),
          color: 0xffffff,
          roughness: 0.18,
          metalness: 0.1,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        },
        {
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          clearcoatNormalMap: ripples,
          clearcoatNormalScale: new THREE.Vector2(0.35, 0.35),
        }
      );
    }
    return createWaterSurface(grid, waterType, TILE_SIZE, this.waterMat, {
      lowQuality: this.isSoftwareGl || this.physicalWater === false,
    });
  }

  createIceBlock(grid = [[1]], iceType = 1) {
    if (!this.iceMat) {
      const tex = this.iceTex;
      this.iceMat = this.createSurfaceMaterial(
        {
          map: tex.color,
          roughnessMap: tex.rough,
          roughness: 1,
          bumpMap: this.isSoftwareGl ? null : tex.bump,
          bumpScale: 0.055,
          color: 0xffffff,
          metalness: 0.05,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        },
        { clearcoat: 0.7, clearcoatRoughness: 0.08 }
      );
    }
    return createIceSurface(grid, iceType, TILE_SIZE, this.iceMat, {
      lowQuality: this.isSoftwareGl || this.physicalWater === false,
    });
  }

  getSpawnerMaterials() {
    if (this.spawnerMats) return this.spawnerMats;
    const tex = this.generated('createSpawnerTextures');
    const rim = new THREE.MeshStandardMaterial({ map: tex.band, roughness: 0.55, metalness: 0.6 });
    const deck = new THREE.MeshStandardMaterial({ map: tex.deck, roughness: 0.5, metalness: 0.7 });
    const coreTop = new THREE.MeshStandardMaterial({
      map: tex.coreTop,
      emissive: 0xffffff,
      emissiveMap: tex.coreGlow,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.3,
    });
    const coreSide = new THREE.MeshStandardMaterial({
      color: 0x7f1d1d,
      emissive: 0xdc2626,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.4,
    });
    const pylon = new THREE.MeshStandardMaterial({
      map: tex.pylon,
      emissive: 0xffffff,
      emissiveMap: tex.pylonGlow,
      emissiveIntensity: 1,
      roughness: 0.45,
      metalness: 0.7,
    });
    this.spawnerMats = {
      pad: [rim, deck, deck],
      core: [coreSide, coreTop, coreTop],
      pylon,
      coreTop,
      coreSide,
      glowTex: tex.coreGlow,
      coreTex: tex.coreTop,
    };
    return this.spawnerMats;
  }

  createSpawnerPad() {
    const group = new THREE.Group();
    const mats = this.getSpawnerMaterials();
    const baseMat = mats.pylon;

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 0.96, 0.18, 24),
      mats.pad
    );
    pad.position.y = 0.09;
    pad.receiveShadow = true;
    group.add(pad);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.22, 24),
      mats.core
    );
    core.position.y = 0.11;
    group.add(core);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.55, 0.22),
        baseMat
      );
      pylon.position.set(
        Math.cos(angle) * 0.72,
        0.28,
        Math.sin(angle) * 0.72
      );
      pylon.castShadow = true;
      group.add(pylon);
    }

    return markOwned(group, { materials: false });
  }

  createHedgehogBlock() {
    const group = new THREE.Group();
    if (!this.hedgehogMat) {
      this.hedgehogMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.55,
        metalness: 0.85,
      });
      this.hedgehogBoltMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
        metalness: 0.9,
      });
    }

    const beamGeo = this.sharedGeometry('BoxGeometry', 0.16, 1.45, 0.16);
    const centerPlateGeo = this.sharedGeometry('BoxGeometry', 0.34, 0.34, 0.34);

    const b1 = new THREE.Mesh(beamGeo, this.hedgehogMat);
    b1.position.set(0, 0.52, 0);
    b1.rotation.set(0.62, 0, 0.62);
    b1.castShadow = true;
    b1.receiveShadow = true;
    group.add(b1);

    const b2 = new THREE.Mesh(beamGeo, this.hedgehogMat);
    b2.position.set(0, 0.52, 0);
    b2.rotation.set(-0.62, 0, 0.62);
    b2.castShadow = true;
    b2.receiveShadow = true;
    group.add(b2);

    const b3 = new THREE.Mesh(beamGeo, this.hedgehogMat);
    b3.position.set(0, 0.52, 0);
    b3.rotation.set(0, 0.785, -0.65);
    b3.castShadow = true;
    b3.receiveShadow = true;
    group.add(b3);

    const center = new THREE.Mesh(centerPlateGeo, this.hedgehogBoltMat);
    center.position.set(0, 0.52, 0);
    center.castShadow = true;
    group.add(center);

    group.userData.batchTile = true;
    return markOwned(group, { materials: false });
  }

  createBarrelBlock() {
    const group = new THREE.Group();
    if (!this.barrelMats) {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.45,
        metalness: 0.55,
      });
      const hazardStripeMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xb45309,
        emissiveIntensity: 0.4,
        roughness: 0.35,
        metalness: 0.4,
      });
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.8,
      });
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.8,
        metalness: 0.2,
      });
      this.barrelMats = { bodyMat, hazardStripeMat, rimMat, baseMat };
    }

    const { bodyMat, hazardStripeMat, rimMat, baseMat } = this.barrelMats;

    const pallet = new THREE.Mesh(
      this.sharedGeometry('BoxGeometry', 1.45, 0.06, 1.45),
      baseMat
    );
    pallet.position.y = 0.03;
    pallet.receiveShadow = true;
    group.add(pallet);

    const drumGeo = this.sharedGeometry('CylinderGeometry', 0.28, 0.28, 0.68, 14);
    const stripeGeo = this.sharedGeometry('CylinderGeometry', 0.286, 0.286, 0.18, 14);
    const rimGeo = this.sharedGeometry('CylinderGeometry', 0.295, 0.295, 0.04, 14);
    const capGeo = this.sharedGeometry('CylinderGeometry', 0.045, 0.045, 0.03, 8);

    const drums = [
      { x: -0.28, z: -0.24, rot: 0.2 },
      { x: 0.30, z: -0.18, rot: -0.4 },
      { x: -0.04, z: 0.30, rot: 0.9 },
    ];

    for (const d of drums) {
      const drumGroup = new THREE.Group();
      drumGroup.position.set(d.x, 0.06, d.z);
      drumGroup.rotation.y = d.rot;

      const drum = new THREE.Mesh(drumGeo, bodyMat);
      drum.position.y = 0.34;
      drum.castShadow = true;
      drum.receiveShadow = true;
      drumGroup.add(drum);

      const stripe = new THREE.Mesh(stripeGeo, hazardStripeMat);
      stripe.position.y = 0.34;
      stripe.castShadow = true;
      drumGroup.add(stripe);

      const topRim = new THREE.Mesh(rimGeo, rimMat);
      topRim.position.y = 0.67;
      drumGroup.add(topRim);

      const botRim = new THREE.Mesh(rimGeo, rimMat);
      botRim.position.y = 0.02;
      drumGroup.add(botRim);

      const bung = new THREE.Mesh(capGeo, rimMat);
      bung.position.set(0.12, 0.69, 0.08);
      drumGroup.add(bung);

      group.add(drumGroup);
    }

    group.userData.batchTile = true;
    return markOwned(group, { materials: false });
  }

  getPowerUpEmblemTexture(type) {
    const key = type || POWERUP.UPGRADE_CANNON;
    if (this.powerUpTexCache.has(key)) {
      return this.powerUpTexCache.get(key);
    }
    const canvas = createPowerUpEmblemCanvas(key, 256);
    const tex = this.configureColorTexture(new THREE.CanvasTexture(canvas));
    this.powerUpTexCache.set(key, tex);
    return tex;
  }

  getPowerUpBeamTexture() {
    if (this.powerUpBeamTex) return this.powerUpBeamTex;
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.7, 'rgba(255, 255, 255, 0.35)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    this.powerUpBeamTex = new THREE.CanvasTexture(canvas);
    return this.powerUpBeamTex;
  }

  getPowerUpMaterials(type) {
    this.powerUpMatCache = this.powerUpMatCache || new Map();
    if (this.powerUpMatCache.has(type)) return this.powerUpMatCache.get(type);
    const spec = POWERUP_TYPES[type];
    const color = spec ? spec.colorHex : 0xf59e0b;
    const mats = {
      color,
      accent: new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.7,
        roughness: 0.25,
        metalness: 0.6,
      }),
      bright: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.8,
      }),
      dark: new THREE.MeshStandardMaterial({ color: 0x243041, roughness: 0.35, metalness: 0.8 }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.85,
      }),
      marker: new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      markerFill: new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      beam: new THREE.MeshBasicMaterial({
        color,
        map: this.getPowerUpBeamTexture(),
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    };
    this.powerUpMatCache.set(type, mats);
    return mats;
  }

  createPowerUpMesh(type) {
    const group = new THREE.Group();
    const mats = this.getPowerUpMaterials(type);
    const accentMat = mats.accent;
    const brightMat = mats.bright;
    const darkMetalMat = mats.dark;
    const goldMat = mats.gold;
    const family = POWERUP_FAMILY[type] || 'instant';

    const grounded = new THREE.Group();
    group.add(grounded);
    group.userData.grounded = grounded;
    const ringGeo =
      family === 'upgrade'
        ? new THREE.RingGeometry(0.66, 0.82, 6, 1, Math.PI / 6)
        : new THREE.RingGeometry(0.62, 0.76, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, mats.marker);
    ring.position.y = 0.035;
    grounded.add(ring);
    const fillGeo =
      family === 'upgrade'
        ? new THREE.CircleGeometry(0.66, 6, Math.PI / 6)
        : new THREE.CircleGeometry(0.62, 40);
    fillGeo.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(fillGeo, mats.markerFill);
    fill.position.y = 0.03;
    grounded.add(fill);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 2.6, 20, 1, true), mats.beam);
    beam.position.y = 1.3;
    grounded.add(beam);

    const frame = new THREE.Group();
    frame.position.y = 0.78;
    group.add(frame);
    if (family === 'upgrade') {
      const hex = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 6), goldMat);
      hex.rotation.x = Math.PI / 2;
      frame.add(hex);
    } else {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 40), accentMat);
      loop.rotation.x = Math.PI / 2;
      frame.add(loop);
      if (family === 'timed') {
        const tickGeo = new THREE.BoxGeometry(0.05, 0.16, 0.05);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const tick = new THREE.Mesh(tickGeo, brightMat);
          tick.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
          frame.add(tick);
        }
      }
    }

    const trophy = new THREE.Group();
    trophy.position.y = 0.8;
    trophy.scale.setScalar(1.3);
    group.add(trophy);

    switch (type) {
      case POWERUP.UPGRADE_CANNON: {
        const turret = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.36, 0.22, 6),
          darkMetalMat
        );
        turret.position.set(0, -0.06, -0.1);
        trophy.add(turret);

        const mantlet = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.18, 0.22),
          accentMat
        );
        mantlet.position.set(0, -0.04, 0.12);
        trophy.add(mantlet);

        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.08, 0.72, 10),
          brightMat
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, -0.04, 0.44);
        trophy.add(barrel);

        const evacuator = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10),
          accentMat
        );
        evacuator.rotation.x = Math.PI / 2;
        evacuator.position.set(0, -0.04, 0.38);
        trophy.add(evacuator);

        const muzzleBrake = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.15, 0.14),
          goldMat
        );
        muzzleBrake.position.set(0, -0.04, 0.78);
        trophy.add(muzzleBrake);
        break;
      }

      case POWERUP.UPGRADE_CHASSIS: {
        const trackBelt = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.34, 0.82),
          darkMetalMat
        );
        trophy.add(trackBelt);

        const fender = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.08, 0.88),
          accentMat
        );
        fender.position.y = 0.2;
        trophy.add(fender);

        const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.36, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        [-0.26, 0, 0.26].forEach((wz) => {
          const wheel = new THREE.Mesh(wheelGeo, brightMat);
          wheel.position.set(0, -0.04, wz);
          trophy.add(wheel);
        });
        break;
      }

      case POWERUP.UPGRADE_FRAME: {
        const hullCore = new THREE.Mesh(
          new THREE.BoxGeometry(0.56, 0.24, 0.78),
          darkMetalMat
        );
        trophy.add(hullCore);

        const frontProw = new THREE.Mesh(
          new THREE.BoxGeometry(0.68, 0.22, 0.16),
          accentMat
        );
        frontProw.position.set(0, -0.04, 0.44);
        frontProw.rotation.x = -Math.PI / 7;
        trophy.add(frontProw);

        [-0.26, 0.26].forEach((rx) => {
          const rollRail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8),
            brightMat
          );
          rollRail.rotation.x = Math.PI / 2;
          rollRail.position.set(rx, 0.18, -0.02);
          trophy.add(rollRail);
        });
        break;
      }

      case POWERUP.UPGRADE_ENGINE: {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.28, 0.54),
          darkMetalMat
        );
        trophy.add(block);

        [-1, 1].forEach((side) => {
          const bank = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.24, 0.48),
            accentMat
          );
          bank.position.set(side * 0.18, 0.12, 0);
          bank.rotation.z = -side * 0.45;
          trophy.add(bank);

          const stack = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8),
            brightMat
          );
          stack.position.set(side * 0.24, 0.26, -0.14);
          trophy.add(stack);
        });

        const turboIntake = new THREE.Mesh(
          new THREE.TorusGeometry(0.16, 0.045, 8, 16),
          brightMat
        );
        turboIntake.position.set(0, 0.06, 0.29);
        trophy.add(turboIntake);
        break;
      }

      case POWERUP.UPGRADE_ARMOR: {
        const shieldPlate = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.66, 0.14),
          darkMetalMat
        );
        shieldPlate.rotation.x = -0.15;
        trophy.add(shieldPlate);

        const rim = new THREE.Mesh(
          new THREE.BoxGeometry(0.68, 0.72, 0.08),
          brightMat
        );
        rim.rotation.x = -0.15;
        rim.position.z = -0.02;
        trophy.add(rim);

        [-0.14, 0.14].forEach((bx) => {
          [-0.14, 0.14].forEach((by) => {
            const era = new THREE.Mesh(
              new THREE.BoxGeometry(0.22, 0.2, 0.08),
              accentMat
            );
            era.position.set(bx, by, 0.08);
            era.rotation.x = -0.15;
            trophy.add(era);
          });
        });
        break;
      }

      case POWERUP.REPAIR: {
        const medCase = new THREE.Mesh(
          new THREE.BoxGeometry(0.64, 0.48, 0.26),
          darkMetalMat
        );
        trophy.add(medCase);

        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.08, 0.08),
          brightMat
        );
        handle.position.y = 0.28;
        trophy.add(handle);

        const crossV = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.32, 0.3),
          accentMat
        );
        const crossH = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.12, 0.3),
          accentMat
        );
        trophy.add(crossV, crossH);
        break;
      }

      case POWERUP.EMP: {
        const coreSphere = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.24, 1),
          accentMat
        );
        trophy.add(coreSphere);

        const ring1 = new THREE.Mesh(
          new THREE.TorusGeometry(0.38, 0.035, 8, 20),
          brightMat
        );
        ring1.rotation.set(Math.PI / 4, Math.PI / 6, 0);
        trophy.add(ring1);

        const ring2 = new THREE.Mesh(
          new THREE.TorusGeometry(0.38, 0.035, 8, 20),
          accentMat
        );
        ring2.rotation.set(-Math.PI / 4, -Math.PI / 6, 0);
        trophy.add(ring2);
        break;
      }

      case POWERUP.BASE_RESTORE: {
        const hq = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.45), brightMat);
        trophy.add(hq);
        for (const [w, h] of [[0.32, 0.09], [0.09, 0.32]]) {
          const cross = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), goldMat);
          cross.position.set(0, 0.32, 0.12);
          trophy.add(cross);
        }
        break;
      }

      case POWERUP.APS: {
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.18, 0.32, 10),
          darkMetalMat
        );
        trophy.add(mast);

        const dish = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.1, 0.12, 14),
          goldMat
        );
        dish.position.y = 0.2;
        dish.rotation.x = 0.35;
        trophy.add(dish);

        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8),
            accentMat
          );
          tube.position.set(Math.cos(a) * 0.28, -0.02, Math.sin(a) * 0.28);
          tube.rotation.z = -Math.cos(a) * 0.4;
          tube.rotation.x = Math.sin(a) * 0.4;
          trophy.add(tube);
        }
        break;
      }

      case POWERUP.MISSILE: {
        const rocketGroup = new THREE.Group();
        rocketGroup.rotation.x = -Math.PI / 4;
        trophy.add(rocketGroup);

        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.56, 12),
          brightMat
        );
        rocketGroup.add(body);

        const nose = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.28, 12),
          accentMat
        );
        nose.position.y = 0.42;
        rocketGroup.add(nose);

        for (let i = 0; i < 4; i++) {
          const fin = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.16, 0.03),
            accentMat
          );
          fin.position.y = -0.2;
          fin.rotation.y = (i * Math.PI) / 2;
          rocketGroup.add(fin);
        }
        break;
      }

      default: {
        const core = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.38, 0),
          accentMat
        );
        trophy.add(core);
        break;
      }
    }

    this.powerUpSpriteMatCache = this.powerUpSpriteMatCache || new Map();
    let spriteMat = this.powerUpSpriteMatCache.get(type);
    if (!spriteMat) {
      spriteMat = new THREE.SpriteMaterial({
        map: this.getPowerUpEmblemTexture(type),
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });
      this.powerUpSpriteMatCache.set(type, spriteMat);
    }
    const badgeSprite = new THREE.Sprite(spriteMat);
    badgeSprite.position.set(0, 2.05, 0);
    badgeSprite.scale.set(1.65, 1.65, 1);
    badgeSprite.renderOrder = 2;
    group.add(badgeSprite);

    return markOwned(group, { materials: false });
  }

  createOutdoorPerimeter() {
    return createMountainPerimeter((GRID_SIZE * TILE_SIZE) / 2, { lowQuality: this.isSoftwareGl });
  }

  /**
   * Creates a sealed metal data capsule with a numbered ground ring and data emblem sprite
   * for Contract mode (visually distinct from destructible wooden BOXES).
   */
  createCargoContainerMesh(slot = 1, code = 'A', accentHex = '#38bdf8') {
    const group = new THREE.Group();
    const color = new THREE.Color(accentHex);

    const skidMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.75 })
    );
    const hullMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.82 })
    );
    const bandMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.5,
      })
    );
    const ringMat = markMaterialOwned(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      })
    );

    // Outer numbered ground ring
    const groundRing = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.18, 28), ringMat);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.04;
    group.add(groundRing);

    // Armored steel skids
    for (const zOff of [-0.38, 0.38]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.14, 0.16), skidMat);
      skid.position.set(0, 0.07, zOff);
      group.add(skid);
    }

    // Sealed cylindrical metal data capsule
    const capsuleGroup = new THREE.Group();
    capsuleGroup.position.y = 0.46;
    group.add(capsuleGroup);

    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 1.24, 12),
      hullMat
    );
    cylinder.rotation.z = Math.PI / 2;
    capsuleGroup.add(cylinder);

    for (const xOff of [-0.62, 0.62]) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.38, 0.16, 12),
        skidMat
      );
      cap.rotation.z = xOff > 0 ? -Math.PI / 2 : Math.PI / 2;
      cap.position.x = xOff;
      capsuleGroup.add(cap);
    }

    for (const xOff of [-0.32, 0, 0.32]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.405, 0.405, 0.09, 12),
        bandMat
      );
      band.rotation.z = Math.PI / 2;
      band.position.x = xOff;
      capsuleGroup.add(band);
    }

    // Top data core crest
    const dataCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), bandMat);
    dataCrest.position.set(0, 0.52, 0);
    capsuleGroup.add(dataCrest);

    // Floating numbered + data symbol canvas badge
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.fillStyle = 'rgba(11, 15, 23, 0.92)';
      ctx.beginPath();
      ctx.arc(64, 64, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = accentHex;
      ctx.stroke();

      // Inner data diamond symbol + slot number
      ctx.fillStyle = accentHex;
      ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${slot}${slot === 3 ? '★' : ''}`, 64, 56);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`DATA ${code}`, 64, 92);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = markMaterialOwned(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      })
    );
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 2.05, 0);
    sprite.scale.set(1.55, 1.55, 1);
    sprite.renderOrder = 3;
    group.add(sprite);

    group.userData = {
      capsuleGroup,
      dataCrest,
      groundRing,
      ringMat,
      bandMat,
      sprite,
    };
    return markOwned(group);
  }

  createRadarRelayMesh(slot = 1, code = 'A', accentHex = '#a855f7') {
    const group = new THREE.Group();
    const color = new THREE.Color(accentHex);

    const baseMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.78 })
    );
    const mastMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.38, metalness: 0.85 })
    );
    const bandMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.25,
        metalness: 0.5,
      })
    );
    const ringMat = markMaterialOwned(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      })
    );
    const blastRingMat = markMaterialOwned(
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      })
    );

    // Outer interaction ground ring (1.5-cell arming radius visual)
    const groundRing = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.24, 28), ringMat);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.04;
    group.add(groundRing);

    // 3-cell demolition blast hazard ring (6.0 world unit radius, shown when armed)
    const blastRing = new THREE.Mesh(new THREE.RingGeometry(5.75, 6.05, 40), blastRingMat);
    blastRing.rotation.x = -Math.PI / 2;
    blastRing.position.y = 0.05;
    blastRing.visible = false;
    group.add(blastRing);

    // Armored octagonal pedestal + mast + rotating radar dish
    const dishGroup = new THREE.Group();
    group.add(dishGroup);

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 0.36, 8), baseMat);
    plinth.position.y = 0.18;
    dishGroup.add(plinth);

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.95, 8), mastMat);
    tower.position.y = 0.78;
    dishGroup.add(tower);

    const coreRing = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12), bandMat);
    coreRing.position.y = 0.78;
    dishGroup.add(coreRing);

    // Rotating radar dish assembly stored in dataCrest so engine rotation animates it
    const dataCrest = new THREE.Group();
    dataCrest.position.set(0, 1.38, 0);
    dishGroup.add(dataCrest);

    const dishBack = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.18, 0.24, 14), mastMat);
    dishBack.rotation.x = Math.PI * 0.32;
    dataCrest.add(dishBack);

    const emitter = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), bandMat);
    emitter.position.set(0, 0.16, 0.22);
    dataCrest.add(emitter);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.fillStyle = 'rgba(11, 15, 23, 0.92)';
      ctx.beginPath();
      ctx.arc(64, 64, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = accentHex;
      ctx.stroke();

      ctx.fillStyle = accentHex;
      ctx.font = 'bold 42px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${slot}${slot === 3 ? '★' : ''}`, 64, 54);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 19px monospace';
      ctx.fillText(`RELAY ${code}`, 64, 92);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = markMaterialOwned(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      })
    );
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 2.25, 0);
    sprite.scale.set(1.55, 1.55, 1);
    sprite.renderOrder = 3;
    group.add(sprite);

    group.userData = {
      capsuleGroup: dishGroup,
      dataCrest,
      groundRing,
      ringMat,
      bandMat,
      blastRing,
      blastRingMat,
      sprite,
    };
    return markOwned(group);
  }

  /**
   * Compact overhead carried-cargo indicator attached to the player tank rig without obstructing aiming.
   */
  createCarriedCargoIndicator() {
    const group = new THREE.Group();
    const mat = markMaterialOwned(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.65,
        roughness: 0.25,
        metalness: 0.6,
      })
    );
    const bodyMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 })
    );
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.64, 10), bodyMat);
    pod.rotation.z = Math.PI / 2;
    group.add(pod);

    const ringL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), mat);
    ringL.rotation.z = Math.PI / 2;
    ringL.position.x = -0.18;
    group.add(ringL);

    const ringR = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), mat);
    ringR.rotation.z = Math.PI / 2;
    ringR.position.x = 0.18;
    group.add(ringR);

    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), mat);
    diamond.position.y = 0.34;
    group.add(diamond);

    group.position.set(0, 2.65, 0);
    group.visible = false;
    group.userData = { diamond, mat };
    return markOwned(group);
  }

  /**
   * Non-destructible Southern Delivery & Extraction Pad visual framing.
   */
  createDeliveryPadMesh(pad) {
    const group = new THREE.Group();
    const width = pad.maxX - pad.minX;
    const depth = pad.maxZ - pad.minZ;
    group.position.set(pad.centerX, 0.03, pad.centerZ);

    const borderMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.55,
        roughness: 0.35,
        metalness: 0.5,
      })
    );
    const cornerMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.8 })
    );

    const thickness = 0.22;
    const northBar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, thickness), borderMat);
    northBar.position.set(0, 0.02, -depth / 2 + thickness / 2);
    group.add(northBar);

    const southBar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, thickness), borderMat);
    southBar.position.set(0, 0.02, depth / 2 - thickness / 2);
    group.add(southBar);

    const westBar = new THREE.Mesh(new THREE.BoxGeometry(thickness, 0.06, depth), borderMat);
    westBar.position.set(-width / 2 + thickness / 2, 0.02, 0);
    group.add(westBar);

    const eastBar = new THREE.Mesh(new THREE.BoxGeometry(thickness, 0.06, depth), borderMat);
    eastBar.position.set(width / 2 - thickness / 2, 0.02, 0);
    group.add(eastBar);

    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.42, 8), cornerMat);
      pylon.position.set(sx * (width / 2 - 0.2), 0.2, sz * (depth / 2 - 0.2));
      group.add(pylon);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), borderMat);
      beacon.position.set(sx * (width / 2 - 0.2), 0.46, sz * (depth / 2 - 0.2));
      group.add(beacon);
    }

    group.userData = { borderMat };
    return markOwned(group);
  }

  /**
   * Builds the three recognizable visual landmarks for Last Cargo:
   * - West rail gantry (high-clearance overhead steel frame; stanchions sit on concrete walls)
   * - Central island pump assembly
   * - East orange cargo crane
   * None obstruct projectile paths or create unrepresented collision cover.
   */
  createContractLandmarks(gridToWorld) {
    const group = new THREE.Group();
    const steelMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.75 })
    );
    const darkMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.7 })
    );
    const craneOrangeMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4, metalness: 0.65 })
    );
    const pumpTealMat = markMaterialOwned(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x0369a1,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.7,
      })
    );

    // 1. West Rail Gantry spanning between concrete wall (13, 4) and concrete wall (13, 10)
    const westLeft = gridToWorld(13, 4);
    const westRight = gridToWorld(13, 10);
    const gantryX = (westLeft.x + westRight.x) * 0.5;
    const gantryZ = westLeft.z;
    const gantrySpan = Math.abs(westRight.x - westLeft.x);
    const gantry = new THREE.Group();
    gantry.position.set(gantryX, 0, gantryZ);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.2, 0.32), steelMat);
      leg.position.set(side * (gantrySpan * 0.5), 2.1, 0);
      gantry.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(gantrySpan + 0.6, 0.38, 0.44), steelMat);
    beam.position.set(0, 4.2, 0);
    gantry.add(beam);
    const hoist = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 0.64), craneOrangeMat);
    hoist.position.set(-1.0, 3.95, 0);
    gantry.add(hoist);
    group.add(gantry);

    // 2. Central Island Pump Assembly mounted on the NE island concrete bollard (15, 20)
    const pumpPos = gridToWorld(15, 20);
    const pumpGroup = new THREE.Group();
    pumpGroup.position.set(pumpPos.x, 1.55, pumpPos.z);
    const turbine = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.25, 12), pumpTealMat);
    pumpGroup.add(turbine);
    const pipeArch = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8), steelMat);
    pipeArch.rotation.z = Math.PI / 2;
    pipeArch.position.set(0, 0.5, 0);
    pumpGroup.add(pipeArch);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.25, 10), darkMat);
    cap.position.set(0, 0.72, 0);
    pumpGroup.add(cap);
    group.add(pumpGroup);

    // 3. East Orange Cargo Crane spanning between concrete stacks (13, 28) and (12, 34)
    const eastLeft = gridToWorld(13, 28);
    const eastRight = gridToWorld(13, 34);
    const craneX = (eastLeft.x + eastRight.x) * 0.5;
    const craneZ = eastLeft.z;
    const craneSpan = Math.abs(eastRight.x - eastLeft.x);
    const crane = new THREE.Group();
    crane.position.set(craneX, 0, craneZ);
    for (const side of [-1, 1]) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.38, 4.8, 0.38), craneOrangeMat);
      mast.position.set(side * (craneSpan * 0.5), 2.4, 0);
      crane.add(mast);
    }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(craneSpan + 1.8, 0.44, 0.52), craneOrangeMat);
    boom.position.set(-0.4, 4.8, 0);
    crane.add(boom);
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.7), darkMat);
    trolley.position.set(-1.5, 4.48, 0);
    crane.add(trolley);
    group.add(crane);

    return markOwned(group);
  }
}
