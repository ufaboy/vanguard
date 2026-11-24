import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePerfQueryParam, PerfMonitor } from '../public/src/game/engine/perfMonitor.js';

test('parsePerfQueryParam parses enabled, custom threshold, and disabled states', () => {
  assert.equal(parsePerfQueryParam(''), null);
  assert.equal(parsePerfQueryParam('?mission=1'), null);
  assert.equal(parsePerfQueryParam('?perf=0'), null);
  assert.equal(parsePerfQueryParam('?perf=false'), null);
  assert.equal(parsePerfQueryParam('?perf=1'), 25);
  assert.equal(parsePerfQueryParam('?perf=true'), 25);
  assert.equal(parsePerfQueryParam('?perf=40'), 40);
});

test('PerfMonitor records spikes exceeding threshold and respects enable/disable', () => {
  const monitor = new PerfMonitor({ perfThresholdMs: 10 });
  assert.equal(monitor.enabled, true);

  // Simulate a spike via gapMs >= max(10 * 1.8, 50) = 50ms
  monitor.startFrame(0.06);
  monitor.recordPhase('update', 12);
  monitor.recordUpdatePhase('enemies', 8);
  monitor.recordPhase('render', 5);
  monitor.endFrame(
    { info: { render: { calls: 42, triangles: 1200 }, memory: { geometries: 10, textures: 5 } } },
    { enemies: 4, projectiles: 2 }
  );

  const report = monitor.report();
  assert.equal(report.spikes.length, 1);
  assert.equal(report.spikes[0].update, 12);
  assert.equal(report.spikes[0].enemies, 8);
  assert.equal(report.spikes[0].render, 5);
  assert.equal(report.spikes[0].calls, 42);
  assert.equal(report.spikes[0].enemiesCount, 4);

  monitor.disable();
  assert.equal(monitor.enabled, false);
  monitor.enable(35);
  assert.equal(monitor.enabled, true);
  assert.equal(monitor.thresholdMs, 35);
  monitor.dispose();
});
