/**
 * Enemy Fortified Stronghold (TileType.ENEMY_BASE): a tiered concrete fortress on one 2×2 tile.
 * Concrete bastion ring with a lit blast gate (front = +Z), corner towers with banners, a dark
 * command tier, a central spire with the floating reactor crystal, a radar dish and a comm mast.
 * Static parts are merged into one mesh per material; only the crystal stays separate (animated).
 * The fortress stands on a concrete podium so it rises clearly above the concrete ring that
 * surrounds it on the maps; the pad, barriers and bollards stay at ground level.
 * The defense turrets around the base are separate gameplay objects (engine.setupDefenseTurrets),
 * so the model itself carries no guns.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Rotating an 8-sided cylinder by 22.5° points its faces along ±X / ±Z
const OCT = Math.PI / 8;
const APOTHEM = Math.cos(OCT);
const TAU = Math.PI * 2;

/** 8-sided (or round) cylinder with flat faces toward ±X / ±Z. */
function prism(radiusTop, radiusBottom, height, segments = 8, openEnded = false) {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded).rotateY(OCT);
}

/** Point on a face at angle `angle` (0 = +Z) and distance `dist` from the centre. */
function radial(angle, dist, extra = {}) {
  return { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist, yaw: angle, ...extra };
}

class PartBuckets {
  constructor() {
    this.byMaterial = new Map();
    // Height added to every part; set once the ground-level parts are in
    this.lift = 0;
  }

  /** Bakes the transform (yaw, then pitch about local X, then roll) into `geometry`. */
  add(material, geometry, { x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0 } = {}) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y + this.lift, z), rotation, new THREE.Vector3(1, 1, 1)));
    if (!this.byMaterial.has(material)) this.byMaterial.set(material, []);
    this.byMaterial.get(material).push(geometry);
  }

  /** One merged mesh per material. */
  build(group, shadowCasters) {
    for (const [material, geometries] of this.byMaterial) {
      const indexed = geometries.every((g) => g.index);
      const parts = indexed ? geometries : geometries.map((g) => (g.index ? g.toNonIndexed() : g));
      const mesh = new THREE.Mesh(mergeGeometries(parts), material);
      for (const g of new Set([...geometries, ...parts])) g.dispose();
      mesh.castShadow = shadowCasters.has(material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

/**
 * @param {object} mats materials from ModelFactory.getEnemyBaseMaterials()
 * @param {() => number} getTime animation clock (seconds)
 */
export function buildEnemyStronghold(mats, getTime) {
  const group = new THREE.Group();
  const parts = new PartBuckets();
  const { stone, metal, wall, glow, hazard, banner, rail, dome, dish, lamp, pad, barrier } = mats;
  const lampAt = (x, y, z) => parts.add(lamp, new THREE.SphereGeometry(0.024, 8, 6), { x, y, z });

  // --- Ground pad and approach lane (lane, chevrons and colour bands are in the pad texture) ---
  parts.add(pad, new THREE.CircleGeometry(1.3, 48).rotateX(-Math.PI / 2), { y: 0.012 });
  parts.add(mats.ring, new THREE.RingGeometry(1.106, 1.27, 64).rotateX(-Math.PI / 2), { y: 0.02 });

  // --- Podium: square concrete plinth filling the tile, lit slits and a hazard lip ---
  const PODIUM = { h: 0.75, halfBottom: 1.0, halfTop: 0.97 };
  const square = (halfTop, halfBottom, height, openEnded = false) =>
    new THREE.CylinderGeometry(halfTop * Math.SQRT2, halfBottom * Math.SQRT2, height, 4, 1, openEnded).rotateY(Math.PI / 4);
  const podiumSlope = Math.atan((PODIUM.halfBottom - PODIUM.halfTop) / PODIUM.h);
  parts.add(stone, square(PODIUM.halfTop, PODIUM.halfBottom, PODIUM.h), { y: PODIUM.h / 2 });
  parts.add(hazard, square(PODIUM.halfTop + 0.008, PODIUM.halfTop + 0.01, 0.07, true), { y: PODIUM.h - 0.04 });
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2;
    for (const lateral of [-0.55, 0, 0.55]) {
      const d = PODIUM.halfTop + ((PODIUM.halfBottom - PODIUM.halfTop) * 0.55) + 0.006;
      parts.add(glow, new THREE.BoxGeometry(0.22, 0.04, 0.02), {
        x: Math.sin(angle) * d + Math.cos(angle) * lateral,
        y: PODIUM.h * 0.45,
        z: Math.cos(angle) * d - Math.sin(angle) * lateral,
        yaw: angle,
        pitch: -podiumSlope,
      });
    }
  }
  parts.lift = PODIUM.h;

  // --- Tier 1: sloped concrete bastion ring ---
  const T1 = { h: 0.8, rBottom: 1.04, rTop: 0.9 };
  const t1Radius = (y) => T1.rBottom - ((T1.rBottom - T1.rTop) * y) / T1.h;
  const t1Slope = Math.atan((T1.rBottom - T1.rTop) / T1.h);
  parts.add(stone, prism(T1.rTop, T1.rBottom, T1.h), { y: T1.h / 2 });
  parts.add(hazard, prism(t1Radius(0.16) + 0.012, t1Radius(0.06) + 0.012, 0.1, 8, true), { y: 0.11 });
  parts.add(rail, new THREE.TorusGeometry(T1.rTop - 0.04, 0.012, 4, 8).rotateX(Math.PI / 2), { y: T1.h + 0.08 });
  // Lit embrasures on the side and rear faces
  for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const lateral of [-0.22, 0.22]) {
      const d = t1Radius(0.5) * APOTHEM + 0.006;
      parts.add(glow, new THREE.BoxGeometry(0.16, 0.035, 0.02), {
        x: Math.sin(angle) * d + Math.cos(angle) * lateral,
        y: 0.5,
        z: Math.cos(angle) * d - Math.sin(angle) * lateral,
        yaw: angle,
        pitch: -t1Slope,
      });
    }
  }

  // --- Blast gate (front) between two sloped buttresses ---
  const GATE = { w: 0.72, h: 0.74, front: 1.07 };
  const door = { w: 0.5, h: 0.58 };
  parts.add(stone, new THREE.BoxGeometry(GATE.w, GATE.h, 0.34), { y: GATE.h / 2, z: GATE.front - 0.17 });
  parts.add(metal, new THREE.BoxGeometry(GATE.w + 0.12, 0.09, 0.42), { y: GATE.h + 0.02, z: GATE.front - 0.16 });
  parts.add(metal, new THREE.BoxGeometry(door.w, door.h, 0.03), { y: door.h / 2, z: GATE.front + 0.005 });
  parts.add(hazard, new THREE.BoxGeometry(door.w, 0.05, 0.02), { y: 0.03, z: GATE.front + 0.02 });
  parts.add(glow, new THREE.BoxGeometry(door.w + 0.06, 0.03, 0.02), { y: door.h + 0.015, z: GATE.front + 0.02 });
  for (const s of [-1, 1]) {
    parts.add(glow, new THREE.BoxGeometry(0.03, door.h, 0.02), { x: s * (door.w / 2 + 0.015), y: door.h / 2, z: GATE.front + 0.02 });
    parts.add(glow, new THREE.BoxGeometry(0.11, 0.022, 0.02), { x: s * 0.045, y: door.h + 0.08, z: GATE.front + 0.01, roll: s * 0.5 });
    parts.add(stone, new THREE.BoxGeometry(0.16, 0.66, 0.4), { x: s * (GATE.w / 2 + 0.06), y: 0.3, z: GATE.front - 0.2, pitch: -0.32 });
  }
  parts.add(glow, new THREE.BoxGeometry(0.012, door.h - 0.04, 0.02), { y: door.h / 2, z: GATE.front + 0.022 });
  for (const y of [0.2, 0.38]) {
    parts.add(glow, new THREE.BoxGeometry(door.w - 0.08, 0.012, 0.02), { y, z: GATE.front + 0.022 });
  }

  // --- Corner bastion towers ---
  const TOWER = { h: 1.35, rBottom: 0.23, rTop: 0.18, dist: 0.86 };
  const towerRadius = (y) => TOWER.rBottom - ((TOWER.rBottom - TOWER.rTop) * y) / TOWER.h;
  const towers = [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4].map((angle) => ({
    x: Math.sin(angle) * TOWER.dist,
    z: Math.cos(angle) * TOWER.dist,
  }));
  for (const t of towers) {
    parts.add(stone, prism(TOWER.rTop, TOWER.rBottom, TOWER.h), { x: t.x, y: TOWER.h / 2, z: t.z });
    parts.add(glow, prism(towerRadius(0.97) + 0.006, towerRadius(1.01) + 0.006, 0.04, 8, true), { x: t.x, y: 0.99, z: t.z });
    parts.add(hazard, prism(towerRadius(1.27) + 0.006, towerRadius(1.2) + 0.006, 0.07, 8, true), { x: t.x, y: 1.235, z: t.z });
    parts.add(metal, prism(0.21, 0.2, 0.06), { x: t.x, y: TOWER.h + 0.03, z: t.z });
  }
  const towerTop = TOWER.h + 0.06;
  // Front towers: banners and floodlight banks
  for (const t of towers.filter((tower) => tower.z > 0)) {
    parts.add(banner, new THREE.PlaneGeometry(0.22, 0.5), {
      x: t.x,
      y: 0.62,
      z: t.z + towerRadius(0.62) * APOTHEM + 0.012,
      pitch: -Math.atan((TOWER.rBottom - TOWER.rTop) / TOWER.h),
    });
    parts.add(metal, new THREE.BoxGeometry(0.03, 0.16, 0.03), { x: t.x, y: towerTop + 0.08, z: t.z });
    parts.add(glow, new THREE.BoxGeometry(0.14, 0.08, 0.03), { x: t.x, y: towerTop + 0.18, z: t.z + 0.01 });
    lampAt(t.x, towerTop + 0.245, t.z);
  }
  // Rear-left tower: radar dish facing out and up
  {
    const t = towers[3];
    parts.add(metal, prism(0.025, 0.035, 0.22, 6), { x: t.x, y: towerTop + 0.11, z: t.z });
    const yaw = Math.atan2(t.x, t.z);
    const pitch = 0.6;
    const axis = new THREE.Vector3(Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw));
    const centre = new THREE.Vector3(t.x, towerTop + 0.22, t.z);
    const bowl = new THREE.SphereGeometry(0.36, 18, 4, 0, TAU, 0, 0.5).rotateX(Math.PI).translate(0, 0.36, 0);
    parts.add(dish, bowl, { x: centre.x, y: centre.y, z: centre.z, yaw, pitch });
    const horn = centre.clone().addScaledVector(axis, 0.11);
    parts.add(metal, prism(0.008, 0.008, 0.18, 4), { x: horn.x, y: horn.y, z: horn.z, yaw, pitch });
    const tip = centre.clone().addScaledVector(axis, 0.21);
    lampAt(tip.x, tip.y, tip.z);
  }
  // Rear-right tower: comm mast with relay dishes
  {
    const t = towers[2];
    parts.add(metal, new THREE.CylinderGeometry(0.02, 0.07, 0.62, 4), { x: t.x, y: towerTop + 0.31, z: t.z });
    for (const [y, angle] of [[0.2, 0.4], [0.33, 2.5], [0.44, -1.6]]) {
      parts.add(dish, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), {
        x: t.x + Math.sin(angle) * 0.07,
        y: towerTop + y,
        z: t.z + Math.cos(angle) * 0.07,
        yaw: angle,
        pitch: Math.PI / 2,
      });
    }
    lampAt(t.x, towerTop + 0.64, t.z);
  }

  // --- Tier 1 deck: reactor domes and supply crates ---
  for (const angle of [0.38, -0.38]) {
    const p = radial(angle, 0.74);
    parts.add(metal, prism(0.12, 0.13, 0.07, 12), { x: p.x, y: T1.h + 0.035, z: p.z });
    parts.add(glow, new THREE.TorusGeometry(0.12, 0.012, 4, 16).rotateX(Math.PI / 2), { x: p.x, y: T1.h + 0.07, z: p.z });
    parts.add(dome, new THREE.IcosahedronGeometry(0.105, 1).scale(1, 0.8, 1), { x: p.x, y: T1.h + 0.075, z: p.z });
  }
  for (const x of [-0.28, 0.28]) {
    parts.add(metal, new THREE.BoxGeometry(0.12, 0.1, 0.12), { x, y: T1.h + 0.05, z: -0.76 });
  }

  // --- Tier 2: dark command block ---
  const T2 = { base: T1.h, h: 0.55, rBottom: 0.66, rTop: 0.56 };
  const t2Radius = (y) => T2.rBottom - ((T2.rBottom - T2.rTop) * (y - T2.base)) / T2.h;
  const t2Slope = Math.atan((T2.rBottom - T2.rTop) / T2.h);
  const t2Top = T2.base + T2.h;
  parts.add(wall, prism(T2.rTop, T2.rBottom, T2.h), { y: T2.base + T2.h / 2 });
  parts.add(rail, new THREE.TorusGeometry(T2.rTop - 0.03, 0.01, 4, 8).rotateX(Math.PI / 2), { y: t2Top + 0.07 });
  for (const y of [0.16, 0.23, 0.3].map((dy) => T2.base + dy)) {
    parts.add(glow, new THREE.BoxGeometry(0.2, 0.025, 0.02), { y, z: t2Radius(y) * APOTHEM + 0.008, pitch: -t2Slope });
  }

  // --- Central spire ---
  const SPIRE = { base: t2Top, h: 1.3, rBottom: 0.42, rTop: 0.22 };
  const spireRadius = (y) => SPIRE.rBottom - ((SPIRE.rBottom - SPIRE.rTop) * (y - SPIRE.base)) / SPIRE.h;
  const spireSlope = Math.atan((SPIRE.rBottom - SPIRE.rTop) / SPIRE.h);
  const spireTop = SPIRE.base + SPIRE.h;
  parts.add(metal, prism(SPIRE.rTop, SPIRE.rBottom, SPIRE.h), { y: SPIRE.base + SPIRE.h / 2 });
  const bannerY = SPIRE.base + 0.55;
  parts.add(banner, new THREE.PlaneGeometry(0.28, 0.66), { y: bannerY, z: spireRadius(bannerY) * APOTHEM + 0.012, pitch: -spireSlope });
  for (const angle of [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    parts.add(glow, new THREE.BoxGeometry(0.035, 0.7, 0.015), radial(angle, spireRadius(SPIRE.base + 0.52) * APOTHEM + 0.006, { y: SPIRE.base + 0.52, pitch: -spireSlope }));
  }
  // Side blades leaning in toward the crystal
  const FIN_LEAN = 0.16;
  for (const s of [-1, 1]) {
    const roll = s * FIN_LEAN;
    parts.add(metal, new THREE.BoxGeometry(0.07, 1.25, 0.24), { x: s * 0.48, y: t2Top + 0.64, roll });
    parts.add(glow, new THREE.BoxGeometry(0.012, 0.9, 0.05), {
      x: s * (0.48 + 0.04 * Math.cos(FIN_LEAN)),
      y: t2Top + 0.64 + 0.04 * Math.sin(FIN_LEAN),
      roll,
    });
  }
  // Crown: collar, glowing rings, cage prongs and antenna masts
  parts.add(metal, prism(0.26, 0.23, 0.12), { y: spireTop + 0.06 });
  parts.add(glow, new THREE.TorusGeometry(0.25, 0.022, 6, 24).rotateX(Math.PI / 2), { y: spireTop + 0.13 });
  for (let k = 0; k < 4; k++) {
    const p = radial(Math.PI / 4 + (k * Math.PI) / 2, 0.2);
    parts.add(metal, new THREE.BoxGeometry(0.035, 0.5, 0.035), { x: p.x, y: spireTop + 0.38, z: p.z, yaw: p.yaw });
  }
  parts.add(glow, new THREE.TorusGeometry(0.2, 0.018, 6, 24).rotateX(Math.PI / 2), { y: spireTop + 0.6 });
  parts.add(metal, prism(0.012, 0.03, 0.55, 6), { y: spireTop + 0.88 });
  lampAt(0, spireTop + 1.17, 0);
  for (const s of [-1, 1]) {
    parts.add(metal, prism(0.01, 0.02, 0.3, 6), { x: s * 0.12, y: spireTop + 0.75, z: 0 });
    lampAt(s * 0.12, spireTop + 0.91, 0);
  }

  // --- Approach (ground level, in front of the podium): barriers and lit bollards ---
  parts.lift = 0;
  // Gate landing and stairs down from the podium
  const stairW = GATE.w - 0.08;
  parts.add(stone, new THREE.BoxGeometry(GATE.w + 0.2, PODIUM.h, 0.14), { y: PODIUM.h / 2, z: PODIUM.halfBottom + 0.07 });
  for (let k = 1; k <= 3; k++) {
    const top = PODIUM.h * (1 - k / 4);
    parts.add(stone, new THREE.BoxGeometry(stairW, top, 0.08), { y: top / 2, z: PODIUM.halfBottom + 0.14 + (k - 0.5) * 0.08 });
    parts.add(hazard, new THREE.BoxGeometry(stairW, 0.012, 0.02), { y: top + 0.006, z: PODIUM.halfBottom + 0.14 + (k - 1) * 0.08 + 0.01 });
  }
  for (const s of [-1, 1]) {
    parts.add(barrier, new THREE.BoxGeometry(0.3, 0.13, 0.09), { x: s * 0.76, y: 0.065, z: 1.24, yaw: s * 0.35 });
    for (const [x, z] of [[0.5, 1.22], [0.98, 1.12]]) {
      parts.add(metal, prism(0.025, 0.03, 0.16), { x: s * x, y: 0.08, z });
      lampAt(s * x, 0.18, z);
    }
  }

  parts.build(group, new Set([stone, metal, wall, rail, dish, barrier, banner, dome]));

  // Floating reactor crystal inside the crown cage
  const crystalY = PODIUM.h + spireTop + 0.36;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), mats.core);
  crystal.position.y = crystalY;
  crystal.onBeforeRender = () => {
    const t = getTime();
    crystal.rotation.y = -t * 1.1;
    crystal.position.y = crystalY + Math.sin(t * 2.2) * 0.04;
  };
  group.add(crystal);

  return group;
}
