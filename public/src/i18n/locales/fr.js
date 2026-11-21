/**
 * French (fr) UI dictionary: English source string → French translation.
 * Split by area; `tests/i18n.test.js` checks that every source key is covered.
 */
import ui from './fr/ui.js';
import banners from './fr/banners.js';
import catalog from './fr/catalog.js';
import maps from './fr/maps.js';
import campaign from './fr/campaign.js';

export default Object.freeze({ ...maps, ...campaign, ...catalog, ...banners, ...ui });
