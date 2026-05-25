/**
 * Shared CSS asset versioning.
 *
 * Single source of truth for the cache-busting hash applied to the built
 * CSS bundles. Both generators (generate-html-report.js and
 * scripts/generate-game-pages.js) MUST use these helpers so every page
 * references the identical hashed file and shares one HTTP cache entry.
 *
 * INVARIANT: the hash is computed from the FINAL (PurgeCSS-processed) files
 * inside the output dir, never from the pre-purge bundles. Hashing before
 * purge produced two divergent hashes (un-purged 127KB vs purged 71KB) and
 * shipped the larger file to most pages.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Order matters: it is part of the hash input. Keep both generators aligned.
const CSS_ASSET_FILES = [
  'styles-core.css',
  'styles-report.css',
  'styles-game.css',
  'styles-article.css',
];

const HASHED_CSS_RE = /^styles(?:-[a-z]+)?\.[a-f0-9]{8}\.css$/;

/**
 * Compute the 8-char content hash over the CSS bundles in `docsDir`.
 * Missing bundles are skipped. Returns '' when no bundle exists.
 * @param {string} docsDir - output directory holding the built CSS
 * @returns {string} 8-char hex hash, or '' when no CSS is present
 */
function computeCssAssetVersion(docsDir) {
  const hash = crypto.createHash('md5');
  let hasCss = false;
  for (const filename of CSS_ASSET_FILES) {
    const cssPath = path.join(docsDir, filename);
    if (!fs.existsSync(cssPath)) continue;
    hash.update(fs.readFileSync(cssPath, 'utf8'));
    hash.update('\n');
    hasCss = true;
  }
  return hasCss ? hash.digest('hex').slice(0, 8) : '';
}

/**
 * Remove stale hashed CSS copies in `docsDir`, then write fresh
 * `${name}.${version}.css` copies from the stable (purged) bundles.
 * No-op copy step when `version` is empty.
 * @param {string} docsDir - output directory holding the built CSS
 * @param {string} version - hash returned by computeCssAssetVersion
 */
function ensureDocsCssAssetCopies(docsDir, version) {
  try {
    for (const file of fs.readdirSync(docsDir)) {
      if (HASHED_CSS_RE.test(file)) {
        fs.unlinkSync(path.join(docsDir, file));
      }
    }
  } catch (e) {
    // dir may not exist yet — nothing to clean
  }
  if (!version) return;
  for (const filename of CSS_ASSET_FILES) {
    const stablePath = path.join(docsDir, filename);
    if (!fs.existsSync(stablePath)) continue;
    const versionedPath = path.join(
      docsDir,
      filename.replace(/\.css$/, `.${version}.css`)
    );
    fs.copyFileSync(stablePath, versionedPath);
  }
}

module.exports = { CSS_ASSET_FILES, HASHED_CSS_RE, computeCssAssetVersion, ensureDocsCssAssetCopies };
