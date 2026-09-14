'use strict';

const fs = require('node:fs');
const path = require('node:path');

function compareCharts(before, after) {
  const previous = new Map(before.orderedIds.map((id, index) => [id, index + 1]));
  const current = new Map(after.orderedIds.map((id, index) => [id, index + 1]));
  const common = [...current].filter(([id]) => previous.has(id));
  const movements = common.map(([id, rank]) => ({
    id, beforeRank: previous.get(id), afterRank: rank, delta: rank - previous.get(id),
  }));
  const topBefore = new Set(before.orderedIds.slice(0, 10));
  return {
    beforeObservedAt: before.observedAt,
    afterObservedAt: after.observedAt,
    observationGapMinutes: (Date.parse(after.observedAt) - Date.parse(before.observedAt)) / 60000,
    beforeDepth: before.orderedIds.length,
    afterDepth: after.orderedIds.length,
    identicalOrderedIds: before.orderedIdSha256 === after.orderedIdSha256,
    commonIds: common.length,
    movedCommonIds: movements.filter((row) => row.delta !== 0).length,
    absoluteRankMovementSum: movements.reduce((sum, row) => sum + Math.abs(row.delta), 0),
    maximumAbsoluteRankMovement: Math.max(0, ...movements.map((row) => Math.abs(row.delta))),
    topOneUnchanged: before.orderedIds[0] === after.orderedIds[0],
    topTenOverlap: after.orderedIds.slice(0, 10).filter((id) => topBefore.has(id)).length,
    newlyObservedIds: after.orderedIds.filter((id) => !previous.has(id)),
    noLongerObservedIds: before.orderedIds.filter((id) => !current.has(id)),
    movements: movements.filter((row) => row.delta !== 0),
  };
}

function summarize(manifest) {
  if (manifest.status === 'collecting' || !manifest.finishedAt) {
    throw new Error('Wait for the owned collection task to settle before summarizing');
  }
  const keys = manifest.protocol.countries.flatMap((country) => {
    const code = country.toLowerCase();
    return [`ios_${code}_grossing`, ...(code === 'cn' ? [] : [`aos_${code}_grossing`])];
  });
  const observations = manifest.samples.map((sample) => {
    const charts = new Map();
    for (const audit of sample.audits) {
      for (const chart of audit.charts.filter((row) => keys.includes(row.key))) {
        if (charts.has(chart.key)) throw new Error(`Ambiguous chart in sample ${sample.number}: ${chart.key}`);
        charts.set(chart.key, chart);
      }
    }
    return { sample, charts };
  });
  const chartSummaries = keys.map((key) => {
    const rows = observations.map(({ sample, charts }) => {
      const chart = charts.get(key);
      let reason = null;
      if (!chart) reason = 'no_current_chart';
      else if (chart.status !== 'ok') reason = 'chart_status_not_ok';
      else if (!chart.orderedIds?.length) reason = 'empty_chart';
      else if (chart.duplicateIdCount) reason = 'duplicate_ids';
      else if (!Number.isFinite(Date.parse(chart.observedAt))) reason = 'missing_observation_clock';
      return { sampleNumber: sample.number, chart, reason };
    });
    const consecutivePairs = [];
    const skippedPairs = [];
    for (let index = 1; index < rows.length; index++) {
      const before = rows[index - 1];
      const after = rows[index];
      let reason = before.reason || after.reason;
      if (!reason && Date.parse(after.chart.observedAt) <= Date.parse(before.chart.observedAt)) {
        reason = 'non_increasing_observation_clock';
      }
      const pair = { beforeSample: before.sampleNumber, afterSample: after.sampleNumber };
      if (reason) skippedPairs.push({ ...pair, reason });
      else consecutivePairs.push({ ...pair, ...compareCharts(before.chart, after.chart) });
    }
    const valid = rows.filter((row) => !row.reason);
    return {
      key,
      observedSamples: valid.length,
      distinctOrderedLists: new Set(valid.map((row) => row.chart.orderedIdSha256)).size,
      dictionaryMissingOccurrences: rows.reduce(
        (sum, row) => sum + (row.chart?.metadataAbsentFromResearchDictionary?.length || 0), 0),
      emptyTitleOccurrences: rows.reduce(
        (sum, row) => sum + (row.chart?.metadataTitleEmpty?.length || 0), 0),
      duplicateIdOccurrences: rows.reduce((sum, row) => sum + (row.chart?.duplicateIdCount || 0), 0),
      unavailable: rows.filter((row) => row.reason).map(({ sampleNumber, reason }) => ({ sampleNumber, reason })),
      consecutivePairs,
      skippedPairs,
    };
  });
  const pairs = chartSummaries.flatMap((chart) => chart.consecutivePairs);
  return {
    schemaVersion: 1,
    productionEnabled: false,
    monetaryTargetsUsed: false,
    refitted: false,
    collectionStatus: manifest.status,
    sampleCount: manifest.samples.length,
    expectedGrossingChartsPerSample: keys.length,
    validGrossingObservations: chartSummaries.reduce((sum, chart) => sum + chart.observedSamples, 0),
    comparableConsecutivePairs: pairs.length,
    identicalConsecutivePairs: pairs.filter((pair) => pair.identicalOrderedIds).length,
    changedConsecutivePairs: pairs.filter((pair) => !pair.identicalOrderedIds).length,
    chartSummaries,
    limitations: [
      'Grossing only; incidental free charts are excluded from this summary.',
      'Newly/no-longer observed IDs are censored at each returned chart depth, not assigned rank 201 or zero revenue.',
      'Movement is computed only for IDs present in both consecutive successful observations; failed samples break the comparison.',
      'Distinct ordered lists and repeated fetches are not statistically independent revenue observations.',
      'Collector observation times do not establish the stores internal refresh times or changes between observations.',
      'Metadata absence refers to the isolated dictionary, not proven per-request lookup failure.',
      'No monetary label, coefficient selection, amount error or prediction-accuracy estimate is produced.',
    ],
  };
}

if (require.main === module) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) throw new Error('Usage: node prospective-rank-summary.js <settled-manifest.json> <output.json>');
  const result = summarize(JSON.parse(fs.readFileSync(input, 'utf8')));
  result.sourceManifest = path.relative(process.cwd(), input).replaceAll('\\', '/');
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    output, sampleCount: result.sampleCount,
    validGrossingObservations: result.validGrossingObservations,
    comparableConsecutivePairs: result.comparableConsecutivePairs,
    identicalConsecutivePairs: result.identicalConsecutivePairs,
    changedConsecutivePairs: result.changedConsecutivePairs,
  }));
}

module.exports = { summarize };
