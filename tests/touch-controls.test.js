import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileOrTabletDevice, loadPreferences } from '../public/src/app/state.js';
import { TouchControlsOverlay, isTouchCapable } from '../public/src/ui/touch-controls.js';

function createMockElement() {
  const listeners = new Map();
  const classes = new Set();
  const attrs = new Map();
  return {
    style: {},
    disabled: false,
    textContent: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k),
    addEventListener: (type, fn) => listeners.set(type, fn),
    getListener: (type) => listeners.get(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 128, height: 128 }),
  };
}

test('TouchControlsOverlay maps joystick movement with deadzone and resets when hidden', () => {
  const els = {
    '[data-touch="joystick"]': createMockElement(),
    '[data-touch="knob"]': createMockElement(),
    '[data-touch="fire"]': createMockElement(),
    '[data-touch="wave"]': createMockElement(),
  };
  const container = {
    ...createMockElement(),
    innerHTML: '',
    querySelector: (sel) => els[sel] || null,
  };
  const engine = {
    touchMoveX: 0,
    touchMoveY: 0,
    isMouseDown: false,
    fireCount: 0,
    tryPlayerFire() {
      this.fireCount += 1;
    },
  };

  const overlay = new TouchControlsOverlay(container, () => engine);
  overlay.sync(true, { survival: { nextWaveCountdown: 0 } });

  const down = els['[data-touch="joystick"]'].getListener('pointerdown');
  const move = els['[data-touch="joystick"]'].getListener('pointermove');
  down({ pointerId: 1, clientX: 64, clientY: 64, preventDefault() {}, stopPropagation() {} });
  assert.equal(engine.touchMoveX, 0);
  assert.equal(engine.touchMoveY, 0);

  move({ pointerId: 1, clientX: 64, clientY: 14, preventDefault() {} });
  assert.equal(engine.touchMoveY, 1);
  assert.ok(Math.abs(engine.touchMoveX) < 1e-6);

  const fireDown = els['[data-touch="fire"]'].getListener('pointerdown');
  fireDown({ pointerId: 2, preventDefault() {}, stopPropagation() {} });
  assert.equal(engine.isMouseDown, true);
  assert.equal(engine.fireCount, 1);

  overlay.sync(false, null);
  assert.equal(engine.touchMoveX, 0);
  assert.equal(engine.touchMoveY, 0);
  assert.equal(engine.isMouseDown, false);
});

test('isMobileOrTabletDevice defaults graphicsQuality to low on Android tablets', () => {
  const origWindow = globalThis.window;
  const origNavigator = globalThis.navigator;
  try {
    assert.equal(isMobileOrTabletDevice(), false);
    assert.equal(loadPreferences().graphicsQuality, 'high');

    globalThis.window = { matchMedia: () => ({ matches: true }) };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-P613)', maxTouchPoints: 5 },
    });
    assert.equal(isMobileOrTabletDevice(), true);
    assert.equal(loadPreferences().graphicsQuality, 'low');

    globalThis.window = { innerWidth: 1400, innerHeight: 960, matchMedia: () => ({ matches: true }) };
    assert.equal(isMobileOrTabletDevice(), false);
    assert.equal(isTouchCapable(), false);

    globalThis.window = { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 10 },
    });
    assert.equal(isTouchCapable(), false);
  } finally {
    globalThis.window = origWindow;
    if (origNavigator !== undefined) {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: origNavigator });
    }
  }
});
