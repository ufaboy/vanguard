/**
 * Spanish dictionary for the static pages built by Astro (site/src/pages -> /es/...).
 * Keys are the English text of the source page with collapsed whitespace (HTML entities kept);
 * `npm run build:site` fails on any text that still needs a translation.
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
