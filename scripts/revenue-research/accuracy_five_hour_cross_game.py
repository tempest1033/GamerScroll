"""Development-only separation of cross-game and temporal coefficient penalties.

The current candidate pool and warmup order remain available. A scaled design
column changes only the log-index penalty; the fitted model is converted back
to the ordinary inference representation. No game-specific correction or
reserved outcome is used to select an experiment.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import statistics
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as run
from accuracy_five_hour_experiments import comparison
from service_inputs import load_service_payloads

ORIGINAL_CANDIDATES = run.candidates
ORIGINAL_FIT = model.fit_model
SCALED_FEATURE = '__cross_game_log_index'


class CrossGameFit:
    def __init__(self):
        self.prepared = {}
        self.cache_hits = 0

    def __call__(self, rows, candidate):
        penalty = candidate.get('cross_index_lambda')
        if penalty is None or not rows:
            return ORIGINAL_FIT(rows, candidate)
        scale = math.sqrt(candidate['feature_lambda'] / penalty)
        key = id(rows), scale
        if key not in self.prepared:
            centre = statistics.fmean(row['features']['log_index'] for row in rows)
            transformed = [
                {**row, 'features': {**row['features'],
                                    SCALED_FEATURE: (row['features']['log_index'] - centre) * scale}}
                for row in rows]
            domain = [min(row['features']['log_index'] for row in rows),
                      max(row['features']['log_index'] for row in rows)]
            # Keep the original object alive so Python cannot reuse this id.
            self.prepared[key] = rows, transformed, centre, domain
        else:
            self.cache_hits += 1
        _, transformed, centre, domain = self.prepared[key]
        augmented = {k: v for k, v in candidate.items() if k != 'cross_index_lambda'}
        augmented['features'] = [SCALED_FEATURE if name == 'log_index' else name
                                 for name in candidate['features']]
        fitted = ORIGINAL_FIT(transformed, augmented)
        if fitted is None:
            return None
        coefficients = fitted['beta']
        coefficients['log_index'] = coefficients.pop(SCALED_FEATURE) * scale
        fitted['beta'] = {name: coefficients[name] for name in candidate['features']}
        fitted['feature_names'] = list(candidate['features'])
        fitted['centre'] = centre
        fitted['feature_domain'].pop(SCALED_FEATURE)
        fitted['feature_domain']['log_index'] = domain
        fitted['feature_penalties'] = {'log_index': penalty}
        return fitted


def candidates(metric, seed, penalty):
    current = ORIGINAL_CANDIDATES(metric, seed)
    added = []
    for original in current:
        if 'log_index' not in original['features']:
            continue
        item = copy.deepcopy(original)
        item.pop('id')
        item['cross_index_lambda'] = penalty
        item['id'] = model.digest(item)[:16]
        added.append(item)
    return current + added


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--penalties', nargs='+', type=float, default=[0.1, 1.0])
    parser.add_argument('--baseline', default='reports/rank-models/service-readiness.json')
    parser.add_argument('--output', default='reports/rank-models/accuracy-five-hour-cross-game-2026-09-13.json')
    args = parser.parse_args()
    if not all(math.isfinite(p) and p > 0 for p in args.penalties):
        parser.error('Penalties must be positive and finite')
    baseline_path = run.ROOT / args.baseline
    baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
    as_of = baseline['as_of']
    reference = next(item for item in baseline['metrics'] if item['metric'] == 'downloads')
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(as_of)
    _, names = fit.identity_families()
    results = []
    output = {
        'kind': 'nonreserved_cross_game_penalty_diagnostic',
        'production_enabled': False, 'reserved_outcomes_used_for_selection': False,
        'as_of': as_of, 'baseline': args.baseline,
        'baseline_sha256': hashlib.sha256(baseline_path.read_bytes()).hexdigest(),
        'penalties_fixed_before_run': args.penalties, 'completed': False, 'results': results,
        'decision_rule': {
            'require_nonworse': [
                'common median/p90/mean absolute log error',
                'fixed-current-available median/p90/mean absolute log error',
                'cold-start median/p90/mean absolute log error',
                'available development row count',
            ],
            'floating_comparison_tolerance': 1e-10,
            'require_strict_improvement': 'cold-start median/p90 or fixed-available median',
        },
        'limitations': [
            'Repeated retrospective development, not fresh independent validation.',
            'No production model or release threshold is changed by this script.',
            'A candidate passing the screen still requires separate verification before adoption.',
        ],
    }
    baseline_rows = {run.key(row): row for row in reference['validation_rows']
                     if not row['reserved_family'] and 'error_pct' in row}
    for penalty in args.penalties:
        fitter = CrossGameFit()
        with patch.object(run, 'candidates', side_effect=lambda metric, seed: candidates(metric, seed, penalty)), \
                patch.object(run, 'fit_model', side_effect=fitter):
            report, _, _ = run.evaluate_metric('downloads', raw, sources, payloads, names, as_of)
        summary = comparison(report, reference)
        current_rows = {run.key(row): row for row in summary['nonreserved_rows'] if 'error_pct' in row}
        assert current_rows.keys() == baseline_rows.keys(), 'Changed computable development population'
        cold_keys = [key for key, row in baseline_rows.items() if row['prior_months'] == 0]
        cold_before = model.error_summary([baseline_rows[key] for key in cold_keys])
        cold_after = model.error_summary([current_rows[key] for key in cold_keys])
        pairs = [
            (summary['common_before'], summary['common_after']),
            (summary['fixed_available_before'], summary['fixed_available_after']),
            (cold_before, cold_after),
        ]
        passes = all(after[name] <= before[name] + 1e-10 for before, after in pairs
                     for name in ('median_error_pct', 'p90_error_pct', 'mae_log'))
        passes = passes and summary['available_nonreserved_rows'] >= sum(
            row['status'] == 'available' for row in baseline_rows.values())
        passes = passes and (
            cold_after['median_error_pct'] < cold_before['median_error_pct'] - 1e-10
            or cold_after['p90_error_pct'] < cold_before['p90_error_pct'] - 1e-10
            or summary['fixed_available_after']['median_error_pct']
            < summary['fixed_available_before']['median_error_pct'] - 1e-10)
        result = {
            'cross_index_lambda': penalty, **summary,
            'cold_start_before': cold_before, 'cold_start_after': cold_after,
            'passes_screen': passes, 'prepared_panels': len(fitter.prepared), 'cache_hits': fitter.cache_hits,
            'seconds': report['seconds'],
        }
        results.append(result)
        model.write_atomic(run.ROOT / args.output, output)
        print(json.dumps({k: result[k] for k in [
            'cross_index_lambda', 'common_after', 'fixed_available_after', 'cold_start_after',
            'passes_screen', 'prepared_panels', 'cache_hits', 'seconds']}), flush=True)
    output['completed'] = True
    model.write_atomic(run.ROOT / args.output, output)


if __name__ == '__main__':
    main()
