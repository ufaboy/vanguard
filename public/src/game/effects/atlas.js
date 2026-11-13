/** GPU-friendly combat particle effects renderer. */

import * as THREE from 'three';

/** GPU-friendly combat effects renderer. */

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;
const CELL = 128;

export const FxTex = Object.freeze({
  GLOW: 0,
  FIRE: 1,
  SMOKE: 2,
  FLARE: 3,
  CHUNK: 4,
  SPARK: 5,
  MOTE: 6,
  RING: 7,
});

export const RAMP_NONE = 0;
export const RAMP_FIRE = 1;
export const RAMP_SMOKE = 2;
export const RAMP_HOT_SMOKE = 3;
export const RAMP_COOL = 4;

export const FIRE_STOPS = [
  [0.0, 1.0, 0.98, 0.9],
  [0.12, 1.0, 0.86, 0.48],
  [0.35, 1.0, 0.52, 0.16],
  [0.65, 0.78, 0.22, 0.05],
  [1.0, 0.22, 0.05, 0.02],
];

export const rand = (a, b) => a + Math.random() * (b - a);
export const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export function sampleStops(stops, t, out) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * k;
      out[1] = a[2] + (b[2] - a[2]) * k;
      out[2] = a[3] + (b[3] - a[3]) * k;
      return out;
    }
  }
  const last = stops[stops.length - 1];
  out[0] = last[1];
  out[1] = last[2];
  out[2] = last[3];
  return out;
}

function blobCloud(ctx, cx, cy, radius, blobs, alpha, minR, maxR) {
  for (let i = 0; i < blobs; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius;
    const bx = cx + Math.cos(ang) * dist;
    const by = cy + Math.sin(ang) * dist;
    const br = rand(minR, maxR);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
}

function radialMask(ctx, cx, cy, r, inner = 0.45) {
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(inner, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
}

function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * ATLAS_COLS;
  canvas.height = CELL * ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const h = CELL / 2;

  const cell = (idx, draw) => {
    const ox = (idx % ATLAS_COLS) * CELL;
    const oy = Math.floor(idx / ATLAS_COLS) * CELL;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, CELL, CELL);
    ctx.clip();
    draw(ox + h, oy + h);
    ctx.restore();
  };

  cell(FxTex.GLOW, (cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h - 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.38)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - h, cy - h, CELL, CELL);
  });

  cell(FxTex.FIRE, (cx, cy) => {
    blobCloud(ctx, cx, cy, h * 0.42, 22, 0.42, h * 0.18, h * 0.42);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.45);
    core.addColorStop(0, 'rgba(255,255,255,0.9)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(cx - h, cy - h, CELL, CELL);
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 9; i++) {
      const bx = cx + rand(-h * 0.5, h * 0.5);
      const by = cy + rand(-h * 0.5, h * 0.5);
      const br = rand(h * 0.08, h * 0.2);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(90,90,90,0.55)');
      g.addColorStop(1, 'rgba(90,90,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    radialMask(ctx, cx, cy, h - 2, 0.4);
  });

  cell(FxTex.SMOKE, (cx, cy) => {
    blobCloud(ctx, cx, cy, h * 0.42, 34, 0.5, h * 0.2, h * 0.45);
    ctx.globalCompositeOperation = 'source-atop';
    const shade = ctx.createLinearGradient(cx - h, cy - h, cx + h, cy + h);
    shade.addColorStop(0, 'rgba(255,255,255,1)');
    shade.addColorStop(0.5, 'rgba(200,200,200,1)');
    shade.addColorStop(1, 'rgba(120,120,120,1)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - h, cy - h, CELL, CELL);
    for (let i = 0; i < 10; i++) {
      const bx = cx + rand(-h * 0.55, h * 0.55);
      const by = cy + rand(-h * 0.55, h * 0.55);
      const br = rand(h * 0.1, h * 0.24);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(70,70,70,0.45)');
      g.addColorStop(1, 'rgba(70,70,70,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    radialMask(ctx, cx, cy, h - 2, 0.35);
  });

  cell(FxTex.FLARE, (cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - h, cy - h, CELL, CELL);
    const ray = (ang, len, width) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const lg = ctx.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,1)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.lineTo(0, -width);
      ctx.lineTo(len, 0);
      ctx.lineTo(0, width);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    ray(0, h - 3, 4);
    ray(Math.PI / 2, h - 3, 4);
    ray(Math.PI / 4, h * 0.6, 2.5);
    ray(-Math.PI / 4, h * 0.6, 2.5);
  });

  cell(FxTex.CHUNK, (cx, cy) => {
    const pts = 7;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2 + rand(-0.25, 0.25);
      const r = h * rand(0.5, 0.85);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const shade = ctx.createLinearGradient(cx - h, cy - h, cx + h, cy + h);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.55, '#b4b4b4');
    shade.addColorStop(1, '#5a5a5a');
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(40,40,40,1)';
    ctx.stroke();
  });

  cell(FxTex.SPARK, (cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - h, cy - h, CELL, CELL);
  });

  cell(FxTex.MOTE, (cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - h, cy - h, CELL, CELL);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(cx - h * 0.09, cy - h * 0.42, h * 0.18, h * 0.84);
    ctx.fillRect(cx - h * 0.42, cy - h * 0.09, h * 0.84, h * 0.18);
  });

  cell(FxTex.RING, (cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h - 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.84, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - h, cy - h, CELL, CELL);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function buildShockwaveTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c - 1);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.92, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildScorchTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const len = c * rand(0.55, 0.98);
    ctx.strokeStyle = `rgba(0,0,0,${rand(0.15, 0.45)})`;
    ctx.lineWidth = rand(2, 7);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
    ctx.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * c * 0.35;
    const bx = c + Math.cos(a) * d;
    const by = c + Math.sin(a) * d;
    const br = rand(c * 0.18, c * 0.42);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  radialMask(ctx, c, c, c - 1, 0.3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedTextures = null;
export function getSharedTextures() {
  if (!sharedTextures) {
    sharedTextures = {
      atlas: buildAtlas(),
      shockwave: buildShockwaveTexture(),
      scorch: buildScorchTexture(),
    };
  }
  return sharedTextures;
}


let glowSprite = null;
export function glowSpriteTexture() {
  if (glowSprite) return glowSprite;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowSprite = new THREE.CanvasTexture(canvas);
  glowSprite.colorSpace = THREE.SRGBColorSpace;
  return glowSprite;
}
