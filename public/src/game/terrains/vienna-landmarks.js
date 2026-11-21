/**
 * Vienna landmark geometry for campaign mission 10 "Vienna: Hofburg": the Hofburg
 * Michaelertrakt dome gate, the outer Burgtor and the Heldenplatz equestrian statue
 * (HOFBURG_PALACE and ST_STEPHENS_CATHEDRAL are modelled directly in Blender).
 *
 * One vertex-coloured, non-indexed BufferGeometry per monument. The same geometry is
 * the in-game fallback while the GLB pack loads and the source the Blender build
 * (`assets/blender/build-vienna-landmarks.py`) exports into
 * `public/models/landmarks/vienna_landmarks.glb`, so both stay identical.
 * Origin is the footprint centre on the ground, +X east, +Z south, 1 cell = 2 units.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FACADE = 0xe6dcc6;
const RUSTIC = 0xc9bc9f;
const SANDSTONE = 0xcfc09c;
const COPPER = 0x5c9a86;
const GILT = 0xc9a548;
const BRONZE = 0x3f5a4c;
const GRANITE = 0x9f9a91;
const WINDOW = 0x2f3640;
const SLATE = 0x56606a;

/** Kinds whose geometry this module builds. */
export const VIENNA_GEOMETRY_KINDS = Object.freeze(['MICHAELERTRAKT', 'BURGTOR', 'HELDENPLATZ_STATUE']);

export function createViennaLandmarkGeometry(kind) {
  const parts = [];
  const put = (geometry, x, y, z, color, yaw = 0, pitch = 0) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(x, y, z);
    const tint = new THREE.Color(color);
    // Stable per-block variation; no random state shared with gameplay.
    tint.multiplyScalar(0.94 + ((parts.length * 37) % 13) / 100);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  };
  const box = (w, h, d, x, y, z, color, yaw = 0, pitch = 0) =>
    put(new THREE.BoxGeometry(w, h, d), x, y, z, color, yaw, pitch);
  const cylinder = (rt, rb, h, x, y, z, color, segments = 12) =>
    put(new THREE.CylinderGeometry(rt, rb, h, segments), x, y, z, color);
  const cone = (r, h, x, y, z, color, segments = 8) =>
    put(new THREE.ConeGeometry(r, h, segments), x, y, z, color);
  const sphere = (r, x, y, z, color, scaleY = 1, half = false) => {
    const g = new THREE.SphereGeometry(r, 16, half ? 6 : 10, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI);
    g.scale(1, scaleY, 1);
    put(g, x, y, z, color);
  };
  // Shape in the XY plane, extruded `depth` along Z and centred on it.
  const extrude = (shape, depth, x, y, z, color, yaw = 0) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 10 });
    g.translate(0, 0, -depth / 2);
    put(g, x, y, z, color, yaw);
  };
  // Wall `width` wide and `height` tall above its spring line with a real open round arch.
  const archWall = (width, height, radius, depth, x, spring, z, color) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(-radius, 0);
    shape.absarc(0, 0, radius, Math.PI, 0, true);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height);
    shape.lineTo(-width / 2, height);
    shape.closePath();
    extrude(shape, depth, x, spring, z, color);
  };
  if (kind === 'MICHAELERTRAKT') {
    // 7x2 cells, facade facing north onto Michaelerplatz. The central gate (cell 3,
    // x in [-1, 1]) stays open through both rows; both wings block.
    for (const side of [-1, 1]) {
      const cx = side * 3.97;
      const w = 5.86;
      box(w, 2.2, 3.2, cx, 1.1, 0, RUSTIC);
      box(w, 2.8, 3.0, cx, 3.6, 0, FACADE);
      box(w + 0.1, 0.24, 3.4, cx, 5.12, 0, FACADE);
      box(w - 0.4, 0.55, 2.4, cx, 5.5, 0, SLATE);
      for (const z of [-1.62, 1.62]) {
        // Rusticated base courses, two window storeys with pediments, roof balustrade.
        for (let i = 0; i < 4; i++) box(w, 0.04, 0.05, cx, 0.45 + i * 0.5, z * 1.0, 0xb4a88c);
        for (let i = 0; i < 6; i++) {
          const x = side * (1.75 + i * 0.95);
          box(0.42, 0.85, 0.08, x, 1.15, z, WINDOW);
          for (const y of [2.95, 4.15]) {
            box(0.4, 0.72, 0.08, x, y, z * 0.95, WINDOW);
            box(0.56, 0.1, 0.12, x, y + 0.45, z * 0.95, 0xf3ecdc);
          }
          box(0.14, 0.42, 0.14, x + side * 0.4, 5.45, z, FACADE);
        }
        box(w, 0.1, 0.16, cx, 5.66, z, FACADE);
        // Hercules groups on plinths flanking the gate and fountain niches at the ends.
        if (z < 0) {
          box(0.7, 0.9, 0.34, side * 1.75, 0.45, -1.8, GRANITE);
          cylinder(0.14, 0.2, 1.0, side * 1.75, 1.4, -1.8, 0xf1ebdf, 8);
          sphere(0.12, side * 1.75, 2.0, -1.8, 0xf1ebdf);
          box(1.2, 0.5, 0.3, side * 6.1, 0.25, -1.78, GRANITE);
          cylinder(0.12, 0.17, 0.9, side * 6.1, 0.95, -1.8, 0xf1ebdf, 8);
        }
      }
      // Paired Corinthian columns framing the rotunda bay.
      for (const z of [-1.55, 1.55]) {
        for (const dx of [1.3, 2.25]) {
          cylinder(0.13, 0.15, 2.8, side * dx, 3.6, z * 1.02, 0xf1ebdf, 10);
          box(0.38, 0.16, 0.38, side * dx, 5.0, z * 1.02, FACADE);
        }
      }
    }
    // Gate passage: arched wall over the open cell, then the rotunda drum and dome.
    archWall(2.2, 2.4, 0.98, 3.2, 0, 2.6, 0, RUSTIC);
    for (const x of [-1.12, 1.12]) box(0.2, 0.2, 3.3, x, 2.55, 0, FACADE);
    cylinder(1.95, 2.0, 1.1, 0, 5.75, 0, FACADE, 20);
    for (let i = 0; i < 12; i++) {
      const a = (i + 0.5) * Math.PI / 6;
      box(0.16, 0.9, 0.12, Math.cos(a) * 1.98, 5.75, Math.sin(a) * 1.98, 0xf3ecdc, -a + Math.PI / 2);
    }
    cylinder(1.98, 1.98, 0.14, 0, 6.35, 0, FACADE, 20);
    sphere(1.88, 0, 6.4, 0, COPPER, 1.18, true);
    cylinder(1.5, 1.72, 0.12, 0, 7.45, 0, 0x3d6f60, 20);
    cylinder(0.32, 0.38, 0.6, 0, 8.9, 0, COPPER, 10);
    cylinder(0.4, 0.4, 0.08, 0, 9.2, 0, GILT, 10);
    sphere(0.2, 0, 9.42, 0, GILT);
    cone(0.12, 0.35, 0, 9.75, 0, GILT, 6);
  } else if (kind === 'BURGTOR') {
    // 7x2 cells: four Doric piers (cells 0, 2, 4, 6) and three north-south passages.
    for (const x of [-6, -2, 2, 6]) {
      box(1.92, 0.3, 3.4, x, 0.15, 0, GRANITE);
      box(1.8, 3.5, 3.0, x, 2.05, 0, SANDSTONE);
      for (const z of [-1.7, 1.7]) {
        for (const dx of [-0.5, 0.5]) {
          box(0.5, 0.18, 0.5, x + dx, 0.39, z, SANDSTONE);
          cylinder(0.18, 0.22, 3.25, x + dx, 2.08, z, 0xdccfae, 16);
          box(0.5, 0.12, 0.5, x + dx, 3.76, z, SANDSTONE);
        }
        box(0.6, 1.2, 0.06, x, 2.0, z * 0.9, 0xb8a985);
      }
    }
    // Flat lintels; the central passage is taller like the original main gate.
    for (const x of [-4, 4]) box(2.3, 0.85, 3.0, x, 3.38, 0, SANDSTONE);
    box(2.3, 0.45, 3.0, 0, 3.58, 0, SANDSTONE);
    box(14, 0.6, 3.6, 0, 4.1, 0, SANDSTONE);
    for (const z of [-1.81, 1.81]) {
      for (let i = 0; i < 23; i++) box(0.18, 0.44, 0.04, -6.6 + i * 0.6, 4.1, z, 0xa89a78);
    }
    box(14, 0.2, 3.9, 0, 4.5, 0, 0xdccfae);
    box(7.2, 1.3, 3.0, 0, 5.25, 0, SANDSTONE);
    box(7.4, 0.16, 3.2, 0, 5.98, 0, 0xdccfae);
    for (const z of [-1.52, 1.52]) box(5.2, 0.3, 0.04, 0, 5.3, z, GILT);
    for (const x of [-5.3, 5.3]) {
      box(3.2, 0.7, 2.8, x, 4.95, 0, SANDSTONE);
      box(3.3, 0.12, 2.9, x, 5.36, 0, 0xdccfae);
    }
    // Crest group on the attic.
    box(1.4, 0.3, 1.0, 0, 6.21, 0, SANDSTONE);
    sphere(0.32, 0, 6.6, 0, BRONZE);
  } else if (kind === 'HELDENPLATZ_STATUE') {
    // 1x1 cell: bronze rider on a rearing horse atop a stone pedestal.
    box(1.8, 0.25, 1.8, 0, 0.125, 0, GRANITE);
    box(1.0, 1.3, 1.6, 0, 0.9, 0, 0xb5afa4);
    box(1.15, 0.12, 1.75, 0, 1.61, 0, GRANITE);
    for (const x of [-0.505, 0.505]) box(0.02, 0.32, 0.7, x, 0.95, 0, GILT);
    const base = 1.67;
    for (const x of [-0.1, 0.1]) {
      cylinder(0.05, 0.06, 0.55, x, base + 0.27, 0.42, BRONZE, 6);
    }
    box(0.34, 0.38, 0.95, 0, base + 0.78, 0.05, BRONZE, 0, 0.62);
    box(0.2, 0.5, 0.22, 0, base + 1.3, -0.36, BRONZE, 0, 0.3);
    box(0.16, 0.18, 0.36, 0, base + 1.55, -0.5, BRONZE, 0, -0.4);
    for (const x of [-0.1, 0.1]) {
      box(0.08, 0.34, 0.08, x, base + 0.95, -0.52, BRONZE, 0, -0.9);
    }
    cylinder(0.03, 0.06, 0.5, 0, base + 0.5, 0.55, BRONZE, 5);
    box(0.28, 0.42, 0.22, 0, base + 1.3, 0.05, BRONZE, 0, 0.25);
    sphere(0.1, 0, base + 1.6, -0.02, BRONZE);
    box(0.3, 0.06, 0.12, 0, base + 1.7, -0.02, BRONZE);
    cylinder(0.015, 0.015, 1.0, 0.2, base + 1.75, -0.1, BRONZE, 4);
    box(0.02, 0.28, 0.4, 0.2, base + 2.1, 0.1, BRONZE);
  } else {
    throw new Error(`Unknown Vienna landmark: ${kind}`);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
