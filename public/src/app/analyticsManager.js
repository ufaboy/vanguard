/**
 * Analytics manager for routing page views and gameplay events to analytics services.
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
    trackPageView: (pagePath, params = {}) => send('page_view', { page_path: pagePath, ...params }),
    trackEvent: (eventName, params = {}) => send(eventName, params),
  };
}

class AnalyticsManager {
  constructor(globalObj = typeof window !== 'undefined' ? window : globalThis) {
    this.globalObj = globalObj;
    this.enabled = true;
    this.providers = new Map();
    this.defaultParams = {};
  }

  init({ enabled, defaultParams } = {}) {
    if (enabled !== undefined) this.enabled = Boolean(enabled);
    if (defaultParams !== undefined) this.defaultParams = sanitizeParams(defaultParams);
    if (!this.providers.has('gtag')) {
      this.registerProvider(createGtagProvider(this.globalObj));
    }
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

  trackPageView(pagePath, params = {}) {
    const resolvedPath = pagePath ?? this.globalObj?.location?.pathname ?? '/';
    return this.dispatch('trackPageView', resolvedPath, {
      ...this.defaultParams,
      ...sanitizeParams(params),
    });
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
