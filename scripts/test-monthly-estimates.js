'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadMonthlyEstimates, renderMonthlyEstimates, formatRange } = require('../src/rank/monthly-estimates');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'monthly-estimates-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const readiness = Buffer.from(JSON.stringify({ schema_version: 1, release_ready: false,
    as_of: '2026-09-13', metrics: [] }));
  const data = { schema_version: 1, production_enabled: false, release_ready: false, as_of: '2026-09-13',
    readiness_sha256: crypto.createHash('sha256').update(readiness).digest('hex'),
    metrics: [{ metric: 'consumer_spend', month: '2026-08', rows: [
      { family: '<script>alert(1)</script>', month: '2026-08', class: 'gross', status: 'available',
        lower: 100001, estimate: 150000, upper: 199999, interval_nominal_coverage: 0.9 },
      { family: 'Hidden', month: '2026-08', status: 'withheld', estimate: 999, reason: 'uncalibrated' }
    ] }] };
  fs.writeFileSync(path.join(directory, 'service-readiness.json'), readiness);
  fs.writeFileSync(path.join(directory, 'service-health.json'), JSON.stringify({ ok: true, as_of: '2026-09-13' }));
  const write = () => fs.writeFileSync(path.join(directory, 'service-preview.json'), JSON.stringify(data));
  write();
  return { directory, data, write, now: new Date('2026-09-13T02:00:00Z') };
}

test('disabled public rendering performs no artifact reads', () => {
  assert.equal(renderMonthlyEstimates({ enabled: false, directory: '/does-not-exist' }), '');
});

test('research output remains blocked even when public rendering is enabled', (t) => {
  const f = fixture(t);
  assert.equal(loadMonthlyEstimates({ ...f, enabled: true }), null);
});

test('private preview escapes names, hides withheld numbers and rounds bounds outward', (t) => {
  const f = fixture(t);
  const data = loadMonthlyEstimates({ ...f, preview: true });
  assert.equal(data.metrics[0].rows[1].estimate, undefined);
  const html = renderMonthlyEstimates({ ...f, preview: true });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('공개 금지'));
  assert.ok(html.includes('10~20만 달러'));
  assert.ok(html.includes('추정 보류'));
  assert.equal(formatRange({ status: 'available', lower: 100001, upper: 199999 }, 'downloads'), '10~20만 회');
});

test('stale, failed, mismatched and invalid-unit data never become estimates', (t) => {
  const f = fixture(t);
  assert.throws(() => loadMonthlyEstimates({ ...f, preview: true, now: new Date('2026-09-20') }), /stale/);
  f.data.metrics[0].rows[0].class = 'net'; f.write();
  assert.throws(() => loadMonthlyEstimates({ ...f, preview: true }), /unit/);
  f.data.readiness_sha256 = 'wrong'; f.write();
  assert.throws(() => loadMonthlyEstimates({ ...f, preview: true }), /integrity/);
  fs.writeFileSync(path.join(f.directory, 'service-health.json'), '{"ok":false}');
  assert.throws(() => loadMonthlyEstimates({ ...f, preview: true }), /failed/);
});
