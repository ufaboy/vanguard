import pragueMap from '../public/maps/campaign/mission-13-prague-charles-bridge.json' with { type: 'json' };

/**
 * Builds the 40x40 Showcase Map on top of the Prague: Charles Bridge campaign map,
 * extending the Petrin forest canopy along the northern boulevard (rows 7..8, cols 4..10)
 * for Scene 1's forest convoy ambush.
 */
export function buildShowcaseMapDefinition() {
  const objectLayout = pragueMap.objectLayout.map((row) => row.split(''));


  return {
    ...pragueMap,
    id: 999,
    mapId: 'showcase-demo',
    code: 'SHOWCASE // 40×40',
    name: 'Prague: Tactical Showcase',
    subtitle: 'SHOWCASE // FULL ARSENAL DEMONSTRATION',
    objective: 'Demonstrate all tactical systems',
    gameMode: 'extermination',
    rules: {
      spawnSectorBossOnClear: false,
      disableVictory: true,
    },
    completionReward: { credits: 0 },
    enemies: {
      ...pragueMap.enemies,
      totalCount: 0,
      maxConcurrent: 0,
      spawnDelaySec: 999,
      enemyPool: ['SCOUT', 'STANDARD', 'ARMOR', 'FLAMETHROWER', 'HOWITZER', 'STRIKER', 'SAPPER', 'BOSS_MAMMOTH'],
      encounters: [],
    },
    boss: {
      enemyClass: 'BOSS_MAMMOTH',
      name: 'MAMMOTH MK-V',
      title: 'Super-Heavy Command Dreadnought',
      spawnCell: { row: 25, col: 27 },
    },
    objectLayout: objectLayout.map((row) => row.join('')),
  };
}
