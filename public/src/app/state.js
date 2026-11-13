import { sound } from '../game/sound.js';
import { SaveRepository } from '../sim/hangar.js';

const VALID_QUALITY_PRESETS = Object.freeze(['low', 'medium', 'high']);

export const CAMERA_LABELS = Object.freeze({
  ISOMETRIC: 'ISOMETRIC 45°',
  TACTICAL_HIGH: 'TACTICAL OVERVIEW',
  CLOSE_COMBAT: 'CLOSE COMBAT',
});

// Frame-rate cap choices cycled in Settings (0 = unlimited)
export const FPS_CAP_OPTIONS = Object.freeze([60, 30, 0]);

const UPGRADES_KEY = 'iron_vanguard_upgrades_v3';
const SETTINGS_KEY = 'iron_vanguard_settings_v1';

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
        chassis: clampTier(parsed.chassis ?? parsed.vehicleFrame, 1),
        frame: clampTier(parsed.frame ?? parsed.vehicleFrame, 1),
        engine: clampTier(parsed.engine, 1),
        armor: clampTier(parsed.armor, 1),
      };
    }
  } catch {
    // ignore storage errors
  }
  return defaults;
}

export function loadPreferences() {
  const prefs = {
    soundEnabled: true,
    cameraPreset: 'ISOMETRIC',
    graphicsQuality: 'high',
    fpsCap: 60,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (typeof raw.soundEnabled === 'boolean') prefs.soundEnabled = raw.soundEnabled;
    if (Object.hasOwn(CAMERA_LABELS, raw.cameraPreset)) prefs.cameraPreset = raw.cameraPreset;
    if (VALID_QUALITY_PRESETS.includes(raw.graphicsQuality)) prefs.graphicsQuality = raw.graphicsQuality;
    if (FPS_CAP_OPTIONS.includes(raw.fpsCap)) prefs.fpsCap = raw.fpsCap;
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
      graphicsQuality: prefs.graphicsQuality,
      fpsCap: prefs.fpsCap,
    }));
  } catch {
    // ignore storage errors
  }
}

export function loadPlayerSave() {
  return new SaveRepository().loadPlayerSave();
}

