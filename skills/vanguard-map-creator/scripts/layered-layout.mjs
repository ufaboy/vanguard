// Flattens a map into one character per cell: the object token when the cell holds one,
// otherwise the surface token (`G` ground reads as `.`).
export function effectiveLayout(map) {
  if (!Array.isArray(map.surfaceLayout) || !Array.isArray(map.objectLayout)) {
    throw new Error(`${map.mapId || 'map'}: surfaceLayout and objectLayout are required`);
  }
  return map.surfaceLayout.map((sRow, r) => {
    const oRow = map.objectLayout[r] || '';
    let out = '';
    for (let c = 0; c < sRow.length; c++) {
      const obj = oRow[c];
      const surf = sRow[c];
      out += obj && obj !== '.' && obj !== '_' && obj !== ' ' ? obj : surf === 'G' ? '.' : surf;
    }
    return out;
  });
}
