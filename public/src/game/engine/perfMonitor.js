/**
 * Optional frame-spike and long-task performance monitor.
 * Disabled by default (zero per-frame overhead); enable via `?perf=1` (25 ms threshold),
 * `?perf=<ms>` in the URL, or `window.__perfEnable(ms)` in DevTools.
 */

const DEFAULT_THRESHOLD_MS = 25;
const LOG_COOLDOWN_MS = 200;
const MAX_SPIKE_HISTORY = 50;

/** Parse `?perf=...` from the current URL query string, if available. */
export function parsePerfQueryParam(search = typeof location !== 'undefined' ? location.search : '') {
  if (!search) return null;
  try {
    const raw = new URLSearchParams(search).get('perf');
    if (raw === null || raw === '' || raw === '0' || raw === 'false') return null;
    if (raw === '1' || raw === 'true') return DEFAULT_THRESHOLD_MS;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : DEFAULT_THRESHOLD_MS;
  } catch {
    return null;
  }
}

export class PerfMonitor {
  constructor(options = {}) {
    const queryThreshold = parsePerfQueryParam();
    const initialThreshold = options.perfThresholdMs ?? queryThreshold;

    this.enabled = Boolean(initialThreshold && initialThreshold > 0);
    this.thresholdMs = this.enabled ? Number(initialThreshold) : DEFAULT_THRESHOLD_MS;
    this.cooldownMs = LOG_COOLDOWN_MS;

    this._frameStart = 0;
    this._gapMs = 0;
    this._lastLogAt = 0;
    this._suppressedCount = 0;
    this._observer = null;
    this._spikes = [];
    this._longTasks = [];

    // Pre-allocated phase buckets to avoid per-frame GC allocations.
    this._phases = {
      update: 0,
      textures: 0,
      tileBatcher: 0,
      render: 0,
    };
    this._updatePhases = {
      player: 0,
      enemies: 0,
      projectiles: 0,
      world: 0,
      fx: 0,
      hud: 0,
    };

    if (this.enabled) {
      this._attachObserver();
      console.info(
        `[PERF] Frame spike monitor active (threshold: ${this.thresholdMs}ms). Run __perfReport() in console for a summary.`
      );
    }
    this._registerGlobalHelpers();
  }

  /** Enable monitoring at runtime with an optional spike threshold in milliseconds. */
  enable(thresholdMs = DEFAULT_THRESHOLD_MS) {
    const parsed = Number(thresholdMs);
    this.thresholdMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD_MS;
    this.enabled = true;
    this._attachObserver();
    console.info(`[PERF] Enabled (threshold: ${this.thresholdMs}ms).`);
  }

  /** Disable monitoring at runtime. */
  disable() {
    this.enabled = false;
    this._detachObserver();
    console.info('[PERF] Disabled.');
  }

  /** Begin timing a frame; resets pre-allocated phase buckets. */
  startFrame(rawDeltaSec = 0) {
    this._frameStart = performance.now();
    this._gapMs = rawDeltaSec > 0 && rawDeltaSec < 5 ? rawDeltaSec * 1000 : 0;
    this._phases.update = 0;
    this._phases.textures = 0;
    this._phases.tileBatcher = 0;
    this._phases.render = 0;
    this._updatePhases.player = 0;
    this._updatePhases.enemies = 0;
    this._updatePhases.projectiles = 0;
    this._updatePhases.world = 0;
    this._updatePhases.fx = 0;
    this._updatePhases.hud = 0;
  }

  /** Record duration (ms) for an outer tick phase. */
  recordPhase(name, ms) {
    this._phases[name] = ms;
  }

  /** Record duration (ms) for an inner update() phase. */
  recordUpdatePhase(name, ms) {
    this._updatePhases[name] = ms;
  }

  /** Finish timing the frame and log/store if a spike occurred. */
  endFrame(renderer, counts = null) {
    const now = performance.now();
    const totalMs = now - this._frameStart;
    const isFrameSpike = totalMs >= this.thresholdMs;
    const isGapSpike = this._gapMs >= Math.max(this.thresholdMs * 1.8, 50);

    if (!isFrameSpike && !isGapSpike) return;

    const infoRender = renderer?.info?.render;
    const infoMem = renderer?.info?.memory;

    const entry = {
      atSec: Number((now * 0.001).toFixed(1)),
      totalMs: Number(totalMs.toFixed(1)),
      gapMs: Number(this._gapMs.toFixed(1)),
      update: Number(this._phases.update.toFixed(1)),
      textures: Number(this._phases.textures.toFixed(1)),
      tileBatcher: Number(this._phases.tileBatcher.toFixed(1)),
      render: Number(this._phases.render.toFixed(1)),
      player: Number(this._updatePhases.player.toFixed(1)),
      enemies: Number(this._updatePhases.enemies.toFixed(1)),
      projectiles: Number(this._updatePhases.projectiles.toFixed(1)),
      world: Number(this._updatePhases.world.toFixed(1)),
      fx: Number(this._updatePhases.fx.toFixed(1)),
      hud: Number(this._updatePhases.hud.toFixed(1)),
      calls: infoRender?.calls ?? 0,
      tris: infoRender?.triangles ?? 0,
      geoms: infoMem?.geometries ?? 0,
      tex: infoMem?.textures ?? 0,
      enemiesCount: counts?.enemies ?? 0,
      projCount: counts?.projectiles ?? 0,
    };

    if (this._spikes.length >= MAX_SPIKE_HISTORY) {
      this._spikes.shift();
    }
    this._spikes.push(entry);

    if (now - this._lastLogAt < this.cooldownMs) {
      this._suppressedCount += 1;
      return;
    }

    const suppressedNote = this._suppressedCount > 0 ? ` (+${this._suppressedCount} suppressed)` : '';
    this._suppressedCount = 0;
    this._lastLogAt = now;

    const updateParts = [];
    if (entry.player >= 1) updateParts.push(`player ${entry.player}`);
    if (entry.enemies >= 1) updateParts.push(`enemies ${entry.enemies}`);
    if (entry.projectiles >= 1) updateParts.push(`proj ${entry.projectiles}`);
    if (entry.world >= 1) updateParts.push(`world ${entry.world}`);
    if (entry.fx >= 1) updateParts.push(`fx ${entry.fx}`);
    if (entry.hud >= 1) updateParts.push(`hud ${entry.hud}`);
    const updateDetail = updateParts.length ? ` [${updateParts.join(', ')}]` : '';

    console.warn(
      `[PERF] ${entry.totalMs}ms frame (gap ${entry.gapMs}ms)${suppressedNote} | ` +
      `update ${entry.update}ms${updateDetail} | tex ${entry.textures}ms | ` +
      `tiles ${entry.tileBatcher}ms | render ${entry.render}ms | ` +
      `calls=${entry.calls} tris=${entry.tris} geoms=${entry.geoms} texMem=${entry.tex} ` +
      `active(E:${entry.enemiesCount} P:${entry.projCount})`
    );
  }

  /** Return a summary object and print recent spikes to the console. */
  report() {
    const spikes = this._spikes.slice();
    const longTasks = this._longTasks.slice();
    if (spikes.length === 0 && longTasks.length === 0) {
      console.info(`[PERF] No spikes >= ${this.thresholdMs}ms recorded yet.`);
      return { spikes, longTasks };
    }
    if (spikes.length > 0) {
      console.info(`[PERF] Last ${spikes.length} frame spikes (>= ${this.thresholdMs}ms):`);
      console.table(spikes);
    }
    if (longTasks.length > 0) {
      console.info(`[PERF] Last ${longTasks.length} browser long tasks (> 50ms):`);
      console.table(longTasks);
    }
    return { spikes, longTasks };
  }

  _attachObserver() {
    if (this._observer || typeof PerformanceObserver === 'undefined') return;
    try {
      const supported = PerformanceObserver.supportedEntryTypes;
      if (!Array.isArray(supported) || !supported.includes('longtask')) return;
      this._observer = new PerformanceObserver((list) => {
        if (!this.enabled) return;
        for (const entry of list.getEntries()) {
          const item = {
            atSec: Number((entry.startTime * 0.001).toFixed(1)),
            durationMs: Number(entry.duration.toFixed(1)),
            name: entry.name || 'longtask',
          };
          if (this._longTasks.length >= MAX_SPIKE_HISTORY) {
            this._longTasks.shift();
          }
          this._longTasks.push(item);
          console.warn(`[PERF:longtask] ${item.durationMs}ms at ${item.atSec}s (${item.name})`);
        }
      });
      this._observer.observe({ entryTypes: ['longtask'] });
    } catch {
      this._observer = null;
    }
  }

  _detachObserver() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  _registerGlobalHelpers() {
    if (typeof window === 'undefined') return;
    window.__perfReport = () => this.report();
    window.__perfEnable = (ms) => this.enable(ms);
    window.__perfDisable = () => this.disable();
  }

  dispose() {
    this._detachObserver();
    if (typeof window !== 'undefined') {
      delete window.__perfReport;
      delete window.__perfEnable;
      delete window.__perfDisable;
    }
  }
}
