"""Frozen download kernel-ridge sensitivity, with evaluation targets retained.

Family removal affects training only. Publication removal affects training,
candidate selection and interval calibration, collapsing reprints and classes
by provider/family/month. Neither perturbation changes evaluation target values.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as replay
import target_diverse_models as diverse
from service_inputs import load_service_payloads
from target_accuracy_sensitivity import fixed_summary

BASE_TRAINING = replay.training_rows
BASE_ERRORS = replay.candidate_errors


def publication_periods(rows: list[dict], sources: dict, url: str) -> set[tuple]:
    return {(row['family'], row['month']) for row in rows
            if sources[row['source_id']]['url'] == url}


def without_periods(rows: list[dict], excluded: set[tuple]) -> list[dict]:
    return [row for row in rows if (row['family'], row['month']) not in excluded]


def training_support(raw: list[dict], sources: dict, names: list[str],
                     prepared: tuple, as_of: str) -> list[dict]:
    truth, _ = model.monthly_labels(raw, sources, set(names), 'downloads', as_of)
    support = {}
    for month in sorted({row['month'] for row in truth}):
        cutoff = min(model.next_month(month) + '-01', as_of)
        vintage, _ = model.monthly_labels(raw, sources, set(names), 'downloads', cutoff)
        for index in prepared[0].values():
            for row in BASE_TRAINING(vintage, index, names, month, as_of=cutoff):
                support[(row['family'], row['month'], row['class'], row['source_id'])] = row
    return list(support.values())


def summarize_changes(folds: list[dict], population: str) -> dict:
    summaries = {}
    for field in ('median_error_pct', 'p90_error_pct', 'max_error_pct', 'mae_log'):
        values = [
            row['after'][population]['error'][field] - row['before'][population]['error'][field]
            for row in folds if not row['after'][population]['missing']
            and not row['before'][population]['missing']
        ]
        summaries[field] = {
            'comparable_folds': len(values), 'improved': sum(value < -1e-10 for value in values),
            'worsened': sum(value > 1e-10 for value in values),
            'unchanged': sum(abs(value) <= 1e-10 for value in values),
            'best_change': min(values) if values else None,
            'worst_change': max(values) if values else None,
        }
    return summaries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    baseline = json.loads((replay.ROOT / args.baseline /
                           'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    metric = 'downloads'
    reference = next(row for row in baseline['metrics'] if row['metric'] == metric)
    fixed = [replay.key(row) for row in reference['validation_rows'] if row['status'] == 'available']
    all_keys = [replay.key(row) for row in reference['validation_rows']
                if not row['reserved_family'] and 'error_pct' in row]
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    replay.configure(metric)
    seed = json.loads((replay.ROOT / replay.REPORTS[metric]).read_text(encoding='utf-8'))
    prepared = replay.prepare_indices(diverse.BASE_OPTIONS(metric, seed), payloads, baseline['as_of'])
    support = training_support(raw, sources, names, prepared, baseline['as_of'])
    scenarios = [{'kind': 'training_family', 'family': family}
                 for family in sorted({row['family'] for row in support})]
    scenarios += [{'kind': 'publication_block', 'url': url}
                  for url in sorted({sources[row['source_id']]['url'] for row in support})]
    result = {
        'kind': 'download_kernel_ridge_sensitivity', 'baseline': args.baseline,
        'created_at': datetime.now(timezone.utc).isoformat(), 'as_of': baseline['as_of'],
        'method_frozen_before_review': 'kernel_ridge', 'representation': 'residual',
        'production_enabled': False, 'independent_validation': False,
        'evaluation_targets_retained': True, 'scenarios_fixed_before_run': scenarios,
        'source_hashes': replay.hashes([
            'scripts/revenue-research/target_kernel_sensitivity.py',
            'scripts/revenue-research/target_diverse_models.py',
            'scripts/revenue-research/target_accuracy_sensitivity.py',
            'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
            *replay.inference_input_paths(metric)]),
        'folds': [], 'failures': [],
    }
    for scenario in scenarios:
        try:
            excluded = (publication_periods(support, sources, scenario['url'])
                        if scenario['kind'] == 'publication_block' else set())

            def filtered_training(*a, **kw):
                rows = BASE_TRAINING(*a, **kw)
                return (without_periods(rows, excluded) if excluded else
                        [row for row in rows if row['family'] != scenario['family']])

            def filtered_errors(*a, **kw):
                rows = BASE_ERRORS(*a, **kw)
                return without_periods(rows, excluded)

            with patch.object(replay, 'prepare_indices', return_value=prepared), \
                    patch.object(replay, 'training_rows', side_effect=filtered_training), \
                    patch.object(replay, 'candidate_errors', side_effect=filtered_errors):
                control, _, _ = replay.evaluate_metric(
                    metric, raw, sources, payloads, names, baseline['as_of'])
                with patch.object(replay, 'candidates', side_effect=lambda metric, seed:
                                  diverse.options(metric, seed, 'kernel_ridge', 'residual')), \
                        patch.object(replay, 'fit_model', side_effect=diverse.fit_model), \
                        patch.object(fit, 'predict', side_effect=diverse.predict):
                    trial, _, _ = replay.evaluate_metric(
                        metric, raw, sources, payloads, names, baseline['as_of'])
            expected_keys = {replay.key(row) for row in reference['validation_rows']}
            if any({replay.key(row) for row in report['validation_rows']} != expected_keys
                   for report in (control, trial)):
                raise ValueError('Perturbation changed evaluation population')
            pair = [
                {'fixed_available': fixed_summary(report, fixed), 'fixed_all': fixed_summary(report, all_keys),
                 'rows': [row for row in report['validation_rows'] if replay.key(row) in set(all_keys)]}
                for report in (control, trial)]
            result['folds'].append({
                **scenario, 'excluded_family_months': [list(key) for key in sorted(excluded)],
                'before': pair[0], 'after': pair[1],
            })
        except Exception as error:
            result['failures'].append({**scenario, 'error_type': type(error).__name__, 'error': str(error)})
        completed = len(result['folds']) + len(result['failures'])
        if completed % 10 == 0:
            print(json.dumps({'completed': completed, 'total': len(scenarios),
                              'failed': len(result['failures'])}), flush=True)
    result['summary'] = {
        kind: {population: summarize_changes(
            [row for row in result['folds'] if row['kind'] == kind], population)
               for population in ('fixed_available', 'fixed_all')}
        for kind in ('training_family', 'publication_block')
    }
    result['execution_ok'] = not result['failures']
    model.write_atomic(replay.ROOT / args.output, result, immutable=True)
    print(json.dumps({'execution_ok': result['execution_ok'], 'folds': len(result['folds']),
                      'failures': result['failures'], 'summary': result['summary']}), flush=True)
    if result['failures']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
