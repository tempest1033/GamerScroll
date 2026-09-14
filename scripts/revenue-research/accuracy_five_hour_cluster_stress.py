"""Joint training-family reweighting for the already chosen download model.

This is not a bootstrap confidence interval for future accuracy. It perturbs
training evidence weights and excludes unsampled families from inner selection
and calibration. Calibration outcomes are never duplicated to inflate sample
counts. Evaluation keeps the fixed, original nonreserved target population.
The default is a short 10-draw screen; request a larger diagnostic explicitly.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from collections import Counter
from unittest.mock import patch

import numpy as np

import history_fit as fit
import service_model as model
import service_readiness as run
from accuracy_five_hour_experiments import options, trial_fit, trial_predict
from service_inputs import load_service_payloads


def compare(before, after, original_reserved, fixed_available):
    left = {run.key(row): row for row in before['validation_rows']
            if not original_reserved(row['family'])}
    right = {run.key(row): row for row in after['validation_rows']
             if not original_reserved(row['family'])}
    assert left.keys() == right.keys()
    common = sorted(key for key in left if 'error_pct' in left[key] and 'error_pct' in right[key])
    available = [key for key in common if key in fixed_available]
    return {
        'target_rows': len(left),
        'baseline_computable': sum('error_pct' in row for row in left.values()),
        'random_slope_computable': sum('error_pct' in row for row in right.values()),
        'common_before': model.error_summary([left[key] for key in common]),
        'common_after': model.error_summary([right[key] for key in common]),
        'fixed_available_before': model.error_summary([left[key] for key in available]),
        'fixed_available_after': model.error_summary([right[key] for key in available]),
        'available_before': sum(row['status'] == 'available' for row in left.values()),
        'available_after': sum(row['status'] == 'available' for row in right.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--draws', type=int, default=10)
    parser.add_argument('--seed', type=int, default=20260913)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.draws < 1:
        parser.error('--draws must be positive')
    started = time.perf_counter()
    as_of, metric = '2026-09-13', 'downloads'
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, history_paths = load_service_payloads(as_of)
    _, names = fit.identity_families()
    run.configure(metric)
    seed = json.loads((run.ROOT / run.REPORTS[metric]).read_text(encoding='utf-8'))
    prepared = run.prepare_indices(options(metric, seed, 'random_slopes_025'), payloads, as_of)
    labels, _ = model.monthly_labels(raw, sources, set(names), metric, as_of)
    reference = json.loads((run.ROOT / 'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    reference = next(item for item in reference['metrics'] if item['metric'] == metric)
    reserved = model.reserved_game
    families = sorted({row['family'] for row in labels if not reserved(row['family'])})
    fixed_available = {run.key(row) for row in reference['validation_rows']
                       if not reserved(row['family']) and row['status'] == 'available'}
    code_hashes = run.hashes(run.MODEL_CODE + [run.MARKETS[metric], 'docs/research/anchors/identities.json'])
    input_hashes = run.hashes([
        'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
        'scripts/revenue-research/accuracy_five_hour_experiments.py',
        'scripts/revenue-research/accuracy_five_hour_cluster_stress.py',
        *history_paths.values()])
    original_training = run.training_rows
    rng = np.random.default_rng(args.seed)
    results = []
    identity_check = None
    output = {
        'kind': 'post_decision_joint_training_family_stress',
        'completed': False,
        'production_enabled': False,
        'seed': args.seed, 'requested_draws': args.draws,
        'families': families, 'fixed_available_targets': len(fixed_available),
        'same_ledger_for_both_algorithms': True,
        'reserved_outcomes_used': False,
        'calibration_outcomes_duplicated': False,
        'input_hashes': input_hashes, 'code_hashes': code_hashes,
        'reference_report_sha256': model.digest(reference),
        'limitations': [
            'Fixed retrospective outcomes and overlapping training panels are not independent future trials.',
            'This is a training-composition stress distribution, not an accuracy confidence interval.',
            'Inner selection uses distinct available sampled families, not duplicated bootstrap outcome rows.',
            'Point-error summaries are conditional on computability; each draw records all target denominators.',
        ],
    }
    for draw in range(args.draws + 1):
        counts = (dict.fromkeys(families, 1) if draw == 0 else
                  dict(Counter(str(name) for name in rng.choice(families, size=len(families), replace=True))))
        is_reserved = lambda name: reserved(name) or counts.get(name, 0) == 0

        def weighted_training(*values, **kwargs):
            rows = original_training(*values, **kwargs)
            return [{**row, 'weight': row['weight'] * counts[row['family']]}
                    for row in rows if counts.get(row['family'], 0)]

        pair = []
        with patch.object(model, 'reserved_game', side_effect=is_reserved), \
                patch.object(run, 'reserved_game', side_effect=is_reserved), \
                patch.object(run, 'training_rows', side_effect=weighted_training), \
                patch.object(run, 'prepare_indices', return_value=prepared), \
                patch.object(run, 'hashes', return_value=code_hashes), \
                patch.object(run, 'fit_model', side_effect=trial_fit), \
                patch.object(fit, 'predict', side_effect=trial_predict):
            for hypothesis in ('baseline', 'random_slopes_025'):
                with patch.object(run, 'candidates', side_effect=lambda metric, seed: options(metric, seed, hypothesis)):
                    report, _, _ = run.evaluate_metric(metric, raw, sources, payloads, names, as_of)
                pair.append(report)
        if draw == 0:
            actual = {run.key(row): row for row in pair[1]['validation_rows']
                      if not reserved(row['family'])}
            checked = 0
            for expected in reference['validation_rows']:
                if reserved(expected['family']):
                    continue
                row = actual[run.key(expected)]
                assert row['status'] == expected['status']
                for field in ('estimate', 'lower', 'upper'):
                    assert (field in row) == (field in expected)
                    if field in expected:
                        assert math.isclose(row[field], expected[field], rel_tol=1e-8, abs_tol=1e-7)
                checked += 1
            identity_check = {'unit_family_weights_reproduce_service': True, 'checked_targets': checked}
            print(json.dumps(identity_check), flush=True)
        else:
            results.append({'draw': draw, 'training_family_counts': counts,
                            **compare(pair[0], pair[1], reserved, fixed_available)})
        if draw == 0 or draw % 10 == 0 or draw == args.draws:
            output.update({'completed_draws': draw, 'identity_check': identity_check, 'draws': results,
                           'seconds': time.perf_counter() - started})
            model.write_atomic(run.ROOT / args.output, output)
            if draw:
                print(json.dumps({'completed_draws': draw, 'requested_draws': args.draws,
                                  'seconds': output['seconds']}), flush=True)
    scores = {}
    for population in ('common', 'fixed_available'):
        valid = [row for row in results if row[population + '_before']['rows']]
        scores[population] = {
            measure: {
                'valid_draws': len(valid),
                'improved_draws': sum(row[population + '_after'][measure] <
                                      row[population + '_before'][measure] for row in valid),
                'median_paired_change': statistics.median(
                    row[population + '_after'][measure] - row[population + '_before'][measure] for row in valid),
            }
            for measure in ('median_error_pct', 'p90_error_pct', 'mae_log')}
    output.update({'completed': True, 'scores': scores, 'seconds': time.perf_counter() - started})
    model.write_atomic(run.ROOT / args.output, output)
    print(json.dumps({'completed': True, 'scores': scores, 'seconds': output['seconds']}), flush=True)


if __name__ == '__main__':
    main()
