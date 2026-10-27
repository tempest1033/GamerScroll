'use strict';

/**
 * Fetches the revenue / download estimate bundle (forecast repo, branch `service-exports`) into cache/service-exports
 * for the page build (src/build/service-exports.js reads it).
 *
 *   FORECAST_EXPORT_DEPLOY_KEY  private half of the forecast repo's read-only SSH deploy key (Actions secret)
 *   FORECAST_EXPORT_REPO        owner/name of that repo (Actions variable)
 *   FORECAST_EXPORT_BRANCH      default service-exports
 *   SERVICE_EXPORTS_DIR         local bundle for previews: verified in place, nothing is downloaded
 *
 * The branch is fetched by a shallow `git clone` over SSH: the key goes to a 0600 file in a private temp directory
 * (removed afterwards, never passed on the command line or to the child's environment), ssh offers only that key and
 * accepts only github.com's pinned host keys.
 *
 * Never fails the build: without a key, or when the clone, the manifest sha256 check or the freshness check
 * (asof at most 2 days old) fails, it logs a warning and leaves no bundle behind, so the revenue sections are omitted.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyBundle, DEFAULT_DIR } = require('../src/build/service-exports');

const warn = (message) => console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : '⚠️ '}service exports: ${message} — revenue sections omitted`);

// github.com SSH host keys as published at https://api.github.com/meta (ssh_keys; fingerprints SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
// ed25519, SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM ecdsa, SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s rsa). If GitHub rotates
// them the clone fails host verification and the build goes on without the bundle (warning in the log): update this list.
const GITHUB_HOST_KEYS = [
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl',
  'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=',
  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=',
];

const defaultGit = (args, options) => spawnSync('git', args, { encoding: 'utf8', timeout: 120000, ...options });

function sshCommand(keyFile, knownHosts) {
  const quote = (file) => `"${file.replace(/\\/g, '/')}"`;
  return [
    'ssh', '-F', '/dev/null', '-i', quote(keyFile),
    '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${quote(knownHosts)}`, '-o', 'GlobalKnownHostsFile=/dev/null',
  ].join(' ');
}

function clone({ repo, key, branch, dest, git }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'service-exports-ssh-'));
  try {
    const keyFile = path.join(work, 'deploy_key'), knownHosts = path.join(work, 'known_hosts');
    // Secrets pasted on Windows may carry CRLF or lose the final newline; ssh rejects both.
    fs.writeFileSync(keyFile, `${key.replace(/\r\n?/g, '\n').trim()}\n`, { mode: 0o600 });
    fs.chmodSync(keyFile, 0o600);
    fs.writeFileSync(knownHosts, GITHUB_HOST_KEYS.map((k) => `github.com ${k}\n`).join(''));
    const { FORECAST_EXPORT_DEPLOY_KEY: _key, ...inherited } = process.env;
    const result = git(['clone', '--quiet', '--depth', '1', '--single-branch', '--no-tags', '--branch', branch, `git@github.com:${repo}.git`, dest], {
      env: { ...inherited, GIT_SSH_COMMAND: sshCommand(keyFile, knownHosts), GIT_TERMINAL_PROMPT: '0' },
    });
    const detail = (result.error && result.error.message) || String(result.stderr || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-4).join(' | ');
    if (result.error || result.status !== 0) throw new Error(`git clone ${repo}@${branch} failed (exit ${result.status}): ${detail}`);
    fs.rmSync(path.join(dest, '.git'), { recursive: true, force: true });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Returns { ok, dir?, asof?, files?, reason? }. */
async function run({ env = process.env, dest = DEFAULT_DIR, now = new Date(), git = defaultGit } = {}) {
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
  const key = env.FORECAST_EXPORT_DEPLOY_KEY, repo = env.FORECAST_EXPORT_REPO;
  if (!key || !key.trim() || !repo) {
    const reason = `${!key || !key.trim() ? 'FORECAST_EXPORT_DEPLOY_KEY' : 'FORECAST_EXPORT_REPO'} is not set`;
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
    clone({ repo, key, branch: env.FORECAST_EXPORT_BRANCH || 'service-exports', dest: staging, git });
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
