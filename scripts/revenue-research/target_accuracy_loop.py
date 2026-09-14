"""Research-only, publication-aware experiments targeting median 5% / P90 20%.

Existing service functions own fitting, selection, calibration and withholding.
Exit zero means execution completed, never that the target or release passed.
The original frozen models, source ledger and public policy are not modified.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import statistics
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as replay
from service_inputs import load_service_payloads

BASE_FIT = model.fit_model
BASE_PREDICT = model.predict_one
BASE_OPTIONS = replay.candidates
MODES = ('local_half', 'local_full', 'local_recent')


def age_months(before: str, after: str) -> int:
    return (int(after[:4]) - int(before[:4])) * 12 + int(after[5:7]) - int(before[5:7])


def local_correction(history: list[dict], month: str, klass: str, mode: str) -> float:
    """Use only earlier, same-class residuals; a missing class stays unchanged."""
    eligible = [row for row in history if row['month'] < month and row['class'] == klass]
    if not eligible:
        return 0.0
    latest = max(row['month'] for row in eligible)
    if mode in ('local_half', 'local_full'):
        selected = [row for row in eligible if row['month'] == latest]
        correction = statistics.fmean(row['residual'] for row in selected)
        return correction * (0.5 if mode == 'local_half' else 1.0)
    if mode == 'local_recent':
        weights = [row['weight'] * 0.5 ** age_months(row['month'], latest) for row in eligible]
        return sum(row['residual'] * weight for row, weight in zip(eligible, weights)) / sum(weights)
    raise ValueError(f'Unknown local correction: {mode}')


def trial_fit(rows: list[dict], candidate: dict) -> dict | None:
    result = BASE_FIT(rows, candidate)
    if result is None or 'local_correction' not in candidate:
        return result
    histories = defaultdict(list)
    for row in rows:
        observation = (model.within_game_observation(row, result['game_index_means'])
                       if 'log_index_within' in result['feature_names'] else row)
        predicted = fit.predict(observation, result)
        if predicted is None:
            raise ValueError('Training class missing from fitted model')
        histories[row['family']].append({
            'month': row['month'], 'class': row['class'], 'weight': row['weight'],
            'residual': row['log_y'] - predicted,
        })
    result['local_correction'] = candidate['local_correction']
    result['local_histories'] = dict(histories)
    return result


def trial_predict(family: str, month: str, klass: str, index: dict,
                  names: list[str], fitted: dict | None) -> dict:
    result = BASE_PREDICT(family, month, klass, index, names, fitted)
    if result['status'] != 'estimated' or 'local_correction' not in fitted:
        return result
    correction = local_correction(fitted['local_histories'].get(family, []),
                                  month, klass, fitted['local_correction'])
    return {**result, 'estimate': result['estimate'] * math.exp(correction)}


def options(metric: str, seed: dict, mode: str) -> list[dict]:
    original = BASE_OPTIONS(metric, seed)
    if mode == 'baseline':
        return original
    if mode not in MODES:
        raise ValueError(f'Unknown experiment: {mode}')
    additions = []
    for candidate in original:
        item = copy.deepcopy(candidate)
        item.pop('id')
        item['local_correction'] = mode
        additions.append({**item, 'id': model.digest(item)[:16]})
    return original + additions


def compare(current: dict, reference: dict, include_reserved: bool = False) -> dict:
    before = {replay.key(row): row for row in reference['validation_rows']
              if include_reserved or not row['reserved_family']}
    after = {replay.key(row): row for row in current['validation_rows']
             if include_reserved or not row['reserved_family']}
    if before.keys() != after.keys():
        raise ValueError('Target population changed')
    for key, expected in before.items():
        for field in ('actual', 'available_on', 'source_id'):
            if field in expected and after[key].get(field) != expected[field]:
                raise ValueError(f'Target evidence changed: {key} / {field}')
    computable = [key for key in before if 'error_pct' in before[key]]
    lost = [key for key in computable if 'error_pct' not in after[key]]
    if lost:
        raise ValueError(f'Lost fixed computable targets: {lost}')
    available = [key for key in computable if before[key]['status'] == 'available']
    summary = {}
    for name, keys in (
            ('all', computable), ('fixed_available', available),
            ('seen', [key for key in computable if before[key]['cohort'] == 'seen']),
            ('unseen', [key for key in computable if before[key]['cohort'] == 'unseen'])):
        summary[name] = {
            'before': model.error_summary([before[key] for key in keys]),
            'after': model.error_summary([after[key] for key in keys]),
        }
    return {
        **summary,
        'target_rows': len(before),
        'lost_computable': lost,
        'lost_available': [list(key) for key in available if after[key]['status'] != 'available'],
        'served_after': model.error_summary([row for row in after.values() if row['status'] == 'available']),
        'catalog_available': round(current['assessment']['catalog_served_fraction']
                                   * current['assessment']['catalog_rows']),
        'catalog_total': current['assessment']['catalog_rows'],
    }


def baseline_check(current: dict, expected: dict) -> None:
    before = {replay.key(row): row for row in expected['validation_rows']}
    after = {replay.key(row): row for row in current['validation_rows']}
    if before.keys() != after.keys():
        raise ValueError('Baseline population mismatch')
    for key in before:
        if before[key].keys() != after[key].keys():
            raise ValueError(f'Baseline fields mismatch: {key}')
        for field, value in before[key].items():
            actual = after[key][field]
            if isinstance(value, float) and isinstance(actual, float):
                if not math.isclose(value, actual, rel_tol=1e-12, abs_tol=1e-6):
                    raise ValueError(f'Baseline numeric mismatch: {key} / {field}')
            elif value != actual:
                raise ValueError(f'Baseline metadata mismatch: {key} / {field}')
    for field in ('chosen', 'selection'):
        if model.canonical(current[field]) != model.canonical(expected[field]):
            raise ValueError(f'Baseline selection mismatch: {field}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--metric', choices=tuple(replay.REPORTS), required=True)
    parser.add_argument('--modes', nargs='+', choices=MODES, default=list(MODES))
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    baseline_path = replay.ROOT / args.baseline / 'reports/rank-models/service-readiness.json'
    baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
    reference = next(item for item in baseline['metrics'] if item['metric'] == args.metric)
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, paths = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    replay.configure(args.metric)
    seed = json.loads((replay.ROOT / replay.REPORTS[args.metric]).read_text(encoding='utf-8'))
    prepared = replay.prepare_indices(BASE_OPTIONS(args.metric, seed), payloads, baseline['as_of'])
    results = []
    output = {
        'kind': 'target_5_20_development_screen', 'production_enabled': False,
        'release_ready': False, 'independent_validation': False,
        'baseline': args.baseline, 'metric': args.metric, 'as_of': baseline['as_of'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'target': {'median_error_pct': 5.0, 'p90_error_pct': 20.0},
        'source_hashes': replay.hashes([
            'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
            'scripts/revenue-research/target_accuracy_loop.py',
            *replay.inference_input_paths(args.metric), *paths.values(),
        ]),
        'modes_fixed_before_run': args.modes, 'results': results,
    }
    try:
        with patch.object(replay, 'prepare_indices', return_value=prepared), \
                patch.object(replay, 'fit_model', side_effect=trial_fit), \
                patch.object(replay, 'predict_one', side_effect=trial_predict):
            for mode in ['baseline', *args.modes]:
                with patch.object(replay, 'candidates',
                                  side_effect=lambda metric, seed: options(metric, seed, mode)):
                    report, _, preview = replay.evaluate_metric(
                        args.metric, raw, sources, payloads, names, baseline['as_of'])
                if mode == 'baseline':
                    baseline_check(report, reference)
                    output['baseline_reproduced'] = True
                    continue
                comparison = compare(report, reference)
                result = {
                    'mode': mode, 'comparison': comparison,
                    'selection': report['selection'], 'chosen': report['chosen'],
                    'report': report, 'preview': preview,
                }
                results.append(result)
                model.write_atomic(replay.ROOT / args.output, output, immutable=True)
                # Each mode has its own immutable checkpoint; final output follows below.
                if mode != args.modes[-1]:
                    args.output = str(Path(args.output).with_stem(Path(args.output).stem + '-next'))
                print(json.dumps({'metric': args.metric, 'mode': mode, 'comparison': comparison,
                                  'output': args.output}, ensure_ascii=False), flush=True)
        output['execution_ok'] = True
        output['seconds'] = time.perf_counter() - started
        final_path = Path(args.output).with_stem(Path(args.output).stem + '-complete')
        model.write_atomic(replay.ROOT / final_path, output, immutable=True)
        print(json.dumps({'execution_ok': True, 'output': str(final_path),
                          'seconds': output['seconds']}), flush=True)
    except Exception as error:
        output.update(execution_ok=False, error_type=type(error).__name__, error=str(error))
        failed = Path(args.output).with_stem(Path(args.output).stem + '-failed')
        model.write_atomic(replay.ROOT / failed, output, immutable=True)
        raise


if __name__ == '__main__':
    main()
