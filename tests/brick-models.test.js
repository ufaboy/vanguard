import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BrickModels } from '../public/src/game/terrains/brick-models.js';
import { breachEntryOffset, breachPointToward, breachYaw, nextBreach } from '../public/src/game/terrains/breach-models.js';
import { ModelFactory } from '../public/src/game/render/models.js';
import { TileBatcher } from '../public/src/game/render/tile-batcher.js';
import { TerrainDestructionController } from '../public/src/game/engine/terrain-destruction.js';
import { ENGINEER_SUPPORT, engineerSupport } from '../public/src/game/abilities/engineer-support.js';
import { TileType } from '../public/src/game/types.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { fileURLToPath } from 'node:url';

function fixture() {
  const models = new BrickModels();
  models.material = new THREE.MeshStandardMaterial();
  for (let hp = 0; hp <= 4; hp++) models.states.set(hp, new THREE.BoxGeometry(1, hp + 1, 1));
  models.prepareMaterials();
  const source = new THREE.Group();
  const batcher = new TileBatcher(source);
  return { models, source, batcher };
}

test('Deployed BRICK asset includes every damage state with one shared texture and material', async () => {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const doc = await io.read(fileURLToPath(new URL('../public/models/terrain/brick.glb', import.meta.url)));
  const root = doc.getRoot();
  assert.equal(root.listMaterials().length, 1);
  assert.equal(root.listTextures().length, 1);
  const names = [0, 1, 2, 3, 4].map(hp => `BRICK_HP_${hp}`)
    .concat(['C_HP_1', 'C_HP_2', 'C_HP_3', 'L_HP_1', 'L_HP_2', 'O_HP_1', 'O_HP_2'].map(name => `BRICK_${name}`));
  assert.equal(root.listMeshes().length, names.length);
  assert.deepEqual(root.listNodes().map(node => node.getName()).sort(), names.sort());
  for (const mesh of root.listMeshes()) {
    assert.equal(mesh.listPrimitives().length, 1);
    assert.ok(mesh.listPrimitives()[0].getIndices().getCount() / 3 < 2400);
  }
});

function createDestructionHost({ factory, source, batcher, grid = [], gridToWorld = () => ({ x: 10, z: 20 }) }) {
  const host = {
    grid,
    enemies: [],
    modelFactory: factory,
    mapGroup: source,
    tileBatcher: batcher,
    brickRubble: [],
    blocksDestroyed: 0,
    gridToWorld,
    worldToGrid: () => ({ row: 2, col: 2 }),
    spawnSparks() {},
    fx: { masonryHit() {}, blockDestroyed() {} },
  };
  const destruction = new TerrainDestructionController(host);
  host.damageTileCell = (...args) => destruction.damageTileCell(...args);
  host.destroyTileCell = (cell) => destruction.destroyTileCell(cell);
  host.updateBrickRubble = (dt) => destruction.updateBrickRubble(dt);
  return host;
}

test('Engineer repairs restore both brick HP and the intact model', () => {
  const { models, source, batcher } = fixture();
  const root = new THREE.Group(); root.userData.batchTile = true;
  models.apply(root, 1); source.add(root); batcher.sync();
  const cell = { type: TileType.BRICK, hp: 1, mesh: root };
  const grid = Array.from({ length: 5 }, () => []); grid[1][2] = cell;
  const factory = new ModelFactory(null, false, null, { headless: true, brickModels: models, useBlenderBricks: true });
  const engine = createDestructionHost({ factory, source, batcher, grid, gridToWorld: () => ({ x: 0, z: 0 }) });
  engineerSupport.tryUse({ id: 1, x: 0, z: 0 }, engine); batcher.sync();
  assert.equal(cell.hp, ENGINEER_SUPPORT.BRICK_HP);
  assert.equal(root.children[0].geometry, models.states.get(Math.min(4, ENGINEER_SUPPORT.BRICK_HP)));
  assert.equal(batcher.getInstanceCount(), 1);
  batcher.reset(); models.dispose();
});

test('Brick states share resources and batches replace damage geometry without retaining old instances', () => {
  const { models, source, batcher } = fixture();
  const roots = Array.from({ length: 40 }, (_, i) => {
    const root = new THREE.Group(); root.userData.batchTile = true; root.position.x = i;
    models.apply(root, 4); source.add(root); return root;
  });
  batcher.sync();
  assert.equal(batcher.getBatchCount(), 1);
  assert.equal(roots[0].children[0].geometry, roots[1].children[0].geometry);
  for (let hp = 3; hp >= 0; hp--) {
    for (const root of roots) models.apply(root, hp);
    batcher.sync();
    assert.equal(batcher.getInstanceCount(), 40);
    assert.equal(roots[0].children[0].geometry, models.states.get(hp));
  }
  source.clear(); batcher.sync();
  assert.equal(batcher.getInstanceCount(), 0);
  batcher.reset(); models.dispose();
});

test('Dense batch removal preserves transforms and later updates of moved entries', () => {
  const { models, source, batcher } = fixture();
  const roots = Array.from({ length: 8 }, (_, i) => {
    const root = new THREE.Group(); root.userData.batchTile = true; root.position.x = i * 3;
    models.apply(root, 4); source.add(root); return root;
  });
  batcher.sync();
  source.remove(roots[1], roots[4], roots[6]); batcher.sync();
  roots[7].position.z = 12; batcher.markDirty(roots[7]); batcher.sync();
  for (const root of source.children) {
    const actual = batcher.getInstanceMatrix(root);
    assert.deepEqual(actual.elements, root.children[0].matrixWorld.elements);
  }
  assert.equal(batcher.getInstanceCount(), 5);
  batcher.reset(); models.dispose();
});

test('Procedural fallback keeps HP damage and can upgrade in place after assets arrive', () => {
  const { models } = fixture();
  const damageMaterials = new Map([0, 1, 2, 3, 4].map(hp => [hp, [new THREE.MeshStandardMaterial()]]));
  const factory = new ModelFactory(null, false, null, {
    headless: true,
    useBlenderBricks: false,
    brickModels: models,
    brickDamageMaterials: damageMaterials,
  });
  const group = new THREE.Group();
  for (let i = 0; i < 4; i++) group.add(new THREE.Object3D());
  factory.updateBrickBlockDamage(group, 2);
  assert.equal(group.children.filter(child => child.visible).length, 2);
  assert.ok(group.children.every(child => child.material === damageMaterials.get(2)), 'damage-state finish applied');
  factory.useBlenderBricks = true;
  factory.updateBrickBlockDamage(group, group.userData.brickHp);
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].geometry, models.states.get(2));
  assert.equal(group.children[0].material, models.materials.get(2));
  models.dispose();
});

test('Destroyed brick rubble is nonblocking, capped, expires, and uses shared geometry', () => {
  const { models, source, batcher } = fixture();
  const factory = new ModelFactory(null, false, null, { headless: true, useBlenderBricks: true, brickModels: models });
  const engine = createDestructionHost({
    factory,
    source,
    batcher,
    gridToWorld: (row, col) => ({ x: col * 2, z: row * 2 }),
  });
  for (let i = 0; i < 45; i++) {
    const cell = { row: 0, col: i, type: TileType.BRICK, hp: 1 };
    engine.destroyTileCell(cell);
    assert.equal(cell.type, TileType.EMPTY);
    assert.equal(cell.hp, 0);
  }
  assert.equal(engine.brickRubble.length, 32);
  assert.equal(source.children.length, 32);
  engine.updateBrickRubble(13); batcher.sync();
  assert.equal(source.children.length, 0);
  assert.equal(engine.brickRubble.length, 0);
  batcher.reset(); models.dispose();
});

test('Breach follows the shells: face, corner, two adjacent faces, two opposite faces', () => {
  // A shell first seen 0.6 inside the -X face, slightly nearer the +Z edge, entered through -X.
  assert.deepEqual(breachEntryOffset(-0.4, 0.7, 10, 0), { dx: -1, dz: 0.7 });
  assert.deepEqual(breachEntryOffset(0.2, 0.5, 0, -8), { dx: 0.2, dz: 1 });
  assert.deepEqual(breachEntryOffset(0.3, 0.3, 0, 0), { dx: 0.3, dz: 0.3 });

  const face = nextBreach(null, -1, 0.2, 3);
  assert.deepEqual(face, { variant: 'F', turn: 3 });
  assert.equal(breachYaw(face), -Math.PI / 2);
  assert.deepEqual(nextBreach(face, -1, -0.9, 2), face, 'same face again keeps the breach');
  const pending = nextBreach(face, 0.1, 1, 3);
  assert.deepEqual(pending, { variant: 'F', turn: 3, other: 0 }, 'no two-face model above state 2: the face is remembered');
  assert.deepEqual(nextBreach(pending, -1, 0, 2), { variant: 'L', turn: 3 }, 'and used once the state allows it');
  assert.deepEqual(nextBreach(pending, 0, 0, 2), { variant: 'L', turn: 3 }, 'even by a centred hit');
  assert.deepEqual(breachPointToward(10, 20, 14, 20.5), { x: 11, z: 20.125 }, 'a blast to the +X side');
  assert.deepEqual(breachPointToward(10, 20, 8, 22), { x: 9, z: 21 }, 'a diagonal blast hits the corner');
  assert.deepEqual(breachPointToward(10, 20, 10, 20), { x: 10, z: 20 });
  assert.deepEqual(nextBreach(face, 0.1, 1, 2), { variant: 'L', turn: 3 }, '-X then +Z');
  assert.deepEqual(nextBreach(face, 0.1, -1, 2), { variant: 'L', turn: 2 }, '-X then -Z');
  assert.deepEqual(nextBreach(face, 1, 0, 1), { variant: 'O', turn: 1 }, '-X then +X');
  assert.deepEqual(nextBreach({ variant: 'L', turn: 2 }, 1, 0, 1), { variant: 'L', turn: 2 });

  assert.deepEqual(nextBreach(null, 1, 0.8, 3), { variant: 'C', turn: 0 }, '+X/+Z corner');
  assert.deepEqual(nextBreach(null, 0.8, -1, 3), { variant: 'C', turn: 1 }, '+X/-Z corner');
  assert.deepEqual(nextBreach(null, -1, -0.8, 3), { variant: 'C', turn: 2 }, '-X/-Z corner');
  assert.deepEqual(nextBreach(null, -0.8, 1, 3), { variant: 'C', turn: 3 }, '-X/+Z corner');
  assert.deepEqual(nextBreach(null, 0, 0, 3), { variant: 'F', turn: 0 }, 'a centred hit has no side');
});

test('Hits from two sides switch a brick tile to its two-face model and repairs reset it', () => {
  const { models, source, batcher } = fixture();
  for (const key of ['C3', 'C2', 'C1', 'L2', 'L1', 'O2', 'O1']) models.variants.set(key, new THREE.BoxGeometry(2, 1, 2));
  const root = new THREE.Group(); root.userData.batchTile = true; root.position.set(10, 0, 20);
  models.apply(root, 4); source.add(root); batcher.sync();
  const cell = { row: 3, col: 5, type: TileType.BRICK, hp: 4, mesh: root };
  const factory = new ModelFactory(null, false, null, { headless: true, brickModels: models, useBlenderBricks: true });
  const engine = createDestructionHost({ factory, source, batcher });
  engine.damageTileCell(cell, 1, 9, 20.3); batcher.sync();
  assert.equal(root.rotation.y, -Math.PI / 2, 'hit from -X opens the -X face');
  assert.equal(root.children[0].geometry, models.states.get(3));
  const actual = batcher.getInstanceMatrix(root);
  assert.deepEqual(actual.elements, root.children[0].matrixWorld.elements);

  engine.damageTileCell(cell, 1, 10.1, 21); batcher.sync();
  assert.equal(root.children[0].geometry, models.variants.get('L2'), 'second hit from +Z');
  assert.equal(root.rotation.y, -Math.PI / 2);
  assert.equal(batcher.getInstanceCount(), 1);

  factory.updateBrickBlockDamage(root, 4);
  assert.equal(root.children[0].geometry, models.states.get(4));
  cell.hp = 4;
  engine.damageTileCell(cell, 1, 11, 20.8);
  assert.equal(root.children[0].geometry, models.variants.get('C3'), 'a repaired wall starts a new breach');
  assert.equal(root.rotation.y, 0);

  engine.damageTileCell(cell, 3, 10, 20);
  assert.equal(engine.brickRubble[0].mesh.rotation.y, 0, 'rubble lies on the breached side');
  batcher.reset(); models.dispose();
});
