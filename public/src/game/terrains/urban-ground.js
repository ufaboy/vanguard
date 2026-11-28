/** Procedural canvas texture generator for urban and tactical ground decals. */

import * as THREE from 'three';
import { createSandCanvas, paintSandZone } from './sand.js';
import { TileType } from '../types.js';
import {
  DECORATION_SURFACES,
  DECORATION_THEMES,
  buildDecorationPlan,
  decorationCellAllowed,
} from '../render/decoration.js';

function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSurfacePattern(ctx, surface, baseColor, unit, seed) {
  if (typeof document === 'undefined' || typeof ctx.createPattern !== 'function') return null;
  const tileSize = surface === 'pavers' || surface === 'concrete'
    ? Math.max(32, Math.min(128, Math.round(unit)))
    : Math.max(64, Math.min(128, Math.round(unit * 2)));
  const tile = document.createElement('canvas');
  tile.width = tile.height = tileSize;
  const tctx = tile.getContext?.('2d');
  if (!tctx || typeof tctx.fillRect !== 'function') return null;

  const rng = makeRng((seed ^ surface.charCodeAt(0) * 2654435761) >>> 0);
  tctx.fillStyle = baseColor;
  tctx.fillRect(0, 0, tileSize, tileSize);

  if (surface === 'asphalt') {
    for (let i = 0; i < 18; i++) {
      tctx.fillStyle = rng() > 0.5 ? 'rgba(18, 22, 26, 0.14)' : 'rgba(90, 98, 104, 0.08)';
      tctx.beginPath();
      tctx.ellipse(rng() * tileSize, rng() * tileSize, 4 + rng() * 14, 3 + rng() * 10, rng() * Math.PI, 0, Math.PI * 2);
      tctx.fill();
    }
    const specks = Math.min(900, tileSize * 5);
    for (let i = 0; i < specks; i++) {
      tctx.fillStyle = rng() > 0.45 ? 'rgba(155, 164, 170, 0.14)' : 'rgba(14, 18, 22, 0.22)';
      tctx.fillRect(rng() * tileSize, rng() * tileSize, 1.2, 1.2);
    }
  } else if (surface === 'concrete') {
    for (let i = 0; i < 14; i++) {
      tctx.fillStyle = rng() > 0.5 ? 'rgba(20, 24, 24, 0.07)' : 'rgba(220, 226, 220, 0.06)';
      tctx.beginPath();
      tctx.arc(rng() * tileSize, rng() * tileSize, 4 + rng() * 12, 0, Math.PI * 2);
      tctx.fill();
    }
    const specks = Math.min(600, tileSize * 3);
    for (let i = 0; i < specks; i++) {
      tctx.fillStyle = rng() > 0.5 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(20, 25, 25, 0.09)';
      tctx.fillRect(rng() * tileSize, rng() * tileSize, 1.1, 1.1);
    }
    tctx.strokeStyle = 'rgba(24, 28, 30, 0.28)';
    tctx.lineWidth = 1;
    tctx.strokeRect(0.5, 0.5, tileSize - 1, tileSize - 1);
    tctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    tctx.beginPath();
    tctx.moveTo(1.5, tileSize - 1.5);
    tctx.lineTo(1.5, 1.5);
    tctx.lineTo(tileSize - 1.5, 1.5);
    tctx.stroke();
  } else if (surface === 'pavers') {
    const rows = 4;
    const cols = 2;
    const rowH = tileSize / rows;
    const colW = tileSize / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * colW + offset;
        const y = r * rowH;
        const shade = (rng() - 0.5) * 26;
        tctx.fillStyle = shade > 0
          ? `rgba(255, 250, 238, ${(shade / 255).toFixed(3)})`
          : `rgba(18, 22, 24, ${(-shade / 255).toFixed(3)})`;
        tctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
        tctx.strokeStyle = 'rgba(20, 24, 26, 0.34)';
        tctx.lineWidth = 1;
        tctx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);
      }
    }
  } else if (surface === 'dirt') {
    for (let i = 0; i < 24; i++) {
      tctx.fillStyle = rng() > 0.45 ? 'rgba(48, 36, 22, 0.16)' : 'rgba(138, 118, 86, 0.12)';
      tctx.beginPath();
      tctx.ellipse(rng() * tileSize, rng() * tileSize, 3 + rng() * 10, 2 + rng() * 7, rng() * Math.PI, 0, Math.PI * 2);
      tctx.fill();
    }
    for (let i = 0; i < 180; i++) {
      tctx.fillStyle = rng() > 0.5 ? 'rgba(165, 148, 120, 0.22)' : 'rgba(38, 28, 18, 0.24)';
      tctx.fillRect(rng() * tileSize, rng() * tileSize, 1.5, 1.5);
    }
  } else if (surface === 'gravel') {
    const stones = Math.min(700, tileSize * 4);
    for (let i = 0; i < stones; i++) {
      const sx = rng() * tileSize;
      const sy = rng() * tileSize;
      const sw = 1.4 + rng() * 2.2;
      tctx.fillStyle = 'rgba(18, 20, 20, 0.28)';
      tctx.fillRect(sx + 0.7, sy + 0.7, sw, sw * 0.85);
      const tone = rng();
      tctx.fillStyle = tone > 0.66
        ? 'rgba(168, 168, 156, 0.34)'
        : tone > 0.33
          ? 'rgba(128, 124, 112, 0.3)'
          : 'rgba(66, 68, 64, 0.32)';
      tctx.fillRect(sx, sy, sw, sw * 0.85);
    }
  } else if (surface === 'snow') {
    for (let i = 0; i < 12; i++) {
      tctx.fillStyle = rng() > 0.5 ? 'rgba(130, 152, 168, 0.14)' : 'rgba(245, 252, 255, 0.18)';
      tctx.beginPath();
      tctx.ellipse(rng() * tileSize, rng() * tileSize, 10 + rng() * 24, 3 + rng() * 7, 0.45, 0, Math.PI * 2);
      tctx.fill();
    }
    for (let i = 0; i < 160; i++) {
      tctx.fillStyle = rng() > 0.35 ? 'rgba(255, 255, 255, 0.26)' : 'rgba(120, 142, 158, 0.14)';
      tctx.fillRect(rng() * tileSize, rng() * tileSize, 1.2, 1.2);
    }
  } else {
    // Base ground texture: subtle organic mottling + mineral grain
    for (let i = 0; i < 18; i++) {
      tctx.fillStyle = rng() > 0.5 ? 'rgba(20, 24, 22, 0.09)' : 'rgba(210, 214, 198, 0.06)';
      tctx.beginPath();
      tctx.ellipse(rng() * tileSize, rng() * tileSize, 6 + rng() * 18, 4 + rng() * 14, rng() * Math.PI, 0, Math.PI * 2);
      tctx.fill();
    }
    for (let i = 0; i < 320; i++) {
      tctx.fillStyle = rng() > 0.5 ? 'rgba(255, 255, 255, 0.06)' : 'rgba(12, 16, 16, 0.10)';
      tctx.fillRect(rng() * tileSize, rng() * tileSize, 1.2, 1.2);
    }
  }

  return ctx.createPattern(tile, 'repeat');
}

function drawDetail(ctx, item, unit) {
  const x = (item.col + 0.5) * unit;
  const y = (item.row + 0.5) * unit;
  const r = Math.max(2.5, item.scale * unit * 0.72);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(item.angle);
  switch (item.kind) {
    case 'cracks': {
      const bend = (item.variant - 0.5) * 0.65;
      // Subtle light edge for depth
      ctx.strokeStyle = 'rgba(220, 226, 220, 0.12)';
      ctx.lineWidth = Math.max(1, unit * 0.035);
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.22 + 0.8);
      ctx.lineTo(-r * 0.2, r * bend + 0.8);
      ctx.lineTo(r * 0.45, -r * bend * 0.5 + 0.8);
      ctx.lineTo(r, r * 0.2 + 0.8);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(18, 24, 28, 0.52)';
      ctx.lineWidth = Math.max(1.1, unit * 0.04);
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.22);
      ctx.lineTo(-r * 0.2, r * bend);
      ctx.lineTo(r * 0.45, -r * bend * 0.5);
      ctx.lineTo(r, r * 0.2);
      // Branching hairline fracture
      ctx.moveTo(-r * 0.2, r * bend);
      ctx.lineTo(r * 0.15, r * (bend + 0.45));
      ctx.stroke();
      break;
    }
    case 'patches': {
      ctx.fillStyle = 'rgba(14, 18, 22, 0.35)';
      ctx.beginPath();
      ctx.roundRect?.(-r - 1, -r * 0.65 - 1, r * 2 + 2, r * 1.3 + 2, 2);
      if (!ctx.roundRect) ctx.rect(-r - 1, -r * 0.65 - 1, r * 2 + 2, r * 1.3 + 2);
      ctx.fill();
      ctx.fillStyle = item.variant > 0.5 ? 'rgba(38, 45, 50, 0.55)' : 'rgba(98, 106, 106, 0.38)';
      ctx.fillRect(-r, -r * 0.65, r * 2, r * 1.3);
      break;
    }
    case 'oil': {
      ctx.fillStyle = 'rgba(10, 14, 18, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(8, 12, 16, 0.52)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.08, 0, r * 0.92, r * 0.56, 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Subtle iridescent sheen
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.16)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(-r * 0.15, -r * 0.06, r * 0.42, 0.3, 2.2);
      ctx.stroke();
      break;
    }
    case 'leaves': {
      const count = 5;
      for (let i = 0; i < count; i++) {
        const lx = Math.cos(i * 2.1 + item.variant * 6) * r * 0.55;
        const ly = Math.sin(i * 1.7 + item.variant * 4) * r * 0.45;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(i * 1.1 + item.variant * 3);
        ctx.fillStyle = 'rgba(12, 16, 12, 0.22)';
        ctx.fillRect(-1.4, -0.7, 3.2, 2.0);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(112, 122, 72, 0.62)' : 'rgba(142, 114, 62, 0.58)';
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(1.5, r * 0.22), Math.max(0.9, r * 0.11), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'rubble': {
      const chunks = [
        [-r * 0.45, -r * 0.28, r * 0.42, r * 0.32],
        [r * 0.12, -r * 0.1, r * 0.34, r * 0.26],
        [-r * 0.1, r * 0.22, r * 0.28, r * 0.22],
      ];
      for (const [cx, cy, cw, ch] of chunks) {
        ctx.fillStyle = 'rgba(16, 18, 20, 0.38)';
        ctx.fillRect(cx + 0.9, cy + 0.9, cw, ch);
        ctx.fillStyle = item.variant > 0.5 ? 'rgba(148, 132, 116, 0.62)' : 'rgba(124, 128, 124, 0.58)';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.fillStyle = 'rgba(225, 218, 206, 0.24)';
        ctx.fillRect(cx, cy, cw, Math.max(1, ch * 0.32));
      }
      break;
    }
    case 'tracks': {
      const trackOffset = r * 0.38;
      const trackWidth = Math.max(1.8, r * 0.22);
      ctx.fillStyle = 'rgba(20, 26, 30, 0.26)';
      ctx.fillRect(-r, -trackOffset - trackWidth * 0.5, r * 2, trackWidth);
      ctx.fillRect(-r, trackOffset - trackWidth * 0.5, r * 2, trackWidth);
      // Individual tread cleats
      ctx.fillStyle = 'rgba(12, 16, 18, 0.34)';
      const step = Math.max(2.2, r * 0.28);
      for (let tx = -r + 1; tx < r - 1; tx += step) {
        ctx.fillRect(tx, -trackOffset - trackWidth * 0.5, 1.1, trackWidth);
        ctx.fillRect(tx, trackOffset - trackWidth * 0.5, 1.1, trackWidth);
      }
      break;
    }
    case 'weeds': {
      ctx.fillStyle = 'rgba(34, 48, 28, 0.42)';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.8, r * 0.42), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = item.variant > 0.5 ? 'rgba(92, 118, 72, 0.68)' : 'rgba(78, 102, 62, 0.65)';
      ctx.lineWidth = Math.max(1, r * 0.14);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + item.variant * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function drawLandmark(ctx, landmark, unit, accent) {
  const x = (landmark.col + 0.5) * unit;
  const y = (landmark.row + 0.5) * unit;
  const span = (landmark.size || 1) * unit;
  ctx.save();
  ctx.translate(x, y);
  if (landmark.rotation) ctx.rotate((landmark.rotation * Math.PI) / 180);
  if (landmark.kind === 'crosswalk') {
    const bars = 5;
    const step = span / bars;
    for (let i = 0; i < bars; i++) {
      const bx = -span * 0.5 + i * step + 1.5;
      const bw = step * 0.55;
      const bh = unit * 0.64;
      ctx.fillStyle = 'rgba(208, 203, 178, 0.58)';
      ctx.fillRect(bx, -bh * 0.5, bw, bh);
      // Subtle tire-wear scuffs across stripes
      ctx.fillStyle = 'rgba(42, 48, 52, 0.18)';
      ctx.fillRect(bx, -bh * 0.18, bw, bh * 0.14);
      ctx.fillRect(bx, bh * 0.14, bw, bh * 0.12);
    }
  } else if (landmark.kind === 'parking') {
    const stalls = 3;
    const step = span / stalls;
    ctx.strokeStyle = 'rgba(195, 190, 166, 0.56)';
    ctx.lineWidth = Math.max(1.4, unit * 0.05);
    ctx.beginPath();
    ctx.moveTo(-span * 0.5, -unit * 0.35);
    ctx.lineTo(span * 0.5, -unit * 0.35);
    for (let i = 0; i <= stalls; i++) {
      const sx = -span * 0.5 + i * step;
      ctx.moveTo(sx, -unit * 0.35);
      ctx.lineTo(sx, unit * 0.35);
    }
    ctx.stroke();
    // Wheel-stop bars & faint bay wear
    for (let i = 0; i < stalls; i++) {
      const cx = -span * 0.5 + (i + 0.5) * step;
      ctx.fillStyle = 'rgba(24, 28, 32, 0.16)';
      ctx.fillRect(cx - step * 0.28, -unit * 0.15, step * 0.56, unit * 0.36);
      ctx.fillStyle = 'rgba(180, 178, 162, 0.45)';
      ctx.fillRect(cx - step * 0.26, -unit * 0.28, step * 0.52, Math.max(1.5, unit * 0.06));
    }
  } else if (landmark.kind === 'manhole') {
    const rad = span * 0.18;
    ctx.fillStyle = 'rgba(14, 18, 20, 0.65)';
    ctx.beginPath();
    ctx.arc(0, 0, rad * 1.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#31393e';
    ctx.strokeStyle = '#8b9494';
    ctx.lineWidth = Math.max(1.2, unit * 0.04);
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20, 24, 28, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.62, 0, Math.PI * 2);
    ctx.moveTo(-rad * 0.8, 0);
    ctx.lineTo(rad * 0.8, 0);
    ctx.moveTo(0, -rad * 0.8);
    ctx.lineTo(0, rad * 0.8);
    ctx.stroke();
  } else if (landmark.kind === 'loading') {
    ctx.strokeStyle = 'rgba(205, 172, 82, 0.62)';
    ctx.lineWidth = Math.max(1.6, unit * 0.055);
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-span * 0.45, -span * 0.32, span * 0.9, span * 0.64);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(205, 172, 82, 0.1)';
    ctx.fillRect(-span * 0.43, -span * 0.3, span * 0.86, span * 0.6);
  } else if (landmark.kind === 'label' && landmark.text) {
    ctx.font = `bold ${Math.max(5, unit * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(12, 16, 18, 0.55)';
    ctx.fillText(landmark.text, 1, unit * 0.1 + 1);
    ctx.fillStyle = accent || '#c8c3ab';
    ctx.fillText(landmark.text, 0, unit * 0.1);
  } else if (landmark.kind === 'helipad') {
    const r = span * 0.44;
    ctx.fillStyle = 'rgba(20, 26, 30, 0.24)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.68)';
    ctx.lineWidth = Math.max(2.0, unit * 0.07);
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.38)';
    ctx.lineWidth = Math.max(1.2, unit * 0.04);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `bold ${Math.max(8, r * 1.05)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(15, 20, 24, 0.6)';
    ctx.strokeText('H', 0, 1);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.78)';
    ctx.fillText('H', 0, 1);
  } else if (landmark.kind === 'hazard_zone') {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = Math.max(2.0, unit * 0.065);
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-span * 0.46, -span * 0.46, span * 0.92, span * 0.92);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
    ctx.fillRect(-span * 0.44, -span * 0.44, span * 0.88, span * 0.88);
  } else if (landmark.kind === 'chevron') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const dy of [0, -span * 0.14]) {
      ctx.strokeStyle = 'rgba(15, 20, 24, 0.35)';
      ctx.lineWidth = Math.max(2.6, unit * 0.08);
      ctx.beginPath();
      ctx.moveTo(-span * 0.24, span * 0.18 + dy + 1);
      ctx.lineTo(0, -span * 0.18 + dy + 1);
      ctx.lineTo(span * 0.24, span * 0.18 + dy + 1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
      ctx.lineWidth = Math.max(2.0, unit * 0.065);
      ctx.beginPath();
      ctx.moveTo(-span * 0.24, span * 0.18 + dy);
      ctx.lineTo(0, -span * 0.18 + dy);
      ctx.lineTo(span * 0.24, span * 0.18 + dy);
      ctx.stroke();
    }
  } else if (landmark.kind === 'drain_grate') {
    ctx.fillStyle = '#131a22';
    ctx.fillRect(-span * 0.24, -span * 0.16, span * 0.48, span * 0.32);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = Math.max(1.2, unit * 0.04);
    ctx.strokeRect(-span * 0.24, -span * 0.16, span * 0.48, span * 0.32);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = Math.max(1.0, unit * 0.032);
    for (let sx = -0.16; sx <= 0.17; sx += 0.08) {
      ctx.beginPath();
      ctx.moveTo(span * sx, -span * 0.12);
      ctx.lineTo(span * sx, span * 0.12);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function pathOverlapsRoad(road, sector) {
  const pts = road?.points;
  if (!Array.isArray(pts) || pts.length < 2) return false;
  const rows = sector.grid?.length || 0;
  const cols = sector.grid?.[0]?.length || 0;
  let total = 0;
  let onRoad = 0;
  for (let i = 1; i < pts.length; i++) {
    const [r0, c0] = pts[i - 1];
    const [r1, c1] = pts[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(r1 - r0, c1 - c0)));
    for (let s = 0; s <= steps; s++) {
      const r = Math.round(r0 + ((r1 - r0) * s) / steps);
      const c = Math.round(c0 + ((c1 - c0) * s) / steps);
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      total++;
      const surf = sector.surfaceGrid?.[r]?.[c] ?? sector.grid[r][c];
      if (surf === TileType.ROAD) onRoad++;
    }
  }
  return total > 0 && onRoad >= total * 0.5;
}

export function paintDecoration(ctx, sector, options = {}, size = 1024) {
  const gridSize = sector.grid.length;
  const unit = size / gridSize;
  const plan = sector.decoration ? buildDecorationPlan(sector, options) : null;
  const theme = DECORATION_THEMES[plan?.config?.theme || sector.theme] || DECORATION_THEMES.urban;
  const seed = plan?.config?.seed ?? 1;

  const patternCache = new Map();
  const getSurfaceFill = (surface, fallbackColor) => {
    if (patternCache.has(surface)) return patternCache.get(surface);
    const pattern = createSurfacePattern(ctx, surface, fallbackColor, unit, seed) || fallbackColor;
    patternCache.set(surface, pattern);
    return pattern;
  };

  const hasSand = plan && [...plan.config.zones, ...plan.config.paths].some(item => item.surface === 'sand');
  const sandPattern = hasSand ? ctx.createPattern(createSandCanvas(size, gridSize, seed), 'repeat') : null;
  ctx.fillStyle = getSurfaceFill('ground', theme.ground || '#5c5d57');
  ctx.fillRect(0, 0, size, size);

  const clipCells = (details) => {
    ctx.beginPath();
    for (let row = 0; row < gridSize; row++) for (let col = 0; col < gridSize; col++) {
      if (plan ? decorationCellAllowed(sector, row, col, details) : (sector.surfaceGrid?.[row]?.[col] ?? sector.grid[row][col]) === TileType.EMPTY) {
        ctx.rect(col * unit, row * unit, unit, unit);
      }
    }
    ctx.clip();
  };
  ctx.save();
  clipCells(false);

  if (plan?.config?.zones?.length) {
    for (const zone of plan.config.zones) {
      if (zone.surface === 'sand' && sandPattern) {
        paintSandZone(ctx, zone.bounds, unit, sandPattern);
        continue;
      }
      const [r0, c0, r1, c1] = zone.bounds;
      const surfaceFill = getSurfaceFill(zone.surface, DECORATION_SURFACES[zone.surface] || '#40474a');
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          if (!decorationCellAllowed(sector, row, col, false)) continue;
          ctx.fillStyle = surfaceFill;
          ctx.fillRect(col * unit, row * unit, unit, unit);
        }
      }
    }
  }

  ctx.restore();
  ctx.save();
  clipCells(true);

  const paths = plan
    ? plan.config.paths
    : (sector.urbanRoads || []).map((road) => ({
        ...road,
        surface: 'asphalt',
        marking: 'dashed',
      }));

  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  for (const road of paths) {
    const trace = () => {
      ctx.beginPath();
      road.points.forEach(([row, col], index) => {
        if (index === 0) ctx.moveTo((col + 0.5) * unit, (row + 0.5) * unit);
        else ctx.lineTo((col + 0.5) * unit, (row + 0.5) * unit);
      });
    };
    const overlapsRoad = road.marking !== 'railway' && pathOverlapsRoad(road, sector);
    const effectiveWidth = overlapsRoad ? Math.min(road.width, 1.0) : road.width;
    const roadWidth = effectiveWidth * unit;
    if (!overlapsRoad && road.marking === 'edges') {
      trace();
      ctx.strokeStyle = theme.accent || '#929184';
      ctx.lineWidth = roadWidth + Math.max(3, unit * 0.12);
      ctx.setLineDash([]);
      ctx.stroke();
    } else if (!overlapsRoad && road.surface !== 'sand') {
      // Soft shoulder shadow for grounded road edges
      trace();
      ctx.strokeStyle = 'rgba(14, 18, 20, 0.22)';
      ctx.lineWidth = roadWidth + Math.max(2, unit * 0.1);
      ctx.setLineDash([]);
      ctx.stroke();
    }
    trace();
    if (road.surface === 'sand' && sandPattern) {
      ctx.save();
      ctx.strokeStyle = sandPattern;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      for (let edge = 0; edge < 4; edge++) {
        ctx.globalAlpha = 0.16 + edge * 0.28;
        ctx.lineWidth = Math.max(1, roadWidth - edge * unit * 0.09);
        trace();
        ctx.stroke();
      }
      ctx.restore();
    }
    const pathFill = road.surface === 'sand' && sandPattern
      ? sandPattern
      : getSurfaceFill(road.surface, DECORATION_SURFACES[road.surface] || '#303a40');
    ctx.strokeStyle = pathFill;
    ctx.lineWidth = roadWidth;
    ctx.setLineDash([]);
    if (road.surface !== 'sand' || !sandPattern) ctx.stroke();
    if (road.marking === 'dashed') {
      trace();
      ctx.strokeStyle = 'rgba(182, 178, 158, 0.72)';
      ctx.lineWidth = Math.max(1.5, unit * 0.055);
      ctx.setLineDash([unit * 0.48, unit * 0.76]);
      ctx.stroke();
    } else if (road.marking === 'railway') {
      // Gravel ballast bed
      trace();
      ctx.strokeStyle = 'rgba(62, 58, 52, 0.55)';
      ctx.lineWidth = Math.max(5, unit * 0.72);
      ctx.setLineDash([]);
      ctx.stroke();
      // Wooden sleepers
      trace();
      ctx.strokeStyle = '#5c4033';
      ctx.lineWidth = Math.max(3, unit * 0.55);
      ctx.setLineDash([unit * 0.16, unit * 0.26]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const offset of [-unit * 0.18, unit * 0.18]) {
        ctx.beginPath();
        for (let i = 1; i < road.points.length; i++) {
          const [r0, c0] = road.points[i - 1];
          const [r1, c1] = road.points[i];
          const dx = c1 - c0;
          const dy = r1 - r0;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * offset;
          const ny = (dx / len) * offset;
          if (i === 1) ctx.moveTo((c0 + 0.5) * unit + nx, (r0 + 0.5) * unit + ny);
          ctx.lineTo((c1 + 0.5) * unit + nx, (r1 + 0.5) * unit + ny);
        }
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = Math.max(1.4, unit * 0.05);
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);

  ctx.restore();
  ctx.save();
  clipCells(true);
  if (plan?.details?.length) {
    for (const item of plan.details) {
      drawDetail(ctx, item, unit);
    }
  }

  if (plan?.config?.landmarks?.length) {
    for (const landmark of plan.config.landmarks) {
      drawLandmark(ctx, landmark, unit, theme.accent);
    }
  } else if (!plan) {
    ctx.font = `bold ${Math.max(5, unit * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    for (const district of sector.districts || []) {
      ctx.fillStyle = 'rgba(12, 16, 18, 0.5)';
      ctx.fillText(district.name, (district.col + 0.5) * unit + 1, (district.row + 0.6) * unit + 1);
      ctx.fillStyle = '#c8c3ab';
      ctx.fillText(district.name, (district.col + 0.5) * unit, (district.row + 0.6) * unit);
    }
  }

  ctx.restore();
}

export function createUrbanGroundTexture(sector, options = {}) {
  const canvas = document.createElement('canvas');
  const maxCap = options.maxTextureSize ? Math.min(2048, options.maxTextureSize) : 1024;
  const target = options.lowQuality ? 512 : maxCap;
  const size = 2 ** Math.floor(Math.log2(Math.max(1, Math.min(target, options.maxTextureSize || target))));
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Ground decoration requires a 2D canvas context');
  paintDecoration(ctx, sector, options, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
