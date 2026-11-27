import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeStaticMeshes } from '../public/src/game/render/static-merge.js';

const triangles = (group) => {
  let count = 0;
  group.traverse((node) => {
    if (node.isMesh) count += (node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count) / 3;
  });
  return count;
};

const meshes = (group) => {
  const list = [];
  group.traverse((node) => node.isMesh && list.push(node));
  return list;
};

function buildFixture(sharedGeo) {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial();
  const metal = new THREE.MeshStandardMaterial();
  const nested = new THREE.Group();
  nested.position.set(3, 0, -2);
  nested.rotation.y = 0.7;
  group.add(nested);
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(sharedGeo, i % 2 ? stone : metal);
    mesh.position.set(i, i * 0.5, 0);
    mesh.castShadow = true;
    (i < 2 ? group : nested).add(mesh);
  }
  const noShadow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 6), stone);
  noShadow.castShadow = false;
  group.add(noShadow);
  return { group, stone, metal };
}

test('mergeStaticMeshes keeps triangles and bounds while drawing one mesh per material and shadow flags', () => {
  const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
  const { group, stone, metal } = buildFixture(sharedGeo);
  const trianglesBefore = triangles(group);
  const boundsBefore = new THREE.Box3().setFromObject(group);

  mergeStaticMeshes(group);

  const after = meshes(group);
  assert.equal(triangles(group), trianglesBefore);
  const boundsAfter = new THREE.Box3().setFromObject(group);
  assert.ok(boundsAfter.min.distanceTo(boundsBefore.min) < 1e-5);
  assert.ok(boundsAfter.max.distanceTo(boundsBefore.max) < 1e-5);
  // Two shadow-casting buckets (stone, metal) merged; the lone non-casting stone mesh stays as is
  assert.equal(after.length, 3);
  assert.equal(after.filter((m) => m.material === stone && m.castShadow).length, 1);
  assert.equal(after.filter((m) => m.material === metal && m.castShadow).length, 1);
  for (const mesh of after.filter((m) => m.castShadow)) assert.equal(mesh.geometry.userData.owned, true);
});

test('mergeStaticMeshes leaves shared source geometries alive unless asked to dispose them', () => {
  const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
  let disposed = 0;
  sharedGeo.addEventListener('dispose', () => disposed++);

  mergeStaticMeshes(buildFixture(sharedGeo).group);
  assert.equal(disposed, 0);

  mergeStaticMeshes(buildFixture(sharedGeo).group, { disposeSources: true });
  assert.equal(disposed, 1);
});

test('mergeStaticMeshes skips mirrored and multi-material meshes', () => {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mirrored = [new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat)];
  mirrored.forEach((m) => {
    m.scale.x = -1;
    group.add(m);
  });
  const multi = new THREE.Mesh(geo, [mat, mat]);
  group.add(multi);

  mergeStaticMeshes(group);

  assert.equal(meshes(group).length, 3);
  assert.ok(mirrored.every((m) => m.parent === group));
  assert.equal(multi.parent, group);
});
