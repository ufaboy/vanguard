/**
 * German (de) UI dictionary: English source string → German translation.
 * Split by area; `tests/i18n.test.js` checks that every source key is covered.
 */
import ui from './de/ui.js';
import banners from './de/banners.js';
import catalog from './de/catalog.js';
import maps from './de/maps.js';

export default Object.freeze({ ...maps, ...catalog, ...banners, ...ui });
