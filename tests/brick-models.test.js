import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BrickModels } from '../public/src/game/terrains/brick-models.js';
import { ModelFactory } from '../public/src/game/render/models.js';
import { TileBatcher } from '../public/src/game/render/tile-batcher.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { engineerSupport } from '../public/src/game/abilities/engineer-support.js';
import { TileType } from '../public/src/game/types.js';
import { NodeIO } from '@gltf-transform/core';
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

test('Deployed BRICK asset includes all five states with one shared texture and material', async () => {
  const doc = await new NodeIO().read(fileURLToPath(new URL('../public/models/terrain/brick.glb', import.meta.url)));
  const root = doc.getRoot();
  assert.equal(root.listMaterials().length, 1);
  assert.equal(root.listTextures().length, 1);
  assert.equal(root.listMeshes().length, 5);
  assert.deepEqual(root.listNodes().map(node => node.getName()).sort(), [0, 1, 2, 3, 4].map(hp => `BRICK_HP_${hp}`));
  for (const mesh of root.listMeshes()) {
    assert.equal(mesh.listPrimitives().length, 1);
    assert.ok(mesh.listPrimitives()[0].getIndices().getCount() / 3 < 2400);
  }
});

test('Engineer repairs restore both brick HP and the intact model', () => {
  const { models, source, batcher } = fixture();
  const root = new THREE.Group(); root.userData.batchTile = true;
  models.apply(root, 1); source.add(root); batcher.sync();
  const cell = { type: TileType.BRICK, hp: 1, mesh: root };
  const grid = Array.from({ length: 5 }, () => []); grid[1][2] = cell;
  const factory = Object.assign(Object.create(ModelFactory.prototype), { brickModels: models, useBlenderBricks: true });
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    grid, enemies: [], modelFactory: factory, tileBatcher: batcher,
    worldToGrid: () => ({ row: 2, col: 2 }), gridToWorld: () => ({ x: 0, z: 0 }), spawnSparks() {},
  });
  engineerSupport.tryUse({ id: 1, x: 0, z: 0 }, engine); batcher.sync();
  assert.equal(cell.hp, 4);
  assert.equal(root.children[0].geometry, models.states.get(4));
  assert.equal([...batcher.batches.values()].reduce((sum, b) => sum + b.mesh.count, 0), 1);
  batcher.reset(); models.dispose();
});

test('Brick states share resources and batches replace damage geometry without retaining old instances', () => {
  const { models, source, batcher } = fixture();
  const roots = Array.from({ length: 40 }, (_, i) => {
    const root = new THREE.Group(); root.userData.batchTile = true; root.position.x = i;
    models.apply(root, 4); source.add(root); return root;
  });
  batcher.sync();
  assert.equal(batcher.batches.size, 1);
  assert.equal(roots[0].children[0].geometry, roots[1].children[0].geometry);
  for (let hp = 3; hp >= 0; hp--) {
    for (const root of roots) models.apply(root, hp);
    batcher.sync();
    assert.equal([...batcher.batches.values()].reduce((sum, b) => sum + b.mesh.count, 0), 40);
    assert.equal(roots[0].children[0].geometry, models.states.get(hp));
  }
  source.clear(); batcher.sync();
  assert.equal([...batcher.batches.values()].reduce((sum, b) => sum + b.mesh.count, 0), 0);
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
    const entry = batcher.records.get(root)[0];
    const actual = new THREE.Matrix4();
    entry.batch.mesh.getMatrixAt(entry.slot, actual);
    assert.deepEqual(actual.elements, root.children[0].matrixWorld.elements);
  }
  assert.equal([...batcher.batches.values()][0].mesh.count, 5);
  batcher.reset(); models.dispose();
});

test('Procedural fallback keeps HP damage and can upgrade in place after assets arrive', () => {
  const { models } = fixture();
  const damageMaterials = new Map([0, 1, 2, 3, 4].map(hp => [hp, [new THREE.MeshStandardMaterial()]]));
  const factory = Object.assign(Object.create(ModelFactory.prototype), {
    useBlenderBricks: false, brickModels: models, brickDamageMaterials: damageMaterials,
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
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    modelFactory: { useBlenderBricks: true, brickModels: models }, mapGroup: source,
    brickRubble: [], tileBatcher: batcher, blocksDestroyed: 0,
    gridToWorld: (row, col) => ({ x: col * 2, z: row * 2 }), fx: { blockDestroyed() {} },
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
