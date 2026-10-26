'use strict';

/**
 * Browser half of the game page revenue section, bundled per edition by scripts/build-game-ssr.js into
 * docs/assets/[<code>/]revenue-section.js (the section's inline loader adds it when the section nears the viewport).
 * Fetches the page data (docs/games-data/<slug>.json: light `revenue` + heavy `rvz`, see revenue-payload.js), runs the
 * same section module in collect mode and swaps each placeholder ([data-rv]) for its chart or table: the visible ones at
 * once, the newly visible ones on every view switch, the rest when the browser is idle. Parts carry the same escaping
 * and display allowlists as the server render (they come from the same code).
 */
const i18n = require('../i18n');

i18n.setEdition(process.env.RV_EDITION);
const { renderRevenueSection } = require('../templates/components/revenue-section');
const { joinRevenue } = require('../templates/components/revenue-payload');

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));

// Inline scripts inserted as HTML do not run: re-create them (the USD switch of a replaced section).
function runScripts(el) {
  el.querySelectorAll('script').forEach((old) => { const s = document.createElement('script'); s.textContent = old.textContent; old.replaceWith(s); });
}

function show(root, page) {
  // The data changed after this page was rendered (a newer build): the whole section from the current data.
  if (page.h !== root.getAttribute('data-rv-h')) {
    const card = root.closest('#revenue-estimates');
    const box = document.createElement('div');
    box.innerHTML = renderRevenueSection(page, { mode: 'full' });
    const fresh = box.firstElementChild;
    if (card && fresh) { card.replaceWith(fresh); runScripts(fresh); }
    return;
  }
  const { parts } = renderRevenueSection(page, { mode: 'collect' });
  const usd = root.querySelector('#rv-usd');
  const fill = (all) => {
    let n = 0;
    root.querySelectorAll('[data-rv]').forEach((el) => {
      const part = parts.get(el.getAttribute('data-rv'));
      if (!part || (!all && el.offsetParent === null)) return;
      el.outerHTML = part.make();
      n++;
    });
    // New amounts follow the USD switch (the inline USD script converts every .rv-n from its data-v on change).
    if (n && usd && usd.checked) usd.dispatchEvent(new Event('change'));
  };
  fill(false);
  root.addEventListener('change', () => fill(false));
  idle(() => fill(true));
}

document.querySelectorAll('.rv[data-rv-src]').forEach((root) => {
  if (root.hasAttribute('data-rv-on')) return;
  root.setAttribute('data-rv-on', '');
  fetch(root.getAttribute('data-rv-src'))
    .then((response) => (response.ok ? response.json() : null))
    .then((game) => { if (game && game.revenue && game.rvz) show(root, joinRevenue(game.revenue, game.rvz)); })
    .catch(() => {});
});
