import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_PATHS,
  SURVIVAL_MAP_ID,
  battlefieldUrl,
  resolveBattlefieldMission,
  resolveLegacyHashRedirect,
} from '../public/src/app/routes.js';
import { SECTORS, isContractMap } from '../public/src/game/levels.js';
import { isCampaignMissionUnlocked } from '../public/src/game/campaign.js';

const resolve = (search, completedMissions = {}) =>
  resolveBattlefieldMission(search, {
    sectors: SECTORS,
    isContractMap,
    isCampaignMissionUnlocked,
    completedMissions,
  });

test('every sector has a globally unique mapId for battlefield?mission=<mapId>', () => {
  const ids = SECTORS.map((s) => s.mapId);
  assert.equal(new Set(ids).size, ids.length, 'duplicate mapId in SECTORS');
  assert.ok(ids.includes(SURVIVAL_MAP_ID), 'SURVIVAL_MAP_ID must exist in SECTORS');
});

test('battlefieldUrl builds canonical single-param ?mission=<mapId> URLs', () => {
  assert.equal(battlefieldUrl('campaign-01'), './battlefield.html?mission=campaign-01');
  assert.equal(battlefieldUrl('contract-last-cargo'), './battlefield.html?mission=contract-last-cargo');
  assert.equal(battlefieldUrl(SURVIVAL_MAP_ID), `./battlefield.html?mission=${SURVIVAL_MAP_ID}`);
  assert.equal(battlefieldUrl(), './battlefield.html');
});

test('resolveLegacyHashRedirect maps contract hashes to battlefield?mission=<id>', () => {
  assert.equal(
    resolveLegacyHashRedirect('#/contract/contract-last-cargo'),
    './battlefield.html?mission=contract-last-cargo'
  );
  assert.equal(resolveLegacyHashRedirect('#/contract/unknown'), PAGE_PATHS.contracts);
});

test('resolveBattlefieldMission resolves campaign, contract and survival maps by mission param', () => {
  const campaignIdx = SECTORS.findIndex((s) => s.mapId === 'campaign-01');
  const contractIdx = SECTORS.findIndex((s) => s.mapId === 'contract-last-cargo');
  const opContractIdx = SECTORS.findIndex((s) => s.mapId === 'contract-charles-bridge');
  const survivalIdx = SECTORS.findIndex((s) => s.mapId === SURVIVAL_MAP_ID);

  assert.deepEqual(resolve('?mission=campaign-01'), { index: campaignIdx });
  assert.deepEqual(resolve('?mission=contract-last-cargo'), { index: contractIdx });
  assert.deepEqual(resolve('?mission=contract-charles-bridge'), { index: opContractIdx });
  assert.deepEqual(resolve(`?mission=${SURVIVAL_MAP_ID}`), { index: survivalIdx });
});

test('resolveBattlefieldMission redirects locked campaign missions to campaign page', () => {
  assert.deepEqual(resolve('?mission=campaign-10', {}), { redirect: PAGE_PATHS.campaign });
});

test('resolveBattlefieldMission redirects missing, unknown, and legacy query params to home', () => {
  for (const search of [
    '',
    '?mission=',
    '?mission=does-not-exist',
    '?mode=survival',
    '?mode=contract&id=contract-last-cargo',
    '?id=contract-last-cargo',
    '?sector=0',
  ]) {
    assert.deepEqual(resolve(search), { redirect: PAGE_PATHS.index }, `expected home redirect for "${search}"`);
  }
});
