import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import fs from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LandmarkModels, landmarkBlockedCells } from '../public/src/game/terrains/landmarks.js';
import { normalizeMapDefinition } from '../public/src/game/levels.js';
import { TileType } from '../public/src/game/terrains/surfaces.js';

const GEOMETRY_KINDS = [
  // kind, footprint width, depth (world units), minimum height
  ['MICHAELERTRAKT', 14, 4, 9],
  ['BURGTOR', 14, 4, 6],
  ['HELDENPLATZ_STATUE', 2, 2, 3.5],
];

test('Vienna gates keep their north-south passages open', () => {
  const map = normalizeMapDefinition({
    gridSize: 40,
    surfaceLayout: Array(40).fill('.'.repeat(40)),
    objectLayout: Array(40).fill('.'.repeat(40)),
    landmarks3d: [
      { kind: 'MICHAELERTRAKT', row: 6, col: 16 },
      { kind: 'BURGTOR', row: 30, col: 15 },
      { kind: 'HELDENPLATZ_STATUE', row: 20, col: 19 },
    ],
  });
  for (const row of [6, 7]) {
    assert.equal(map.grid[row][19], TileType.EMPTY, `Michaelertor gate at row ${row}`);
    for (const col of [16, 17, 18, 20, 21, 22]) assert.equal(map.grid[row][col], TileType.LANDMARK);
  }
  for (const row of [30, 31]) {
    for (const col of [16, 18, 20]) assert.equal(map.grid[row][col], TileType.EMPTY, `Burgtor passage ${row},${col}`);
    for (const col of [15, 17, 19, 21]) assert.equal(map.grid[row][col], TileType.LANDMARK);
  }
  assert.equal(map.grid[20][19], TileType.LANDMARK);
});

test('Vienna mission 10 places every Vienna landmark on open, unclaimed cells', async () => {
  const json = JSON.parse(await fs.readFile(new URL('../public/maps/campaign/mission-10-vienna-hofburg.json', import.meta.url), 'utf8'));
  const kinds = json.landmarks3d.map((entry) => entry.kind).sort();
  assert.deepEqual(kinds, [
    'BURGTOR', 'HELDENPLATZ_STATUE', 'HELDENPLATZ_STATUE', 'HOFBURG_PALACE', 'MICHAELERTRAKT', 'ST_STEPHENS_CATHEDRAL',
  ]);
  const claimed = new Set();
  for (const entry of json.landmarks3d) {
    for (const { row, col } of landmarkBlockedCells(entry)) {
      const key = `${row},${col}`;
      assert.ok(!claimed.has(key), `${entry.kind} overlaps another landmark at ${key}`);
      claimed.add(key);
      assert.equal(json.objectLayout[row][col], '.', `${entry.kind} footprint cell ${key} is free of objects`);
    }
  }
});

test('Vienna fallbacks use the unified fallback model contained in their footprints', () => {
  const models = new LandmarkModels();
  for (const [kind, width, depth, minHeight] of GEOMETRY_KINDS) {
    const group = models.create(kind);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    assert.equal(group.userData.landmarkSource, 'fallback');
    assert.ok(group.children.length >= 1, 'Unified fallback creates meshes');
    assert.ok(size.y >= minHeight && bounds.min.y >= -0.01, `${kind} above ground`);
    assert.ok(size.x <= width + 0.01 && size.z <= depth + 0.01, `${kind} inside footprint`);
    assert.ok(Math.abs(bounds.min.x + bounds.max.x) < 0.1, `${kind} centred east/west`);
  }
  models.dispose();
});

test('Vienna GLB holds all five roots with valid vertex colors and meshes', async () => {
  const file = await fs.readFile(new URL('../public/models/landmarks/vienna_landmarks.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  assert.deepEqual(gltf.scene.children.map((node) => node.name).sort(), [
    'BURGTOR', 'HELDENPLATZ_STATUE', 'HOFBURG_PALACE', 'MICHAELERTRAKT', 'ST_STEPHENS_CATHEDRAL',
  ]);
  const models = new LandmarkModels();
  for (const [kind] of GEOMETRY_KINDS) {
    const root = gltf.scene.children.find((node) => node.name === kind);
    const fallback = models.create(kind);
    let geometryDisposed = false;
    fallback.children[0].geometry.addEventListener('dispose', () => { geometryDisposed = true; });
    models.templates.set(kind, root);
    models.populateFromTemplate(fallback, kind);
    assert.ok(geometryDisposed, 'Replacing a Vienna fallback releases its geometry');
    assert.equal(fallback.userData.landmarkSource, 'blender');
    let meshes = 0;
    fallback.traverse((node) => {
      if (!node.isMesh) return;
      meshes++;
      assert.ok(node.geometry.attributes.color && node.material.vertexColors);
      const triangles = (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      assert.ok(triangles > 100 && triangles < 18000, 'Scenery triangle budget');
    });
    assert.equal(meshes, 1);
  }
  models.dispose();
});
