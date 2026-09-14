'use strict';

// Continuous research-only rank sampling within an approved deadline. Production files are untouched.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const store = require('../lib/global-rankings');
const { auditRun } = require('./prospective-ranks');

const ROOT = path.resolve(__dirname, '../..');
const MINUTE = 60000;

function planContinuous(now, deadline, interval, sampleBudget, reserve, maximum = 64) {
  if (![now, deadline, interval, sampleBudget, reserve].every(Number.isFinite)
      || interval <= 0 || sampleBudget <= 0 || reserve < 0
      || !Number.isInteger(maximum) || maximum < 1) {
    throw new Error('Invalid sustained observation schedule');
  }
  const available = deadline - now - sampleBudget - reserve;
  const count = Math.max(0, Math.min(maximum, 1 + Math.floor(available / interval)));
  return Array.from({ length: count }, (_, index) => now + index * interval);
}

function collectorArguments(protocol, directory) {
  const args = [path.join(ROOT, 'scripts/collect-global-rankings.js'),
    '--concurrency', String(protocol.concurrency), '--out', directory];
  if (protocol.countries) args.push('--only', protocol.countries.join(','));
  return args;
}

function collectOne(protocol, directory, logPrefix, signal) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    const startedAt = new Date().toISOString();
    const stdout = fs.createWriteStream(`${logPrefix}.stdout.log`, { flags: 'wx' });
    const stderr = fs.createWriteStream(`${logPrefix}.stderr.log`, { flags: 'wx' });
    const child = spawn(process.execPath, collectorArguments(protocol, directory),
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let timedOut = false;
    let error = null;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, protocol.maximum_sample_minutes * MINUTE);
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.once('error', (failure) => { error = failure.message; });
    child.once('close', async (exitCode, exitSignal) => {
      clearTimeout(timer);
      await Promise.all([stdout, stderr].map((stream) => new Promise((done) => {
        if (stream.writableFinished) done();
        else stream.end(done);
      })));
      resolve({ startedAt, finishedAt: new Date().toISOString(), exitCode, exitSignal, timedOut, error });
    });
  });
}

function writeJson(file, value) {
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

async function main() {
  const protocolPath = process.argv[2];
  if (!protocolPath) throw new Error('Usage: node sustained-ranks.js <protocol.json>');
  const resumeDirectory = process.argv[3] || null;
  const protocol = JSON.parse(fs.readFileSync(path.resolve(ROOT, protocolPath), 'utf8'));
  const scheduled = planContinuous(
    Date.now(), protocol.approved_deadline_epoch_ms, protocol.interval_minutes * MINUTE,
    protocol.maximum_sample_minutes * MINUTE, protocol.final_verification_reserve_minutes * MINUTE,
    protocol.maximum_samples,
  );
  if (!scheduled.length) throw new Error('No complete observation slot fits the approved remaining budget');
  const outputRoot = path.resolve(ROOT, protocol.output_root);
  fs.mkdirSync(outputRoot, { recursive: true });
  const directory = resumeDirectory
    ? path.resolve(ROOT, resumeDirectory) : fs.mkdtempSync(path.join(outputRoot, 'session-'));
  const collectorOutput = path.join(directory, 'collector-output');
  const manifestPath = path.join(directory, 'observations.json');
  const previous = resumeDirectory && fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  if (previous) {
    const preserved = path.join(directory, `observations.interrupted-${previous.samples.length}.json`);
    if (!fs.existsSync(preserved)) fs.copyFileSync(manifestPath, preserved);
  }
  const manifest = {
    schemaVersion: 1, productionEnabled: false, monetaryTargetsUsed: false, refitted: false,
    protocolPath, protocol, nodeVersion: process.version,
    collectorOutput: path.relative(ROOT, collectorOutput).replaceAll('\\', '/'),
    resumedFrom: previous ? path.relative(ROOT, manifestPath).replaceAll('\\', '/') : null,
    earlierSamples: previous ? previous.samples.length : 0,
    plannedSamples: [...(previous?.plannedSamples || []).slice(0, previous?.samples.length || 0),
      ...scheduled.map((at) => new Date(at).toISOString())],
    status: 'collecting', samples: previous ? [...previous.samples] : [],
  };
  const abort = new AbortController();
  const onCancel = () => abort.abort();
  process.once('SIGINT', onCancel);
  process.once('SIGTERM', onCancel);
  const seen = new Set(manifest.samples.flatMap(
    (sample) => sample.audits.map((audit) => `${audit.date}T${audit.time}`)));
  const offset = manifest.samples.length;
  writeJson(manifestPath, manifest);
  console.log(JSON.stringify({
    manifest: path.relative(ROOT, manifestPath).replaceAll('\\', '/'),
    plannedSamples: manifest.plannedSamples.length,
    firstSample: manifest.plannedSamples[0],
    lastSample: manifest.plannedSamples.at(-1),
    approvedDeadline: new Date(protocol.approved_deadline_epoch_ms).toISOString(),
  }));
  try {
    for (let index = 0; index < scheduled.length; index++) {
      await delay(Math.max(0, scheduled[index] - Date.now()), undefined, { signal: abort.signal });
      if (Date.now() + (protocol.maximum_sample_minutes
          + protocol.final_verification_reserve_minutes) * MINUTE > protocol.approved_deadline_epoch_ms) {
        manifest.stoppedEarly = 'remaining_budget_no_longer_permits_a_full_sample_and_reserve';
        break;
      }
      const child = await collectOne(
        protocol, collectorOutput, path.join(directory, `round-${offset + index + 1}`), abort.signal,
      );
      const apps = store.loadApps(collectorOutput);
      const audits = [];
      for (const date of store.listDays(collectorOutput)) {
        const day = store.readDay(date, collectorOutput);
        for (const time of Object.keys(day.runs || {})) {
          const token = `${date}T${time}`;
          if (seen.has(token)) continue;
          seen.add(token);
          audits.push(auditRun(day, time, apps));
        }
      }
      const sample = {
        number: offset + index + 1, scheduledAt: new Date(scheduled[index]).toISOString(),
        ...child, audits, noPersistedRun: audits.length === 0,
      };
      manifest.samples.push(sample);
      writeJson(manifestPath, manifest);
      console.log(JSON.stringify({
        sample: sample.number, exitCode: sample.exitCode, timedOut: sample.timedOut,
        reports: audits.map((audit) => ({
          date: audit.date, time: audit.time, status: audit.report.status,
          okCharts: audit.charts.filter((chart) => chart.status === 'ok').length,
          failedCharts: audit.charts.filter((chart) => chart.status !== 'ok').length,
          retainedRows: audit.charts.reduce((sum, chart) => sum + chart.retainedCount, 0),
          dictionaryMissing: audit.charts.reduce(
            (sum, chart) => sum + chart.metadataAbsentFromResearchDictionary.length, 0),
        })),
      }));
      if (abort.signal.aborted) throw new Error('Observation schedule cancelled');
    }
    const completed = manifest.samples.filter(
      (sample) => sample.exitCode === 0 && !sample.timedOut && !sample.noPersistedRun).length;
    manifest.status = completed === manifest.samples.length && !manifest.stoppedEarly
      ? 'sampling_complete' : 'sampling_finished_with_partial_or_failed_snapshots';
  } catch (error) {
    manifest.status = abort.signal.aborted ? 'cancelled' : 'failed';
    manifest.error = error.message;
    process.exitCode = 1;
  } finally {
    manifest.finishedAt = new Date().toISOString();
    writeJson(manifestPath, manifest);
    process.removeListener('SIGINT', onCancel);
    process.removeListener('SIGTERM', onCancel);
    console.log(JSON.stringify({
      manifest: path.relative(ROOT, manifestPath).replaceAll('\\', '/'),
      status: manifest.status, samples: manifest.samples.length,
    }));
  }
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { planContinuous, collectorArguments };
