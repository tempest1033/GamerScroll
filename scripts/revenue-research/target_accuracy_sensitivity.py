"""Leave-one-training-family-out review of the frozen revenue target objective.

Evaluation, selection and calibration populations are retained. Only model
training loses a family. Overlapping perturbations are not independent trials.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as replay
from service_inputs import load_service_payloads
from target_accuracy_selection import choose

BASE_TRAINING = replay.training_rows


def fixed_summary(report: dict, keys: list[tuple]) -> dict:
    rows = {replay.key(row): row for row in report['validation_rows']}
    missing = [key for key in keys if 'error_pct' not in rows[key]]
    return {
        'missing': [list(key) for key in missing],
        'unavailable': [list(key) for key in keys if rows[key]['status'] != 'available'],
        'error': model.error_summary([rows[key] for key in keys if key not in missing]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    baseline = json.loads((replay.ROOT / args.baseline /
                           'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    metric = 'consumer_spend'
    reference = next(row for row in baseline['metrics'] if row['metric'] == metric)
    fixed_keys = [replay.key(row) for row in reference['validation_rows'] if row['status'] == 'available']
    all_keys = [replay.key(row) for row in reference['validation_rows']
                if 'error_pct' in row and not row['reserved_family']]
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    replay.configure(metric)
    seed = json.loads((replay.ROOT / replay.REPORTS[metric]).read_text(encoding='utf-8'))
    prepared = replay.prepare_indices(replay.candidates(metric, seed), payloads, baseline['as_of'])
    labels, _ = model.monthly_labels(raw, sources, set(names), metric, baseline['as_of'])
    families = sorted({row['family'] for row in labels
                       if row['month'] < '2026-08' and not model.reserved_game(row['family'])})
    results = []
    output = {
        'kind': 'target_5_20_training_family_sensitivity',
        'metric': metric, 'mode_frozen_before_review': 'target_max',
        'baseline': args.baseline, 'created_at': datetime.now(timezone.utc).isoformat(),
        'production_enabled': False, 'independent_validation': False, 'folds': results,
        'evaluation_and_selection_and_calibration_targets_retained': True,
        'source_hashes': replay.hashes([
            'scripts/revenue-research/target_accuracy_sensitivity.py',
            'scripts/revenue-research/target_accuracy_selection.py',
            'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
            *replay.inference_input_paths(metric),
        ]),
    }
    try:
        for family in families:
            def filtered(*a, **kw):
                return [row for row in BASE_TRAINING(*a, **kw) if row['family'] != family]
            pair = []
            with patch.object(replay, 'prepare_indices', return_value=prepared), \
                    patch.object(replay, 'training_rows', side_effect=filtered):
                control, _, _ = replay.evaluate_metric(metric, raw, sources, payloads, names, baseline['as_of'])
                with patch.object(replay, 'select_candidate',
                                  side_effect=lambda *a, **kw: choose(*a, **kw, mode='target_max')):
                    trial, _, _ = replay.evaluate_metric(metric, raw, sources, payloads, names, baseline['as_of'])
            for report in (control, trial):
                pair.append({'fixed_available': fixed_summary(report, fixed_keys),
                             'fixed_all': fixed_summary(report, all_keys)})
            results.append({'removed_training_family': family, 'before': pair[0], 'after': pair[1]})
            if len(results) % 10 == 0:
                print(json.dumps({'completed': len(results), 'total': len(families)}), flush=True)
        summary = {}
        for field in ('median_error_pct', 'p90_error_pct', 'max_error_pct', 'mae_log'):
            changes = [
                row['after']['fixed_available']['error'][field] -
                row['before']['fixed_available']['error'][field]
                for row in results if not row['after']['fixed_available']['missing']
                and not row['before']['fixed_available']['missing']
            ]
            summary[field] = {
                'comparable_folds': len(changes),
                'improved': sum(value < -1e-10 for value in changes),
                'worsened': sum(value > 1e-10 for value in changes),
                'unchanged': sum(abs(value) <= 1e-10 for value in changes),
                'worst_change': max(changes) if changes else None,
                'best_change': min(changes) if changes else None,
            }
        output.update(execution_ok=True, summary=summary, folds_count=len(results))
        model.write_atomic(replay.ROOT / args.output, output, immutable=True)
        print(json.dumps({'folds': len(results), 'summary': summary}), flush=True)
    except Exception as error:
        output.update(execution_ok=False, error_type=type(error).__name__, error=str(error))
        model.write_atomic(replay.ROOT / (args.output + '.failed.json'), output, immutable=True)
        raise


if __name__ == '__main__':
    main()
