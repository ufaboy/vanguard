/** SVG Trophy Badges, Track Icons, and 2D Canvas Hologram Emblem Renderers. */

import { POWERUP, POWERUP_TYPES } from './powerups.js';

const TRACK_COLORS = {
  cannon: '#F59E0B',
  chassis: '#38BDF8',
  frame: '#10B981',
  engine: '#A855F7',
  armor: '#3B82F6',
};

export function renderTrackBadgeSvg(trackKey, size = 28) {
  const color = TRACK_COLORS[trackKey] || '#F59E0B';
  const label =
    trackKey === 'cannon'
      ? 'C'
      : trackKey === 'chassis'
      ? 'CH'
      : trackKey === 'frame'
      ? 'F'
      : trackKey === 'engine'
      ? 'E'
      : 'A';

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0">
      <rect x="2" y="2" width="32" height="32" rx="5" fill="#0F172A" stroke="${color}" stroke-width="2" />
      <text x="18" y="22.5" text-anchor="middle" fill="${color}" font-family="monospace" font-weight="bold" font-size="13">${label}</text>
    </svg>
  `;
}

export function renderPowerUpBadgeSvg(powerupType, size = 38, showCode = false) {
  const spec = POWERUP_TYPES[powerupType] || POWERUP_TYPES[POWERUP.REPAIR];
  const color = spec?.accentHex || '#F59E0B';
  const code = POWERUP_SHORT_LABEL[powerupType] || (spec?.code || 'PWR').slice(0, 4);
  const upgradeLetter = {
    [POWERUP.UPGRADE_CANNON]: 'C',
    [POWERUP.UPGRADE_CHASSIS]: 'CH',
    [POWERUP.UPGRADE_FRAME]: 'F',
    [POWERUP.UPGRADE_ENGINE]: 'E',
    [POWERUP.UPGRADE_ARMOR]: 'A',
  }[powerupType];

  let glyph = `<circle cx="20" cy="20" r="7" stroke="${color}" stroke-width="2.2" />`;
  if (upgradeLetter) {
    glyph = `<path d="M15 14L20 9L25 14" stroke="#FBBF24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="20" y="${showCode ? 24.5 : 26}" text-anchor="middle" fill="${color}" font-family="monospace" font-weight="bold" font-size="${upgradeLetter.length > 1 ? 9.5 : 12}">${upgradeLetter}</text>`;
  } else if (powerupType === POWERUP.REPAIR) {
    glyph = `<path d="M20 12V28M12 20H28" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`;
  } else if (powerupType === POWERUP.EMP) {
    glyph = `<path d="M22 10L13 21H20L18 30L27 19H20L22 10Z" fill="${color}"/>`;
  } else if (powerupType === POWERUP.BASE_RESTORE) {
    glyph = `<path d="M10 29V17L20 10L30 17V29H10ZM20 17V26M15.5 21.5H24.5" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`;
  } else if (powerupType === POWERUP.APS) {
    glyph = `<circle cx="20" cy="20" r="8" stroke="${color}" stroke-width="2" stroke-dasharray="4 2"/><circle cx="20" cy="20" r="3" fill="${color}"/>`;
  } else if (powerupType === POWERUP.MISSILE) {
    glyph = `<path d="M20 10L25 22L20 20L15 22L20 10ZM16 26H24" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0B0F17" stroke="${upgradeLetter ? '#FBBF24' : color}" stroke-width="2.2" />
      ${glyph}
      ${
        showCode
          ? `<text x="20" y="34" text-anchor="middle" fill="#E2E8F0" font-family="monospace" font-weight="bold" font-size="6.5">${code}</text>`
          : ''
      }
    </svg>
  `;
}

/** Power-up families: the badge outline tells the family at a glance. */
export const POWERUP_FAMILY = Object.freeze({
  [POWERUP.UPGRADE_CANNON]: 'upgrade',
  [POWERUP.UPGRADE_CHASSIS]: 'upgrade',
  [POWERUP.UPGRADE_FRAME]: 'upgrade',
  [POWERUP.UPGRADE_ENGINE]: 'upgrade',
  [POWERUP.UPGRADE_ARMOR]: 'upgrade',
  [POWERUP.REPAIR]: 'instant',
  [POWERUP.APS]: 'instant',
  [POWERUP.MISSILE]: 'instant',
  [POWERUP.EMP]: 'timed',
  [POWERUP.BASE_RESTORE]: 'instant',
});

const POWERUP_SHORT_LABEL = Object.freeze({
  [POWERUP.UPGRADE_CANNON]: 'C+',
  [POWERUP.UPGRADE_CHASSIS]: 'CH+',
  [POWERUP.UPGRADE_FRAME]: 'F+',
  [POWERUP.UPGRADE_ENGINE]: 'E+',
  [POWERUP.UPGRADE_ARMOR]: 'A+',
  [POWERUP.REPAIR]: 'REPAIR',
  [POWERUP.EMP]: 'EMP',
  [POWERUP.BASE_RESTORE]: 'HQ+',
  [POWERUP.APS]: 'APS',
  [POWERUP.MISSILE]: 'ATGM',
});

const PICTOGRAMS = {
  [POWERUP.UPGRADE_CANNON](g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(-44, 26);
    g.lineTo(-38, 12);
    g.lineTo(22, 12);
    g.lineTo(28, 26);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(-10, 12, 24, Math.PI, 0);
    g.fill();
    g.fillRect(8, -4, 34, 9);
    g.fillRect(40, -9, 8, 19);
  },
  [POWERUP.UPGRADE_CHASSIS](g, c) {
    g.strokeStyle = c;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(-30, -16);
    g.lineTo(30, -16);
    g.arc(30, 4, 20, -Math.PI / 2, Math.PI / 2);
    g.lineTo(-30, 24);
    g.arc(-30, 4, 20, Math.PI / 2, (3 * Math.PI) / 2);
    g.closePath();
    g.stroke();
    g.fillStyle = c;
    for (const x of [-26, 0, 26]) {
      g.beginPath();
      g.arc(x, 4, 9, 0, Math.PI * 2);
      g.fill();
    }
  },
  [POWERUP.UPGRADE_FRAME](g, c) {
    g.strokeStyle = c;
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-40, 22);
    g.lineTo(-40, -10);
    g.lineTo(-24, -26);
    g.lineTo(24, -26);
    g.lineTo(40, -10);
    g.lineTo(40, 22);
    g.closePath();
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(-40, 22);
    g.lineTo(0, -26);
    g.lineTo(40, 22);
    g.moveTo(-40, -10);
    g.lineTo(40, -10);
    g.moveTo(0, -26);
    g.lineTo(0, 22);
    g.stroke();
  },
  [POWERUP.UPGRADE_ENGINE](g, c) {
    g.fillStyle = c;
    g.beginPath();
    const teeth = 9;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 ? 28 : 38;
      const a0 = a - Math.PI / (teeth * 2) * 0.55;
      const a1 = a + Math.PI / (teeth * 2) * 0.55;
      g.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
      g.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    }
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(0, 0, 12, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  },
  [POWERUP.UPGRADE_ARMOR](g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, -38);
    g.lineTo(34, -26);
    g.lineTo(32, 6);
    g.quadraticCurveTo(26, 28, 0, 40);
    g.quadraticCurveTo(-26, 28, -32, 6);
    g.lineTo(-34, -26);
    g.closePath();
    g.fill();
    g.strokeStyle = '#0B0F17';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, -34);
    g.lineTo(0, 36);
    g.moveTo(-30, -2);
    g.lineTo(30, -2);
    g.stroke();
  },
  [POWERUP.REPAIR](g, c) {
    g.fillStyle = c;
    g.fillRect(-12, -38, 24, 76);
    g.fillRect(-38, -12, 76, 24);
  },
  [POWERUP.EMP](g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(8, -42);
    g.lineTo(-26, 6);
    g.lineTo(-4, 6);
    g.lineTo(-12, 42);
    g.lineTo(26, -8);
    g.lineTo(4, -8);
    g.closePath();
    g.fill();
  },
  [POWERUP.BASE_RESTORE](g, c) {
    g.strokeStyle = c;
    g.lineWidth = 6;
    g.strokeRect(-30, -10, 60, 44);
    g.beginPath();
    g.moveTo(-34, -10); g.lineTo(0, -36); g.lineTo(34, -10);
    g.moveTo(0, -4); g.lineTo(0, 26);
    g.moveTo(-15, 11); g.lineTo(15, 11);
    g.stroke();
  },
  [POWERUP.APS](g, c) {
    g.strokeStyle = c;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 0, 8, 0, Math.PI * 2);
    g.fill();
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.beginPath();
      g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
      g.lineTo(Math.cos(a) * 42, Math.sin(a) * 42);
      g.stroke();
    }
  },
  [POWERUP.MISSILE](g, c) {
    g.save();
    g.rotate(Math.PI / 4);
    g.fillStyle = c;
    g.fillRect(-9, -22, 18, 44);
    g.beginPath();
    g.moveTo(-9, -22);
    g.lineTo(0, -42);
    g.lineTo(9, -22);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-9, 10);
    g.lineTo(-20, 24);
    g.lineTo(-9, 22);
    g.moveTo(9, 10);
    g.lineTo(20, 24);
    g.lineTo(9, 22);
    g.fill();
    g.fillStyle = '#FDE68A';
    g.beginPath();
    g.moveTo(-6, 24);
    g.lineTo(0, 40);
    g.lineTo(6, 24);
    g.closePath();
    g.fill();
    g.restore();
  },
};

/** Floating map badge for a power-up: family-shaped token, pictogram and a short label. */
export function createPowerUpEmblemCanvas(powerupType, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const spec = POWERUP_TYPES[powerupType] || POWERUP_TYPES[POWERUP.REPAIR];
  const color = spec?.accentHex || '#F59E0B';
  const family = POWERUP_FAMILY[powerupType] || 'instant';
  const label = POWERUP_SHORT_LABEL[powerupType] || (spec?.code || 'PWR').slice(0, 5);
  const s = size / 256;
  ctx.scale(s, s);
  const cx = 128;
  const cy = 112;
  const R = 92;

  const tokenPath = () => {
    ctx.beginPath();
    if (family === 'upgrade') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      }
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, R * 0.94, 0, Math.PI * 2);
    }
  };

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  tokenPath();
  ctx.fillStyle = 'rgba(11, 15, 23, 0.94)';
  ctx.fill();
  ctx.restore();

  tokenPath();
  ctx.lineWidth = 12;
  ctx.strokeStyle = family === 'upgrade' ? '#FBBF24' : color;
  ctx.stroke();
  if (family === 'upgrade') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.84, 0.84);
    ctx.translate(-cx, -cy);
    tokenPath();
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  if (family === 'timed') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = R * 0.76;
      const r1 = R * (i % 3 === 0 ? 0.86 : 0.82);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
  }

  const icon = document.createElement('canvas');
  icon.width = icon.height = 256;
  const ig = icon.getContext('2d');
  ig.translate(cx, cy);
  const iconScale = family === 'timed' ? 1.12 : 1.15;
  ig.scale(iconScale, iconScale);
  (PICTOGRAMS[powerupType] || PICTOGRAMS[POWERUP.REPAIR])(ig, color);
  ctx.drawImage(icon, 0, 0);

  if (family === 'upgrade') {
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.moveTo(cx, cy - R - 20);
    ctx.lineTo(cx + 22, cy - R + 2);
    ctx.lineTo(cx + 10, cy - R + 2);
    ctx.lineTo(cx, cy - R - 8);
    ctx.lineTo(cx - 10, cy - R + 2);
    ctx.lineTo(cx - 22, cy - R + 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.font = `bold ${label.length > 4 ? 30 : 38}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.max(70, ctx.measureText(label).width + 28);
  const ly = 222;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, ly - 22, w, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#0B0F17';
  ctx.fillText(label, cx, ly + 2);

  return canvas;
}
