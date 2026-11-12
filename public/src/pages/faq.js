import { mountStaticPage } from '../app/shell.js';
import { renderFaq } from '../views/faq.js';

mountStaticPage({
  activePage: 'faq',
  title: 'Field Guide & FAQ',
  className: 'faq-content',
  bodyHtml: renderFaq(),
});

