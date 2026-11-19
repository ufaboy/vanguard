/**
 * Spanish dictionary for the generated static pages (public/es/*.html).
 * Keys are the English text of the source page with collapsed whitespace (HTML entities kept);
 * `node scripts/build-i18n-pages.mjs` lists any text that still needs a translation.
 */
import common from './es/common.mjs';
import info from './es/info.mjs';
import modes from './es/modes.mjs';
import guides from './es/guides.mjs';

export default {
  ...common,
  ...info,
  ...modes,
  ...guides,
};
