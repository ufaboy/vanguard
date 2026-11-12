import { mountStaticPage } from '../app/shell.js';
import { renderAbout } from '../views/about.js';

mountStaticPage({
  activePage: 'about',
  title: 'About Iron Vanguard',
  className: 'about-content',
  bodyHtml: renderAbout(),
});

