/**
 * Google H5 Games Ads (adBreak / adConfig) manager.
 * Handles battle-end interstitials, level transitions, and voluntary rewarded ads
 * while guaranteeing game control and audio restoration even when ads are unavailable.
 */

const DEFAULT_COOLDOWN_MS = 30000;
const DEFAULT_UNAVAILABLE_TIMEOUT_MS = 1200;

export class AdManager {
  constructor({
    globalObj = typeof window !== 'undefined' ? window : globalThis,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    unavailableTimeoutMs = DEFAULT_UNAVAILABLE_TIMEOUT_MS,
  } = {}) {
    this.globalObj = globalObj;
    this.cooldownMs = cooldownMs;
    this.unavailableTimeoutMs = unavailableTimeoutMs;
    this.isShowingAd = false;
    this.lastInterstitialAt = 0;
    this.onPause = null;
    this.onResume = null;
  }

  getAdConfigFn() {
    if (typeof this.globalObj?.adConfig === 'function') {
      return this.globalObj.adConfig;
    }
    if (Array.isArray(this.globalObj?.adsbygoogle)) {
      return (opts) => this.globalObj.adsbygoogle.push(opts);
    }
    return null;
  }

  getAdBreakFn() {
    if (typeof this.globalObj?.adBreak === 'function') {
      return this.globalObj.adBreak;
    }
    if (Array.isArray(this.globalObj?.adsbygoogle)) {
      return (opts) => this.globalObj.adsbygoogle.push(opts);
    }
    return null;
  }

  init({ soundEnabled = true, onPause = null, onResume = null } = {}) {
    this.onPause = onPause;
    this.onResume = onResume;
    const adConfig = this.getAdConfigFn();
    if (adConfig) {
      try {
        adConfig({
          preloadAdBreaks: 'on',
          sound: soundEnabled ? 'on' : 'off',
        });
      } catch {
        // Ignore ad SDK errors so gameplay is never blocked
      }
    }
  }

  syncSound(soundEnabled) {
    const adConfig = this.getAdConfigFn();
    if (!adConfig) return;
    try {
      adConfig({ sound: soundEnabled ? 'on' : 'off' });
    } catch {
      // Ignore ad SDK errors
    }
  }

  runAdBreak(buildConfig) {
    const adBreak = this.getAdBreakFn();
    if (!adBreak || this.isShowingAd) {
      return Promise.resolve({ shown: false, rewarded: false, status: this.isShowingAd ? 'busy' : 'unavailable' });
    }

    this.isShowingAd = true;
    return new Promise((resolve) => {
      let settled = false;
      let adStarted = false;
      let pausedByAd = false;
      let rewarded = false;
      let timerId = null;

      const ensurePaused = () => {
        if (pausedByAd) return;
        pausedByAd = true;
        try {
          this.onPause?.();
        } catch {
          // Ignore pause callback errors
        }
      };

      const ensureResumed = () => {
        if (!pausedByAd) return;
        pausedByAd = false;
        try {
          this.onResume?.();
        } catch {
          // Ignore resume callback errors
        }
      };

      const finish = (status) => {
        if (settled) return;
        settled = true;
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        ensureResumed();
        this.isShowingAd = false;
        resolve({
          shown: status === 'viewed',
          rewarded,
          status,
        });
      };

      // Safety fallback if the AdSense SDK is blocked or fails to invoke adBreakDone
      timerId = setTimeout(() => {
        if (!adStarted) {
          finish('timeout');
        }
      }, this.unavailableTimeoutMs);

      const config = buildConfig({
        beforeAd: () => {
          adStarted = true;
          if (timerId !== null) {
            clearTimeout(timerId);
            timerId = null;
          }
          ensurePaused();
        },
        afterAd: () => {
          ensureResumed();
        },
        onRewarded: () => {
          rewarded = true;
        },
        adBreakDone: (placementInfo) => {
          const status = placementInfo?.breakStatus || 'unknown';
          finish(status);
        },
      });

      try {
        adBreak(config);
      } catch {
        finish('error');
      }
    });
  }

  async showInterstitial({ type = 'next', name = 'interstitial', bypassCooldown = false } = {}) {
    const now = Date.now();
    if (!bypassCooldown && this.lastInterstitialAt > 0 && now - this.lastInterstitialAt < this.cooldownMs) {
      return { shown: false, rewarded: false, status: 'cooldown' };
    }
    const result = await this.runAdBreak(({ beforeAd, afterAd, adBreakDone }) => ({
      type,
      name,
      beforeAd,
      afterAd,
      adBreakDone,
    }));
    if (result.shown) {
      this.lastInterstitialAt = Date.now();
    }
    return result;
  }

  onBattleEnd({ outcome = 'defeat', mode = 'campaign', sectorId = 0 } = {}) {
    return this.showInterstitial({
      type: outcome === 'victory' ? 'next' : 'browse',
      name: `battle-end-${mode}-${sectorId}-${outcome}`,
    });
  }

  onLevelTransition({ fromSectorId = null, toSectorId = null } = {}) {
    return this.showInterstitial({
      type: 'next',
      name: `level-transition-${fromSectorId ?? 'none'}-to-${toSectorId ?? 'none'}`,
    });
  }

  async showRewarded({ name = 'reward-credits', onReward = null } = {}) {
    let rewardGranted = false;
    const result = await this.runAdBreak(({ beforeAd, afterAd, onRewarded, adBreakDone }) => ({
      type: 'reward',
      name,
      beforeAd,
      afterAd,
      beforeReward: (showAdFn) => {
        if (typeof showAdFn === 'function') {
          showAdFn();
        }
      },
      adViewed: () => {
        rewardGranted = true;
        onRewarded();
        try {
          onReward?.();
        } catch {
          // Ignore reward callback errors
        }
      },
      adDismissed: () => {
        rewardGranted = false;
      },
      adBreakDone,
    }));
    return {
      ...result,
      rewarded: result.rewarded || rewardGranted,
    };
  }
}

export const adManager = new AdManager();
