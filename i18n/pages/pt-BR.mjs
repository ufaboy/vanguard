/**
 * Brazilian Portuguese dictionary for the static pages built by Astro (site/src/pages -> /pt-br/...).
 * Keys are the English text of the source page with collapsed whitespace (HTML entities kept);
 * `npm run build:site` fails on any text that still needs a translation.
 */
import common from './pt-BR/common.mjs';
import info from './pt-BR/info.mjs';
import modes from './pt-BR/modes.mjs';
import guides from './pt-BR/guides.mjs';

export default {
  ...common,
  ...info,
  ...modes,
  ...guides,
};
