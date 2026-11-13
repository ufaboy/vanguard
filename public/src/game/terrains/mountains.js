/** Deterministic, non-colliding rocky terrain outside the playable square. */
import * as THREE from 'three';
import { markOwned } from '../render/dispose.js';

function hash(x, z) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 70317;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n >>> 0) / 4294967295;
}

function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v
  );
}

export function createMountainPerimeter(halfSpan, { lowQuality = false } = {}) {
  const group = new THREE.Group();
  group.name = 'RockyPerimeter';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260),
    new THREE.MeshStandardMaterial({ color: '#41433f', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.06;
  floor.receiveShadow = true;
  group.add(floor);

  const extent = halfSpan + 28;
  const steps = lowQuality ? 80 : 144;
  const step = extent * 2 / steps;
  const positions = [], colors = [], indices = [];
  const stone = new THREE.Color('#747976'), warm = new THREE.Color('#8c8170');
  const color = new THREE.Color();
  const groundColor = new THREE.Color('#41433f');
  for (let row = 0; row <= steps; row++) for (let col = 0; col <= steps; col++) {
    const x = -extent + col * step, z = -extent + row * step;
    const edge = Math.hypot(Math.max(0, Math.abs(x) - halfSpan), Math.max(0, Math.abs(z) - halfSpan));
    const n = noise(x * 0.075, z * 0.075);
    const ridgeCenter = 11 + (n - 0.5) * 12;
    const envelope = Math.exp(-Math.pow((edge - ridgeCenter) / 7, 2));
    const toe = THREE.MathUtils.smoothstep(edge, 3, 7);
    const fade = 1 - THREE.MathUtils.smoothstep(edge, 21, 28);
    const ridge = 1 - Math.abs(noise(x * 0.17, z * 0.17) * 2 - 1);
    const crags = noise(x * 0.55, z * 0.55);
    // Modest heights keep the battlefield readable from the isometric camera.
    const clusters = THREE.MathUtils.smoothstep(noise(x * 0.055 + 37, z * 0.055 - 19), 0.24, 0.76);
    const peak = 1.2 + clusters * 11;
    const height = toe * fade * (envelope * peak * (0.45 + ridge * 0.65)
      + (crags - 0.35) * 0.7 * clusters) - 0.04;
    positions.push(x, height, z);
    const strata = Math.sin(height * 6.5 + x * 0.13 + z * 0.19) * 0.065;
    color.copy(stone).lerp(warm, noise(x * 0.12 + 21, z * 0.12));
    color.multiplyScalar(0.72 + crags * 0.28 + strata + Math.min(height, 6) * 0.025);
    color.lerp(groundColor, 1 - THREE.MathUtils.smoothstep(height, 0, 1.8));
    colors.push(color.r, color.g, color.b);
  }
  for (let row = 0; row < steps; row++) for (let col = 0; col < steps; col++) {
    const x0 = -extent + col * step, z0 = -extent + row * step;
    // Omit every quad touching the arena, including its three-unit clear margin.
    if (x0 < halfSpan + 3 && x0 + step > -halfSpan - 3
      && z0 < halfSpan + 3 && z0 + step > -halfSpan - 3) continue;
    const a = row * (steps + 1) + col, b = a + 1, d = a + steps + 1, c = d + 1;
    indices.push(a, d, b, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const ridgeMesh = new THREE.Mesh(geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }));
  ridgeMesh.name = 'WeatheredRidges';
  ridgeMesh.receiveShadow = true;
  group.add(ridgeMesh);

  // Small angular fragments connect the slopes to their bare gravel apron.
  const count = lowQuality ? 70 : 160;
  const rubbleGeometry = new THREE.IcosahedronGeometry(1, 0);
  const attribute = rubbleGeometry.attributes.position;
  for (let i = 0; i < attribute.count; i++) {
    const x = attribute.getX(i), y = attribute.getY(i), z = attribute.getZ(i);
    const scale = 0.8 + noise(x * 3 + 4, z * 3 + y) * 0.4;
    attribute.setXYZ(i, x * scale, y * scale * 0.65, z * scale);
  }
  rubbleGeometry.computeVertexNormals();
  const rubble = new THREE.InstancedMesh(rubbleGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const side = i % 4, along = (hash(i, 1) * 2 - 1) * (halfSpan + 5);
    const outward = halfSpan + 4.2 + hash(i, 2) * 1.6;
    const size = 0.16 + Math.pow(hash(i, 3), 2) * 0.65;
    dummy.position.set(side < 2 ? along : (side === 2 ? -outward : outward),
      size * 0.22, side < 2 ? (side === 0 ? -outward : outward) : along);
    dummy.rotation.set(hash(i, 4), hash(i, 5) * Math.PI * 2, hash(i, 6) * 0.5);
    dummy.scale.set(size * 1.3, size, size * 0.9);
    dummy.updateMatrix();
    rubble.setMatrixAt(i, dummy.matrix);
    color.copy(stone).lerp(warm, hash(i, 7)).multiplyScalar(0.75 + hash(i, 8) * 0.3);
    rubble.setColorAt(i, color);
  }
  rubble.receiveShadow = true;
  rubble.computeBoundingSphere();
  group.add(rubble);
  return markOwned(group);
}
