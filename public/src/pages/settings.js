/** Settings screen: audio, graphics quality, frame-rate cap, camera and touch preferences. */
const QUALITY_LABELS = Object.freeze({ low: 'Low', medium: 'Medium', high: 'High' });
const TOUCH_MODE_LABELS = Object.freeze({ auto: 'Auto', on: 'Always On', off: 'Off' });

function settingRow(heading, description, button) {
  return `<div class="menu-settings"><div><h2>${heading}</h2><p>${description}</p></div>${button}</div>`;
}

export function renderSettings(state, cameraLabels) {
  return `<p class="menu-lead">Your preferences are saved on this device.</p>${[
    settingRow('Combat audio', 'Weapon fire, impacts, and battlefield effects.',
      `<button class="menu-secondary" data-action="toggle-sound" aria-pressed="${state.soundEnabled}">Sound: ${state.soundEnabled ? 'On' : 'Off'}</button>`),
    settingRow('Graphics quality', 'Low: fastest, no shadows. Medium: balanced. High: full detail. Anti-aliasing changes apply after a reload; water and ice detail on the next mission.',
      `<button class="menu-secondary" data-action="cycle-quality">Quality: ${QUALITY_LABELS[state.graphicsQuality] || 'High'} ↻</button>`),
    settingRow('Frame rate', 'Caps rendering to save power and heat. Unlimited follows your display refresh rate (120/144 Hz uses more GPU).',
      `<button class="menu-secondary" data-action="cycle-fps">Frame rate: ${state.fpsCap ? `${state.fpsCap} FPS` : 'Unlimited'} ↻</button>`),
    settingRow('Camera view', 'Choose your starting perspective. Press C during combat to cycle views.',
      `<button class="menu-secondary" data-action="cycle-camera">${cameraLabels[state.cameraPreset]} ↻</button>`),
    settingRow('Tablet touch controls', 'On-screen virtual joystick and fire buttons for landscape tablets. Auto enables on touch devices.',
      `<button class="menu-secondary" data-action="cycle-touch-controls">Touch: ${TOUCH_MODE_LABELS[state.touchControlsMode] || 'Auto'} ↻</button>`),
  ].join('')}`;
}
