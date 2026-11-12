import test from 'node:test';
import assert from 'node:assert/strict';
import { AdManager } from '../public/src/app/ads.js';

test('AdManager init and syncSound configure Google adConfig safely', () => {
  const configs = [];
  const mgr = new AdManager({
    globalObj: { adConfig: (cfg) => configs.push(cfg), adBreak: () => {} },
  });
  mgr.init({ soundEnabled: true });
  mgr.syncSound(false);
  assert.deepEqual(configs, [
    { preloadAdBreaks: 'on', sound: 'on' },
    { sound: 'off' },
  ]);
});

test('AdManager pauses and restores controls and audio on battle end and level transition', async () => {
  const events = [];
  const mgr = new AdManager({
    cooldownMs: 0,
    globalObj: {
      adConfig: () => {},
      adBreak: (opts) => {
        events.push(`ad:${opts.type}:${opts.name}`);
        opts.beforeAd();
        opts.afterAd();
        opts.adBreakDone({ breakStatus: 'viewed' });
      },
    },
  });
  mgr.init({
    soundEnabled: true,
    onPause: () => events.push('pause'),
    onResume: () => events.push('resume'),
  });

  const battleRes = await mgr.onBattleEnd({ outcome: 'victory', mode: 'campaign', sectorId: 0 });
  assert.equal(battleRes.shown, true);

  const nextRes = await mgr.onLevelTransition({ fromSectorId: 0, toSectorId: 1 });
  assert.equal(nextRes.shown, true);

  assert.deepEqual(events, [
    'ad:next:battle-end-campaign-0-victory',
    'pause',
    'resume',
    'ad:next:level-transition-0-to-1',
    'pause',
    'resume',
  ]);
});

test('AdManager continues gracefully when ad SDK is missing or times out', async () => {
  const mgrNoSdk = new AdManager({ globalObj: {}, unavailableTimeoutMs: 20 });
  mgrNoSdk.init({ soundEnabled: true });
  const res1 = await mgrNoSdk.onBattleEnd({ outcome: 'defeat' });
  assert.equal(res1.shown, false);
  assert.equal(res1.status, 'unavailable');

  // Blocked SDK where adsbygoogle.push never calls adBreakDone
  let resumed = 0;
  const mgrTimeout = new AdManager({
    globalObj: { adsbygoogle: [] },
    unavailableTimeoutMs: 20,
  });
  mgrTimeout.init({ soundEnabled: true, onResume: () => { resumed++; } });
  const res2 = await mgrTimeout.onLevelTransition({ fromSectorId: 1, toSectorId: 2 });
  assert.equal(res2.shown, false);
  assert.equal(res2.status, 'timeout');
  assert.equal(resumed, 0);
});

test('AdManager showRewarded grants reward only on adViewed and restores state', async () => {
  let rewards = 0;
  let paused = 0;
  let resumed = 0;

  const mgrViewed = new AdManager({
    globalObj: {
      adBreak: (opts) => {
        let shown = false;
        opts.beforeReward(() => { shown = true; });
        assert.equal(shown, true);
        opts.beforeAd();
        opts.adViewed();
        opts.afterAd();
        opts.adBreakDone({ breakStatus: 'viewed' });
      },
    },
  });
  mgrViewed.init({ onPause: () => { paused++; }, onResume: () => { resumed++; } });

  const ok = await mgrViewed.showRewarded({ onReward: () => { rewards++; } });
  assert.equal(ok.rewarded, true);
  assert.equal(rewards, 1);
  assert.equal(paused, 1);
  assert.equal(resumed, 1);

  const mgrDismissed = new AdManager({
    globalObj: {
      adBreak: (opts) => {
        opts.beforeReward(() => {});
        opts.beforeAd();
        opts.adDismissed();
        opts.afterAd();
        opts.adBreakDone({ breakStatus: 'dismissed' });
      },
    },
  });
  mgrDismissed.init({ onPause: () => { paused++; }, onResume: () => { resumed++; } });

  const dismissed = await mgrDismissed.showRewarded({ onReward: () => { rewards++; } });
  assert.equal(dismissed.rewarded, false);
  assert.equal(rewards, 1);
  assert.equal(paused, 2);
  assert.equal(resumed, 2);
});

