'use strict';

// Pure, currency-unit-preserving metrics for positive revenue benchmarks.
const assert = require('node:assert/strict');

function averageRanks(values) {
  const order = values.map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  for (let first = 0; first < order.length;) {
    let end = first + 1;
    while (end < order.length && order[end].value === order[first].value) end++;
    for (let i = first; i < end; i++) ranks[order[i].index] = (first + 1 + end) / 2;
    first = end;
  }
  return ranks;
}

function correlation(a, b) {
  const meanA = a.reduce((s, x) => s + x, 0) / a.length;
  const meanB = b.reduce((s, x) => s + x, 0) / b.length;
  let cross = 0, squareA = 0, squareB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    cross += da * db;
    squareA += da * da;
    squareB += db * db;
  }
  return squareA && squareB ? cross / Math.sqrt(squareA * squareB) : null;
}

function rankMetrics(reference, predictions) {
  assert(Array.isArray(reference) && Array.isArray(predictions));
  assert(reference.length > 0 && reference.length === predictions.length);
  assert(reference.every(Number.isFinite) && predictions.every(Number.isFinite));
  const n = reference.length;
  let concordant = 0, discordant = 0, referenceOnlyTies = 0;
  let predictionOnlyTies = 0, bothTies = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = Math.sign(reference[i] - reference[j]);
    const b = Math.sign(predictions[i] - predictions[j]);
    if (!a && !b) bothTies++;
    else if (!a) referenceOnlyTies++;
    else if (!b) predictionOnlyTies++;
    else if (a === b) concordant++;
    else discordant++;
  }
  const comparable = concordant + discordant;
  const tauDenominator = Math.sqrt((comparable + referenceOnlyTies)
    * (comparable + predictionOnlyTies));
  return {
    spearman: correlation(averageRanks(reference), averageRanks(predictions)),
    kendallTauB: tauDenominator ? (concordant - discordant) / tauDenominator : null,
    rankInversions: discordant,
    comparedPairs: n * (n - 1) / 2,
    concordantPairs: concordant,
    referenceOnlyTies, predictionOnlyTies, bothTies
  };
}

function revenueMetrics(reference, predictions) {
  const ranking = rankMetrics(reference, predictions);
  assert(reference.every(x => x > 0) && predictions.every(x => x > 0));
  const n = reference.length;
  let absolute = 0, square = 0, logSquare = 0, bias = 0;
  const ape = reference.map((actual, i) => {
    const error = predictions[i] - actual;
    absolute += Math.abs(error);
    square += error ** 2;
    logSquare += Math.log(predictions[i] / actual) ** 2;
    bias += error;
    return Math.abs(error / actual) * 100;
  }).sort((a, b) => a - b);
  const total = reference.reduce((s, x) => s + x, 0);
  return {
    sampleSize: n,
    mae: absolute / n,
    rmse: Math.sqrt(square / n),
    wapePercent: absolute / total * 100,
    mapePercent: ape.reduce((s, x) => s + x, 0) / n,
    medianAbsolutePercentError: (ape[Math.floor((n - 1) / 2)] + ape[Math.floor(n / 2)]) / 2,
    maxAbsolutePercentError: ape[n - 1],
    rmsLogError: Math.sqrt(logSquare / n),
    aggregateBiasPercent: bias / total * 100,
    ...ranking
  };
}

module.exports = { revenueMetrics, rankMetrics };
