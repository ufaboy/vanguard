import * as THREE from 'three';
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  FIRE_STOPS,
  RAMP_COOL,
  RAMP_FIRE,
  RAMP_HOT_SMOKE,
  RAMP_SMOKE,
  sampleStops,
} from './atlas.js';

export const POINT_VS = `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  attribute float aRot;
  attribute float aTex;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;
  varying float vTex;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vRot = aRot;
    vTex = aTex;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Rotation-safe quad: the sprite occupies the inscribed circle of a 1.414x point
    gl_PointSize = min(aSize * uScale * 1.41421, 900.0);
  }
`;

export const POINT_FS = `
  uniform sampler2D uAtlas;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;
  varying float vTex;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) * 1.41421 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
    float col = mod(vTex, ${ATLAS_COLS}.0);
    float row = floor(vTex / ${ATLAS_COLS}.0 + 0.001);
    vec2 auv = vec2((col + uv.x) / ${ATLAS_COLS}.0, 1.0 - (row + uv.y) / ${ATLAS_ROWS}.0);
    vec4 t = texture2D(uAtlas, auv);
    float a = t.a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * t.rgb, a);
  }
`;

const STREAK_VS = `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute vec2 aUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vUv = aUv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STREAK_FS = `
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.y);
    float body = pow(across, 1.7);
    float core = pow(across, 7.0);
    float along = smoothstep(0.0, 0.85, vUv.x);
    float a = body * along * vAlpha;
    if (a < 0.003) discard;
    vec3 col = mix(vColor, vec3(1.0), core * 0.85 * along);
    gl_FragColor = vec4(col, a);
  }
`;

export class PointLayer {
  constructor(max, material) {
    this.max = max;
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({});
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    const mk = (n) => {
      const attr = new THREE.BufferAttribute(new Float32Array(max * n), n);
      attr.setUsage(THREE.DynamicDrawUsage);
      return attr;
    };
    this.aPos = mk(3);
    this.aColor = mk(3);
    this.aAlpha = mk(1);
    this.aSize = mk(1);
    this.aRot = mk(1);
    this.aTex = mk(1);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aRot', this.aRot);
    geo.setAttribute('aTex', this.aTex);
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
  }

  alloc() {
    if (this.count >= this.max) return null;
    return this.items[this.count++];
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  update(dt) {
    const tmp = [0, 0, 0];
    const pos = this.aPos.array;
    const col = this.aColor.array;
    const alp = this.aAlpha.array;
    const siz = this.aSize.array;
    const rot = this.aRot.array;
    const tex = this.aTex.array;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.life + p.delay) {
        this.count--;
        this.items[i] = this.items[this.count];
        this.items[this.count] = p;
        i--;
        continue;
      }
      if (p.age < p.delay) continue;
      const age = p.age - p.delay;
      const t = age / p.life;

      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.vz *= damp;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floor && p.vy <= 0) {
        p.y = p.floor;
        if (p.bounce > 0 && p.vy < -0.5) {
          p.vy = -p.vy * p.bounce;
          p.vx *= 0.55;
          p.vz *= 0.55;
          p.rotV *= 0.5;
        } else {
          p.vy = 0;
          p.vx *= 0.8;
          p.vz *= 0.8;
          p.rotV *= 0.8;
        }
      }
      p.rot += p.rotV * dt;

      const grow = 1 - (1 - t) * (1 - t);
      const size = p.size0 + (p.size1 - p.size0) * grow;

      let r = p.r;
      let g = p.g;
      let b = p.b;
      let a = p.alpha;
      const fadeIn = p.fadeIn > 0 ? Math.min(1, age / p.fadeIn) : 1;
      switch (p.ramp) {
        case RAMP_FIRE: {
          sampleStops(FIRE_STOPS, Math.min(1, t * p.heat), tmp);
          r *= tmp[0];
          g *= tmp[1];
          b *= tmp[2];
          a *= Math.pow(1 - t, 1.25) * fadeIn;
          break;
        }
        case RAMP_SMOKE:
          a *= Math.pow(1 - t, 1.6) * fadeIn;
          break;
        case RAMP_HOT_SMOKE: {
          const k = Math.min(1, t / 0.28);
          r = 0.72 + (r - 0.72) * k;
          g = 0.36 + (g - 0.36) * k;
          b = 0.14 + (b - 0.14) * k;
          a *= Math.pow(1 - t, 1.5) * fadeIn;
          break;
        }
        case RAMP_COOL: {
          const k = Math.min(1, t * 1.6);
          r = 1 + (r - 1) * k;
          g = 1 + (g - 1) * k;
          b = 1 + (b - 1) * k;
          a *= (1 - t) * fadeIn;
          break;
        }
        default:
          a *= (p.fadeOut ? 1 - Math.pow(t, 3) : 1) * fadeIn;
      }

      const o3 = w * 3;
      pos[o3] = p.x;
      pos[o3 + 1] = p.y;
      pos[o3 + 2] = p.z;
      col[o3] = r;
      col[o3 + 1] = g;
      col[o3 + 2] = b;
      alp[w] = a;
      siz[w] = size;
      rot[w] = p.rot;
      tex[w] = p.tex;
      w++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, w);
    if (w > 0) {
      for (const attr of [this.aPos, this.aColor, this.aAlpha, this.aSize, this.aRot, this.aTex]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, w * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
  }
}

export class StreakLayer {
  constructor(max) {
    this.max = max;
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({});
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    const mk = (n) => {
      const attr = new THREE.BufferAttribute(new Float32Array(max * 4 * n), n);
      attr.setUsage(THREE.DynamicDrawUsage);
      return attr;
    };
    this.aPos = mk(3);
    this.aColor = mk(3);
    this.aAlpha = mk(1);
    this.aUv = mk(2);
    const index = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.setAttribute('aUv', this.aUv);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VS,
      fragmentShader: STREAK_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  alloc() {
    if (this.count >= this.max) return null;
    return this.items[this.count++];
  }

  clear() {
    this.count = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  update(dt, camDir) {
    const pos = this.aPos.array;
    const col = this.aColor.array;
    const alp = this.aAlpha.array;
    const uv = this.aUv.array;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.items[i];
      s.age += dt;
      if (s.age >= s.life + s.delay) {
        this.count--;
        this.items[i] = this.items[this.count];
        this.items[this.count] = s;
        i--;
        continue;
      }
      if (s.age < s.delay) continue;
      const t = (s.age - s.delay) / s.life;

      let hx;
      let hy;
      let hz;
      let tx;
      let ty;
      let tz;
      if (s.fixed) {
        hx = s.x;
        hy = s.y;
        hz = s.z;
        tx = s.tx;
        ty = s.ty;
        tz = s.tz;
      } else {
        const damp = Math.exp(-s.drag * dt);
        s.vx *= damp;
        s.vy *= damp;
        s.vz *= damp;
        s.vy -= s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        if (s.y < s.floor) {
          s.y = s.floor;
          if (s.vy < -1) {
            s.vy = -s.vy * 0.35;
            s.vx *= 0.6;
            s.vz *= 0.6;
          } else {
            s.vy = 0;
          }
        }
        hx = s.x;
        hy = s.y;
        hz = s.z;
        tx = s.x - s.vx * s.len;
        ty = s.y - s.vy * s.len;
        tz = s.z - s.vz * s.len;
      }

      let dx = hx - tx;
      let dy = hy - ty;
      let dz = hz - tz;
      let dl = Math.hypot(dx, dy, dz);
      if (dl < 0.02) {
        dx = 0.02;
        dy = 0;
        dz = 0;
        dl = 0.02;
        tx = hx - dx;
      }
      dx /= dl;
      dy /= dl;
      dz /= dl;
      let sx = dy * camDir.z - dz * camDir.y;
      let sy = dz * camDir.x - dx * camDir.z;
      let sz = dx * camDir.y - dy * camDir.x;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const hw = s.width * 0.5 * (s.shrink ? 1 - t * 0.7 : 1);
      sx = (sx / sl) * hw;
      sy = (sy / sl) * hw;
      sz = (sz / sl) * hw;
      const ext = hw * 0.6;
      hx += dx * ext;
      hy += dy * ext;
      hz += dz * ext;

      let r = s.r;
      let g = s.g;
      let b = s.b;
      if (s.cool) {
        const k = Math.min(1, t * 1.8);
        r = 1 + (r - 1) * k;
        g = 1 + (g - 1) * k;
        b = 1 + (b - 1) * k;
        const dim = 1 - Math.max(0, t - 0.55) * 1.2;
        r *= dim;
        g *= dim;
        b *= dim;
      }
      const a = s.alpha * (s.fixed ? Math.pow(1 - t, 1.4) : 1 - t * t);

      const v = w * 4;
      const p3 = v * 3;
      pos[p3] = tx - sx;
      pos[p3 + 1] = ty - sy;
      pos[p3 + 2] = tz - sz;
      pos[p3 + 3] = tx + sx;
      pos[p3 + 4] = ty + sy;
      pos[p3 + 5] = tz + sz;
      pos[p3 + 6] = hx - sx;
      pos[p3 + 7] = hy - sy;
      pos[p3 + 8] = hz - sz;
      pos[p3 + 9] = hx + sx;
      pos[p3 + 10] = hy + sy;
      pos[p3 + 11] = hz + sz;
      for (let k = 0; k < 4; k++) {
        col[p3 + k * 3] = r;
        col[p3 + k * 3 + 1] = g;
        col[p3 + k * 3 + 2] = b;
        alp[v + k] = a;
      }
      const u2 = v * 2;
      uv[u2] = 0;
      uv[u2 + 1] = -1;
      uv[u2 + 2] = 0;
      uv[u2 + 3] = 1;
      uv[u2 + 4] = 1;
      uv[u2 + 5] = -1;
      uv[u2 + 6] = 1;
      uv[u2 + 7] = 1;
      w++;
    }
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, w * 6);
    if (w > 0) {
      for (const attr of [this.aPos, this.aColor, this.aAlpha, this.aUv]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, w * 4 * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
  }
}
