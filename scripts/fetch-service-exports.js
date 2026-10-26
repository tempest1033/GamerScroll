'use strict';

/**
 * Fetches the revenue / download estimate bundle (forecast repo, branch `service-exports`) into cache/service-exports
 * for the page build (src/build/service-exports.js reads it).
 *
 *   FORECAST_EXPORT_TOKEN   fine-grained read-only token for the private forecast repo (Actions secret)
 *   FORECAST_EXPORT_REPO    owner/name of that repo (Actions variable)
 *   FORECAST_EXPORT_BRANCH  default service-exports
 *   SERVICE_EXPORTS_DIR     local bundle for previews: verified in place, nothing is downloaded
 *
 * Never fails the build: without a token, or when the download, the manifest sha256 check or the freshness check
 * (asof at most 2 days old) fails, it logs a warning and leaves no bundle behind, so the revenue sections are omitted.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyBundle, DEFAULT_DIR } = require('../src/build/service-exports');

const warn = (message) => console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : '⚠️ '}service exports: ${message} — revenue sections omitted`);

async function download({ repo, token, branch, dest, fetchImpl }) {
  const url = `https://api.github.com/repos/${repo}/tarball/${encodeURIComponent(branch)}`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'gamerscroll-build' },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`GET ${repo}@${branch} tarball: HTTP ${response.status}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'service-exports-'));
  try {
    const archive = path.join(work, 'bundle.tar.gz');
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    fs.mkdirSync(dest, { recursive: true });
    // GitHub tarballs hold one top-level <owner>-<repo>-<sha>/ directory.
    const tar = spawnSync('tar', ['-xzf', archive, '-C', dest, '--strip-components=1'], { encoding: 'utf8' });
    if (tar.status !== 0) throw new Error(`tar: ${(tar.stderr || tar.error || '').toString().trim()}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Returns { ok, dir?, asof?, files?, reason? }. */
async function run({ env = process.env, dest = DEFAULT_DIR, now = new Date(), fetchImpl = globalThis.fetch } = {}) {
  if (env.SERVICE_EXPORTS_DIR) {
    const dir = path.resolve(env.SERVICE_EXPORTS_DIR);
    try {
      const { manifest, files } = verifyBundle(dir, { now });
      console.log(`service exports: local ${dir} (asof ${manifest.asof}, ${files.length} files verified)`);
      return { ok: true, dir, asof: manifest.asof, files: files.length };
    } catch (error) {
      warn(`${dir}: ${error.message}`);
      return { ok: false, reason: error.message };
    }
  }
  fs.rmSync(dest, { recursive: true, force: true });
  const token = env.FORECAST_EXPORT_TOKEN, repo = env.FORECAST_EXPORT_REPO;
  if (!token || !repo) {
    const reason = `${!token ? 'FORECAST_EXPORT_TOKEN' : 'FORECAST_EXPORT_REPO'} is not set`;
    warn(reason);
    return { ok: false, reason };
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    warn(`FORECAST_EXPORT_REPO ${JSON.stringify(repo)} is not owner/name`);
    return { ok: false, reason: 'bad repo' };
  }
  const staging = `${dest}.tmp-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    await download({ repo, token, branch: env.FORECAST_EXPORT_BRANCH || 'service-exports', dest: staging, fetchImpl });
    const { manifest, files } = verifyBundle(staging, { now });
    fs.renameSync(staging, dest);
    console.log(`service exports: ${repo} asof ${manifest.asof}, ${files.length} files verified → ${path.relative(process.cwd(), dest) || dest}`);
    return { ok: true, dir: dest, asof: manifest.asof, files: files.length };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(dest, { recursive: true, force: true });
    warn(error.message);
    return { ok: false, reason: error.message };
  }
}

if (require.main === module) run().catch((error) => warn(error.message));

module.exports = { run };
