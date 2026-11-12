import { attachSettingsModal } from '../app/shell.js';
import { renderFaq } from '../views/faq.js';

document.body.classList.add('scrollable-page');
const root = document.getElementById('root');
if (root) {
  if (!root.firstElementChild) {
    import('../app/shell.js').then(({ mountStaticPage }) => {
      mountStaticPage({
        activePage: 'faq',
        title: 'Field Guide & FAQ',
        className: 'faq-content',
        bodyHtml: renderFaq(),
      });
    });
  } else {
    attachSettingsModal(root);
  }
}
