import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUCH_CONTROLS_MODES } from '../public/src/app/state.js';
import { TouchControlsOverlay } from '../public/src/ui/touch-controls.js';

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

test('TOUCH_CONTROLS_MODES exposes auto, on, and off', () => {
  assert.deepEqual(TOUCH_CONTROLS_MODES, ['auto', 'on', 'off']);
});

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
