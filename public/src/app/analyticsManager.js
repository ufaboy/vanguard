/**
 * Analytics manager for routing gameplay events and user properties to analytics services.
 * Page views are not sent from here: the Google tag records them automatically.
 * Currently configured for Google Analytics 4 (gtag.js) via a pluggable provider
 * architecture, with error isolation so blocked or missing SDKs never affect gameplay.
 */

function sanitizeParams(params) {
  if (!params || typeof params !== 'object') return {};
  const clean = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

function createGtagProvider(globalObj) {
  const send = (eventName, params) => {
    if (typeof globalObj?.gtag === 'function') {
      globalObj.gtag('event', eventName, params);
    }
  };

  return {
    name: 'gtag',
    trackEvent: (eventName, params = {}) => send(eventName, params),
    setUserProperties: (props) => {
      if (typeof globalObj?.gtag === 'function') {
        globalObj.gtag('set', 'user_properties', props);
      }
    },
  };
}

class AnalyticsManager {
  constructor(globalObj = typeof window !== 'undefined' ? window : globalThis) {
    this.enabled = true;
    this.providers = new Map();
    this.defaultParams = {};
    // Registered up front so every page reports events, not only pages that call init().
    this.registerProvider(createGtagProvider(globalObj));
  }

  init({ enabled, defaultParams } = {}) {
    if (enabled !== undefined) this.enabled = Boolean(enabled);
    if (defaultParams !== undefined) this.defaultParams = sanitizeParams(defaultParams);
  }

  registerProvider(provider) {
    if (!provider || typeof provider.name !== 'string' || !provider.name.trim()) {
      throw new Error('Analytics provider must have a non-empty string name.');
    }
    this.providers.set(provider.name, provider);
    return this;
  }

  dispatch(methodName, ...args) {
    if (!this.enabled) return false;
    for (const provider of this.providers.values()) {
      const fn = provider?.[methodName];
      if (typeof fn !== 'function') continue;
      try {
        fn.apply(provider, args);
      } catch {
        // Isolate third-party analytics errors so gameplay is never disrupted
      }
    }
    return true;
  }

  /** Sets GA user-scoped properties (e.g. campaign progress) for all later events. */
  setUserProperties(props = {}) {
    const clean = sanitizeParams(props);
    if (!Object.keys(clean).length) return false;
    return this.dispatch('setUserProperties', clean);
  }

  trackEvent(eventName, params = {}) {
    if (typeof eventName !== 'string' || !eventName.trim()) return false;
    return this.dispatch('trackEvent', eventName.trim(), {
      ...this.defaultParams,
      ...sanitizeParams(params),
    });
  }
}

export const analyticsManager = new AnalyticsManager();
