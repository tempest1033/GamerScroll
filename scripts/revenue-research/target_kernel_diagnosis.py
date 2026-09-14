"""Separate kernel correction from its induced backbone-selection changes."""
from __future__ import annotations

import json
import math
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as replay
import target_diverse_models as diverse
from service_inputs import load_service_payloads
from target_accuracy_loop import compare


def parent_id(candidate: dict) -> str:
    return model.digest({key: value for key, value in candidate.items()
                         if key not in ('id', 'diverse_method', 'diverse_representation')})[:16]


def main() -> None:
    baseline_path = 'reports/rank-models/target-5-20-baseline-1ym9dq8t'
    baseline = json.loads((replay.ROOT / baseline_path /
                           'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    reference = next(row for row in baseline['metrics'] if row['metric'] == 'downloads')
    trials = json.loads((replay.ROOT / 'reports/rank-models/target-5-20-diverse-downloads.json')
                        .read_text(encoding='utf-8'))
    kernel = next(row['report'] for row in trials['results']
                  if row['method'] == 'kernel_ridge' and row['representation'] == 'residual')
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    seed = json.loads((replay.ROOT / replay.REPORTS['downloads']).read_text(encoding='utf-8'))
    options = diverse.options('downloads', seed, 'kernel_ridge', 'residual')
    parents = {row['id']: parent_id(row) if 'diverse_method' in row else row['id'] for row in options}
    schedule = {row['month']: parents[row['candidate']] for row in kernel['selection']}
    schedule[baseline['as_of'][:7]] = parents[kernel['chosen']['id']]

    def fixed_parent(options, predictions, labels, metric, before, current_coverage=None):
        return next(row for row in options if row['id'] == schedule[before]), {
            'mode': 'diagnostic_kernel_selected_parent', 'selection_frozen_from': 'kernel_trial'}

    with patch.object(replay, 'select_candidate', side_effect=fixed_parent):
        parent, _, preview = replay.evaluate_metric(
            'downloads', raw, sources, payloads, names, baseline['as_of'])
    base_rows = {replay.key(row): row for row in reference['validation_rows']}
    parent_rows = {replay.key(row): row for row in parent['validation_rows']}
    deltas = []
    for row in kernel['validation_rows']:
        identity = replay.key(row)
        original = base_rows[identity]
        if original['status'] != 'available':
            continue
        backbone = parent_rows[identity]
        deltas.append({
            'family': row['family'], 'month': row['month'],
            'baseline_error_pct': original['error_pct'],
            'kernel_parent_error_pct': backbone['error_pct'],
            'kernel_error_pct': row['error_pct'],
            'parent_selection_log_delta': math.log(backbone['estimate'] / original['estimate']),
            'nonlinear_adjustment_log_delta': math.log(row['estimate'] / backbone['estimate']),
        })
    deltas.sort(key=lambda row: row['kernel_error_pct'] - row['baseline_error_pct'], reverse=True)
    result = {
        'kind': 'kernel_backbone_error_decomposition', 'execution_ok': True,
        'production_enabled': False, 'independent_validation': False,
        'not_a_new_selection_algorithm': True, 'schedule': schedule,
        'parent_comparison': compare(parent, reference), 'fixed_available_deltas': deltas,
        'parent_report': parent, 'parent_preview': preview,
    }
    model.write_atomic(replay.ROOT / 'reports/rank-models/target-5-20-kernel-decomposition.json',
                       result, immutable=True)
    print(json.dumps({'parent_comparison': result['parent_comparison'],
                      'largest_regressions': deltas[:6]}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
