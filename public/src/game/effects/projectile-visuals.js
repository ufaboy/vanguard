import * as THREE from 'three';
import { glowSpriteTexture } from './atlas.js';

/** Shared realistic armor-piercing tank shell visuals (PBR body + copper driving band + rear tracer), cached per variant. */
const projectileCache = new Map();

export function createProjectileVisual(colorHex, { radius = 0.14, length = 0.55, glow = 1.0 } = {}) {
  const key = `${colorHex}:${radius}:${length}:${glow}`;
  let entry = projectileCache.get(key);
  if (!entry) {
    const r = radius * 0.52;
    const bodyLen = length * 0.62;
    const ogiveLen = length * 0.34;
    const tipLen = length * 0.2;
    const tailLen = length * 0.16;

    const bodyGeo = new THREE.CylinderGeometry(r * 0.96, r, bodyLen, 12);
    bodyGeo.rotateX(Math.PI / 2);

    const ogiveGeo = new THREE.CylinderGeometry(r * 0.52, r * 0.96, ogiveLen, 12);
    ogiveGeo.rotateX(Math.PI / 2);

    const tipGeo = new THREE.ConeGeometry(r * 0.52, tipLen, 10);
    tipGeo.rotateX(Math.PI / 2);

    const copperBandGeo = new THREE.CylinderGeometry(r * 1.05, r * 1.05, Math.max(0.032, length * 0.08), 12);
    copperBandGeo.rotateX(Math.PI / 2);

    const accentBandGeo = new THREE.CylinderGeometry(r * 1.02, r * 1.02, Math.max(0.035, length * 0.09), 12);
    accentBandGeo.rotateX(Math.PI / 2);

    const boatTailGeo = new THREE.CylinderGeometry(r, r * 0.72, tailLen, 12);
    boatTailGeo.rotateX(Math.PI / 2);

    const tracerGeo = new THREE.ConeGeometry(r * 0.72, Math.max(0.24, length * 0.68), 10, 1, true);
    tracerGeo.rotateX(-Math.PI / 2);
    tracerGeo.translate(0, 0, -Math.max(0.12, length * 0.34));

    const c = new THREE.Color(colorHex);
    const hot = c.clone().lerp(new THREE.Color(0xffffff), 0.45);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3b424d,
      metalness: 0.78,
      roughness: 0.28,
    });
    const ogiveMat = new THREE.MeshStandardMaterial({
      color: 0x222730,
      metalness: 0.82,
      roughness: 0.24,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xd4a448,
      metalness: 0.8,
      roughness: 0.26,
    });
    const copperBandMat = new THREE.MeshStandardMaterial({
      color: 0xc26d38,
      metalness: 0.82,
      roughness: 0.28,
    });
    const accentBandMat = new THREE.MeshStandardMaterial({
      color: c,
      metalness: 0.35,
      roughness: 0.4,
    });
    const tracerMat = new THREE.MeshBasicMaterial({
      color: hot,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const haloMat = new THREE.SpriteMaterial({
      map: glowSpriteTexture(),
      color: c,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.42,
    });
    entry = {
      dims: { bodyLen, ogiveLen, tipLen, tailLen },
      geo: { bodyGeo, ogiveGeo, tipGeo, copperBandGeo, accentBandGeo, boatTailGeo, tracerGeo },
      mat: { bodyMat, ogiveMat, tipMat, copperBandMat, accentBandMat, tracerMat, haloMat },
    };
    projectileCache.set(key, entry);
  }

  const { dims, geo, mat } = entry;
  const group = new THREE.Group();

  const body = new THREE.Mesh(geo.bodyGeo, mat.bodyMat);
  group.add(body);

  const ogive = new THREE.Mesh(geo.ogiveGeo, mat.ogiveMat);
  ogive.position.z = dims.bodyLen * 0.5 + dims.ogiveLen * 0.5;
  group.add(ogive);

  const tip = new THREE.Mesh(geo.tipGeo, mat.tipMat);
  tip.position.z = dims.bodyLen * 0.5 + dims.ogiveLen + dims.tipLen * 0.5;
  group.add(tip);

  const accentBand = new THREE.Mesh(geo.accentBandGeo, mat.accentBandMat);
  accentBand.position.z = dims.bodyLen * 0.32;
  group.add(accentBand);

  const copperBand = new THREE.Mesh(geo.copperBandGeo, mat.copperBandMat);
  copperBand.position.z = -dims.bodyLen * 0.32;
  group.add(copperBand);

  const boatTail = new THREE.Mesh(geo.boatTailGeo, mat.bodyMat);
  boatTail.position.z = -dims.bodyLen * 0.5 - dims.tailLen * 0.5;
  group.add(boatTail);

  const tailZ = -dims.bodyLen * 0.5 - dims.tailLen;
  const tracer = new THREE.Mesh(geo.tracerGeo, mat.tracerMat);
  tracer.position.z = tailZ;
  tracer.renderOrder = 12;
  group.add(tracer);

  const halo = new THREE.Sprite(mat.haloMat);
  halo.position.z = tailZ - 0.08;
  const hs = (radius * 2.2 + length * 0.28) * Math.min(1.25, glow);
  halo.scale.set(hs, hs, 1);
  halo.renderOrder = 11;
  group.add(halo);

  return group;
}

/** Missile palettes: player ATGM (matte ivory + red warhead, bluish-scarlet exhaust) and enemy (gunmetal + cyan). */
const MISSILE_STYLES = {
  player: {
    body: 0xd8d3c3, warhead: 0xb8201c, band: 0xd99b16,
    fin: 0x46523c, seeker: 0xff4b3e, flame: 0xff2e24, flameCore: 0x7ec8ff, halo: 0xd9445c,
  },
  enemy: {
    body: 0x2b3342, warhead: 0x1d6fd8, band: 0x38e8ff,
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
      body: new THREE.MeshStandardMaterial({ color: s.body, metalness: 0.4, roughness: 0.48 }),
      warhead: new THREE.MeshStandardMaterial({
        color: s.warhead, metalness: 0.25, roughness: 0.4,
      }),
      band: new THREE.MeshStandardMaterial({ color: s.band, metalness: 0.25, roughness: 0.42 }),
      fin: new THREE.MeshStandardMaterial({ color: s.fin, metalness: 0.5, roughness: 0.5 }),
      nozzle: new THREE.MeshStandardMaterial({
        color: 0x22262e, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide,
      }),
      seeker: new THREE.MeshBasicMaterial({ color: s.seeker, toneMapped: false }),
      flame: additive(s.flame, 0.72),
      flameCore: additive(s.flameCore, 0.85),
      halo: new THREE.SpriteMaterial({
        map: glowSpriteTexture(),
        color: s.halo,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.34,
      }),
      seekerHalo: new THREE.SpriteMaterial({
        map: glowSpriteTexture(),
        color: s.seeker,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.45,
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
  halo.position.z = -0.44;
  halo.scale.set(0.38, 0.38, 1);
  halo.renderOrder = 11;
  root.add(halo);
  const seekerHalo = new THREE.Sprite(mat.seekerHalo);
  seekerHalo.position.z = 0.45;
  seekerHalo.scale.set(0.14, 0.14, 1);
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
  const hs = 0.34 + Math.random() * 0.1;
  m.halo.scale.set(hs, hs, 1);
  const blink = Math.sin(m.t * 18) > 0.2 ? 0.18 : 0.1;
  m.seekerHalo.scale.set(blink, blink, 1);
}

const artilleryShellCache = new Map();

function artilleryShellAssets(style) {
  let a = artilleryShellCache.get(style);
  if (a) return a;
  const isPlayer = style === 'player';
  const bodyColor = isPlayer ? 0x4b5836 : 0x3b424c;
  const bandColor = isPlayer ? 0xf59e0b : 0xef4444;
  const tracerColor = isPlayer ? 0xffb030 : 0xff5a2a;

  const body = new THREE.CylinderGeometry(0.11, 0.115, 0.42, 12);
  body.rotateX(Math.PI / 2);
  const ogive = new THREE.CylinderGeometry(0.055, 0.11, 0.22, 12);
  ogive.rotateX(Math.PI / 2);
  const fuze = new THREE.ConeGeometry(0.055, 0.14, 10);
  fuze.rotateX(Math.PI / 2);
  const heBand = new THREE.CylinderGeometry(0.116, 0.116, 0.06, 12);
  heBand.rotateX(Math.PI / 2);
  const copperBand = new THREE.CylinderGeometry(0.118, 0.118, 0.045, 12);
  copperBand.rotateX(Math.PI / 2);
  const boatTail = new THREE.CylinderGeometry(0.112, 0.082, 0.1, 12);
  boatTail.rotateX(Math.PI / 2);
  const tracer = new THREE.ConeGeometry(0.075, 0.36, 10, 1, true);
  tracer.rotateX(-Math.PI / 2);
  tracer.translate(0, 0, -0.18);

  a = {
    geo: { body, ogive, fuze, heBand, copperBand, boatTail, tracer },
    mat: {
      body: new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.45, roughness: 0.46 }),
      ogive: new THREE.MeshStandardMaterial({ color: 0x2d333b, metalness: 0.55, roughness: 0.42 }),
      fuze: new THREE.MeshStandardMaterial({ color: 0xd4a448, metalness: 0.72, roughness: 0.32 }),
      heBand: new THREE.MeshStandardMaterial({ color: bandColor, metalness: 0.25, roughness: 0.45 }),
      copperBand: new THREE.MeshStandardMaterial({ color: 0xc26d38, metalness: 0.78, roughness: 0.3 }),
      tracer: new THREE.MeshBasicMaterial({
        color: tracerColor,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      halo: new THREE.SpriteMaterial({
        map: glowSpriteTexture(),
        color: tracerColor,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.65,
      }),
    },
  };
  artilleryShellCache.set(style, a);
  return a;
}

/**
 * Shared-resource 155mm howitzer artillery shell model, nose along +Z.
 * `style`: 'enemy' | 'player'. Resources are cached and must not be disposed by callers.
 */
export function createArtilleryShellVisual(style = 'enemy', scale = 1.15) {
  const { geo, mat } = artilleryShellAssets(style);
  const root = new THREE.Group();
  root.name = 'ArtilleryShell';
  const body = new THREE.Group();
  root.add(body);

  body.add(new THREE.Mesh(geo.body, mat.body));
  const ogive = new THREE.Mesh(geo.ogive, mat.ogive);
  ogive.position.z = 0.32;
  body.add(ogive);

  const fuze = new THREE.Mesh(geo.fuze, mat.fuze);
  fuze.position.z = 0.50;
  body.add(fuze);

  const heBand = new THREE.Mesh(geo.heBand, mat.heBand);
  heBand.position.z = 0.16;
  body.add(heBand);

  const copperBand = new THREE.Mesh(geo.copperBand, mat.copperBand);
  copperBand.position.z = -0.15;
  body.add(copperBand);

  const boatTail = new THREE.Mesh(geo.boatTail, mat.ogive);
  boatTail.position.z = -0.26;
  body.add(boatTail);

  const tracer = new THREE.Mesh(geo.tracer, mat.tracer);
  tracer.position.z = -0.31;
  body.add(tracer);

  const halo = new THREE.Sprite(mat.halo);
  halo.scale.set(0.95, 0.95, 1);
  halo.position.z = -0.34;
  halo.renderOrder = 11;
  body.add(halo);

  if (scale !== 1) root.scale.setScalar(scale);
  return root;
}
