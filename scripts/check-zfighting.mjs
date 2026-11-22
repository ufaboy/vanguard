#!/usr/bin/env node
/**
 * Z-fighting / coplanar geometry checker for BATTLE TANK terrain, buildings,
 * surfaces, bases, bridges, and landmarks (individual + pairwise combinations).
 *
 * Usage: node scripts/check-zfighting.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

// Minimal DOM/canvas stub so ModelFactory & texture-gen run in Node.js.
if (typeof globalThis.document === 'undefined') {
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });
  const ctx2d = () =>
    new Proxy(
      {
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        globalAlpha: 1,
        font: '12px sans-serif',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        createLinearGradient: grad,
        createRadialGradient: grad,
        createPattern: () => null,
        createImageData: (w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w || 1, height: h || 1 }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w || 1, height: h || 1 }),
        measureText: () => ({ width: 0 }),
      },
      {
        get(target, prop) {
          return prop in target ? target[prop] : noop;
        },
      }
    );
  globalThis.Path2D = class Path2D {};
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return { width: 128, height: 128, getContext: ctx2d };
      }
      return {};
    },
  };
}

const { ModelFactory } = await import('../public/src/game/render/models.js');
const { LandmarkModels } = await import('../public/src/game/terrains/landmarks.js');
const { TILE_SIZE } = await import('../public/src/game/constants.js');

const DIST_EPS = 0.004;
const AABB_EPS = 0.005;

function tri2dOverlap(p0, p1, p2, q0, q1, q2) {
  const ptsA = [p0, p1, p2];
  const ptsB = [q0, q1, q2];
  const testEdges = (poly, other) => {
    const area =
      (poly[1][0] - poly[0][0]) * (poly[2][1] - poly[0][1]) -
      (poly[1][1] - poly[0][1]) * (poly[2][0] - poly[0][0]);
    const sign = area >= 0 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % 3];
      const nx = (b[1] - a[1]) * sign;
      const ny = -(b[0] - a[0]) * sign;
      const len = Math.hypot(nx, ny);
      if (len < 1e-9) continue;
      const unx = nx / len;
      const uny = ny / len;
      const d = unx * a[0] + uny * a[1];
      let minOther = Infinity;
      for (const p of other) {
        const proj = unx * p[0] + uny * p[1] - d;
        if (proj < minOther) minOther = proj;
      }
      if (minOther >= -1e-4) return false;
    }
    return true;
  };
  return testEdges(ptsA, ptsB) && testEdges(ptsB, ptsA);
}

function project2d(v, normal) {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return [v.y, v.z];
  if (ay >= ax && ay >= az) return [v.x, v.z];
  return [v.x, v.y];
}

function collectThreeTris(root, tag = '') {
  root.updateMatrixWorld(true);
  const tris = [];
  root.traverse((node) => {
    if (!node.isMesh || !node.visible) return;
    const mat = Array.isArray(node.material) ? node.material[0] : node.material;
    if (!mat || mat.depthWrite === false) return;
    const doubleSided = mat.side === THREE.DoubleSide;
    const polyOffset = !!mat.polygonOffset;
    const geom = node.geometry;
    const pos = geom?.attributes?.position;
    if (!pos) return;
    const idx = geom.index;
    const count = idx ? idx.count : pos.count;
    const m = node.matrixWorld;
    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      const v0 = new THREE.Vector3().fromBufferAttribute(pos, i0).applyMatrix4(m);
      const v1 = new THREE.Vector3().fromBufferAttribute(pos, i1).applyMatrix4(m);
      const v2 = new THREE.Vector3().fromBufferAttribute(pos, i2).applyMatrix4(m);
      const normal = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
      if (normal.length() * 0.5 < 1e-8) continue;
      normal.normalize();
      const d = normal.dot(v0);
      const min = new THREE.Vector3().copy(v0).min(v1).min(v2);
      const max = new THREE.Vector3().copy(v0).max(v1).max(v2);
      tris.push({ v0, v1, v2, normal, d, min, max, doubleSided, polyOffset, tag });
    }
  });
  return tris;
}

function getGlbWorldMatrix(node, parentMat) {
  const m = new THREE.Matrix4();
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  m.compose(new THREE.Vector3(...t), new THREE.Quaternion(...r), new THREE.Vector3(...s));
  if (parentMat) m.premultiply(parentMat);
  return m;
}

function collectGlbTris(node, parentMat, tris, tag = '') {
  const m = getGlbWorldMatrix(node, parentMat);
  const mesh = node.getMesh();
  if (mesh) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const doubleSided = mat ? mat.getDoubleSided() : false;
      const posAcc = prim.getAttribute('POSITION');
      const idxAcc = prim.getIndices();
      if (!posAcc) continue;
      const count = idxAcc ? idxAcc.getCount() : posAcc.getCount();
      for (let i = 0; i < count; i += 3) {
        const i0 = idxAcc ? idxAcc.getScalar(i) : i;
        const i1 = idxAcc ? idxAcc.getScalar(i + 1) : i + 1;
        const i2 = idxAcc ? idxAcc.getScalar(i + 2) : i + 2;
        const v0 = new THREE.Vector3(...posAcc.getElement(i0, [])).applyMatrix4(m);
        const v1 = new THREE.Vector3(...posAcc.getElement(i1, [])).applyMatrix4(m);
        const v2 = new THREE.Vector3(...posAcc.getElement(i2, [])).applyMatrix4(m);
        const normal = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
        if (normal.length() * 0.5 < 1e-8) continue;
        normal.normalize();
        const d = normal.dot(v0);
        const min = new THREE.Vector3().copy(v0).min(v1).min(v2);
        const max = new THREE.Vector3().copy(v0).max(v1).max(v2);
        tris.push({ v0, v1, v2, normal, d, min, max, doubleSided, polyOffset: false, tag });
      }
    }
  }
  for (const ch of node.listChildren()) collectGlbTris(ch, m, tris, tag);
}

function countConflicts(trisA, trisB = null) {
  let sameDir = 0;
  let oppDir = 0;
  const selfCheck = trisB === null;
  const listB = selfCheck ? trisA : trisB;
  for (let i = 0; i < trisA.length; i++) {
    const a = trisA[i];
    const startJ = selfCheck ? i + 1 : 0;
    for (let j = startJ; j < listB.length; j++) {
      const b = listB[j];
      if (a.polyOffset || b.polyOffset) continue;
      if (a.max.x + AABB_EPS < b.min.x || b.max.x + AABB_EPS < a.min.x) continue;
      if (a.max.y + AABB_EPS < b.min.y || b.max.y + AABB_EPS < a.min.y) continue;
      if (a.max.z + AABB_EPS < b.min.z || b.max.z + AABB_EPS < a.min.z) continue;
      const dot = a.normal.dot(b.normal);
      const isSame = dot > 0.999;
      const isOpp = dot < -0.999 && (a.doubleSided || b.doubleSided);
      if (!isSame && !isOpp) continue;
      const dist = isSame ? Math.abs(a.d - b.d) : Math.abs(a.d + b.d);
      if (dist >= DIST_EPS) continue;
      const p0 = project2d(a.v0, a.normal);
      const p1 = project2d(a.v1, a.normal);
      const p2 = project2d(a.v2, a.normal);
      const q0 = project2d(b.v0, a.normal);
      const q1 = project2d(b.v1, a.normal);
      const q2 = project2d(b.v2, a.normal);
      if (tri2dOverlap(p0, p1, p2, q0, q1, q2)) {
        if (isSame) sameDir++;
        else oppDir++;
      }
    }
  }
  return { sameDir, oppDir, total: sameDir + oppDir };
}

let issues = 0;
const report = (category, name, res) => {
  if (res.total > 0) {
    issues++;
    console.log(`[FAIL] ${category.padEnd(14)} ${name.padEnd(36)} same=${res.sameDir} opp=${res.oppDir}`);
  } else {
    console.log(`[ OK ] ${category.padEnd(14)} ${name}`);
  }
};

// 1. Check GLB terrain & landmark assets
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

const glbDirs = ['public/models/terrain', 'public/models/landmarks'];
const terrainGlbTris = new Map();
for (const dir of glbDirs) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.glb')).sort();
  for (const file of files) {
    const doc = await io.read(path.join(dir, file));
    for (const child of doc.getRoot().listScenes()[0].listChildren()) {
      const tris = [];
      collectGlbTris(child, null, tris, child.getName());
      const res = countConflicts(tris);
      const label = `${file}:${child.getName()}`;
      if (dir.endsWith('terrain')) terrainGlbTris.set(label, tris);
      report('GLB', label, res);
    }
  }
}

// 2. Check procedural ModelFactory & LandmarkModels elements
const mockRenderer = { capabilities: { getMaxAnisotropy: () => 4 }, extensions: { has: () => false } };
const factory = new ModelFactory(mockRenderer, false, null);
const lmModels = new LandmarkModels(mockRenderer);

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(TILE_SIZE * 4, TILE_SIZE * 4).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial()
);
const groundTris = collectThreeTris(groundMesh, 'ground');

const surfaces = new Map();
const addSurface = (name, meshOrNull) => {
  if (!meshOrNull) return;
  surfaces.set(name, collectThreeTris(meshOrNull, name));
  report('surface', name, countConflicts(surfaces.get(name)));
};

addSurface('GROUND', groundMesh);
if (factory.createRoadBlock) {
  addSurface('ROAD_0', factory.createRoadBlock(0, 0, 0, 0));
  addSurface('ROAD_5_NS', factory.createRoadBlock(0, 0, 5, 0));
  addSurface('ROAD_15_CROSS', factory.createRoadBlock(0, 0, 15, 0));
  addSurface('ROAD_15_DBL', factory.createRoadBlock(0, 0, 7, 2));
}
if (factory.createSandBlock) addSurface('SAND', factory.createSandBlock(0, 0));
if (factory.createGrassBlock) addSurface('GRASS', factory.createGrassBlock(0, 0));
if (factory.createStoneBlock) addSurface('STONE', factory.createStoneBlock(0, 0));
if (factory.createSwampBlock) addSurface('SWAMP', factory.createSwampBlock(0, 0));
if (factory.createOilSlickBlock) addSurface('OIL_SLICK', factory.createOilSlickBlock(0, 0));

const objects = new Map();
const addObject = (name, meshOrNull) => {
  if (!meshOrNull) return;
  const tris = collectThreeTris(meshOrNull, name);
  objects.set(name, tris);
  report('object', name, countConflicts(tris));
};

addObject('HQ_COMMAND_BASE', factory.createCommandBaseBlock());
addObject('ENEMY_BASE', factory.createEnemyBaseBlock());
addObject('BRICK_PROC', factory.createBrickBlock().group);
addObject('CONCRETE_PROC', factory.createConcreteBlock());
addObject('FOREST', factory.createForestBlock());
addObject('BOXES', factory.createBoxesBlock());
addObject('BARREL', factory.createBarrelBlock());
addObject('RUBBLE', factory.createRubbleBlock());
addObject('BRIDGE_3x2', lmModels.createBridge(3, 2));

// 3. Pairwise combinations: surface + ground, surface + object, adjacent surfaces
console.log('\n--- Checking pairwise combinations ---');
for (const [sName, sTris] of surfaces) {
  if (sName === 'GROUND') continue;
  report('combo:ground', `GROUND + ${sName}`, countConflicts(groundTris, sTris));
}

for (const [sName, sTris] of surfaces) {
  for (const [oName, oTris] of objects) {
    report('combo:cell', `${sName} + ${oName}`, countConflicts(sTris, oTris));
  }
}

// Adjacent surface tiles (e.g. (0, 0) vs (TILE_SIZE, 0))
const offsetTris = (tris, dx, dz) =>
  tris.map((t) => {
    const v0 = t.v0.clone().add(new THREE.Vector3(dx, 0, dz));
    const v1 = t.v1.clone().add(new THREE.Vector3(dx, 0, dz));
    const v2 = t.v2.clone().add(new THREE.Vector3(dx, 0, dz));
    return {
      ...t,
      v0,
      v1,
      v2,
      d: t.normal.dot(v0),
      min: new THREE.Vector3().copy(v0).min(v1).min(v2),
      max: new THREE.Vector3().copy(v0).max(v1).max(v2),
    };
  });

const surfaceEntries = [...surfaces.entries()].filter(([n]) => n !== 'GROUND');
for (let i = 0; i < surfaceEntries.length; i++) {
  for (let j = i; j < surfaceEntries.length; j++) {
    const [nA, tA] = surfaceEntries[i];
    const [nB, tB] = surfaceEntries[j];
    const res = countConflicts(tA, offsetTris(tB, TILE_SIZE, 0));
    if (res.total > 0) report('combo:adj', `${nA} | ${nB}`, res);
  }
}

// Also check terrain GLBs against GROUND & surfaces
for (const [label, gTris] of terrainGlbTris) {
  const resG = countConflicts(groundTris, gTris);
  if (resG.total > 0) report('combo:ground', `GROUND + ${label}`, resG);
}

factory.dispose();
lmModels.dispose();

console.log(`\nSummary: ${issues} item(s)/combination(s) with potential z-fighting.`);
process.exit(issues > 0 ? 1 : 0);
