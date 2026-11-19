/** Settings screen: audio, graphics quality, frame-rate cap, camera and touch preferences. */
import { LOCALE_NAMES, N_, getPreferredLocale, t } from '../i18n/index.js';
const QUALITY_LABELS = Object.freeze({ low: N_('Low'), medium: N_('Medium'), high: N_('High') });
const TOUCH_MODE_LABELS = Object.freeze({ auto: N_('Auto'), on: N_('Always On'), off: N_('Off') });

function settingRow(heading, description, button) {
  return `<div class="menu-settings"><div><h2>${heading}</h2><p>${description}</p></div>${button}</div>`;
}

export function renderSettings(state, cameraLabels) {
  return `<p class="menu-lead">${t('Your preferences are saved on this device.')}</p>${[
    settingRow(t('Language'), t('Language of the game interface. The page reloads to apply it.'),
      `<button class="menu-secondary" data-action="cycle-language" lang="${getPreferredLocale()}">${LOCALE_NAMES[getPreferredLocale()]} ↻</button>`),
    settingRow(t('Combat audio'), t('Weapon fire, impacts, and battlefield effects.'),
      `<button class="menu-secondary" data-action="toggle-sound" aria-pressed="${state.soundEnabled}">${state.soundEnabled ? t('Sound: On') : t('Sound: Off')}</button>`),
    settingRow(t('Graphics quality'), t('Low: fastest, no shadows. Medium: balanced. High: full detail. Anti-aliasing changes apply after a reload; water and ice detail on the next mission.'),
      `<button class="menu-secondary" data-action="cycle-quality">${t('Quality: {level}', { level: t(QUALITY_LABELS[state.graphicsQuality] || 'High') })} ↻</button>`),
    settingRow(t('Frame rate'), t('Caps rendering to save power and heat. Unlimited follows your display refresh rate (120/144 Hz uses more GPU).'),
      `<button class="menu-secondary" data-action="cycle-fps">${t('Frame rate: {cap}', { cap: state.fpsCap ? `${state.fpsCap} FPS` : t('Unlimited') })} ↻</button>`),
    settingRow(t('Camera view'), t('Choose your starting perspective. Press C during combat to cycle views.'),
      `<button class="menu-secondary" data-action="cycle-camera">${t(cameraLabels[state.cameraPreset])} ↻</button>`),
    settingRow(t('Tablet touch controls'), t('On-screen virtual joystick and fire buttons for landscape tablets. Auto enables on touch devices.'),
      `<button class="menu-secondary" data-action="cycle-touch-controls">${t('Touch: {mode}', { mode: t(TOUCH_MODE_LABELS[state.touchControlsMode] || 'Auto') })} ↻</button>`),
    settingRow(t('Reset progress'), t('Clears campaign missions, credits, tank upgrades, survival records, and medals on this device. Preferences are kept.'),
      state.confirmReset
        ? `<div class="menu-actions"><button class="menu-secondary menu-reset-confirm" data-action="confirm-reset-progress">${t('Confirm Reset')}</button><button class="menu-secondary" data-action="cancel-reset-progress">${t('Cancel')}</button></div>`
        : `<button class="menu-secondary menu-reset-btn" data-action="request-reset-progress">${t('Reset Progress')}</button>`),
  ].join('')}`;
}
