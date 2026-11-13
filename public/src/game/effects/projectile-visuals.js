import * as THREE from 'three';
import { glowSpriteTexture } from './atlas.js';

/** Shared projectile visuals (core + additive halo), cached per colour. */
const projectileCache = new Map();

export function createProjectileVisual(colorHex, { radius = 0.14, length = 0.55, glow = 1.0 } = {}) {
  const key = `${colorHex}:${radius}:${length}:${glow}`;
  let entry = projectileCache.get(key);
  if (!entry) {
    const coreGeo = new THREE.CapsuleGeometry(radius * 0.42, length, 3, 8);
    coreGeo.rotateX(Math.PI / 2);
    const c = new THREE.Color(colorHex);
    const hot = c.clone().lerp(new THREE.Color(0xffffff), 0.65);
    const coreMat = new THREE.MeshBasicMaterial({ color: hot, toneMapped: false });
    const haloMat = new THREE.SpriteMaterial({
      map: glowSpriteTexture(),
      color: c,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.85,
    });
    entry = { coreGeo, coreMat, haloMat };
    projectileCache.set(key, entry);
  }
  const group = new THREE.Group();
  const core = new THREE.Mesh(entry.coreGeo, entry.coreMat);
  group.add(core);
  const halo = new THREE.Sprite(entry.haloMat);
  const hs = (radius * 6 + length * 0.9) * glow;
  halo.scale.set(hs, hs, 1);
  halo.renderOrder = 11;
  group.add(halo);
  return group;
}

/** Missile palettes: player ATGM (ivory + red warhead, orange motor) and enemy (gunmetal + cyan). */
const MISSILE_STYLES = {
  player: {
    body: 0xe9e4d4, warhead: 0xd8231f, warheadGlow: 0x7a0a08, band: 0xf4b400,
    fin: 0x46523c, seeker: 0xff3b2f, flame: 0xffb347, flameCore: 0xfff3c8, halo: 0xff8a2a,
  },
  enemy: {
    body: 0x2b3342, warhead: 0x1d6fd8, warheadGlow: 0x0b3a82, band: 0x38e8ff,
    fin: 0x161c27, seeker: 0x5ff3ff, flame: 0x64c8ff, flameCore: 0xe6fbff, halo: 0x3b8cff,
  },
};

const missileCache = new Map();

function missileAssets(style) {
  let a = missileCache.get(style);
  if (a) return a;
  const s = MISSILE_STYLES[style] || MISSILE_STYLES.player;
  const body = new THREE.CylinderGeometry(0.07, 0.075, 0.46, 12);
  body.rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.07, 0.22, 12);
  nose.rotateX(Math.PI / 2);
  const band = new THREE.CylinderGeometry(0.078, 0.078, 0.045, 12);
  band.rotateX(Math.PI / 2);
  const nozzle = new THREE.CylinderGeometry(0.058, 0.045, 0.08, 10, 1, true);
  nozzle.rotateX(Math.PI / 2);
  const seeker = new THREE.SphereGeometry(0.03, 8, 6);
  const fin = new THREE.BoxGeometry(0.012, 0.13, 0.15);
  fin.translate(0, 0.105, 0);
  const canard = new THREE.BoxGeometry(0.01, 0.07, 0.06);
  canard.translate(0, 0.095, 0);
  // Flame tongue: cone pointing backwards (-Z), tip at the far end.
  const flame = new THREE.ConeGeometry(0.055, 0.5, 10, 1, true);
  flame.rotateX(-Math.PI / 2);
  flame.translate(0, 0, -0.25);
  const flameCore = new THREE.ConeGeometry(0.03, 0.26, 8, 1, true);
  flameCore.rotateX(-Math.PI / 2);
  flameCore.translate(0, 0, -0.13);

  const additive = (color, opacity) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  a = {
    geo: { body, nose, band, nozzle, seeker, fin, canard, flame, flameCore },
    mat: {
      body: new THREE.MeshStandardMaterial({ color: s.body, metalness: 0.45, roughness: 0.38 }),
      warhead: new THREE.MeshStandardMaterial({
        color: s.warhead, emissive: s.warheadGlow, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3,
      }),
      band: new THREE.MeshStandardMaterial({ color: s.band, emissive: s.band, emissiveIntensity: 0.55, roughness: 0.4 }),
      fin: new THREE.MeshStandardMaterial({ color: s.fin, metalness: 0.5, roughness: 0.5 }),
      nozzle: new THREE.MeshStandardMaterial({
        color: 0x2a2a2a, emissive: s.flame, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide,
      }),
      seeker: new THREE.MeshBasicMaterial({ color: s.seeker, toneMapped: false }),
      flame: additive(s.flame, 0.75),
      flameCore: additive(s.flameCore, 0.95),
      halo: new THREE.SpriteMaterial({
        map: glowSpriteTexture(),
        color: s.halo,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.9,
      }),
      seekerHalo: new THREE.SpriteMaterial({
        map: glowSpriteTexture(),
        color: s.seeker,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.8,
      }),
    },
  };
  missileCache.set(style, a);
  return a;
}

/**
 * Shared-resource guided missile model, nose along +Z. `style`: 'player' | 'enemy'.
 * Resources are cached and must not be disposed by callers. Animate with animateMissileVisual.
 */
export function createMissileVisual(style = 'player', scale = 1) {
  const { geo, mat } = missileAssets(style);
  const root = new THREE.Group();
  root.name = 'Missile';
  const airframe = new THREE.Group();
  root.add(airframe);

  airframe.add(new THREE.Mesh(geo.body, mat.body));
  const nose = new THREE.Mesh(geo.nose, mat.warhead);
  nose.position.z = 0.34;
  airframe.add(nose);
  const bandFront = new THREE.Mesh(geo.band, mat.band);
  bandFront.position.z = 0.17;
  airframe.add(bandFront);
  const bandRear = new THREE.Mesh(geo.band, mat.band);
  bandRear.position.z = -0.12;
  bandRear.scale.set(0.97, 0.97, 0.6);
  airframe.add(bandRear);
  const seeker = new THREE.Mesh(geo.seeker, mat.seeker);
  seeker.position.z = 0.44;
  airframe.add(seeker);
  const nozzle = new THREE.Mesh(geo.nozzle, mat.nozzle);
  nozzle.position.z = -0.26;
  airframe.add(nozzle);
  for (let i = 0; i < 4; i++) {
    const roll = Math.PI / 4 + (i * Math.PI) / 2;
    const f = new THREE.Mesh(geo.fin, mat.fin);
    f.position.z = -0.17;
    f.rotation.z = roll;
    airframe.add(f);
    const c = new THREE.Mesh(geo.canard, mat.fin);
    c.position.z = 0.12;
    c.rotation.z = roll;
    airframe.add(c);
  }

  const flame = new THREE.Mesh(geo.flame, mat.flame);
  flame.position.z = -0.29;
  flame.renderOrder = 12;
  root.add(flame);
  const flameCore = new THREE.Mesh(geo.flameCore, mat.flameCore);
  flameCore.position.z = -0.29;
  flameCore.renderOrder = 13;
  root.add(flameCore);
  const halo = new THREE.Sprite(mat.halo);
  halo.position.z = -0.36;
  halo.scale.set(0.95, 0.95, 1);
  halo.renderOrder = 11;
  root.add(halo);
  const seekerHalo = new THREE.Sprite(mat.seekerHalo);
  seekerHalo.position.z = 0.45;
  seekerHalo.scale.set(0.28, 0.28, 1);
  seekerHalo.renderOrder = 11;
  root.add(seekerHalo);

  root.scale.setScalar(scale);
  root.userData.missile = { airframe, flame, flameCore, halo, seekerHalo, t: Math.random() * 10, bank: 0 };
  return root;
}

/** Per-frame roll, motor flicker, seeker blink and banking into turns (`turnRate` in rad/s). */
export function animateMissileVisual(root, dt, turnRate = 0) {
  const m = root?.userData?.missile;
  if (!m) return;
  m.t += dt;
  m.airframe.rotation.z += dt * 7.5;
  const targetBank = THREE.MathUtils.clamp(-turnRate * 0.18, -0.6, 0.6);
  m.bank += (targetBank - m.bank) * Math.min(1, dt * 8);
  root.rotation.z = m.bank;
  const flick = 0.82 + Math.random() * 0.4;
  m.flame.scale.set(0.9 + Math.random() * 0.25, 0.9 + Math.random() * 0.25, flick);
  m.flameCore.scale.set(1, 1, 0.8 + Math.random() * 0.35);
  const hs = 0.85 + Math.random() * 0.3;
  m.halo.scale.set(hs, hs, 1);
  const blink = Math.sin(m.t * 18) > 0.2 ? 0.34 : 0.18;
  m.seekerHalo.scale.set(blink, blink, 1);
}
