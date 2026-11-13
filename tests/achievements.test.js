import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBattleSharePayload,
  buildSocialShareLinks,
  decodeShareToken,
  encodeShareToken,
  evaluateBattleAchievements,
  getAchievementsCatalog,
  parseBattleShareChallenge,
  recordUnlockedAchievements,
  updateCareerStats,
} from '../public/src/sim/achievements.js';

test('evaluateBattleAchievements awards campaign victory, boss, accuracy, hull, and loot medals', () => {
  const hud = {
    status: 'VICTORY',
    gameMode: 'base_defense',
    kills: 10,
    shotsHit: 10,
    blocksDestroyed: 28,
    playerHp: 20,
    playerMaxHp: 22,
    defeatOnBaseLoss: true,
    baseAlive: true,
    lastSettlementSummary: { autoCollectedCount: 3 },
  };
  const currentSector = {
    name: 'Sector 01',
    mapId: 'mission_01',
    rules: { spawnSectorBossOnClear: true },
  };

  const { earned, newlyUnlockedIds, totalBonusCredits } = evaluateBattleAchievements({
    hud,
    currentSector,
    accuracy: 91,
    unlockedMap: { sector_cleared: { unlockedAt: 1000, count: 1 } },
  });

  const ids = earned.map((a) => a.id);
  assert.ok(ids.includes('sector_cleared'));
  assert.ok(ids.includes('boss_slayer'));
  assert.ok(ids.includes('deadeye'));
  assert.ok(!ids.includes('sharpshooter'), 'Deadeye supersedes Sharpshooter');
  assert.ok(ids.includes('tank_hunter'));
  assert.ok(ids.includes('iron_survivor'));
  assert.ok(!ids.includes('unscathed'), '20/22 HP is not unscathed');
  assert.ok(ids.includes('hq_guardian'));
  assert.ok(ids.includes('demolitionist'));
  assert.ok(ids.includes('scavenger'));

  assert.equal(earned.find((a) => a.id === 'sector_cleared').isNew, false);
  assert.ok(newlyUnlockedIds.includes('deadeye'));
  assert.ok(!newlyUnlockedIds.includes('sector_cleared'));
  assert.ok(totalBonusCredits > 0);
});

test('evaluateBattleAchievements awards unscathed, career, tier5, and campaign conqueror medals', () => {
  const completedMissions = Object.fromEntries(
    Array.from({ length: 35 }, (_, i) => [`mission_${String(i + 1).padStart(2, '0')}`, { completedAt: 1 }])
  );
  const playerSave = {
    stats: { totalKills: 60 },
    completedMissions,
  };
  const upgrades = { cannon: 5, chassis: 5, frame: 5, engine: 5, armor: 5 };

  const res = evaluateBattleAchievements({
    hud: {
      status: 'VICTORY',
      gameMode: 'extermination',
      kills: 5,
      shotsHit: 5,
      blocksDestroyed: 4,
      playerHp: 22,
      playerMaxHp: 22,
    },
    currentSector: { name: 'Sector 35', mapId: 'mission_35' },
    accuracy: 80,
    playerSave,
    upgrades,
    totalCampaignMissions: 35,
  });

  const ids = res.earned.map((a) => a.id);
  assert.ok(ids.includes('unscathed'));
  assert.ok(!ids.includes('iron_survivor'), 'Unscathed supersedes Iron Survivor');
  assert.ok(ids.includes('veteran_gunner'));
  assert.ok(ids.includes('tier5_engineer'));
  assert.ok(ids.includes('campaign_conqueror'));
});

test('evaluateBattleAchievements awards contract and survival achievements', () => {
  const contractRes = evaluateBattleAchievements({
    hud: {
      status: 'VICTORY',
      gameMode: 'contract',
      kills: 4,
      shotsHit: 5,
      blocksDestroyed: 2,
      playerHp: 5,
      playerMaxHp: 22,
      lastSettlementSummary: { deliveredCount: 3, autoCollectedCount: 0 },
    },
    currentSector: { name: 'Last Cargo', mapId: 'contract-last-cargo', gameMode: 'contract' },
    accuracy: 78,
  });
  const contractIds = contractRes.earned.map((a) => a.id);
  assert.ok(contractIds.includes('full_extraction'));
  assert.ok(contractIds.includes('sharpshooter'));
  assert.ok(contractIds.includes('against_all_odds'));

  const survivalRes = evaluateBattleAchievements({
    hud: {
      status: 'GAME_OVER',
      gameMode: 'survival',
      kills: 24,
      shotsHit: 24,
      blocksDestroyed: 10,
      playerHp: 0,
      playerMaxHp: 22,
      survival: {
        wave: 7,
        wavesCleared: 6,
        bossesDefeated: 1,
        recordSummary: {
          waveReached: 7,
          wavesCleared: 6,
          bossesDefeated: 1,
          isNewWaveRecord: true,
        },
      },
    },
    currentSector: { name: 'Iron Crucible', mapId: 'iron_crucible', gameMode: 'survival' },
    accuracy: 60,
  });
  const survivalIds = survivalRes.earned.map((a) => a.id);
  assert.ok(survivalIds.includes('wave_breaker'));
  assert.ok(survivalIds.includes('record_breaker'));
  assert.ok(survivalIds.includes('boss_slayer'));
  assert.ok(survivalIds.includes('ace_commander'));
});

test('updateCareerStats, recordUnlockedAchievements, and getAchievementsCatalog track lifetime progress', () => {
  const save = { credits: 500, achievements: { sector_cleared: { unlockedAt: 100, count: 1 } } };
  updateCareerStats(save, { kills: 12, blocksDestroyed: 18, isVictory: true });
  assert.equal(save.stats.totalKills, 12);
  assert.equal(save.stats.totalBattles, 1);
  assert.equal(save.stats.totalVictories, 1);
  assert.equal(save.stats.totalBlocksDestroyed, 18);

  recordUnlockedAchievements(save, [{ id: 'sector_cleared' }, { id: 'deadeye' }], 5000);
  assert.equal(save.achievements.sector_cleared.unlockedAt, 100);
  assert.equal(save.achievements.sector_cleared.count, 2);
  assert.equal(save.achievements.deadeye.unlockedAt, 5000);

  const catalog = getAchievementsCatalog(save.achievements);
  assert.ok(catalog.length >= 20);
  const deadeye = catalog.find((a) => a.id === 'deadeye');
  const warMachine = catalog.find((a) => a.id === 'war_machine');
  assert.equal(deadeye.unlocked, true);
  assert.equal(warMachine.unlocked, false);
});

test('buildBattleSharePayload and buildSocialShareLinks use opaque encoded token URLs', () => {
  const campaignShare = buildBattleSharePayload({
    hud: { status: 'VICTORY', gameMode: 'extermination', kills: 12 },
    currentSector: { name: 'Sector 01', mapId: 'mission_01' },
    accuracy: 85,
    earnedAchievements: [{ id: 'sector_cleared', title: 'Sector Secured' }, { id: 'sharpshooter', title: 'Sharpshooter' }],
    origin: 'https://battletank.online/',
  });
  const campaignUrl = new URL(campaignShare.url);
  assert.equal(campaignUrl.pathname, '/campaign');
  const campaignToken = campaignUrl.searchParams.get('c');
  assert.ok(campaignToken && !campaignShare.url.includes('kills='));
  assert.deepEqual(decodeShareToken(campaignToken), {
    m: 'c',
    id: 'mission_01',
    r: 1,
    k: 12,
    a: 85,
    ach: ['sector_cleared', 'sharpshooter'],
  });
  assert.ok(campaignShare.text.includes('Medals: Sector Secured, Sharpshooter'));
  assert.ok(campaignShare.fullText.endsWith(campaignShare.url));

  const social = buildSocialShareLinks(campaignShare);
  assert.ok(social.telegramUrl.startsWith('https://t.me/share/url?'));
  assert.ok(social.xUrl.startsWith('https://twitter.com/intent/tweet?'));
  assert.ok(social.redditUrl.startsWith('https://www.reddit.com/submit?'));

  const survivalShare = buildBattleSharePayload({
    hud: {
      status: 'GAME_OVER',
      gameMode: 'survival',
      kills: 30,
      survival: { wave: 6, wavesCleared: 5 },
    },
    currentSector: { name: 'Iron Crucible', gameMode: 'survival' },
    accuracy: 70,
    earnedAchievements: [{ title: 'Wave Breaker' }],
    origin: '',
  });
  const survivalUrl = new URL(survivalShare.url);
  assert.equal(survivalUrl.pathname, '/survival');
  assert.ok(!survivalShare.url.includes('wave='));
  assert.deepEqual(decodeShareToken(survivalUrl.searchParams.get('c')), {
    m: 's',
    w: 6,
    k: 30,
    ach: [],
  });

  const contractShare = buildBattleSharePayload({
    hud: {
      status: 'VICTORY',
      gameMode: 'contract',
      kills: 7,
      lastSettlementSummary: { deliveredCount: 3 },
    },
    currentSector: { name: 'Last Cargo', mapId: 'contract-last-cargo', gameMode: 'contract' },
    accuracy: 80,
    earnedAchievements: [],
    origin: 'http://localhost:3000',
  });
  const contractUrl = new URL(contractShare.url);
  assert.equal(contractUrl.pathname, '/contracts');
  assert.deepEqual(decodeShareToken(contractUrl.searchParams.get('c')), {
    m: 'k',
    id: 'contract-last-cargo',
    r: 1,
    g: 3,
    k: 7,
    ach: [],
  });
});

test('parseBattleShareChallenge decodes opaque tokens and rejects tampered ones', () => {
  assert.equal(parseBattleShareChallenge('', 'campaign'), null);
  assert.equal(parseBattleShareChallenge('?mission=mission_02', 'campaign'), null);
  assert.equal(parseBattleShareChallenge('?c=tampered_token', 'survival'), null);

  const cTok = encodeShareToken({ m: 'c', id: 'mission_04', r: 1, k: 15, a: 88 });
  const campaign = parseBattleShareChallenge(`?c=${cTok}`, 'campaign');
  assert.equal(campaign.mode, 'campaign');
  assert.equal(campaign.missionId, 'mission_04');
  assert.ok(campaign.statsText.includes('15 kills'));
  assert.ok(campaign.statsText.includes('88% accuracy'));

  const sTok = encodeShareToken({ m: 's', w: 8, k: 42, ach: ['wave_breaker', 'record_breaker'] });
  const survival = parseBattleShareChallenge(`?c=${sTok}`, 'survival');
  assert.equal(survival.mode, 'survival');
  assert.ok(survival.statsText.includes('Wave 8'));
  assert.ok(survival.statsText.includes('42 kills'));
  assert.equal(survival.achievements.length, 2);
  assert.equal(survival.achievements[0].title, 'Wave Breaker');

  const kTok = encodeShareToken({ m: 'k', id: 'contract-blackout-protocol', r: 1, g: 3, k: 9 });
  const contract = parseBattleShareChallenge(`?c=${kTok}`, 'contracts');
  assert.equal(contract.mode, 'contract');
  assert.equal(contract.missionId, 'contract-blackout-protocol');
  assert.ok(contract.statsText.includes('3/3 cargo'));
});
