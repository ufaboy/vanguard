import * as THREE from 'three';
import {
  FxTex,
  RAMP_COOL,
  RAMP_FIRE,
  RAMP_HOT_SMOKE,
  RAMP_NONE,
  RAMP_SMOKE,
  getSharedTextures,
  rand,
  rgb,
} from './atlas.js';
import {
  POINT_FS,
  POINT_VS,
  PointLayer,
  STREAK_FS,
  STREAK_VS,
  StreakLayer,
} from './pools.js';

export class FxSystem {
  /** @param {object} opts. */
  constructor({ lowQuality = false, light = null } = {}) {
    this.q = lowQuality ? 0.55 : 1;
    this.light = light;
    this.root = new THREE.Group();
    this.root.name = 'FxSystem';

    const tex = getSharedTextures();

    const makePointMat = (blending) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uAtlas: { value: tex.atlas },
          uScale: { value: 40 },
        },
        vertexShader: POINT_VS,
        fragmentShader: POINT_FS,
        transparent: true,
        depthWrite: false,
        blending,
      });

    this.smoke = new PointLayer(lowQuality ? 520 : 1100, makePointMat(THREE.NormalBlending));
    this.smoke.points.renderOrder = 10;
    this.glow = new PointLayer(lowQuality ? 700 : 1500, makePointMat(THREE.AdditiveBlending));
    this.glow.points.renderOrder = 11;
    this.streaks = new StreakLayer(lowQuality ? 360 : 800);

    this.root.add(this.smoke.points);
    this.root.add(this.glow.points);
    this.root.add(this.streaks.mesh);

    const ringGeo = new THREE.PlaneGeometry(2, 2);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex.shockwave,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 9;
      this.root.add(mesh);
      this.rings.push({ mesh, mat, active: false });
    }

    const decalGeo = new THREE.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);
    this.decals = [];
    this.decalCursor = 0;
    for (let i = 0; i < (lowQuality ? 16 : 32); i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex.scorch,
        color: 0x000000,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(decalGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.root.add(mesh);
      this.decals.push({ mesh, mat, active: false });
    }

    this.emitters = [];
    this.timers = [];
    this._camDir = new THREE.Vector3();
    this._inv = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._size = new THREE.Vector2();
  }

  clear() {
    this.smoke.clear();
    this.glow.clear();
    this.streaks.clear();
    this.rings.forEach((r) => {
      r.active = false;
      r.mesh.visible = false;
    });
    this.decals.forEach((d) => {
      d.active = false;
      d.mesh.visible = false;
    });
    this.emitters.length = 0;
    this.timers.length = 0;
  }

  /** Run `fn` after `delay` seconds of effect time (cleared with the system). */
  schedule(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  update(dt, camera, renderer) {
    renderer.getDrawingBufferSize(this._size);
    let scale = 40;
    if (camera.isOrthographicCamera) {
      const worldH = (camera.top - camera.bottom) / (camera.zoom || 1);
      scale = this._size.y / Math.max(0.001, worldH);
    } else {
      scale = this._size.y / 20;
    }
    this.smoke.points.material.uniforms.uScale.value = scale;
    this.glow.points.material.uniforms.uScale.value = scale;

    this.root.updateWorldMatrix(true, false);
    camera.getWorldDirection(this._camDir);
    this._inv.copy(this.root.matrixWorld).invert();
    this._camDir.transformDirection(this._inv);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    this.updateEmitters(dt);

    this.smoke.update(dt);
    this.glow.update(dt);
    this.streaks.update(dt, this._camDir);

    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - Math.pow(1 - t, 3);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * k);
      r.mat.opacity = r.alpha * Math.pow(1 - t, 1.3);
    }

    for (const d of this.decals) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.life) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      const fadeIn = Math.min(1, d.age / 0.15);
      const fadeOut = Math.min(1, (d.life - d.age) / 3);
      d.mat.opacity = d.alpha * fadeIn * fadeOut;
    }
  }

  /** Spawn a point particle. `layer`: 'glow' (additive) or 'smoke' (alpha). */
  point(layer, o) {
    const p = (layer === 'smoke' ? this.smoke : this.glow).alloc();
    if (!p) return null;
    p.x = o.x;
    p.y = o.y;
    p.z = o.z;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.age = 0;
    p.delay = o.delay || 0;
    p.life = o.life;
    p.size0 = o.size;
    p.size1 = o.size1 ?? o.size;
    const c = o.color || [1, 1, 1];
    p.r = c[0];
    p.g = c[1];
    p.b = c[2];
    p.alpha = o.alpha ?? 1;
    p.tex = o.tex ?? FxTex.GLOW;
    p.ramp = o.ramp ?? RAMP_NONE;
    p.heat = o.heat ?? 1;
    p.gravity = o.gravity || 0;
    p.drag = o.drag || 0;
    const soft = p.tex !== FxTex.CHUNK && p.tex !== FxTex.SPARK && p.tex !== FxTex.MOTE;
    p.floor = o.floor ?? (soft ? Math.max(0.04, Math.max(p.size0, p.size1) * 0.36) : 0.04);
    if (p.y < p.floor) p.y = p.floor;
    p.bounce = o.bounce || 0;
    p.rot = o.rot ?? Math.random() * Math.PI * 2;
    p.rotV = o.rotV || 0;
    p.fadeIn = o.fadeIn || 0;
    p.fadeOut = o.fadeOut ?? true;
    return p;
  }

  /** Spawn a moving, velocity-stretched spark streak. */
  streak(o) {
    const s = this.streaks.alloc();
    if (!s) return null;
    s.fixed = false;
    s.x = o.x;
    s.y = o.y;
    s.z = o.z;
    s.vx = o.vx || 0;
    s.vy = o.vy || 0;
    s.vz = o.vz || 0;
    s.age = 0;
    s.delay = o.delay || 0;
    s.life = o.life;
    s.len = o.len ?? 0.03;
    s.width = o.width ?? 0.06;
    const c = o.color || [1, 0.7, 0.3];
    s.r = c[0];
    s.g = c[1];
    s.b = c[2];
    s.alpha = o.alpha ?? 1;
    s.gravity = o.gravity || 0;
    s.drag = o.drag || 0;
    s.floor = o.floor ?? 0.05;
    s.cool = o.cool ?? true;
    s.shrink = o.shrink ?? true;
    return s;
  }

  /** Spawn a fixed glowing segment (tracer / beam) that fades in place. */
  segment(x0, y0, z0, x1, y1, z1, color, width, life, alpha = 1, delay = 0) {
    const s = this.streaks.alloc();
    if (!s) return null;
    s.fixed = true;
    s.tx = x0;
    s.ty = y0;
    s.tz = z0;
    s.x = x1;
    s.y = y1;
    s.z = z1;
    s.age = 0;
    s.delay = delay;
    s.life = life;
    s.width = width;
    s.r = color[0];
    s.g = color[1];
    s.b = color[2];
    s.alpha = alpha;
    s.cool = false;
    s.shrink = false;
    return s;
  }

  shockwave(x, y, z, r0, r1, colorHex, life = 0.4, alpha = 0.85) {
    const ring = this.rings.find((r) => !r.active);
    if (!ring) return;
    ring.active = true;
    ring.age = 0;
    ring.life = life;
    ring.r0 = r0;
    ring.r1 = r1;
    ring.alpha = alpha;
    ring.mat.color.setHex(colorHex);
    ring.mat.opacity = alpha;
    ring.mesh.position.set(x, y, z);
    ring.mesh.scale.setScalar(r0);
    ring.mesh.visible = true;
  }

  scorch(x, z, size, life = 14, alpha = 0.78) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.active = true;
    d.age = 0;
    d.life = life;
    d.alpha = alpha;
    d.mat.opacity = 0;
    d.mesh.position.set(x, 0.025, z);
    d.mesh.rotation.y = Math.random() * Math.PI * 2;
    d.mesh.scale.set(size, 1, size);
    d.mesh.visible = true;
  }

  flash(x, y, z, colorHex, intensity) {
    if (!this.light) return;
    this.root.updateWorldMatrix(true, false);
    this._v.set(x, y, z);
    this.root.localToWorld(this._v);
    this.light.position.copy(this._v);
    this.light.color.setHex(colorHex);
    this.light.intensity = Math.max(this.light.intensity, intensity);
  }

  n(count) {
    return Math.max(1, Math.round(count * this.q));
  }

  addEmitter(kind, x, y, z, life, scale = 1) {
    this.emitters.push({ kind, x, y, z, life, age: 0, acc: 0, scale });
  }

  updateEmitters(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.age += dt;
      if (e.age >= e.life) {
        this.emitters.splice(i, 1);
        continue;
      }
      const strength = 1 - e.age / e.life;
      e.acc += dt;
      const interval = (e.kind === 'burn' ? 0.045 : 0.09) / this.q;
      while (e.acc >= interval) {
        e.acc -= interval;
        const s = e.scale;
        if (e.kind === 'burn') {
          if (Math.random() < 0.35 + strength * 0.6) {
            this.point('glow', {
              x: e.x + rand(-0.35, 0.35) * s,
              y: e.y + rand(0, 0.2),
              z: e.z + rand(-0.35, 0.35) * s,
              vx: rand(-0.3, 0.3),
              vy: rand(1.2, 2.4) * s,
              vz: rand(-0.3, 0.3),
              drag: 1.5,
              life: rand(0.35, 0.6),
              size: rand(0.35, 0.6) * s * (0.6 + strength * 0.4),
              size1: rand(0.7, 1.0) * s * (0.6 + strength * 0.4),
              tex: FxTex.FIRE,
              ramp: RAMP_FIRE,
              heat: 1.15,
              rotV: rand(-2, 2),
            });
          }
          this.point('smoke', {
            x: e.x + rand(-0.25, 0.25) * s,
            y: e.y + 0.45 * s,
            z: e.z + rand(-0.25, 0.25) * s,
            vx: rand(-0.25, 0.25) + 0.35,
            vy: rand(1.4, 2.2) * s,
            vz: rand(-0.25, 0.25) + 0.2,
            drag: 0.6,
            gravity: -0.15,
            life: rand(1.8, 2.8),
            size: rand(0.45, 0.7) * s,
            size1: rand(1.8, 2.6) * s,
            color: [0.15, 0.142, 0.135],
            alpha: 0.75 * (0.4 + strength * 0.6),
            tex: FxTex.SMOKE,
            ramp: RAMP_HOT_SMOKE,
            fadeIn: 0.2,
            rotV: rand(-0.6, 0.6),
          });
        } else {
          this.point('smoke', {
            x: e.x + rand(-0.2, 0.2) * s,
            y: e.y,
            z: e.z + rand(-0.2, 0.2) * s,
            vx: rand(-0.2, 0.2) + 0.25,
            vy: rand(0.8, 1.4),
            vz: rand(-0.2, 0.2) + 0.15,
            drag: 0.6,
            gravity: -0.1,
            life: rand(1.4, 2.2),
            size: 0.4 * s,
            size1: 1.6 * s,
            color: [0.22, 0.21, 0.2],
            alpha: 0.4 * strength,
            tex: FxTex.SMOKE,
            ramp: RAMP_SMOKE,
            fadeIn: 0.25,
            rotV: rand(-0.5, 0.5),
          });
        }
      }
    }
  }

  /** Cannon muzzle blast: star flash, forward flame tongue, muzzle-brake side jets. */
  muzzleFlash(x, y, z, dx, dz, { scale = 1, tint = 0xffb347, smoke = true, light = true } = {}) {
    const s = scale;
    const tc = rgb(tint);
    const px = dz;
    const pz = -dx;

    this.point('glow', {
      x, y, z,
      life: 0.085,
      size: 1.9 * s,
      size1: 2.4 * s,
      tex: FxTex.FLARE,
      color: [1, 0.96, 0.85],
      alpha: 1,
    });
    this.point('glow', {
      x: x + dx * 0.2 * s, y, z: z + dz * 0.2 * s,
      life: 0.16,
      size: 3.2 * s,
      size1: 3.8 * s,
      tex: FxTex.GLOW,
      color: tc,
      alpha: 0.75,
    });

    const tongue = this.n(5);
    for (let i = 0; i < tongue; i++) {
      const k = i / Math.max(1, tongue - 1);
      const spd = (5 + k * 9) * s;
      this.point('glow', {
        x: x + dx * k * 0.25 * s,
        y,
        z: z + dz * k * 0.25 * s,
        vx: dx * spd + rand(-0.6, 0.6),
        vy: rand(-0.2, 0.4),
        vz: dz * spd + rand(-0.6, 0.6),
        drag: 9,
        life: rand(0.08, 0.15),
        size: (0.8 - k * 0.25) * s,
        size1: (1.4 - k * 0.4) * s,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
        heat: 0.8,
        rotV: rand(-6, 6),
      });
    }

    for (const side of [-1, 1]) {
      for (let j = 0; j < 2; j++) {
        const spd = rand(3.5, 6) * s;
        this.point('glow', {
          x, y, z,
          vx: px * side * spd + dx * 1.2,
          vy: rand(0, 0.6),
          vz: pz * side * spd + dz * 1.2,
          drag: 10,
          life: rand(0.07, 0.12),
          size: 0.5 * s,
          size1: 1.0 * s,
          tex: FxTex.FIRE,
          ramp: RAMP_FIRE,
          heat: 0.9,
        });
      }
    }

    const sparks = this.n(6);
    for (let i = 0; i < sparks; i++) {
      const spread = rand(-0.35, 0.35);
      const cs = Math.cos(spread);
      const sn = Math.sin(spread);
      const vx = dx * cs - dz * sn;
      const vz = dx * sn + dz * cs;
      const spd = rand(12, 22) * s;
      this.streak({
        x, y, z,
        vx: vx * spd,
        vy: rand(0, 2.5),
        vz: vz * spd,
        drag: 5,
        gravity: 6,
        life: rand(0.12, 0.24),
        len: 0.025,
        width: 0.05 * s,
        color: [1, 0.6, 0.2],
      });
    }

    if (smoke) {
      const puffs = this.n(6);
      for (let i = 0; i < puffs; i++) {
        const k = i / Math.max(1, puffs - 1);
        const side = i % 2 === 0 ? 1 : -1;
        this.point('smoke', {
          x: x + dx * k * 0.5 * s,
          y: y + rand(-0.05, 0.1),
          z: z + dz * k * 0.5 * s,
          vx: dx * rand(1.2, 3.2) * s + px * side * rand(0.4, 1.4),
          vy: rand(0.3, 0.8),
          vz: dz * rand(1.2, 3.2) * s + pz * side * rand(0.4, 1.4),
          drag: 2.4,
          gravity: -0.35,
          life: rand(0.9, 1.6),
          size: 0.55 * s,
          size1: rand(1.6, 2.3) * s,
          color: [0.68, 0.66, 0.62],
          alpha: 0.55,
          tex: FxTex.SMOKE,
          ramp: RAMP_SMOKE,
          fadeIn: 0.06,
          rotV: rand(-1, 1),
        });
      }
    }

    if (light) this.flash(x, y + 0.6, z, tint, 3.2 * s);
  }

  /** Per-frame glowing tracer tail for a flying shell. */
  shellTrail(x0, y0, z0, x1, y1, z1, colorHex, width = 0.14, life = 0.14) {
    this.segment(x0, y0, z0, x1, y1, z1, rgb(colorHex), width, life, 0.95);
  }

  /** Hot sparks fan (generic hit / weld / ram). */
  sparks(x, y, z, colorHex, count = 8, { speed = 1, up = 1 } = {}) {
    const c = rgb(colorHex);
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(2, 9) * speed;
      this.streak({
        x, y, z,
        vx: Math.cos(a) * h,
        vy: rand(1.5, 7) * up,
        vz: Math.sin(a) * h,
        gravity: 16,
        drag: 1.4,
        life: rand(0.25, 0.55),
        len: 0.03,
        width: 0.055,
        color: c,
      });
    }
    this.point('glow', {
      x, y, z,
      life: 0.1,
      size: 0.7 + count * 0.03,
      size1: 0.9 + count * 0.04,
      tex: FxTex.FLARE,
      color: [1, 0.92, 0.75],
      alpha: 0.85,
    });
    this.point('glow', {
      x, y, z,
      life: 0.18,
      size: 1.1,
      tex: FxTex.GLOW,
      color: c,
      alpha: 0.55,
    });
  }

  /** Penetrating hit on armour: white-hot flash, molten spall, burst of fire and smoke. */
  armorHit(x, y, z, { scale = 1, colorHex = 0xffa040 } = {}) {
    const s = scale;
    const c = rgb(colorHex);
    this.point('glow', { x, y, z, life: 0.09, size: 1.5 * s, size1: 1.9 * s, tex: FxTex.FLARE, color: [1, 0.97, 0.88] });
    this.point('glow', { x, y, z, life: 0.25, size: 2.0 * s, tex: FxTex.GLOW, color: c, alpha: 0.65 });
    const fire = this.n(4);
    for (let i = 0; i < fire; i++) {
      this.point('glow', {
        x: x + rand(-0.15, 0.15), y, z: z + rand(-0.15, 0.15),
        vx: rand(-1.5, 1.5) * s,
        vy: rand(0.5, 2.2) * s,
        vz: rand(-1.5, 1.5) * s,
        drag: 4,
        life: rand(0.25, 0.4),
        size: 0.45 * s,
        size1: 1.05 * s,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
        rotV: rand(-3, 3),
      });
    }
    const n = this.n(16);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(3, 11) * s;
      this.streak({
        x, y, z,
        vx: Math.cos(a) * h,
        vy: rand(2, 8) * s,
        vz: Math.sin(a) * h,
        gravity: 18,
        drag: 1.2,
        life: rand(0.35, 0.7),
        len: 0.035,
        width: 0.06,
        color: [1, 0.55, 0.15],
      });
    }
    const smoke = this.n(4);
    for (let i = 0; i < smoke; i++) {
      this.point('smoke', {
        x, y: y + 0.1, z,
        vx: rand(-0.8, 0.8),
        vy: rand(0.8, 1.6),
        vz: rand(-0.8, 0.8),
        drag: 1.8,
        gravity: -0.4,
        delay: 0.04,
        life: rand(0.9, 1.4),
        size: 0.5 * s,
        size1: 1.5 * s,
        color: [0.2, 0.19, 0.18],
        alpha: 0.6,
        tex: FxTex.SMOKE,
        ramp: RAMP_HOT_SMOKE,
        fadeIn: 0.05,
        rotV: rand(-1, 1),
      });
    }
    this.flash(x, y + 0.5, z, 0xff9a3c, 2.6 * s);
  }

  /** Non-penetrating hit / ricochet: cold blue-white spray deflected off the plate. */
  ricochet(x, y, z, { dirX = 0, dirZ = 0 } = {}) {
    this.point('glow', { x, y, z, life: 0.08, size: 1.1, size1: 1.35, tex: FxTex.FLARE, color: [0.85, 0.94, 1] });
    this.point('glow', { x, y, z, life: 0.16, size: 1.4, tex: FxTex.GLOW, color: [0.45, 0.7, 1], alpha: 0.6 });
    const baseAng = Math.atan2(-dirZ, -dirX);
    const hasDir = dirX !== 0 || dirZ !== 0;
    const n = this.n(12);
    for (let i = 0; i < n; i++) {
      const a = hasDir ? baseAng + rand(-1.3, 1.3) : Math.random() * Math.PI * 2;
      const h = rand(6, 15);
      this.streak({
        x, y, z,
        vx: Math.cos(a) * h,
        vy: rand(1, 6),
        vz: Math.sin(a) * h,
        gravity: 14,
        drag: 2,
        life: rand(0.2, 0.42),
        len: 0.04,
        width: 0.05,
        color: [0.55, 0.78, 1],
      });
    }
    this.point('smoke', {
      x, y, z,
      vy: 0.6,
      drag: 2,
      life: 0.7,
      size: 0.35,
      size1: 1.0,
      color: [0.55, 0.56, 0.58],
      alpha: 0.35,
      tex: FxTex.SMOKE,
      ramp: RAMP_SMOKE,
    });
  }

  /** Masonry hit: dust plume, flying chunks and a few sparks. */
  masonryHit(x, y, z, { concrete = true, heavy = false } = {}) {
    const dust = concrete ? [0.66, 0.64, 0.6] : [0.62, 0.42, 0.32];
    const chunk = concrete ? [0.58, 0.57, 0.55] : [0.66, 0.3, 0.2];
    const k = heavy ? 1.5 : 1;
    const nd = this.n(6 * k);
    for (let i = 0; i < nd; i++) {
      this.point('smoke', {
        x: x + rand(-0.15, 0.15), y: y + rand(-0.1, 0.15), z: z + rand(-0.15, 0.15),
        vx: rand(-1.4, 1.4) * k,
        vy: rand(0.4, 1.6),
        vz: rand(-1.4, 1.4) * k,
        drag: 2.6,
        gravity: -0.2,
        life: rand(0.9, 1.5),
        size: 0.4 * k,
        size1: rand(1.2, 1.8) * k,
        color: dust,
        alpha: 0.7,
        tex: FxTex.SMOKE,
        ramp: RAMP_SMOKE,
        fadeIn: 0.04,
        rotV: rand(-1, 1),
      });
    }
    const nc = this.n(7 * k);
    for (let i = 0; i < nc; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(1.5, 5.5) * k;
      const shade = rand(0.75, 1.1);
      this.point('smoke', {
        x, y, z,
        vx: Math.cos(a) * h,
        vy: rand(2.5, 6.5),
        vz: Math.sin(a) * h,
        gravity: 17,
        drag: 0.6,
        bounce: 0.3,
        life: rand(0.9, 1.4),
        size: rand(0.1, 0.2) * k,
        color: [chunk[0] * shade, chunk[1] * shade, chunk[2] * shade],
        alpha: 1,
        tex: FxTex.CHUNK,
        rotV: rand(-10, 10),
      });
    }
    this.sparks(x, y, z, 0xffc070, heavy ? 6 : 3, { speed: 0.8 });
  }

  /** Full high-explosive detonation: flash, rolling fireball, embers, debris. */
  explosion(x, y, z, opts = {}) {
    const s = opts.scale ?? 1;
    const tint = opts.tint ?? 0xff8a2a;
    const debrisColor = opts.debrisColor ?? [0.17, 0.15, 0.14];
    const ground = Math.max(0.05, opts.groundY ?? 0.05);

    this.point('glow', { x, y, z, life: 0.12, size: 3.0 * s, size1: 3.8 * s, tex: FxTex.FLARE, color: [1, 0.97, 0.88] });
    this.point('glow', { x, y, z, life: 0.32, size: 5.2 * s, size1: 6.0 * s, tex: FxTex.GLOW, color: rgb(tint), alpha: 0.8 });

    for (let i = 0; i < 3; i++) {
      this.point('glow', {
        x: x + rand(-0.2, 0.2) * s, y: y + rand(0, 0.25) * s, z: z + rand(-0.2, 0.2) * s,
        life: rand(0.22, 0.32),
        size: 1.2 * s,
        size1: 2.4 * s,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
        heat: 0.7,
        rotV: rand(-2, 2),
      });
    }

    const nf = this.n(15 * Math.sqrt(s));
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(1.2, 4.2) * s;
      this.point('glow', {
        x: x + Math.cos(a) * 0.25 * s,
        y: y + rand(0, 0.3) * s,
        z: z + Math.sin(a) * 0.25 * s,
        vx: Math.cos(a) * h,
        vy: rand(1.0, 3.6) * s,
        vz: Math.sin(a) * h,
        drag: 3.2,
        gravity: -1.6,
        life: rand(0.55, 0.95),
        size: rand(0.9, 1.2) * s,
        size1: rand(2.3, 3.0) * s,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
        heat: rand(0.9, 1.15),
        rotV: rand(-2.5, 2.5),
      });
    }

    const ne = this.n(24 * s);
    for (let i = 0; i < ne; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(4, 14) * s;
      this.streak({
        x, y: y + 0.2, z,
        vx: Math.cos(a) * h,
        vy: rand(3, 12) * Math.sqrt(s),
        vz: Math.sin(a) * h,
        gravity: 15,
        drag: 1.1,
        life: rand(0.55, 1.2),
        len: 0.035,
        width: 0.07,
        color: [1, 0.55, 0.16],
        floor: ground,
      });
    }

    const nd = this.n(11 * s);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(2.5, 7.5) * s;
      const shade = rand(0.7, 1.3);
      this.point('smoke', {
        x, y: y + 0.2, z,
        vx: Math.cos(a) * h,
        vy: rand(4.5, 10) * Math.sqrt(s),
        vz: Math.sin(a) * h,
        gravity: 19,
        drag: 0.4,
        bounce: 0.3,
        floor: ground,
        life: rand(1.3, 2.1),
        size: rand(0.12, 0.3) * s,
        color: [debrisColor[0] * shade, debrisColor[1] * shade, debrisColor[2] * shade],
        tex: FxTex.CHUNK,
        rotV: rand(-12, 12),
      });
    }

    const ns = this.n(16 * s);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(0.4, 1.8) * s;
      const g = rand(0.2, 0.32);
      this.point('smoke', {
        x: x + Math.cos(a) * 0.3 * s,
        y: y + rand(0.1, 0.6) * s,
        z: z + Math.sin(a) * 0.3 * s,
        vx: Math.cos(a) * h + 0.25,
        vy: rand(1.0, 2.8) * s,
        vz: Math.sin(a) * h + 0.15,
        drag: 1.6,
        gravity: -0.5,
        delay: rand(0.05, 0.22),
        life: rand(2.4, 4.0),
        size: rand(1.0, 1.4) * s,
        size1: rand(3.2, 4.4) * s,
        color: [g, g * 0.94, g * 0.86],
        alpha: 0.9,
        tex: FxTex.SMOKE,
        ramp: RAMP_HOT_SMOKE,
        fadeIn: 0.12,
        rotV: rand(-0.8, 0.8),
      });
    }

    const nk = this.n(10 * s);
    for (let i = 0; i < nk; i++) {
      const a = (i / nk) * Math.PI * 2 + rand(-0.2, 0.2);
      const h = rand(4, 6.5) * s;
      this.point('smoke', {
        x: x + Math.cos(a) * 0.3, y: ground + 0.2, z: z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * h,
        vy: 0.25,
        vz: Math.sin(a) * h,
        drag: 3.4,
        life: rand(0.8, 1.3),
        size: 0.6 * s,
        size1: 1.9 * s,
        color: [0.56, 0.5, 0.43],
        alpha: 0.5,
        tex: FxTex.SMOKE,
        ramp: RAMP_SMOKE,
        fadeIn: 0.05,
        rotV: rand(-1, 1),
      });
    }

    this.shockwave(x, ground + 0.04, z, 0.3 * s, 3.0 * s, 0xffc58a, 0.38, 0.9);
    this.shockwave(x, ground + 0.05, z, 0.2 * s, 1.9 * s, 0xff7a2a, 0.55, 0.5);

    if (opts.scorch !== false) this.scorch(x, z, 2.8 * s, opts.scorchLife ?? 16);

    if (opts.light !== false) this.flash(x, y + 1.6, z, tint, 7 * Math.min(1.6, s));
  }

  /**
   * Realistic multi-stage fuel-air thermobaric detonation spanning `radius` world units (2.5 cells = 5.0m):
   * 1) aerosol ignition flash & fuel-air mist dome;
   * 2) supersonic Mach pressure wave & thermal ground sweep;
   * 3) rising oxygen-starved turbulent fireball column + dense soot mushroom cap;
   * 4) molten thermite ember shower, crater scorch & lingering ground heat.
   */
  thermobaricExplosion(x, y, z, radius = 5.0) {
    const s = Math.max(1.2, radius / 2.2);
    const ground = 0.06;

    // 1) Blinding white-amber aerosol flash & thermal dome
    this.point('glow', { x, y: y + 0.4, z, life: 0.16, size: 4.5 * s, size1: 6.8 * s, tex: FxTex.FLARE, color: [1, 0.96, 0.86] });
    this.point('glow', { x, y: y + 0.6, z, life: 0.45, size: 6.2 * s, size1: 8.5 * s, tex: FxTex.GLOW, color: [1, 0.45, 0.08], alpha: 0.92 });
    this.point('glow', { x, y: ground + 0.25, z, life: 0.28, size: radius * 1.4, size1: radius * 2.5, tex: FxTex.RING, color: [1, 0.85, 0.55], alpha: 0.95 });

    // 2) Dual supersonic Mach shockwave rings across the full 2.5-cell blast radius
    this.shockwave(x, ground + 0.04, z, 0.35, radius * 1.12, 0xfff0cc, 0.42, 0.95);
    this.shockwave(x, ground + 0.06, z, 0.25, radius * 0.98, 0xff5a14, 0.65, 0.8);
    this.schedule(0.08, () => {
      this.shockwave(x, ground + 0.05, z, 0.4, radius * 1.2, 0xff9a3c, 0.55, 0.65);
    });

    // 3) Ground-hugging thermobaric fuel-air fire ring expanding to blast rim
    const nRim = this.n(26);
    for (let i = 0; i < nRim; i++) {
      const a = (i / nRim) * Math.PI * 2 + rand(-0.14, 0.14);
      const spd = rand(radius * 1.15, radius * 1.9);
      this.point('glow', {
        x: x + Math.cos(a) * 0.45,
        y: ground + rand(0.2, 0.55),
        z: z + Math.sin(a) * 0.45,
        vx: Math.cos(a) * spd,
        vy: rand(0.4, 1.8),
        vz: Math.sin(a) * spd,
        drag: 2.6,
        gravity: -0.9,
        life: rand(0.65, 1.15),
        size: rand(1.1, 1.6) * s,
        size1: rand(2.6, 3.8) * s,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
        heat: rand(0.85, 1.1),
        rotV: rand(-2.8, 2.8),
      });
    }

    // 4) Buoyant rising fireball stem & mushroom cap
    const nStem = this.n(22);
    for (let i = 0; i < nStem; i++) {
      const a = Math.random() * Math.PI * 2;
      const rOff = rand(0, radius * 0.35);
      this.point('glow', {
        x: x + Math.cos(a) * rOff,
        y: y + rand(0.2, 0.9),
        z: z + Math.sin(a) * rOff,
        vx: Math.cos(a) * rand(0.3, 1.6),
        vy: rand(2.6, 5.8) * Math.sqrt(s),
        vz: Math.sin(a) * rand(0.3, 1.6),
        drag: 1.9,
        gravity: -2.2,
        delay: rand(0.03, 0.18),
        life: rand(0.85, 1.45),
        size: rand(1.2, 1.8) * s,
        size1: rand(3.0, 4.4) * s,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
        heat: rand(0.75, 1.05),
        rotV: rand(-2.0, 2.0),
      });
    }

    // 5) Dense billowing soot mushroom cloud & dust skirt
    const nSmoke = this.n(28);
    for (let i = 0; i < nSmoke; i++) {
      const a = Math.random() * Math.PI * 2;
      const rOff = rand(0, radius * 0.55);
      const shade = rand(0.14, 0.26);
      this.point('smoke', {
        x: x + Math.cos(a) * rOff,
        y: y + rand(0.4, 1.4),
        z: z + Math.sin(a) * rOff,
        vx: Math.cos(a) * rand(0.5, 2.2),
        vy: rand(1.6, 4.2) * Math.sqrt(s),
        vz: Math.sin(a) * rand(0.5, 2.2),
        drag: 1.35,
        gravity: -0.7,
        delay: rand(0.08, 0.35),
        life: rand(2.8, 4.6),
        size: rand(1.3, 1.9) * s,
        size1: rand(3.8, 5.4) * s,
        color: [shade, shade * 0.9, shade * 0.82],
        alpha: 0.92,
        tex: FxTex.SMOKE,
        ramp: RAMP_HOT_SMOKE,
        fadeIn: 0.14,
        rotV: rand(-0.9, 0.9),
      });
    }

    // 6) High-velocity molten ember shower & blasted debris chunks
    const nEmbers = this.n(44);
    for (let i = 0; i < nEmbers; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = rand(4.5, 16.5);
      this.streak({
        x, y: y + 0.35, z,
        vx: Math.cos(a) * spd,
        vy: rand(4.0, 14.0),
        vz: Math.sin(a) * spd,
        gravity: 16,
        drag: 0.95,
        life: rand(0.6, 1.35),
        len: 0.045,
        width: 0.085,
        color: [1, 0.52, 0.14],
        floor: ground,
      });
    }
    const nChunks = this.n(18);
    for (let i = 0; i < nChunks; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = rand(3.0, 9.5);
      this.point('smoke', {
        x, y: y + 0.3, z,
        vx: Math.cos(a) * spd,
        vy: rand(5.5, 11.5),
        vz: Math.sin(a) * spd,
        gravity: 19,
        drag: 0.38,
        bounce: 0.32,
        floor: ground,
        life: rand(1.3, 2.2),
        size: rand(0.18, 0.40),
        color: [0.22, 0.18, 0.15],
        tex: FxTex.CHUNK,
        rotV: rand(-12, 12),
      });
    }

    // 7) Wide scorched crater decal, intense light pulse, and lingering ground embers
    this.scorch(x, z, radius * 1.18, 24);
    this.flash(x, y + 2.4, z, 0xff5a18, 12);
    this.addEmitter('burn', x, 0.25, z, 2.8, 1.35);
  }

  /** Tank kill: main blast, delayed ammo cook-off, flung turret chunk and a burning wreck. */
  tankDestroyed(x, z, { boss = false, tint = 0xff8a2a } = {}) {
    const s = boss ? 2.0 : 1.4;
    this.explosion(x, 0.7, z, { scale: s, tint });
    this.schedule(0.18, () => {
      this.explosion(x + rand(-0.4, 0.4), 1.0, z + rand(-0.4, 0.4), {
        scale: s * 0.6,
        tint: 0xffb347,
        scorch: false,
      });
    });
    if (boss) {
      this.schedule(0.42, () => {
        this.explosion(x + rand(-0.8, 0.8), 0.9, z + rand(-0.8, 0.8), {
          scale: 1.2,
          tint: 0xff6a20,
          scorch: false,
        });
      });
    }
    const nf = this.n(boss ? 30 : 18);
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(0.5, 3);
      this.streak({
        x, y: 1.0, z,
        vx: Math.cos(a) * h,
        vy: rand(8, 15),
        vz: Math.sin(a) * h,
        gravity: 15,
        drag: 0.6,
        delay: rand(0.1, 0.5),
        life: rand(0.7, 1.3),
        len: 0.03,
        width: 0.07,
        color: [1, 0.6, 0.2],
      });
    }
    this.point('smoke', {
      x, y: 1.0, z,
      vx: rand(-2, 2),
      vy: 11,
      vz: rand(-2, 2),
      gravity: 18,
      bounce: 0.25,
      life: 2.2,
      size: boss ? 0.75 : 0.5,
      color: [0.16, 0.15, 0.14],
      tex: FxTex.CHUNK,
      rotV: rand(-8, 8),
    });
    this.addEmitter('burn', x, 0.55, z, boss ? 8 : 5, boss ? 1.5 : 1);
  }

  /** Debris burst for a destroyed wall/obstacle cell. */
  blockDestroyed(x, z, kind = 'brick') {
    if (kind === 'spawner') {
      this.explosion(x, 0.5, z, { scale: 0.9, tint: 0xff4a3a, scorchLife: 10 });
      return;
    }
    if (kind === 'forest') {
      for (let i = 0; i < this.n(10); i++) {
        this.point('glow', {
          x: x + rand(-0.7, 0.7), y: rand(0.2, 1.2), z: z + rand(-0.7, 0.7),
          vx: rand(-0.6, 0.6),
          vy: rand(1, 2.6),
          vz: rand(-0.6, 0.6),
          drag: 2,
          life: rand(0.4, 0.75),
          size: rand(0.5, 0.8),
          size1: rand(1.2, 1.7),
          tex: FxTex.FIRE,
          ramp: RAMP_FIRE,
          heat: 1.1,
          rotV: rand(-2, 2),
        });
      }
      for (let i = 0; i < this.n(14); i++) {
        const a = Math.random() * Math.PI * 2;
        const shade = rand(0.6, 1.1);
        this.point('smoke', {
          x: x + rand(-0.5, 0.5), y: rand(0.5, 1.4), z: z + rand(-0.5, 0.5),
          vx: Math.cos(a) * rand(0.5, 2.5),
          vy: rand(1, 4),
          vz: Math.sin(a) * rand(0.5, 2.5),
          gravity: 4,
          drag: 1.5,
          life: rand(0.9, 1.5),
          size: rand(0.1, 0.18),
          color: [0.16 * shade, 0.3 * shade, 0.1 * shade],
          tex: FxTex.CHUNK,
          rotV: rand(-8, 8),
        });
      }
      this.addEmitter('burn', x, 0.3, z, 2.2, 1);
      return;
    }
    const concrete = kind === 'concrete';
    const wood = kind === 'boxes';
    const dust = wood ? [0.55, 0.43, 0.27] : concrete ? [0.62, 0.61, 0.58] : [0.6, 0.42, 0.32];
    const chunk = wood ? [0.48, 0.29, 0.12] : concrete ? [0.55, 0.55, 0.53] : [0.64, 0.29, 0.19];
    const nd = this.n(12);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(0.6, 2.4);
      this.point('smoke', {
        x: x + Math.cos(a) * 0.5, y: rand(0.3, 1.0), z: z + Math.sin(a) * 0.5,
        vx: Math.cos(a) * h,
        vy: rand(0.3, 1.4),
        vz: Math.sin(a) * h,
        drag: 2,
        gravity: -0.15,
        life: rand(1.3, 2.2),
        size: 0.7,
        size1: rand(2.0, 2.8),
        color: dust,
        alpha: 0.6,
        tex: FxTex.SMOKE,
        ramp: RAMP_SMOKE,
        fadeIn: 0.05,
        rotV: rand(-0.8, 0.8),
      });
    }
    const nc = this.n(16);
    for (let i = 0; i < nc; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = rand(1.5, 5);
      const shade = rand(0.7, 1.15);
      this.point('smoke', {
        x: x + rand(-0.5, 0.5), y: rand(0.3, 1.2), z: z + rand(-0.5, 0.5),
        vx: Math.cos(a) * h,
        vy: rand(2.5, 7),
        vz: Math.sin(a) * h,
        gravity: 18,
        drag: 0.5,
        bounce: 0.3,
        life: rand(1.1, 1.8),
        size: rand(0.14, 0.32),
        color: [chunk[0] * shade, chunk[1] * shade, chunk[2] * shade],
        tex: FxTex.CHUNK,
        rotV: rand(-10, 10),
      });
    }
    this.shockwave(x, 0.06, z, 0.4, 1.8, concrete ? 0xc8c2b8 : 0xc89070, 0.45, 0.35);
  }

  /** Emerald nanite repair motes and welding glints. */
  repair(x, y, z, count = 4) {
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      this.point('glow', {
        x: x + rand(-0.6, 0.6), y: y + rand(-0.3, 0.3), z: z + rand(-0.6, 0.6),
        vx: rand(-0.2, 0.2),
        vy: rand(0.8, 1.8),
        vz: rand(-0.2, 0.2),
        drag: 1.2,
        life: rand(0.7, 1.2),
        size: rand(0.22, 0.34),
        size1: 0.08,
        tex: FxTex.MOTE,
        color: [0.35, 1, 0.62],
        rot: 0,
        fadeIn: 0.12,
      });
    }
    const ns = Math.max(1, Math.round(n / 2));
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2;
      this.streak({
        x: x + rand(-0.4, 0.4), y, z: z + rand(-0.4, 0.4),
        vx: Math.cos(a) * rand(1.5, 4),
        vy: rand(1, 4),
        vz: Math.sin(a) * rand(1.5, 4),
        gravity: 14,
        life: rand(0.2, 0.4),
        width: 0.04,
        color: [0.5, 1, 0.75],
      });
    }
    this.point('glow', { x, y, z, life: 0.3, size: 1.3, tex: FxTex.GLOW, color: [0.2, 0.9, 0.5], alpha: 0.35 });
  }

  /** Short-lived jagged electric arcs (EMP stun, ECM pulse). */
  electric(x, y, z, colorHex = 0x38e8ff, count = 3, radius = 0.7) {
    const c = rgb(colorHex);
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      let px = x + rand(-radius, radius) * 0.4;
      let py = y + rand(-0.1, 0.3);
      let pz = z + rand(-radius, radius) * 0.4;
      const segs = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < segs; k++) {
        const nx = px + rand(-0.32, 0.32);
        const ny = py + rand(-0.18, 0.25);
        const nz = pz + rand(-0.32, 0.32);
        this.segment(px, py, pz, nx, ny, nz, c, 0.07, rand(0.08, 0.16), 1);
        px = nx;
        py = ny;
        pz = nz;
      }
    }
    this.point('glow', { x, y, z, life: 0.18, size: 1.4, tex: FxTex.GLOW, color: c, alpha: 0.5 });
  }

  /** Low-HP hull smoke puff (with an occasional flicker of flame). */
  damageSmoke(x, y, z) {
    this.point('smoke', {
      x: x + rand(-0.25, 0.25), y, z: z + rand(-0.25, 0.25),
      vx: rand(-0.2, 0.2) + 0.3,
      vy: rand(1.0, 1.8),
      vz: rand(-0.2, 0.2) + 0.2,
      drag: 0.8,
      gravity: -0.2,
      life: rand(1.2, 1.9),
      size: 0.35,
      size1: 1.5,
      color: [0.13, 0.125, 0.12],
      alpha: 0.6,
      tex: FxTex.SMOKE,
      ramp: RAMP_SMOKE,
      fadeIn: 0.15,
      rotV: rand(-0.8, 0.8),
    });
    if (Math.random() < 0.35) {
      this.point('glow', {
        x: x + rand(-0.2, 0.2), y, z: z + rand(-0.2, 0.2),
        vy: rand(0.8, 1.4),
        life: rand(0.25, 0.4),
        size: 0.35,
        size1: 0.55,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
        heat: 1.2,
      });
    }
  }

  /** ECM jammer wave: expanding violet rings and crackling arcs. */
  jammerPulse(x, y, z, radius = 11) {
    this.shockwave(x, 0.12, z, 0.6, radius, 0xb36bff, 0.75, 0.9);
    this.shockwave(x, 0.14, z, 0.4, radius * 0.6, 0xe0b0ff, 0.5, 0.6);
    this.electric(x, y, z, 0xc084fc, 5, 1.1);
    this.point('glow', { x, y, z, life: 0.35, size: 2.6, size1: 3.4, tex: FxTex.RING, color: [0.75, 0.45, 1], alpha: 0.8 });
  }

  /** APS hard-kill: interceptor streak from the launcher and a fragmentation airburst. */
  apsIntercept(sx, sy, sz, tx, ty, tz) {
    this.segment(sx, sy, sz, tx, ty, tz, [1, 0.85, 0.4], 0.13, 0.16, 1);
    this.point('glow', { x: sx, y: sy, z: sz, life: 0.08, size: 0.8, tex: FxTex.FLARE, color: [1, 0.95, 0.75] });
    this.point('glow', { x: tx, y: ty, z: tz, life: 0.1, size: 1.8, size1: 2.2, tex: FxTex.FLARE, color: [1, 0.97, 0.85] });
    this.point('glow', { x: tx, y: ty, z: tz, life: 0.25, size: 2.2, tex: FxTex.GLOW, color: [1, 0.7, 0.25], alpha: 0.7 });
    for (let i = 0; i < 4; i++) {
      this.point('glow', {
        x: tx, y: ty, z: tz,
        vx: rand(-2, 2),
        vy: rand(-0.5, 1.5),
        vz: rand(-2, 2),
        drag: 5,
        life: rand(0.2, 0.32),
        size: 0.45,
        size1: 0.95,
        tex: FxTex.FIRE,
        ramp: RAMP_FIRE,
      });
    }
    const n = this.n(14);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rand(-0.6, 0.9);
      const spd = rand(5, 12);
      this.streak({
        x: tx, y: ty, z: tz,
        vx: Math.cos(a) * Math.cos(e) * spd,
        vy: Math.sin(e) * spd,
        vz: Math.sin(a) * Math.cos(e) * spd,
        gravity: 12,
        drag: 2,
        life: rand(0.2, 0.45),
        width: 0.05,
        color: [1, 0.8, 0.35],
      });
    }
    for (let i = 0; i < this.n(4); i++) {
      this.point('smoke', {
        x: tx, y: ty, z: tz,
        vx: rand(-0.8, 0.8),
        vy: rand(0.2, 0.8),
        vz: rand(-0.8, 0.8),
        drag: 2,
        gravity: -0.3,
        delay: 0.05,
        life: rand(0.8, 1.2),
        size: 0.4,
        size1: 1.3,
        color: [0.32, 0.31, 0.3],
        alpha: 0.55,
        tex: FxTex.SMOKE,
        ramp: RAMP_SMOKE,
        rotV: rand(-1, 1),
      });
    }
    this.flash(tx, ty + 0.5, tz, 0xffc060, 2.4);
  }

  /** Rocket motor plume + smoke trail; call every frame with the missile's motion. */
  missileExhaust(x, y, z, dx, dz, { enemy = false, smokeEvery = true, prevX = null, prevZ = null } = {}) {
    const flame = enemy ? [0.45, 0.78, 1] : [1, 0.62, 0.22];
    const hot = enemy ? [0.85, 0.97, 1] : [1, 0.93, 0.7];
    const bx = x - dx * 0.4;
    const bz = z - dz * 0.4;
    // Fire puffs blown back out of the nozzle.
    this.point('glow', {
      x: bx, y, z: bz,
      vx: -dx * 4 + rand(-0.3, 0.3),
      vy: rand(-0.2, 0.2),
      vz: -dz * 4 + rand(-0.3, 0.3),
      drag: 4,
      life: rand(0.09, 0.14),
      size: 0.48,
      size1: 0.18,
      tex: FxTex.FIRE,
      color: flame,
      rotV: rand(-8, 8),
    });
    this.point('glow', { x: bx, y, z: bz, life: 0.05, size: 0.55, tex: FxTex.FLARE, color: hot, alpha: 0.85 });
    this.point('glow', { x: bx, y, z: bz, life: 0.06, size: 1.15, tex: FxTex.GLOW, color: flame, alpha: 0.45 });

    // Glowing motor ribbon that cools behind the missile.
    if (prevX != null) {
      const px = prevX - dx * 0.4;
      const pz = prevZ - dz * 0.4;
      this.segment(px, y, pz, bx, y, bz, hot, 0.1, 0.12, 0.9);
      this.segment(px, y, pz, bx, y, bz, flame, 0.22, 0.28, 0.45);
    }

    // Occasional embers sputtering out of the plume.
    if (Math.random() < 0.35 * this.q) {
      this.streak({
        x: bx, y, z: bz,
        vx: -dx * rand(2, 5) + rand(-1.5, 1.5),
        vy: rand(-0.3, 1.2),
        vz: -dz * rand(2, 5) + rand(-1.5, 1.5),
        gravity: 6,
        drag: 2.5,
        life: rand(0.2, 0.4),
        len: 0.025,
        width: 0.045,
        color: hot,
      });
    }

    if (smokeEvery) {
      // Thick, lingering exhaust trail: a hot inner puff and a broad pale outer puff.
      this.point('smoke', {
        x: bx + rand(-0.05, 0.05), y: y + rand(-0.05, 0.05), z: bz + rand(-0.05, 0.05),
        vx: rand(-0.3, 0.3),
        vy: rand(0.15, 0.45),
        vz: rand(-0.3, 0.3),
        drag: 1.4,
        gravity: -0.3,
        life: rand(1.4, 2.1),
        size: 0.26,
        size1: rand(1.15, 1.6),
        color: enemy ? [0.58, 0.64, 0.74] : [0.82, 0.8, 0.76],
        alpha: 0.55,
        tex: FxTex.SMOKE,
        ramp: RAMP_SMOKE,
        fadeIn: 0.04,
        rotV: rand(-1.2, 1.2),
      });
      if (this.q >= 1 || Math.random() < 0.5) {
        this.point('smoke', {
          x: bx, y, z: bz,
          vx: rand(-0.12, 0.12),
          vy: rand(0, 0.2),
          vz: rand(-0.12, 0.12),
          drag: 2,
          life: rand(0.35, 0.55),
          size: 0.2,
          size1: 0.55,
          color: enemy ? [0.42, 0.6, 0.9] : [0.95, 0.55, 0.22],
          alpha: 0.5,
          tex: FxTex.SMOKE,
          ramp: RAMP_HOT_SMOKE,
          rotV: rand(-2, 2),
        });
      }
    }
  }

  /** Missile ignition: forward motor flash, rear back-blast cloud, sparks and a ground ring. */
  missileLaunch(x, y, z, dx, dz, { enemy = false, scale = 1, light = true } = {}) {
    const s = scale;
    const flame = enemy ? [0.45, 0.78, 1] : [1, 0.62, 0.22];
    const hot = enemy ? [0.85, 0.97, 1] : [1, 0.93, 0.7];
    this.point('glow', { x, y, z, life: 0.1, size: 1.6 * s, size1: 2.1 * s, tex: FxTex.FLARE, color: hot });
    this.point('glow', { x, y, z, life: 0.22, size: 2.4 * s, tex: FxTex.GLOW, color: flame, alpha: 0.7 });

    const nb = this.n(9 * s);
    for (let i = 0; i < nb; i++) {
      const spread = rand(-0.7, 0.7);
      const c = Math.cos(spread);
      const sn = Math.sin(spread);
      const bxv = -(dx * c - dz * sn);
      const bzv = -(dx * sn + dz * c);
      const spd = rand(3, 7) * s;
      this.point('glow', {
        x, y, z,
        vx: bxv * spd,
        vy: rand(-0.2, 0.8),
        vz: bzv * spd,
        drag: 5,
        life: rand(0.18, 0.3),
        size: 0.5 * s,
        size1: 1.1 * s,
        tex: FxTex.FIRE,
        ramp: enemy ? RAMP_NONE : RAMP_FIRE,
        color: flame,
        rotV: rand(-4, 4),
      });
      this.point('smoke', {
        x, y, z,
        vx: bxv * spd * 0.8,
        vy: rand(0.2, 1.0),
        vz: bzv * spd * 0.8,
        drag: 2.6,
        gravity: -0.4,
        delay: rand(0, 0.06),
        life: rand(1.2, 2.0),
        size: 0.45 * s,
        size1: rand(1.5, 2.2) * s,
        color: [0.72, 0.7, 0.67],
        alpha: 0.6,
        tex: FxTex.SMOKE,
        ramp: RAMP_SMOKE,
        fadeIn: 0.05,
        rotV: rand(-1, 1),
      });
    }
    const ns = this.n(10 * s);
    for (let i = 0; i < ns; i++) {
      const a = Math.atan2(-dx, -dz) + rand(-0.9, 0.9);
      const spd = rand(4, 9);
      this.streak({
        x, y, z,
        vx: Math.sin(a) * spd,
        vy: rand(0.5, 3),
        vz: Math.cos(a) * spd,
        gravity: 10,
        drag: 2,
        life: rand(0.2, 0.4),
        width: 0.05,
        color: hot,
      });
    }
    this.shockwave(x, 0.06, z, 0.2 * s, 1.5 * s, enemy ? 0x7cc8ff : 0xffc58a, 0.3, 0.55);
    if (light) this.flash(x, y + 0.6, z, enemy ? 0x7cc8ff : 0xffb060, 3 * s);
  }

  /** Shaped-charge missile detonation: fireball, forward plasma jet, coloured rings and fragments. */
  missileImpact(x, y, z, dx, dz, { enemy = false, scale = 0.85 } = {}) {
    const s = scale;
    const tint = enemy ? 0x4aa8ff : 0xff6a1a;
    const jet = enemy ? [0.55, 0.85, 1] : [1, 0.85, 0.45];
    this.explosion(x, y, z, { scale: s, scorch: false, tint });
    // HEAT jet: bright spike continuing along the flight path.
    this.segment(x, y, z, x + dx * 2.2 * s, y + 0.05, z + dz * 2.2 * s, [1, 1, 1], 0.18, 0.12, 1);
    this.segment(x, y, z, x + dx * 1.6 * s, y, z + dz * 1.6 * s, jet, 0.42, 0.2, 0.7);
    const nj = this.n(16 * s);
    for (let i = 0; i < nj; i++) {
      const a = Math.atan2(dx, dz) + rand(-0.45, 0.45);
      const spd = rand(8, 16) * s;
      this.streak({
        x, y, z,
        vx: Math.sin(a) * spd,
        vy: rand(-0.5, 2.5),
        vz: Math.cos(a) * spd,
        gravity: 9,
        drag: 2.2,
        life: rand(0.2, 0.45),
        width: 0.06,
        color: jet,
      });
    }
    // Ring of bright plasma blobs.
    const nr = this.n(10);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * Math.PI * 2;
      this.point('glow', {
        x, y: y + 0.1, z,
        vx: Math.cos(a) * 5 * s,
        vy: rand(0.2, 1.2),
        vz: Math.sin(a) * 5 * s,
        drag: 6,
        life: rand(0.25, 0.4),
        size: 0.6 * s,
        size1: 0.15,
        tex: FxTex.GLOW,
        color: jet,
      });
    }
    this.shockwave(x, 0.08, z, 0.3 * s, 3.6 * s, enemy ? 0x8fd8ff : 0xffe0a0, 0.3, 1);
  }

  /** One frame of flamethrower jet at a burning puff. `age01`: 0 = muzzle, 1 = end of reach. */
  flameJet(x, y, z, vx, vz, age01) {
    const grow = 0.35 + age01 * 1.1;
    this.point('glow', {
      x: x + rand(-0.08, 0.08) * grow, y: y + rand(-0.05, 0.08), z: z + rand(-0.08, 0.08) * grow,
      vx: vx * 0.35 + rand(-0.5, 0.5),
      vy: rand(0.4, 1.4) * (0.5 + age01),
      vz: vz * 0.35 + rand(-0.5, 0.5),
      drag: 2.5,
      life: rand(0.16, 0.26),
      size: 0.4 * grow,
      size1: 0.85 * grow,
      tex: FxTex.FIRE,
      ramp: RAMP_FIRE,
      heat: 0.6 + age01 * 0.7,
      rotV: rand(-4, 4),
    });
    if (age01 > 0.45 && Math.random() < 0.18) {
      this.point('smoke', {
        x, y: y + 0.2, z,
        vx: vx * 0.15,
        vy: rand(0.9, 1.6),
        vz: vz * 0.15,
        drag: 1.4,
        gravity: -0.3,
        life: rand(0.8, 1.2),
        size: 0.4,
        size1: 1.4,
        color: [0.12, 0.11, 0.1],
        alpha: 0.5,
        tex: FxTex.SMOKE,
        ramp: RAMP_HOT_SMOKE,
        fadeIn: 0.1,
        rotV: rand(-1, 1),
      });
    }
  }

  /** Falling-shell smoke ribbon and glint for artillery / MLRS rounds. */
  shellSmokeTrail(x, y, z, warm = true) {
    this.point('smoke', {
      x, y, z,
      vx: rand(-0.15, 0.15),
      vy: rand(-0.05, 0.15),
      vz: rand(-0.15, 0.15),
      drag: 1.2,
      life: rand(0.6, 1.0),
      size: 0.25,
      size1: 0.85,
      color: [0.55, 0.54, 0.52],
      alpha: 0.4,
      tex: FxTex.SMOKE,
      ramp: RAMP_SMOKE,
      rotV: rand(-1, 1),
    });
    this.point('glow', {
      x, y, z,
      life: 0.08,
      size: 0.6,
      tex: FxTex.GLOW,
      color: warm ? [1, 0.6, 0.25] : [0.6, 0.8, 1],
      alpha: 0.7,
    });
  }
}
