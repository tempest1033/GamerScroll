'use strict';
const { t } = require('../i18n');

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
  if (row.status !== 'available') return t('est.estimate_withheld');
  const fmt = (n, round) => round(n / 1e4).toLocaleString(require('../i18n').currentEdition().intl);
  const unit = metric === 'consumer_spend' ? t('est.10k_usd') : t('est.10k_downloads');
  // Round bounds outward; formatting must not narrow the measured interval.
  return `${fmt(row.lower, Math.floor)}~${fmt(row.upper, Math.ceil)}${unit}`;
}

function renderMonthlyEstimates(options = {}) {
  const data = loadMonthlyEstimates(options);
  if (!data) return '';
  return `<section class="rk-card" aria-label="${t('est.monthly_global_estimates')}">
<h2>${t('est.monthly_global_estimates_2', { p0: data.preview ? t('est.internal_preview') : '' })}</h2>
<p>${t('est.rank_based_estimates_not_actual', { p0: escape(data.asOf) })}
${t('est.revenue_is_in_app_spending')}
${t('est.ranges_are_90_target_intervals')}</p>
${data.preview ? t('est.not_yet_verified_do_not') : ''}
${data.metrics.map((m) => `<h3>${escape(m.month)} ${m.metric === 'consumer_spend' ? t('est.revenue') : t('est.downloads')}</h3>
<p>${t('est.games_shown', { length: m.rows.filter((r) => r.status === 'available').length, length2: m.rows.length })}</p>
<div class="rk-scroll"><table class="rk-table"><thead><tr><th>${t('est.game')}</th><th>${t('est.estimate_range')}</th></tr></thead><tbody>
${m.rows.map((row) => `<tr><td>${escape(row.family)}</td><td>${escape(formatRange(row, m.metric))}</td></tr>`).join('')}
</tbody></table></div>`).join('')}
</section>`;
}

module.exports = { loadMonthlyEstimates, renderMonthlyEstimates, formatRange };
