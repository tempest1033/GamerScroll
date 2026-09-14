"""Paired training-family jackknife after the accuracy decision is frozen.

This is a sensitivity study, not model selection or prospective validation.
Each fold removes one development family from fitting, candidate selection and
interval calibration, then compares unchanged target families under both models.
"""
from __future__ import annotations

import importlib.util
import json
import statistics
import time
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as run
from service_inputs import load_service_payloads


def main() -> None:
    start = time.perf_counter()
    baseline = run.ROOT / 'reports/rank-models/accuracy-hour-baseline-ptjbpbna/scripts/revenue-research/service_readiness.py'
    spec = importlib.util.spec_from_file_location('accuracy_baseline', baseline)
    old = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    current_candidates = run.candidates
    reserved = model.reserved_game
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    as_of = '2026-09-13'
    payloads, _ = load_service_payloads(as_of)
    _, names = fit.identity_families()
    run.configure('downloads')
    seed = json.loads((run.ROOT / run.REPORTS['downloads']).read_text(encoding='utf-8'))
    options = current_candidates('downloads', seed)
    prepared = run.prepare_indices(options, payloads, as_of)
    labels, _ = model.monthly_labels(raw, sources, set(names), 'downloads', '2026-09-01')
    training = model.training_rows(labels, prepared[0][run.index_key(options[0])], names,
                                   '2026-08', as_of='2026-09-01')
    families = sorted({row['family'] for row in training})
    code_hashes = run.hashes(run.MODEL_CODE + [
        run.MARKETS['downloads'], 'docs/research/anchors/identities.json'])
    folds = []
    for number, family in enumerate(families, 1):
        is_reserved = lambda name: reserved(name) or name == family
        pair = []
        with patch.object(model, 'reserved_game', side_effect=is_reserved), \
                patch.object(run, 'reserved_game', side_effect=is_reserved), \
                patch.object(run, 'prepare_indices', return_value=prepared), \
                patch.object(run, 'hashes', return_value=code_hashes):
            for factory in (old.candidates, current_candidates):
                with patch.object(run, 'candidates', side_effect=factory):
                    report, _, _ = run.evaluate_metric('downloads', raw, sources, payloads, names, as_of)
                pair.append({run.key(row): row for row in report['validation_rows']
                             if row['family'] != family and not reserved(row['family'])})
        common = {key for key in pair[0] if 'error_pct' in pair[0][key] and 'error_pct' in pair[1][key]}
        before = model.error_summary([pair[0][key] for key in common])
        after = model.error_summary([pair[1][key] for key in common])
        folds.append({'removed_training_family': family, 'common_rows': len(common),
                      'baseline_unavailable': sum('error_pct' not in row for row in pair[0].values()),
                      'proposed_unavailable': sum('error_pct' not in row for row in pair[1].values()),
                      'before': before, 'after': after})
        if number % 5 == 0:
            print(json.dumps({'completed_folds': number, 'total_folds': len(families)}), flush=True)
    result = {
        'kind': 'post_decision_training_family_sensitivity', 'production_enabled': False,
        'used_to_tune_model': False, 'reserved_family_outcomes_used': False,
        'same_final_ledger_for_both_models': True, 'folds': folds,
        'fold_count': len(folds), 'seconds': time.perf_counter() - start,
        'median_error_improved_folds': sum(row['after']['median_error_pct'] <
                                          row['before']['median_error_pct'] for row in folds),
        'tail_error_improved_folds': sum(row['after']['p90_error_pct'] <
                                        row['before']['p90_error_pct'] for row in folds),
        'mean_log_error_improved_folds': sum(row['after']['mae_log'] <
                                            row['before']['mae_log'] for row in folds),
        'median_of_paired_median_changes_pp': statistics.median(
            row['after']['median_error_pct'] - row['before']['median_error_pct'] for row in folds),
        'limitations': [
            'Overlapping jackknife folds are not independent experiments or confidence levels.',
            'This tests missing training-family sensitivity, not unknown future market conditions.',
            'No source amounts, production artifacts, model choices or release gates are changed.',
        ],
    }
    path = run.ROOT / 'reports/rank-models/accuracy-hour-stability-2026-09-13.json'
    model.write_atomic(path, result)
    print(json.dumps({key: value for key, value in result.items() if key not in ['folds', 'limitations']}),
          flush=True)


if __name__ == '__main__':
    main()
