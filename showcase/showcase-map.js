/**
 * Custom 40x40 Showcase Map designed for deterministic promo highlights:
 * - Zone 1 (SW): Forest Ambush Corridor
 * - Zone 2 (Center): Urban Corner-Peek & Brick Destruction Plaza
 * - Zone 3 (East): River, Bridge & Ford Crossing
 * - Zone 4 (North): Citadel Arena for ATGM FPV, Air Strike & BOSS_MAMMOTH
 */

function createBlankGrid(fill = '.') {
  return Array.from({ length: 40 }, () => Array(40).fill(fill));
}

function paintRect(grid, r0, c0, r1, c1, ch) {
  for (let r = Math.max(0, r0); r <= Math.min(39, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(39, c1); c++) {
      grid[r][c] = ch;
    }
  }
}

function setCell(grid, r, c, ch) {
  if (r >= 0 && r < 40 && c >= 0 && c < 40) {
    grid[r][c] = ch;
  }
}

export function buildShowcaseMapDefinition() {
  const surf = createBlankGrid('.');
  const obj = createBlankGrid('.');

  // Grassy & stone outskirts for rich color contrast
  paintRect(surf, 0, 0, 39, 39, 'V');
  paintRect(surf, 16, 14, 27, 26, '.'); // Central urban asphalt
  paintRect(surf, 5, 10, 14, 29, '^');  // Northern stone citadel courtyard

  // Main roads connecting all 4 showcase zones
  paintRect(surf, 27, 5, 28, 25, 'R');  // South-west ambush road -> center
  paintRect(surf, 15, 19, 27, 20, 'R'); // Central north-south avenue
  paintRect(surf, 21, 20, 22, 35, 'R'); // East-west bridge road
  paintRect(surf, 9, 11, 10, 28, 'R');  // Citadel boulevard

  // Zone 1 (SW): Forest Ambush Corridor (rows 24..33, cols 4..15)
  paintRect(obj, 29, 6, 32, 10, 'F');   // Dense ambush forest canopy
  paintRect(obj, 24, 5, 25, 9, 'F');    // Northern forest flank
  paintRect(obj, 24, 11, 25, 13, 'B');  // Brick roadside wall
  setCell(obj, 25, 10, 'D');            // Fuel barrel near ambush road
  setCell(obj, 29, 11, 'Q');            // Supply crates

  // Zone 2 (Center): Urban Corner-Peek & Brick Destruction Plaza (rows 17..26, cols 15..25)
  // Concrete corner cover for player peek
  setCell(obj, 22, 18, 'C');
  setCell(obj, 22, 17, 'C');
  setCell(obj, 23, 17, 'C');
  // Destructible brick walls & buildings in front of plaza
  paintRect(obj, 20, 19, 20, 22, 'B');
  paintRect(obj, 18, 22, 19, 24, 'B');
  setCell(obj, 19, 21, 'D');            // Explosive barrel by brick wall
  setCell(obj, 17, 16, 'A');            // Urban house 1
  setCell(obj, 17, 25, 'P');            // Urban house 2
  setCell(obj, 24, 23, 'A');
  setCell(obj, 24, 24, 'B');
  setCell(obj, 23, 24, 'D');

  // Zone 3 (East): River, Bridge & Ford Crossing (rows 15..27, cols 27..36)
  paintRect(surf, 15, 29, 27, 32, 'S'); // Sandy riverbanks
  paintRect(surf, 15, 30, 27, 31, 'W'); // River channel
  paintRect(surf, 21, 30, 21, 31, 'R'); // Bridge deck surface
  setCell(obj, 21, 30, '=');
  setCell(obj, 21, 31, '=');
  // Coastal cover & barrels on east bank
  setCell(obj, 19, 34, 'B');
  setCell(obj, 20, 34, 'B');
  setCell(obj, 23, 34, 'D');
  setCell(obj, 24, 34, 'C');
  paintRect(obj, 16, 33, 17, 35, 'F');

  // Zone 4 (North): Citadel Arena (rows 4..14, cols 8..31)
  // Outer concrete bastions framing the arena
  paintRect(obj, 3, 8, 3, 31, 'C');
  paintRect(obj, 4, 8, 13, 8, 'C');
  paintRect(obj, 4, 31, 13, 31, 'C');
  // Tactical brick parapets & pillars inside citadel
  paintRect(obj, 7, 13, 8, 13, 'B');
  paintRect(obj, 11, 15, 11, 16, 'C');
  paintRect(obj, 7, 25, 8, 25, 'B');
  setCell(obj, 8, 26, 'D');
  setCell(obj, 12, 24, 'B');
  setCell(obj, 12, 25, 'D');
  paintRect(obj, 5, 22, 6, 26, 'F');    // Forest pocket for Recon Drone reveal
  setCell(obj, 6, 17, 'X');             // Hedgehogs
  setCell(obj, 6, 21, 'X');

  // Allied HQ at bottom center
  setCell(obj, 39, 19, 'H');
  setCell(obj, 39, 20, 'H');
  paintRect(obj, 37, 18, 37, 21, 'C');

  return {
    id: 999,
    mapId: 'showcase-demo',
    code: 'SHOWCASE // 40×40',
    name: 'Vanguard Tactical Showcase',
    subtitle: 'SHOWCASE // FULL ARSENAL DEMONSTRATION',
    objective: 'Demonstrate all tactical systems',
    gameMode: 'extermination',
    rules: {
      spawnSectorBossOnClear: false,
      disableVictory: true,
    },
    gridSize: 40,
    tileSize: 2,
    baseCell: { row: 39, col: 19 },
    playerSpawnCell: { row: 30, col: 8 },
    environment: {
      theme: 'urban',
      tint: '#e8d9b8',
      fogColor: '#162032',
      groundColor: '#566052',
    },
    decoration: {
      version: 1,
      seed: 4040,
      theme: 'urban',
      zones: [
        { id: 'ambush-woods', bounds: [24, 4, 34, 14], surface: 'dirt', density: 0.35, details: ['leaves', 'weeds'] },
        { id: 'citadel-stone', bounds: [4, 9, 14, 30], surface: 'stone', density: 0.2, details: ['rubble'] },
      ],
    },
    defaultSurface: 'asphalt',
    completionReward: { credits: 0 },
    enemies: {
      totalCount: 0,
      maxConcurrent: 0,
      spawnDelaySec: 999,
      pool: ['SCOUT', 'STANDARD', 'ARMOR', 'FLAMETHROWER', 'HOWITZER', 'STRIKER', 'SAPPER', 'BOSS_MAMMOTH'],
      entrances: [{ row: 4, col: 19 }],
      encounters: [],
    },
    boss: {
      enemyClass: 'BOSS_MAMMOTH',
      name: 'MAMMOTH MK-V',
      title: 'Super-Heavy Command Dreadnought',
      spawnCell: { row: 7, col: 22 },
    },
    surfaceLayout: surf.map((r) => r.join('')),
    objectLayout: obj.map((r) => r.join('')),
  };
}
