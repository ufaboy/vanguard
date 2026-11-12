/** Settings screen: audio, graphics quality, frame-rate cap and camera preferences. */
const QUALITY_LABELS = Object.freeze({ low: 'Low', medium: 'Medium', high: 'High' });

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
  ].join('')}`;
}
