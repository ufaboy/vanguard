/** Lightweight DOM helpers that skip redundant writes during periodic HUD ticks. */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Toggles the `hidden` class only on change (classList.add always rewrites the attribute). */
export function setHidden(el, hidden) {
  if (el && el.classList.contains('hidden') !== hidden) el.classList.toggle('hidden', hidden);
}

/**
 * Writes markup only when it differs from what this element last received, so periodic
 * HUD ticks with unchanged values do not re-parse the DOM or reset hover/scroll state.
 */
export function setHtml(el, html) {
  if (el.__lastHtml === html) return;
  el.__lastHtml = html;
  el.innerHTML = html;
}

/** Sets an attribute only when its value changes (avoids redundant SVG invalidation). */
export function setAttr(node, name, value) {
  const v = String(value);
  if (node.getAttribute(name) !== v) node.setAttribute(name, v);
}

/** Keeps exactly `count` children of `tag` in `layer`, reusing existing nodes. */
export function syncPool(layer, tag, count) {
  while (layer.childElementCount < count) layer.appendChild(document.createElementNS(SVG_NS, tag));
  while (layer.childElementCount > count) layer.lastElementChild.remove();
  return layer.children;
}
