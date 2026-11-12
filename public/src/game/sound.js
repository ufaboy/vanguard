/**
 * Audio Engine for IRON VANGUARD.
 *
 * Dedicated to high-fidelity, author-provided audio recordings (.ogg / .wav):
 * - Clean asynchronous asset preloading with zero latency AudioBuffer playback
 * - Real-time distance attenuation (drop to 20% at sight radius) and atmospheric air absorption
 * - Subtle pitch variation per playback to eliminate robotic repetition
 * - Master DynamicsCompressor to maintain headroom during heavy firefights
 */

// High-fidelity author-provided audio assets (.ogg) mapped to internal sound buffers
const AUDIO_ASSETS = {
  cannon_std: 'audio/cannon_shot.ogg',
  cannon_heavy: 'audio/heavy_howitzer_fire.ogg',
  armor_hit: 'audio/cannon_impact.ogg',
  brick_hit: 'audio/tank_masonry_projectile_impact.ogg',
  aps_intercept: 'audio/tank_aps_countermunition_fire.ogg',
  explosion_std: 'audio/atgm_impact_explosion.ogg',
  explosion_large: 'audio/heavy_artillery_he_impact.ogg',
  explosion_env: 'audio/environmental_explosion.ogg',
  tank_destruction: 'audio/tank_destruction.ogg',
  missile: 'audio/atgm_launch.ogg',
  atgm_loop: 'audio/atgm_rocket_motor_loop.ogg',
  boss_alarm: 'audio/tank_boss_entrance.ogg',
  flame: 'audio/tank_flamethrower_fire.ogg',
  weld: 'audio/tank_repair_loop_small.ogg',
  engine_loop: 'audio/tank_heavy_diesel_idle_loop_compact.ogg',
};

class SoundManager {
  constructor() {
    this.ctx = null;
    this._enabled = true;
    this.paused = false;
    this.masterGain = null;
    this.compressor = null;
    this.buffers = null;
    this.lastPlayTime = new Map();
    this.listenerX = 0;
    this.listenerZ = 0;
    this.sightRadius = 28.0;
    this.audioFilesLoading = false;
    this.engineSource = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.engineActive = false;
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(val) {
    this.setEnabled(val);
  }

  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
    this.syncOutputState();
  }

  setPaused(paused) {
    const next = Boolean(paused);
    if (this.paused === next) return;
    this.paused = next;
    this.syncOutputState();
  }

  // Synchronizes master gain, engine loop, and AudioContext suspension with enabled + pause state
  syncOutputState() {
    const active = this._enabled && !this.paused;
    if (this.ctx) {
      const now = this.ctx.currentTime ?? 0;
      if (this.masterGain?.gain) {
        this.masterGain.gain.setTargetAtTime(active ? 0.68 : 0, now, 0.02);
      }
      if (!active && this.engineGain?.gain) {
        this.engineGain.gain.setTargetAtTime(0, now, 0.02);
      }
      if (!active && this.ctx.state === 'running') {
        this.ctx.suspend?.().catch(() => {});
      } else if (active && this.ctx.state === 'suspended') {
        this.ctx.resume?.().catch(() => {});
      }
    }
    if (active && this.engineActive && !this.engineSource && this.buffers?.engine_loop) {
      this.startEngineLoop();
    }
  }

  // Updates the acoustic listener position (player tank) and sight radius
  setListener(x = 0, z = 0, sightRadius = 28.0) {
    this.listenerX = x;
    this.listenerZ = z;
    this.sightRadius = sightRadius;
  }

  // Calculates distance from listener to a 2D world position or cell
  getDistance(pos) {
    if (!pos) return 0;
    let x = typeof pos.x === 'number' ? pos.x : null;
    let z = typeof pos.z === 'number' ? pos.z : null;
    if (x === null && typeof pos.row === 'number' && typeof pos.col === 'number') {
      x = (pos.col - 17.5) * 2;
      z = (pos.row - 17.5) * 2;
    }
    if (x === null || z === null) return 0;
    return Math.hypot(x - this.listenerX, z - this.listenerZ);
  }

  // Distance volume attenuation: 100% near player -> 20% at sight radius -> ~10-15% across arena
  getSpatialVolume(pos) {
    if (!pos) return 1.0;
    const dist = this.getDistance(pos);
    const nearDist = 4.0;
    const sight = this.sightRadius || 28.0;

    if (dist <= nearDist) return 1.0;
    if (dist <= sight) {
      // Smoothstep falloff from 1.0 down to exactly 0.20 at sightRadius
      const t = (dist - nearDist) / (sight - nearDist);
      const curve = t * t * (3 - 2 * t);
      return 1.0 - 0.8 * curve;
    }
    // Beyond sight radius: gentle taper from 0.20 down to a minimum of 0.10
    const over = Math.min(50, dist - sight);
    return Math.max(0.10, 0.20 - (over / 50) * 0.10);
  }

  ensureContext() {
    if (!this._enabled || this.paused || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        // Master dynamics compressor prevents digital clipping when multiple cannons/explosions overlap
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(5, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.68, this.ctx.currentTime);

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.buffers = {};

        // Asynchronously load and decode high-fidelity .ogg audio assets
        this.loadAudioFiles();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  loadAudioFiles() {
    if (this.audioFilesLoading || !this.ctx || typeof fetch === 'undefined') return;
    this.audioFilesLoading = true;

    for (const [key, path] of Object.entries(AUDIO_ASSETS)) {
      fetch(path)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arrayBuffer) => this.ctx.decodeAudioData(arrayBuffer))
        .then((decodedBuffer) => {
          if (this.buffers) {
            this.buffers[key] = decodedBuffer;
            if (key === 'engine_loop' && this.engineActive && !this.engineSource) {
              this.startEngineLoop();
            }
          }
        })
        .catch(() => {
          // Audio asset failed to load
        });
    }
  }

  // Rate-limiting check to prevent acoustic mud when dozens of entities collide or hit on the same frame
  shouldThrottle(soundName, minIntervalSec = 0.03) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlayTime.get(soundName) || 0;
    if (now - last < minIntervalSec) return true;
    this.lastPlayTime.set(soundName, now);
    return false;
  }

  // Plays a loaded audio buffer with volume, spatial distance attenuation, and subtle organic pitch variation
  playBuffer(bufferKey, { volume = 1.0, pitchVariation = 0.05, pos = null } = {}) {
    const ctx = this.ensureContext();
    if (!ctx || !this.buffers) return;
    const buf = this.buffers[bufferKey];
    if (!buf) return;

    const spatialFactor = this.getSpatialVolume(pos);
    const finalVolume = Math.max(0.001, volume * spatialFactor);

    const source = ctx.createBufferSource();
    source.buffer = buf;

    if (pitchVariation > 0) {
      source.playbackRate.value = 1.0 + (Math.random() * 2 - 1) * pitchVariation;
    }

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(finalVolume, ctx.currentTime);

    // Atmospheric air absorption: distant sounds (> 10 units away) lose high-frequency edge
    const dist = this.getDistance(pos);
    if (dist > 10.0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      // Cutoff drops from 20kHz down to ~1800Hz beyond line of sight
      const cutoff = Math.max(1600, 20000 * Math.pow(0.93, dist - 10.0));
      filter.frequency.setValueAtTime(cutoff, ctx.currentTime);

      source.connect(filter);
      filter.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    gainNode.connect(this.compressor || ctx.destination);
    source.start(ctx.currentTime);
  }

  playCannonShot(isHeavy = false, caliber = 1, pos = null) {
    if (this.shouldThrottle('cannon', 0.04)) return;
    const heavy = isHeavy || caliber >= 4;
    const key = heavy && this.buffers?.cannon_heavy ? 'cannon_heavy' : 'cannon_std';
    this.playBuffer(key, {
      volume: heavy ? 0.60 : 0.50,
      pitchVariation: 0.06,
      pos,
    });
  }

  playExplosion(intensity = 1.0, pos = null) {
    if (this.shouldThrottle('explosion', 0.045)) return;
    let key = 'explosion_std';
    if (intensity >= 1.6 && this.buffers?.tank_destruction) {
      key = 'tank_destruction';
    } else if (intensity >= 1.3 && this.buffers?.explosion_large) {
      key = 'explosion_large';
    }
    this.playBuffer(key, {
      volume: Math.min(0.68, 0.42 + intensity * 0.12),
      pitchVariation: 0.07,
      pos,
    });
  }

  playExplosionLarge(pos = null) {
    this.playExplosion(2.0, pos);
  }

  playEnvironmentalExplosion(pos = null) {
    if (this.shouldThrottle('explosion_env', 0.04)) return;
    const key = this.buffers?.explosion_env ? 'explosion_env' : 'explosion_large';
    this.playBuffer(key, {
      volume: 0.60,
      pitchVariation: 0.07,
      pos,
    });
  }

  playArmorHit(pos = null) {
    if (this.shouldThrottle('armor_hit', 0.04)) return;
    this.playBuffer('armor_hit', { volume: 0.45, pitchVariation: 0.06, pos });
  }

  playSteelHit(pos = null) {
    if (this.shouldThrottle('steel_hit', 0.035)) return;
    const key = this.buffers?.steel_hit ? 'steel_hit' : 'armor_hit';
    this.playBuffer(key, { volume: 0.35, pitchVariation: 0.08, pos });
  }

  playSteelRicochet(pos = null) {
    if (this.shouldThrottle('ricochet', 0.045)) return;
    const key = this.buffers?.aps_intercept ? 'aps_intercept' : this.buffers?.ricochet ? 'ricochet' : 'armor_hit';
    this.playBuffer(key, { volume: 0.55, pitchVariation: 0.06, pos });
  }

  playApsIntercept(pos = null) {
    if (this.shouldThrottle('aps_intercept', 0.045)) return;
    const key = this.buffers?.aps_intercept ? 'aps_intercept' : 'armor_hit';
    this.playBuffer(key, { volume: 0.58, pitchVariation: 0.05, pos });
  }

  playBrickHit(pos = null) {
    if (this.shouldThrottle('brick_hit', 0.05)) return;
    const key = this.buffers?.brick_hit ? 'brick_hit' : 'armor_hit';
    this.playBuffer(key, { volume: 0.40, pitchVariation: 0.08, pos });
  }

  playMissileLaunch(pos = null) {
    if (this.shouldThrottle('missile', 0.08)) return;
    this.playBuffer('missile', { volume: 0.60, pitchVariation: 0.05, pos });
  }

  // Calculates missile flight attenuation: 100% near player -> smoothly down to exactly 50% at sight boundary and beyond
  getMissileFlightFactor(pos) {
    if (!pos) return 1.0;
    const dist = this.getDistance(pos);
    const sight = this.sightRadius || 28.0;
    const ratio = Math.min(1.0, Math.max(0, dist / sight));
    const smooth = ratio * ratio * (3 - 2 * ratio);
    return 1.0 - 0.5 * smooth;
  }

  // Starts a continuous looping rocket motor audio stream for an in-flight missile
  startMissileLoop(pos = null) {
    const ctx = this.ensureContext();
    if (!ctx || !this.buffers) return null;
    const buf = this.buffers.atgm_loop || this.buffers.missile;
    if (!buf) return null;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    const flightFactor = this.getMissileFlightFactor(pos);
    const baseVol = 0.45;
    const finalVolume = baseVol * flightFactor;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(finalVolume, ctx.currentTime);

    const dist = this.getDistance(pos);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = Math.max(2000, 20000 * Math.pow(0.95, Math.max(0, dist - 8.0)));
    filter.frequency.setValueAtTime(cutoff, ctx.currentTime);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.compressor || ctx.destination);
    source.start(ctx.currentTime);

    return { source, gainNode, filter, baseVol };
  }

  // Updates in-flight missile motor volume (smoothly dropping to 50% as it travels away) and air filtering
  updateMissileLoop(handle, pos) {
    if (!handle || !this.ctx || !handle.gainNode) return;
    const flightFactor = this.getMissileFlightFactor(pos);
    const vol = (handle.baseVol || 0.45) * flightFactor;
    handle.gainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.04);

    if (handle.filter) {
      const dist = this.getDistance(pos);
      const cutoff = Math.max(2000, 20000 * Math.pow(0.95, Math.max(0, dist - 8.0)));
      handle.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.04);
    }
  }

  // Smoothly terminates the missile flight loop on impact, interception, or expiration
  stopMissileLoop(handle) {
    if (!handle || !this.ctx || !handle.source) return;
    try {
      if (handle.gainNode) {
        handle.gainNode.gain.setValueAtTime(handle.gainNode.gain.value, this.ctx.currentTime);
        handle.gainNode.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);
      }
      handle.source.stop(this.ctx.currentTime + 0.04);
    } catch {
      try { handle.source.stop(); } catch {}
    }
  }

  // Starts or ensures the continuous player tank diesel engine loop
  startEngineLoop() {
    this.engineActive = true;
    const ctx = this.ensureContext();
    if (!ctx || !this.buffers || this.engineSource) return;
    const buf = this.buffers.engine_loop;
    if (!buf) return;

    this.engineSource = ctx.createBufferSource();
    this.engineSource.buffer = buf;
    this.engineSource.loop = true;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.22, ctx.currentTime);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(2800, ctx.currentTime);

    this.engineSource.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.compressor || ctx.destination);

    this.engineSource.start(ctx.currentTime);
  }

  // Modulates the player tank diesel sound: idle rumble when stationary, rising revs & volume when driving
  updateEngineLoop(speedRatio = 0, paused = false) {
    if (!this.engineGain || !this.ctx) return;
    if (paused || this.paused || !this._enabled) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    const clampedRatio = Math.min(1.0, Math.max(0, speedRatio));
    const targetVol = 0.20 + clampedRatio * 0.18;
    const targetRate = 0.90 + clampedRatio * 0.35;

    this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);
    if (this.engineSource && this.engineSource.playbackRate) {
      this.engineSource.playbackRate.setTargetAtTime(targetRate, this.ctx.currentTime, 0.08);
    }
  }

  // Stops the engine loop on player destruction or match exit
  stopEngineLoop() {
    this.engineActive = false;
    if (!this.engineSource) return;
    try {
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);
      }
      this.engineSource.stop(this.ctx ? this.ctx.currentTime + 0.08 : 0);
    } catch {}
    this.engineSource = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  playFlamethrower(pos = null) {
    if (this.shouldThrottle('flame', 0.06)) return;
    this.playBuffer('flame', { volume: 0.65, pitchVariation: 0.07, pos });
  }

  playJammerPulse(pos = null) {
    if (this.shouldThrottle('jammer', 0.15)) return;
    this.playBuffer('jammer', { volume: 0.60, pitchVariation: 0.04, pos });
  }

  playEngineerWeld(pos = null) {
    if (this.shouldThrottle('weld', 0.05)) return;
    this.playBuffer('weld', { volume: 0.55, pitchVariation: 0.08, pos });
  }

  playMinePlant(pos = null) {
    this.playBuffer('mine', { volume: 0.58, pitchVariation: 0.03, pos });
  }

  playBossAlarm(pos = null) {
    if (this.shouldThrottle('boss_alarm', 0.35)) return;
    this.playBuffer('boss_alarm', { volume: 0.85, pitchVariation: 0.02, pos });
  }

  playPowerUp() {
    if (this.shouldThrottle('powerup', 0.06)) return;
    this.playBuffer('powerup', { volume: 0.85, pitchVariation: 0.02 });
  }

  playCargoLoad() {
    this.playBuffer('cargo_load', { volume: 0.85, pitchVariation: 0.03 });
  }

  playCargoDeliver() {
    this.playBuffer('cargo_deliver', { volume: 0.9, pitchVariation: 0.03 });
  }

  playContractExtract() {
    this.playBuffer('contract_extract', { volume: 0.95, pitchVariation: 0.02 });
  }
}

export const sound = new SoundManager();
