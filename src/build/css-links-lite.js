'use strict';

/**
 * Workers-runtime stand-in for ./css-links.js (esbuild alias, scripts/build-game-ssr.js).
 * The static build inlines a per-page purged copy of the CSS (fs + postcss + cheerio); a request-time
 * render cannot afford that, so game pages link the hashed bundles, which the browser caches site-wide.
 */
const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function renderCssLinks(cssFiles) {
  const files = [...new Set(cssFiles.map((file) => String(file || '').trim()).filter(Boolean))];
  if (!files.length) files.push('/styles-core.css');
  const links = files.map((file) => `<link rel="stylesheet" href="${escapeAttr(file)}">`);
  // head.js locks transitions (deferred-css-pending) while extra bundles load; stylesheet links block rendering, so unlock right after them.
  if (files.length > 1) links.push(`<script>document.documentElement.classList.remove('deferred-css-pending');</script>`);
  return links.join('\n  ');
}

// The layout's per-page CSS inlining step: nothing to do, the links are already in the head.
const applyPageCss = (html) => html;

module.exports = { renderCssLinks, applyPageCss };
