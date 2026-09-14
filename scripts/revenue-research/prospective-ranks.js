'use strict';

// A finite, research-only observation schedule. No production files are changed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const store = require('../lib/global-rankings');

const ROOT = path.resolve(__dirname, '../..');
const PROTOCOL = 'docs/research/revenue-five-hour-2026-09-11/prospective-rank-protocol.json';
const OUTPUT = path.join(ROOT, 'reports/rank-models/prospective-rank-observations-2026-09-11');
const MINUTE = 60000;

function planSchedule(now, deadline, maximum, interval, sampleBudget, reserve) {
  if (![now, deadline, interval, sampleBudget, reserve].every(Number.isFinite)
      || interval <= 0 || sampleBudget <= 0 || reserve < 0
      || !Number.isInteger(maximum) || maximum < 1 || maximum > 4) {
    throw new Error('Invalid bounded observation schedule');
  }
  const available = deadline - now - sampleBudget - reserve;
  const count = Math.max(0, Math.min(maximum, 1 + Math.floor(available / interval)));
  return Array.from({ length: count }, (_, index) => now + index * interval);
}

function auditRun(day, time, apps) {
  const report = day.runs?.[time];
  if (!report?.charts) throw new Error('A current-run collection report is required');
  const rows = store.expandDay(day).filter((row) => row.time === time);
  const charts = Object.entries(report.charts).map(([key, state]) => {
    const current = rows.filter((row) => row.key === key);
    const prefix = key.split('_')[0];
    const ids = current.map((row) => row.id);
    const missing = current.filter((row) => !apps[`${prefix}:${row.id}`]);
    const untitled = current.filter((row) => {
      const meta = apps[`${prefix}:${row.id}`];
      return meta && !meta.t?.trim();
    });
    return {
      key, ...state, retainedCount: ids.length, orderedIds: ids,
      orderedIdSha256: crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex'),
      duplicateIdCount: ids.length - new Set(ids).size,
      metadataAbsentFromResearchDictionary: missing.map(({ rank, id }) => ({ rank, id })),
      metadataTitleEmpty: untitled.map(({ rank, id }) => ({ rank, id })),
    };
  });
  return {
    date: day.date, time, report, charts,
    metadataBasis: 'isolated_session_dictionary_at_audit_not_a_fresh_lookup_for_every_country',
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function collectOne(protocol, directory, logPrefix, signal) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    const startedAt = new Date().toISOString();
    const stdout = fs.createWriteStream(`${logPrefix}.stdout.log`, { flags: 'wx' });
    const stderr = fs.createWriteStream(`${logPrefix}.stderr.log`, { flags: 'wx' });
    const child = spawn(process.execPath, [
      path.join(ROOT, 'scripts/collect-global-rankings.js'),
      '--only', protocol.countries.join(','), '--concurrency', '1', '--out', directory,
    ], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], signal });
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
      resolve({
        startedAt, finishedAt: new Date().toISOString(),
        exitCode, exitSignal, timedOut, error,
      });
    });
  });
}

async function main() {
  const protocolPath = process.argv[2] || PROTOCOL;
  const protocol = JSON.parse(fs.readFileSync(path.resolve(ROOT, protocolPath), 'utf8'));
  const notBefore = protocol.not_before_utc === undefined ? Date.now() : Date.parse(protocol.not_before_utc);
  if (!Number.isFinite(notBefore)) throw new Error('Invalid protocol not_before_utc');
  const scheduled = planSchedule(
    Math.max(Date.now(), notBefore), protocol.approved_deadline_epoch_ms, protocol.maximum_samples,
    protocol.interval_minutes * MINUTE, protocol.maximum_sample_minutes * MINUTE,
    protocol.final_verification_reserve_minutes * MINUTE,
  );
  if (!scheduled.length) throw new Error('No complete observation slot fits the approved remaining budget');
  fs.mkdirSync(OUTPUT, { recursive: true });
  const directory = fs.mkdtempSync(path.join(OUTPUT, 'session-'));
  const collectorOutput = path.join(directory, 'collector-output');
  const manifestPath = path.join(directory, 'observations.json');
  const manifest = {
    schemaVersion: 1, productionEnabled: false, monetaryTargetsUsed: false, refitted: false,
    protocolPath, protocol,
    nodeVersion: process.version, collectorOutput: path.relative(ROOT, collectorOutput),
    plannedSamples: scheduled.map((at) => new Date(at).toISOString()),
    status: 'collecting', samples: [],
  };
  const abort = new AbortController();
  const onCancel = () => abort.abort();
  process.once('SIGINT', onCancel);
  process.once('SIGTERM', onCancel);
  const seen = new Set();
  writeJson(manifestPath, manifest);
  console.log(JSON.stringify({
    manifest: path.relative(ROOT, manifestPath), plannedSamples: manifest.plannedSamples,
    approvedDeadline: new Date(protocol.approved_deadline_epoch_ms).toISOString(),
  }));
  try {
    for (let index = 0; index < scheduled.length; index++) {
      await delay(Math.max(0, scheduled[index] - Date.now()), undefined, { signal: abort.signal });
      if (Date.now() + (protocol.maximum_sample_minutes
          + protocol.final_verification_reserve_minutes) * MINUTE > protocol.approved_deadline_epoch_ms) {
        throw new Error('Remaining budget no longer permits a full sample and verification reserve');
      }
      const child = await collectOne(
        protocol, collectorOutput, path.join(directory, `round-${index + 1}`), abort.signal,
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
        number: index + 1, scheduledAt: new Date(scheduled[index]).toISOString(),
        ...child, audits,
        noPersistedRun: audits.length === 0,
      };
      manifest.samples.push(sample);
      writeJson(manifestPath, manifest);
      console.log(JSON.stringify({
        sample: sample.number, exitCode: sample.exitCode, timedOut: sample.timedOut,
        reports: audits.map((audit) => ({
          date: audit.date, time: audit.time, status: audit.report.status,
          retainedRows: audit.charts.reduce((sum, chart) => sum + chart.retainedCount, 0),
          dictionaryMissing: audit.charts.reduce(
            (sum, chart) => sum + chart.metadataAbsentFromResearchDictionary.length, 0),
        })),
      }));
      if (abort.signal.aborted) throw new Error('Observation schedule cancelled');
    }
    manifest.status = manifest.samples.every(
      (sample) => sample.exitCode === 0 && !sample.noPersistedRun && !sample.timedOut,
    ) ? 'sampling_complete' : 'sampling_finished_with_partial_or_failed_snapshots';
    if (manifest.status !== 'sampling_complete') process.exitCode = 1;
  } catch (error) {
    manifest.status = abort.signal.aborted ? 'cancelled' : 'failed';
    manifest.error = error.message;
    process.exitCode = 1;
  } finally {
    manifest.finishedAt = new Date().toISOString();
    writeJson(manifestPath, manifest);
    process.removeListener('SIGINT', onCancel);
    process.removeListener('SIGTERM', onCancel);
    console.log(JSON.stringify({ manifest: path.relative(ROOT, manifestPath), status: manifest.status }));
  }
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { planSchedule, auditRun };
