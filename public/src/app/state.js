import { sound } from '../game/sound.js';
import { SaveRepository } from '../sim/garage.js';
import { N_ } from '../i18n/index.js';

const VALID_QUALITY_PRESETS = Object.freeze(['low', 'medium', 'high']);

export const CAMERA_LABELS = Object.freeze({
  ISOMETRIC: N_('ISOMETRIC 45°'),
  TACTICAL_HIGH: N_('TACTICAL OVERVIEW'),
  CLOSE_COMBAT: N_('CLOSE COMBAT'),
});

// Frame-rate cap choices cycled in Settings (0 = unlimited)
export const FPS_CAP_OPTIONS = Object.freeze([60, 30, 0]);
export const TOUCH_CONTROLS_MODES = Object.freeze(['auto', 'on', 'off']);

const UPGRADES_KEY = 'battle_tank_tank_config';
const SETTINGS_KEY = 'battle_tank_settings';

function clampTier(val, fallback = 1) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(5, Math.trunc(num)));
}

export function loadUpgrades() {
  const defaults = { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 };
  try {
    const saved = localStorage.getItem(UPGRADES_KEY);
    if (!saved) return defaults;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed.cannon === 'number') {
      return {
        cannon: clampTier(parsed.cannon, 1),
        chassis: clampTier(parsed.chassis, 1),
        frame: clampTier(parsed.frame, 1),
        engine: clampTier(parsed.engine, 1),
        armor: clampTier(parsed.armor, 1),
      };
    }
  } catch {
    // ignore storage errors
  }
  return defaults;
}

export function isMobileOrTabletDevice() {
  if (typeof window === 'undefined') return false;
  const width = Number(window.innerWidth);
  if (Number.isFinite(width) && width > 1366) return false;
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const mobileUa = /Android|iPad|iPhone|iPod|Tablet/i.test(ua);
  const hasTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return mobileUa || (coarse && hasTouch);
}

export function loadPreferences() {
  const prefs = {
    soundEnabled: true,
    cameraPreset: 'ISOMETRIC',
    cameraZoom: null,
    missileFpvEnabled: false,
    hardMode: false,
    graphicsQuality: isMobileOrTabletDevice() ? 'low' : 'high',
    fpsCap: 60,
    touchControlsMode: 'auto',
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (typeof raw.soundEnabled === 'boolean') prefs.soundEnabled = raw.soundEnabled;
    if (Object.hasOwn(CAMERA_LABELS, raw.cameraPreset)) prefs.cameraPreset = raw.cameraPreset;
    if (typeof raw.cameraZoom === 'number' && Number.isFinite(raw.cameraZoom) && raw.cameraZoom >= 14 && raw.cameraZoom <= 46) {
      prefs.cameraZoom = raw.cameraZoom;
    }
    if (typeof raw.missileFpvEnabled === 'boolean') prefs.missileFpvEnabled = raw.missileFpvEnabled;
    if (typeof raw.hardMode === 'boolean') prefs.hardMode = raw.hardMode;
    if (VALID_QUALITY_PRESETS.includes(raw.graphicsQuality)) prefs.graphicsQuality = raw.graphicsQuality;
    if (FPS_CAP_OPTIONS.includes(raw.fpsCap)) prefs.fpsCap = raw.fpsCap;
    if (TOUCH_CONTROLS_MODES.includes(raw.touchControlsMode)) prefs.touchControlsMode = raw.touchControlsMode;
  } catch {
    // ignore storage errors
  }
  sound.enabled = prefs.soundEnabled;
  return prefs;
}

export function savePreferences(prefs) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      soundEnabled: Boolean(prefs.soundEnabled),
      cameraPreset: prefs.cameraPreset,
      cameraZoom: typeof prefs.cameraZoom === 'number' && Number.isFinite(prefs.cameraZoom)
        ? Math.max(14, Math.min(46, prefs.cameraZoom))
        : null,
      missileFpvEnabled: Boolean(prefs.missileFpvEnabled),
      hardMode: Boolean(prefs.hardMode),
      graphicsQuality: prefs.graphicsQuality,
      fpsCap: prefs.fpsCap,
      touchControlsMode: TOUCH_CONTROLS_MODES.includes(prefs.touchControlsMode) ? prefs.touchControlsMode : 'auto',
    }));
  } catch {
    // ignore storage errors
  }
}

export function loadPlayerSave() {
  return new SaveRepository().loadPlayerSave();
}

const PROGRESS_STORAGE_KEYS = Object.freeze([
  'battle_tank_player_save',
  'battle_tank_survival_save',
  'battle_tank_contract_save',
  'battle_tank_tank_config',
  'battle_tank_survival_tank_config',
  'battle_tank_contract_tank_config',
]);

/** Clears all campaign, survival, contract, upgrade, and medal progress while preserving user preferences. */
export function resetAllProgress() {
  try {
    if (typeof localStorage === 'undefined') return;
    for (const key of PROGRESS_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}

