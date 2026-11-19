/** On-screen virtual joystick and combat action buttons for landscape tablet play. */

import { t } from '../i18n/index.js';

export const MAX_TABLET_VIEWPORT_WIDTH = 1366;

export function isTouchCapable() {
  if (typeof window === 'undefined') return false;
  const width = Number(window.innerWidth);
  if (Number.isFinite(width) && width > MAX_TABLET_VIEWPORT_WIDTH) {
    return false;
  }
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const mobileUa = /Android|iPad|iPhone|iPod|Tablet/i.test(ua);
  const hasTouch =
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  return mobileUa || (coarse && hasTouch);
}

const JOYSTICK_MAX_RADIUS = 42;
const JOYSTICK_DEADZONE = 0.12;

export class TouchControlsOverlay {
  constructor(container, getEngine) {
    this.container = container;
    this.getEngine = getEngine;
    this.visible = false;
    this.joystickPointerId = null;
    this.firePointerId = null;
    this.joyCenter = { x: 0, y: 0 };

    if (!container) return;

    container.innerHTML = `
      <div class="touch-zone-left">
        <div class="touch-joystick-base" data-touch="joystick" role="application" aria-label="${t('Movement joystick')}">
          <div class="touch-joystick-ring" aria-hidden="true"></div>
          <div class="touch-joystick-knob" data-touch="knob" aria-hidden="true"></div>
        </div>
      </div>
      <div class="touch-zone-right">
        <button type="button" class="touch-action-btn touch-wave-btn hidden" data-touch="wave" aria-label="${t('Next survival wave')}">
          <span>${t('WAVE')}</span>
        </button>
        <button type="button" class="touch-action-btn touch-fire-btn" data-touch="fire" aria-label="${t('Fire main cannon')}">
          <span class="touch-btn-title">${t('FIRE')}</span>
        </button>
      </div>
    `;

    this.joystickEl = container.querySelector('[data-touch="joystick"]');
    this.knobEl = container.querySelector('[data-touch="knob"]');
    this.fireBtn = container.querySelector('[data-touch="fire"]');
    this.waveBtn = container.querySelector('[data-touch="wave"]');

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;
    this._abortCtrl?.abort();
    this._abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const opt = this._abortCtrl ? { signal: this._abortCtrl.signal } : undefined;

    const releaseJoystick = (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.resetJoystick();
    };

    if (this.joystickEl) {
      this.joystickEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.joystickPointerId !== null) return;
        this.joystickPointerId = e.pointerId;
        try {
          this.joystickEl.setPointerCapture?.(e.pointerId);
        } catch {
          // Ignore capture errors
        }
        const rect = this.joystickEl.getBoundingClientRect();
        this.joyCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        this.joystickEl.classList.add('is-active');
        this.updateJoystick(e.clientX, e.clientY);
      }, opt);

      this.joystickEl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.joystickPointerId) return;
        e.preventDefault();
        this.updateJoystick(e.clientX, e.clientY);
      }, opt);

      this.joystickEl.addEventListener('pointerup', releaseJoystick, opt);
      this.joystickEl.addEventListener('pointercancel', releaseJoystick, opt);
      this.joystickEl.addEventListener('lostpointercapture', releaseJoystick, opt);
    }

    const releaseFire = (e) => {
      if (e.pointerId !== this.firePointerId) return;
      this.resetFire();
    };

    if (this.fireBtn) {
      this.fireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const engine = this.getEngine?.();
        if (!engine) return;
        this.firePointerId = e.pointerId;
        try {
          this.fireBtn.setPointerCapture?.(e.pointerId);
        } catch {
          // Ignore capture errors
        }
        this.fireBtn.classList.add('is-active');
        engine.isMouseDown = true;
        engine.tryPlayerFire();
      }, opt);

      this.fireBtn.addEventListener('pointerup', releaseFire, opt);
      this.fireBtn.addEventListener('pointercancel', releaseFire, opt);
      this.fireBtn.addEventListener('lostpointercapture', releaseFire, opt);
    }

    if (typeof window !== 'undefined') {
      const releaseAny = (e) => {
        releaseJoystick(e);
        releaseFire(e);
      };
      window.addEventListener('pointerup', releaseAny, opt);
      window.addEventListener('pointercancel', releaseAny, opt);
    }

    if (this.waveBtn) {
      this.waveBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const engine = this.getEngine?.();
        engine?.callNextSurvivalWave?.();
      }, opt);
    }
  }

  destroy() {
    this._abortCtrl?.abort();
    this._abortCtrl = null;
    this.resetJoystick();
    this.resetFire();
  }

  updateJoystick(clientX, clientY) {
    const dx = clientX - this.joyCenter.x;
    const dy = clientY - this.joyCenter.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(JOYSTICK_MAX_RADIUS, dist);
    const angle = Math.atan2(dy, dx);
    const knobX = dist > 0 ? Math.cos(angle) * clamped : 0;
    const knobY = dist > 0 ? Math.sin(angle) * clamped : 0;

    if (this.knobEl) {
      this.knobEl.style.transform = `translate(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px)`;
    }

    const norm = clamped / JOYSTICK_MAX_RADIUS;
    const engine = this.getEngine?.();
    if (!engine) return;

    if (norm < JOYSTICK_DEADZONE) {
      engine.touchMoveX = 0;
      engine.touchMoveY = 0;
    } else {
      const scaled = (norm - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);
      engine.touchMoveX = Math.cos(angle) * scaled;
      engine.touchMoveY = -Math.sin(angle) * scaled;
    }
  }

  resetJoystick() {
    this.joystickPointerId = null;
    this.joystickEl?.classList.remove('is-active');
    if (this.knobEl) {
      this.knobEl.style.transform = 'translate(0px, 0px)';
    }
    const engine = this.getEngine?.();
    if (engine) {
      engine.touchMoveX = 0;
      engine.touchMoveY = 0;
    }
  }

  resetFire() {
    this.firePointerId = null;
    this.fireBtn?.classList.remove('is-active');
    const engine = this.getEngine?.();
    if (engine) {
      engine.isMouseDown = false;
    }
  }

  sync(show, hud) {
    if (!this.container) return;
    if (show !== this.visible) {
      this.visible = show;
      this.container.classList.toggle('hidden', !show);
      this.container.setAttribute('aria-hidden', String(!show));
      this.container.parentElement?.classList?.toggle('has-touch-controls', show);
      if (!show) {
        this.resetJoystick();
        this.resetFire();
      }
    }
    if (!show || !hud) return;

    if (this.waveBtn) {
      const canCallWave = Boolean(hud.survival?.nextWaveCountdown > 0);
      this.waveBtn.classList.toggle('hidden', !canCallWave);
    }
  }
}
