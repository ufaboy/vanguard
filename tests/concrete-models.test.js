import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ConcreteModels, concreteDamageState } from '../public/src/game/terrains/concrete-models.js';
import { ModelFactory } from '../public/src/game/render/models.js';
import { TileBatcher } from '../public/src/game/render/tile-batcher.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { TileType } from '../public/src/game/types.js';
import { NodeIO } from '@gltf-transform/core';
import { fileURLToPath } from 'node:url';

const VARIANT_KEYS = ['C3', 'C2', 'C1', 'L2', 'L1', 'O2', 'O1'];

function fixture() {
  const models = new ConcreteModels();
  models.material = new THREE.MeshStandardMaterial();
  for (let state = 0; state <= 4; state++) models.states.set(state, new THREE.BoxGeometry(1, state + 1, 1));
  for (const key of VARIANT_KEYS) models.variants.set(key, new THREE.BoxGeometry(2, 1, 2));
  models.prepareMaterials();
  const source = new THREE.Group();
  const batcher = new TileBatcher(source);
  const factory = Object.assign(Object.create(ModelFactory.prototype), { concreteModels: models, useBlenderConcrete: true });
  const engine = Object.assign(Object.create(TankGameEngine.prototype), {
    modelFactory: factory, mapGroup: source, tileBatcher: batcher, brickRubble: [], blocksDestroyed: 0,
    gridToWorld: () => ({ x: 10, z: 20 }), fx: { masonryHit() {}, blockDestroyed() {} },
  });
  const root = factory.createConcreteBlock();
  root.position.set(10, 0, 20);
  source.add(root);
  batcher.sync();
  const cell = { row: 3, col: 5, type: TileType.CONCRETE, hp: 16, maxHp: 16, mesh: root };
  return { models, source, batcher, factory, engine, root, cell };
}

const instances = batcher => [...batcher.batches.values()].reduce((sum, b) => sum + b.mesh.count, 0);

test('Deployed CONCRETE asset includes every damage state with one shared texture and material', async () => {
  const doc = await new NodeIO().read(fileURLToPath(new URL('../public/models/terrain/concrete.glb', import.meta.url)));
  const root = doc.getRoot();
  assert.equal(root.listMaterials().length, 1);
  assert.equal(root.listTextures().length, 1);
  const names = [0, 1, 2, 3, 4].map(state => `CONCRETE_HP_${state}`)
    .concat(VARIANT_KEYS.map(key => `CONCRETE_${key[0]}_HP_${key[1]}`));
  assert.deepEqual(root.listNodes().map(node => node.getName()).sort(), names.sort());
  for (const mesh of root.listMeshes()) {
    assert.equal(mesh.listPrimitives().length, 1);
    assert.ok(mesh.listPrimitives()[0].getIndices().getCount() / 3 < 1600);
  }
});

test('Concrete HP maps to model states: chipped by the first hit, then equal thirds', () => {
  assert.equal(concreteDamageState(16), 4);
  assert.equal(concreteDamageState(15), 3);
  assert.equal(concreteDamageState(11), 3);
  assert.equal(concreteDamageState(10.6), 2);
  assert.equal(concreteDamageState(6), 2);
  assert.equal(concreteDamageState(5), 1);
  assert.equal(concreteDamageState(0.35), 1);
  assert.equal(concreteDamageState(0), 0);
  assert.equal(concreteDamageState(40, 40), 4);
  assert.equal(concreteDamageState(39, 40), 3);
});

test('Concrete breaks open toward the hits, darkens per hit and stays in one batch', () => {
  const { models, batcher, engine, root, cell } = fixture();
  assert.equal(root.children[0].geometry, models.states.get(4));
  assert.equal(root.children[0].material, models.material);

  engine.damageTileCell(cell, 1, 11, 20.2); batcher.sync();
  assert.equal(root.rotation.y, Math.PI / 2, 'hit from +X opens the +X face');
  assert.equal(root.children[0].geometry, models.states.get(3));
  const tinted = root.children[0].material;
  assert.notEqual(tinted, models.material, 'a damaged block owns its tint');
  const first = tinted.color.r;

  engine.damageTileCell(cell, 1, 10.1, 19); batcher.sync();
  assert.equal(root.children[0].geometry, models.states.get(3), 'still the one-face model above state 2');
  assert.equal(root.children[0].material, tinted);
  assert.ok(tinted.color.r < first, 'each hit darkens the block');

  engine.damageTileCell(cell, 4, 11, 20); batcher.sync();
  assert.equal(root.children[0].geometry, models.variants.get('L2'), 'the earlier -Z hit now shows');
  assert.equal(root.rotation.y, Math.PI / 2, 'faces +X and -Z');
  assert.equal(instances(batcher), 1);

  const before = batcher.batches.size;
  const second = engine.modelFactory.createConcreteBlock();
  root.parent.add(second);
  engine.damageTileCell({ ...cell, hp: 16, mesh: second }, 6, 10.1, 21);
  engine.damageTileCell({ ...cell, hp: 10, mesh: second }, 1, 11, 20); batcher.sync();
  assert.equal(second.children[0].geometry, models.variants.get('L2'));
  assert.notEqual(second.children[0].material, tinted);
  assert.equal(batcher.batches.size, before, 'differently tinted blocks share one instanced batch');
  assert.equal(instances(batcher), 2);
  batcher.reset(); models.dispose();
});

test('A blast breaches the corner it came from and destroyed concrete leaves rubble there', () => {
  const { models, source, batcher, engine, root, cell } = fixture();
  engine.damageTileCell(cell, 6, 9, 21); batcher.sync();
  assert.equal(root.children[0].geometry, models.variants.get('C2'));
  assert.equal(root.rotation.y, -Math.PI / 2, '-X/+Z corner');
  engine.damageTileCell(cell, 12, 10, 20); batcher.sync();
  assert.equal(cell.type, TileType.EMPTY);
  assert.equal(engine.brickRubble.length, 1);
  const rubble = engine.brickRubble[0].mesh;
  assert.equal(rubble.children[0].geometry, models.states.get(0));
  assert.equal(rubble.rotation.y, -Math.PI / 2);
  assert.deepEqual(source.children, [rubble]);
  engine.updateBrickRubble(13); batcher.sync();
  assert.equal(source.children.length, 0);
  assert.equal(instances(batcher), 0);
  batcher.reset(); models.dispose();
});

test('Procedural concrete keeps working and upgrades in place once the models arrive', () => {
  const models = new ConcreteModels();
  const mat = () => new THREE.MeshStandardMaterial();
  const factory = Object.assign(Object.create(ModelFactory.prototype), {
    concreteModels: models, useBlenderConcrete: true,
    concreteMats: { side: mat(), top: mat(), cap: mat(), rebar: mat(), rustRebar: mat(), fracture: mat() },
  });
  const block = factory.createConcreteBlock();
  assert.ok(block.userData.slabMesh, 'procedural until the GLB is loaded');
  factory.updateConcreteBlockDamage(block, 8, 16, { dx: 0, dz: 1 });
  assert.equal(block.userData.rebarGroup.visible, true);

  models.material = mat();
  for (let state = 0; state <= 4; state++) models.states.set(state, new THREE.BoxGeometry(1, state + 1, 1));
  models.prepareMaterials();
  factory.updateConcreteBlockDamage(block, block.userData.concreteHp, block.userData.concreteMaxHp);
  assert.equal(block.children.length, 1);
  assert.equal(block.children[0].geometry, models.states.get(2));
  assert.equal(block.userData.slabMesh, null);
  models.dispose();
});
