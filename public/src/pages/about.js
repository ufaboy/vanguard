import { attachSettingsModal } from '../app/shell.js';
import { renderAbout } from '../views/about.js';

document.body.classList.add('scrollable-page');
const root = document.getElementById('root');
if (root) {
  if (!root.firstElementChild) {
    import('../app/shell.js').then(({ mountStaticPage }) => {
      mountStaticPage({
        activePage: 'about',
        title: 'About Iron Vanguard',
        className: 'about-content',
        bodyHtml: renderAbout(),
      });
    });
  } else {
    attachSettingsModal(root);
  }
}
