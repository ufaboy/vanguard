import { landmarkBlockedCells } from '../../../public/src/game/terrains/landmarks.js';

/** Token for cells blocked by a `landmarks3d` monument (an indestructible wall at runtime). */
export const LANDMARK_TOKEN = '#';

// Flattens a map into one character per cell: the object token when the cell holds one,
// otherwise the surface token (`G` ground reads as `.`). Cells blocked by a 3D landmark read as `#`.
export function effectiveLayout(map) {
  if (!Array.isArray(map.surfaceLayout) || !Array.isArray(map.objectLayout)) {
    throw new Error(`${map.mapId || 'map'}: surfaceLayout and objectLayout are required`);
  }
  const blocked = new Set((map.landmarks3d || []).flatMap((entry) => landmarkBlockedCells(entry).map(({ row, col }) => `${row},${col}`)));
  return map.surfaceLayout.map((sRow, r) => {
    const oRow = map.objectLayout[r] || '';
    let out = '';
    for (let c = 0; c < sRow.length; c++) {
      const obj = oRow[c];
      const surf = sRow[c];
      if (blocked.has(`${r},${c}`)) { out += LANDMARK_TOKEN; continue; }
      out += obj && obj !== '.' && obj !== '_' && obj !== ' ' ? obj : surf === 'G' ? '.' : surf;
    }
    return out;
  });
}
