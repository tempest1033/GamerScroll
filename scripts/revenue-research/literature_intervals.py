"""MAPIE and month-block interval diagnostics on unchanged service forecasts.

These are retrospective comparisons, not IID or time-series coverage guarantees.
No service model is fitted, no reserved family calibrates an interval, and the
public release policy is not relaxed.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

import numpy as np
from mapie.conformity_scores import AbsoluteConformityScore
from mapie.regression import SplitConformalRegressor
from sklearn.base import BaseEstimator, RegressorMixin

import history_fit as fit
import service_model as service
import service_readiness as replay
from literature_replay import BASELINE, preserve_experiment_sources

METHODS = ('service', 'mapie_symmetric', 'mapie_asymmetric', 'month_block_max')
PREDICTION_FIELDS = (
    'family', 'month', 'class', 'estimate', 'cohort', 'prior_months', 'out_of_domain',
    'rank_saturated', 'first_observed_month')


class StoredForecastRegressor(RegressorMixin, BaseEstimator):
    """Expose already-issued log forecasts to MAPIE; never learn from outcomes."""

    def fit(self, X, y=None):
        self.n_features_in_ = 1
        return self

    def predict(self, X):
        return np.asarray(X, dtype=float)[:, 0]


def prediction_from_row(row: dict) -> dict:
    if 'estimate' not in row:
        return {key: value for key, value in row.items()
                if key not in ('actual', 'available_on', 'source_id', 'error_pct',
                               'log_error', 'reserved_family')}
    return {**{key: row[key] for key in PREDICTION_FIELDS}, 'status': 'estimated'}


def calibration_pool(prediction: dict, past: list[dict]) -> list[dict]:
    return [row for row in past
            if row['month'] < prediction['month'] and row['cohort'] == prediction['cohort']]


def mapie_bounds(pool: list[dict], estimate: float, symmetric: bool) -> tuple[float, float]:
    x = np.log(np.asarray([row['estimate'] for row in pool])).reshape(-1, 1)
    y = np.log(np.asarray([row['actual'] for row in pool]))
    estimator = StoredForecastRegressor().fit(x)
    model = SplitConformalRegressor(
        estimator=estimator, confidence_level=service.POLICY['interval_coverage'],
        conformity_score=AbsoluteConformityScore(sym=symmetric), prefit=True)
    model.conformalize(x, y)
    point, bounds = model.predict_interval([[math.log(estimate)]])
    if not math.isclose(float(point[0]), math.log(estimate), abs_tol=1e-12):
        raise ValueError('MAPIE changed the stored point prediction')
    return math.exp(float(bounds[0, 0, 0])), math.exp(float(bounds[0, 1, 0]))


def interval(prediction: dict, past: list[dict], metric: str, method: str) -> dict:
    if method not in METHODS:
        raise ValueError(f'Unknown interval method: {method}')
    reference = service.interval(prediction, past, metric)
    if method == 'service':
        return reference
    # The shared policy remains the owner of eligibility. Only the interval
    # calculation changes; first-month, domain and evidence failures stay blocked.
    if reference['status'] != 'available' and reference.get('reason') != 'interval_too_wide':
        return reference
    pool = calibration_pool(prediction, past)
    if method == 'month_block_max':
        blocks = defaultdict(list)
        for row in pool:
            blocks[row['month']].append(abs(row['log_error']))
        scores = sorted(max(values) for values in blocks.values())
        rank = math.ceil((len(scores) + 1) * service.POLICY['interval_coverage'])
        if rank > len(scores):
            return {**prediction, 'status': 'withheld',
                    'reason': 'insufficient_independent_month_blocks',
                    'calibration_month_blocks': len(scores)}
        factor = math.exp(scores[rank - 1])
        lower, upper = prediction['estimate'] / factor, prediction['estimate'] * factor
    else:
        lower, upper = mapie_bounds(pool, prediction['estimate'], method == 'mapie_symmetric')
    if not (math.isfinite(lower) and math.isfinite(upper) and 0 < lower <= upper):
        raise ValueError('Interval bounds must be ordered, positive and finite')
    factor = max(prediction['estimate'] / lower, upper / prediction['estimate'])
    if factor > service.POLICY['max_interval_factor'][metric]:
        return {**prediction, 'status': 'withheld', 'reason': 'interval_too_wide',
                'interval_factor': factor}
    return {**prediction, 'status': 'available', 'lower': lower, 'upper': upper,
            'interval_factor': factor,
            'interval_nominal_coverage': service.POLICY['interval_coverage'],
            'calibration_rows': len(pool)}


def summary(rows: list[dict], previous: list[dict]) -> dict:
    original = {replay.key(row): row for row in previous}
    fixed = [row for row in rows if original[replay.key(row)]['status'] == 'available']
    available = [row for row in rows if row['status'] == 'available']
    common = [row for row in fixed if row['status'] == 'available']

    def describe(values):
        served = [row for row in values if row['status'] == 'available']
        return {
            'rows': len(values), 'available_rows': len(served),
            'interval_hits': sum(row['lower'] <= row['actual'] <= row['upper'] for row in served),
            'mean_log_width': statistics.fmean(
                math.log(row['upper'] / row['lower']) for row in served) if served else None}

    return {'all_targets': describe(rows), 'fixed_baseline_available': describe(fixed),
            'available': describe(available), 'shared_available': describe(common),
            'lost_available': [list(replay.key(row)) for row in fixed if row['status'] != 'available'],
            'gained_available': [list(replay.key(row)) for row in available
                                 if original[replay.key(row)]['status'] != 'available']}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default=BASELINE)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    baseline = json.loads((replay.ROOT / args.baseline).read_text(encoding='utf-8'))
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    _, names = fit.identity_families()
    record = {'kind': 'fixed_prediction_interval_diagnostic',
              'production_enabled': False, 'release_policy_changed': False,
              'baseline': args.baseline, 'methods_fixed_before_run': list(METHODS),
              'experiment_sources': preserve_experiment_sources([Path(__file__)]),
              'input_hashes': replay.hashes([
                  args.baseline, 'docs/research/anchors/anchors.jsonl',
                  'docs/research/anchors/sources.json', 'docs/research/anchors/identities.json']),
              'as_of': baseline['as_of'], 'execution_ok': False,
              'completed': False, 'results': [],
              'limitations': [
                  'Stored forecasts are not new model fits.',
                  'Changing models across rolling folds and panel dependence invalidate a simple IID guarantee.',
                  'Month-block scores require enough independent calibration blocks; rows are not blocks.',
                  'Static asymmetric MAPIE intervals are not EnbPI or adaptive conformal inference.',
                  'All development outputs and calibration exclude reserved families.']}
    output = replay.ROOT / args.output
    service.write_atomic(output, record, immutable=True)
    try:
        for report in baseline['metrics']:
            metric = report['metric']
            previous = [row for row in report['validation_rows'] if not row['reserved_family']]
            forecasts = {replay.key(row): prediction_from_row(row) for row in previous}
            results = {method: [] for method in METHODS}
            for month in sorted({row['month'] for row in previous}):
                cutoff = min(replay.next_month(month) + '-01', baseline['as_of'])
                vintage, _ = service.monthly_labels(raw, sources, set(names), metric, cutoff)
                past = replay.candidate_errors(forecasts, vintage, metric, month)
                for target in (row for row in previous if row['month'] == month):
                    prediction = forecasts[replay.key(target)]
                    for method in METHODS:
                        row = interval(prediction, past, metric, method)
                        for key in ('actual', 'available_on', 'source_id', 'error_pct', 'log_error'):
                            if key in target:
                                row[key] = target[key]
                        if row.get('estimate') != target.get('estimate'):
                            raise ValueError('Interval experiment changed a point estimate')
                        if method == 'service':
                            for field in ('status', 'reason', 'lower', 'upper', 'interval_factor'):
                                if row.get(field) != target.get(field):
                                    raise ValueError(f'Baseline interval reconstruction differs: {field}')
                        results[method].append(row)
            for method, rows in results.items():
                result = {'metric': metric, 'method': method,
                          **summary(rows, previous), 'assessment': service.assess(rows, metric),
                          'rows': rows}
                record['results'].append(result)
                print(json.dumps({key: result[key] for key in
                                  ('metric', 'method', 'all_targets', 'fixed_baseline_available')}),
                      flush=True)
            service.write_atomic(output, record)
        record.update(execution_ok=True, completed=True)
        service.write_atomic(output, record)
    except Exception as error:
        record.update(error_type=type(error).__name__, error=str(error))
        service.write_atomic(output, record)
        raise


if __name__ == '__main__':
    main()
