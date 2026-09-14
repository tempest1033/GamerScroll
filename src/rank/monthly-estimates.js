'use strict';

// Service data adapter. Public rendering is opt-in AND requires every gate.
// The private preview never upgrades a research artifact into public evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const escape = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

function loadMonthlyEstimates({ directory = path.join(ROOT, 'reports/rank-models'),
  preview = false, enabled = process.env.GAMERSCROLL_MONTHLY_ESTIMATES === '1',
  now = new Date() } = {}) {
  if (!preview && !enabled) return null;
  const health = JSON.parse(fs.readFileSync(path.join(directory, 'service-health.json'), 'utf8'));
  if (health.ok !== true) throw new Error('Monthly estimate refresh failed; last-good data is not a fresh result');
  let generationDirectory = directory;
  const pointer = path.join(directory, 'service-current.json');
  let current;
  if (fs.existsSync(pointer)) {
    current = JSON.parse(fs.readFileSync(pointer, 'utf8'));
    if (current.schema_version !== 1 || !/^service-runs\/[a-f0-9]{24}$/.test(current.generation)) {
      throw new Error('Invalid monthly estimate generation');
    }
    generationDirectory = path.join(directory, current.generation);
  }
  const reportBytes = fs.readFileSync(path.join(generationDirectory, 'service-readiness.json'));
  const readiness = JSON.parse(reportBytes);
  const data = JSON.parse(fs.readFileSync(path.join(generationDirectory, 'service-preview.json'), 'utf8'));
  const sha = crypto.createHash('sha256').update(reportBytes).digest('hex');
  if (data.schema_version !== 1 || readiness.schema_version !== 1 || data.readiness_sha256 !== sha ||
      current && current.readiness_sha256 !== sha) {
    throw new Error('Monthly estimate artifact integrity mismatch');
  }
  if (health.as_of !== data.as_of || readiness.as_of !== data.as_of) {
    throw new Error('Monthly estimate snapshot dates differ');
  }
  const age = (now - new Date(`${data.as_of}T00:00:00+09:00`)) / 86400000;
  if (!Number.isFinite(age) || age < -1 || age > 3) throw new Error('Monthly estimate artifact is stale');
  if (!preview && (data.kind !== 'validated_monthly_estimates' ||
      data.production_enabled !== true || data.release_ready !== true ||
      readiness.release_ready !== true || !readiness.metrics?.length ||
      readiness.metrics.some((m) => m.assessment?.release_ready !== true ||
        !Object.keys(m.assessment.gates || {}).length || Object.values(m.assessment.gates).some((v) => v !== true)))) {
    return null;
  }
  const seenMetrics = new Set();
  const metrics = data.metrics.map((metric) => {
    if (!['consumer_spend', 'downloads'].includes(metric.metric) || seenMetrics.has(metric.metric) ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(metric.month)) throw new Error('Invalid monthly estimate scope');
    seenMetrics.add(metric.metric);
    const seenFamilies = new Set();
    const rows = metric.rows.map((row) => {
      if (!row.family || seenFamilies.has(row.family) || row.month !== metric.month ||
          !['available', 'unavailable', 'withheld'].includes(row.status)) {
        throw new Error('Invalid or duplicate monthly estimate row');
      }
      seenFamilies.add(row.family);
      if (row.status !== 'available') return { family: row.family, status: row.status, reason: row.reason };
      const expectedClass = metric.metric === 'consumer_spend' ? 'gross' : 'downloads';
      if (row.class !== expectedClass || ![row.lower, row.estimate, row.upper].every(Number.isFinite) ||
          row.lower <= 0 || row.lower > row.estimate || row.upper < row.estimate) {
        throw new Error('Invalid monthly estimate interval or unit');
      }
      return { family: row.family, status: row.status, lower: row.lower, upper: row.upper,
        estimate: row.estimate, interval_nominal_coverage: row.interval_nominal_coverage };
    });
    return { metric: metric.metric, month: metric.month, rows };
  });
  return { asOf: data.as_of, preview, metrics };
}

function formatRange(row, metric) {
  if (row.status !== 'available') return '추정 보류';
  const fmt = (n, round) => round(n / 1e4).toLocaleString('ko-KR');
  const unit = metric === 'consumer_spend' ? '만 달러' : '만 회';
  // Round bounds outward; formatting must not narrow the measured interval.
  return `${fmt(row.lower, Math.floor)}~${fmt(row.upper, Math.ceil)}${unit}`;
}

function renderMonthlyEstimates(options = {}) {
  const data = loadMonthlyEstimates(options);
  if (!data) return '';
  return `<section class="rk-card" aria-label="월간 글로벌 추정">
<h2>월간 글로벌 추정${data.preview ? ' · 내부 미리보기' : ''}</h2>
<p>순위 기반 추정치이며 실제 매출·설치 집계가 아닙니다. 기준일 ${escape(data.asOf)}.
매출은 App Store·Google Play의 수수료 차감 전 인앱 결제액이며 광고·웹 상점·대체 마켓은 제외합니다.
범위는 과거 오차로 보정한 90% 목표 구간이며 개별 게임의 정확도를 보장하지 않습니다.</p>
${data.preview ? '<p><strong>검증 미완료 · 공개 금지. 이미 알려진 달을 재계산한 미리보기이며 독립 검증 결과가 아닙니다.</strong></p>' : ''}
${data.metrics.map((m) => `<h3>${escape(m.month)} ${m.metric === 'consumer_spend' ? '매출' : '다운로드'}</h3>
<p>표시 가능 ${m.rows.filter((r) => r.status === 'available').length}/${m.rows.length}개 게임</p>
<div class="rk-scroll"><table class="rk-table"><thead><tr><th>게임</th><th>추정 범위</th></tr></thead><tbody>
${m.rows.map((row) => `<tr><td>${escape(row.family)}</td><td>${escape(formatRange(row, m.metric))}</td></tr>`).join('')}
</tbody></table></div>`).join('')}
</section>`;
}

module.exports = { loadMonthlyEstimates, renderMonthlyEstimates, formatRange };
