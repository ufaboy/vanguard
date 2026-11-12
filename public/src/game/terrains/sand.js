/** Static, world-aligned dune shading and wind ripples for ground decoration. */
export function createSandCanvas(size, gridSize, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const phase = (seed >>> 0) % 997 / 997 * Math.PI * 2;
  const unit = size / gridSize;
  // Lower resolutions retain broad dunes without aliasing fine ripple crests.
  const rippleStrength = Math.min(1, unit / 24);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / unit, v = y / unit;
    const wind = u * 0.84 + v * 0.54;
    const cross = v * 0.84 - u * 0.54;
    const drift = wind + 0.24 * Math.sin(cross * 1.3 + phase) + 0.25 * Math.sin(v * 0.6 + u * 0.2);
    const dunePhase = drift * 1.25 + phase;
    const dunes = Math.sin(dunePhase) * 8 + Math.sin(u * 0.37 - v * 0.26 + phase) * 5;
    const lee = Math.pow(Math.max(0, Math.cos(dunePhase + 0.5)), 5) * 13;
    const ripples = Math.sin(drift * 29 + 0.7 * Math.sin(cross * 2.1));
    const rippleCover = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(u * 1.1 - v * 0.7 + phase), 2);
    const rippleShade = (ripples * 3.2 + Math.pow(Math.max(0, ripples), 6) * 2.5) * rippleStrength * rippleCover;
    let hash = Math.imul(x + (seed | 0), 374761393) ^ Math.imul(y + 1, 668265263);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const grain = ((hash >>> 0) / 4294967295 - 0.5) * 9;
    const value = dunes - lee + rippleShade + grain;
    const i = (y * size + x) * 4;
    image.data[i] = 191 + value;
    image.data[i + 1] = 158 + value * 0.88;
    image.data[i + 2] = 108 + value * 0.66;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Alpha mask for a single runtime sand patch (burned forest, destroyed turret): white = sand.
 * The patch covers its cell completely, reaches slightly past it with a ragged, feathered rim,
 * and keeps the cell corners nearly opaque so a block of neighbouring patches has no holes.
 * `variant` picks a different rim so repeated patches do not look stamped.
 * @param {number} size Canvas size in pixels.
 * @param {number} cellFraction Share of the canvas the cell itself occupies (0..1).
 */
export function createSandPatchMask(size, variant = 0, cellFraction = 0.6) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const half = size / 2;
  const cellHalf = cellFraction / 2;
  const phase = variant * 2.399;
  const points = 48;
  for (let layer = 0; layer < 6; layer++) {
    // Outer layers are faint and wide, inner layers opaque: a soft, irregular rim.
    const inset = (5 - layer) * 0.012;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      // Rounded square (superellipse) that reaches the cell corners.
      const square = 1 / Math.pow(c ** 4 + s ** 4, 0.25);
      const jitter = 0.03 * Math.sin(a * 3 + phase) + 0.022 * Math.sin(a * 7 - phase * 1.7)
        + 0.012 * Math.sin(a * 13 + phase * 0.6);
      const r = (cellHalf * 1.27 * square + jitter + 0.04 - inset) * size;
      const x = half + Math.cos(a) * Math.min(r, half - 1);
      const y = half + Math.sin(a) * Math.min(r, half - 1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.18 + layer * 0.164;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** Feather within authored bounds; the caller's clip preserves protected cells. */
export function paintSandZone(ctx, bounds, unit, pattern) {
  const [r0, c0, r1, c1] = bounds;
  ctx.save();
  ctx.fillStyle = pattern;
  for (let layer = 0; layer < 6; layer++) {
    const inset = (0.025 + layer * 0.055) * unit;
    const left = c0 * unit + inset, top = r0 * unit + inset;
    const right = (c1 + 1) * unit - inset, bottom = (r1 + 1) * unit - inset;
    const points = [];
    const edges = [[left, top, right, top], [right, top, right, bottom],
      [right, bottom, left, bottom], [left, bottom, left, top]];
    edges.forEach(([ax, ay, bx, by], side) => {
      const count = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / (unit * 0.65)));
      for (let i = 0; i < count; i++) {
        const t = i / count;
        let x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const jitter = (0.1 + 0.09 * Math.sin(x / unit * 5.2 + y / unit * 3.7)) * unit;
        if (side === 0) y += jitter;
        if (side === 1) x -= jitter;
        if (side === 2) y -= jitter;
        if (side === 3) x += jitter;
        points.push([x, y]);
      }
    });
    ctx.beginPath();
    const last = points.at(-1), first = points[0];
    ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    points.forEach(([x, y], i) => {
      const next = points[(i + 1) % points.length];
      ctx.quadraticCurveTo(x, y, (x + next[0]) / 2, (y + next[1]) / 2);
    });
    ctx.closePath();
    ctx.globalAlpha = 0.18 + layer * 0.164;
    ctx.fill();
  }
  ctx.restore();
}
