/**
 * French dictionary for the static pages built by Astro (site/src/pages -> /fr/...).
 * Keys are the English text of the source page with collapsed whitespace (HTML entities kept);
 * `pnpm run build:site` fails on any text that still needs a translation.
 */
import common from './fr/common.mjs';
import info from './fr/info.mjs';
import modes from './fr/modes.mjs';
import guides from './fr/guides.mjs';

export default {
  ...common,
  ...info,
  ...modes,
  ...guides,
};
