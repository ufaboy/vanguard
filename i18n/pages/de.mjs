/**
 * German dictionary for the static pages built by Astro (site/src/pages -> /de/...).
 * Keys are the English text of the source page with collapsed whitespace (HTML entities kept);
 * `npm run build:site` fails on any text that still needs a translation.
 */
import common from './de/common.mjs';
import info from './de/info.mjs';
import modes from './de/modes.mjs';
import guides from './de/guides.mjs';

export default {
  ...common,
  ...info,
  ...modes,
  ...guides,
};
