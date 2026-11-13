/** Procedural canvas textures (bricks, concrete, ground, ice, water, forest, spawner and base. */
import * as THREE from '../../../vendor/three/build/three.module.js';
import { GRID_SIZE } from '../constants.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GENERATED_TEXTURES = Object.freeze([
  'createTankArmorTexture',
  'createTrackTreadTexture',
  'createBrickTextures',
  'createConcreteTextures',
  'createGroundTexture',
  'createIceTextures',
  'createWaterTextures',
  'createShadowTexture',
  'createCommandBaseTextures',
  'createEnemyBaseTextures',
  'createForestTextures',
  'createSpawnerTextures',
]);

/** Texture generators; methods use only `this.maxAnisotropy` and canvas APIs. */
export class TextureGenerator {
  constructor({ maxAnisotropy = 16 } = {}) {
    this.maxAnisotropy = maxAnisotropy;
  }

  configureColorTexture(tex, repeatX = 1, repeatY = 1) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    if (repeatX > 1 || repeatY > 1) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    tex.needsUpdate = true;
    return tex;
  }

  drawBrickCanvas({ courses, bricksPerCourse, seed, grime }) {
    const size = 256;
    const rand = mulberry32(seed);
    const color = document.createElement('canvas');
    const bump = document.createElement('canvas');
    color.width = color.height = bump.width = bump.height = size;
    const ctx = color.getContext('2d');
    const bctx = bump.getContext('2d');

    ctx.fillStyle = '#5e544b';
    ctx.fillRect(0, 0, size, size);
    bctx.fillStyle = '#303030';
    bctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const l = 70 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgba(${l + 20}, ${l + 10}, ${l}, 0.35)`;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
    }

    const palette = [
      [148, 58, 36],
      [162, 70, 40],
      [138, 52, 34],
      [176, 84, 46],
      [154, 64, 44],
      [124, 46, 32],
    ];
    const clinker = [86, 38, 30];
    const courseH = size / courses;
    const brickW = size / bricksPerCourse;
    const joint = Math.max(3, Math.round(courseH * 0.14));

    for (let r = 0; r < courses; r++) {
      const y = r * courseH;
      const shift = (r % 2) * (brickW / 2);
      for (let c = -1; c <= bricksPerCourse; c++) {
        const x = c * brickW + shift;
        const roll = rand();
        const base = roll < 0.12 ? clinker : palette[Math.floor(rand() * palette.length)];
        const jitter = (rand() - 0.5) * 18;
        const [cr, cg, cb] = base.map((v) => Math.max(0, Math.min(255, v + jitter)));
        const bx = x + joint / 2 + (rand() - 0.5) * 1.5;
        const by = y + joint / 2 + (rand() - 0.5) * 1.2;
        const bw = brickW - joint + (rand() - 0.5) * 2;
        const bh = courseH - joint;

        const g = ctx.createLinearGradient(0, by, 0, by + bh);
        g.addColorStop(0, `rgb(${cr + 22}, ${cg + 14}, ${cb + 10})`);
        g.addColorStop(0.55, `rgb(${cr}, ${cg}, ${cb})`);
        g.addColorStop(1, `rgb(${cr - 26}, ${cg - 14}, ${cb - 10})`);
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, bw, bh);

        for (let k = 0; k < 6; k++) {
          const dark = rand() < 0.5;
          ctx.fillStyle = dark ? 'rgba(40, 12, 6, 0.16)' : 'rgba(230, 150, 100, 0.12)';
          ctx.beginPath();
          ctx.ellipse(
            bx + rand() * bw,
            by + rand() * bh,
            2 + rand() * bw * 0.18,
            1 + rand() * bh * 0.3,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(255, 205, 160, 0.28)';
        ctx.fillRect(bx, by, bw, 1.5);
        ctx.fillStyle = 'rgba(30, 10, 5, 0.45)';
        ctx.fillRect(bx, by + bh - 1.5, bw, 1.5);
        ctx.fillStyle = 'rgba(15, 10, 8, 0.4)';
        ctx.fillRect(bx, by + bh, bw, Math.min(2, joint - 1));

        if (rand() < 0.45) {
          const cx = rand() < 0.5 ? bx : bx + bw;
          const cy = rand() < 0.5 ? by : by + bh;
          ctx.fillStyle = '#4a4038';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (cx === bx ? 1 : -1) * (3 + rand() * 5), cy);
          ctx.lineTo(cx, cy + (cy === by ? 1 : -1) * (2 + rand() * 4));
          ctx.fill();
        }

        if (rand() < 0.18) {
          ctx.strokeStyle = 'rgba(25, 10, 6, 0.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          let px = bx + bw * (0.2 + rand() * 0.6);
          let py = by;
          ctx.moveTo(px, py);
          while (py < by + bh) {
            px += (rand() - 0.5) * 6;
            py += 2 + rand() * 3;
            ctx.lineTo(px, Math.min(py, by + bh));
          }
          ctx.stroke();
        }

        const h = 180 + Math.floor(rand() * 40);
        bctx.fillStyle = `rgb(${h}, ${h}, ${h})`;
        bctx.fillRect(bx, by, bw, bh);
        bctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        bctx.fillRect(bx, by + bh - 1.5, bw, 1.5);
      }
    }

    if (grime) {
      const soot = ctx.createLinearGradient(0, size * 0.55, 0, size);
      soot.addColorStop(0, 'rgba(20, 16, 14, 0)');
      soot.addColorStop(1, 'rgba(20, 16, 14, 0.5)');
      ctx.fillStyle = soot;
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.fillStyle = 'rgba(70, 28, 14, 0.14)';
      ctx.fillRect(0, 0, size, size);
    }
    for (let i = 0; i < 2; i++) {
      const sx = rand() * size;
      const sy = size * (0.2 + rand() * 0.6);
      const rad = 18 + rand() * 26;
      const scorch = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      scorch.addColorStop(0, 'rgba(18, 12, 10, 0.4)');
      scorch.addColorStop(1, 'rgba(18, 12, 10, 0)');
      ctx.fillStyle = scorch;
      ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
    }

    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = 1 + (rand() - 0.5) * 0.14;
      d[i] = Math.min(255, d[i] * n);
      d[i + 1] = Math.min(255, d[i + 1] * n);
      d[i + 2] = Math.min(255, d[i + 2] * n);
    }
    ctx.putImageData(img, 0, 0);

    const edge = ctx.createLinearGradient(0, 0, size, 0);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
    edge.addColorStop(0.05, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(0.95, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
    if (!grime) {
      const edgeV = ctx.createLinearGradient(0, 0, 0, size);
      edgeV.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
      edgeV.addColorStop(0.05, 'rgba(0, 0, 0, 0)');
      edgeV.addColorStop(0.95, 'rgba(0, 0, 0, 0)');
      edgeV.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
      ctx.fillStyle = edgeV;
      ctx.fillRect(0, 0, size, size);
    }

    return { color, bump };
  }

  drawConcreteCanvas({ seed, face }) {
    const size = 256;
    const rand = mulberry32(seed);
    const color = document.createElement('canvas');
    const bump = document.createElement('canvas');
    color.width = color.height = bump.width = bump.height = size;
    const ctx = color.getContext('2d');
    const bctx = bump.getContext('2d');
    const isSide = face === 'side';

    ctx.fillStyle = isSide ? '#97938c' : '#a29e96';
    ctx.fillRect(0, 0, size, size);
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 46; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 14 + rand() * 46;
      const dark = rand() < 0.55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, dark ? 'rgba(60, 58, 54, 0.14)' : 'rgba(205, 200, 190, 0.12)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    for (let i = 0; i < 2600; i++) {
      const l = 90 + Math.floor(rand() * 110);
      ctx.fillStyle = `rgba(${l}, ${l - 2}, ${l - 6}, ${0.18 + rand() * 0.22})`;
      ctx.fillRect(rand() * size, rand() * size, 1, 1);
    }
    for (let i = 0; i < 70; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 0.8 + rand() * 1.6;
      const l = 110 + Math.floor(rand() * 70);
      ctx.fillStyle = `rgba(${l}, ${l - 4}, ${l - 10}, 0.55)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.3, r, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      bctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      bctx.beginPath();
      bctx.arc(x, y, r, 0, Math.PI * 2);
      bctx.fill();
    }

    const bugHoles = isSide ? 48 : 12;
    for (let i = 0; i < bugHoles; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 0.5 + rand() * 1.2;
      ctx.fillStyle = 'rgba(200, 196, 188, 0.4)';
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(52, 50, 46, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      bctx.fillStyle = '#202020';
      bctx.beginPath();
      bctx.arc(x, y, r, 0, Math.PI * 2);
      bctx.fill();
    }

    const seam = (x0, y0, x1, y1, alpha) => {
      ctx.strokeStyle = `rgba(48, 46, 42, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = `rgba(210, 205, 196, ${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + (x0 === x1 ? 1.5 : 0), y0 + (y0 === y1 ? 1.5 : 0));
      ctx.lineTo(x1 + (x0 === x1 ? 1.5 : 0), y1 + (y0 === y1 ? 1.5 : 0));
      ctx.stroke();
      bctx.strokeStyle = '#303030';
      bctx.lineWidth = 2;
      bctx.beginPath();
      bctx.moveTo(x0, y0);
      bctx.lineTo(x1, y1);
      bctx.stroke();
    };

    const tieHole = (x, y, r) => {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 1.8);
      g.addColorStop(0, 'rgba(30, 30, 30, 0.85)');
      g.addColorStop(0.45, 'rgba(70, 68, 64, 0.7)');
      g.addColorStop(1, 'rgba(70, 68, 64, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(205, 200, 190, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineTo(x, y);
      ctx.fill();
      const bg = bctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
      bg.addColorStop(0, '#000000');
      bg.addColorStop(1, 'rgba(128, 128, 128, 0)');
      bctx.fillStyle = bg;
      bctx.beginPath();
      bctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      bctx.fill();
    };

    if (isSide) {
      for (let i = 0; i < 40; i++) {
        const y = rand() * size;
        ctx.strokeStyle = `rgba(${rand() < 0.5 ? '70, 66, 60' : '190, 184, 174'}, 0.08)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5);
        ctx.stroke();
      }
      seam(128, 0, 128, size, 0.55);
      seam(0, 120, size, 120, 0.6);
      for (const ty of [38, 82, 162, 214]) {
        for (const tx of [42, 214]) tieHole(tx, ty, 3.2);
        tieHole(128 + (ty < 120 ? -44 : 44), ty, 3.2);
      }
      for (const [tx, ty] of [
        [42, 82],
        [214, 162],
      ]) {
        const g = ctx.createLinearGradient(0, ty, 0, ty + 46);
        g.addColorStop(0, 'rgba(126, 64, 26, 0.45)');
        g.addColorStop(1, 'rgba(126, 64, 26, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(tx - 2.5, ty + 3, 5, 46);
      }
      for (let i = 0; i < 26; i++) {
        const x = rand() * size;
        const len = 30 + rand() * 120;
        const w = 1 + rand() * 4;
        const g = ctx.createLinearGradient(0, 0, 0, len);
        g.addColorStop(0, 'rgba(46, 46, 44, 0.24)');
        g.addColorStop(1, 'rgba(46, 46, 44, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, w, len);
      }
      for (let i = 0; i < 4; i++) {
        const x = rand() * size;
        const g = ctx.createRadialGradient(x, 118, 0, x, 118, 24);
        g.addColorStop(0, 'rgba(236, 232, 222, 0.22)');
        g.addColorStop(1, 'rgba(236, 232, 222, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 24, 94, 48, 48);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 226, size, 14);
      ctx.clip();
      for (let x = -28; x < size + 28; x += 28) {
        ctx.fillStyle = 'rgba(214, 170, 40, 0.42)';
        ctx.beginPath();
        ctx.moveTo(x, 240);
        ctx.lineTo(x + 14, 226);
        ctx.lineTo(x + 28, 226);
        ctx.lineTo(x + 14, 240);
        ctx.fill();
        ctx.fillStyle = 'rgba(28, 26, 24, 0.38)';
        ctx.beginPath();
        ctx.moveTo(x + 14, 240);
        ctx.lineTo(x + 28, 226);
        ctx.lineTo(x + 42, 226);
        ctx.lineTo(x + 28, 240);
        ctx.fill();
      }
      ctx.restore();
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = 'rgba(150, 146, 138, 0.6)';
        ctx.fillRect(rand() * size, 226 + rand() * 14, 2 + rand() * 6, 1 + rand() * 3);
      }
      const soot = ctx.createLinearGradient(0, size * 0.7, 0, size);
      soot.addColorStop(0, 'rgba(24, 22, 20, 0)');
      soot.addColorStop(1, 'rgba(24, 22, 20, 0.45)');
      ctx.fillStyle = soot;
      ctx.fillRect(0, 0, size, size);
    } else {
      for (let i = 0; i < 60; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const r = 14 + rand() * 30;
        const a = rand() * Math.PI * 2;
        ctx.strokeStyle = `rgba(${rand() < 0.5 ? '225, 220, 210' : '80, 78, 72'}, 0.09)`;
        ctx.lineWidth = 2 + rand() * 3;
        ctx.beginPath();
        ctx.arc(x, y, r, a, a + 1 + rand() * 1.5);
        ctx.stroke();
      }
      seam(128, 0, 128, size, 0.45);
      seam(0, 128, size, 128, 0.45);
      for (const [px, py] of [
        [64, 64],
        [192, 64],
        [64, 192],
        [192, 192],
      ]) {
        ctx.fillStyle = 'rgba(78, 82, 86, 0.9)';
        ctx.fillRect(px - 9, py - 9, 18, 18);
        ctx.fillStyle = 'rgba(150, 156, 160, 0.5)';
        ctx.fillRect(px - 9, py - 9, 18, 1.5);
        ctx.fillStyle = 'rgba(120, 60, 24, 0.35)';
        ctx.fillRect(px - 9, py + 4, 18, 5);
        bctx.fillStyle = '#b0b0b0';
        bctx.fillRect(px - 9, py - 9, 18, 18);
        for (const [bx, by] of [
          [-5, -5],
          [5, -5],
          [-5, 5],
          [5, 5],
        ]) {
          ctx.fillStyle = '#3a3d40';
          ctx.beginPath();
          ctx.arc(px + bx, py + by, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(200, 204, 206, 0.7)';
          ctx.fillRect(px + bx - 1, py + by - 1, 1, 1);
          bctx.fillStyle = '#e0e0e0';
          bctx.beginPath();
          bctx.arc(px + bx, py + by, 2, 0, Math.PI * 2);
          bctx.fill();
        }
      }
      for (let i = 0; i < 3; i++) {
        const x = rand() * size;
        const y = rand() * size;
        ctx.fillStyle = 'rgba(70, 68, 64, 0.12)';
        ctx.beginPath();
        ctx.ellipse(x, y, 16 + rand() * 22, 10 + rand() * 14, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = 'rgba(40, 38, 36, 0.55)';
    ctx.lineWidth = 1;
    bctx.strokeStyle = '#404040';
    bctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      let x = rand() * size;
      let y = rand() * size;
      const dir = rand() * Math.PI * 2;
      ctx.beginPath();
      bctx.beginPath();
      ctx.moveTo(x, y);
      bctx.moveTo(x, y);
      for (let s = 0; s < 10; s++) {
        x += Math.cos(dir) * 5 + (rand() - 0.5) * 5;
        y += Math.sin(dir) * 5 + (rand() - 0.5) * 5;
        ctx.lineTo(x, y);
        bctx.lineTo(x, y);
      }
      ctx.stroke();
      bctx.stroke();
    }

    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = 1 + (rand() - 0.5) * 0.1;
      d[i] = Math.min(255, d[i] * n);
      d[i + 1] = Math.min(255, d[i + 1] * n);
      d[i + 2] = Math.min(255, d[i + 2] * n);
    }
    ctx.putImageData(img, 0, 0);

    for (const vertical of [false, true]) {
      if (isSide && vertical) continue;
      const g = vertical ? ctx.createLinearGradient(0, 0, 0, size) : ctx.createLinearGradient(0, 0, size, 0);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.26)');
      g.addColorStop(0.04, 'rgba(0, 0, 0, 0)');
      g.addColorStop(0.96, 'rgba(0, 0, 0, 0)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }

    return { color, bump };
  }

  createTankArmorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#c2780e');
    grad.addColorStop(0.5, '#d98a16');
    grad.addColorStop(1, '#9a5b08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 450; i++) {
      const x = (i * 73) % 256;
      const y = (i * 137) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, 3, 2);
    }

    ctx.strokeStyle = 'rgba(30, 20, 10, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.beginPath();
    ctx.moveTo(8, 128);
    ctx.lineTo(248, 128);
    ctx.moveTo(128, 8);
    ctx.lineTo(128, 248);
    ctx.stroke();

    ctx.fillStyle = 'rgba(45, 38, 30, 0.35)';
    ctx.fillRect(22, 22, 88, 42);
    ctx.fillRect(146, 146, 88, 42);

    ctx.fillStyle = '#fde68a';
    for (let p = 18; p <= 238; p += 22) {
      ctx.fillRect(p, 12, 3, 3);
      ctx.fillRect(p, 240, 3, 3);
      ctx.fillRect(12, p, 3, 3);
      ctx.fillRect(240, p, 3, 3);
    }

    return this.configureColorTexture(new THREE.CanvasTexture(canvas));
  }

  createTrackTreadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 128, 128);

    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(4, y + 2, 120, 5);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, y + 8, 48, 6);
      ctx.fillRect(70, y + 8, 48, 6);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(58, y + 1, 12, 7);
    }

    return this.configureColorTexture(new THREE.CanvasTexture(canvas), 1, 4);
  }

  createBrickTextures() {
    const side = this.drawBrickCanvas({ courses: 8, bricksPerCourse: 2, seed: 1337, grime: true });
    const top = this.drawBrickCanvas({ courses: 4, bricksPerCourse: 2, seed: 4242, grime: false });
    const wrap = (canvas, color) => {
      const tex = new THREE.CanvasTexture(canvas);
      if (color) return this.configureColorTexture(tex);
      tex.anisotropy = this.maxAnisotropy;
      tex.needsUpdate = true;
      return tex;
    };
    return {
      side: wrap(side.color, true),
      sideBump: wrap(side.bump, false),
      top: wrap(top.color, true),
      topBump: wrap(top.bump, false),
    };
  }

  createConcreteTextures() {
    const side = this.drawConcreteCanvas({ seed: 9001, face: 'side' });
    const top = this.drawConcreteCanvas({ seed: 7310, face: 'top' });
    const plain = (canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = this.maxAnisotropy;
      tex.needsUpdate = true;
      return tex;
    };
    return {
      side: this.configureColorTexture(new THREE.CanvasTexture(side.color)),
      sideBump: plain(side.bump),
      top: this.configureColorTexture(new THREE.CanvasTexture(top.color)),
      topBump: plain(top.bump),
    };
  }

  createGroundTexture() {
    const size = 256;
    const rand = mulberry32(36);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#141d2c';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 18; i++) {
      const x = 20 + rand() * (size - 40);
      const y = 20 + rand() * (size - 40);
      const r = 18 + rand() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rand() < 0.5 ? 'rgba(40, 52, 70, 0.25)' : 'rgba(6, 10, 18, 0.25)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2200; i++) {
      const l = 30 + Math.floor(rand() * 60);
      ctx.fillStyle = `rgba(${l}, ${l + 8}, ${l + 22}, ${0.25 + rand() * 0.3})`;
      ctx.fillRect(4 + rand() * (size - 8), 4 + rand() * (size - 8), 1, 1);
    }
    for (let i = 0; i < 26; i++) {
      const l = 60 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgba(${l}, ${l + 6}, ${l + 16}, 0.5)`;
      ctx.beginPath();
      ctx.ellipse(8 + rand() * (size - 16), 8 + rand() * (size - 16), 1 + rand() * 1.5, 0.8 + rand(), rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(8, 12, 20, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(128, 6);
    ctx.lineTo(128, 250);
    ctx.moveTo(6, 128);
    ctx.lineTo(250, 128);
    ctx.stroke();
    ctx.fillStyle = '#0a0f19';
    ctx.fillRect(0, 0, size, 3);
    ctx.fillRect(0, 0, 3, size);
    ctx.fillStyle = 'rgba(70, 88, 112, 0.45)';
    ctx.fillRect(3, 3, size - 3, 1);
    ctx.fillRect(3, 3, 1, size - 3);
    ctx.fillStyle = 'rgba(4, 8, 14, 0.5)';
    ctx.fillRect(0, size - 1, size, 1);
    ctx.fillRect(size - 1, 0, 1, size);
    ctx.fillStyle = 'rgba(71, 85, 105, 0.9)';
    ctx.fillRect(8, 8, 10, 2);
    ctx.fillRect(8, 8, 2, 10);

    return this.configureColorTexture(new THREE.CanvasTexture(canvas), GRID_SIZE, GRID_SIZE);
  }

  createIceTextures() {
    const size = 512;
    const TAU = Math.PI * 2;
    const rand = mulberry32(6174);
    const points = Array.from({ length: 11 }, (_, id) => ({
      id,
      x: rand() * size,
      y: rand() * size,
      frost: rand(),
    }));
    const seamStrength = Array.from({ length: points.length * points.length }, () =>
      rand() < 0.45 ? 1 : 0.18 + rand() * 0.2
    );
    const half = size / 2;
    const wrapD = (d) => {
      const a = Math.abs(d) % size;
      return a > half ? size - a : a;
    };

    const colorCanvas = document.createElement('canvas');
    const roughCanvas = document.createElement('canvas');
    const bumpCanvas = document.createElement('canvas');
    for (const c of [colorCanvas, roughCanvas, bumpCanvas]) c.width = c.height = size;
    const cctx = colorCanvas.getContext('2d');
    const rctx = roughCanvas.getContext('2d');
    const bctx = bumpCanvas.getContext('2d');
    const cImg = cctx.createImageData(size, size);
    const rImg = rctx.createImageData(size, size);
    const bImg = bctx.createImageData(size, size);
    const clear = [94, 151, 187];
    const frost = [226, 241, 248];
    const crackCore = [32, 83, 118];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let f1 = Infinity;
        let f2 = Infinity;
        let owner = points[0];
        let second = points[0];
        for (const p of points) {
          const dx = wrapD(x - p.x + 5 * Math.sin(TAU * y / size * 7));
          const dy = wrapD(y - p.y + 5 * Math.sin(TAU * x / size * 5));
          const d = dx * dx + dy * dy;
          if (d < f1) {
            f2 = f1;
            second = owner;
            f1 = d;
            owner = p;
          } else if (d < f2) {
            f2 = d;
            second = p;
          }
        }
        const lo = Math.min(owner.id, second.id);
        const hi = Math.max(owner.id, second.id);
        const seam = seamStrength[lo * points.length + hi];
        const edgeDist = (Math.sqrt(f2) - Math.sqrt(f1)) / 2;
        const u = x / size;
        const v = y / size;
        const patch = 0.5 + 0.25 * Math.sin(TAU * (2 * u + v) + 0.7) + 0.25 * Math.sin(TAU * (u - 3 * v) + 2.1);
        let fr = owner.frost * 0.5 + Math.exp(-edgeDist / 10) * 0.5 * seam + (patch - 0.5) * 0.45;
        fr = Math.max(0, Math.min(1, fr));
        const crack = Math.exp(-edgeDist / 0.7) * seam;
        const rim = Math.exp(-Math.abs(edgeDist - 1.8) / 0.8) * 0.3 * seam;
        const i = (y * size + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          let c = clear[ch] + (frost[ch] - clear[ch]) * fr;
          c += (255 - c) * rim;
          c += (crackCore[ch] - c) * crack;
          cImg.data[i + ch] = c;
        }
        cImg.data[i + 3] = 255;
        const r = Math.round((0.06 + fr * 0.55 + crack * 0.3) * 255);
        rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = r;
        rImg.data[i + 3] = 255;
        const b = Math.round(200 - crack * 170 + fr * 30);
        bImg.data[i] = bImg.data[i + 1] = bImg.data[i + 2] = b;
        bImg.data[i + 3] = 255;
      }
    }
    cctx.putImageData(cImg, 0, 0);
    rctx.putImageData(rImg, 0, 0);
    bctx.putImageData(bImg, 0, 0);

    const tiled = (fn) => {
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
    };

    // Long pressure fractures and their finer branches continue across texture borders.
    const strokeFracture = (points, width) => tiled((ox, oy) => {
      for (const [ctx, ink, lineWidth, shift] of [
        [cctx, 'rgba(24, 66, 98, 0.7)', width + 1.2, 0],
        [cctx, 'rgba(230, 249, 255, 0.9)', width, 1.5],
        [bctx, 'rgba(35, 35, 35, 0.8)', width, 0],
        [rctx, 'rgba(160, 160, 160, 0.9)', width + 2, 0],
      ]) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        points.forEach(([x, y], i) => i ? ctx.lineTo(x + ox + shift, y + oy) : ctx.moveTo(x + ox + shift, y + oy));
        ctx.stroke();
      }
    });
    for (let n = 0; n < 5; n++) {
      const points = [[rand() * size, rand() * size]];
      const angle = rand() * TAU;
      for (let i = 0; i < 7; i++) {
        const [x, y] = points.at(-1);
        points.push([x + Math.cos(angle) * 24 + (rand() - 0.5) * 24,
          y + Math.sin(angle) * 24 + (rand() - 0.5) * 24]);
      }
      strokeFracture(points, 1.1);
      for (let i = 2; i < 6; i += 2) {
        const [x, y] = points[i];
        const branchAngle = angle + (i === 2 ? 0.8 : -0.9);
        strokeFracture([[x, y], [x + Math.cos(branchAngle) * 22, y + Math.sin(branchAngle) * 22],
          [x + Math.cos(branchAngle + 0.3) * 45, y + Math.sin(branchAngle + 0.3) * 45]], 0.5);
      }
    }

    for (let n = 0; n < 18; n++) {
      const pts = [[rand() * size, rand() * size]];
      const dir = rand() * TAU;
      for (let s = 0; s < 6; s++) {
        const [px, py] = pts[pts.length - 1];
        pts.push([px + Math.cos(dir) * 5 + (rand() - 0.5) * 6, py + Math.sin(dir) * 5 + (rand() - 0.5) * 6]);
      }
      tiled((ox, oy) => {
        cctx.strokeStyle = 'rgba(235, 248, 255, 0.45)';
        cctx.lineWidth = 0.8;
        cctx.beginPath();
        pts.forEach(([px, py], k) => (k ? cctx.lineTo(px + ox, py + oy) : cctx.moveTo(px + ox, py + oy)));
        cctx.stroke();
      });
    }

    for (let n = 0; n < 7; n++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const radius = 120 + rand() * 260;
      const a0 = rand() * TAU;
      const sweep = 0.25 + rand() * 0.35;
      const lanes = 2 + Math.floor(rand() * 3);
      tiled((ox, oy) => {
        for (let l = 0; l < lanes; l++) {
          const rr = radius + l * 2.5;
          cctx.strokeStyle = 'rgba(230, 244, 252, 0.35)';
          cctx.lineWidth = 1;
          cctx.beginPath();
          cctx.arc(cx + ox, cy + oy, rr, a0, a0 + sweep);
          cctx.stroke();
          rctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
          rctx.lineWidth = 1.5;
          rctx.beginPath();
          rctx.arc(cx + ox, cy + oy, rr, a0, a0 + sweep);
          rctx.stroke();
          bctx.strokeStyle = 'rgba(120, 120, 120, 0.6)';
          bctx.lineWidth = 1;
          bctx.beginPath();
          bctx.arc(cx + ox, cy + oy, rr, a0, a0 + sweep);
          bctx.stroke();
        }
      });
    }

    for (let n = 0; n < 110; n++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 0.6 + rand() * 1.8;
      cctx.strokeStyle = 'rgba(225, 242, 252, 0.5)';
      cctx.lineWidth = 0.7;
      cctx.beginPath();
      cctx.arc(x, y, r, 0, TAU);
      cctx.stroke();
    }
    for (let n = 0; n < 90; n++) {
      cctx.fillStyle = `rgba(255, 255, 255, ${0.4 + rand() * 0.5})`;
      cctx.fillRect(rand() * size, rand() * size, 1, 1);
    }

    const plain = (canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = this.maxAnisotropy;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      return tex;
    };
    const color = this.configureColorTexture(new THREE.CanvasTexture(colorCanvas));
    color.wrapS = color.wrapT = THREE.RepeatWrapping;
    return {
      color,
      rough: plain(roughCanvas),
      bump: plain(bumpCanvas),
    };
  }

  createWaterTextures() {
    const size = 256;
    const TAU = Math.PI * 2;
    const rand = mulberry32(5050);
    const waves = Array.from({ length: 9 }, (_, i) => ({
      kx: Math.floor(rand() * (3 + i)) - Math.floor((1 + i) / 2),
      ky: 2 + i * 2 + Math.floor(rand() * 3),
      amp: 1 / (1 + i * 0.9),
      phase: rand() * TAU,
    }));
    const height = (u, v) =>
      waves.reduce((h, w) => h + w.amp * Math.sin(TAU * (w.kx * u + w.ky * v) + w.phase), 0);
    const caustic = (u, v, k, p) => {
      const wu = u + 0.06 * Math.sin(TAU * (2 * v + p)) + 0.04 * Math.sin(TAU * (3 * u - v + p));
      const wv = v + 0.06 * Math.sin(TAU * (2 * u - p)) + 0.04 * Math.sin(TAU * (u + 3 * v - p));
      const a = 1 - Math.abs(Math.sin(TAU * (k * wu + p)));
      const b = 1 - Math.abs(Math.sin(TAU * (k * wv - p)));
      const c = 1 - Math.abs(Math.sin(TAU * (k * (wu + wv) + p * 2)));
      return Math.pow(a, 10) + Math.pow(b, 10) + Math.pow(c, 12) * 0.7;
    };

    const colorCanvas = document.createElement('canvas');
    const normalCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = normalCanvas.width = normalCanvas.height = size;
    const cctx = colorCanvas.getContext('2d');
    const nctx = normalCanvas.getContext('2d');
    const cImg = cctx.createImageData(size, size);
    const nImg = nctx.createImageData(size, size);
    const deep = [8, 44, 78];
    const shallow = [22, 104, 146];
    const light = [150, 220, 245];
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) heights[y * size + x] = height(x / size, y / size);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const i = (y * size + x) * 4;
        const depth = 0.5 + 0.22 * Math.sin(TAU * (u + 2 * v) + 1.3) + 0.18 * Math.sin(TAU * (3 * u - v) + 0.4);
        const cs = Math.min(1, caustic(u, v, 3, 0.17) * 0.55 + caustic(u, v, 5, 0.61) * 0.3);
        for (let ch = 0; ch < 3; ch++) {
          const base = deep[ch] + (shallow[ch] - deep[ch]) * depth;
          cImg.data[i + ch] = Math.min(255, base + (light[ch] - base) * cs * 0.45);
        }
        cImg.data[i + 3] = 255;

        const h = heights[y * size + x];
        const dx = (heights[y * size + ((x + 1) % size)] - h) * 3.5;
        const dy = (heights[((y + 1) % size) * size + x] - h) * 3.5;
        const len = Math.hypot(dx, dy, 1);
        nImg.data[i] = 128 + (-dx / len) * 127;
        nImg.data[i + 1] = 128 + (dy / len) * 127;
        nImg.data[i + 2] = 128 + (1 / len) * 127;
        nImg.data[i + 3] = 255;
      }
    }
    cctx.putImageData(cImg, 0, 0);
    nctx.putImageData(nImg, 0, 0);

    for (let n = 0; n < 40; n++) {
      const x = rand() * size;
      const y = rand() * size;
      const g = cctx.createRadialGradient(x, y, 0, x, y, 2.5);
      g.addColorStop(0, 'rgba(235, 250, 255, 0.55)');
      g.addColorStop(1, 'rgba(235, 250, 255, 0)');
      cctx.fillStyle = g;
      cctx.fillRect(x - 3, y - 3, 6, 6);
    }

    const color = this.configureColorTexture(new THREE.CanvasTexture(colorCanvas));
    color.wrapS = color.wrapT = THREE.RepeatWrapping;
    const normal = new THREE.CanvasTexture(normalCanvas);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.anisotropy = this.maxAnisotropy;
    normal.needsUpdate = true;
    return { color, normal };
  }

  createShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  createCommandBaseTextures() {
    const TAU = Math.PI * 2;
    const rand = mulberry32(1945);
    const make = (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      return [canvas, canvas.getContext('2d')];
    };
    const tex = (canvas, color = true) => {
      const t = new THREE.CanvasTexture(canvas);
      t.anisotropy = this.maxAnisotropy;
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const rivets = (g, pts, r = 1.8) => {
      for (const [x, y] of pts) {
        g.fillStyle = '#0f141b';
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(200, 210, 225, 0.7)';
        g.fillRect(x - 0.8, y - 1, 1.2, 1);
      }
    };

    // Precast concrete wall panels with seams, bolts and grime.
    const [wall, w] = make(256, 256);
    w.fillStyle = '#8b9099';
    w.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const l = 120 + Math.floor(rand() * 40);
      w.fillStyle = `rgba(${l}, ${l + 2}, ${l + 8}, 0.18)`;
      w.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 2 + rand() * 4);
    }
    w.strokeStyle = 'rgba(40, 44, 52, 0.55)';
    w.lineWidth = 2;
    for (const x of [0, 128, 256]) {
      w.beginPath();
      w.moveTo(x, 0);
      w.lineTo(x, 256);
      w.stroke();
    }
    for (const y of [0, 128, 256]) {
      w.beginPath();
      w.moveTo(0, y);
      w.lineTo(256, y);
      w.stroke();
    }
    w.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (const x of [2, 130]) w.fillRect(x, 0, 3, 256);
    rivets(w, [[12, 12], [116, 12], [140, 12], [244, 12], [12, 140], [116, 140], [140, 140], [244, 140]], 2.2);
    const grime = w.createLinearGradient(0, 128, 0, 256);
    grime.addColorStop(0, 'rgba(30, 26, 22, 0)');
    grime.addColorStop(1, 'rgba(30, 26, 22, 0.35)');
    w.fillStyle = grime;
    w.fillRect(0, 0, 256, 256);

    // Yellow / charcoal hazard chevrons for pillars and kerbs.
    const [hazard, hz] = make(128, 128);
    hz.fillStyle = '#2b2f36';
    hz.fillRect(0, 0, 128, 128);
    hz.fillStyle = '#e8b018';
    for (let x = -128; x < 256; x += 48) {
      hz.beginPath();
      hz.moveTo(x, 128);
      hz.lineTo(x + 24, 128);
      hz.lineTo(x + 152, 0);
      hz.lineTo(x + 128, 0);
      hz.closePath();
      hz.fill();
    }

    // Apron slab: light concrete, expansion joints, yellow bay lines and a parking stencil.
    const [apron, ap] = make(512, 256);
    ap.fillStyle = '#9a9ea6';
    ap.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 1400; i++) {
      const l = 130 + Math.floor(rand() * 45);
      ap.fillStyle = `rgba(${l}, ${l + 2}, ${l + 6}, 0.2)`;
      ap.fillRect(rand() * 512, rand() * 256, 2 + rand() * 5, 2 + rand() * 5);
    }
    ap.strokeStyle = 'rgba(55, 60, 68, 0.45)';
    ap.lineWidth = 2;
    for (let x = 0; x <= 512; x += 64) {
      ap.beginPath();
      ap.moveTo(x, 0);
      ap.lineTo(x, 256);
      ap.stroke();
    }
    ap.beginPath();
    ap.moveTo(0, 128);
    ap.lineTo(512, 128);
    ap.stroke();
    ap.strokeStyle = '#e8b018';
    ap.lineWidth = 6;
    ap.strokeRect(150, 30, 120, 196);
    ap.strokeRect(282, 30, 120, 196);
    ap.strokeStyle = 'rgba(232, 176, 24, 0.85)';
    ap.lineWidth = 4;
    ap.setLineDash([16, 10]);
    ap.strokeRect(16, 60, 104, 136);
    ap.setLineDash([]);
    ap.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ap.lineWidth = 4;
    ap.strokeRect(426, 70, 70, 116);

    // Bay floor: darker concrete with a yellow parking frame.
    const [bay, bf] = make(128, 128);
    bf.fillStyle = '#5d626b';
    bf.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      const l = 75 + Math.floor(rand() * 30);
      bf.fillStyle = `rgba(${l}, ${l + 2}, ${l + 6}, 0.3)`;
      bf.fillRect(rand() * 128, rand() * 128, 2 + rand() * 3, 2 + rand() * 3);
    }
    bf.strokeStyle = '#e8b018';
    bf.lineWidth = 5;
    bf.strokeRect(12, 8, 104, 112);

    // Workshop emblem: gear with a crossed wrench between wings, on a red-rimmed hexagonal plaque.
    const [sign, sg] = make(256, 96);
    const plaque = (inset) => {
      sg.beginPath();
      sg.moveTo(28 + inset, inset);
      sg.lineTo(228 - inset, inset);
      sg.lineTo(256 - inset, 48);
      sg.lineTo(228 - inset, 96 - inset);
      sg.lineTo(28 + inset, 96 - inset);
      sg.lineTo(inset, 48);
      sg.closePath();
    };
    sg.fillStyle = '#b3261e';
    plaque(0);
    sg.fill();
    sg.fillStyle = '#e5e7eb';
    plaque(6);
    sg.fill();
    sg.fillStyle = '#2c3038';
    plaque(10);
    sg.fill();
    sg.fillStyle = '#e5e7eb';
    for (const dir of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const y = 36 + k * 10;
        const x0 = 128 + dir * 34;
        sg.beginPath();
        sg.moveTo(x0, y);
        sg.lineTo(x0 + dir * (62 - k * 12), y);
        sg.lineTo(x0 + dir * (54 - k * 12), y + 6);
        sg.lineTo(x0, y + 6);
        sg.closePath();
        sg.fill();
      }
    }
    sg.save();
    sg.translate(128, 48);
    for (let i = 0; i < 8; i++) {
      sg.rotate(TAU / 8);
      sg.fillRect(-5, -30, 10, 10);
    }
    sg.beginPath();
    sg.arc(0, 0, 23, 0, TAU);
    sg.fill();
    sg.fillStyle = '#2c3038';
    sg.beginPath();
    sg.arc(0, 0, 14, 0, TAU);
    sg.fill();
    sg.rotate(-Math.PI / 4);
    sg.fillStyle = '#e5e7eb';
    sg.fillRect(-3.5, -24, 7, 48);
    sg.beginPath();
    sg.arc(0, -24, 8, 0, TAU);
    sg.fill();
    sg.fillStyle = '#2c3038';
    sg.fillRect(-3, -34, 6, 10);
    sg.restore();

    // Fuel tank wrap: olive steel with a stencilled FUEL label and pump glyph.
    const [fuel, fl] = make(256, 256);
    fl.fillStyle = '#56603f';
    fl.fillRect(0, 0, 256, 256);
    const sheen = fl.createLinearGradient(0, 0, 256, 0);
    sheen.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
    sheen.addColorStop(0.25, 'rgba(255, 255, 255, 0.12)');
    sheen.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    fl.fillStyle = sheen;
    fl.fillRect(0, 0, 256, 256);
    fl.fillStyle = 'rgba(30, 34, 22, 0.6)';
    for (const y of [10, 242]) fl.fillRect(0, y, 256, 4);
    // The label runs along the tank axis (texture V) on the quarter of the wrap facing outwards.
    fl.save();
    fl.translate(64, 128);
    fl.rotate(Math.PI / 2);
    fl.fillStyle = '#e5e7eb';
    fl.font = 'bold 44px sans-serif';
    fl.textAlign = 'center';
    fl.textBaseline = 'middle';
    fl.fillText('FUEL', 14, 0);
    fl.fillRect(-82, -16, 16, 28);
    fl.fillRect(-66, -10, 8, 4);
    fl.fillRect(-60, -10, 4, 18);
    fl.restore();

    // Ammunition crate planks with a cross brace.
    const [crate, cr] = make(128, 128);
    cr.fillStyle = '#566339';
    cr.fillRect(0, 0, 128, 128);
    cr.strokeStyle = 'rgba(26, 32, 16, 0.75)';
    cr.lineWidth = 3;
    for (let y = 32; y < 128; y += 32) {
      cr.beginPath();
      cr.moveTo(0, y);
      cr.lineTo(128, y);
      cr.stroke();
    }
    cr.fillStyle = '#4a5631';
    cr.fillRect(0, 0, 128, 12);
    cr.fillRect(0, 116, 128, 12);
    cr.fillRect(0, 0, 12, 128);
    cr.fillRect(116, 0, 12, 128);
    cr.lineWidth = 10;
    cr.strokeStyle = '#4a5631';
    cr.beginPath();
    cr.moveTo(12, 12);
    cr.lineTo(116, 116);
    cr.moveTo(116, 12);
    cr.lineTo(12, 116);
    cr.stroke();

    const R = 512;
    const RC = R / 2;
    const [repair, rp] = make(R, R);
    rp.save();
    rp.beginPath();
    rp.arc(RC, RC, RC * 0.955, 0, TAU);
    rp.clip();
    const hexR = 14;
    rp.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    rp.lineWidth = 1;
    for (let row = 0, y = 0; y < R + hexR; row++, y += hexR * 1.5) {
      for (let x = row % 2 ? hexR * 0.866 : 0; x < R + hexR; x += hexR * 1.732) {
        rp.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + Math.PI / 6;
          const px = x + Math.cos(a) * hexR;
          const py = y + Math.sin(a) * hexR;
          if (k) rp.lineTo(px, py);
          else rp.moveTo(px, py);
        }
        rp.closePath();
        rp.stroke();
      }
    }
    rp.restore();
    rp.globalCompositeOperation = 'destination-in';
    const fadeIn = rp.createRadialGradient(RC, RC, RC * 0.2, RC, RC, RC * 0.96);
    fadeIn.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
    fadeIn.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    rp.fillStyle = fadeIn;
    rp.fillRect(0, 0, R, R);
    rp.globalCompositeOperation = 'source-over';
    const wash = rp.createRadialGradient(RC, RC, 0, RC, RC, RC * 0.96);
    wash.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    wash.addColorStop(0.85, 'rgba(255, 255, 255, 0.14)');
    wash.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
    rp.fillStyle = wash;
    rp.beginPath();
    rp.arc(RC, RC, RC * 0.96, 0, TAU);
    rp.fill();
    rp.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    rp.lineWidth = RC * 0.04;
    rp.setLineDash([22, 12]);
    rp.beginPath();
    rp.arc(RC, RC, RC * 0.978, 0, TAU);
    rp.stroke();
    rp.setLineDash([]);
    rp.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    rp.lineWidth = 2;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const r0 = RC * 0.9;
      const r1 = RC * (i % 6 === 0 ? 0.84 : 0.875);
      rp.beginPath();
      rp.moveTo(RC + Math.cos(a) * r0, RC + Math.sin(a) * r0);
      rp.lineTo(RC + Math.cos(a) * r1, RC + Math.sin(a) * r1);
      rp.stroke();
    }
    rp.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      const x = RC + Math.cos(a) * RC * 0.8;
      const y = RC + Math.sin(a) * RC * 0.8;
      rp.fillRect(x - 7, y - 2, 14, 4);
      rp.fillRect(x - 2, y - 7, 4, 14);
    }

    const repairTex = tex(repair);
    repairTex.center.set(0.5, 0.5);
    return {
      wall: tex(wall),
      hazard: tex(hazard),
      apron: tex(apron),
      bay: tex(bay),
      sign: tex(sign),
      fuel: tex(fuel),
      crate: tex(crate),
      repair: repairTex,
    };
  }

  createEnemyBaseTextures() {
    const TAU = Math.PI * 2;
    const rand = mulberry32(6660);
    const make = (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      return [canvas, canvas.getContext('2d')];
    };
    const tex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.anisotropy = this.maxAnisotropy;
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const rivets = (g, pts, r = 2) => {
      for (const [x, y] of pts) {
        g.fillStyle = '#07090c';
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(170, 180, 195, 0.6)';
        g.fillRect(x - 0.8, y - 1, 1.2, 1);
      }
    };
    const stripes = (g, x0, y0, w, h, step, colA, colB) => {
      g.save();
      g.beginPath();
      g.rect(x0, y0, w, h);
      g.clip();
      g.fillStyle = colB;
      g.fillRect(x0, y0, w, h);
      g.fillStyle = colA;
      for (let x = x0 - h; x < x0 + w + h; x += step * 2) {
        g.beginPath();
        g.moveTo(x, y0 + h);
        g.lineTo(x + h, y0);
        g.lineTo(x + h + step, y0);
        g.lineTo(x + step, y0 + h);
        g.fill();
      }
      g.restore();
    };

    const [wall, w] = make(512, 160);
    w.fillStyle = '#151a21';
    w.fillRect(0, 0, 512, 160);
    for (let i = 0; i < 4; i++) {
      const x = i * 128;
      const l = 26 + Math.floor(rand() * 8);
      w.fillStyle = `rgb(${l}, ${l + 3}, ${l + 8})`;
      w.fillRect(x + 4, 8, 120, 104);
      w.fillStyle = 'rgba(255, 255, 255, 0.06)';
      w.fillRect(x + 4, 8, 120, 2);
      w.fillStyle = 'rgba(0, 0, 0, 0.45)';
      w.fillRect(x + 4, 110, 120, 2);
      w.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      w.lineWidth = 2;
      w.beginPath();
      w.moveTo(x + 10, 104);
      w.lineTo(x + 118, 16);
      w.stroke();
      rivets(w, [
        [x + 12, 16],
        [x + 116, 16],
        [x + 12, 104],
        [x + 116, 104],
        [x + 64, 16],
        [x + 64, 104],
      ]);
    }
    w.fillStyle = '#450a0a';
    w.fillRect(0, 50, 512, 10);
    for (let x = 10; x < 512; x += 28) {
      w.fillStyle = '#f87171';
      w.fillRect(x, 53, 12, 4);
    }
    w.font = 'bold 26px monospace';
    w.textAlign = 'center';
    w.textBaseline = 'middle';
    w.fillStyle = 'rgba(220, 38, 38, 0.7)';
    w.fillText('X-0', 256, 86);
    w.font = 'bold 11px monospace';
    w.fillStyle = 'rgba(203, 213, 225, 0.45)';
    w.fillText('RESTRICTED  ZONE', 256, 30);
    stripes(w, 0, 122, 512, 38, 12, 'rgba(220, 38, 38, 0.85)', '#0b0d10');
    const grime = w.createLinearGradient(0, 80, 0, 160);
    grime.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grime.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    w.fillStyle = grime;
    w.fillRect(0, 0, 512, 160);

    // Concrete bastion panels (tiled around the walls)
    const [stone, st] = make(256, 256);
    st.fillStyle = '#7b818a';
    st.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const x = col * 128 + (row ? 64 : 0);
        const l = 112 + Math.floor(rand() * 22);
        for (const px of [x, x - 256]) {
          st.fillStyle = `rgb(${l}, ${l + 4}, ${l + 10})`;
          st.fillRect(px + 2, row * 128 + 2, 124, 124);
        }
      }
    }
    for (let i = 0; i < 900; i++) {
      st.fillStyle = `rgba(${rand() < 0.5 ? '20, 22, 26' : '200, 205, 212'}, ${0.05 + rand() * 0.08})`;
      st.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 2);
    }
    st.fillStyle = 'rgba(15, 18, 22, 0.75)';
    for (const y of [0, 127, 128, 255]) st.fillRect(0, y, 256, 1);
    for (const x of [0, 128]) {
      st.fillRect(x, 0, 1, 128);
      st.fillRect(x + 64, 128, 1, 128);
    }
    for (const [x, y] of [[40, 60], [168, 60], [104, 188], [232, 188]]) {
      st.fillStyle = 'rgba(10, 12, 15, 0.8)';
      st.fillRect(x - 10, y, 20, 5);
    }
    const stoneGrime = st.createLinearGradient(0, 0, 0, 256);
    stoneGrime.addColorStop(0, 'rgba(0, 0, 0, 0)');
    stoneGrime.addColorStop(1, 'rgba(10, 8, 6, 0.35)');
    st.fillStyle = stoneGrime;
    st.fillRect(0, 0, 256, 256);

    // Yellow / black hazard band (tiled)
    const [hazard, hz] = make(128, 32);
    stripes(hz, 0, 0, 128, 32, 16, '#eab308', '#111317');

    // Red / white road barrier
    const [barrier, br] = make(128, 64);
    stripes(br, 0, 0, 128, 52, 18, '#dc2626', '#e5e7eb');
    br.fillStyle = '#4b5563';
    br.fillRect(0, 52, 128, 12);

    // Swallow-tail war banner with the winged chevron emblem (transparent outside the cloth)
    const [banner, bn] = make(128, 256);
    const cloth = new Path2D('M8 10 L120 10 L120 244 L64 212 L8 244 Z');
    const crimsonCloth = bn.createLinearGradient(0, 0, 128, 0);
    crimsonCloth.addColorStop(0, '#7f1d1d');
    crimsonCloth.addColorStop(0.5, '#c0262d');
    crimsonCloth.addColorStop(1, '#7f1d1d');
    bn.fillStyle = crimsonCloth;
    bn.fill(cloth);
    bn.strokeStyle = '#3f0a0c';
    bn.lineWidth = 6;
    bn.stroke(cloth);
    bn.fillStyle = '#1f2937';
    bn.fillRect(0, 0, 128, 12);
    bn.fillStyle = '#fde2e2';
    bn.fill(new Path2D('M64 150 L38 96 L52 96 L64 122 L76 96 L90 96 Z'));
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const x0 = 64 + s * (30 + k * 8);
        bn.beginPath();
        bn.moveTo(x0, 112 - k * 6);
        bn.lineTo(64 + s * (52 + k * 6), 70 + k * 4);
        bn.lineTo(64 + s * (46 + k * 6), 98 - k * 2);
        bn.closePath();
        bn.fill();
      }
    }

    // Ground pad: concrete apron, lit approach lane with chevrons, red line and blue outer band
    const P = 512;
    const PC = P / 2;
    const [pad, pd] = make(P, P);
    const [padGlow, pg] = make(P, P);
    pg.fillStyle = '#000';
    pg.fillRect(0, 0, P, P);
    pd.fillStyle = '#3a3f47';
    pd.fillRect(0, 0, P, P);
    for (let i = 0; i < 2500; i++) {
      pd.fillStyle = `rgba(${rand() < 0.5 ? '15, 17, 20' : '170, 176, 185'}, ${0.04 + rand() * 0.07})`;
      pd.fillRect(rand() * P, rand() * P, 1 + rand() * 4, 1 + rand() * 3);
    }
    pd.strokeStyle = 'rgba(12, 14, 17, 0.6)';
    pd.lineWidth = 2;
    for (const r of [0.5, 0.68]) {
      pd.beginPath();
      pd.arc(PC, PC, PC * r, 0, TAU);
      pd.stroke();
    }
    const laneW = 46;
    pd.fillStyle = '#23272e';
    pd.fillRect(PC - laneW, PC + 150, laneW * 2, PC);
    pd.fillStyle = '#eab308';
    for (let y = PC + 160; y < P - 30; y += 22) {
      pd.fillRect(PC - laneW + 2, y, 5, 12);
      pd.fillRect(PC + laneW - 7, y, 5, 12);
    }
    pd.strokeStyle = 'rgba(226, 232, 240, 0.85)';
    pd.lineWidth = 7;
    for (const y of [PC + 175, PC + 200, PC + 225]) {
      pd.beginPath();
      pd.moveTo(PC - 22, y + 12);
      pd.lineTo(PC, y);
      pd.lineTo(PC + 22, y + 12);
      pd.stroke();
    }
    for (const g of [pd, pg]) {
      g.fillStyle = '#ef4444';
      for (const y of [PC + 165, PC + 205, PC + 245]) {
        g.fillRect(PC - laneW - 8, y, 5, 5);
        g.fillRect(PC + laneW + 3, y, 5, 5);
      }
      g.strokeStyle = '#ef4444';
      g.lineWidth = PC * 0.04;
      g.beginPath();
      g.arc(PC, PC, PC * 0.83, 0, TAU);
      g.stroke();
    }
    pd.strokeStyle = '#2f4f7f';
    pd.lineWidth = PC * 0.115;
    pd.beginPath();
    pd.arc(PC, PC, PC * 0.918, 0, TAU);
    pd.stroke();
    pd.strokeStyle = 'rgba(147, 197, 253, 0.35)';
    pd.lineWidth = 2;
    for (const r of [0.862, 0.974]) {
      pd.beginPath();
      pd.arc(PC, PC, PC * r, 0, TAU);
      pd.stroke();
    }
    pd.strokeStyle = '#151a21';
    pd.lineWidth = PC * 0.03;
    pd.beginPath();
    pd.arc(PC, PC, PC * 0.985, 0, TAU);
    pd.stroke();

    const R = 256;
    const RC = R / 2;
    const [ring, rg] = make(R, R);
    const inner = RC * (1.15 / 1.32);
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * TAU;
      const a1 = ((i + 1) / 40) * TAU;
      rg.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.25)';
      rg.beginPath();
      rg.arc(RC, RC, RC, a0, a1);
      rg.arc(RC, RC, inner, a1 + 0.05, a0 + 0.05, true);
      rg.closePath();
      rg.fill();
    }
    const ringTex = tex(ring);
    ringTex.center.set(0.5, 0.5);

    return {
      wall: tex(wall),
      stone: tex(stone),
      hazard: tex(hazard),
      barrier: tex(barrier),
      banner: tex(banner),
      pad: tex(pad),
      padGlow: tex(padGlow),
      ring: ringTex,
    };
  }

  createForestTextures() {
    const size = 256;

    const foliage = document.createElement('canvas');
    foliage.width = foliage.height = size;
    let ctx = foliage.getContext('2d');
    let rand = mulberry32(2718);
    const fg = ctx.createLinearGradient(0, 0, 0, size);
    fg.addColorStop(0, '#2f7a3a');
    fg.addColorStop(1, '#173f22');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, size, size);
    const tiers = 5;
    const tierH = size / tiers;
    for (let t = 0; t < tiers; t++) {
      const y0 = t * tierH;
      const shade = ctx.createLinearGradient(0, y0, 0, y0 + tierH);
      shade.addColorStop(0, 'rgba(6, 24, 12, 0.55)');
      shade.addColorStop(0.45, 'rgba(6, 24, 12, 0)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, y0, size, tierH);
      const sprays = 44;
      for (let s = 0; s < sprays; s++) {
        const cx = rand() * size;
        const top = y0 + tierH * (0.05 + rand() * 0.35);
        const len = tierH * (0.45 + rand() * 0.5);
        const lean = (rand() - 0.5) * 14;
        const lit = 0.6 + rand() * 0.6;
        for (const wx of [cx - size, cx, cx + size]) {
          if (wx < -30 || wx > size + 30) continue;
          ctx.strokeStyle = 'rgba(40, 30, 18, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(wx, top);
          ctx.lineTo(wx + lean, top + len * 0.85);
          ctx.stroke();
          for (let n = 0; n < 16; n++) {
            const along = rand();
            const bx = wx + lean * along;
            const by = top + len * 0.85 * along;
            const side = rand() < 0.5 ? -1 : 1;
            const nl = 4 + rand() * 7;
            const g = Math.floor((60 + rand() * 60) * lit);
            ctx.strokeStyle = `rgba(${Math.floor(g * 0.4)}, ${g + 25}, ${Math.floor(g * 0.42)}, 0.8)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + side * nl * 0.8, by + nl * 0.7);
            ctx.stroke();
          }
          ctx.fillStyle = `rgba(${130 + Math.floor(rand() * 50)}, ${180 + Math.floor(rand() * 40)}, 86, ${0.35 * lit})`;
          ctx.beginPath();
          ctx.ellipse(wx + lean, top + len * 0.88, 3, 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const core = ctx.createLinearGradient(0, size * 0.7, 0, size);
    core.addColorStop(0, 'rgba(4, 18, 8, 0)');
    core.addColorStop(1, 'rgba(4, 18, 8, 0.4)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, size, size);

    const bark = document.createElement('canvas');
    bark.width = 64;
    bark.height = 128;
    ctx = bark.getContext('2d');
    rand = mulberry32(1618);
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 26; i++) {
      let x = rand() * 64;
      ctx.strokeStyle = `rgba(28, 16, 10, ${0.5 + rand() * 0.4})`;
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= 128; y += 8) {
        x += (rand() - 0.5) * 4;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? '140, 98, 66' : '40, 24, 14'}, 0.3)`;
      ctx.fillRect(rand() * 64, rand() * 128, 3 + rand() * 6, 2 + rand() * 4);
    }

    const floor = document.createElement('canvas');
    floor.width = floor.height = size;
    ctx = floor.getContext('2d');
    rand = mulberry32(3141);
    ctx.fillStyle = '#2b2a1c';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 12 + rand() * 34;
      const moss = rand() < 0.55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, moss ? 'rgba(62, 96, 40, 0.5)' : 'rgba(30, 22, 14, 0.5)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 1400; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const a = rand() * Math.PI;
      const l = 3 + rand() * 5;
      const fresh = rand() < 0.25;
      ctx.strokeStyle = fresh
        ? `rgba(110, 120, 52, 0.7)`
        : `rgba(${120 + Math.floor(rand() * 50)}, ${78 + Math.floor(rand() * 30)}, 40, 0.65)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = 20 + rand() * (size - 40);
      const y = 20 + rand() * (size - 40);
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 2.4, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160, 110, 60, 0.6)';
      ctx.fillRect(x - 1, y - 1, 2, 1);
    }
    for (let i = 0; i < 6; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const a = rand() * Math.PI;
      ctx.strokeStyle = 'rgba(70, 46, 26, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.56);
    fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    return {
      foliage: this.configureColorTexture(new THREE.CanvasTexture(foliage)),
      bark: this.configureColorTexture(new THREE.CanvasTexture(bark)),
      floor: this.configureColorTexture(new THREE.CanvasTexture(floor)),
    };
  }

  createSpawnerTextures() {
    const size = 256;
    const c = size / 2;
    const TAU = Math.PI * 2;
    const make = (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      return [canvas, canvas.getContext('2d')];
    };
    const rand = mulberry32(8086);

    const [deck, d] = make(size, size);
    d.fillStyle = '#3a4350';
    d.fillRect(0, 0, size, size);
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU;
      const a1 = ((i + 1) / 12) * TAU;
      const l = 54 + Math.floor(rand() * 16);
      d.fillStyle = `rgb(${l}, ${l + 6}, ${l + 14})`;
      d.beginPath();
      d.moveTo(c, c);
      d.arc(c, c, c, a0, a1);
      d.fill();
      d.strokeStyle = 'rgba(14, 18, 24, 0.8)';
      d.lineWidth = 2;
      d.beginPath();
      d.moveTo(c, c);
      d.lineTo(c + Math.cos(a0) * c, c + Math.sin(a0) * c);
      d.stroke();
    }
    for (let i = 0; i < 900; i++) {
      const a = rand() * TAU;
      const r = rand() * c;
      d.fillStyle = `rgba(${rand() < 0.5 ? '200, 210, 225' : '10, 14, 20'}, 0.12)`;
      d.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 1);
    }
    const hazardIn = c * 0.8;
    const hazardOut = c * 0.94;
    for (let i = 0; i < 36; i++) {
      const a0 = (i / 36) * TAU;
      const a1 = ((i + 1) / 36) * TAU;
      d.fillStyle = i % 2 ? 'rgba(20, 20, 22, 0.95)' : 'rgba(234, 179, 8, 0.92)';
      d.beginPath();
      d.arc(c, c, hazardOut, a0, a1);
      d.arc(c, c, hazardIn, a1 + 0.06, a0 + 0.06, true);
      d.closePath();
      d.fill();
    }
    for (let i = 0; i < 70; i++) {
      const a = rand() * TAU;
      const r = hazardIn + rand() * (hazardOut - hazardIn);
      d.fillStyle = 'rgba(70, 78, 88, 0.8)';
      d.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2 + rand() * 3, 1 + rand() * 2);
    }
    for (const [r, n] of [
      [c * 0.97, 24],
      [c * 0.74, 16],
    ]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.1;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        d.fillStyle = '#1c222a';
        d.beginPath();
        d.arc(x, y, 2.6, 0, TAU);
        d.fill();
        d.fillStyle = 'rgba(190, 200, 215, 0.8)';
        d.fillRect(x - 1, y - 1.2, 1.5, 1.2);
      }
    }
    const scorch = d.createRadialGradient(c, c, c * 0.25, c, c, c * 0.72);
    scorch.addColorStop(0, 'rgba(10, 8, 8, 0.75)');
    scorch.addColorStop(1, 'rgba(10, 8, 8, 0)');
    d.fillStyle = scorch;
    d.fillRect(0, 0, size, size);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const r = c * 0.66;
      d.save();
      d.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
      d.rotate(a + Math.PI);
      d.fillStyle = 'rgba(220, 38, 38, 0.85)';
      d.beginPath();
      d.moveTo(10, 0);
      d.lineTo(-6, -8);
      d.lineTo(-2, 0);
      d.lineTo(-6, 8);
      d.closePath();
      d.fill();
      d.restore();
    }

    const [band, b] = make(256, 32);
    b.fillStyle = '#2a313b';
    b.fillRect(0, 0, 256, 32);
    for (let x = -16; x < 272; x += 16) {
      b.fillStyle = 'rgba(234, 179, 8, 0.85)';
      b.beginPath();
      b.moveTo(x, 26);
      b.lineTo(x + 8, 6);
      b.lineTo(x + 16, 6);
      b.lineTo(x + 8, 26);
      b.fill();
    }
    b.fillStyle = '#4b5563';
    b.fillRect(0, 0, 256, 5);
    b.fillStyle = '#1f2937';
    b.fillRect(0, 27, 256, 5);

    const [coreTop, ct] = make(size, size);
    const [coreGlow, cg] = make(size, size);
    ct.fillStyle = '#2b0a0a';
    ct.fillRect(0, 0, size, size);
    cg.fillStyle = '#000';
    cg.fillRect(0, 0, size, size);
    for (const g of [ct, cg]) {
      const bright = g === cg;
      const red = bright ? '#ff3b3b' : '#7f1d1d';
      g.strokeStyle = red;
      for (const [r, w] of [
        [c * 0.95, 6],
        [c * 0.7, 3],
        [c * 0.42, 4],
      ]) {
        g.lineWidth = w;
        g.beginPath();
        g.arc(c, c, r, 0, TAU);
        g.stroke();
      }
      g.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        const r0 = c * 0.74;
        const r1 = c * (i % 3 === 0 ? 0.9 : 0.82);
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        g.stroke();
      }
      g.lineWidth = 8;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        g.beginPath();
        g.arc(c, c, c * 0.56, a, a + 1.3);
        g.stroke();
      }
      g.fillStyle = bright ? '#ff6b6b' : '#991b1b';
      g.beginPath();
      g.moveTo(c, c - 30);
      g.lineTo(c + 28, c + 20);
      g.lineTo(c, c + 6);
      g.lineTo(c - 28, c + 20);
      g.closePath();
      g.fill();
    }
    const glow = cg.createRadialGradient(c, c, 0, c, c, c * 0.4);
    glow.addColorStop(0, 'rgba(255, 90, 90, 0.6)');
    glow.addColorStop(1, 'rgba(255, 90, 90, 0)');
    cg.fillStyle = glow;
    cg.fillRect(0, 0, size, size);

    const [pylon, p] = make(64, 128);
    p.fillStyle = '#323a46';
    p.fillRect(0, 0, 64, 128);
    p.strokeStyle = 'rgba(12, 16, 22, 0.8)';
    p.lineWidth = 2;
    for (const y of [20, 64, 108]) {
      p.beginPath();
      p.moveTo(0, y);
      p.lineTo(64, y);
      p.stroke();
    }
    p.fillStyle = 'rgba(234, 179, 8, 0.85)';
    p.fillRect(0, 110, 64, 18);
    for (let x = -8; x < 72; x += 16) {
      p.fillStyle = '#15181c';
      p.beginPath();
      p.moveTo(x, 128);
      p.lineTo(x + 8, 110);
      p.lineTo(x + 14, 110);
      p.lineTo(x + 6, 128);
      p.fill();
    }
    const [pylonGlow, pg] = make(64, 128);
    pg.fillStyle = '#000';
    pg.fillRect(0, 0, 64, 128);
    for (const g of [p, pg]) {
      g.fillStyle = g === pg ? '#ff4040' : '#b91c1c';
      g.fillRect(28, 26, 8, 32);
      g.fillRect(28, 70, 8, 32);
    }

    const plain = (canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = this.maxAnisotropy;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    };
    const glowTex = plain(coreGlow);
    glowTex.center.set(0.5, 0.5);
    const coreTex = plain(coreTop);
    coreTex.center.set(0.5, 0.5);
    const bandTex = plain(band);
    bandTex.wrapS = THREE.RepeatWrapping;
    bandTex.repeat.set(3, 1);
    return {
      deck: plain(deck),
      band: bandTex,
      coreTop: coreTex,
      coreGlow: glowTex,
      pylon: plain(pylon),
      pylonGlow: plain(pylonGlow),
    };
  }
}

const TEXTURE_PROPS = [
  'name', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'colorSpace',
  'generateMipmaps', 'rotation', 'matrixAutoUpdate',
];

/** Worker side: converts a generator result into a transferable description. */
export async function serializeGenerated(value, state) {
  if (value === null || typeof value !== 'object') return value;
  if (value.isTexture) {
    if (state.ids.has(value)) return { __textureRef: state.ids.get(value) };
    const id = state.ids.size;
    state.ids.set(value, id);
    let bitmap = state.bitmaps.get(value.image);
    if (!bitmap) {
      bitmap = await createImageBitmap(value.image, {
        imageOrientation: value.flipY ? 'flipY' : 'from-image',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      state.bitmaps.set(value.image, bitmap);
      state.transfer.push(bitmap);
    }
    const props = {};
    for (const key of TEXTURE_PROPS) props[key] = value[key];
    return {
      __texture: id,
      bitmap,
      props,
      repeat: value.repeat.toArray(),
      offset: value.offset.toArray(),
      center: value.center.toArray(),
    };
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => serializeGenerated(v, state)));
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`cannot transfer ${value.constructor?.name || typeof value}`);
  }
  const out = {};
  for (const [key, v] of Object.entries(value)) out[key] = await serializeGenerated(v, state);
  return out;
}

/** Main-thread side: rebuilds THREE textures from serializeGenerated() output. */
function deserializeGenerated(value, textures = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (value.__textureRef !== undefined) return textures.get(value.__textureRef);
  if (value.__texture !== undefined) {
    const tex = new THREE.Texture(value.bitmap);
    Object.assign(tex, value.props);
    tex.flipY = false;
    tex.repeat.fromArray(value.repeat);
    tex.offset.fromArray(value.offset);
    tex.center.fromArray(value.center);
    tex.needsUpdate = true;
    textures.set(value.__texture, tex);
    return tex;
  }
  if (Array.isArray(value)) return value.map((v) => deserializeGenerated(v, textures));
  const out = {};
  for (const [key, v] of Object.entries(value)) out[key] = deserializeGenerated(v, textures);
  return out;
}

/** Runs every generator in texture-worker.js and resolves to ModelFactory's `pregenerated`. */
export function pregenerateTextures({ timeoutMs = 8000 } = {}) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let worker;
    const finish = (result) => {
      clearTimeout(timer);
      worker?.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      worker = new Worker(new URL('./texture-worker.js', import.meta.url), { type: 'module' });
    } catch {
      finish(null);
      return;
    }
    worker.onerror = () => finish(null);
    worker.onmessage = ({ data }) => {
      const textures = new Map();
      const pregenerated = {};
      for (const [name, result] of Object.entries(data.results)) {
        if (result && !result.__error) pregenerated[name] = deserializeGenerated(result, textures);
        else console.warn(`Texture generator ${name} fell back to the main thread:`, result?.__error);
      }
      finish(pregenerated);
    };
    worker.postMessage({});
  });
}
