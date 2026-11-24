/** Continuous terrain patches with a distance-colored surface and a narrow edge. */
import * as THREE from 'three';
import { markOwned } from '../render/dispose.js';

export function createContinuousSurface(grid, surfaceType, tileSize, material, { lowQuality = false, frozen = false } = {}) {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  const group = new THREE.Group();
  group.name = frozen ? 'ContinuousIce' : 'ContinuousWater';
  if (!rows || !cols) return group;

  const surfMask = new Uint8Array(rows * cols);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < cols; c++) {
      if (row[c] === surfaceType) {
        surfMask[r * cols + c] = 1;
        cells.push(r * cols + c);
      }
    }
  }
  if (!cells.length) return group;

  const isSurface = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && surfMask[r * cols + c] === 1;
  const cellEdges = new Array(rows * cols);
  for (let idx = 0; idx < cells.length; idx++) {
    const cellIdx = cells[idx];
    const r = (cellIdx / cols) | 0;
    const c = cellIdx % cols;
    const segs = [];
    if (!isSurface(r - 1, c)) segs.push(c, r, c + 1, r);
    if (!isSurface(r + 1, c)) segs.push(c, r + 1, c + 1, r + 1);
    if (!isSurface(r, c - 1)) segs.push(c, r, c, r + 1);
    if (!isSurface(r, c + 1)) segs.push(c + 1, r, c + 1, r + 1);
    if (segs.length) cellEdges[cellIdx] = segs;
  }

  // Signed distance to exposed edges: internal tile boundaries never become shores.
  const distance = (x, z) => {
    const c = Math.floor(x);
    const r = Math.floor(z);
    let dSq = 4;
    const yMin = r > 2 ? r - 2 : 0;
    const yMax = r + 2 < rows ? r + 2 : rows - 1;
    const xMin = c > 2 ? c - 2 : 0;
    const xMax = c + 2 < cols ? c + 2 : cols - 1;
    for (let y = yMin; y <= yMax; y++) {
      const rowOff = y * cols;
      for (let i = xMin; i <= xMax; i++) {
        const segs = cellEdges[rowOff + i];
        if (!segs) continue;
        for (let k = 0; k < segs.length; k += 4) {
          const ax = segs[k];
          const az = segs[k + 1];
          const bx = segs[k + 2];
          const bz = segs[k + 3];
          const px = x < ax ? ax : x > bx ? bx : x;
          const pz = z < az ? az : z > bz ? bz : z;
          const dx = x - px;
          const dz = z - pz;
          const distSq = dx * dx + dz * dz;
          if (distSq < dSq) dSq = distSq;
        }
      }
    }
    const d = Math.sqrt(dSq);
    return isSurface(r, c) ? d : -d;
  };

  const sampleAt = (x, z) => {
    const a = 0.24;
    const d = (distance(x, z) * 2 + distance(x - a, z) + distance(x + a, z)
      + distance(x, z - a) + distance(x, z + a)) / 6;
    const noise = Math.sin(x * 9.3 + Math.sin(z * 3.1)) * Math.sin(z * 7.7 + x * 1.8);
    return d + noise * 0.045;
  };

  const clipPoly = (inX, inZ, inD, inLen, threshold, above, outX, outZ, outD) => {
    let outLen = 0;
    for (let i = 0; i < inLen; i++) {
      const next = i + 1 < inLen ? i + 1 : 0;
      const ax = inX[i], az = inZ[i], ad = inD[i];
      const bx = inX[next], bz = inZ[next], bd = inD[next];
      const insideA = above ? ad >= threshold : ad <= threshold;
      const insideB = above ? bd >= threshold : bd <= threshold;
      if (insideA) {
        outX[outLen] = ax;
        outZ[outLen] = az;
        outD[outLen] = ad;
        outLen++;
      }
      if (insideA !== insideB) {
        const t = (threshold - ad) / (bd - ad);
        outX[outLen] = ax + (bx - ax) * t;
        outZ[outLen] = az + (bz - az) * t;
        outD[outLen] = threshold;
        outLen++;
      }
    }
    return outLen;
  };

  const surface = { positions: [], colors: [], uvs: [] };
  const bank = { positions: [], colors: [], uvs: [] };
  const deep = new THREE.Color(frozen ? '#a0c8df' : '#123e50');
  const shallow = new THREE.Color(frozen ? '#edf6ff' : '#4a9690');
  const wet = new THREE.Color(frozen ? '#87a9b8' : '#35443c');
  const dry = new THREE.Color(frozen ? '#d2dde0' : '#696451');
  const color = new THREE.Color();
  const halfCols = cols / 2;
  const halfRows = rows / 2;
  const uvScale = frozen ? 0.19 : 0.42;

  const pushVertex = (px, pz, pd, data, shore) => {
    const depth = pd <= 0 ? 0 : pd >= 0.9 ? 1 : pd / 0.9;
    const rawT = (pd + 0.11) / 0.16;
    const t = rawT <= 0 ? 0 : rawT >= 1 ? 1 : rawT;
    color.copy(shore ? dry : shallow).lerp(shore ? wet : deep, shore ? t : Math.sqrt(depth));
    const variation = 1 + 0.045 * Math.sin(px * 19 + pz * 13);
    color.multiplyScalar(variation);
    const y = frozen
      ? (shore ? 0.025 + t * 0.065 : 0.09)
      : (shore ? 0.045 + (1 - t) * 0.025 : 0.055);
    data.positions.push((px - halfCols) * tileSize, y, (pz - halfRows) * tileSize);
    data.colors.push(color.r, color.g, color.b);
    data.uvs.push(px * uvScale, pz * uvScale);
  };

  const emitPoly = (px, pz, pd, len, data, shore) => {
    for (let i = 1; i < len - 1; i++) {
      pushVertex(px[0], pz[0], pd[0], data, shore);
      pushVertex(px[i + 1], pz[i + 1], pd[i + 1], data, shore);
      pushVertex(px[i], pz[i], pd[i], data, shore);
    }
  };

  // Include adjacent land for a narrow wet edge; share samples to avoid cracks.
  const activeMask = new Uint8Array(rows * cols);
  const activeCells = [];
  for (let idx = 0; idx < cells.length; idx++) {
    const cellIdx = cells[idx];
    const r = (cellIdx / cols) | 0;
    const c = cellIdx % cols;
    const yMin = r > 0 ? r - 1 : 0;
    const yMax = r + 1 < rows ? r + 1 : rows - 1;
    const xMin = c > 0 ? c - 1 : 0;
    const xMax = c + 1 < cols ? c + 1 : cols - 1;
    for (let y = yMin; y <= yMax; y++) {
      const rowOff = y * cols;
      for (let x = xMin; x <= xMax; x++) {
        const k = rowOff + x;
        if (!activeMask[k]) {
          activeMask[k] = 1;
          activeCells.push(k);
        }
      }
    }
  }

  const steps = lowQuality ? 4 : 8;
  const invSteps = 1 / steps;
  const gridW = cols * steps + 1;
  const gridH = rows * steps + 1;
  const sampleD = new Float32Array(gridW * gridH);
  const sampleDone = new Uint8Array(gridW * gridH);
  const getSampleD = (gx, gz) => {
    const key = gz * gridW + gx;
    if (!sampleDone[key]) {
      sampleDone[key] = 1;
      sampleD[key] = sampleAt(gx * invSteps, gz * invSteps);
    }
    return sampleD[key];
  };

  const tX = new Float64Array(8), tZ = new Float64Array(8), tD = new Float64Array(8);
  const sX = new Float64Array(8), sZ = new Float64Array(8), sD = new Float64Array(8);
  const b1X = new Float64Array(8), b1Z = new Float64Array(8), b1D = new Float64Array(8);
  const b2X = new Float64Array(8), b2Z = new Float64Array(8), b2D = new Float64Array(8);

  for (let idx = 0; idx < activeCells.length; idx++) {
    const cell = activeCells[idx];
    const r = (cell / cols) | 0;
    const c = cell % cols;
    const zEnd = (r + 1) * steps;
    const xEnd = (c + 1) * steps;
    for (let gz = r * steps; gz < zEnd; gz++) {
      const pz0 = gz * invSteps;
      const pz1 = (gz + 1) * invSteps;
      for (let gx = c * steps; gx < xEnd; gx++) {
        const px0 = gx * invSteps;
        const px1 = (gx + 1) * invSteps;
        const dA = getSampleD(gx, gz);
        const dB = getSampleD(gx + 1, gz);
        const dC = getSampleD(gx + 1, gz + 1);
        const dD = getSampleD(gx, gz + 1);

        // Triangle 1: (A, B, C)
        tX[0] = px0; tZ[0] = pz0; tD[0] = dA;
        tX[1] = px1; tZ[1] = pz0; tD[1] = dB;
        tX[2] = px1; tZ[2] = pz1; tD[2] = dC;
        let sLen = clipPoly(tX, tZ, tD, 3, 0.035, true, sX, sZ, sD);
        if (sLen >= 3) emitPoly(sX, sZ, sD, sLen, surface, false);
        let bLen = clipPoly(tX, tZ, tD, 3, -0.11, true, b1X, b1Z, b1D);
        if (bLen >= 3) {
          bLen = clipPoly(b1X, b1Z, b1D, bLen, 0.035, false, b2X, b2Z, b2D);
          if (bLen >= 3) emitPoly(b2X, b2Z, b2D, bLen, bank, true);
        }

        // Triangle 2: (A, C, D)
        tX[0] = px0; tZ[0] = pz0; tD[0] = dA;
        tX[1] = px1; tZ[1] = pz1; tD[1] = dC;
        tX[2] = px0; tZ[2] = pz1; tD[2] = dD;
        sLen = clipPoly(tX, tZ, tD, 3, 0.035, true, sX, sZ, sD);
        if (sLen >= 3) emitPoly(sX, sZ, sD, sLen, surface, false);
        bLen = clipPoly(tX, tZ, tD, 3, -0.11, true, b1X, b1Z, b1D);
        if (bLen >= 3) {
          bLen = clipPoly(b1X, b1Z, b1D, bLen, 0.035, false, b2X, b2Z, b2D);
          if (bLen >= 3) emitPoly(b2X, b2Z, b2D, bLen, bank, true);
        }
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
