import { resolveLegacyHashRedirect } from '../app/routes.js';
import { attachSettingsModal } from '../app/shell.js';
import { getCoreAssets, preloadBattlefieldAssets } from '../app/asset-preloader.js';

function handleLegacyHash() {
  const redirect = resolveLegacyHashRedirect(location.hash);
  if (redirect) {
    location.replace(redirect);
    return true;
  }
  return false;
}

if (!handleLegacyHash()) {
  window.addEventListener('hashchange', handleLegacyHash);
  const root = document.getElementById('root');
  if (root) attachSettingsModal(root);
  preloadBattlefieldAssets(getCoreAssets({ includeTerrain: false }));
}
