/**
 * Directional Armor Ballistics, Impact Angle Ricochets (70 deg),
 * Add-on Armor Panel Absorption, and Internal Subsystem Hit Routing.
 */

export function worldToLocalYaw(point, origin, yaw = 0) {
  const dx = (point.x || 0) - (origin.x || 0);
  const dy = (point.y || 0) - (origin.y || 0);
  const dz = (point.z || 0) - (origin.z || 0);
  // Invert Three.js Y rotation: world forward is (sin(yaw), cos(yaw)).
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: dx * cos - dz * sin,
    y: dy,
    z: dx * sin + dz * cos,
  };
}

export function intersectSegmentAABB(p0, p1, halfExtents) {
  let tMin = 0;
  let tMax = 1;
  const dirs = [
    ['x', halfExtents.x || 1],
    ['y', halfExtents.y || 1],
    ['z', halfExtents.z || 1],
  ];

  for (const [axis, h] of dirs) {
    const start = p0[axis] || 0;
    const delta = (p1[axis] || 0) - start;
    if (Math.abs(delta) < 1e-8) {
      if (start < -h || start > h) return null;
    } else {
      const invD = 1 / delta;
      let t1 = (-h - start) * invD;
      let t2 = (h - start) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }

  return { t: tMin };
}

export function determineHitAspect(target, hitPoint, zone = 'hull') {
  const refYaw =
    zone === 'turret'
      ? target.turretYaw ?? target.turretAngle ?? target.hullYaw ?? 0
      : target.hullYaw ?? target.hullAngle ?? 0;

  const local = worldToLocalYaw(hitPoint, target, refYaw);
  const absX = Math.abs(local.x);
  const absZ = Math.abs(local.z);

  if (absZ >= absX * 0.85) {
    return local.z >= 0 ? 'front' : 'rear';
  }
  return local.x >= 0 ? 'right' : 'left';
}

export function resolveArmorHit({
  projectile,
  target,
  hitPoint,
  hitZone = 'hull',
}) {
  const aspect = determineHitAspect(target, hitPoint, hitZone);
  const refYaw =
    hitZone === 'turret'
      ? target.turretYaw ?? target.turretAngle ?? target.hullYaw ?? 0
      : target.hullYaw ?? target.hullAngle ?? 0;

  let normalAngle = refYaw;
  if (aspect === 'rear') normalAngle = refYaw + Math.PI;
  else if (aspect === 'right') normalAngle = refYaw + Math.PI * 0.5;
  else if (aspect === 'left') normalAngle = refYaw - Math.PI * 0.5;

  const nx = Math.sin(normalAngle);
  const nz = Math.cos(normalAngle);
  const pSpeed = Math.hypot(projectile.vx || 0, projectile.vz || 0) || 1;
  const ivx = -(projectile.vx || 0) / pSpeed;
  const ivz = -(projectile.vz || 0) / pSpeed;

  const cosTheta = Math.max(0.05, Math.min(1, ivx * nx + ivz * nz));
  const impactAngleDeg = (Math.acos(cosTheta) * 180) / Math.PI;
  const ricochetThreshold = projectile.ricochetAngleDeg ?? 70;

  if (impactAngleDeg >= ricochetThreshold) {
    return {
      outcome: 'ricochet',
      aspect,
      zone: hitZone,
      impactAngleDeg,
      effectiveArmor: 999,
      damageDealt: 0,
      moduleDamage: 0,
      subsystemTarget: null,
    };
  }

  // Check mounted add-on armor panels first
  const socketMap = {
    front: hitZone === 'turret' ? 'SOCKET_ARMOR_TURRET' : 'SOCKET_ARMOR_FRONT',
    left: 'SOCKET_ARMOR_LEFT',
    right: 'SOCKET_ARMOR_RIGHT',
  };
  const panelSocket = socketMap[aspect];
  const panel = panelSocket && target.armorPanels ? target.armorPanels[panelSocket] : null;

  let remainingPen = projectile.penetration ?? 120;
  let panelBroke = false;

  if (panel && !panel.destroyed && panel.integrity > 0) {
    const panelRes = panel.ballisticResistance || 30;
    const integrityDamage = Math.max(12, (projectile.baseDamage || 100) * 0.18);
    panel.integrity = Math.max(0, panel.integrity - integrityDamage);
    if (panel.integrity <= 0) {
      panel.destroyed = true;
      panelBroke = true;
    }
    if (remainingPen <= panelRes) {
      return {
        outcome: 'panel_stopped',
        aspect,
        zone: hitZone,
        impactAngleDeg,
        effectiveArmor: panelRes,
        panelBroke,
        damageDealt: 0,
        moduleDamage: 0,
        subsystemTarget: null,
      };
    }
    remainingPen -= panelRes * 0.65;
  }

  const partDef = hitZone === 'turret' ? target.turret : target.hull;
  const baseThickness = partDef?.armor?.[aspect] ?? 80;
  const effectiveArmor = baseThickness / Math.max(0.25, cosTheta);

  let subsystemTarget = null;
  if (hitZone === 'turret') {
    subsystemTarget = aspect === 'front' ? 'cannon' : 'turretDrive';
  } else if (aspect === 'left') {
    subsystemTarget = 'leftTrack';
  } else if (aspect === 'right') {
    subsystemTarget = 'rightTrack';
  } else if (aspect === 'rear') {
    subsystemTarget = 'engine';
  } else {
    subsystemTarget = 'stabilizer';
  }

  if (remainingPen < effectiveArmor) {
    return {
      outcome: 'non_penetration',
      aspect,
      zone: hitZone,
      impactAngleDeg,
      effectiveArmor,
      panelBroke,
      damageDealt: 0,
      moduleDamage: (projectile.moduleDamage || 20) * 0.35,
      subsystemTarget,
    };
  }

  const finalDamage = projectile.baseDamage || 120;

  return {
    outcome: 'penetration',
    aspect,
    zone: hitZone,
    impactAngleDeg,
    effectiveArmor,
    panelBroke,
    damageDealt: finalDamage,
    moduleDamage: projectile.moduleDamage || 25,
    subsystemTarget,
  };
}
