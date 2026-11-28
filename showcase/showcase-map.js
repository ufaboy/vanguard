import berlinMap from '../public/maps/campaign/mission-16-berlin-brandenburg-gate.json' with { type: 'json' };

/**
 * Builds the 40x40 Showcase Map on top of Mission 16 (Berlin: Brandenburg Gate),
 * featuring the Brandenburg Gate, Victory Column, Tiergarten forest & lake,
 * and wide avenues for all 6 tactical showcase highlights.
 */
export function buildShowcaseMapDefinition() {
  return {
    ...berlinMap,
    id: 999,
    mapId: 'showcase-demo',
    code: 'SHOWCASE // 40×40',
    name: 'Berlin: Tactical Showcase',
    subtitle: 'SHOWCASE // FULL ARSENAL DEMONSTRATION',
    objective: 'Demonstrate all tactical systems',
    gameMode: 'extermination',
    rules: {
      spawnSectorBossOnClear: false,
      disableVictory: true,
    },
    completionReward: { credits: 0 },
    enemies: {
      ...berlinMap.enemies,
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
      spawnCell: { row: 26, col: 28 },
    },
  };
}
