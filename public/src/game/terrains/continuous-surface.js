/** Continuous terrain patches with a distance-colored surface and a narrow edge. */
import * as THREE from 'three';
import { markOwned } from '../dispose.js';

export function createContinuousSurface(grid, surfaceType, tileSize, material, { lowQuality = false, frozen = false } = {}) {
  const rows = grid.length, cols = grid[0]?.length || 0;
  const isSurface = (r, c) => grid[r]?.[c] === surfaceType;
  const edges = new Map();
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!isSurface(r, c)) continue;
    cells.push([r, c]);
    const segments = [];
    if (!isSurface(r - 1, c)) segments.push([c, r, c + 1, r]);
    if (!isSurface(r + 1, c)) segments.push([c, r + 1, c + 1, r + 1]);
    if (!isSurface(r, c - 1)) segments.push([c, r, c, r + 1]);
    if (!isSurface(r, c + 1)) segments.push([c + 1, r, c + 1, r + 1]);
    edges.set(r * cols + c, segments);
  }
  const group = new THREE.Group();
  group.name = frozen ? 'ContinuousIce' : 'ContinuousWater';
  if (!cells.length) return group;

  // Signed distance to exposed edges: internal tile boundaries never become shores.
  const distance = (x, z) => {
    const c = Math.floor(x), r = Math.floor(z);
    let d = 2;
    for (let y = Math.max(0, r - 2); y <= Math.min(rows - 1, r + 2); y++) {
      for (let i = Math.max(0, c - 2); i <= Math.min(cols - 1, c + 2); i++) {
        for (const [ax, az, bx, bz] of edges.get(y * cols + i) || []) {
          const px = Math.max(ax, Math.min(bx, x));
          const pz = Math.max(az, Math.min(bz, z));
          d = Math.min(d, Math.hypot(x - px, z - pz));
        }
      }
    }
    return isSurface(r, c) ? d : -d;
  };
  const sample = (x, z) => {
    const a = 0.24;
    const d = (distance(x, z) * 2 + distance(x - a, z) + distance(x + a, z)
      + distance(x, z - a) + distance(x, z + a)) / 6;
    const noise = Math.sin(x * 9.3 + Math.sin(z * 3.1)) * Math.sin(z * 7.7 + x * 1.8);
    return { x, z, d: d + noise * 0.045 };
  };
  const clip = (polygon, threshold, above) => {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const insideA = above ? a.d >= threshold : a.d <= threshold;
      const insideB = above ? b.d >= threshold : b.d <= threshold;
      if (insideA) out.push(a);
      if (insideA !== insideB) {
        const t = (threshold - a.d) / (b.d - a.d);
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, d: threshold });
      }
    }
    return out;
  };
  const surface = { positions: [], colors: [], uvs: [] };
  const bank = { positions: [], colors: [], uvs: [] };
  const deep = new THREE.Color(frozen ? '#a0c8df' : '#123e50'), shallow = new THREE.Color(frozen ? '#edf6ff' : '#4a9690');
  const wet = new THREE.Color(frozen ? '#87a9b8' : '#35443c'), dry = new THREE.Color(frozen ? '#d2dde0' : '#696451');
  const color = new THREE.Color();
  const emit = (polygon, data, shore) => {
    for (let i = 1; i < polygon.length - 1; i++) {
      for (const p of [polygon[0], polygon[i + 1], polygon[i]]) {
        const depth = THREE.MathUtils.clamp(p.d / 0.9, 0, 1);
        const t = THREE.MathUtils.clamp((p.d + 0.11) / 0.16, 0, 1);
        color.copy(shore ? dry : shallow).lerp(shore ? wet : deep, shore ? t : Math.sqrt(depth));
        const variation = 1 + 0.045 * Math.sin(p.x * 19 + p.z * 13);
        color.multiplyScalar(variation);
        data.positions.push((p.x - cols / 2) * tileSize, frozen ? (shore ? 0.025 + t * 0.065 : 0.09) : (shore ? 0.045 + (1 - t) * 0.025 : 0.055), (p.z - rows / 2) * tileSize);
        data.colors.push(color.r, color.g, color.b);
        const uvScale = frozen ? 0.19 : 0.42;
        data.uvs.push(p.x * uvScale, p.z * uvScale);
      }
    }
  };
  // Include adjacent land for a narrow wet edge; share samples to avoid cracks.
  const active = new Set();
  for (const [r, c] of cells) for (let y = Math.max(0, r - 1); y <= Math.min(rows - 1, r + 1); y++) {
    for (let x = Math.max(0, c - 1); x <= Math.min(cols - 1, c + 1); x++) active.add(y * cols + x);
  }
  const steps = lowQuality ? 4 : 8;
  const samples = new Map();
  const vertex = (x, z) => {
    const key = z * (cols * steps + 1) + x;
    if (!samples.has(key)) samples.set(key, sample(x / steps, z / steps));
    return samples.get(key);
  };
  for (const cell of active) {
    const r = Math.floor(cell / cols), c = cell % cols;
    for (let z = r * steps; z < (r + 1) * steps; z++) for (let x = c * steps; x < (c + 1) * steps; x++) {
      const a = vertex(x, z), b = vertex(x + 1, z), c1 = vertex(x + 1, z + 1), d = vertex(x, z + 1);
      for (const triangle of [[a, b, c1], [a, c1, d]]) {
        emit(clip(triangle, 0.035, true), surface, false);
        emit(clip(clip(triangle, -0.11, true), 0.035, false), bank, true);
      }
    }
  }
  const add = (data, mat) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const surfaceMaterial = material.clone();
  if (!frozen) surfaceMaterial.map = null;
  surfaceMaterial.vertexColors = true;
  surfaceMaterial.roughness = frozen ? 0.85 : 0.24;
  surfaceMaterial.metalness = 0;
  surfaceMaterial.emissive.set(frozen ? '#162b3c' : '#0b292c');
  surfaceMaterial.emissiveIntensity = 0.18;
  add(surface, surfaceMaterial);
  add(bank, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
  group.userData[frozen ? 'iceCells' : 'waterCells'] = cells.length;
  return markOwned(group);
}
