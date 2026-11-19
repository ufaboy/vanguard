/**
 * Brazilian Portuguese (pt-BR) UI dictionary: English source string → pt-BR translation.
 * Split by area; `tests/i18n.test.js` checks that every source key is covered.
 */
import ui from './pt-BR/ui.js';
import banners from './pt-BR/banners.js';
import catalog from './pt-BR/catalog.js';
import maps from './pt-BR/maps.js';

export default Object.freeze({ ...maps, ...catalog, ...banners, ...ui });
