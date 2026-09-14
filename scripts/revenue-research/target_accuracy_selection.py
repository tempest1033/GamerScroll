"""Past-only selection objectives; fixed populations and service models remain intact."""
from __future__ import annotations

import argparse
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as replay
from service_inputs import load_service_payloads
from target_accuracy_loop import MODES as LOCAL_MODES
from target_accuracy_loop import compare, options, trial_fit, trial_predict

BASE_SELECT = replay.select_candidate
MODES = ('seen_mae', 'target_max', 'seen_target_max')


def choose(options: list[dict], predictions: dict, labels: list[dict], metric: str,
           before: str, current_coverage: dict | None = None, *, mode: str):
    if mode not in MODES:
        raise ValueError(f'Unknown objective: {mode}')
    errors = {
        item['id']: [row for row in replay.candidate_errors(
            predictions[item['id']], labels, metric, before)
            if not mode.startswith('seen_') or row['cohort'] == 'seen']
        for item in options
    }
    common = set.intersection(*({replay.key(row) for row in rows} for rows in errors.values()))
    if len(common) < 10 or len({key[1] for key in common}) < 2:
        # Sparse evidence is recoverable through the unchanged service warmup/selection.
        return BASE_SELECT(options, predictions, labels, metric, before, current_coverage)
    if mode == 'seen_mae':
        subset = [label for label in labels if replay.key(label) in common]
        return BASE_SELECT(options, predictions, subset, metric, before, current_coverage)
    scores = {}
    for option in options:
        rows = [row for row in errors[option['id']] if replay.key(row) in common]
        summary = model.error_summary(rows)
        scores[option['id']] = (
            max(summary['median_error_pct'] / 5.0, summary['p90_error_pct'] / 20.0),
            summary['mae_log'],
        )
    chosen = min(options, key=lambda item: (*scores[item['id']], item['id']))
    return chosen, {
        'mode': mode, 'common_rows': len(common),
        'common_months': len({key[1] for key in common}),
        'target_violation_factor': scores[chosen['id']][0],
        'mae_log': scores[chosen['id']][1],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--metric', choices=tuple(replay.REPORTS), required=True)
    parser.add_argument('--modes', nargs='+', choices=MODES, default=list(MODES))
    parser.add_argument('--local-mode', choices=('baseline', *LOCAL_MODES), default='baseline')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    baseline = json.loads((replay.ROOT / args.baseline /
                           'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    reference = next(row for row in baseline['metrics'] if row['metric'] == args.metric)
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    replay.configure(args.metric)
    seed = json.loads((replay.ROOT / replay.REPORTS[args.metric]).read_text(encoding='utf-8'))
    prepared = replay.prepare_indices(options(args.metric, seed, args.local_mode), payloads, baseline['as_of'])
    results = []
    output = {
        'kind': 'target_5_20_selection_screen', 'metric': args.metric,
        'baseline': args.baseline, 'as_of': baseline['as_of'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'production_enabled': False, 'release_ready': False, 'independent_validation': False,
        'modes_fixed_before_run': args.modes, 'local_mode': args.local_mode, 'results': results,
        'source_hashes': replay.hashes([
            'scripts/revenue-research/target_accuracy_selection.py',
            'scripts/revenue-research/target_accuracy_loop.py',
            'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
            *replay.inference_input_paths(args.metric),
        ]),
    }
    try:
        for mode in args.modes:
            with patch.object(replay, 'prepare_indices', return_value=prepared), \
                    patch.object(replay, 'candidates',
                                 side_effect=lambda metric, seed: options(metric, seed, args.local_mode)), \
                    patch.object(replay, 'fit_model', side_effect=trial_fit), \
                    patch.object(replay, 'predict_one', side_effect=trial_predict), \
                    patch.object(replay, 'select_candidate',
                                 side_effect=lambda *a, **kw: choose(*a, **kw, mode=mode)):
                report, _, preview = replay.evaluate_metric(
                    args.metric, raw, sources, payloads, names, baseline['as_of'])
            comparison = compare(report, reference)
            results.append({'mode': mode, 'comparison': comparison, 'report': report, 'preview': preview})
            print(json.dumps({'metric': args.metric, 'mode': mode, 'comparison': comparison}), flush=True)
        output['execution_ok'] = True
        model.write_atomic(replay.ROOT / args.output, output, immutable=True)
    except Exception as error:
        output.update(execution_ok=False, error_type=type(error).__name__, error=str(error))
        failed = Path(args.output).with_stem(Path(args.output).stem + '-failed')
        model.write_atomic(replay.ROOT / failed, output, immutable=True)
        raise


if __name__ == '__main__':
    main()
