import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDAL_CATALOG,
  MEDAL_GRADES,
  RANK_LADDER,
  createBattleMedalTracker,
  evaluateMissionMedals,
  getRankProgress,
  recordMedalsAndRank,
} from '../public/src/sim/medals.js';
import { createInitialPlayerSave } from '../public/src/sim/hangar.js';

test('MEDAL_CATALOG has 20 unique medals with valid grades', () => {
  assert.equal(MEDAL_CATALOG.length, 20);
  const ids = new Set();
  for (const medal of MEDAL_CATALOG) {
    assert.ok(!ids.has(medal.id), `Duplicate medal id: ${medal.id}`);
    ids.add(medal.id);
    assert.ok(MEDAL_GRADES[medal.grade], `Invalid grade: ${medal.grade}`);
  }
});

test('Bronze medals evaluate tactical and loadout conditions', () => {
  const tracker = createBattleMedalTracker();
  tracker.recordMineShot();
  tracker.recordMineShot();
  tracker.recordMineShot();
  tracker.recordEnemyKill({ enemyClass: 'ENGINEER', engineerActing: true });
  tracker.recordConcreteDestroyed(1000);
  tracker.recordEnemyHit({ nowMs: 2500 });

  const evalResult = evaluateMissionMedals({
    trackerState: tracker.snapshot(),
    hud: { blocksDestroyed: 55, baseHp: 80, baseMaxHp: 100 },
    upgrades: { cannon: 5, chassis: 5, frame: 5, engine: 5, armor: 5 },
    equippedModules: ['APS_MODULE'],
    isVictory: true,
  });

  const ids = evalResult.earnedMedals.map((m) => m.id);
  assert.ok(ids.includes('mine_sweeper'));
  assert.ok(ids.includes('saboteur'));
  assert.ok(ids.includes('bunker_buster'));
  assert.ok(ids.includes('demolition_crew'));
  assert.ok(ids.includes('apex_vanguard'));
});

test('Silver medals evaluate flank, matador, counter-battery, ghost hunter, APS, and water kills', () => {
  const tracker = createBattleMedalTracker();
  tracker.recordEnemyKill({ enemyClass: 'ARMOR', aspect: 'rear' });
  tracker.recordEnemyKill({ enemyClass: 'KAMIKAZE', kamikazeChargingClose: true });
  tracker.recordEnemyKill({ enemyClass: 'HOWITZER', howitzerBarrages: 1 });
  tracker.recordEnemyKill({ enemyClass: 'STEALTH', stealthCamouflaged: true });
  for (let i = 0; i < 5; i += 1) tracker.recordApsIntercept();
  tracker.recordEnemyKill({ enemyClass: 'STANDARD', playerInWater: true });
  tracker.recordEnemyKill({ enemyClass: 'SCOUT', playerInWater: true });

  const evalResult = evaluateMissionMedals({
    trackerState: tracker.snapshot(),
    hud: { blocksDestroyed: 0, baseHp: 50, baseMaxHp: 100 },
    upgrades: { cannon: 2, chassis: 4, frame: 2, engine: 2, armor: 2 },
    equippedModules: ['APS_MODULE'],
    isVictory: false,
  });

  const ids = evalResult.earnedMedals.map((m) => m.id);
  assert.ok(ids.includes('flank_master'));
  assert.ok(ids.includes('matador'));
  assert.ok(ids.includes('counter_battery'));
  assert.ok(ids.includes('ghost_hunter'));
  assert.ok(ids.includes('iron_dome'));
  assert.ok(ids.includes('amphibious_assault'));
});

test('Gold and Vanguard medals evaluate HQ, Last Stand, Twin Thunder, Bosses, and Challenges', () => {
  const tracker = createBattleMedalTracker();
  tracker.recordEnemyKill({ enemyClass: 'STANDARD', playerHpRatio: 0.25, salvoId: 7, nowMs: 1000 });
  tracker.recordEnemyKill({ enemyClass: 'SCOUT', playerHpRatio: 0.25, salvoId: 7, nowMs: 1200 });
  tracker.recordEnemyKill({ enemyClass: 'BOSS_MAMMOTH' });
  tracker.recordEnemyKill({ enemyClass: 'BOSS_HYDRA' });
  tracker.recordEnemyKill({ enemyClass: 'BOSS_TITAN', aspect: 'rear', bossOverloaded: true });

  const evalResult = evaluateMissionMedals({
    trackerState: tracker.snapshot(),
    hud: { blocksDestroyed: 10, baseHp: 100, baseMaxHp: 100 },
    upgrades: { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 },
    equippedModules: [],
    isVictory: true,
  });

  const ids = evalResult.earnedMedals.map((m) => m.id);
  assert.ok(ids.includes('fortress_guardian'));
  assert.ok(ids.includes('last_stand'));
  assert.ok(ids.includes('twin_thunder'));
  assert.ok(ids.includes('mammoth_slayer'));
  assert.ok(ids.includes('hydra_dodger'));
  assert.ok(ids.includes('titan_breaker'));
  assert.ok(ids.includes('untouchable'));
  assert.ok(ids.includes('exploit_the_gap'));
  assert.ok(ids.includes('david_vs_goliath'));

  // Taking railgun or MLRS hits blocks Titan Breaker / Hydra Dodger / Untouchable; firing ATGM blocks David vs Goliath
  tracker.recordPlayerDamage({ amount: 15, sourceWeapon: 'HYDRA_MLRS' });
  tracker.recordPlayerDamage({ amount: 30, sourceWeapon: 'TITAN_RAIL' });
  tracker.recordPlayerMissileFired();
  const evalWithHits = evaluateMissionMedals({
    trackerState: tracker.snapshot(),
    hud: { blocksDestroyed: 10, baseHp: 100, baseMaxHp: 100 },
    upgrades: { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 },
    isVictory: true,
  });
  const hitIds = evalWithHits.earnedMedals.map((m) => m.id);
  assert.ok(!hitIds.includes('hydra_dodger'));
  assert.ok(!hitIds.includes('titan_breaker'));
  assert.ok(!hitIds.includes('untouchable'));
  assert.ok(!hitIds.includes('david_vs_goliath'));
});

test('Rank progression enforces XP thresholds, repeat medal XP reduction, and Gold/Vanguard gates', () => {
  const save = createInitialPlayerSave();
  assert.equal(getRankProgress(save).currentRank.id, 'recruit');

  // Give huge XP without Gold/Vanguard medals: capped at Major
  save.serviceXp = 9500;
  let progress = getRankProgress(save);
  assert.equal(progress.currentRank.id, 'major');
  assert.equal(progress.nextRank.id, 'colonel');
  assert.match(progress.missingGate, /Requires 2 Gold\+ medals/);

  // Unlock 2 Gold medals -> advances to Colonel
  save.medals = {
    mammoth_slayer: { count: 1 },
    fortress_guardian: { count: 1 },
  };
  progress = getRankProgress(save);
  assert.equal(progress.currentRank.id, 'colonel');

  // Unlock 2 more Gold + 1 Vanguard -> advances to Vanguard Marshal
  save.medals.hydra_dodger = { count: 1 };
  save.medals.titan_breaker = { count: 1 };
  save.medals.untouchable = { count: 1 };
  progress = getRankProgress(save);
  assert.equal(progress.currentRank.id, 'vanguard_marshal');
  assert.equal(progress.nextRank, null);
});

test('recordMedalsAndRank tracks first-time vs repeat XP and promotion', () => {
  const save = createInitialPlayerSave();
  const tracker = createBattleMedalTracker();
  tracker.recordPlayerDamage({ amount: 10 });
  tracker.recordEnemyKill({ enemyClass: 'BOSS_MAMMOTH' });

  const firstEval = evaluateMissionMedals({
    trackerState: tracker.snapshot(),
    hud: { baseHp: 50, baseMaxHp: 100 },
    upgrades: { cannon: 2, chassis: 2, frame: 2, engine: 2, armor: 2 },
    equippedModules: ['APS_MODULE'],
    isVictory: true,
    existingMedals: save.medals,
  });

  // Combat XP: 150 (Mammoth) + 100 (Victory) = 250; Medal XP: 350 (Mammoth Slayer Gold first)
  assert.equal(firstEval.combatXp, 250);
  assert.equal(firstEval.medalXp, 350);
  assert.equal(firstEval.totalXp, 600);

  const rec1 = recordMedalsAndRank(save, firstEval);
  assert.equal(rec1.promoted, true);
  assert.equal(rec1.previousRank.id, 'recruit');
  assert.equal(rec1.currentRank.id, 'corporal');
  assert.equal(save.medals.mammoth_slayer.count, 1);

  // Repeat earn grants 25% repeat XP (90 for Gold)
  const secondEval = evaluateMissionMedals({
    trackerState: tracker.snapshot(),
    hud: { baseHp: 50, baseMaxHp: 100 },
    upgrades: { cannon: 2, chassis: 2, frame: 2, engine: 2, armor: 2 },
    equippedModules: ['APS_MODULE'],
    isVictory: true,
    existingMedals: save.medals,
  });
  assert.equal(secondEval.medalXp, MEDAL_GRADES.gold.repeatXp);
  const rec2 = recordMedalsAndRank(save, secondEval);
  assert.equal(save.medals.mammoth_slayer.count, 2);
  assert.equal(rec2.newlyUnlockedIds.length, 0);
});
