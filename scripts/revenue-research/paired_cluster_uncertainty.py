"""Conditional paired uncertainty of fixed predictions; never fit or select models.

Resample game families, calendar months, or both independently. The two-way
case multiplies the integer cluster multiplicities for each observed row.
These descriptive percentiles do not establish prospective accuracy or cover
model selection, source selection, serial month dependence, or missing labels.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

import service_model as model
import service_readiness as run

BEFORE = 'reports/rank-models/accuracy-five-hour-revision-counterfactual-2026-09-13.json'
AFTER = 'reports/rank-models/service-readiness.json'


def prepare_statistics(rows):
    errors = np.array([row['error_pct'] for row in rows])
    order = np.argsort(errors)
    return errors[order], order, np.array([abs(row['log_error']) for row in rows])


def weighted_statistics(prepared, weights):
    values, order, absolute_logs = prepared
    size = int(weights.sum())
    if size <= 0:
        raise ValueError('No sampled observations')
    cumulative = np.cumsum(weights[order])
    positions = [(size - 1) // 2, size // 2, math.ceil(size * 0.9) - 1]
    selected = values[np.searchsorted(cumulative, positions, side='right')]
    return np.array([(selected[0] + selected[1]) / 2, selected[2],
                     np.dot(absolute_logs, weights) / size])


def resample(before, after, mode, draws, rng):
    families = sorted({row['family'] for row in after})
    months = sorted({row['month'] for row in after})
    family_index = np.array([families.index(row['family']) for row in after])
    month_index = np.array([months.index(row['month']) for row in after])
    previous, current = prepare_statistics(before), prepare_statistics(after)
    changes = []
    for _ in range(draws):
        family_weights = (rng.multinomial(len(families), np.full(len(families), 1 / len(families)))
                          if mode in ('families', 'families_and_months') else np.ones(len(families), dtype=int))
        month_weights = (rng.multinomial(len(months), np.full(len(months), 1 / len(months)))
                         if mode in ('months', 'families_and_months') else np.ones(len(months), dtype=int))
        weights = family_weights[family_index] * month_weights[month_index]
        if weights.sum():
            changes.append(weighted_statistics(current, weights) - weighted_statistics(previous, weights))
    if not changes:
        raise ValueError('Every cluster draw was empty')
    changes = np.array(changes)
    summaries = {}
    for column, name in enumerate(('median_error_percentage_points', 'p90_error_percentage_points', 'mae_log')):
        values = changes[:, column]
        summaries[name] = {
            'percentiles_2_5_50_97_5': np.quantile(values, [0.025, 0.5, 0.975]).tolist(),
            'fraction_of_draws_improved': float(np.mean(values < 0)),
        }
    return {'mode': mode, 'requested_draws': draws, 'valid_draws': len(changes),
            'empty_draws': draws - len(changes), 'paired_change_after_minus_before': summaries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--draws', type=int, default=2000)
    parser.add_argument('--seed', type=int, default=20260913)
    parser.add_argument('--output', default='reports/rank-models/accuracy-five-hour-paired-clusters-2026-09-13.json')
    args = parser.parse_args()
    if args.draws < 1:
        parser.error('--draws must be positive')
    old_report = json.loads((run.ROOT / BEFORE).read_text(encoding='utf-8'))
    reference = next(row for row in old_report['results'] if row['hypothesis'] == 'baseline')
    old = {run.key(row): row for row in reference['nonreserved_rows'] if 'error_pct' in row}
    current = json.loads((run.ROOT / AFTER).read_text(encoding='utf-8'))
    metric = next(row for row in current['metrics'] if row['metric'] == 'downloads')
    new = {run.key(row): row for row in metric['validation_rows']
           if not row['reserved_family'] and 'error_pct' in row}
    assert old.keys() == new.keys(), 'Paired population changed; do not silently discard targets'
    for key, row in old.items():
        assert row['actual'] == new[key]['actual']
        assert row['source_id'] == new[key]['source_id']
        assert row['available_on'] == new[key]['available_on']
    rng = np.random.default_rng(args.seed)
    results = []
    for cohort in ('all_development', 'fixed_current_available'):
        keys = [key for key in sorted(new) if cohort == 'all_development' or new[key]['status'] == 'available']
        before, after = [old[key] for key in keys], [new[key] for key in keys]
        unit_weights = np.ones(len(keys), dtype=int)
        for rows in (before, after):
            expected = model.error_summary(rows)
            actual = weighted_statistics(prepare_statistics(rows), unit_weights)
            np.testing.assert_allclose(actual, [
                expected['median_error_pct'], expected['p90_error_pct'], expected['mae_log']])
        result = {'cohort': cohort, 'before': model.error_summary(before), 'after': model.error_summary(after),
                  'resampling': []}
        for mode in ('families', 'months', 'families_and_months'):
            summary = resample(before, after, mode, args.draws, rng)
            result['resampling'].append(summary)
            print(json.dumps({'cohort': cohort, **summary}), flush=True)
        results.append(result)
    report = {
        'ok': True, 'kind': 'fixed_prediction_paired_cluster_diagnostic',
        'production_enabled': False, 'reserved_outcomes_used': False,
        'models_refitted_or_selected': False, 'seed': args.seed, 'results': results,
        'source_hashes': {name: hashlib.sha256((run.ROOT / name).read_bytes()).hexdigest()
                          for name in (BEFORE, AFTER)},
        'limitations': [
            'Conditional retrospective descriptive ranges, not independent holdout evidence.',
            'Only five observed months overall and two available-row months; month uncertainty is thin.',
            'Does not cover model/source selection, serial month dependence, unobserved games or future shocks.',
            'Availability membership is fixed to the current model, not resampled or recalibrated.',
            'Fractions of improved draws are not probabilities of future improvement.',
        ],
    }
    model.write_atomic(run.ROOT / args.output, report)


if __name__ == '__main__':
    main()
