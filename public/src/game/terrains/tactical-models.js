/** Procedural 3D builders for rail tracks, containers, transformers, sandbags, rail cars, and crushable props. */

import * as THREE from 'three';
import { TILE_SIZE } from '../levels.js';
import { markOwned } from '../render/dispose.js';
import { getSharedGltfLoader } from '../render/gltf-loader.js';

const TACTICAL_CONTAINER_KEYS = Object.freeze([
  'CONTAINER_BLUE',
  'CONTAINER_RED',
  'CONTAINER_GREEN',
  'CONTAINER_OCHRE',
]);

/** Blender tactical terrain GLB pack loader (RAIL, CONTAINER, TRANSFORMER, SANDBAGS, RAIL_CAR). */
export class TacticalModels {
  constructor(renderer = null) {
    this.url = new URL('../../../models/terrain/tactical.glb', import.meta.url).href;
    this.prefix = 'TACTICAL';
    this.renderer = renderer;
    this.templates = new Map();
    this.ready = false;
    this.disposed = false;
  }

  async load() {
    const gltf = await getSharedGltfLoader(this.renderer).loadAsync(this.url);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => {
      if (!node.isMesh || !node.name) return;
      const geo = node.geometry.clone();
      geo.applyMatrix4(node.matrixWorld);
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (m) m.userData.batchKey ||= `tactical-${m.name || 'mat'}`;
      }
      this.templates.set(node.name, { geometry: geo, material: node.material });
    });
    if (this.disposed) {
      this.dispose();
      return false;
    }
    this.ready = this.templates.size > 0;
    return this.ready;
  }

  apply(group, name, { castShadow = true, receiveShadow = true } = {}) {
    const tpl = this.templates.get(name);
    if (!tpl) return false;
    group.clear();
    const mesh = new THREE.Mesh(tpl.geometry, tpl.material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    group.userData.tacticalGlbKey = name;
    return true;
  }

  dispose() {
    this.disposed = true;
    this.ready = false;
    const disposedMats = new Set();
    for (const tpl of this.templates.values()) {
      tpl.geometry?.dispose?.();
      const mats = Array.isArray(tpl.material) ? tpl.material : [tpl.material];
      for (const m of mats) {
        if (m && !disposedMats.has(m)) {
          disposedMats.add(m);
          m.dispose?.();
        }
      }
    }
    this.templates.clear();
  }
}

const CONTAINER_COLORS = Object.freeze([0x1d4ed8, 0xb91c1c, 0x15803d, 0xb45309]);

function ensureTacticalMaterials(factory) {
  if (factory._tacticalMats) return factory._tacticalMats;
  factory._tacticalMats = {
    ballast: new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.96, metalness: 0.04 }),
    sleeper: new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9, metalness: 0.05 }),
    railSteel: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.85 }),
    concretePad: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88, metalness: 0.1 }),
    containerHulls: CONTAINER_COLORS.map(
      (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0.35 })
    ),
    containerDamaged: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78, metalness: 0.45 }),
    containerTrim: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.65 }),
    transformerBody: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.65 }),
    transformerFins: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.48, metalness: 0.72 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.32, metalness: 0.15 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.8 }),
    hazardYellow: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.15 }),
    empGlow: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.2,
    }),
    empGlowWarn: new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 1.4,
      roughness: 0.25,
      metalness: 0.2,
    }),
    burlap: new THREE.MeshStandardMaterial({ color: 0xc2a67d, roughness: 0.92, metalness: 0.02 }),
    burlapDark: new THREE.MeshStandardMaterial({ color: 0xa3855c, roughness: 0.94, metalness: 0.02 }),
    woodStake: new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.88, metalness: 0.05 }),
    railCarBody: new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.72, metalness: 0.25 }),
    railCarDamaged: new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.85, metalness: 0.3 }),
    railCarRoof: new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.65, metalness: 0.45 }),
    railCarDoor: new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.68, metalness: 0.3 }),
    darkIron: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.75 }),
    lampGlow: new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfde047,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    }),
    fenceWood: new THREE.MeshStandardMaterial({ color: 0x78553a, roughness: 0.88, metalness: 0.05 }),
    carBodyColors: [
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.45, metalness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.45, metalness: 0.45 }),
      new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.45, metalness: 0.45 }),
      new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.45, metalness: 0.4 }),
    ],
    carGlass: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 }),
    tireRubber: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9, metalness: 0.08 }),
    shrubGreen: new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.88, metalness: 0.02 }),
    shrubLavender: new THREE.MeshStandardMaterial({ color: 0x7e22ce, roughness: 0.85, metalness: 0.02 }),
    shrubDesert: new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.92, metalness: 0.02 }),
    shrubAlpine: new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.88, metalness: 0.02 }),
    barricadeRed: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55, metalness: 0.15 }),
    barricadeWhite: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.1 }),
  };
  return factory._tacticalMats;
}

/** Flat ballasted railway track tile with N/E/S/W auto-connecting sleepers and steel rails. */
export function createRailBlock(factory, x = 0, z = 0, neighborMask = 5) {
  const n = Boolean(neighborMask & 1);
  const e = Boolean(neighborMask & 2);
  const s = Boolean(neighborMask & 4);
  const w = Boolean(neighborMask & 8);
  const hasEW = e || w;
  const hasNS = n || s || !hasEW;

  if (factory.useBlenderTactical && factory.tacticalModels?.ready) {
    const group = new THREE.Group();
    const key = hasNS && hasEW ? 'RAIL_JUNCTION' : 'RAIL_STRAIGHT';
    if (factory.tacticalModels.apply(group, key, { castShadow: false, receiveShadow: true })) {
      if (!hasNS && hasEW) group.rotation.y = Math.PI / 2;
      group.position.set(x, 0, z);
      group.userData.batchTile = true;
      return markOwned(group, { geometries: false, materials: false });
    }
  }

  const mats = ensureTacticalMaterials(factory);
  const group = new THREE.Group();
  const S = TILE_SIZE;

  const ballast = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', S, 0.035, S),
    mats.ballast
  );
  ballast.position.y = 0.018;
  ballast.receiveShadow = true;
  group.add(ballast);

  const addAxisTrack = (alongX) => {
    const sleeperGeo = factory.sharedGeometry('BoxGeometry', alongX ? 0.14 : 1.38, 0.045, alongX ? 1.38 : 0.14);
    for (let i = -2; i <= 2; i++) {
      const sleeper = new THREE.Mesh(sleeperGeo, mats.sleeper);
      sleeper.position.set(alongX ? i * 0.38 : 0, 0.045, alongX ? 0 : i * 0.38);
      sleeper.receiveShadow = true;
      group.add(sleeper);
    }
    const railGeo = factory.sharedGeometry('BoxGeometry', alongX ? S : 0.09, 0.06, alongX ? 0.09 : S);
    for (const offset of [-0.46, 0.46]) {
      const rail = new THREE.Mesh(railGeo, mats.railSteel);
      rail.position.set(alongX ? 0 : offset, 0.08, alongX ? offset : 0);
      rail.receiveShadow = true;
      group.add(rail);
    }
  };

  if (hasNS) addAxisTrack(false);
  if (hasEW) addAxisTrack(true);

  group.position.set(x, 0, z);
  group.userData.batchTile = true;
  return markOwned(group, { geometries: false, materials: false });
}

/** Corrugated steel shipping container (8 HP), spanning 1 or 2 cells (`spanCells`). */
export function createContainerBlock(factory, colorIndex = 0, orientation = 'ns', spanCells = 1) {
  const isPair = spanCells >= 2;
  if (factory.useBlenderTactical && factory.tacticalModels?.ready) {
    const group = new THREE.Group();
    const colorKey = TACTICAL_CONTAINER_KEYS[Math.abs(colorIndex) % TACTICAL_CONTAINER_KEYS.length];
    if (factory.tacticalModels.apply(group, colorKey, { castShadow: true, receiveShadow: true })) {
      if (!isPair) group.scale.z = 0.5;
      if (orientation === 'ew') group.rotation.y = Math.PI / 2;
      group.userData.containerColorKey = colorKey;
      group.userData.batchTile = true;
      return markOwned(group, { geometries: false, materials: false });
    }
  }

  const mats = ensureTacticalMaterials(factory);
  const group = new THREE.Group();
  const hullMat = mats.containerHulls[Math.abs(colorIndex) % mats.containerHulls.length];

  const lenZ = isPair ? TILE_SIZE * 1.92 : TILE_SIZE * 0.9;
  const widthX = TILE_SIZE * 0.72;
  const height = 1.38;

  const body = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', widthX, height, lenZ),
    hullMat
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Corrugation ribs along side walls
  const ribGeo = factory.sharedGeometry('BoxGeometry', widthX + 0.06, height - 0.12, 0.09);
  for (let i = -2; i <= 2; i++) {
    const rib = new THREE.Mesh(ribGeo, hullMat);
    rib.position.set(0, height / 2, i * 0.3);
    group.add(rib);
  }

  // Steel corner frame & door lock bars
  const frameCapGeo = factory.sharedGeometry('BoxGeometry', widthX + 0.04, 0.1, lenZ + 0.04);
  const topCap = new THREE.Mesh(frameCapGeo, mats.containerTrim);
  topCap.position.y = height - 0.05;
  group.add(topCap);

  const lockGeo = factory.sharedGeometry('BoxGeometry', 0.06, height - 0.2, 0.06);
  for (const lx of [-0.22, 0.22]) {
    const lock = new THREE.Mesh(lockGeo, mats.railSteel);
    lock.position.set(lx, height / 2, lenZ / 2 + 0.02);
    group.add(lock);
  }

  if (orientation === 'ew') group.rotation.y = Math.PI / 2;
  group.userData.containerBody = body;
  group.userData.containerHullMat = hullMat;
  group.userData.batchTile = true;
  return markOwned(group, { geometries: false, materials: false });
}

export function updateContainerDamage(factory, mesh, hp, maxHp = 8) {
  if (!mesh) return;
  if (mesh.userData?.containerColorKey && factory.tacticalModels?.ready) {
    const target = hp <= maxHp * 0.5 ? 'CONTAINER_DAMAGED' : mesh.userData.containerColorKey;
    if (mesh.userData.tacticalGlbKey !== target) {
      factory.tacticalModels.apply(mesh, target, { castShadow: true, receiveShadow: true });
    }
    return;
  }
  const body = mesh.userData?.containerBody;
  if (!body) return;
  const mats = ensureTacticalMaterials(factory);
  body.material = hp <= maxHp * 0.5 ? mats.containerDamaged : (mesh.userData.containerHullMat || mats.containerHulls[0]);
}

/** High-voltage electrical substation transformer (2 HP, EMP surge on destruction). */
export function createTransformerBlock(factory) {
  if (factory.useBlenderTactical && factory.tacticalModels?.ready) {
    const group = new THREE.Group();
    if (factory.tacticalModels.apply(group, 'TRANSFORMER_INTACT', { castShadow: true, receiveShadow: true })) {
      group.userData.batchTile = true;
      return markOwned(group, { geometries: false, materials: false });
    }
  }

  const mats = ensureTacticalMaterials(factory);
  const group = new THREE.Group();

  const pad = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 1.65, 0.12, 1.65),
    mats.concretePad
  );
  pad.position.y = 0.06;
  pad.receiveShadow = true;
  group.add(pad);

  const tank = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 1.05, 1.05, 0.92),
    mats.transformerBody
  );
  tank.position.y = 0.64;
  tank.castShadow = true;
  tank.receiveShadow = true;
  group.add(tank);

  // Cooling fins on left and right
  const finGeo = factory.sharedGeometry('BoxGeometry', 0.14, 0.82, 0.08);
  for (const side of [-0.58, 0.58]) {
    for (let i = -2; i <= 2; i++) {
      const fin = new THREE.Mesh(finGeo, mats.transformerFins);
      fin.position.set(side, 0.62, i * 0.16);
      group.add(fin);
    }
  }

  // Three ceramic high-voltage bushings on top
  const bushGeo = factory.sharedGeometry('CylinderGeometry', 0.09, 0.12, 0.42, 8);
  const capGeo = factory.sharedGeometry('CylinderGeometry', 0.04, 0.04, 0.14, 6);
  for (const bx of [-0.3, 0, 0.3]) {
    const bushing = new THREE.Mesh(bushGeo, mats.ceramic);
    bushing.position.set(bx, 1.37, 0);
    bushing.castShadow = true;
    group.add(bushing);

    const tip = new THREE.Mesh(capGeo, mats.copper);
    tip.position.set(bx, 1.62, 0);
    group.add(tip);
  }

  // High-voltage warning plate + glowing EMP indicator
  const warnPlate = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 0.45, 0.24, 0.05),
    mats.hazardYellow
  );
  warnPlate.position.set(0, 0.62, 0.47);
  group.add(warnPlate);

  const indicator = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 0.24, 0.12, 0.06),
    mats.empGlow
  );
  indicator.position.set(0, 0.94, 0.47);
  group.add(indicator);

  group.userData.transformerIndicator = indicator;
  group.userData.batchTile = true;
  return markOwned(group, { geometries: false, materials: false });
}

export function updateTransformerDamage(factory, mesh, hp) {
  if (!mesh) return;
  if (mesh.userData?.tacticalGlbKey && factory.tacticalModels?.ready) {
    const target = hp <= 1 ? 'TRANSFORMER_DAMAGED' : 'TRANSFORMER_INTACT';
    if (mesh.userData.tacticalGlbKey !== target) {
      factory.tacticalModels.apply(mesh, target, { castShadow: true, receiveShadow: true });
    }
    return;
  }
  const ind = mesh.userData?.transformerIndicator;
  if (!ind) return;
  const mats = ensureTacticalMaterials(factory);
  ind.material = hp <= 1 ? mats.empGlowWarn : mats.empGlow;
}

/** Low stacked sandbag parapet (3 HP, shells fly over, crushable by Dozer/F5/Boss). */
export function createSandbagsBlock(factory, neighborMask = 0) {
  const e = Boolean(neighborMask & 2);
  const w = Boolean(neighborMask & 8);
  const n = Boolean(neighborMask & 1);
  const s = Boolean(neighborMask & 4);
  const alongZ = (n || s) && !(e || w);

  if (factory.useBlenderTactical && factory.tacticalModels?.ready) {
    const group = new THREE.Group();
    if (factory.tacticalModels.apply(group, 'SANDBAGS_STRAIGHT', { castShadow: true, receiveShadow: true })) {
      if (alongZ) group.rotation.y = Math.PI / 2;
      group.userData.batchTile = true;
      return markOwned(group, { geometries: false, materials: false });
    }
  }

  const mats = ensureTacticalMaterials(factory);
  const group = new THREE.Group();
  const bagGeo = factory.sharedGeometry('BoxGeometry', 0.56, 0.2, 0.34);
  const stakeGeo = factory.sharedGeometry('CylinderGeometry', 0.04, 0.04, 0.68, 6);

  for (let row = 0; row < 3; row++) {
    const count = row === 2 ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 0.58;
      const bag = new THREE.Mesh(bagGeo, (row + i) % 2 === 0 ? mats.burlap : mats.burlapDark);
      bag.position.set(offset, 0.1 + row * 0.18, (row % 2 === 0 ? 0.04 : -0.04));
      bag.rotation.y = ((i + row) % 3 - 1) * 0.06;
      bag.castShadow = true;
      bag.receiveShadow = true;
      group.add(bag);
    }
  }

  for (const sx of [-0.72, 0.72]) {
    const stake = new THREE.Mesh(stakeGeo, mats.woodStake);
    stake.position.set(sx, 0.34, -0.2);
    group.add(stake);
  }

  if (alongZ) group.rotation.y = Math.PI / 2;
  group.userData.batchTile = true;
  return markOwned(group, { geometries: false, materials: false });
}

/** Armored freight rail car sitting on bogies (10 HP, closed boxcar or open gondola, 1 or 2 cells). */
export function createRailCarBlock(factory, orientation = 'ns', variant = 'closed', spanCells = 1) {
  const isOpen = variant === 'open';
  const isPair = spanCells >= 2;
  if (factory.useBlenderTactical && factory.tacticalModels?.ready) {
    const group = new THREE.Group();
    const key = isOpen ? 'RAIL_CAR_OPEN_INTACT' : 'RAIL_CAR_CLOSED_INTACT';
    if (factory.tacticalModels.apply(group, key, { castShadow: true, receiveShadow: true })) {
      if (!isPair) group.scale.z = 0.5;
      if (orientation === 'ew') group.rotation.y = Math.PI / 2;
      group.userData.railCarVariant = isOpen ? 'open' : 'closed';
      group.userData.batchTile = true;
      return markOwned(group, { geometries: false, materials: false });
    }
  }

  const mats = ensureTacticalMaterials(factory);
  const group = new THREE.Group();
  const lenZ = isPair ? 3.84 : 1.88;

  // Twin bogies / chassis frame (0.00 .. 0.46m)
  const underframe = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 1.32, 0.14, lenZ),
    mats.darkIron
  );
  underframe.position.y = 0.39;
  group.add(underframe);

  const wheelGeo = factory.sharedGeometry('CylinderGeometry', 0.15, 0.15, 1.15, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const axleOffsets = isPair ? [-1.35, -0.95, 0.95, 1.35] : [-0.62, 0.62];
  for (const wz of axleOffsets) {
    const axle = new THREE.Mesh(wheelGeo, mats.railSteel);
    axle.position.set(0, 0.16, wz);
    group.add(axle);
  }

  let body;
  if (isOpen) {
    body = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 1.36, 1.12, lenZ - 0.1),
      mats.darkIron
    );
    body.position.y = 1.02;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
  } else {
    body = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 1.36, 1.38, lenZ - 0.1),
      mats.railCarBody
    );
    body.position.y = 1.15;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const door = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 1.42, 1.18, isPair ? 1.12 : 0.64),
      mats.railCarDoor
    );
    door.position.y = 1.13;
    group.add(door);

    const roof = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 1.42, 0.14, lenZ - 0.04),
      mats.railCarRoof
    );
    roof.position.y = 1.91;
    roof.castShadow = true;
    group.add(roof);
  }

  if (orientation === 'ew') group.rotation.y = Math.PI / 2;
  group.userData.railCarBody = body;
  group.userData.railCarVariant = isOpen ? 'open' : 'closed';
  group.userData.batchTile = true;
  return markOwned(group, { geometries: false, materials: false });
}

export function updateRailCarDamage(factory, mesh, hp, maxHp = 10) {
  if (!mesh) return;
  if (mesh.userData?.tacticalGlbKey && factory.tacticalModels?.ready) {
    const isOpen = mesh.userData.railCarVariant === 'open';
    const target = hp <= maxHp * 0.5
      ? (isOpen ? 'RAIL_CAR_OPEN_DAMAGED' : 'RAIL_CAR_CLOSED_DAMAGED')
      : (isOpen ? 'RAIL_CAR_OPEN_INTACT' : 'RAIL_CAR_CLOSED_INTACT');
    if (mesh.userData.tacticalGlbKey !== target) {
      factory.tacticalModels.apply(mesh, target, { castShadow: true, receiveShadow: true });
    }
    return;
  }
  const body = mesh.userData?.railCarBody;
  if (!body) return;
  const mats = ensureTacticalMaterials(factory);
  body.material = hp <= maxHp * 0.5 ? mats.railCarDamaged : mats.railCarBody;
}

/** Heavy diesel-electric railway locomotive sitting on bogies (16 HP, 1 or 2 cells). */
export function createLocomotiveBlock(factory, orientation = 'ns', spanCells = 1) {
  const isPair = spanCells >= 2;
  if (factory.useBlenderTactical && factory.tacticalModels?.ready) {
    const group = new THREE.Group();
    if (factory.tacticalModels.apply(group, 'LOCOMOTIVE_INTACT', { castShadow: true, receiveShadow: true })) {
      if (!isPair) group.scale.z = 0.5;
      if (orientation === 'ew') group.rotation.y = Math.PI / 2;
      group.userData.batchTile = true;
      return markOwned(group, { geometries: false, materials: false });
    }
  }

  const mats = ensureTacticalMaterials(factory);
  const group = new THREE.Group();
  const lenZ = isPair ? 3.88 : 1.9;

  const underframe = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 1.38, 0.14, lenZ),
    mats.darkIron
  );
  underframe.position.y = 0.39;
  group.add(underframe);

  const body = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 1.44, 1.32, lenZ - 0.1),
    mats.darkIron
  );
  body.position.y = 1.12;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cab = new THREE.Mesh(
    factory.sharedGeometry('BoxGeometry', 1.46, 0.36, isPair ? 1.1 : 0.6),
    mats.transformerBody
  );
  cab.position.set(0, 1.86, isPair ? -1.1 : -0.5);
  cab.castShadow = true;
  group.add(cab);

  if (orientation === 'ew') group.rotation.y = Math.PI / 2;
  group.userData.locomotiveBody = body;
  group.userData.batchTile = true;
  return markOwned(group, { geometries: false, materials: false });
}

export function updateLocomotiveDamage(factory, mesh, hp, maxHp = 16) {
  if (!mesh) return;
  if (mesh.userData?.tacticalGlbKey && factory.tacticalModels?.ready) {
    const target = hp <= maxHp * 0.5 ? 'LOCOMOTIVE_DAMAGED' : 'LOCOMOTIVE_INTACT';
    if (mesh.userData.tacticalGlbKey !== target) {
      factory.tacticalModels.apply(mesh, target, { castShadow: true, receiveShadow: true });
    }
    return;
  }
  const body = mesh.userData?.locomotiveBody;
  if (!body) return;
  const mats = ensureTacticalMaterials(factory);
  body.material = hp <= maxHp * 0.5 ? mats.railCarDamaged : mats.darkIron;
}

/**
 * Small crushable 3D dressing props (`lamp`, `fence`, `car`, `shrub`, `barricade`).
 * No shadows, shared geometries/materials, destroyed on tank contact or blast.
 */
export function createCrushableProp(factory, kind, theme = 'urban', seed = 0) {
  const mats = ensureTacticalMaterials(factory);
  const group = new THREE.Group();

  if (kind === 'lamp') {
    const pole = new THREE.Mesh(
      factory.sharedGeometry('CylinderGeometry', 0.04, 0.055, 1.65, 6),
      mats.darkIron
    );
    pole.position.y = 0.825;
    group.add(pole);

    const arm = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 0.34, 0.04, 0.04),
      mats.darkIron
    );
    arm.position.set(0.15, 1.62, 0);
    group.add(arm);

    const head = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 0.18, 0.1, 0.14),
      mats.lampGlow
    );
    head.position.set(0.28, 1.57, 0);
    group.add(head);
  } else if (kind === 'fence') {
    const postGeo = factory.sharedGeometry('BoxGeometry', 0.09, 0.55, 0.09);
    for (const px of [-0.72, 0, 0.72]) {
      const post = new THREE.Mesh(postGeo, mats.fenceWood);
      post.position.set(px, 0.275, 0);
      group.add(post);
    }
    const railGeo = factory.sharedGeometry('BoxGeometry', 1.72, 0.07, 0.05);
    for (const ry of [0.22, 0.44]) {
      const rail = new THREE.Mesh(railGeo, mats.fenceWood);
      rail.position.set(0, ry, 0);
      group.add(rail);
    }
  } else if (kind === 'car') {
    const bodyMat = mats.carBodyColors[Math.abs(seed) % mats.carBodyColors.length];
    const chassis = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 0.84, 0.34, 1.56),
      bodyMat
    );
    chassis.position.y = 0.25;
    group.add(chassis);

    const cabin = new THREE.Mesh(
      factory.sharedGeometry('BoxGeometry', 0.72, 0.26, 0.82),
      mats.carGlass
    );
    cabin.position.set(0, 0.52, -0.08);
    group.add(cabin);

    const wheelGeo = factory.sharedGeometry('CylinderGeometry', 0.14, 0.14, 0.12, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-0.42, -0.46], [0.42, -0.46], [-0.42, 0.46], [0.42, 0.46]]) {
      const wheel = new THREE.Mesh(wheelGeo, mats.tireRubber);
      wheel.position.set(wx, 0.14, wz);
      group.add(wheel);
    }
  } else if (kind === 'shrub') {
    const isLavender = theme === 'lavender' || theme === 'provence';
    const shrubMat = isLavender
      ? mats.shrubLavender
      : theme === 'desert'
      ? mats.shrubDesert
      : theme === 'alpine'
      ? mats.shrubAlpine
      : mats.shrubGreen;
    if (isLavender) {
      const rowGeo = factory.sharedGeometry('BoxGeometry', 0.36, 0.28, 1.55);
      for (const rx of [-0.42, 0.42]) {
        const row = new THREE.Mesh(rowGeo, shrubMat);
        row.position.set(rx, 0.14, 0);
        group.add(row);
      }
    } else {
      const puffGeo = factory.sharedGeometry('DodecahedronGeometry', 0.34, 0);
      for (const [px, pz, s] of [[-0.28, -0.18, 0.9], [0.24, 0.2, 1.05], [0.02, -0.24, 0.78]]) {
        const puff = new THREE.Mesh(puffGeo, shrubMat);
        puff.position.set(px, 0.24 * s, pz);
        puff.scale.setScalar(s);
        group.add(puff);
      }
    }
  } else {
    // 'barricade'
    const footGeo = factory.sharedGeometry('BoxGeometry', 0.22, 0.14, 0.36);
    for (const fx of [-0.58, 0.58]) {
      const foot = new THREE.Mesh(footGeo, mats.concretePad);
      foot.position.set(fx, 0.07, 0);
      group.add(foot);
    }
    const plankGeo = factory.sharedGeometry('BoxGeometry', 0.48, 0.18, 0.1);
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(plankGeo, i % 2 === 0 ? mats.barricadeRed : mats.barricadeWhite);
      seg.position.set((i - 1) * 0.48, 0.38, 0);
      group.add(seg);
    }
  }

  return markOwned(group, { geometries: false, materials: false });
}
