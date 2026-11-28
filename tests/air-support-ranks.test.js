import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIR_STRIKE_RANK_REQUIREMENTS,
  RANK_LADDER,
  getAirStrikeRequiredRank,
  getNewlyUnlockedAirSupport,
  getRankAirSupportUnlocks,
  isAirStrikeVariantUnlocked,
} from '../public/src/sim/medals.js';

test('air strike rank requirements map to valid ranks in RANK_LADDER', () => {
  const rankIds = new Set(RANK_LADDER.map((r) => r.id));
  for (const [variantId, meta] of Object.entries(AIR_STRIKE_RANK_REQUIREMENTS)) {
    assert.ok(rankIds.has(meta.rankId), `${variantId} references valid rank ${meta.rankId}`);
    const req = getAirStrikeRequiredRank(variantId);
    assert.equal(req.id, meta.rankId);
  }
  assert.equal(
    getAirStrikeRequiredRank('MINES').id,
    getAirStrikeRequiredRank('STRIKE_MINES').id,
    'MINES alias resolves to STRIKE_MINES required rank'
  );
});

test('isAirStrikeVariantUnlocked enforces rank order in campaign and unlocks all in survival/contract', () => {
  const rankIndex = new Map(RANK_LADDER.map((r, idx) => [r.id, idx]));

  for (const variantId of Object.keys(AIR_STRIKE_RANK_REQUIREMENTS)) {
    const reqIdx = rankIndex.get(getAirStrikeRequiredRank(variantId).id);
    for (let i = 0; i < RANK_LADDER.length; i += 1) {
      const rank = RANK_LADDER[i];
      assert.equal(
        isAirStrikeVariantUnlocked(variantId, rank.id, 'campaign'),
        i >= reqIdx,
        `${variantId} at ${rank.id} in campaign`
      );
    }

    assert.equal(
      isAirStrikeVariantUnlocked(variantId, RANK_LADDER[0].id, 'survival'),
      true,
      `${variantId} unlocked at lowest rank in survival`
    );
    assert.equal(
      isAirStrikeVariantUnlocked(variantId, RANK_LADDER[0].id, 'contract'),
      true,
      `${variantId} unlocked at lowest rank in contract`
    );
  }
});

test('getRankAirSupportUnlocks and getNewlyUnlockedAirSupport report promotion unlocks', () => {
  const bombsRankId = getAirStrikeRequiredRank('STRIKE_BOMBS').id;
  const minesRankId = getAirStrikeRequiredRank('STRIKE_MINES').id;
  const thermoRankId = getAirStrikeRequiredRank('STRIKE_THERMO').id;
  const ac130RankId = getAirStrikeRequiredRank('STRIKE_AC130').id;

  assert.ok(getRankAirSupportUnlocks(bombsRankId).some((u) => u.id === 'STRIKE_BOMBS'));
  assert.ok(getRankAirSupportUnlocks(minesRankId).some((u) => u.id === 'STRIKE_MINES'));
  assert.ok(getRankAirSupportUnlocks(thermoRankId).some((u) => u.id === 'STRIKE_THERMO'));
  assert.ok(getRankAirSupportUnlocks(ac130RankId).some((u) => u.id === 'STRIKE_AC130'));

  const multiPromo = getNewlyUnlockedAirSupport(RANK_LADDER[0].id, ac130RankId);
  const unlockedIds = new Set(multiPromo.map((u) => u.id));
  assert.ok(unlockedIds.has('STRIKE_MINES'));
  assert.ok(unlockedIds.has('STRIKE_THERMO'));
  assert.ok(unlockedIds.has('STRIKE_AC130'));
  assert.equal(unlockedIds.has('STRIKE_BOMBS'), false, 'starting rank unlock is not repeated');

  assert.deepEqual(getNewlyUnlockedAirSupport(minesRankId, minesRankId), []);
});
