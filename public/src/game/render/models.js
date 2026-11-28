/** 3D procedural meshes, texture application, and tank rigs. */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStaticMeshes } from './static-merge.js';
import { APS, POWERUP, POWERUP_TYPES } from '../constants.js';
import { disposeOwned, markMaterialOwned, markOwned } from './dispose.js';
import { getSharedGltfLoader, resolvePublicUrl } from './gltf-loader.js';
import { createPowerUpEmblemCanvas, POWERUP_FAMILY } from '../icons.js';
import { EnemyClass } from '../types.js';
import { GRID_SIZE, TILE_SIZE } from '../levels.js';
import { TextureGenerator, mulberry32 } from './texture-gen.js';
import { breachYaw, nextBreach } from '../terrains/breach-models.js';
import { BrickModels } from '../terrains/brick-models.js';
import { BuildingModels, buildingDamageState } from '../terrains/building-models.js';
import { ConcreteModels, concreteDamageState } from '../terrains/concrete-models.js';
import { LandmarkModels } from '../terrains/landmarks.js';
import { applyBrickFinish } from '../terrains/brick-finish.js';
import { createWaterSurface } from '../terrains/water.js';
import { createIceSurface } from '../terrains/ice.js';
import { createMountainPerimeter } from '../terrains/mountains.js';
import {
  PerimeterBuildingCatalog,
  ALL_URBAN_BUILDING_KINDS,
  CIVIC_INDUSTRIAL_BUILDING_KINDS,
} from '../terrains/perimeter-buildings.js';
import { buildEnemyStronghold } from '../terrains/enemy-stronghold.js';
import { createSandCanvas, createSandPatchMask } from '../terrains/sand.js';
import {
  TacticalModels,
  createContainerBlock as buildContainerBlock,
  createCrushableProp as buildCrushableProp,
  createLocomotiveBlock as buildLocomotiveBlock,
  createRailBlock as buildRailBlock,
  createRailBridgeBlock as buildRailBridgeBlock,
  createRailCarBlock as buildRailCarBlock,
  createRailCurveBlock as buildRailCurveBlock,
  createSandbagsBlock as buildSandbagsBlock,
  createTransformerBlock as buildTransformerBlock,
  updateContainerDamage as refreshContainerDamage,
  updateLocomotiveDamage as refreshLocomotiveDamage,
  updateRailCarDamage as refreshRailCarDamage,
  updateTransformerDamage as refreshTransformerDamage,
} from '../terrains/tactical-models.js';

/** Runtime sand patches: rim variants, share of the patch the cell occupies, and pattern repeat in cells. */
const SAND_PATCH_VARIANTS = 6;
const SAND_PATCH_CELL_FRACTION = 0.6;
const SAND_PATTERN_CELLS = 4;

/** Samples a material's colour map in world XZ (one texture repeat per SAND_PATTERN_CELLS tiles); works instanced. */
function applyWorldSurfaceUv(material) {
  const span = (TILE_SIZE * SAND_PATTERN_CELLS).toFixed(3);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_MAP
        vec4 surfaceWorld = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          surfaceWorld = instanceMatrix * surfaceWorld;
        #endif
        surfaceWorld = modelMatrix * surfaceWorld;
        vMapUv = (mapTransform * vec3(surfaceWorld.x / ${span}, surfaceWorld.z / ${span}, 1.0)).xy;
      #endif`
    );
  };
  material.customProgramCacheKey = () => `world-surface-uv-${span}`;
  return material;
}

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
  radarUrl: './models/player_radar.glb',
  scale: 0.26,
  turretY: 1.55,
  gunY: 1.94,
  muzzleX: Object.freeze([6.52, 7.21, 7.67, 7.9, 7.92]),
  glow: { sat: 0.76 },
});
const PLAYER_BARREL_BASE_Z = 0.46;

/** Removes the legacy commander optics mast and center-rear antenna from Turret_Base so Radar R1-R5 mount cleanly while keeping the left-rear antenna. */
function stripTurretMastAndAntennas(geometry) {
  const pos = geometry?.attributes?.position;
  const idx = geometry?.index;
  if (!pos || !idx) return geometry;
  const isCleared = (vi) => {
    const x = pos.getX(vi);
    const y = pos.getY(vi);
    const z = pos.getZ(vi);
    if (y <= 2.265) return false;
    const inMast = x >= -1.36 && x <= -0.94 && z >= 0.34 && z <= 0.76;
    const inAnt2 = x >= -1.72 && x <= -1.48 && z >= 0.08 && z <= 0.32;
    return inMast || inAnt2;
  };
  const next = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    if (!isCleared(a) && !isCleared(b) && !isCleared(c)) {
      next.push(a, b, c);
    }
  }
  const cloned = geometry.clone();
  cloned.setIndex(next);
  return cloned;
}

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

function getTankGltfLoader(renderer) {
  return getSharedGltfLoader(renderer);
}

/**
 * Computes road connectivity, 2-lane divider mask, and corner rounding type for a road cell.
 * @param {(r: number, c: number) => boolean} isRoad
 * @param {number} r
 * @param {number} c
 * @param {number} [gridSize=40]
 * @returns {{ roadMask: number, doubleLaneMask: number, cornerType: 'none'|'std'|'wide' }}
 */
export function computeRoadCellMasks(isRoad, r, c, gridSize = 40) {
  const rawN = isRoad(r - 1, c);
  const rawE = isRoad(r, c + 1);
  const rawS = isRoad(r + 1, c);
  const rawW = isRoad(r, c - 1);
  const n = r === 0 ? rawN || rawS : rawN;
  const s = r === gridSize - 1 ? rawS || rawN : rawS;
  const w = c === 0 ? rawW || rawE : rawW;
  const e = c === gridSize - 1 ? rawE || rawW : rawE;
  const roadMask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
  const doubleLaneMask =
    (n && e && w && !s && (isRoad(r - 1, c + 1) || isRoad(r - 1, c - 1)) ? 1 : 0) |
    (e && n && s && !w && (isRoad(r - 1, c + 1) || isRoad(r + 1, c + 1)) ? 2 : 0) |
    (s && e && w && !n && (isRoad(r + 1, c + 1) || isRoad(r + 1, c - 1)) ? 4 : 0) |
    (w && n && s && !e && (isRoad(r - 1, c - 1) || isRoad(r + 1, c - 1)) ? 8 : 0);

  let cornerType = 'none';
  const isCorner =
    (n && e && !s && !w) ||
    (n && w && !s && !e) ||
    (s && e && !n && !w) ||
    (s && w && !n && !e);
  if (isCorner) {
    const dr = n ? -1 : 1;
    const dc = e ? 1 : -1;
    const diag = isRoad(r + dr, c + dc);
    if (!diag) {
      cornerType = 'std';
    } else {
      const armV = (r + dr * 2 < 0 || r + dr * 2 >= gridSize) || isRoad(r + dr * 2, c) || isRoad(r + dr * 2, c + dc);
      const armH = (c + dc * 2 < 0 || c + dc * 2 >= gridSize) || isRoad(r, c + dc * 2) || isRoad(r + dr, c + dc * 2);
      if (armV && armH) cornerType = 'wide';
    }
  }
  return { roadMask, doubleLaneMask, cornerType };
}

export class ModelFactory extends TextureGenerator {
  /** @param {object} [pregenerated] results of texture-worker.js keyed by generator name;. */
  constructor(renderer, isSoftwareGl, pregenerated = null, options = {}) {
    const headless = Boolean(options.headless);
    super({ maxAnisotropy: renderer?.capabilities?.getMaxAnisotropy?.() ?? 1 });
    this.pregenerated = pregenerated || {};
    this.renderer = renderer;
    this.maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    this.isSoftwareGl = isSoftwareGl;
    if (!headless) {
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
    } else {
      this.brickDamageMaterials = options.brickDamageMaterials || new Map();
    }
    this.brickModels = options.brickModels || new BrickModels(renderer);
    this.landmarkModels = options.landmarkModels || new LandmarkModels(renderer);
    this.useBlenderBricks = options.useBlenderBricks ?? !isSoftwareGl;
    this.brickModelsPromise = options.brickModelsPromise ?? (
      !headless && this.useBlenderBricks
        ? this.loadTileModels(this.brickModels, () => this.onBrickModelsReady?.())
        : Promise.resolve(false)
    );
    this.concreteModels = options.concreteModels || new ConcreteModels(renderer);
    this.useBlenderConcrete = options.useBlenderConcrete ?? !isSoftwareGl;
    this.concreteModelsPromise = options.concreteModelsPromise ?? (
      !headless && this.useBlenderConcrete
        ? this.loadTileModels(this.concreteModels, () => this.onConcreteModelsReady?.())
        : Promise.resolve(false)
    );
    this.buildingModels = options.buildingModels || new BuildingModels(renderer);
    this.useBlenderBuildings = options.useBlenderBuildings ?? !isSoftwareGl;
    this.buildingModelsPromise = options.buildingModelsPromise ?? (
      !headless && this.useBlenderBuildings
        ? this.loadTileModels(this.buildingModels, () => this.onBuildingModelsReady?.())
        : Promise.resolve(false)
    );
    this.tacticalModels = options.tacticalModels || new TacticalModels(renderer);
    this.useBlenderTactical = options.useBlenderTactical ?? !isSoftwareGl;
    this.tacticalModelsPromise = options.tacticalModelsPromise ?? (
      !headless && this.useBlenderTactical
        ? this.loadTileModels(this.tacticalModels, () => this.onTacticalModelsReady?.())
        : Promise.resolve(false)
    );
    if (!headless) {
      this.concreteTex = this.generated('createConcreteTextures');
      this.groundTex = this.generated('createGroundTexture');
      this.iceTex = this.generated('createIceTextures');
      this.waterTex = this.generated('createWaterTextures');
      this.shadowTex = this.generated('createShadowTexture');
      this.tankArmorTex = this.generated('createTankArmorTexture');
      this.trackTreadTex = this.generated('createTrackTreadTexture');
    } else {
      this.concreteMats = options.concreteMats || null;
      this.shadowTex = null;
      this.tankArmorTex = null;
      this.trackTreadTex = null;
    }
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
    this.glbLoadPromises = new Map();
    this.glbTurretParts = new Map();
    this.pendingTurretRigs = new Map();
    this.glbTurretRequestedUrls = new Set();
    this.playerRadarGlbParts = null;
    this.pendingPlayerRadarRigs = [];
    this.playerGlbPromise = options.playerGlbPromise ?? (
      !headless && !isSoftwareGl ? this.loadPlayerGlbModel() : Promise.resolve()
    );
    this.playerRadarGlbPromise = options.playerRadarGlbPromise ?? (
      !headless && !isSoftwareGl ? this.loadPlayerRadarGlbModel() : Promise.resolve()
    );
    if (options.loadGlbTankModel) {
      this.loadGlbTankModel = options.loadGlbTankModel;
    }
    if (options.ensureEnemyModels) {
      this.ensureEnemyModels = options.ensureEnemyModels;
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
    if (this.isSoftwareGl) return Promise.resolve([]);
    const promises = [];
    for (const enemyClass of enemyClasses) {
      const url = GLB_TANK_MODELS[enemyClass]?.url;
      if (!url) continue;
      if (!this.glbRequestedUrls.has(url)) {
        this.glbRequestedUrls.add(url);
        this.glbLoadPromises.set(
          url,
          this.loadGlbTankModel(this.glbClassesByUrl.get(url), url)
        );
      }
      const pending = this.glbLoadPromises.get(url);
      if (pending) promises.push(pending);
    }
    return Promise.all(promises);
  }

  /** Releases cached GLB geometries/textures/materials for enemy classes not used on the active map. */
  pruneEnemyModels(keepEnemyClasses = []) {
    if (!this.glbTankParts || this.glbTankParts.size === 0) return 0;
    const keepUrls = new Set();
    for (const enemyClass of keepEnemyClasses) {
      const url = GLB_TANK_MODELS[enemyClass]?.url;
      if (url) keepUrls.add(url);
    }

    const disposePartsList = (meshes) => {
      if (!Array.isArray(meshes)) return;
      for (const mesh of meshes) {
        mesh?.geometry?.dispose?.();
        const mats = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.map?.dispose?.();
          mat.normalMap?.dispose?.();
          mat.roughnessMap?.dispose?.();
          mat.metalnessMap?.dispose?.();
          mat.dispose?.();
        }
      }
    };

    let pruned = 0;
    for (const [enemyClass, classParts] of [...this.glbTankParts.entries()]) {
      const url = GLB_TANK_MODELS[enemyClass]?.url;
      if (url && keepUrls.has(url)) continue;
      disposePartsList(classParts?.hull);
      disposePartsList(classParts?.turret);
      disposePartsList(classParts?.gun);
      if (Array.isArray(classParts?.turrets)) {
        for (const entry of classParts.turrets) {
          disposePartsList(entry?.turret);
          disposePartsList(entry?.gun);
        }
      }
      this.glbTankParts.delete(enemyClass);
      if (url) {
        this.glbRequestedUrls?.delete(url);
        this.glbLoadPromises?.delete(url);
      }
      pruned += 1;
    }
    return pruned;
  }

  /** Loads Blender tile models; tiles keep their procedural version if the asset is unavailable. */
  loadTileModels(models, onReady) {
    return models.load()
      .then(ready => {
        if (ready) onReady();
        return Boolean(ready);
      })
      .catch(error => {
        console.warn(`${models.prefix} models unavailable; using procedural fallback.`, error);
        return false;
      });
  }

  /** Resolves once the player GLB, brick and concrete models, requested enemy GLBs, and optional sector landmarks settle. */
  waitForModels(enemyClasses = [], options = {}) {
    if (this.isSoftwareGl) return Promise.resolve();
    const tasks = [
      this.playerGlbPromise,
      this.playerRadarGlbPromise,
      this.brickModelsPromise,
      this.concreteModelsPromise,
      this.buildingModelsPromise,
      this.tacticalModelsPromise,
      this.ensureEnemyModels(enemyClasses),
    ];
    // `options.landmarks`: the sector's landmark kinds (only their GLB packs load), or true for every pack.
    const landmarkKinds = Array.isArray(options.landmarks) ? options.landmarks : options.landmarks ? undefined : [];
    if (landmarkKinds?.length !== 0 && this.landmarkModels?.ensureLoaded) {
      tasks.push(this.landmarkModels.ensureLoaded(landmarkKinds));
    }
    return Promise.all(tasks);
  }

  loadPlayerGlbModel() {
    return new Promise((resolve) => {
      getTankGltfLoader(this.renderer).load(
        resolvePublicUrl(PLAYER_GLB_MODEL.url),
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const parts = new Map();
          gltf.scene.traverse((node) => {
            if (!node.isMesh) return;
            const mesh = node.clone();
            if (node.name === 'Turret_Base') {
              mesh.geometry = stripTurretMastAndAntennas(mesh.geometry);
            }
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
          resolve();
        },
        undefined,
        (err) => {
          this.pendingPlayerRigs = [];
          console.warn('Player tank GLB unavailable, using procedural rig.', err);
          resolve();
        }
      );
    });
  }

  loadPlayerRadarGlbModel() {
    return new Promise((resolve) => {
      getTankGltfLoader(this.renderer).load(
        resolvePublicUrl(PLAYER_GLB_MODEL.radarUrl),
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const parts = new Map();
          for (let i = 1; i <= 5; i += 1) {
            const key = `R${i}`;
            const node = gltf.scene.getObjectByName(key);
            if (!node) continue;
            const clone = node.clone(true);
            clone.traverse((child) => {
              if (!child.isMesh) return;
              child.castShadow = true;
              child.receiveShadow = true;
              addBakedGlow(child.material, PLAYER_GLB_MODEL.glow);
            });
            parts.set(key, clone);
          }
          this.playerRadarGlbParts = parts;
          this.pendingPlayerRadarRigs.forEach((rig) => this.applyPlayerRadarGlb(rig));
          this.pendingPlayerRadarRigs = [];
          this.onModelReady?.('player_radar');
          resolve();
        },
        undefined,
        (err) => {
          this.pendingPlayerRadarRigs = [];
          console.warn('Player radar GLB unavailable.', err);
          resolve();
        }
      );
    });
  }

  applyPlayerRadarGlb(rig) {
    if (!rig?.radarGroups || !this.playerRadarGlbParts) return;
    const cfg = PLAYER_GLB_MODEL;
    const s = cfg.scale;
    const turretY = cfg.turretY * s;
    rig.radarGroups.forEach((g, i) => {
      g.children.slice().forEach((c) => {
        disposeOwned(c);
        g.remove(c);
      });
      const obj = this.playerRadarGlbParts.get(`R${i + 1}`)?.clone(true);
      if (!obj) return;
      const group = new THREE.Group();
      group.rotation.y = -Math.PI / 2;
      group.scale.setScalar(s);
      group.position.set(0, -turretY, 0);
      group.add(obj);
      g.add(group);
    });
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

    const turretKeep = new Set([...rig.turretArmorGroups, ...(rig.radarGroups || []), rig.barrelPivot]);
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
    return new Promise((resolve) => {
      getTankGltfLoader(this.renderer).load(
        resolvePublicUrl(url),
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
        resolve();
      },
      undefined,
      (err) => {
        enemyClasses.forEach((enemyClass) => this.pendingEnemyRigs.delete(enemyClass));
        console.warn(`${enemyClasses.join(', ')} tank GLB unavailable, using procedural rig.`, err);
        resolve();
      }
    );
    });
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
    const fadeMaterials = [];
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
        copy.material = markMaterialOwned(addBakedGlow(copy.material.clone(), cfg.glow));
        if (gearMesh) addGearMotion(copy.material, gear);
        if (stealthMaterials) {
          copy.material.transparent = true;
          copy.material.opacity = 0.22;
          copy.castShadow = false;
          stealthMaterials.push(copy.material);
        } else {
          copy.material.opacity = 1.0;
        }
        fadeMaterials.push(copy.material);
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
      rig.fadeMaterials = fadeMaterials;
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
    if (stealthMaterials) {
      if (rig.stealthMaterials) {
        rig.stealthMaterials.splice(0, rig.stealthMaterials.length, ...stealthMaterials);
      } else {
        rig.stealthMaterials = stealthMaterials;
      }
    }
    rig.fadeMaterials = fadeMaterials;
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

    markOwned(root);
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
      resolvePublicUrl(cfg.url),
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
  createLoadingTankRig({ isPlayer = false, enemyClass = null, skeletonOnly = false } = {}) {
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

    let addHoloBox = null;
    let addHoloCylinder = null;
    let badgeTex = null;
    let holoStealthMaterials = null;
    let holoFadeMaterials = null;

    if (!skeletonOnly) {
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
      if (!isPlayer) {
        holoFadeMaterials = [holoMat, trackMat];
        if (enemyClass === EnemyClass.STEALTH) {
          holoStealthMaterials = [holoMat, trackMat, ringMat, wireMat];
        }
      }

      addHoloBox = (parent, w, h, d, x = 0, y = 0, z = 0, rx = 0, mat = holoMat) => {
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

      addHoloCylinder = (parent, rt, rb, h, segs, x = 0, y = 0, z = 0, rx = 0) => {
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
    }
    root.add(hull);

    // Turret & Gun Barrel
    turret.position.set(0, 0.46 * scale, 0);
    if (!skeletonOnly) {
      addHoloBox(turret, 0.8 * scale, 0.32 * scale, 1.05 * scale, 0, 0.16 * scale, 0);
      addHoloBox(turret, 0.52 * scale, 0.24 * scale, 0.35 * scale, 0, 0.14 * scale, 0.55 * scale);

      // Floating Holographic "LOADING..." Badge on turret
      badgeTex = this.getLoadingBadgeTexture();
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
    }

    barrelPivot.position.set(0, 0.14 * scale, 0.55 * scale);
    if (!skeletonOnly) {
      addHoloCylinder(barrelPivot, 0.06 * scale, 0.075 * scale, 1.25 * scale, 12, 0, 0, 0.65 * scale, Math.PI / 2);
      addHoloCylinder(barrelPivot, 0.095 * scale, 0.095 * scale, 0.18 * scale, 12, 0, 0, 1.28 * scale, Math.PI / 2);
    }

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
        if (!skeletonOnly) {
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
        }

        const rearBarrelPivot = new THREE.Group();
        rearBarrelPivot.position.set(0, 0.14 * scale, 0.55 * scale);
        if (!skeletonOnly) {
          addHoloCylinder(rearBarrelPivot, 0.06 * scale, 0.075 * scale, 1.25 * scale, 12, 0, 0, 0.65 * scale, Math.PI / 2);
          addHoloCylinder(rearBarrelPivot, 0.095 * scale, 0.095 * scale, 0.18 * scale, 12, 0, 0, 1.28 * scale, Math.PI / 2);
        }

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
    const radarGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;
    const cannonGroups = isPlayer ? Array.from({ length: 5 }, () => new THREE.Group()) : null;

    if (isPlayer) {
      chassisGroups.forEach((g) => hull.add(g));
      frameHullGroups.forEach((g) => hull.add(g));
      engineGroups.forEach((g) => hull.add(g));
      hullArmorGroups.forEach((g) => hull.add(g));
      turretArmorGroups.forEach((g) => turret.add(g));
      radarGroups.forEach((g) => turret.add(g));
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
      stealthMaterials: holoStealthMaterials,
      fadeMaterials: holoFadeMaterials,
      muzzleDist: barrelPivot.position.z + muzzleFlash.position.z,
      missileMounts: null,
      clearanceSources: [],
      flashOffsets: isPlayer ? [1.25, 1.44, 1.62, 1.74, 1.82] : null,
      chassisGroups,
      frameHullGroups,
      engineGroups,
      hullArmorGroups,
      turretArmorGroups,
      radarGroups,
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
    const hasGlb = Boolean(this.playerGlbParts);
    const rig = this.createLoadingTankRig({ isPlayer: true, skeletonOnly: hasGlb });
    markOwned(rig.root);
    if (hasGlb) {
      this.applyPlayerGlb(rig);
    } else if (!this.isSoftwareGl) {
      this.pendingPlayerRigs.push(rig);
    }
    if (this.playerRadarGlbParts) {
      this.applyPlayerRadarGlb(rig);
    } else if (!this.isSoftwareGl) {
      this.pendingPlayerRadarRigs.push(rig);
    }

    this.updatePlayerTankVisuals(
      rig,
      { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1, radar: 1 },
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
    const rawChassisLvl = upgrades?.chassis || 1;
    const chassisIdx = Math.max(0, Math.min(4, rawChassisLvl - 1));
    const rawFrameLvl = upgrades?.frame || 1;
    const frameIdx = Math.max(0, Math.min(4, rawFrameLvl - 1));
    const engineIdx = Math.max(0, Math.min(4, (upgrades?.engine || 1) - 1));
    const armorIdx = Math.max(0, Math.min(4, (upgrades?.armor || 1) - 1));
    const radarIdx = Math.max(0, Math.min(4, (upgrades?.radar || 1) - 1));

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

    if (rig.radarGroups) {
      rig.radarGroups.forEach((g, idx) => {
        setPartActive(g, idx === radarIdx);
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
    const hasGlb = this.glbTankParts.has(enemyClass);
    const rig = this.createLoadingTankRig({ isPlayer: false, enemyClass, skeletonOnly: hasGlb });
    markOwned(rig.root);
    if (hasGlb) {
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
    for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) {
      for (const x of [-1.45, 1.45]) box(0.9, 0.13, 0.1, m.trim, x, 0.155, z);
    }
    for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
      box(0.1, 0.128, D - 0.24, m.trim, x, 0.146, 0);
      for (const z of [-0.45, 0.45]) box(0.02, 0.04, 0.16, m.lamp, x + Math.sign(x) * 0.05, 0.16, z, false);
      for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) box(0.16, 0.266, 0.16, m.trim, x - Math.sign(x) * 0.05, 0.207, z);
    }

    // Garage shell: three full-depth piers, roof deck, and headers with a red band over both open faces.
    const HX = -0.15;
    const HW = 2.5;
    const HD = 1.5;
    const pierW = 0.2;
    const wallH = 1.15;
    const doorH = 0.76;
    const headerH = wallH - doorH;
    for (const x of [HX - HW / 2, HX, HX + HW / 2]) {
      // End piers rise above the roof deck like the buttresses of the concept; the centre pier stops just under the roof surface.
      const pierH = wallH + (x === HX ? 0.11 : 0.3);
      box(pierW, pierH + 0.01, HD + 0.08, m.wall, x, 0.095 + pierH / 2, 0);
      if (x !== HX) box(pierW + 0.04, 0.04, HD + 0.12, m.trim, x, 0.12 + pierH, 0, false);
      for (const z of [-1, 1]) box(pierW + 0.01, 0.42, 0.02, m.hazard, x, 0.33, z * (HD / 2 + 0.05), false);
    }
    box(HW, 0.12, HD + 0.04, m.roof, HX, 0.1 + wallH + 0.06, 0);
    for (const i of [-3, -2, -1, 1, 2, 3]) {
      box(0.02, 0.02, HD - 0.1, m.trim, HX + (i * HW) / 8, 0.1 + wallH + 0.13, 0, false);
    }
    for (const z of [-1, 1]) {
      const fz = z * (HD / 2 - 0.05);
      const headerY = 0.1 + doorH + headerH / 2;
      box(HW - 0.02, headerH, 0.12, m.wall, HX, headerY, fz);
      box(HW + 0.01, 0.07, 0.13, m.red, HX, headerY + 0.02, fz);
      for (const bx of [HX - HW / 4, HX + HW / 4]) box(0.22, 0.03, 0.05, m.lamp, bx, 0.1 + doorH - 0.02, fz - z * 0.06, false);
      const sign = add(group, new THREE.Mesh(this.sharedGeometry('PlaneGeometry', 0.92, 0.345), m.sign), HX, headerY, z * (HD / 2 + 0.065), false);
      if (z < 0) sign.rotation.y = Math.PI;
    }

    // Bays: dark floor plates, ceiling lights and a yellow gantry crane with a hook in each bay.
    for (const bx of [HX - HW / 4, HX + HW / 4]) {
      box(HW / 2 - pierW, 0.014, HD - 0.04, m.bay, bx, 0.108, 0, false);
      box(HW / 2 - pierW, 0.02, HD, m.interior, bx, 0.1 + wallH - 0.015, 0, false);
      box(HW / 2 - pierW, 0.08, 0.1, m.crane, bx, 0.1 + doorH - 0.08, 0);
      box(0.12, 0.08, 0.11, m.crane, bx + 0.12, 0.1 + doorH - 0.15, 0);
      box(0.015, 0.12, 0.015, m.steel, bx + 0.12, 0.1 + doorH - 0.25, 0, false);
      box(0.06, 0.05, 0.03, m.crane, bx + 0.12, 0.1 + doorH - 0.33, 0, false);
      for (const z of [-0.3, 0.3]) box(0.16, 0.025, 0.06, m.lamp, bx, 0.1 + wallH - 0.03, z, false);
    }

    // Parked tank on service ramps in the west bay.
    const tank = new THREE.Group();
    for (const z of [-0.26, 0.26]) box(0.9, 0.04, 0.12, m.steel, 0, 0.02, z, true, tank);
    for (const x of [-0.26, 0.26]) box(0.14, 0.15, 0.82, m.track, x, 0.13, 0, true, tank);
    box(0.42, 0.14, 0.86, m.tank, 0, 0.21, 0, true, tank);
    box(0.67, 0.03, 0.78, m.tank, 0, 0.215, 0, true, tank);
    box(0.36, 0.13, 0.38, m.tank, 0, 0.345, 0.05, true, tank);
    box(0.12, 0.05, 0.14, m.tank, 0.08, 0.43, 0.08, true, tank);
    const barrel = add(tank, new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 0.03, 0.035, 0.42, 8), m.tank), 0, 0.35, -0.33, true);
    barrel.rotation.x = Math.PI / 2;
    tank.position.set(HX - HW / 4, 0.11, 0.06);
    tank.scale.setScalar(0.95);
    group.add(tank);

    // East bay: tool chest and parts cabinet.
    const toolX = HX + HW / 2 - pierW / 2 - 0.15;
    box(0.26, 0.21, 0.14, m.red, toolX, 0.195, -0.3);
    box(0.27, 0.02, 0.15, m.steel, toolX, 0.31, -0.3, false);
    box(0.16, 0.37, 0.2, m.cabinet, toolX + 0.03, 0.275, 0.32);

    // Fuel depot at the east end: tank on saddles inside a yellow guard rail.
    const fuelX = W / 2 - 0.36;
    const fuelTank = add(group, new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 0.2, 0.2, 0.86, 16), m.fuel), fuelX, 0.36, 0, true);
    fuelTank.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    for (const z of [-1, 1]) {
      const cap = add(group, new THREE.Mesh(this.sharedGeometry('SphereGeometry', 0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.fuelCap), fuelX, 0.36, z * 0.43, false);
      cap.scale.set(1, 0.35, 1);
      cap.rotation.x = z * Math.PI / 2;
    }
    for (const z of [-0.25, 0.25]) box(0.32, 0.15, 0.08, m.steel, fuelX, 0.165, z);
    box(0.08, 0.06, 0.08, m.fuelCap, fuelX, 0.58, -0.32);
    const railY = 0.32;
    for (const x of [fuelX - 0.29, fuelX + 0.29]) {
      box(0.03, 0.03, 1.13, m.crane, x, railY, 0, false);
      for (const z of [-0.51, 0, 0.51]) box(0.018, railY - 0.074, 0.018, m.crane, x, 0.074 + (railY - 0.074) / 2, z, false);
    }
    for (const z of [-0.545, 0.545]) box(0.56, 0.018, 0.018, m.crane, fuelX, railY, z, false);

    // Ammunition crates at the west end.
    const crateX = -W / 2 + 0.3;
    box(0.36, 0.318, 0.42, m.crate, crateX, 0.241, 0.26);
    box(0.26, 0.218, 0.26, m.crate, crateX + 0.02, 0.191, -0.3).rotation.y = 0.25;
    box(0.22, 0.16, 0.24, m.crate, crateX - 0.01, 0.48, 0.24).rotation.y = -0.15;

    // ~90 static garage parts -> one draw per material (the repair disc below stays separate)
    mergeStaticMeshes(group);

    const repairGeo = new THREE.CircleGeometry(7.0, 64);
    repairGeo.rotateX(-Math.PI / 2);
    const repairZone = new THREE.Mesh(repairGeo, m.repair);
    repairZone.position.y = 0.03;
    repairZone.renderOrder = 1;
    // Only the repair disc geometry is per-instance; garage parts use the shared geometry cache.
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

  /** Creates a 1-story (house1) or 2-story (house2) modular building tile. */
  createBuildingBlock(kind, part, yaw, hp, maxHp, style = 0) {
    const state = buildingDamageState(hp, maxHp, kind);
    let group;
    let subMeshes;
    if (this.useBlenderBuildings && this.buildingModels.ready) {
      group = new THREE.Group();
      this.buildingModels.apply(group, kind, part, state, style);
    } else if (kind === 'house2') {
      group = this.createConcreteBlock();
    } else {
      const brick = this.createBrickBlock();
      group = brick.group;
      subMeshes = brick.subMeshes;
    }
    group.rotation.y = yaw;
    group.userData.batchTile = true;
    group.userData.building = { kind, part, yaw, style, hp, maxHp };
    return { group, subMeshes };
  }

  /** Builds and caches shared textures, materials, and faceted rock/slab geometries for rubble tiles. */
  ensureRubbleAssets() {
    if (this.rubbleMats && this.rubbleGeos) return;

    let seed = 7331;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // 1. Irregular crushed-mortar & gravel ground decal (transparent edges, no puddle look)
    const decalCanvas = document.createElement('canvas');
    decalCanvas.width = 256;
    decalCanvas.height = 256;
    const dCtx = decalCanvas.getContext('2d');
    dCtx.clearRect(0, 0, 256, 256);

    // Jagged polygonal dust/gravel patches instead of smooth radial circles
    for (let p = 0; p < 14; p++) {
      const ang = (p / 14) * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const dist = p < 4 ? rand() * 22 : 22 + rand() * 48;
      const px = 128 + Math.cos(ang) * dist;
      const py = 128 + Math.sin(ang) * dist;
      const rad = p < 4 ? 38 + rand() * 22 : 18 + rand() * 26;
      const sides = 6 + Math.floor(rand() * 4);
      dCtx.fillStyle =
        p % 3 === 0
          ? 'rgba(118, 110, 99, 0.56)'
          : p % 3 === 1
            ? 'rgba(92, 86, 78, 0.52)'
            : 'rgba(66, 61, 56, 0.48)';
      dCtx.beginPath();
      for (let s = 0; s < sides; s++) {
        const sa = (s / sides) * Math.PI * 2;
        const sr = rad * (0.65 + rand() * 0.5);
        const vx = px + Math.cos(sa) * sr;
        const vy = py + Math.sin(sa) * sr;
        if (s === 0) dCtx.moveTo(vx, vy);
        else dCtx.lineTo(vx, vy);
      }
      dCtx.closePath();
      dCtx.fill();
    }

    // Dark shadow pockets beneath the main debris pile
    for (let i = 0; i < 8; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = rand() * 44;
      const px = 128 + Math.cos(ang) * dist;
      const py = 128 + Math.sin(ang) * dist;
      const rad = 14 + rand() * 22;
      const grad = dCtx.createRadialGradient(px, py, 2, px, py, rad);
      grad.addColorStop(0, 'rgba(20, 18, 16, 0.72)');
      grad.addColorStop(1, 'rgba(20, 18, 16, 0)');
      dCtx.fillStyle = grad;
      dCtx.beginPath();
      dCtx.arc(px, py, rad, 0, Math.PI * 2);
      dCtx.fill();
    }

    // Crisp gravel grit, crushed brick chips, and soot flecks
    for (let i = 0; i < 280; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = Math.pow(rand(), 0.72) * 108;
      const gx = 128 + Math.cos(ang) * dist;
      const gy = 128 + Math.sin(ang) * dist;
      const sz = 1.2 + rand() * 3.4;
      const tone = rand();
      dCtx.fillStyle =
        tone < 0.22
          ? 'rgba(138, 72, 54, 0.82)'
          : tone < 0.55
            ? 'rgba(148, 140, 128, 0.78)'
            : tone < 0.82
              ? 'rgba(84, 79, 73, 0.82)'
              : 'rgba(32, 29, 26, 0.85)';
      dCtx.save();
      dCtx.translate(gx, gy);
      dCtx.rotate(rand() * Math.PI);
      dCtx.fillRect(-sz * 0.5, -sz * 0.35, sz, sz * 0.7);
      dCtx.restore();
    }

    const decalTex = this.configureColorTexture(new THREE.CanvasTexture(decalCanvas));

    // 2. Weathered fractured concrete/stone albedo + matching bump map
    const stoneCanvas = document.createElement('canvas');
    stoneCanvas.width = 256;
    stoneCanvas.height = 256;
    const sCtx = stoneCanvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 256;
    const bCtx = bumpCanvas.getContext('2d');

    sCtx.fillStyle = '#847e75';
    sCtx.fillRect(0, 0, 256, 256);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 90; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const r = 8 + rand() * 24;
      const light = rand() > 0.45;
      sCtx.fillStyle = light ? 'rgba(162, 154, 142, 0.28)' : 'rgba(72, 68, 62, 0.32)';
      bCtx.fillStyle = light ? 'rgba(210, 210, 210, 0.25)' : 'rgba(55, 55, 55, 0.28)';
      sCtx.beginPath();
      bCtx.beginPath();
      for (let v = 0; v < 5; v++) {
        const va = (v / 5) * Math.PI * 2;
        const vr = r * (0.6 + rand() * 0.5);
        const vx = x + Math.cos(va) * vr;
        const vy = y + Math.sin(va) * vr;
        if (v === 0) {
          sCtx.moveTo(vx, vy);
          bCtx.moveTo(vx, vy);
        } else {
          sCtx.lineTo(vx, vy);
          bCtx.lineTo(vx, vy);
        }
      }
      sCtx.closePath();
      bCtx.closePath();
      sCtx.fill();
      bCtx.fill();
    }

    // Aggregate speckles (basalt & quartz)
    for (let i = 0; i < 420; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const sz = 1 + rand() * 2.2;
      const bright = rand() > 0.55;
      sCtx.fillStyle = bright ? 'rgba(195, 188, 176, 0.45)' : 'rgba(44, 41, 38, 0.5)';
      sCtx.fillRect(x, y, sz, sz);
      bCtx.fillStyle = bright ? 'rgba(230, 230, 230, 0.4)' : 'rgba(35, 35, 35, 0.45)';
      bCtx.fillRect(x, y, sz, sz);
    }

    // Hairline fracture cracks
    for (let i = 0; i < 18; i++) {
      let cx = rand() * 256;
      let cy = rand() * 256;
      let ang = rand() * Math.PI * 2;
      sCtx.strokeStyle = 'rgba(34, 31, 28, 0.65)';
      bCtx.strokeStyle = 'rgba(20, 20, 20, 0.8)';
      sCtx.lineWidth = 1.1 + rand() * 1.2;
      bCtx.lineWidth = sCtx.lineWidth + 0.5;
      sCtx.beginPath();
      bCtx.beginPath();
      sCtx.moveTo(cx, cy);
      bCtx.moveTo(cx, cy);
      for (let seg = 0; seg < 4; seg++) {
        ang += (rand() - 0.5) * 0.9;
        cx += Math.cos(ang) * (10 + rand() * 16);
        cy += Math.sin(ang) * (10 + rand() * 16);
        sCtx.lineTo(cx, cy);
        bCtx.lineTo(cx, cy);
      }
      sCtx.stroke();
      bCtx.stroke();
    }

    const stoneTex = this.configureColorTexture(new THREE.CanvasTexture(stoneCanvas));
    stoneTex.wrapS = THREE.RepeatWrapping;
    stoneTex.wrapT = THREE.RepeatWrapping;
    const stoneBumpTex = new THREE.CanvasTexture(bumpCanvas);
    stoneBumpTex.wrapS = THREE.RepeatWrapping;
    stoneBumpTex.wrapT = THREE.RepeatWrapping;
    stoneBumpTex.needsUpdate = true;

    // 3. Broken terracotta brick & mortar texture
    const brickCanvas = document.createElement('canvas');
    brickCanvas.width = 128;
    brickCanvas.height = 128;
    const brCtx = brickCanvas.getContext('2d');
    brCtx.fillStyle = '#8b4a38';
    brCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 55; i++) {
      brCtx.fillStyle =
        i % 3 === 0
          ? 'rgba(176, 166, 152, 0.42)'
          : i % 3 === 1
            ? 'rgba(104, 48, 35, 0.52)'
            : 'rgba(158, 92, 68, 0.44)';
      brCtx.fillRect(rand() * 128, rand() * 128, 6 + rand() * 18, 4 + rand() * 12);
    }
    const brickTex = this.configureColorTexture(new THREE.CanvasTexture(brickCanvas));
    brickTex.wrapS = THREE.RepeatWrapping;
    brickTex.wrapT = THREE.RepeatWrapping;

    const makeBatchMat = (key, opts) => {
      const mat = new THREE.MeshStandardMaterial(opts);
      mat.userData.batchKey = key;
      return mat;
    };

    this.rubbleMats = {
      decal: makeBatchMat('rubble-decal', {
        map: decalTex,
        transparent: true,
        depthWrite: false,
        roughness: 0.98,
        metalness: 0.02,
        polygonOffset: true,
        polygonOffsetUnits: -1,
      }),
      stoneLight: makeBatchMat('rubble-stone-light', {
        color: 0xffffff,
        map: stoneTex,
        bumpMap: stoneBumpTex,
        bumpScale: 0.055,
        roughness: 0.9,
        metalness: 0.04,
      }),
      stoneDark: makeBatchMat('rubble-stone-dark', {
        color: 0x7a756e,
        map: stoneTex,
        bumpMap: stoneBumpTex,
        bumpScale: 0.06,
        roughness: 0.94,
        metalness: 0.05,
      }),
      brick: makeBatchMat('rubble-brick', {
        color: 0xffffff,
        map: brickTex,
        bumpMap: stoneBumpTex,
        bumpScale: 0.04,
        roughness: 0.92,
        metalness: 0.03,
      }),
      rebar: makeBatchMat('rubble-rebar', {
        color: 0x4a3b34,
        roughness: 0.65,
        metalness: 0.72,
      }),
    };

    // Sculpted flat-shaded fractured rock & broken slab geometries (cached for TileBatcher)
    const makeRockGeo = (key, radius, detail, geoSeed, sx = 1, sy = 0.7, sz = 1) => {
      let gSeed = geoSeed;
      const gRand = () => {
        gSeed = (Math.imul(gSeed, 1664525) + 1013904223) >>> 0;
        return gSeed / 4294967296;
      };
      const base = new THREE.IcosahedronGeometry(radius, detail);
      const pos = base.attributes.position;
      const vertOffsets = new Map();
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const vKey = `${Math.round(vx * 1000)},${Math.round(vy * 1000)},${Math.round(vz * 1000)}`;
        let factor = vertOffsets.get(vKey);
        if (factor === undefined) {
          factor = 0.72 + gRand() * 0.56;
          vertOffsets.set(vKey, factor);
        }
        const yFactor = vy < 0 ? factor * 0.55 : factor;
        pos.setXYZ(i, vx * factor * sx, vy * yFactor * sy, vz * factor * sz);
      }
      const faceted = base.index ? base.toNonIndexed() : base;
      if (faceted !== base) base.dispose();
      faceted.computeVertexNormals();
      faceted.userData.batchGeometryKey = key;
      return faceted;
    };

    const makeSlabGeo = (key, w, h, d, geoSeed) => {
      let gSeed = geoSeed;
      const gRand = () => {
        gSeed = (Math.imul(gSeed, 1664525) + 1013904223) >>> 0;
        return gSeed / 4294967296;
      };
      const base = new THREE.BoxGeometry(w, h, d, 3, 1, 3);
      const pos = base.attributes.position;
      const vertOffsets = new Map();
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const vKey = `${Math.round(vx * 1000)},${Math.round(vy * 1000)},${Math.round(vz * 1000)}`;
        let off = vertOffsets.get(vKey);
        if (!off) {
          off = [(gRand() - 0.5) * 0.14, (gRand() - 0.5) * 0.03, (gRand() - 0.5) * 0.14];
          vertOffsets.set(vKey, off);
        }
        pos.setXYZ(i, vx + off[0], vy + off[1], vz + off[2]);
      }
      const faceted = base.index ? base.toNonIndexed() : base;
      if (faceted !== base) base.dispose();
      faceted.computeVertexNormals();
      faceted.userData.batchGeometryKey = key;
      return faceted;
    };

    const decalGeo = new THREE.PlaneGeometry(TILE_SIZE * 1.15, TILE_SIZE * 1.15);
    decalGeo.userData.batchGeometryKey = 'rubble-decal-plane';

    const rebarGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.44, 5);
    rebarGeo.userData.batchGeometryKey = 'rubble-rebar';

    this.rubbleGeos = {
      decal: decalGeo,
      rockA: makeRockGeo('rubble-rock-a', 0.24, 1, 101, 1.15, 0.72, 0.95),
      rockB: makeRockGeo('rubble-rock-b', 0.2, 0, 202, 1.25, 0.65, 0.85),
      rockC: makeRockGeo('rubble-rock-c', 0.14, 0, 303, 1.1, 0.62, 1.05),
      slabA: makeSlabGeo('rubble-slab-a', 0.78, 0.11, 0.58, 404),
      slabB: makeSlabGeo('rubble-slab-b', 0.56, 0.09, 0.44, 505),
      rebar: rebarGeo,
    };
  }

  /** Creates persistent concrete, masonry, and rock rubble for a destroyed building or rubble cell. */
  createRubbleBlock(kind = 'house1') {
    this.ensureRubbleAssets();
    const { decal, stoneLight, stoneDark, brick, rebar } = this.rubbleMats;
    const { decal: decalGeo, rockA, rockB, rockC, slabA, slabB, rebar: rebarGeo } = this.rubbleGeos;

    const group = new THREE.Group();
    group.userData.batchTile = true;

    // Ground crushed-mortar & gravel scatter decal
    const decalMesh = new THREE.Mesh(decalGeo, decal);
    decalMesh.rotation.x = -Math.PI / 2;
    decalMesh.position.y = 0.008;
    decalMesh.receiveShadow = true;
    group.add(decalMesh);

    const isHeavy = kind === 'house2';

    // Tilted broken concrete slabs forming the core of the collapse
    const slabs = [
      { geo: slabA, mat: stoneLight, x: -0.14, y: 0.17, z: 0.08, rx: 0.34, ry: 0.42, rz: -0.28 },
      { geo: slabB, mat: isHeavy ? stoneDark : brick, x: 0.26, y: 0.15, z: -0.16, rx: -0.4, ry: -0.65, rz: 0.24 },
    ];
    if (isHeavy) {
      slabs.push({ geo: slabB, mat: stoneLight, x: -0.22, y: 0.24, z: -0.22, rx: 0.48, ry: 1.15, rz: 0.3 });
    }
    for (const s of slabs) {
      const m = new THREE.Mesh(s.geo, s.mat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.set(s.rx, s.ry, s.rz);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    // Angular fractured rock, concrete, and masonry boulders
    const rocks = [
      { geo: rockA, mat: stoneLight, x: 0.04, y: 0.2, z: -0.02, rx: 0.3, ry: 0.8, rz: 0.2, s: 1.3 },
      { geo: rockA, mat: stoneDark, x: -0.34, y: 0.14, z: 0.28, rx: 0.8, ry: 1.9, rz: 0.4, s: 1.1 },
      { geo: rockB, mat: isHeavy ? stoneLight : brick, x: 0.38, y: 0.13, z: 0.24, rx: 0.5, ry: 2.4, rz: 0.9, s: 1.15 },
      { geo: rockB, mat: stoneDark, x: 0.18, y: 0.22, z: 0.14, rx: 1.2, ry: 0.4, rz: 0.6, s: 1.05 },
      { geo: rockB, mat: brick, x: -0.12, y: 0.08, z: -0.38, rx: 0.4, ry: 1.1, rz: 1.3, s: 1.0 },
      { geo: rockB, mat: stoneLight, x: 0.46, y: 0.07, z: -0.34, rx: 0.9, ry: 2.8, rz: 0.2, s: 0.85 },
      { geo: rockC, mat: stoneDark, x: -0.58, y: 0.05, z: -0.12, rx: 0.2, ry: 0.7, rz: 0.5, s: 1.1 },
      { geo: rockC, mat: brick, x: 0.58, y: 0.05, z: 0.05, rx: 1.1, ry: 1.5, rz: 0.3, s: 1.0 },
      { geo: rockC, mat: stoneLight, x: -0.25, y: 0.05, z: 0.58, rx: 0.6, ry: 2.1, rz: 0.8, s: 1.15 },
      { geo: rockC, mat: stoneDark, x: 0.24, y: 0.04, z: 0.54, rx: 0.3, ry: 0.9, rz: 1.2, s: 0.9 },
      { geo: rockC, mat: brick, x: -0.48, y: 0.04, z: -0.48, rx: 0.9, ry: 1.8, rz: 0.4, s: 0.95 },
      { geo: rockC, mat: stoneLight, x: 0.1, y: 0.04, z: -0.62, rx: 0.5, ry: 2.6, rz: 0.7, s: 1.05 },
      { geo: rockC, mat: stoneDark, x: -0.66, y: 0.04, z: 0.32, rx: 1.4, ry: 0.3, rz: 0.9, s: 0.85 },
      { geo: rockC, mat: stoneLight, x: 0.64, y: 0.04, z: 0.46, rx: 0.7, ry: 1.4, rz: 0.2, s: 0.8 },
    ];
    for (const r of rocks) {
      const m = new THREE.Mesh(r.geo, r.mat);
      m.position.set(r.x, r.y, r.z);
      m.rotation.set(r.rx, r.ry, r.rz);
      m.scale.setScalar(r.s);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    // Protruding bent steel rebar rods from broken concrete
    const rebars = [
      { x: -0.02, y: 0.19, z: 0.14, rx: 0.85, ry: 0.4, rz: 0.65 },
      { x: 0.24, y: 0.16, z: -0.08, rx: -0.95, ry: 1.2, rz: -0.45 },
    ];
    if (isHeavy) {
      rebars.push(
        { x: -0.24, y: 0.22, z: -0.18, rx: 0.75, ry: -0.8, rz: -0.7 },
        { x: 0.08, y: 0.21, z: -0.02, rx: -0.65, ry: 0.3, rz: 0.85 }
      );
    }
    for (const rb of rebars) {
      const m = new THREE.Mesh(rebarGeo, rebar);
      m.position.set(rb.x, rb.y, rb.z);
      m.rotation.set(rb.rx, rb.ry, rb.rz);
      m.castShadow = true;
      group.add(m);
    }

    return markOwned(group, { geometries: false, materials: false });
  }

  /** Updates a modular building tile to match its current HP. */
  updateBuildingBlockDamage(group, hp, maxHp) {
    const info = group?.userData?.building;
    if (!info) return;
    info.hp = hp;
    info.maxHp = maxHp;
    const state = buildingDamageState(hp, maxHp, info.kind);
    if (this.useBlenderBuildings && this.buildingModels.ready) {
      if (group.userData.slabMesh || group.userData.brickHp !== undefined) {
        disposeOwned(group);
        group.userData.slabMesh = group.userData.capMesh = group.userData.crackGroup = group.userData.rebarGroup = group.userData.concreteMat = null;
        delete group.userData.brickHp;
        delete group.userData.isConcreteBlock;
      }
      group.rotation.y = info.yaw;
      this.buildingModels.apply(group, info.kind, info.part, state, info.style || 0);
      return;
    }
    if (info.kind === 'house2') {
      this.updateConcreteBlockDamage(group, hp, maxHp);
    } else {
      this.updateBrickBlockDamage(group, (hp / Math.max(1, maxHp)) * 4);
    }
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

  /** `hit`: offset `{ dx, dz }` of the damaging hit from the tile centre; it shapes the breach. */
  updateBrickBlockDamage(group, hp, hit = null) {
    if (!group) return;
    const state = Math.max(0, Math.min(4, Math.ceil(hp)));
    const data = group.userData;
    data.brickHp = hp;
    if (state >= 4) data.breach = null;
    else if (hit) data.breach = nextBreach(data.breach, hit.dx, hit.dz, state);
    if (data.breach) group.rotation.y = breachYaw(data.breach);
    if (this.useBlenderBricks && this.brickModels.states.size) {
      this.brickModels.apply(group, hp, data.breach?.variant);
    } else {
      group.children.forEach((mesh, index) => {
        mesh.visible = index < state;
        mesh.material = this.brickDamageMaterials.get(state);
      });
      group.userData.batchRevision = (group.userData.batchRevision || 0) + 1;
    }
  }

  createBoxesBlock() {
    this.boxMats ||= [0x5c3e24, 0x6e4b2c, 0x3b2615, 0x241d17].map(color => {
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
      crate.position.set(i % 2 ? 0.49 : -0.49, 0, i < 2 ? 0.49 : -0.49);
      crate.scale.setScalar(0.95);
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
        add(0.166, 0.03, 0.88, offset, height + 0.008, 0, n % 2);
      }
      for (const sign of [-1, 1]) {
        for (const y of [0.11, height - 0.11]) {
          add(0.91, 0.12, 0.055, 0, y, sign * 0.47, 1);
          add(0.055, 0.108, 0.91, sign * 0.47, y, 0, 1);
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
      color: 0x8c96a3,
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
      color: 0x7e8895,
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
    if (this.useBlenderConcrete && this.concreteModels.apply(group, 4)) {
      Object.assign(group.userData, { batchTile: true, isConcreteBlock: true });
      return group;
    }
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
    base.name = 'concrete-slab';
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
          this.sharedGeometry('BoxGeometry', 0.16, 1.45, 0.16),
          rebarMat
        );
        pilaster.position.set(sx * cornerOffset, 0.735, sz * cornerOffset);
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
    rebarGroup.name = 'concrete-rebar';
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
        this.sharedGeometry('CylinderGeometry', 0.035, 0.035, 1.60, 6),
        rustRebarMat
      );
      rodV.position.set(offset + 0.06, 0.82, offset * -0.7);
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

  /** `hit`: offset `{ dx, dz }` of the damaging hit from the tile centre; it shapes the breach. */
  updateConcreteBlockDamage(blockGroup, hp, maxHp = 16, hit = null) {
    if (!blockGroup?.userData?.isConcreteBlock) return;
    const data = blockGroup.userData;
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    const state = concreteDamageState(hp, maxHp);
    data.concreteHp = hp;
    data.concreteMaxHp = maxHp;
    if (state >= 4) data.breach = null;
    else if (hit) data.breach = nextBreach(data.breach, hit.dx, hit.dz, state);
    if (data.breach) blockGroup.rotation.y = breachYaw(data.breach);
    // Intact concrete is 0x8c96a3 (140, 150, 163); each hit darkens down from that baseline.
    const shade = Math.round(104 + ratio * 36);

    if (this.useBlenderConcrete && this.concreteModels.states.size) {
      if (data.slabMesh) {
        // A procedural block upgrading in place: release its per-block slab materials.
        disposeOwned(blockGroup);
        data.slabMesh = data.capMesh = data.crackGroup = data.rebarGroup = data.concreteMat = null;
      }
      // The block darkens with every hit; model states only change a few times.
      if (ratio < 1) {
        blockGroup.userData.instanceColor ||= new THREE.Color();
        blockGroup.userData.instanceColor.setRGB(shade / 255, (shade + 10) / 255, (shade + 23) / 255, THREE.SRGBColorSpace);
      } else {
        blockGroup.userData.instanceColor = null;
      }
      this.concreteModels.apply(blockGroup, state, data.breach?.variant);
      return;
    }

    const { slabMesh, capMesh, crackGroup, rebarGroup, concreteMat } = data;

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
      this.ownConcreteSlabMaterials(blockGroup)
        .color.setRGB(shade / 255, (shade + 10) / 255, (shade + 23) / 255, THREE.SRGBColorSpace);
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

  getContractBadgeTexture(prefix, slot, code, accentHex) {
    this.contractBadgeTexCache ||= new Map();
    const key = `${prefix}:${slot}:${code}:${accentHex}`;
    if (this.contractBadgeTexCache.has(key)) return this.contractBadgeTexCache.get(key);
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
      ctx.font = prefix === 'DATA' ? 'bold 44px monospace' : 'bold 42px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${slot}${slot === 3 ? '★' : ''}`, 64, prefix === 'DATA' ? 56 : 54);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = prefix === 'DATA' ? 'bold 20px monospace' : 'bold 19px monospace';
      ctx.fillText(`${prefix} ${code}`, 64, 92);
    }
    const tex = new THREE.CanvasTexture(canvas);
    this.contractBadgeTexCache.set(key, tex);
    return tex;
  }

  clearPendingRigs() {
    this.pendingPlayerRigs.length = 0;
    this.pendingEnemyRigs.clear();
    this.pendingTurretRigs?.clear?.();
  }

  dispose() {
    this.clearPendingRigs();
    const disposedGeos = new Set();
    const disposedMats = new Set();
    const disposedTex = new Set();
    const disposeGeo = (geo) => {
      if (!geo || disposedGeos.has(geo)) return;
      disposedGeos.add(geo);
      geo.dispose?.();
    };
    const disposeTex = (tex) => {
      if (!tex || !tex.isTexture || disposedTex.has(tex)) return;
      disposedTex.add(tex);
      tex.dispose?.();
    };
    const disposeMat = (mat) => {
      if (!mat) return;
      if (Array.isArray(mat)) {
        mat.forEach(disposeMat);
        return;
      }
      if (!mat.isMaterial || disposedMats.has(mat)) return;
      disposedMats.add(mat);
      for (const val of Object.values(mat)) {
        if (val?.isTexture) disposeTex(val);
      }
      mat.dispose?.();
    };
    const disposeMeshList = (list) => {
      if (!Array.isArray(list)) return;
      for (const m of list) {
        if (!m) continue;
        disposeGeo(m.geometry);
        disposeMat(m.material);
      }
    };
    const disposeBag = (bag) => {
      if (!bag) return;
      if (bag.isTexture) {
        disposeTex(bag);
      } else if (bag.isMaterial) {
        disposeMat(bag);
      } else if (bag.isBufferGeometry) {
        disposeGeo(bag);
      } else if (Array.isArray(bag)) {
        bag.forEach(disposeBag);
      } else if (bag instanceof Map) {
        for (const val of bag.values()) disposeBag(val);
        bag.clear();
      } else if (typeof bag === 'object') {
        for (const val of Object.values(bag)) disposeBag(val);
      }
    };

    if (this.geometryCache) {
      for (const geo of this.geometryCache.values()) disposeGeo(geo);
      this.geometryCache.clear();
    }
    disposeGeo(this.surfacePatchGeometry);
    this.surfacePatchGeometry = null;
    disposeGeo(this.craterRimGeo);
    this.craterRimGeo = null;
    if (this.rubbleGeos) {
      for (const geo of Object.values(this.rubbleGeos)) disposeGeo(geo);
      this.rubbleGeos = null;
    }

    if (this.playerGlbParts) {
      for (const mesh of this.playerGlbParts.values()) {
        disposeGeo(mesh?.geometry);
        disposeMat(mesh?.material);
      }
      this.playerGlbParts.clear();
      this.playerGlbParts = null;
    }
    if (this.glbTankParts) {
      for (const parts of this.glbTankParts.values()) {
        disposeMeshList(parts?.hull);
        disposeMeshList(parts?.turret);
        disposeMeshList(parts?.gun);
        if (Array.isArray(parts?.turrets)) {
          for (const t of parts.turrets) {
            disposeMeshList(t?.turret);
            disposeMeshList(t?.gun);
          }
        }
      }
      this.glbTankParts.clear();
    }
    if (this.glbTurretParts) {
      for (const parts of this.glbTurretParts.values()) {
        disposeMeshList(parts?.hull);
        disposeMeshList(parts?.turret);
        disposeMeshList(parts?.gun);
      }
      this.glbTurretParts.clear();
    }
    if (this.glbAirDropParts) {
      disposeMeshList(this.glbAirDropParts.crate);
      disposeMeshList(this.glbAirDropParts.chute);
      this.glbAirDropParts = null;
    }
    if (this.playerRadarGlbParts) {
      for (const obj of this.playerRadarGlbParts.values()) {
        disposeOwned(obj);
      }
      this.playerRadarGlbParts.clear();
      this.playerRadarGlbParts = null;
    }

    disposeBag(this.craterMats);
    disposeBag(this.rubbleMats);
    disposeBag(this.hqMats);
    disposeBag(this.enemyBaseMats);
    disposeBag(this.forestMats);
    disposeBag(this.concreteMats);
    disposeBag(this.roadMats);
    disposeBag(this.grassPatchMats);
    disposeBag(this.stonePatchMats);
    disposeBag(this.sandPatchMats);
    disposeBag(this.swampPatchMats);
    disposeBag(this.oilPatchMats);
    disposeBag(this.oilFireBedMat);
    disposeBag(this.oilFlameSheetMat);
    disposeBag(this.oilBoilRingMat);
    disposeBag(this.hedgehogMat);
    disposeBag(this.barrelMats);
    disposeBag(this.waterTowerMats);
    disposeBag(this.themePropMats);
    disposeBag(this._railBridgeMats);
    disposeBag(this._tacticalMats);
    this._tacticalMats = null;
    disposeBag(this.perimeterBuildingCatalog);
    disposeBag(this.powerUpMatCache);
    disposeBag(this.powerUpSpriteMatCache);
    disposeBag(this.powerUpTexCache);
    disposeBag(this.contractBadgeTexCache);
    disposeTex(this._loadingBadgeTex);
    this._loadingBadgeTex = null;
    disposeTex(this.powerUpBeamTex);
    this.powerUpBeamTex = null;

    this.tacticalModels?.dispose?.();
    disposeBag(this.brickTex);
    disposeBag(this.concreteTex);
    disposeBag(this.groundTex);
    disposeBag(this.iceTex);
    disposeBag(this.waterTex);
    disposeBag(this.shadowTex);
    disposeBag(this.tankArmorTex);
    disposeBag(this.trackTreadTex);
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
      }),
      foliage2: new THREE.MeshStandardMaterial({
        map: tex.foliage,
        bumpMap: bump(tex.foliage),
        bumpScale: 2.5,
        color: 0xffffff,
        roughness: 0.75,
        metalness: 0,
      }),
      floor: new THREE.MeshStandardMaterial({
        map: tex.floor,
        roughness: 1,
        metalness: 0,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
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
   * Seamless surface patch at world (x, z). All patches share one plane geometry and a few mask
   * materials, so the TileBatcher draws them as instances; the colour map is sampled in world space
   * (see applyWorldSurfaceUv), which keeps neighbouring patches seamless.
   */
  createSeamlessSurfacePatch(x, z, mats, y = 0.011) {
    if (!this.surfacePatchGeometry) {
      const span = TILE_SIZE / SAND_PATCH_CELL_FRACTION;
      const geometry = new THREE.PlaneGeometry(span, span);
      geometry.setAttribute('uv1', geometry.attributes.uv.clone());
      geometry.userData.batchGeometryKey = 'surface-patch';
      this.surfacePatchGeometry = geometry;
    }

    const cellHash = Math.abs(Math.round(x / TILE_SIZE) * 73856093 ^ Math.round(z / TILE_SIZE) * 19349663);
    const floor = new THREE.Mesh(this.surfacePatchGeometry, mats[cellHash % SAND_PATCH_VARIANTS]);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = y;
    floor.receiveShadow = true;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(floor);
    group.userData.batchTile = true;
    return group;
  }

  /** Seamless natural grass & meadow turf surface patch at world (x, z). */
  createGrassBlock(x = 0, z = 0) {
    if (!this.grassPatchMats) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#334d2b';
      ctx.fillRect(0, 0, 256, 256);
      let seed = 7711;
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 90; i++) {
        const px = rand() * 256;
        const py = rand() * 256;
        const r = 10 + rand() * 24;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(66, 98, 48, 0.35)' : 'rgba(38, 58, 30, 0.35)';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 160; i++) {
        const px = rand() * 256;
        const py = rand() * 256;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(94, 134, 62, 0.45)' : 'rgba(54, 82, 42, 0.4)';
        ctx.fillRect(px, py, 2, 4);
      }
      const grassTex = this.configureColorTexture(new THREE.CanvasTexture(c));
      grassTex.wrapS = THREE.RepeatWrapping;
      grassTex.wrapT = THREE.RepeatWrapping;

      this.grassPatchMats = Array.from({ length: SAND_PATCH_VARIANTS }, (_, variant) => {
        const mask = new THREE.CanvasTexture(createSandPatchMask(128, variant, SAND_PATCH_CELL_FRACTION));
        mask.channel = 1;
        return applyWorldSurfaceUv(new THREE.MeshStandardMaterial({
          map: grassTex,
          alphaMap: mask,
          transparent: true,
          depthWrite: false,
          roughness: 0.92,
          metalness: 0.02,
          polygonOffset: true,
          polygonOffsetUnits: -1,
        }));
      });
    }
    return this.createSeamlessSurfacePatch(x, z, this.grassPatchMats, 0.007);
  }

  /** Seamless compacted stone & rocky bedrock surface patch at world (x, z). */
  createStoneBlock(x = 0, z = 0) {
    if (!this.stonePatchMats) {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');

      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = size;
      bumpCanvas.height = size;
      const bCtx = bumpCanvas.getContext('2d');

      let seed = 8822;
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      // Tileable Voronoi rock-plate grid (6x6 jittered cells) for fractured bedrock slabs
      const cells = 6;
      const cellSize = size / cells;
      const pts = [];
      for (let gy = 0; gy < cells; gy++) {
        for (let gx = 0; gx < cells; gx++) {
          pts.push({
            x: (gx + 0.15 + rand() * 0.7) * cellSize,
            y: (gy + 0.15 + rand() * 0.7) * cellSize,
            tone: (rand() - 0.5) * 26,
            warm: (rand() - 0.5) * 10,
          });
        }
      }

      const img = ctx.createImageData(size, size);
      const bImg = bCtx.createImageData(size, size);
      const data = img.data;
      const bData = bImg.data;

      for (let py = 0; py < size; py++) {
        const gy = Math.floor(py / cellSize);
        for (let px = 0; px < size; px++) {
          const gx = Math.floor(px / cellSize);
          let d1 = 1e9;
          let d2 = 1e9;
          let best = pts[0];
          for (let oy = -1; oy <= 1; oy++) {
            const ny = (gy + oy + cells) % cells;
            for (let ox = -1; ox <= 1; ox++) {
              const nx = (gx + ox + cells) % cells;
              const p = pts[ny * cells + nx];
              let dx = p.x - px;
              let dy = p.y - py;
              if (dx > size * 0.5) dx -= size;
              else if (dx < -size * 0.5) dx += size;
              if (dy > size * 0.5) dy -= size;
              else if (dy < -size * 0.5) dy += size;
              const d = Math.hypot(dx, dy);
              if (d < d1) {
                d2 = d1;
                d1 = d;
                best = p;
              } else if (d < d2) {
                d2 = d;
              }
            }
          }

          // Deterministic high-frequency rock grain & micro-pitting
          let h = Math.imul(px * 374761393 + py * 668265263, 1274126177) >>> 0;
          h ^= h >>> 13;
          const grain = ((h & 255) / 255 - 0.5) * 22;
          const edge = d2 - d1;
          // Crisp dark fracture seam between rock slabs
          const seam = edge < 2.2 ? (edge / 2.2) : 1;
          const bevel = Math.min(1, edge / 9);
          const base = 94 + best.tone + grain * 0.75 + (bevel - 0.5) * 14;
          const seamShade = 0.42 + 0.58 * seam;

          const idx = (py * size + px) * 4;
          data[idx] = Math.max(24, Math.min(220, (base + best.warm) * seamShade));
          data[idx + 1] = Math.max(24, Math.min(220, (base + 2) * seamShade));
          data[idx + 2] = Math.max(26, Math.min(225, (base + 5 - best.warm * 0.5) * seamShade));
          data[idx + 3] = 255;

          const bumpVal = Math.max(10, Math.min(245, (115 + best.tone * 1.4 + grain * 1.2) * seam + bevel * 38));
          bData[idx] = bumpVal;
          bData[idx + 1] = bumpVal;
          bData[idx + 2] = bumpVal;
          bData[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      bCtx.putImageData(bImg, 0, 0);

      // Subtle jagged hairline cracks across bedrock plates
      for (let i = 0; i < 14; i++) {
        let sx = rand() * size;
        let sy = rand() * size;
        let ang = rand() * Math.PI * 2;
        ctx.strokeStyle = 'rgba(28, 30, 34, 0.48)';
        bCtx.strokeStyle = 'rgba(25, 25, 25, 0.65)';
        ctx.lineWidth = 1.1;
        bCtx.lineWidth = 1.4;
        ctx.beginPath();
        bCtx.beginPath();
        ctx.moveTo(sx, sy);
        bCtx.moveTo(sx, sy);
        for (let s = 0; s < 4; s++) {
          ang += (rand() - 0.5) * 0.9;
          sx += Math.cos(ang) * (7 + rand() * 10);
          sy += Math.sin(ang) * (7 + rand() * 10);
          ctx.lineTo(sx, sy);
          bCtx.lineTo(sx, sy);
        }
        ctx.stroke();
        bCtx.stroke();
      }

      const stoneTex = this.configureColorTexture(new THREE.CanvasTexture(c));
      stoneTex.wrapS = THREE.RepeatWrapping;
      stoneTex.wrapT = THREE.RepeatWrapping;
      const stoneBump = new THREE.CanvasTexture(bumpCanvas);
      stoneBump.wrapS = THREE.RepeatWrapping;
      stoneBump.wrapT = THREE.RepeatWrapping;
      stoneBump.needsUpdate = true;

      this.stonePatchMats = Array.from({ length: SAND_PATCH_VARIANTS }, (_, variant) => {
        const mask = new THREE.CanvasTexture(createSandPatchMask(128, variant, SAND_PATCH_CELL_FRACTION));
        mask.channel = 1;
        return applyWorldSurfaceUv(new THREE.MeshStandardMaterial({
          map: stoneTex,
          bumpMap: stoneBump,
          bumpScale: 0.045,
          alphaMap: mask,
          transparent: true,
          depthWrite: false,
          roughness: 0.9,
          metalness: 0.05,
          polygonOffset: true,
          polygonOffsetUnits: -1,
        }));
      });
    }
    return this.createSeamlessSurfacePatch(x, z, this.stonePatchMats, 0.011);
  }

  /** Pre-builds shared sand patch textures and materials. */
  ensureSandPatchMats() {
    if (this.sandPatchMats) return;
    // sRGB colour space like every other colour map; without it the sand washes out to white.
    const sandTex = this.configureColorTexture(new THREE.CanvasTexture(createSandCanvas(256, SAND_PATTERN_CELLS, 42)));
    sandTex.wrapS = THREE.RepeatWrapping;
    sandTex.wrapT = THREE.RepeatWrapping;
    this.sandPatchMats = Array.from({ length: SAND_PATCH_VARIANTS }, (_, variant) => {
      const mask = new THREE.CanvasTexture(createSandPatchMask(128, variant, SAND_PATCH_CELL_FRACTION));
      mask.channel = 1;
      return applyWorldSurfaceUv(new THREE.MeshStandardMaterial({
        map: sandTex,
        alphaMap: mask,
        transparent: true,
        depthWrite: false,
        // Same response as the ground plane, so a patch matches sand painted into the map ground.
        roughness: 0.85,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetUnits: -1,
      }));
    });
  }

  /**
   * Runtime sand patch for one cell (burned forest, destroyed turret) centred at world (x, z).
   * The rim is ragged and feathered through an alpha mask (uv1), while the sand pattern is
   * world-aligned (uv) so neighbouring patches merge into one continuous sand field.
   */
  createSandBlock(x = 0, z = 0) {
    this.ensureSandPatchMats();
    return this.createSeamlessSurfacePatch(x, z, this.sandPatchMats, 0.012);
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
          polygonOffsetUnits: -1,
        },
        { clearcoat: 0.7, clearcoatRoughness: 0.08 }
      );
    }
    return createIceSurface(grid, iceType, TILE_SIZE, this.iceMat, {
      lowQuality: this.isSoftwareGl || this.physicalWater === false,
    });
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
      this.barrelMats = { bodyMat, hazardStripeMat, rimMat };
    }

    const { bodyMat, hazardStripeMat, rimMat } = this.barrelMats;

    const drumGeo = this.sharedGeometry('CylinderGeometry', 0.28, 0.28, 0.67, 14);
    const stripeGeo = this.sharedGeometry('CylinderGeometry', 0.286, 0.286, 0.18, 14);
    const rimGeo = this.sharedGeometry('CylinderGeometry', 0.295, 0.295, 0.04, 14);
    const capGeo = this.sharedGeometry('CylinderGeometry', 0.045, 0.045, 0.03, 8);

    const drums = [
      { x: -0.30, z: -0.26, rot: 0.2 },
      { x: 0.32, z: -0.20, rot: -0.4 },
      { x: -0.03, z: 0.33, rot: 0.9 },
    ];

    for (const d of drums) {
      const drumGroup = new THREE.Group();
      drumGroup.position.set(d.x, 0, d.z);
      drumGroup.rotation.y = d.rot;

      const drum = new THREE.Mesh(drumGeo, bodyMat);
      drum.position.y = 0.345;
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

  /**
   * High-traction military asphalt road tile at world (x, z).
   * @param {number} x
   * @param {number} z
   * @param {number} neighborMask Bitmask of adjacent ROAD tiles (N=1, E=2, S=4, W=8).
   * @param {number} doubleLaneMask Bitmask indicating parallel second-lane direction (N=1, E=2, S=4, W=8).
   * @param {'none'|'std'|'wide'} cornerType Corner rounding mode for 90-degree turns.
   */
  createRoadBlock(x = 0, z = 0, neighborMask = 5, doubleLaneMask = 0, cornerType = 'std') {
    if (!this.roadMats) {
      // Ground layers stack by height plus a tiny polygonOffsetUnits tie-break. Never use
      // polygonOffsetFactor here: it scales with the steep isometric depth slope and pulls the
      // layer over anything standing just above it (tank tracks sank into the asphalt).
      this.roadMats = {
        asphalt: new THREE.MeshStandardMaterial({
          color: 0x2a313c,
          roughness: 0.78,
          metalness: 0.08,
          polygonOffset: true,
          polygonOffsetUnits: -1,
        }),
        shoulder: new THREE.MeshStandardMaterial({
          color: 0x475569,
          roughness: 0.85,
          metalness: 0.05,
          polygonOffset: true,
          polygonOffsetUnits: -2,
        }),
        stripe: new THREE.MeshStandardMaterial({
          color: 0xd97706,
          roughness: 0.65,
          metalness: 0.05,
          polygonOffset: true,
          polygonOffsetUnits: -3,
        }),
      };
    }
    const { asphalt, shoulder, stripe } = this.roadMats;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const hasN = (neighborMask & 1) !== 0;
    const hasE = (neighborMask & 2) !== 0;
    const hasS = (neighborMask & 4) !== 0;
    const hasW = (neighborMask & 8) !== 0;
    const count = (hasN ? 1 : 0) + (hasE ? 1 : 0) + (hasS ? 1 : 0) + (hasW ? 1 : 0);
    const isCornerTurn = count === 2 && !(hasN && hasS) && !(hasE && hasW);
    const wideTurn = cornerType === 'wide';

    const dashVGeo = this.sharedGeometry('PlaneGeometry', 0.1, 0.52);
    const dashHGeo = this.sharedGeometry('PlaneGeometry', 0.52, 0.1);
    const addDash = (geo, dx, dz, ry = 0, parent = group) => {
      const dash = new THREE.Mesh(geo, stripe);
      dash.rotation.order = 'YXZ';
      dash.rotation.x = -Math.PI / 2;
      dash.rotation.y = ry;
      dash.position.set(dx, 0.015, dz);
      parent.add(dash);
    };

    if (isCornerTurn && cornerType !== 'none') {
      const cornerKey = wideTurn ? 'wide' : 'std';
      this.roadCornerGeos ||= {};
      if (!this.roadCornerGeos[cornerKey]) {
        const half = TILE_SIZE * 0.5;
        const r = wideTurn ? 1.85 : 0.9;
        const cw = 0.1;
        const curveSegs = wideTurn ? 16 : 10;

        // Canonical SW outer corner (hasN && hasE): arc at (-half + r, -half + r) in 2D Shape space.
        const slabShape = new THREE.Shape();
        slabShape.moveTo(-half, half);
        slabShape.lineTo(-half, -half + r);
        slabShape.absarc(-half + r, -half + r, r, Math.PI, Math.PI * 1.5, false);
        slabShape.lineTo(half, -half);
        slabShape.lineTo(half, half);
        slabShape.closePath();

        const curbShape = new THREE.Shape();
        curbShape.moveTo(-half, half);
        curbShape.lineTo(-half, -half + r);
        curbShape.absarc(-half + r, -half + r, r, Math.PI, Math.PI * 1.5, false);
        curbShape.lineTo(half, -half);
        curbShape.lineTo(half, -half + cw);
        curbShape.lineTo(-half + r, -half + cw);
        curbShape.absarc(-half + r, -half + r, r - cw, Math.PI * 1.5, Math.PI, true);
        curbShape.lineTo(-half + cw, half);
        curbShape.closePath();

        this.roadCornerGeos[cornerKey] = {
          slab: new THREE.ShapeGeometry(slabShape, curveSegs),
          curb: new THREE.ShapeGeometry(curbShape, curveSegs),
        };
      }
      const { slab: slabGeo, curb: curbGeo } = this.roadCornerGeos[cornerKey];
      const cornerYaw =
        hasN && hasE ? 0 : hasN && hasW ? Math.PI / 2 : hasS && hasW ? Math.PI : -Math.PI / 2;

      const cornerGroup = new THREE.Group();
      cornerGroup.rotation.y = cornerYaw;

      const slab = new THREE.Mesh(slabGeo, asphalt);
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = 0.01;
      slab.receiveShadow = true;
      cornerGroup.add(slab);

      const curb = new THREE.Mesh(curbGeo, shoulder);
      curb.rotation.x = -Math.PI / 2;
      curb.position.y = 0.013;
      curb.receiveShadow = true;
      cornerGroup.add(curb);

      if (!wideTurn) {
        // Curved centerline dashes for 1-lane 90-degree turn (centered at inner corner (1, -1)).
        for (const frac of [0.24, 0.76]) {
          const t = frac * (Math.PI / 2);
          addDash(dashVGeo, 1 - Math.cos(t), -1 + Math.sin(t), t, cornerGroup);
        }
      }

      group.add(cornerGroup);
      group.userData.batchTile = true;
      return markOwned(group, { geometries: false, materials: false });
    }

    const slab = new THREE.Mesh(this.sharedGeometry('PlaneGeometry', TILE_SIZE, TILE_SIZE), asphalt);
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = 0.01;
    slab.receiveShadow = true;
    group.add(slab);

    // Draw curbs only along edges without an adjacent road tile.
    const curbHGeo = this.sharedGeometry('PlaneGeometry', TILE_SIZE, 0.1);
    const curbVGeo = this.sharedGeometry('PlaneGeometry', 0.1, TILE_SIZE);
    if (!hasN) {
      const curb = new THREE.Mesh(curbHGeo, shoulder);
      curb.rotation.x = -Math.PI / 2;
      curb.position.set(0, 0.013, -0.95);
      curb.receiveShadow = true;
      group.add(curb);
    }
    if (!hasS) {
      const curb = new THREE.Mesh(curbHGeo, shoulder);
      curb.rotation.x = -Math.PI / 2;
      curb.position.set(0, 0.013, 0.95);
      curb.receiveShadow = true;
      group.add(curb);
    }
    if (!hasW) {
      const curb = new THREE.Mesh(curbVGeo, shoulder);
      curb.rotation.x = -Math.PI / 2;
      curb.position.set(-0.95, 0.013, 0);
      curb.receiveShadow = true;
      group.add(curb);
    }
    if (!hasE) {
      const curb = new THREE.Mesh(curbVGeo, shoulder);
      curb.rotation.x = -Math.PI / 2;
      curb.position.set(0.95, 0.013, 0);
      curb.receiveShadow = true;
      group.add(curb);
    }

    // Centerline / divider markings aligned to actual road width and connectivity.
    if (doubleLaneMask !== 0) {
      // Wide 2-lane avenue: place dashed divider along the shared seam between lanes.
      if ((doubleLaneMask & 4) !== 0 && !hasN) {
        addDash(dashHGeo, -0.52, 0.92);
        addDash(dashHGeo, 0.52, 0.92);
      } else if ((doubleLaneMask & 1) !== 0 && !hasS) {
        addDash(dashHGeo, -0.52, -0.92);
        addDash(dashHGeo, 0.52, -0.92);
      } else if ((doubleLaneMask & 2) !== 0 && !hasW) {
        addDash(dashVGeo, 0.92, -0.52);
        addDash(dashVGeo, 0.92, 0.52);
      } else if ((doubleLaneMask & 8) !== 0 && !hasE) {
        addDash(dashVGeo, -0.92, -0.52);
        addDash(dashVGeo, -0.92, 0.52);
      }
    } else if (count === 0) {
      addDash(dashVGeo, 0, -0.52);
      addDash(dashVGeo, 0, 0.52);
    } else if (count === 1) {
      if (hasN) addDash(dashVGeo, 0, -0.52);
      if (hasS) addDash(dashVGeo, 0, 0.52);
      if (hasW) addDash(dashHGeo, -0.52, 0);
      if (hasE) addDash(dashHGeo, 0.52, 0);
    } else if (count === 2 && hasN && hasS) {
      addDash(dashVGeo, 0, -0.52);
      addDash(dashVGeo, 0, 0.52);
    } else if (count === 2 && hasE && hasW) {
      addDash(dashHGeo, -0.52, 0);
      addDash(dashHGeo, 0.52, 0);
    }
    // T- and X-junctions (count >= 3, non-double-lane) stay clean inside the intersection box.
    group.userData.batchTile = true;
    return markOwned(group, { geometries: false, materials: false });
  }

  /** Pre-builds shared swamp patch textures and materials. */
  ensureSwampPatchMats() {
    if (this.swampPatchMats) return;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#33291d';
    ctx.fillRect(0, 0, 256, 256);

    // Organic wet mud mottling + standing water pools + ripple highlights
    let seed = 1337;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 65; i++) {
      const px = rand() * 256;
      const py = rand() * 256;
      const r = 14 + rand() * 28;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 27, 18, 0.45)' : 'rgba(62, 50, 34, 0.35)';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 18; i++) {
      const px = rand() * 256;
      const py = rand() * 256;
      const rx = 18 + rand() * 34;
      const ry = 12 + rand() * 24;
      ctx.fillStyle = 'rgba(26, 62, 74, 0.72)';
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(105, 165, 182, 0.28)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(px - 2, py - 2, rx * 0.72, ry * 0.65, 0, 0.2, Math.PI * 1.1);
      ctx.stroke();
    }

    const swampTex = this.configureColorTexture(new THREE.CanvasTexture(c));
    swampTex.wrapS = THREE.RepeatWrapping;
    swampTex.wrapT = THREE.RepeatWrapping;

    this.swampPatchMats = Array.from({ length: SAND_PATCH_VARIANTS }, (_, variant) => {
      const mask = new THREE.CanvasTexture(createSandPatchMask(128, variant, SAND_PATCH_CELL_FRACTION));
      mask.channel = 1;
      return applyWorldSurfaceUv(new THREE.MeshStandardMaterial({
        map: swampTex,
        alphaMap: mask,
        transparent: true,
        depthWrite: false,
        roughness: 0.28,
        metalness: 0.25,
        polygonOffset: true,
        polygonOffsetUnits: -1,
      }));
    });
  }

  /** Seamless wet mud & flooded puddle patch at world (x, z). */
  createSwampBlock(x = 0, z = 0) {
    this.ensureSwampPatchMats();
    return this.createSeamlessSurfacePatch(x, z, this.swampPatchMats, 0.013);
  }

  /** Seamless glossy crude oil slick patch at world (x, z) with a 3D burning inferno rig. */
  createOilSlickBlock(x = 0, z = 0) {
    if (!this.oilPatchMats) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#050609';
      ctx.fillRect(0, 0, 256, 256);
      let seed = 4242;
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      // Deep viscous tar swirls and iridescent hydrocarbon sheen
      for (let i = 0; i < 32; i++) {
        const px = rand() * 256;
        const py = rand() * 256;
        const r = 16 + rand() * 34;
        const grad = ctx.createRadialGradient(px, py, 2, px, py, r);
        if (i % 3 === 0) {
          grad.addColorStop(0, 'rgba(72, 42, 18, 0.42)');
          grad.addColorStop(0.6, 'rgba(32, 20, 12, 0.24)');
        } else if (i % 3 === 1) {
          grad.addColorStop(0, 'rgba(24, 54, 78, 0.38)');
          grad.addColorStop(0.6, 'rgba(38, 28, 64, 0.25)');
        } else {
          grad.addColorStop(0, 'rgba(14, 16, 22, 0.75)');
          grad.addColorStop(0.6, 'rgba(8, 10, 14, 0.35)');
        }
        grad.addColorStop(1, 'rgba(5, 6, 9, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Glossy petroleum contour bands
      for (let i = 0; i < 14; i++) {
        const px = rand() * 256;
        const py = rand() * 256;
        const rx = 18 + rand() * 36;
        const ry = 10 + rand() * 22;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(96, 68, 38, 0.26)' : 'rgba(56, 88, 112, 0.24)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, rand() * Math.PI, 0.2, Math.PI * 1.35);
        ctx.stroke();
      }
      const oilTex = this.configureColorTexture(new THREE.CanvasTexture(c));
      oilTex.wrapS = THREE.RepeatWrapping;
      oilTex.wrapT = THREE.RepeatWrapping;

      this.oilPatchMats = Array.from({ length: SAND_PATCH_VARIANTS }, (_, variant) => {
        const mask = new THREE.CanvasTexture(createSandPatchMask(128, variant, SAND_PATCH_CELL_FRACTION));
        mask.channel = 1;
        return applyWorldSurfaceUv(new THREE.MeshStandardMaterial({
          map: oilTex,
          alphaMap: mask,
          transparent: true,
          depthWrite: false,
          roughness: 0.08,
          metalness: 0.82,
          polygonOffset: true,
          polygonOffsetUnits: -2,
        }));
      });
    }

    if (!this.oilFireBedMat) {
      // 1. Incandescent boiling napalm / magma fire-bed texture
      const bedCanvas = document.createElement('canvas');
      bedCanvas.width = 256;
      bedCanvas.height = 256;
      const bctx = bedCanvas.getContext('2d');
      bctx.clearRect(0, 0, 256, 256);

      const cx = 128;
      const cy = 128;
      const baseGrad = bctx.createRadialGradient(cx, cy, 6, cx, cy, 122);
      baseGrad.addColorStop(0, 'rgba(255, 245, 190, 0.98)');
      baseGrad.addColorStop(0.26, 'rgba(255, 175, 35, 0.92)');
      baseGrad.addColorStop(0.55, 'rgba(255, 78, 10, 0.82)');
      baseGrad.addColorStop(0.8, 'rgba(185, 20, 4, 0.45)');
      baseGrad.addColorStop(1, 'rgba(80, 5, 0, 0)');
      bctx.fillStyle = baseGrad;
      bctx.fillRect(0, 0, 256, 256);

      let fSeed = 918273;
      const fRand = () => {
        fSeed = (Math.imul(fSeed, 1664525) + 1013904223) >>> 0;
        return fSeed / 4294967296;
      };
      // Boiling fiery pockets & white-hot magma fissures
      for (let i = 0; i < 36; i++) {
        const ang = fRand() * Math.PI * 2;
        const dist = Math.sqrt(fRand()) * 84;
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist;
        const r = 10 + fRand() * 24;
        const g = bctx.createRadialGradient(px, py, 0, px, py, r);
        if (i % 3 === 0) {
          g.addColorStop(0, 'rgba(255, 252, 225, 0.95)');
          g.addColorStop(0.45, 'rgba(255, 196, 55, 0.7)');
        } else {
          g.addColorStop(0, 'rgba(255, 140, 20, 0.88)');
          g.addColorStop(0.55, 'rgba(235, 45, 8, 0.5)');
        }
        g.addColorStop(1, 'rgba(200, 20, 0, 0)');
        bctx.fillStyle = g;
        bctx.beginPath();
        bctx.arc(px, py, r, 0, Math.PI * 2);
        bctx.fill();
      }

      const bedTex = this.configureColorTexture(new THREE.CanvasTexture(bedCanvas));
      this.oilFireBedMat = new THREE.MeshBasicMaterial({
        map: bedTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetUnits: -3,
      });

      // 2. 3D Volumetric multi-tongue flame sheet texture
      const flameCanvas = document.createElement('canvas');
      flameCanvas.width = 256;
      flameCanvas.height = 256;
      const fctx = flameCanvas.getContext('2d');
      fctx.clearRect(0, 0, 256, 256);

      const drawFlameTongue = (tx, baseW, topY, lean) => {
        // Outer crimson-orange roaring envelope
        const outerG = fctx.createLinearGradient(tx, 252, tx + lean, topY);
        outerG.addColorStop(0, 'rgba(255, 110, 15, 0.95)');
        outerG.addColorStop(0.35, 'rgba(255, 82, 10, 0.92)');
        outerG.addColorStop(0.72, 'rgba(235, 32, 6, 0.65)');
        outerG.addColorStop(1, 'rgba(160, 10, 0, 0)');
        fctx.fillStyle = outerG;
        fctx.beginPath();
        fctx.moveTo(tx - baseW, 254);
        fctx.quadraticCurveTo(tx - baseW * 0.85 + lean * 0.3, (254 + topY) * 0.52, tx + lean, topY);
        fctx.quadraticCurveTo(tx + baseW * 0.85 + lean * 0.3, (254 + topY) * 0.52, tx + baseW, 254);
        fctx.closePath();
        fctx.fill();

        // Mid golden-amber flame body
        const midTop = topY + (254 - topY) * 0.18;
        const midG = fctx.createLinearGradient(tx, 252, tx + lean * 0.8, midTop);
        midG.addColorStop(0, 'rgba(255, 230, 110, 0.98)');
        midG.addColorStop(0.45, 'rgba(255, 165, 30, 0.92)');
        midG.addColorStop(0.85, 'rgba(255, 75, 12, 0.45)');
        midG.addColorStop(1, 'rgba(255, 50, 0, 0)');
        fctx.fillStyle = midG;
        fctx.beginPath();
        fctx.moveTo(tx - baseW * 0.65, 254);
        fctx.quadraticCurveTo(tx - baseW * 0.5 + lean * 0.25, (254 + midTop) * 0.55, tx + lean * 0.8, midTop);
        fctx.quadraticCurveTo(tx + baseW * 0.5 + lean * 0.25, (254 + midTop) * 0.55, tx + baseW * 0.65, 254);
        fctx.closePath();
        fctx.fill();

        // Inner white-hot core tongue
        const coreTop = topY + (254 - topY) * 0.44;
        const coreG = fctx.createLinearGradient(tx, 254, tx + lean * 0.5, coreTop);
        coreG.addColorStop(0, 'rgba(255, 255, 240, 1)');
        coreG.addColorStop(0.55, 'rgba(255, 238, 155, 0.9)');
        coreG.addColorStop(1, 'rgba(255, 180, 40, 0)');
        fctx.fillStyle = coreG;
        fctx.beginPath();
        fctx.moveTo(tx - baseW * 0.36, 254);
        fctx.quadraticCurveTo(tx - baseW * 0.24, (254 + coreTop) * 0.58, tx + lean * 0.5, coreTop);
        fctx.quadraticCurveTo(tx + baseW * 0.24, (254 + coreTop) * 0.58, tx + baseW * 0.36, 254);
        fctx.closePath();
        fctx.fill();
      };

      drawFlameTongue(72, 46, 42, -10);
      drawFlameTongue(184, 44, 48, 12);
      drawFlameTongue(128, 62, 14, 4);

      const flameTex = this.configureColorTexture(new THREE.CanvasTexture(flameCanvas));
      this.oilFlameSheetMat = new THREE.MeshBasicMaterial({
        map: flameTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      });

      // 3. Boiling bubble ring texture
      const ringCanvas = document.createElement('canvas');
      ringCanvas.width = 128;
      ringCanvas.height = 128;
      const rctx = ringCanvas.getContext('2d');
      const rg = rctx.createRadialGradient(64, 64, 10, 64, 64, 60);
      rg.addColorStop(0, 'rgba(255, 120, 10, 0)');
      rg.addColorStop(0.55, 'rgba(255, 140, 20, 0.25)');
      rg.addColorStop(0.82, 'rgba(255, 235, 140, 0.95)');
      rg.addColorStop(0.94, 'rgba(255, 90, 10, 0.6)');
      rg.addColorStop(1, 'rgba(200, 20, 0, 0)');
      rctx.fillStyle = rg;
      rctx.fillRect(0, 0, 128, 128);
      const ringTex = this.configureColorTexture(new THREE.CanvasTexture(ringCanvas));
      this.oilBoilRingMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    }

    const group = this.createSeamlessSurfacePatch(x, z, this.oilPatchMats, 0.015);
    group.userData.oilCellHash = Math.abs(Math.round(x / TILE_SIZE) * 73856093 ^ Math.round(z / TILE_SIZE) * 19349663);
    return group;
  }

  /** Lazily creates and caches shared geometries for burning oil slick rigs. */
  ensureOilBurnGeometries() {
    if (this.oilFireBedGeo) return;
    const bedSpan = TILE_SIZE * 1.18;
    this.oilFireBedGeo = new THREE.PlaneGeometry(bedSpan, bedSpan);
    this.oilFireWaveGeo = new THREE.PlaneGeometry(bedSpan * 0.84, bedSpan * 0.84);
    this.oilFlameTongueGeo = new THREE.PlaneGeometry(1, 1);
    this.oilFlameTongueGeo.translate(0, 0.48, 0);
    this.oilBoilRingGeo = new THREE.PlaneGeometry(0.75, 0.75);
  }

  /** Lazily attaches a 3D burning inferno rig when an oil slick tile ignites. */
  attachOilBurnRig(group) {
    if (group.userData.burnRig) return group.userData.burnRig;
    this.ensureOilBurnGeometries();

    const burnGroup = new THREE.Group();
    burnGroup.visible = false;

    const fireBed = new THREE.Mesh(this.oilFireBedGeo, this.oilFireBedMat);
    fireBed.rotation.x = -Math.PI / 2;
    fireBed.position.y = 0.024;
    burnGroup.add(fireBed);

    const fireWave = new THREE.Mesh(this.oilFireWaveGeo, this.oilFireBedMat);
    fireWave.rotation.x = -Math.PI / 2;
    fireWave.rotation.z = 1.1;
    fireWave.position.y = 0.03;
    burnGroup.add(fireWave);

    const tongueSpecs = [
      { x: 0.0, z: 0.0, yaw: 0.25, w: 1.45, h: 1.15, phase: 0.0 },
      { x: 0.0, z: 0.0, yaw: 1.82, w: 1.38, h: 1.08, phase: 1.4 },
      { x: -0.38, z: -0.32, yaw: 0.78, w: 1.05, h: 0.88, phase: 2.3 },
      { x: 0.4, z: -0.28, yaw: 2.15, w: 1.02, h: 0.84, phase: 3.6 },
      { x: -0.32, z: 0.38, yaw: 1.35, w: 1.08, h: 0.9, phase: 4.8 },
      { x: 0.36, z: 0.34, yaw: 2.72, w: 1.0, h: 0.82, phase: 5.7 },
    ];
    const flameTongues = tongueSpecs.map((spec) => {
      const mesh = new THREE.Mesh(this.oilFlameTongueGeo, this.oilFlameSheetMat);
      mesh.position.set(spec.x, 0.02, spec.z);
      mesh.rotation.y = spec.yaw;
      mesh.scale.set(spec.w, spec.h, 1);
      burnGroup.add(mesh);
      return { mesh, ...spec };
    });

    const boilSpecs = [
      { x: -0.28, z: 0.18, phase: 0.0 },
      { x: 0.32, z: -0.22, phase: 0.35 },
      { x: 0.05, z: 0.34, phase: 0.68 },
    ];
    const boilRings = boilSpecs.map((spec) => {
      const rMesh = new THREE.Mesh(this.oilBoilRingGeo, this.oilBoilRingMat);
      rMesh.rotation.x = -Math.PI / 2;
      rMesh.position.set(spec.x, 0.034, spec.z);
      burnGroup.add(rMesh);
      return { mesh: rMesh, ...spec };
    });

    markOwned(burnGroup, { geometries: false, materials: false });
    group.userData.batchTile = false;
    delete group.updateMatrixWorld;
    group.add(burnGroup);
    group.updateMatrixWorld(true);
    const rig = {
      burnGroup,
      fireBed,
      fireWave,
      flameTongues,
      boilRings,
      phaseOffset: ((group.userData.oilCellHash ?? 0) % 100) * 0.0628,
    };
    group.userData.burnRig = rig;
    return rig;
  }

  /** Dynamically animates the 3D burning oil slick fire-bed, boiling rings, and flame crown. */
  updateOilSlickBurn(mesh, isBurning, intensity = 1, time = 0) {
    if (!isBurning || intensity <= 0.01) {
      if (mesh?.userData?.burnRig) {
        mesh.userData.burnRig.burnGroup.visible = false;
      }
      return;
    }
    const rig = mesh?.userData?.burnRig || (mesh ? this.attachOilBurnRig(mesh) : null);
    if (!rig) return;
    rig.burnGroup.visible = true;
    const s = Math.max(0.25, Math.min(1.15, intensity));
    const t = time + rig.phaseOffset;

    const pulseA = 1 + Math.sin(t * 11.5) * 0.07 + Math.cos(t * 19.0) * 0.04;
    const pulseB = 1 + Math.cos(t * 14.2) * 0.09 + Math.sin(t * 23.5) * 0.05;
    rig.fireBed.scale.setScalar((0.72 + 0.28 * s) * pulseA);
    rig.fireBed.rotation.z = t * 0.35;
    rig.fireWave.scale.setScalar((0.68 + 0.32 * s) * pulseB);
    rig.fireWave.rotation.z = -t * 0.55 + 1.1;

    for (const tongue of rig.flameTongues) {
      const p = t * 13.0 + tongue.phase;
      const stretchY = 0.78 + 0.26 * Math.sin(p) + 0.14 * Math.cos(p * 1.65);
      const stretchX = 0.88 + 0.15 * Math.cos(p * 0.85);
      tongue.mesh.scale.set(
        tongue.w * stretchX * (0.65 + 0.35 * s),
        tongue.h * stretchY * (0.55 + 0.45 * s),
        1
      );
      tongue.mesh.rotation.z = Math.sin(p * 0.7) * 0.12;
      tongue.mesh.rotation.x = Math.cos(p * 0.55) * 0.09;
    }

    for (const ring of rig.boilRings) {
      const cycle = (t * 1.45 + ring.phase) % 1;
      const ringScale = (0.22 + cycle * 0.78) * (0.6 + 0.4 * s);
      ring.mesh.scale.setScalar(ringScale);
      ring.mesh.rotation.z = t * 1.2 + ring.phase * 6.28;
    }
  }

  /** Pre-builds shared crater decal textures, materials, and sculpted rim geometry. */
  ensureCraterAssets() {
    if (this.craterMats && this.craterRimGeo) return;
    if (!this.craterMats) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 256, 256);

      const cx = 128;
      const cy = 128;

      let seed = 4242;
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      // 1. Star-shaped soot / blast scorch rays radiating outward
      for (let i = 0; i < 22; i++) {
        const ang = (i / 22) * Math.PI * 2 + (rand() - 0.5) * 0.22;
        const len = 76 + rand() * 44;
        const spread = 0.08 + rand() * 0.14;
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, len);
        grad.addColorStop(0, 'rgba(12, 10, 9, 0.85)');
        grad.addColorStop(0.55, 'rgba(28, 22, 18, 0.52)');
        grad.addColorStop(1, 'rgba(28, 22, 18, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang - spread) * len, cy + Math.sin(ang - spread) * len);
        ctx.lineTo(cx + Math.cos(ang + spread) * len, cy + Math.sin(ang + spread) * len);
        ctx.closePath();
        ctx.fill();
      }

      // 2. Deep bowl gradient: charred pit -> churned earth -> faded edge
      const bowlGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, 98);
      bowlGrad.addColorStop(0, 'rgba(10, 9, 8, 0.96)');
      bowlGrad.addColorStop(0.38, 'rgba(24, 19, 15, 0.92)');
      bowlGrad.addColorStop(0.65, 'rgba(58, 45, 34, 0.82)');
      bowlGrad.addColorStop(0.84, 'rgba(72, 58, 44, 0.42)');
      bowlGrad.addColorStop(1, 'rgba(72, 58, 44, 0)');
      ctx.fillStyle = bowlGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 98, 0, Math.PI * 2);
      ctx.fill();

      // 3. Radial fracture cracks in surrounding ground/asphalt
      ctx.strokeStyle = 'rgba(15, 13, 12, 0.72)';
      for (let i = 0; i < 11; i++) {
        let ang = (i / 11) * Math.PI * 2 + (rand() - 0.5) * 0.3;
        let dist = 46;
        ctx.lineWidth = 1.6 + rand() * 1.4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
        for (let s = 0; s < 3; s++) {
          dist += 16 + rand() * 14;
          ang += (rand() - 0.5) * 0.35;
          ctx.lineTo(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
        }
        ctx.stroke();
      }

      // 4. Scattered blast gravel & ash flecks
      for (let i = 0; i < 55; i++) {
        const ang = rand() * Math.PI * 2;
        const dist = 20 + rand() * 88;
        const r = 1.2 + rand() * 2.8;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(92, 78, 62, 0.65)' : 'rgba(20, 18, 16, 0.65)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, r, 0, Math.PI * 2);
        ctx.fill();
      }

      const decalTex = new THREE.CanvasTexture(c);
      decalTex.colorSpace = THREE.SRGBColorSpace;
      decalTex.needsUpdate = true;

      this.craterMats = {
        decal: new THREE.MeshStandardMaterial({
          map: decalTex,
          transparent: true,
          depthWrite: false,
          roughness: 0.96,
          metalness: 0.02,
          polygonOffset: true,
          polygonOffsetUnits: -2,
        }),
        earth: new THREE.MeshStandardMaterial({
          color: 0xffffff,
          vertexColors: true,
          roughness: 0.98,
          metalness: 0.02,
        }),
        rubble: new THREE.MeshStandardMaterial({
          color: 0x1c1917,
          roughness: 0.95,
          metalness: 0.05,
        }),
        rubbleDark: new THREE.MeshStandardMaterial({
          color: 0x110f0e,
          roughness: 0.97,
          metalness: 0.04,
        }),
      };

      // Continuous 3D sculpted dark blast crater funnel + jagged scorched rim (linear RGB vertex colors)
      const angSegs = 28;
      const ringRadii = [0.06, 0.28, 0.48, 0.62, 0.78, 0.96];
      const ringHeights = [0.002, 0.008, 0.055, 0.088, 0.032, 0.002];
      const ringWeights = [0.05, 0.25, 0.85, 1.0, 0.5, 0.05];
      const ringColors = [
        [0.008, 0.007, 0.006], // deep charred pit center
        [0.012, 0.010, 0.009], // soot pit wall
        [0.028, 0.022, 0.017], // scorched inner lip
        [0.045, 0.035, 0.026], // dark churned earth / charred asphalt crest
        [0.026, 0.021, 0.017], // dark soot slope
        [0.014, 0.012, 0.010], // ash fade to ground
      ];
      const positions = [];
      const colors = [];
      const indices = [];

      for (let r = 0; r < ringRadii.length; r++) {
        const baseR = ringRadii[r];
        const baseY = ringHeights[r];
        const w = ringWeights[r];
        const [cr, cg, cb] = ringColors[r];
        for (let a = 0; a < angSegs; a++) {
          const ang = (a / angSegs) * Math.PI * 2;
          const n1 = Math.sin(ang * 3 + 0.7) * 0.55 + Math.cos(ang * 5 - 1.1) * 0.4;
          const n2 = Math.sin(ang * 11 + 2.3 + r * 0.9) * 0.3;
          const rad = Math.max(0.02, baseR + (n1 * 0.085 + n2 * 0.035) * (r === 0 ? 0.3 : 1.0));
          const y = Math.max(0.002, baseY + (n1 * 0.026 + n2 * 0.016) * w);
          positions.push(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
          const shade = 0.85 + (n1 + n2) * 0.16;
          colors.push(cr * shade, cg * shade, cb * shade);
        }
      }

      for (let r = 0; r < ringRadii.length - 1; r++) {
        for (let a = 0; a < angSegs; a++) {
          const aNext = (a + 1) % angSegs;
          const i0 = r * angSegs + a;
          const i1 = r * angSegs + aNext;
          const i2 = (r + 1) * angSegs + a;
          const i3 = (r + 1) * angSegs + aNext;
          indices.push(i0, i1, i2, i1, i3, i2);
        }
      }

      const rimGeo = new THREE.BufferGeometry();
      rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      rimGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      rimGeo.setIndex(indices);
      rimGeo.computeVertexNormals();
      rimGeo.userData.batchGeometryKey = 'crater-rim';
      this.craterRimGeo = rimGeo;
    }
  }

  /** Pre-warms lazy procedural combat/destruction assets during sector load. */
  prewarmCombatAssets() {
    if (typeof document === 'undefined') return;
    this.ensureRubbleAssets();
    this.ensureSandPatchMats();
    this.ensureSwampPatchMats();
    this.ensureCraterAssets();
  }

  /** Naturalistic blast crater with scorch rays, radial cracks, and jagged dirt rim. */
  createCraterBlock(x = 0, z = 0) {
    this.ensureCraterAssets();

    const { decal, earth, rubble, rubbleDark } = this.craterMats;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Deterministic per-cell orientation so neighboring craters don't look cloned
    const hash = (Math.imul(Math.round(x * 13), 73856093) ^ Math.imul(Math.round(z * 17), 19349663)) >>> 0;
    group.rotation.y = ((hash % 360) * Math.PI) / 180;

    // Textured blast scorch + outward soot rays
    const pitDecal = new THREE.Mesh(
      this.sharedGeometry('PlaneGeometry', TILE_SIZE * 1.24, TILE_SIZE * 1.24),
      decal
    );
    pitDecal.rotation.x = -Math.PI / 2;
    pitDecal.position.y = 0.006;
    pitDecal.receiveShadow = true;
    group.add(pitDecal);

    // Sculpted 3D dark crater funnel & blast rim
    const rimMesh = new THREE.Mesh(this.craterRimGeo, earth);
    rimMesh.castShadow = true;
    rimMesh.receiveShadow = true;
    group.add(rimMesh);

    // Scattered charred debris & ejected chunks around the rim and outer blast zone
    const chunkGeo = this.sharedGeometry('DodecahedronGeometry', 0.085, 0);
    const chunkPlacements = [
      { ang: 0.38, rad: 0.66, sx: 1.4, sy: 0.45, sz: 0.9, dark: false },
      { ang: 0.92, rad: 0.92, sx: 0.85, sy: 0.5, sz: 0.75, dark: true },
      { ang: 1.55, rad: 0.76, sx: 1.15, sy: 0.6, sz: 1.25, dark: false },
      { ang: 2.15, rad: 0.98, sx: 0.7, sy: 0.4, sz: 0.9, dark: true },
      { ang: 2.75, rad: 0.62, sx: 1.5, sy: 0.42, sz: 0.85, dark: true },
      { ang: 3.45, rad: 0.84, sx: 1.0, sy: 0.55, sz: 1.1, dark: false },
      { ang: 4.18, rad: 0.71, sx: 1.3, sy: 0.48, sz: 0.8, dark: true },
      { ang: 4.82, rad: 0.95, sx: 0.8, sy: 0.38, sz: 0.7, dark: false },
      { ang: 5.35, rad: 0.68, sx: 1.25, sy: 0.52, sz: 0.95, dark: true },
      { ang: 5.88, rad: 0.88, sx: 0.95, sy: 0.44, sz: 1.15, dark: false },
    ];
    chunkPlacements.forEach((c, i) => {
      const chunk = new THREE.Mesh(chunkGeo, c.dark ? rubbleDark : rubble);
      chunk.position.set(Math.cos(c.ang) * c.rad, 0.036, Math.sin(c.ang) * c.rad);
      chunk.scale.set(c.sx, c.sy, c.sz);
      chunk.rotation.set(i * 0.7, c.ang + i * 0.9, i * 0.5);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      group.add(chunk);
    });

    group.userData.batchTile = true;
    return markOwned(group, { geometries: false, materials: false });
  }

  /** Destructible steel pressurized water tower structure. */
  createWaterTowerBlock() {
    if (!this.waterTowerMats) {
      this.waterTowerMats = {
        pad: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.15 }),
        steel: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.48, metalness: 0.7 }),
        tank: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.38, metalness: 0.45 }),
        band: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.5 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.42, metalness: 0.55 }),
      };
    }
    const { pad, steel, tank, band, roof } = this.waterTowerMats;
    const group = new THREE.Group();

    const basePad = new THREE.Mesh(this.sharedGeometry('BoxGeometry', 1.55, 0.12, 1.55), pad);
    basePad.position.y = 0.06;
    basePad.receiveShadow = true;
    basePad.castShadow = true;
    group.add(basePad);

    const legGeo = this.sharedGeometry('CylinderGeometry', 0.065, 0.08, 1.15, 8);
    for (const [lx, lz] of [
      [-0.45, -0.45],
      [0.45, -0.45],
      [-0.45, 0.45],
      [0.45, 0.45],
    ]) {
      const leg = new THREE.Mesh(legGeo, steel);
      leg.position.set(lx, 0.68, lz);
      leg.castShadow = true;
      group.add(leg);
    }

    const pipe = new THREE.Mesh(
      this.sharedGeometry('CylinderGeometry', 0.14, 0.14, 1.15, 10),
      steel
    );
    pipe.position.y = 0.68;
    pipe.castShadow = true;
    group.add(pipe);

    const drum = new THREE.Mesh(
      this.sharedGeometry('CylinderGeometry', 0.64, 0.64, 0.95, 16),
      tank
    );
    drum.position.y = 1.68;
    drum.castShadow = true;
    drum.receiveShadow = true;
    group.add(drum);

    const stripe = new THREE.Mesh(
      this.sharedGeometry('CylinderGeometry', 0.655, 0.655, 0.16, 16),
      band
    );
    stripe.position.y = 1.68;
    group.add(stripe);

    const cap = new THREE.Mesh(
      this.sharedGeometry('ConeGeometry', 0.68, 0.42, 16),
      roof
    );
    cap.position.y = 2.36;
    cap.castShadow = true;
    group.add(cap);

    group.userData.batchTile = true;
    return markOwned(group, { geometries: false, materials: false });
  }

  createRailBlock(x = 0, z = 0, neighborMask = 5) {
    return buildRailBlock(this, x, z, neighborMask);
  }

  createRailBridgeBlock(x = 0, z = 0, neighborMask = 5) {
    return buildRailBridgeBlock(this, x, z, neighborMask);
  }

  createRailCurveBlock(x = 0, z = 0, rotationDeg = 0) {
    return buildRailCurveBlock(this, x, z, rotationDeg);
  }

  createContainerBlock(colorIndex = 0, orientation = 'ns', spanCells = 1) {
    return buildContainerBlock(this, colorIndex, orientation, spanCells);
  }

  updateContainerDamage(mesh, hp, maxHp = 8) {
    refreshContainerDamage(this, mesh, hp, maxHp);
  }

  createTransformerBlock() {
    return buildTransformerBlock(this);
  }

  updateTransformerDamage(mesh, hp) {
    refreshTransformerDamage(this, mesh, hp);
  }

  createSandbagsBlock(neighborMask = 0) {
    return buildSandbagsBlock(this, neighborMask);
  }

  createRailCarBlock(orientation = 'ns', variant = 'closed', spanCells = 1, colorIndex = 0) {
    return buildRailCarBlock(this, orientation, variant, spanCells, colorIndex);
  }

  updateRailCarDamage(mesh, hp, maxHp = 10) {
    refreshRailCarDamage(this, mesh, hp, maxHp);
  }

  createLocomotiveBlock(orientation = 'ns', spanCells = 1) {
    return buildLocomotiveBlock(this, orientation, spanCells);
  }

  updateLocomotiveDamage(mesh, hp, maxHp = 16) {
    refreshLocomotiveDamage(this, mesh, hp, maxHp);
  }

  createCrushableProp(kind, theme = 'urban', seed = 0) {
    return buildCrushableProp(this, kind, theme, seed);
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

  loadAirDropGlbModel() {
    if (this.isSoftwareGl || this.glbAirDropRequested || this.glbAirDropParts) return;
    this.glbAirDropRequested = true;
    getTankGltfLoader(this.renderer).load(
      resolvePublicUrl('./models/air_drop.glb'),
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const parts = { crate: [], chute: [] };
        const chuteNode = gltf.scene.getObjectByName('AirDropChute');
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          const mesh = node.clone();
          node.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          let inChute = false;
          for (let cur = node; cur; cur = cur.parent) {
            if (cur === chuteNode || cur.name === 'AirDropChute') {
              inChute = true;
              break;
            }
          }
          if (inChute) parts.chute.push(mesh);
          else parts.crate.push(mesh);
        });
        this.glbAirDropParts = parts;
        const pending = this.pendingAirDropRigs || [];
        pending.forEach((rig) => this.applyGlbAirDropModel(rig));
        this.pendingAirDropRigs = [];
      },
      undefined,
      (err) => {
        this.pendingAirDropRigs = [];
        console.warn('Air drop GLB unavailable, using procedural rig.', err);
      }
    );
  }

  applyGlbAirDropModel(rig) {
    const parts = this.glbAirDropParts;
    if (!parts || !rig?.crateGroup || !rig?.chuteGroup) return;
    const clearChildren = (grp) => {
      while (grp.children.length > 0) {
        const ch = grp.children[0];
        if (ch === rig.chuteGroup) break;
        grp.remove(ch);
        disposeOwned(ch);
      }
    };
    // Remove fallback crate children while keeping chuteGroup
    for (let i = rig.crateGroup.children.length - 1; i >= 0; i--) {
      const ch = rig.crateGroup.children[i];
      if (ch === rig.chuteGroup) continue;
      rig.crateGroup.remove(ch);
      disposeOwned(ch);
    }
    clearChildren(rig.chuteGroup);

    for (const src of parts.crate) {
      rig.crateGroup.add(src.clone());
    }
    for (const src of parts.chute) {
      rig.chuteGroup.add(src.clone());
    }
  }

  createAirDropRig() {
    const root = new THREE.Group();

    // Ground landing zone marker (stays at y = 0.05 while the crate descends)
    const ringGeo = new THREE.RingGeometry(0.95, 1.18, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const landingRing = new THREE.Mesh(ringGeo, ringMat);
    landingRing.position.y = 0.05;
    root.add(landingRing);

    const crateGroup = new THREE.Group();
    root.add(crateGroup);

    const chuteGroup = new THREE.Group();
    crateGroup.add(chuteGroup);

    const rig = { root, landingRing, crateGroup, chuteGroup };

    if (this.glbAirDropParts) {
      this.applyGlbAirDropModel(rig);
      markOwned(landingRing);
      return rig;
    }

    // Minimal procedural fallback while air_drop.glb loads (or in software GL mode)
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x3b4d36, roughness: 0.7, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 1.5), crateMat);
    body.position.y = 0.65;
    body.castShadow = true;
    crateGroup.add(body);

    const canopyGeo = new THREE.SphereGeometry(2.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8, side: THREE.DoubleSide });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 3.6;
    chuteGroup.add(canopy);

    markOwned(root);
    if (!this.isSoftwareGl) {
      this.pendingAirDropRigs ||= [];
      this.pendingAirDropRigs.push(rig);
      this.loadAirDropGlbModel();
    }
    return rig;
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

      case POWERUP.AMMO: {
        const shellGroup = new THREE.Group();
        shellGroup.rotation.x = -Math.PI / 4;
        trophy.add(shellGroup);

        const casing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.48, 12),
          accentMat
        );
        shellGroup.add(casing);

        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.24, 12),
          brightMat
        );
        tip.position.y = 0.36;
        shellGroup.add(tip);
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

  /** Lightweight thematic 3D silhouettes placed behind the far edges of the arena. */
  createThemePerimeterProps(theme = 'urban', halfSpan = 40, seed = 1) {
    const group = new THREE.Group();
    if (this.isSoftwareGl) return markOwned(group, { materials: false });

    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

    if (!this.themePropMats) {
      const makeTex = (drawFn, w = 128, h = 128) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        drawFn(c.getContext('2d'), w, h);
        const tex = this.configureColorTexture(new THREE.CanvasTexture(c));
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
      };

      const facadeTex = makeTex((ctx, w, h) => {
        ctx.fillStyle = '#384152';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#2d3544';
        for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 3);
        for (let y = 8; y < h; y += 24) {
          for (let x = 8; x < w; x += 22) {
            const lit = ((x * 7 + y * 13) % 11) < 4;
            ctx.fillStyle = lit ? '#eab308' : '#18202c';
            ctx.fillRect(x, y, 12, 14);
            ctx.fillStyle = lit ? '#fef08a' : '#243042';
            ctx.fillRect(x + 2, y + 2, 8, 5);
          }
        }
      });

      const siloTex = makeTex((ctx, w, h) => {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#374151';
        for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 4);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(0, h * 0.42, w, 14);
        ctx.fillStyle = '#1f2937';
        for (let x = 0; x < w; x += 24) ctx.fillRect(x, h * 0.42, 12, 14);
      });

      const rockTex = makeTex((ctx, w, h) => {
        ctx.fillStyle = '#8b6f47';
        ctx.fillRect(0, 0, w, h);
        const bands = ['#7c613c', '#9c7e54', '#6d5433', '#a6895e'];
        for (let y = 0; y < h; y += 16) {
          ctx.fillStyle = bands[(y / 16) % bands.length];
          ctx.fillRect(0, y, w, 12);
        }
      });

      this.themePropMats = {
        facade: new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.82, metalness: 0.15 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, metalness: 0.1 }),
        curb: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.88, metalness: 0.1 }),
        silo: new THREE.MeshStandardMaterial({ map: siloTex, roughness: 0.55, metalness: 0.55 }),
        pine: new THREE.MeshStandardMaterial({ color: 0x1e3f20, roughness: 0.9 }),
        pineTip: new THREE.MeshStandardMaterial({ color: 0x2a542d, roughness: 0.88 }),
        trunk: new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.92 }),
        sandstone: new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.92 }),
        snow: new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.85 }),
        beacon: new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 0.75,
        }),
      };
    }

    const m = this.themePropMats;
    if (!this.perimeterBuildingCatalog) {
      this.perimeterBuildingCatalog = new PerimeterBuildingCatalog(
        (type, ...args) => this.sharedGeometry(type, ...args),
        (tex) => this.configureColorTexture(tex)
      );
    }

    // Irregular, map-seeded offsets along the far North (pz < 0) and West (px < 0) edges,
    // seated on the flat apron between the arena border and the mountain slope.
    const farSlots = [];
    for (let pos = -halfSpan + 4.5 + rng() * 3.0; pos <= halfSpan - 4.5; pos += 7.2 + rng() * 6.8) {
      const depthN = halfSpan + 3.1 + rng() * 2.2;
      const rotN = (Math.floor(rng() * 4) * Math.PI) / 2;
      farSlots.push({ px: pos, pz: -depthN, rot: rotN });
    }
    for (let pos = -halfSpan + 4.5 + rng() * 3.0; pos <= halfSpan - 4.5; pos += 7.2 + rng() * 6.8) {
      const depthW = halfSpan + 3.1 + rng() * 2.2;
      const rotW = (Math.floor(rng() * 4) * Math.PI) / 2;
      farSlots.push({ px: -depthW, pz: pos, rot: rotW });
    }

    farSlots.forEach(({ px, pz, rot }, idx) => {
      if (theme === 'urban' || theme === 'capital') {
        const kind = ALL_URBAN_BUILDING_KINDS[Math.floor(rng() * ALL_URBAN_BUILDING_KINDS.length)];
        const bldg = this.perimeterBuildingCatalog.build(kind);
        bldg.position.set(px, 0, pz);
        bldg.rotation.y = rot;
        group.add(bldg);
      } else if (theme === 'industrial') {
        if (rng() < 0.32) {
          const silo = new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 1.55, 1.55, 4.0, 12), m.silo);
          silo.position.set(px, 1.8, pz);
          group.add(silo);
          const dome = new THREE.Mesh(this.sharedGeometry('SphereGeometry', 1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.roof);
          dome.position.set(px, 3.8, pz);
          group.add(dome);
        } else {
          const kind = CIVIC_INDUSTRIAL_BUILDING_KINDS[Math.floor(rng() * CIVIC_INDUSTRIAL_BUILDING_KINDS.length)];
          const bldg = this.perimeterBuildingCatalog.build(kind);
          bldg.position.set(px, 0, pz);
          bldg.rotation.y = rot;
          group.add(bldg);
        }
      } else if (theme === 'forest' || theme === 'alpine') {
        const scale = 0.8 + rng() * 0.55;
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 0.26, 0.36, 1.4, 6), m.trunk);
        trunk.position.y = 0.5;
        tree.add(trunk);
        const lowerMat = theme === 'alpine' && idx % 2 === 0 ? m.snow : m.pine;
        const lower = new THREE.Mesh(this.sharedGeometry('ConeGeometry', 1.7, 2.5, 7), lowerMat);
        lower.position.y = 2.1;
        tree.add(lower);
        const upper = new THREE.Mesh(this.sharedGeometry('ConeGeometry', 1.15, 2.1, 7), theme === 'alpine' ? m.snow : m.pineTip);
        upper.position.y = 3.4;
        tree.add(upper);
        tree.scale.setScalar(scale);
        tree.rotation.y = rng() * Math.PI * 2;
        tree.position.set(px, 0, pz);
        group.add(tree);
      } else if (theme === 'desert') {
        const mesa = new THREE.Group();
        const baseMesa = new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 2.2, 3.1, 1.6 + (idx % 2) * 0.8, 7), m.sandstone);
        baseMesa.position.y = 0.7;
        mesa.add(baseMesa);
        const capMesa = new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 1.2, 1.9, 1.1, 7), m.sandstone);
        capMesa.position.set(0.3, 1.9, -0.2);
        mesa.add(capMesa);
        mesa.scale.setScalar(0.75 + rng() * 0.55);
        mesa.rotation.y = rng() * Math.PI * 2;
        mesa.position.set(px, 0, pz);
        group.add(mesa);
      } else if (theme === 'coast') {
        const bollard = new THREE.Mesh(this.sharedGeometry('CylinderGeometry', 0.32, 0.42, 0.9, 8), m.silo);
        bollard.position.set(px, 0.35, pz);
        group.add(bollard);
        if (rng() < 0.4) {
          const light = new THREE.Mesh(this.sharedGeometry('SphereGeometry', 0.24, 8, 8), m.beacon);
          light.position.set(px, 0.95, pz);
          group.add(light);
        }
      }
    });

    // Low ground-level curb markers along front edges (never occlude the arena)
    for (let pos = -halfSpan + 5 + rng() * 4; pos <= halfSpan - 5; pos += 8.5 + rng() * 6.5) {
      const curbS = new THREE.Mesh(this.sharedGeometry('BoxGeometry', 1.8, 0.24, 0.45), m.curb);
      curbS.position.set(pos, 0.12, halfSpan + 2.0 + rng() * 0.9);
      group.add(curbS);
    }
    for (let pos = -halfSpan + 5 + rng() * 4; pos <= halfSpan - 5; pos += 8.5 + rng() * 6.5) {
      const curbE = new THREE.Mesh(this.sharedGeometry('BoxGeometry', 1.8, 0.24, 0.45), m.curb);
      curbE.position.set(halfSpan + 2.0 + rng() * 0.9, 0.12, pos);
      curbE.rotation.y = Math.PI / 2;
      group.add(curbE);
    }

    return markOwned(group, { materials: false });
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

    // Floating numbered + data symbol canvas badge (cached across reloads)
    const tex = this.getContractBadgeTexture('DATA', slot, code, accentHex);
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

    const tex = this.getContractBadgeTexture('RELAY', slot, code, accentHex);
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
