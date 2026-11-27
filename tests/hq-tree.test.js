import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HQ_TREE_MAX_LEVEL,
  HQ_TREE_NODES,
  canUpgradeHqNode,
  createDefaultHqTree,
  getHqBonuses,
  getHqNodeLevel,
  getHqNodeNextCost,
  normalizeHqTree,
  upgradeHqNode,
} from '../public/src/sim/hq-tree.js';
import { RANK_LADDER, getAirStrikeRequiredRank } from '../public/src/sim/medals.js';

test('HQ tree defaults and normalization clamp every node within [1, HQ_TREE_MAX_LEVEL]', () => {
  const def = createDefaultHqTree();
  for (const node of HQ_TREE_NODES) {
    assert.equal(def[node.id], 1);
  }

  const normalized = normalizeHqTree({
    STRIKE_BOMBS: 0,
    STRIKE_AC130: HQ_TREE_MAX_LEVEL + 5,
    RADAR_RANGE: 2,
  });
  assert.equal(getHqNodeLevel(normalized, 'STRIKE_BOMBS'), 1);
  assert.equal(getHqNodeLevel(normalized, 'STRIKE_AC130'), HQ_TREE_MAX_LEVEL);
  assert.equal(getHqNodeLevel(normalized, 'RADAR_RANGE'), 2);
});

test('canUpgradeHqNode enforces campaign rank gates, credits, and max level, while survival/contract ignore rank gates', () => {
  const tree = createDefaultHqTree();
  const ac130Node = HQ_TREE_NODES.find((n) => n.id === 'STRIKE_AC130');
  const ac130Cost = getHqNodeNextCost(ac130Node.id, 1);
  const lowestRank = RANK_LADDER[0].id;
  const reqRank = getAirStrikeRequiredRank(ac130Node.strikeVariantId).id;

  const blockedByRank = canUpgradeHqNode({
    hqTree: tree,
    nodeId: ac130Node.id,
    credits: ac130Cost * 10,
    playerRankId: lowestRank,
    profileMode: 'campaign',
  });
  assert.equal(blockedByRank.ok, false);

  const allowedAtRank = canUpgradeHqNode({
    hqTree: tree,
    nodeId: ac130Node.id,
    credits: ac130Cost,
    playerRankId: reqRank,
    profileMode: 'campaign',
  });
  assert.equal(allowedAtRank.ok, true);
  assert.equal(allowedAtRank.nextLevel, 2);

  const allowedInSurvival = canUpgradeHqNode({
    hqTree: tree,
    nodeId: ac130Node.id,
    credits: ac130Cost,
    playerRankId: lowestRank,
    profileMode: 'survival',
  });
  assert.equal(allowedInSurvival.ok, true);

  const blockedByCredits = canUpgradeHqNode({
    hqTree: tree,
    nodeId: ac130Node.id,
    credits: Math.max(0, ac130Cost - 1),
    playerRankId: reqRank,
    profileMode: 'campaign',
  });
  assert.equal(blockedByCredits.ok, false);

  let maxedTree = tree;
  for (let i = 1; i < HQ_TREE_MAX_LEVEL; i += 1) {
    maxedTree = upgradeHqNode(maxedTree, ac130Node.id);
  }
  assert.equal(getHqNodeLevel(maxedTree, ac130Node.id), HQ_TREE_MAX_LEVEL);
  assert.equal(
    canUpgradeHqNode({
      hqTree: maxedTree,
      nodeId: ac130Node.id,
      credits: 999999,
      playerRankId: reqRank,
      profileMode: 'campaign',
    }).ok,
    false
  );
});

test('getHqBonuses scales monotonically as HQ nodes are upgraded', () => {
  const baseTree = createDefaultHqTree();
  let maxTree = baseTree;
  for (const node of HQ_TREE_NODES) {
    for (let i = 1; i < HQ_TREE_MAX_LEVEL; i += 1) {
      maxTree = upgradeHqNode(maxTree, node.id);
    }
  }

  const base = getHqBonuses(baseTree);
  const max = getHqBonuses(maxTree);

  assert.ok(max.bombCount > base.bombCount);
  assert.ok(max.bombRadiusCells > base.bombRadiusCells);
  assert.ok(max.mineCount > base.mineCount);
  assert.ok(max.thermoRadiusCells > base.thermoRadiusCells);
  assert.ok(max.ac130DurationSec > base.ac130DurationSec);
  assert.ok(max.ac130FireIntervalSec < base.ac130FireIntervalSec);
  assert.ok(max.airdropShells > base.airdropShells);
  assert.ok(max.repairHealAmount > base.repairHealAmount);
  assert.ok(max.radarBonusCells > base.radarBonusCells);
  assert.ok(max.sightBonusCells > base.sightBonusCells);
  assert.ok(max.reconDurationBonusSec > base.reconDurationBonusSec);
  assert.ok(max.baseHpMultiplier > base.baseHpMultiplier);
});
