/**
 * 4-tier tank visual damage state (100% intact + >75%, <=75%, <=50%, <=25%):
 * - Material darkening / soot charring (reversible upon repair)
 * - Multi-layered engine-deck smoke, hot ember motes, short-circuit sparks,
 *   and flickering fire + heat bloom at critical HP.
 */
import { DURABILITY } from '../constants.js';
import { markMaterialOwned } from '../render/dispose.js';
import { FxTex, RAMP_FIRE, RAMP_HOT_SMOKE, RAMP_SMOKE, rand } from './atlas.js';

const DAMAGE_TIER = Object.freeze({
  INTACT: 0, // 100% HP
  SCRATCHED: 1, // > 75% and < 100%
  DAMAGED: 2, // <= 75% and > 50%
  HEAVY: 3, // <= 50% and > 25%
  CRITICAL: 4, // <= 25% and > 0%
});

const TIER_VISUALS = Object.freeze({
  [DAMAGE_TIER.INTACT]: Object.freeze({
    colorScale: 1.0,
    minRoughness: 0,
    emissiveHex: null,
    emissiveIntensity: 0,
    smokeRate: 0,
    sparkRate: 0,
    fireRate: 0,
    emberRate: 0,
    glowRate: 0,
  }),
  [DAMAGE_TIER.SCRATCHED]: Object.freeze({
    colorScale: 0.91,
    minRoughness: 0.52,
    emissiveHex: null,
    emissiveIntensity: 0,
    smokeRate: 2.2,
    smokeColor: [0.68, 0.7, 0.73],
    smokeAlpha: 0.28,
    smokeSize0: 0.22,
    smokeSize1: 0.82,
    smokeLife: [0.85, 1.35],
    smokeVy: [0.95, 1.55],
    smokeRamp: RAMP_SMOKE,
    sparkRate: 0,
    fireRate: 0,
    emberRate: 0,
    glowRate: 0,
  }),
  [DAMAGE_TIER.DAMAGED]: Object.freeze({
    colorScale: 0.78,
    minRoughness: 0.68,
    emissiveHex: null,
    emissiveIntensity: 0,
    smokeRate: 5.5,
    smokeColor: [0.24, 0.24, 0.27],
    smokeAlpha: 0.5,
    smokeSize0: 0.28,
    smokeSize1: 1.12,
    smokeLife: [1.05, 1.6],
    smokeVy: [1.15, 1.9],
    smokeRamp: RAMP_SMOKE,
    sparkRate: 1.2,
    sparkCount: 4,
    fireRate: 0,
    emberRate: 0,
    glowRate: 0,
  }),
  [DAMAGE_TIER.HEAVY]: Object.freeze({
    colorScale: 0.58,
    minRoughness: 0.82,
    emissiveHex: 0x160703,
    emissiveIntensity: 0.18,
    smokeRate: 10.5,
    smokeColor: [0.14, 0.13, 0.15],
    smokeAlpha: 0.72,
    smokeSize0: 0.36,
    smokeSize1: 1.48,
    smokeLife: [1.2, 1.95],
    smokeVy: [1.35, 2.3],
    smokeRamp: RAMP_HOT_SMOKE,
    sparkRate: 2.8,
    sparkCount: 6,
    fireRate: 0,
    emberRate: 3.5,
    glowRate: 4.0,
    glowAlpha: 0.2,
    glowSize: 0.95,
  }),
  [DAMAGE_TIER.CRITICAL]: Object.freeze({
    colorScale: 0.4,
    minRoughness: 0.93,
    emissiveHex: 0x330d04,
    emissiveIntensity: 0.45,
    smokeRate: 15.0,
    smokeColor: [0.07, 0.07, 0.08],
    smokeAlpha: 0.86,
    smokeSize0: 0.42,
    smokeSize1: 1.75,
    smokeLife: [1.35, 2.2],
    smokeVy: [1.65, 2.75],
    smokeRamp: RAMP_HOT_SMOKE,
    sparkRate: 5.5,
    sparkCount: 8,
    fireRate: 11.0,
    emberRate: 9.0,
    glowRate: 8.0,
    glowAlpha: 0.38,
    glowSize: 1.35,
  }),
});

/**
 * Computes the visual damage tier (0..4) from current and max HP.
 * @param {number} hp
 * @param {number} maxHp
 * @returns {number}
 */
export function getTankDamageTier(hp, maxHp) {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return DAMAGE_TIER.INTACT;
  }
  if (hp >= maxHp - DURABILITY.ZERO_HP) return DAMAGE_TIER.INTACT;
  if (hp <= DURABILITY.ZERO_HP) return DAMAGE_TIER.CRITICAL;
  const ratio = hp / maxHp;
  if (ratio > DURABILITY.LIGHT_RATIO) return DAMAGE_TIER.SCRATCHED;
  if (ratio > DURABILITY.MEDIUM_RATIO) return DAMAGE_TIER.DAMAGED;
  if (ratio > DURABILITY.LOW_RATIO) return DAMAGE_TIER.HEAVY;
  return DAMAGE_TIER.CRITICAL;
}

function shouldSkipDamageTint(obj, rig) {
  if (!obj.isMesh) return true;
  if (
    obj === rig.shadowMesh ||
    obj === rig.muzzleFlash ||
    obj === rig.hpBarFill ||
    obj === rig.hpBarBg ||
    obj === rig.cookOffRingMesh
  ) {
    return true;
  }
  const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
  if (!mat) return true;
  if (mat.depthWrite === false && mat.transparent) return true;
  return false;
}

function ensureDamageMaterialClone(mat) {
  if (!mat || typeof mat.clone !== 'function') return mat;
  if (mat.userData?._damageCloned) return mat;
  const cloned = markMaterialOwned(mat.clone());
  cloned.userData = {
    ...(mat.userData || {}),
    _damageCloned: true,
    _baseColor: cloned.color ? cloned.color.clone() : null,
    _baseRoughness: typeof cloned.roughness === 'number' ? cloned.roughness : null,
    _baseEmissive: cloned.emissive ? cloned.emissive.clone() : null,
    _baseEmissiveIntensity:
      typeof cloned.emissiveIntensity === 'number' ? cloned.emissiveIntensity : 0,
  };
  return cloned;
}

function applyTierToMaterial(mat, spec) {
  if (!mat?.userData?._damageCloned) return;
  const ud = mat.userData;
  if (mat.color && ud._baseColor) {
    mat.color.copy(ud._baseColor).multiplyScalar(spec.colorScale);
  }
  if (typeof mat.roughness === 'number' && ud._baseRoughness !== null) {
    mat.roughness =
      spec.colorScale >= 1.0
        ? ud._baseRoughness
        : Math.max(ud._baseRoughness, spec.minRoughness);
  }
  if (mat.emissive && ud._baseEmissive) {
    if (spec.emissiveHex !== null && ud._baseEmissiveIntensity < 0.5) {
      mat.emissive.setHex(spec.emissiveHex);
      mat.emissiveIntensity = Math.max(ud._baseEmissiveIntensity, spec.emissiveIntensity);
    } else {
      mat.emissive.copy(ud._baseEmissive);
      mat.emissiveIntensity = ud._baseEmissiveIntensity;
    }
  }
}

/**
 * Updates hull/turret material charring when a tank's damage tier changes.
 * Restores original materials when repaired back to 100%.
 * @param {object} rig
 * @param {number} tier
 */
export function syncTankDamageMaterials(rig, tier) {
  if (!rig?.root?.traverse) return;
  rig.root.userData = rig.root.userData || {};
  if (rig.root.userData.damageTier === tier) return;
  const prevTier = rig.root.userData.damageTier ?? DAMAGE_TIER.INTACT;
  rig.root.userData.damageTier = tier;
  if (prevTier === DAMAGE_TIER.INTACT && tier === DAMAGE_TIER.INTACT) return;

  const spec = TIER_VISUALS[tier] || TIER_VISUALS[DAMAGE_TIER.INTACT];
  rig.root.traverse((obj) => {
    if (shouldSkipDamageTint(obj, rig)) return;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => {
        const cloned = ensureDamageMaterialClone(m);
        applyTierToMaterial(cloned, spec);
        return cloned;
      });
    } else if (obj.material) {
      const cloned = ensureDamageMaterialClone(obj.material);
      applyTierToMaterial(cloned, spec);
      obj.material = cloned;
    }
  });
}

function emitShortCircuitSparks(fx, x, y, z, count, scale, warm) {
  const color = warm ? [1.0, 0.72, 0.25] : [0.85, 0.92, 1.0];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const h = rand(1.6, 5.2) * scale;
    fx.streak({
      x,
      y,
      z,
      vx: Math.cos(a) * h,
      vy: rand(1.2, 4.4),
      vz: Math.sin(a) * h,
      gravity: 16,
      drag: 1.6,
      life: rand(0.18, 0.42),
      len: 0.028,
      width: 0.045,
      color,
    });
  }
  fx.point('glow', {
    x,
    y,
    z,
    life: 0.11,
    size: 0.42 * scale,
    size1: 0.6 * scale,
    tex: FxTex.GLOW,
    color,
    alpha: 0.45,
  });
}

/**
 * Emits layered engine-deck smoke, rising ember motes, short-circuit sparks,
 * and critical-tier fire tongues + heat bloom according to damage tier.
 * @param {object} fx
 * @param {object} state  Mutable tank or controller object holding accumulators
 * @param {number} dt
 * @param {object} opts
 */
export function stepTankDamageParticles(
  fx,
  state,
  dt,
  { x, y = 0, z, hullAngle = 0, tier = 0, scale = 1, subsystems = null }
) {
  if (!fx || !state || dt <= 0) return;

  const engineDamaged = Boolean(subsystems?.engine && subsystems.engine.hp < subsystems.engine.maxHp * 0.5);
  const trackDamaged = Boolean(
    (subsystems?.leftTrack && subsystems.leftTrack.hp < subsystems.leftTrack.maxHp * 0.5) ||
      (subsystems?.rightTrack && subsystems.rightTrack.hp < subsystems.rightTrack.maxHp * 0.5)
  );

  if (tier <= DAMAGE_TIER.INTACT && !engineDamaged && !trackDamaged) {
    state._dmgSmokeAccum = 0;
    state._dmgSparkAccum = 0;
    state._dmgFireAccum = 0;
    state._dmgEmberAccum = 0;
    state._dmgGlowAccum = 0;
    return;
  }

  const effectiveTier = engineDamaged ? Math.max(tier, DAMAGE_TIER.DAMAGED) : tier;
  const spec = TIER_VISUALS[effectiveTier] || TIER_VISUALS[DAMAGE_TIER.DAMAGED];

  // Rear engine deck world position (forward is +sin(hullAngle), +cos(hullAngle))
  const rearDist = 0.68 * scale;
  const deckX = x - Math.sin(hullAngle) * rearDist;
  const deckZ = z - Math.cos(hullAngle) * rearDist;
  const deckY = y + 0.56 * scale;

  // 1. Billowing engine-deck smoke plume
  const smokeRate = spec.smokeRate + (engineDamaged ? 3.5 : 0);
  if (smokeRate > 0) {
    state._dmgSmokeAccum = (state._dmgSmokeAccum || 0) + dt * smokeRate;
    const count = Math.min(3, Math.floor(state._dmgSmokeAccum));
    if (count > 0) {
      state._dmgSmokeAccum -= count;
      for (let i = 0; i < count; i++) {
        fx.point('smoke', {
          x: deckX + rand(-0.24, 0.24) * scale,
          y: deckY + rand(0, 0.14),
          z: deckZ + rand(-0.24, 0.24) * scale,
          vx: rand(-0.42, 0.42),
          vy: rand(spec.smokeVy[0], spec.smokeVy[1]),
          vz: rand(-0.42, 0.42),
          drag: 1.05,
          gravity: -0.35,
          life: rand(spec.smokeLife[0], spec.smokeLife[1]),
          size: spec.smokeSize0 * scale,
          size1: spec.smokeSize1 * scale,
          color: spec.smokeColor,
          alpha: spec.smokeAlpha,
          tex: FxTex.SMOKE,
          ramp: spec.smokeRamp,
          fadeIn: 0.09,
          rotV: rand(-1.4, 1.4),
        });
      }
    }
  }

  // 2. Short-circuit & damaged track/hull sparks
  const sparkRate = spec.sparkRate + (trackDamaged ? 1.4 : 0);
  if (sparkRate > 0) {
    state._dmgSparkAccum = (state._dmgSparkAccum || 0) + dt * sparkRate;
    if (state._dmgSparkAccum >= 1) {
      state._dmgSparkAccum -= Math.floor(state._dmgSparkAccum);
      const lowTrackHit = trackDamaged && Math.random() < 0.5;
      const sx = x + rand(-0.5, 0.5) * scale;
      const sz = z + rand(-0.5, 0.5) * scale;
      const sy = y + (lowTrackHit ? rand(0.18, 0.35) : rand(0.45, 0.92)) * scale;
      emitShortCircuitSparks(
        fx,
        sx,
        sy,
        sz,
        spec.sparkCount || 3,
        scale,
        effectiveTier >= DAMAGE_TIER.HEAVY || lowTrackHit
      );
    }
  }

  // 3. Smoldering heat bloom on engine deck (<=50% and <=25%)
  if (spec.glowRate > 0) {
    state._dmgGlowAccum = (state._dmgGlowAccum || 0) + dt * spec.glowRate;
    if (state._dmgGlowAccum >= 1) {
      state._dmgGlowAccum -= Math.floor(state._dmgGlowAccum);
      fx.point('glow', {
        x: deckX + rand(-0.1, 0.1) * scale,
        y: deckY + 0.08,
        z: deckZ + rand(-0.1, 0.1) * scale,
        vy: 0.35,
        life: rand(0.22, 0.36),
        size: spec.glowSize * 0.75 * scale,
        size1: spec.glowSize * scale,
        tex: FxTex.GLOW,
        color: [1.0, 0.42, 0.08],
        alpha: spec.glowAlpha,
      });
    }
  }

  // 4. Rising hot ember motes (<=50% and <=25%)
  if (spec.emberRate > 0) {
    state._dmgEmberAccum = (state._dmgEmberAccum || 0) + dt * spec.emberRate;
    const emberCount = Math.min(2, Math.floor(state._dmgEmberAccum));
    if (emberCount > 0) {
      state._dmgEmberAccum -= emberCount;
      for (let i = 0; i < emberCount; i++) {
        fx.point('glow', {
          x: deckX + rand(-0.22, 0.22) * scale,
          y: deckY + rand(0.05, 0.25),
          z: deckZ + rand(-0.22, 0.22) * scale,
          vx: rand(-0.65, 0.65),
          vy: rand(2.1, 3.9),
          vz: rand(-0.65, 0.65),
          drag: 1.4,
          gravity: -0.4,
          life: rand(0.55, 1.05),
          size: 0.12 * scale,
          size1: 0.04 * scale,
          tex: FxTex.MOTE,
          ramp: RAMP_FIRE,
          alpha: 0.9,
          rotV: rand(-2, 2),
        });
      }
    }
  }

  // 5. Layered fire tongues (<=25% critical): inner bright core + outer flame billows
  if (spec.fireRate > 0) {
    state._dmgFireAccum = (state._dmgFireAccum || 0) + dt * spec.fireRate;
    const fireCount = Math.min(2, Math.floor(state._dmgFireAccum));
    if (fireCount > 0) {
      state._dmgFireAccum -= fireCount;
      for (let i = 0; i < fireCount; i++) {
        const fxX = deckX + rand(-0.18, 0.18) * scale;
        const fxZ = deckZ + rand(-0.18, 0.18) * scale;
        const fxY = deckY + rand(0.02, 0.14);
        // Outer flame billow
        fx.point('glow', {
          x: fxX,
          y: fxY,
          z: fxZ,
          vx: rand(-0.35, 0.35),
          vy: rand(1.4, 2.6),
          vz: rand(-0.35, 0.35),
          drag: 2.1,
          life: rand(0.24, 0.44),
          size: 0.36 * scale,
          size1: 0.84 * scale,
          tex: FxTex.FIRE,
          ramp: RAMP_FIRE,
          alpha: 0.88,
          rotV: rand(-3.0, 3.0),
        });
        // Hot inner flame tongue
        if (Math.random() < 0.65) {
          fx.point('glow', {
            x: fxX + rand(-0.06, 0.06),
            y: fxY + 0.04,
            z: fxZ + rand(-0.06, 0.06),
            vx: rand(-0.18, 0.18),
            vy: rand(1.8, 3.0),
            vz: rand(-0.18, 0.18),
            drag: 2.6,
            life: rand(0.14, 0.24),
            size: 0.22 * scale,
            size1: 0.42 * scale,
            tex: FxTex.FIRE,
            ramp: RAMP_FIRE,
            alpha: 0.95,
            rotV: rand(-4.0, 4.0),
          });
        }
      }
    }
  }
}
