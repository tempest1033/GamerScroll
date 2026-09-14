'use strict';

// Explicit research phases only. No Git, production build, publication or dependency install.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');

const root = path.resolve(__dirname, '../..');
const { values } = parseArgs({ options: {
  phase: { type: 'string', default: 'report' },
  python: { type: 'string', default: process.env.REVENUE_RESEARCH_PYTHON || 'python' },
  'calendar-sensitivity': { type: 'boolean', default: false },
  help: { type: 'boolean', default: false }
} });
if (values.help) {
  console.log('Usage: node scripts/revenue-research/run-cycle.js --phase build|simulate|report|verify|all --python <executable> [--calendar-sensitivity]');
  process.exit(0);
}
if (!['build', 'simulate', 'report', 'verify', 'all'].includes(values.phase)) throw new Error('Unknown research phase');
const node = (...args) => ({ runtime: process.execPath, args });
const python = (...args) => ({ runtime: values.python, args });
const prefix = 'reports/rank-models/';
const scripts = 'scripts/revenue-research/';
const rankArgs = ['--rank-reference', 'docs/research/august-published-top25-2026-09-10.json'];
const phases = {
  build: [
    node('scripts/anchors/build-anchor-ledger.js'),
    node('scripts/anchors/build-model-panel.js'),
    node('scripts/anchors/build-model-panel.js', ...rankArgs,
      '--output', `${prefix}normalized-august-expanded-panel-2026-09-10.json`),
    node('scripts/anchors/build-model-panel.js', ...rankArgs,
      '--rank-reference', 'docs/research/august-japan-top25-2026-09-10.json',
      '--output', `${prefix}normalized-august-regional-panel-2026-09-10.json`),
    node('scripts/anchors/build-model-panel.js',
      '--games-from-panel', `${prefix}normalized-august-regional-panel-2026-09-10.json`,
      '--start', '2026-08-31', '--end', '2026-09-08',
      '--output', `${prefix}september-boundary-observations-2026-09-10.json`)
  ],
  simulate: [
    python(`${scripts}simulate.py`),
    python(`${scripts}simulate.py`, '--registry', `${scripts}grouping-candidates.json`,
      '--output', `${prefix}normalized-grouping-simulation-2026-09-10.json`),
    python(`${scripts}stability.py`),
    python(`${scripts}convex-objectives.py`),
    python(`${scripts}constrained.py`),
    python(`${scripts}constrained.py`, '--country-bounds', '--budget', '6570',
      '--output', `${prefix}country-constrained-simulation-2026-09-10.json`),
    python(`${scripts}temporal.py`),
    python(`${scripts}expanded-ranks.py`),
    python(`${scripts}expanded-ranks.py`, '--panel', `${prefix}normalized-august-regional-panel-2026-09-10.json`,
      '--output', `${prefix}regional-rank-predictions-2026-09-10.json`),
    python(`${scripts}daily-transfer.py`),
    python(`${scripts}weekly-transfer.py`),
    python(`${scripts}partial-bounds.py`),
    python(`${scripts}ordinal-profile.py`, '--exponent-step', '0.01', '--mixture-step', '0.005',
      '--output', `${prefix}japan-ordinal-profile-resolution-2026-09-10.json`),
    python(`${scripts}japan-holiday-money.py`),
    ...(values['calendar-sensitivity'] ? [
      python(`${scripts}calendar-stability.py`),
      python(`${scripts}ordinal-profile.py`, '--exponent-step', '0.01', '--mixture-step', '0.005',
        '--aggregation', 'elapsed_day_linear', '--output', `${prefix}japan-ordinal-elapsed-2026-09-10.json`),
      python(`${scripts}calendar-stability.py`, '--aggregation', 'elapsed_day_linear',
        '--output', `${prefix}japan-calendar-elapsed-2026-09-10.json`),
      python(`${scripts}ordinal-profile.py`, '--exponent-step', '0.01', '--mixture-step', '0.005',
        '--exponent-bounds', '0', '4', '--omit-date', '2026-08-03', '--omit-date', '2026-08-04',
        '--omit-date', '2026-08-05', '--output', `${prefix}japan-boundary-expanded-2026-09-10.json`)
    ] : [])
  ],
  report: [
    node(`${scripts}report.js`),
    node(`${scripts}report.js`, `${prefix}normalized-grouping-simulation-2026-09-10.json`,
      `${prefix}normalized-grouping-comparison-2026-09-10`),
    node(`${scripts}report-diagnostics.js`),
    node(`${scripts}report.js`, `${prefix}convex-objective-simulation-2026-09-10.json`,
      `${prefix}convex-objective-comparison-2026-09-10`),
    node(`${scripts}report-evidence.js`),
    node(`${scripts}report-summary.js`)
  ],
  verify: [
    node('--test', `${scripts}test-contracts.js`),
    python('-m', 'unittest', 'discover', '-s', scripts, '-p', 'test_models.py'),
    node(`${scripts}verify-artifacts.js`)
  ]
};
const selected = values.phase === 'all' ? Object.keys(phases) : [values.phase];
const receipt = {
  schemaVersion: 1, productionEnabled: false, startedAt: new Date().toISOString(),
  requestedPhase: values.phase, python: values.python, steps: [], status: 'running',
  sourceHashes: fs.readdirSync(__dirname).filter(file => /\.(py|js|json|txt)$/.test(file)).sort().map(file => ({
    file: `${scripts}${file}`,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex')
  }))
};
if (selected.includes('build')) {
  receipt.previousPanels = [];
  const archiveDirectory = path.join(root, prefix, 'provenance');
  fs.mkdirSync(archiveDirectory, { recursive: true });
  for (const name of ['normalized-august-panel', 'normalized-august-expanded-panel',
    'normalized-august-regional-panel', 'september-boundary-observations']) {
    const relative = `${prefix}${name}-2026-09-10.json`;
    let content;
    try { content = fs.readFileSync(path.join(root, relative)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const archive = path.join(archiveDirectory, `${hash}-${name}.json`);
    try { fs.writeFileSync(archive, content, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    receipt.previousPanels.push({ path: relative, sha256: hash, archive });
  }
}
let failed = false;
for (const phase of selected) {
  for (const command of phases[phase]) {
    const startedAt = new Date().toISOString();
    console.log(`\n[research:${phase}] ${command.args.join(' ')}`);
    const child = spawnSync(command.runtime, command.args, { cwd: root, stdio: 'inherit', shell: false });
    const step = { phase, command, startedAt, finishedAt: new Date().toISOString(),
      exitCode: child.status, error: child.error?.message || null };
    receipt.steps.push(step);
    if (child.status !== 0 || child.error) {
      failed = true;
      if (phase !== 'verify') break;
    }
  }
  if (failed) break;
}
receipt.status = failed ? 'failed' : 'completed';
receipt.finishedAt = new Date().toISOString();
const receiptName = `research-cycle-${receipt.startedAt.replace(/[:.]/g, '-')}.json`;
const destination = path.join(root, prefix, receiptName);
fs.writeFileSync(destination, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ receipt: destination, status: receipt.status }));
process.exitCode = failed ? 1 : 0;
