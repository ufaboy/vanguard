import { resolveLegacyHashRedirect } from '../app/routes.js';
import { attachSettingsModal } from '../app/shell.js';
import { renderHome } from '../views/home.js';

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
  document.body.classList.add('scrollable-page');
  const root = document.getElementById('root');
  if (root) {
    if (!root.firstElementChild) root.innerHTML = renderHome();
    attachSettingsModal(root);
  }
}
