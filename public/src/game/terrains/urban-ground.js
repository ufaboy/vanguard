/** Procedural canvas texture generator for urban ground decals. */

import * as THREE from 'three';
import { createSandCanvas, paintSandZone } from './sand.js';
import { TileType } from '../types.js';
import {
  DECORATION_SURFACES,
  DECORATION_THEMES,
  buildDecorationPlan,
  decorationCellAllowed,
} from '../decoration.js';

function drawDetail(ctx, item, unit) {
  const x = (item.col + 0.5) * unit;
  const y = (item.row + 0.5) * unit;
  const r = Math.max(2, item.scale * unit * 0.7);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(item.angle);
  switch (item.kind) {
    case 'cracks':
      ctx.strokeStyle = '#1b222666';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.25);
      ctx.lineTo(0, r * (item.variant - 0.5) * 0.6);
      ctx.lineTo(r, r * 0.2);
      ctx.stroke();
      break;
    case 'patches':
      ctx.fillStyle = item.variant > 0.5 ? '#2b333844' : '#6e777733';
      ctx.fillRect(-r, -r * 0.65, r * 2, r * 1.3);
      break;
    case 'oil':
      ctx.fillStyle = '#10161a55';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.1, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'leaves':
      ctx.fillStyle = item.variant > 0.5 ? '#6e784866' : '#8a744466';
      ctx.fillRect(-r * 0.6, -r * 0.3, 2.5, 2);
      ctx.fillRect(r * 0.2, r * 0.2, 2, 2);
      break;
    case 'rubble':
      ctx.fillStyle = '#8b7a6a66';
      ctx.fillRect(-r * 0.5, -r * 0.4, 3, 2.5);
      ctx.fillRect(r * 0.15, r * 0.1, 2.2, 2);
      break;
    case 'tracks':
      ctx.fillStyle = '#1d242844';
      ctx.fillRect(-r, -r * 0.45, r * 2, 1.5);
      ctx.fillRect(-r, r * 0.3, r * 2, 1.5);
      break;
    case 'weeds':
      ctx.fillStyle = '#4f644277';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.8, r * 0.55), 0, Math.PI * 2);
      ctx.fill();
      break;
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
    ctx.fillStyle = '#c8c3ab88';
    const bars = 5;
    const step = span / bars;
    for (let i = 0; i < bars; i++) {
      ctx.fillRect(-span * 0.5 + i * step + 1.5, -unit * 0.32, step * 0.55, unit * 0.64);
    }
  } else if (landmark.kind === 'parking') {
    ctx.strokeStyle = '#b9b49c77';
    ctx.lineWidth = 1.4;
    const stalls = 3;
    const step = span / stalls;
    ctx.beginPath();
    ctx.moveTo(-span * 0.5, -unit * 0.35);
    ctx.lineTo(span * 0.5, -unit * 0.35);
    for (let i = 0; i <= stalls; i++) {
      const sx = -span * 0.5 + i * step;
      ctx.moveTo(sx, -unit * 0.35);
      ctx.lineTo(sx, unit * 0.35);
    }
    ctx.stroke();
  } else if (landmark.kind === 'manhole') {
    ctx.fillStyle = '#252c30';
    ctx.strokeStyle = '#7b828299';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, span * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (landmark.kind === 'loading') {
    ctx.strokeStyle = '#c7a95888';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-span * 0.45, -span * 0.32, span * 0.9, span * 0.64);
    ctx.setLineDash([]);
  } else if (landmark.kind === 'label' && landmark.text) {
    ctx.font = `bold ${Math.max(5, unit * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || '#c8c3ab';
    ctx.fillText(landmark.text, 0, unit * 0.1);
  }
  ctx.restore();
}

export function paintDecoration(ctx, sector, options = {}, size = 1024) {
  const gridSize = sector.grid.length;
  const unit = size / gridSize;
  const plan = sector.decoration ? buildDecorationPlan(sector, options) : null;
  const theme = DECORATION_THEMES[plan?.config?.theme || sector.theme] || DECORATION_THEMES.urban;

  const hasSand = plan && [...plan.config.zones, ...plan.config.paths].some(item => item.surface === 'sand');
  const sandPattern = hasSand ? ctx.createPattern(createSandCanvas(size, gridSize, plan.config.seed), 'repeat') : null;
  ctx.fillStyle = theme.ground || '#5c5d57';
  ctx.fillRect(0, 0, size, size);
  const clipCells = (details) => {
    ctx.beginPath();
    for (let row = 0; row < gridSize; row++) for (let col = 0; col < gridSize; col++) {
      if (plan ? decorationCellAllowed(sector, row, col, details) : sector.grid[row][col] === TileType.EMPTY) {
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
      const surfaceColor = DECORATION_SURFACES[zone.surface] || '#40474a';
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          if (!decorationCellAllowed(sector, row, col, false)) continue;
          ctx.fillStyle = surfaceColor;
          ctx.fillRect(col * unit, row * unit, unit, unit);
          if (zone.surface === 'pavers' || zone.surface === 'concrete') {
            ctx.strokeStyle = '#1e252828';
            ctx.lineWidth = 1;
            ctx.strokeRect(col * unit + 0.5, row * unit + 0.5, unit - 1, unit - 1);
          }
        }
      }
    }
  }

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
    const roadWidth = road.width * unit;
    if (road.marking === 'edges') {
      trace();
      ctx.strokeStyle = theme.accent || '#929184';
      ctx.lineWidth = roadWidth + 3;
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
    ctx.strokeStyle = road.surface === 'sand' && sandPattern ? sandPattern : DECORATION_SURFACES[road.surface] || '#303a40';
    ctx.lineWidth = roadWidth;
    ctx.setLineDash([]);
    if (road.surface !== 'sand' || !sandPattern) ctx.stroke();
    if (road.marking === 'dashed') {
      trace();
      ctx.strokeStyle = '#929184';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([unit * 0.5, unit * 0.8]);
      ctx.stroke();
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
      ctx.fillStyle = '#c8c3ab';
      ctx.fillText(district.name, (district.col + 0.5) * unit, (district.row + 0.6) * unit);
    }
  }

  ctx.restore();
}

export function createUrbanGroundTexture(sector, options = {}) {
  const canvas = document.createElement('canvas');
  const limit = Math.max(1, options.maxTextureSize || 1024);
  const size = 2 ** Math.floor(Math.log2(Math.min(options.lowQuality ? 512 : 1024, limit)));
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Ground decoration requires a 2D canvas context');
  paintDecoration(ctx, sector, options, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
