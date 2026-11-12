import test from 'node:test';
import assert from 'node:assert/strict';
import { sound } from '../public/src/game/sound.js';

test('SoundManager handles environment without AudioContext without errors', () => {
  assert.equal(sound.ensureContext(), null);

  // All gameplay sound methods must be safe to invoke with or without position
  assert.doesNotThrow(() => sound.playCannonShot(false, 1));
  assert.doesNotThrow(() => sound.playCannonShot(true, 5, { x: 10, z: -5 }));
  assert.doesNotThrow(() => sound.playExplosion(1.0));
  assert.doesNotThrow(() => sound.playExplosion(1.5, { x: 25, z: 20 }));
  assert.doesNotThrow(() => sound.playExplosionLarge({ x: 30, z: 30 }));
  assert.doesNotThrow(() => sound.playEnvironmentalExplosion({ x: 20, z: 20 }));
  assert.doesNotThrow(() => sound.playSteelHit({ x: 5, z: 5 }));
  assert.doesNotThrow(() => sound.playSteelRicochet({ x: 0, z: 0 }));
  assert.doesNotThrow(() => sound.playArmorHit({ x: 12, z: 12 }));
  assert.doesNotThrow(() => sound.playBrickHit({ x: 8, z: 8 }));
  assert.doesNotThrow(() => sound.playMissileLaunch({ x: 15, z: -10 }));
  assert.doesNotThrow(() => sound.playMinePlant({ x: 2, z: 2 }));
  assert.doesNotThrow(() => sound.playJammerPulse({ x: 18, z: 18 }));
  assert.doesNotThrow(() => sound.playEngineerWeld({ x: 14, z: 14 }));
  assert.doesNotThrow(() => sound.playFlamethrower({ x: 10, z: 10 }));
  assert.doesNotThrow(() => sound.playBossAlarm({ x: 0, z: 30 }));
  assert.doesNotThrow(() => sound.playPowerUp());
  assert.doesNotThrow(() => sound.playCargoLoad());
  assert.doesNotThrow(() => sound.playCargoDeliver());
  assert.doesNotThrow(() => sound.playContractExtract());
});

test('SoundManager distance attenuation drops volume to 20% at visibility boundary', () => {
  sound.setListener(0, 0, 28.0);

  // Non-positional or right at listener: 100% volume
  assert.equal(sound.getSpatialVolume(null), 1.0);
  assert.equal(sound.getSpatialVolume({ x: 0, z: 0 }), 1.0);
  assert.equal(sound.getSpatialVolume({ x: 3.5, z: 0 }), 1.0);

  // Mid-range: volume smoothly drops between 1.0 and 0.20
  const midVol = sound.getSpatialVolume({ x: 16, z: 0 });
  assert.ok(midVol > 0.20 && midVol < 1.0, `Expected mid volume ~0.50-0.60, got ${midVol}`);

  // At the exact standard visibility boundary (28 units away): exactly 0.20 (20%)
  const sightVol = sound.getSpatialVolume({ x: 28, z: 0 });
  assert.ok(Math.abs(sightVol - 0.20) < 0.001, `Expected 0.20 at sight boundary, got ${sightVol}`);

  // Beyond standard visibility (>28 units): remains around 10-20%
  const farVol = sound.getSpatialVolume({ x: 45, z: 0 });
  assert.ok(farVol <= 0.20 && farVol >= 0.10, `Expected 0.10-0.20 beyond visibility, got ${farVol}`);
});

test('SoundManager missile flight attenuation scales smoothly from 100% down to 50%', () => {
  sound.setListener(0, 0, 28.0);

  // Near the player: 100% (1.0)
  assert.equal(sound.getMissileFlightFactor(null), 1.0);
  assert.equal(sound.getMissileFlightFactor({ x: 0, z: 0 }), 1.0);

  // Mid-range: smoothly between 1.0 and 0.50
  const midFlight = sound.getMissileFlightFactor({ x: 14, z: 0 });
  assert.ok(midFlight > 0.50 && midFlight < 1.0, `Expected mid flight factor ~0.75, got ${midFlight}`);

  // At sight boundary (28 units): exactly 50% (0.50)
  const boundaryFlight = sound.getMissileFlightFactor({ x: 28, z: 0 });
  assert.ok(Math.abs(boundaryFlight - 0.50) < 0.001, `Expected 0.50 at sight boundary, got ${boundaryFlight}`);

  // Beyond boundary: clamped at 50% (0.50)
  const farFlight = sound.getMissileFlightFactor({ x: 50, z: 0 });
  assert.equal(farFlight, 0.50);

  // Safe to call loop lifecycle without AudioContext
  const handle = sound.startMissileLoop({ x: 0, z: 0 });
  assert.equal(handle, null);
  assert.doesNotThrow(() => sound.updateMissileLoop(null, { x: 10, z: 10 }));
  assert.doesNotThrow(() => sound.stopMissileLoop(null));

  // Safe to call diesel engine loop lifecycle without AudioContext
  assert.doesNotThrow(() => sound.startEngineLoop());
  assert.doesNotThrow(() => sound.updateEngineLoop(0.75, false));
  assert.doesNotThrow(() => sound.updateEngineLoop(0, true));
  assert.doesNotThrow(() => sound.stopEngineLoop());
});

test('SoundManager mutes master/engine gain and suspends AudioContext on pause or disable', () => {
  const calls = [];
  const fakeCtx = {
    currentTime: 10,
    state: 'running',
    suspend() {
      this.state = 'suspended';
      calls.push('suspend');
      return Promise.resolve();
    },
    resume() {
      this.state = 'running';
      calls.push('resume');
      return Promise.resolve();
    },
  };
  const masterGains = [];
  const engineGains = [];
  const mgr = Object.assign(Object.create(Object.getPrototypeOf(sound)), {
    ctx: fakeCtx,
    _enabled: true,
    paused: false,
    masterGain: { gain: { setTargetAtTime: (v) => masterGains.push(v) } },
    engineGain: { gain: { setTargetAtTime: (v) => engineGains.push(v) } },
    engineSource: {},
    engineActive: true,
    buffers: {},
  });

  mgr.setPaused(true);
  assert.equal(masterGains.at(-1), 0);
  assert.equal(engineGains.at(-1), 0);
  assert.equal(calls.at(-1), 'suspend');
  assert.equal(mgr.ensureContext(), null);

  // Unpausing while muted keeps audio suspended/muted
  mgr.enabled = false;
  mgr.setPaused(false);
  assert.equal(fakeCtx.state, 'suspended');
  assert.equal(masterGains.at(-1), 0);

  // Re-enabling while unpaused restores gain and resumes context
  mgr.enabled = true;
  assert.equal(fakeCtx.state, 'running');
  assert.equal(masterGains.at(-1), 0.68);
});
