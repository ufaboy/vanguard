import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import fs from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LandmarkModels, landmarkBlockedCells } from '../public/src/game/terrains/landmarks.js';
import { normalizeMapDefinition } from '../public/src/game/levels.js';
import { TileType } from '../public/src/game/terrains/surfaces.js';

test('Rome map loading preserves the arena and three Constantine arch passages', () => {
  const map = normalizeMapDefinition({
    gridSize: 40,
    surfaceLayout: Array(40).fill('.'.repeat(40)),
    objectLayout: Array(40).fill('.'.repeat(40)),
    landmarks3d: [
      { kind: 'COLOSSEUM', row: 10, col: 20 },
      { kind: 'ARCH_OF_CONSTANTINE', row: 22, col: 20 },
      { kind: 'FORUM_COLUMNS', row: 8, col: 5 },
    ],
  });
  for (let row = 10; row < 18; row++) {
    assert.equal(map.grid[row][24], TileType.EMPTY, `Arena access at row ${row}`);
    assert.equal(map.grid[row][25], TileType.EMPTY, `Wide arena access at row ${row}`);
  }
  assert.equal(map.grid[13][20], TileType.LANDMARK);
  for (const row of [22, 23]) {
    for (const col of [21, 23, 25]) assert.equal(map.grid[row][col], TileType.EMPTY);
    for (const col of [20, 22, 24, 26]) assert.equal(map.grid[row][col], TileType.LANDMARK);
  }
  assert.equal(map.grid[8][5], TileType.LANDMARK);
});

test('Roman fallbacks use the unified fallback model contained in their footprints', () => {
  const models = new LandmarkModels();
  for (const [kind, width, depth, minHeight] of [
    ['COLOSSEUM', 20, 16, 6], ['ARCH_OF_CONSTANTINE', 14, 4, 6], ['FORUM_COLUMNS', 6, 2, 3],
  ]) {
    const group = models.create(kind);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    assert.equal(group.userData.landmarkSource, 'fallback');
    assert.ok(group.children.length >= 1, 'Unified fallback creates meshes');
    assert.ok(size.y >= minHeight && bounds.min.y >= -0.01, `${kind} above ground`);
    assert.ok(size.x <= width + 0.01 && size.z <= depth + 0.01, `${kind} inside footprint`);
    assert.ok(Math.abs(bounds.min.x + bounds.max.x) < 0.1, 'Centered east/west');
    assert.ok(landmarkBlockedCells({ kind, row: 0, col: 0 }).length > 0);
  }
  models.dispose();
});

test('Rome GLB roots have valid bounds, vertex colors and a single mesh per monument', async () => {
  const file = await fs.readFile(new URL('../public/models/landmarks/rome_landmarks.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  assert.deepEqual(gltf.scene.children.map(node => node.name).sort(), ['ARCH_OF_CONSTANTINE', 'COLOSSEUM', 'FORUM_COLUMNS']);
  const models = new LandmarkModels();
  for (const root of gltf.scene.children) {
    const fallback = models.create(root.name);
    let geometryDisposed = false;
    fallback.children[0].geometry.addEventListener('dispose', () => { geometryDisposed = true; });
    models.templates.set(root.name, root);
    models.populateFromTemplate(fallback, root.name);
    assert.ok(geometryDisposed, 'Replacing a Rome fallback releases its GPU geometry');
    assert.equal(fallback.userData.landmarkSource, 'blender');
    let meshes = 0;
    fallback.traverse(node => {
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
