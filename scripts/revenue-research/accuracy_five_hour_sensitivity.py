"""Paired development-family removal for a fixed random-slope hypothesis.

This is a dependence/leverage diagnostic, not independent validation. Reserved
outcomes remain excluded from fitting, selection, and the reported comparisons.
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as run
from accuracy_five_hour_experiments import comparison, options, trial_fit, trial_predict
from service_inputs import load_service_payloads


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hypothesis', default='random_slopes_025')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    metric, as_of = 'downloads', '2026-09-13'
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(as_of)
    _, names = fit.identity_families()
    run.configure(metric)
    seed = json.loads((run.ROOT / run.REPORTS[metric]).read_text(encoding='utf-8'))
    prepared = run.prepare_indices(options(metric, seed, args.hypothesis), payloads, as_of)
    labels, _ = model.monthly_labels(raw, sources, set(names), metric, '2026-09-01')
    index = prepared[0][run.index_key(options(metric, seed, 'baseline')[0])]
    training = model.training_rows(labels, index, names, '2026-08', as_of='2026-09-01')
    families = sorted({row['family'] for row in training})
    reserved = model.reserved_game
    hashes = run.hashes(run.MODEL_CODE + [run.MARKETS[metric], 'docs/research/anchors/identities.json'])
    results = []
    for family in families:
        is_reserved = lambda name: reserved(name) or name == family
        pair = []
        with patch.object(model, 'reserved_game', side_effect=is_reserved), \
                patch.object(run, 'reserved_game', side_effect=is_reserved), \
                patch.object(run, 'prepare_indices', return_value=prepared), \
                patch.object(run, 'hashes', return_value=hashes), \
                patch.object(run, 'fit_model', side_effect=trial_fit), \
                patch.object(fit, 'predict', side_effect=trial_predict):
            for hypothesis in ('baseline', args.hypothesis):
                with patch.object(run, 'candidates', side_effect=lambda metric, seed: options(metric, seed, hypothesis)):
                    report, _, _ = run.evaluate_metric(metric, raw, sources, payloads, names, as_of)
                pair.append(report)
        summary = comparison(pair[1], pair[0])
        results.append({
            'removed_training_family': family,
            **{key: summary[key] for key in [
                'common_before', 'common_after', 'fixed_available_before',
                'fixed_available_after', 'available_nonreserved_rows']},
        })
        if len(results) % 5 == 0:
            print(json.dumps({'completed': len(results), 'total': len(families)}), flush=True)
    scores = {}
    for measure in ['median_error_pct', 'p90_error_pct', 'mae_log']:
        scores[measure] = {
            'all_improved_folds': sum(row['common_after'][measure] < row['common_before'][measure] for row in results),
            'fixed_available_improved_folds': sum(
                row['fixed_available_after'][measure] < row['fixed_available_before'][measure] for row in results),
            'median_all_change': statistics.median(
                row['common_after'][measure] - row['common_before'][measure] for row in results),
            'median_fixed_available_change': statistics.median(
                row['fixed_available_after'][measure] - row['fixed_available_before'][measure] for row in results),
        }
    result = {
        'kind': 'development_training_family_sensitivity',
        'hypothesis_fixed_before_run': args.hypothesis,
        'reserved_outcomes_used': False,
        'production_enabled': False,
        'same_ledger_for_both_algorithms': True,
        'fold_count': len(results),
        'scores': scores,
        'folds': results,
        'seconds': time.perf_counter() - started,
        'limitations': [
            'Overlapping folds are not independent experiments or confidence levels.',
            'This evaluates training-family sensitivity, not future market changes.',
        ],
    }
    model.write_atomic(run.ROOT / args.output, result)
    print(json.dumps({key: result[key] for key in ['fold_count', 'scores', 'seconds']}), flush=True)


if __name__ == '__main__':
    main()
