/**
 * Spanish (es) UI dictionary: English source string → Spanish translation.
 * Split by area; `tests/i18n.test.js` checks that every source key is covered.
 */
import ui from './es/ui.js';
import banners from './es/banners.js';
import catalog from './es/catalog.js';
import maps from './es/maps.js';

export default Object.freeze({ ...maps, ...catalog, ...banners, ...ui });
