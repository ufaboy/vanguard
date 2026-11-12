/**
 * Mechanical Tank Subsystems (Left/Right Tracks, Engine, Turret Ring, Main Gun Breech, Gyro Stabilizer),
 * Automatic Field Track Repair, and RM-1 Field Repair Kit Channeling.
 */

export function createTankSubsystems() {
  return {
    leftTrack: {
      id: 'leftTrack',
      hp: 100,
      maxHp: 100,
      status: 'normal',
      fieldRepairState: 'idle',
      fieldRepairTimer: 0,
      fieldRepairProgress: 0,
    },
    rightTrack: {
      id: 'rightTrack',
      hp: 100,
      maxHp: 100,
      status: 'normal',
      fieldRepairState: 'idle',
      fieldRepairTimer: 0,
      fieldRepairProgress: 0,
    },
    engine: {
      id: 'engine',
      hp: 120,
      maxHp: 120,
      status: 'normal',
      fieldRepairState: 'idle',
      fieldRepairTimer: 0,
      fieldRepairProgress: 0,
    },
    turretDrive: {
      id: 'turretDrive',
      hp: 100,
      maxHp: 100,
      status: 'normal',
      fieldRepairState: 'idle',
      fieldRepairTimer: 0,
      fieldRepairProgress: 0,
    },
    cannon: {
      id: 'cannon',
      hp: 100,
      maxHp: 100,
      status: 'normal',
      fieldRepairState: 'idle',
      fieldRepairTimer: 0,
      fieldRepairProgress: 0,
    },
    stabilizer: {
      id: 'stabilizer',
      hp: 90,
      maxHp: 90,
      status: 'normal',
      fieldRepairState: 'idle',
      fieldRepairTimer: 0,
      fieldRepairProgress: 0,
    },
  };
}

export function applySubsystemDamage(subsystems, subsystemId, amount) {
  if (!subsystems || !subsystemId || !subsystems[subsystemId]) {
    return { destroyed: false };
  }
  const sub = subsystems[subsystemId];
  const prevHp = sub.hp;
  sub.hp = Math.max(0, sub.hp - Math.max(0, amount));

  if (sub.hp <= 0) {
    sub.status = 'destroyed';
    if (
      (subsystemId === 'leftTrack' || subsystemId === 'rightTrack') &&
      sub.fieldRepairState === 'idle'
    ) {
      sub.fieldRepairState = 'waiting';
      sub.fieldRepairTimer = 0;
      sub.fieldRepairProgress = 0;
    }
  } else if (sub.hp < sub.maxHp * 0.5) {
    sub.status = 'damaged';
  } else {
    sub.status = 'normal';
  }

  return {
    destroyed: prevHp > 0 && sub.hp <= 0,
    status: sub.status,
  };
}

export function computeSubsystemModifiers(subsystems) {
  if (!subsystems) {
    return {
      speedMultiplier: 1.0,
      turnMultiplier: 1.0,
      turretTurnMultiplier: 1.0,
      reloadMultiplier: 1.0,
      dispersionMultiplier: 1.0,
      immobilized: false,
      asymmetricPull: 0,
    };
  }

  const lTrack = subsystems.leftTrack;
  const rTrack = subsystems.rightTrack;
  const eng = subsystems.engine;
  const tur = subsystems.turretDrive;
  const gun = subsystems.cannon;
  const stab = subsystems.stabilizer;

  const leftDown = lTrack && lTrack.hp <= 0;
  const rightDown = rTrack && rTrack.hp <= 0;
  const engDown = eng && eng.hp <= 0;

  const immobilized = Boolean((leftDown && rightDown) || engDown);
  let asymmetricPull = 0;
  if (leftDown && !rightDown) asymmetricPull = -1;
  else if (rightDown && !leftDown) asymmetricPull = 1;

  let speedMultiplier = 1.0;
  if (immobilized) speedMultiplier = 0;
  else {
    if (leftDown || rightDown) speedMultiplier *= 0.45;
    else if (
      (lTrack && lTrack.status === 'damaged') ||
      (rTrack && rTrack.status === 'damaged')
    ) {
      speedMultiplier *= 0.78;
    }
    if (eng && eng.status === 'damaged') speedMultiplier *= 0.72;
  }

  const turnMultiplier = immobilized
    ? 0.15
    : leftDown || rightDown
    ? 0.5
    : 1.0;

  const turretTurnMultiplier =
    tur && tur.hp <= 0 ? 0.25 : tur && tur.status === 'damaged' ? 0.65 : 1.0;

  const reloadMultiplier =
    gun && gun.hp <= 0 ? 1.6 : gun && gun.status === 'damaged' ? 1.25 : 1.0;

  const dispersionMultiplier =
    stab && stab.hp <= 0 ? 1.75 : stab && stab.status === 'damaged' ? 1.3 : 1.0;

  return {
    speedMultiplier,
    turnMultiplier,
    turretTurnMultiplier,
    reloadMultiplier,
    dispersionMultiplier,
    immobilized,
    asymmetricPull,
  };
}

export function stepAutomaticTrackRepair(subsystems, dt) {
  if (!subsystems) return;
  for (const key of ['leftTrack', 'rightTrack']) {
    const trk = subsystems[key];
    if (!trk) continue;
    if (trk.hp > 0) {
      trk.fieldRepairState = 'idle';
      trk.fieldRepairTimer = 0;
      trk.fieldRepairProgress = 0;
      continue;
    }
    if (trk.fieldRepairState === 'waiting') {
      trk.fieldRepairTimer += dt;
      if (trk.fieldRepairTimer >= 7.0) {
        trk.fieldRepairState = 'repairing';
        trk.fieldRepairProgress = 0;
      }
    } else if (trk.fieldRepairState === 'repairing') {
      trk.fieldRepairProgress += dt;
      if (trk.fieldRepairProgress >= 4.0) {
        trk.hp = Math.round(trk.maxHp * 0.3);
        trk.status = 'damaged';
        trk.fieldRepairState = 'idle';
        trk.fieldRepairTimer = 0;
        trk.fieldRepairProgress = 0;
      }
    } else {
      trk.fieldRepairState = 'waiting';
      trk.fieldRepairTimer = 0;
    }
  }
}

export function createRepairKitState(initialCharges = 0) {
  const maxCharges = 2;
  const charges = Number.isFinite(initialCharges)
    ? Math.max(0, Math.min(maxCharges, Math.floor(initialCharges)))
    : 0;
  return {
    charges, maxCharges, cooldown: 0, cooldownDuration: 45,
    channeling: false, channelProgress: 0, channelDuration: 10,
    restoreAmount: 25,
  };
}

export function activateRepairKit(state, subsystems, needsRepair = false) {
  if (!state) return { started: false, reason: 'Unavailable' };
  if (state.channeling) return { started: false, reason: 'Repair in progress' };
  if (state.charges <= 0) return { started: false, reason: 'Collect a surplus REPAIR power-up' };
  if (state.cooldown > 0) return { started: false, reason: `Cooldown ${state.cooldown.toFixed(1)}s` };
  const damaged = Object.values(subsystems || {}).some(sub => sub.hp < sub.maxHp);
  if (!needsRepair && !damaged) return { started: false, reason: 'No repairs needed' };
  for (const sub of Object.values(subsystems || {})) {
    sub.hp = sub.maxHp;
    sub.status = 'normal';
    sub.fieldRepairState = 'idle';
    sub.fieldRepairTimer = 0;
    sub.fieldRepairProgress = 0;
  }
  state.charges--;
  state.channeling = true;
  state.channelProgress = 0;
  return { started: true };
}

export function stepRepairKit(state, subsystems, dt) {
  if (!state) return null;
  const elapsed = Math.max(0, dt);
  state.cooldown = Math.max(0, state.cooldown - elapsed);
  if (!state.channeling) return null;
  const appliedTime = Math.min(elapsed, state.channelDuration - state.channelProgress);
  state.channelProgress += appliedTime;
  const completed = state.channelProgress >= state.channelDuration;
  if (completed) {
    state.channeling = false;
    state.cooldown = state.cooldownDuration;
  }
  return { completed, healing: state.restoreAmount * appliedTime / state.channelDuration };
}
