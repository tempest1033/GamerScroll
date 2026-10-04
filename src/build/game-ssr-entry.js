'use strict';

/**
 * Workers bundle entry (scripts/build-game-ssr.js). The bundle is instantiated once per edition: templates keep
 * edition strings in module-level constants, so each edition needs its own module graph (see src/build/editions.js loadTemplates).
 */
module.exports = function createEditionRenderer(code) {
  const i18n = require('../i18n');
  i18n.setEdition(code);
  const layout = require('../templates/layout');
  const { generateGamePage } = require('../templates/pages/game');
  return {
    // game = docs/games-data/<slug>.json, meta = docs/games-data/_meta.json
    render(game, meta) {
      layout.setCssFilename('/styles-core.css');
      layout.setCssAssetVersion(meta.cssVersion);
      layout.setRuntimeAssetVersion((meta.editions[code] && meta.editions[code].runtime) || 'v1');
      return generateGamePage(game, meta);
    },
  };
};
