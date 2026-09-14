"""Bounded, development-only comparison using the existing temporal replay.

Exit 0 means execution succeeded, not that a model improved or release is ready.
Each failed method is recorded before the process exits nonzero.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.metadata
import importlib.util
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import history_fit as fit
import literature_models as literature
import literature_recency
import literature_splines
import service_model as service
import service_readiness as replay
from service_inputs import load_service_payloads

BASELINE = ('reports/rank-models/literature-five-hour-baseline-cri1hrr1/'
            'reports/rank-models/service-readiness.json')


def preserve_experiment_sources(extra: list[Path] | None = None) -> dict:
    """Keep exact code bytes, including the isolated GPBoost compatibility patch."""
    sources = [Path(__file__), Path(literature.__file__),
               Path(literature_splines.__file__), Path(literature_recency.__file__),
               Path(importlib.util.find_spec('gpboost.basic').origin), *(extra or [])]
    directory = replay.ROOT / 'reports/rank-models/literature-source'
    directory.mkdir(parents=True, exist_ok=True)
    records = {}
    for source in sources:
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        target = directory / f'{digest}-{source.name}'
        try:
            with target.open('xb') as stream:
                stream.write(data)
        except FileExistsError:
            if target.read_bytes() != data:
                raise ValueError(f'Preserved experiment source differs: {target}')
        records[source.relative_to(replay.ROOT).as_posix()] = {
            'sha256': digest, 'preserved_path': target.relative_to(replay.ROOT).as_posix()}
    return records


def compare(report: dict, reference: dict) -> dict:
    previous = {replay.key(row): row for row in reference['validation_rows']
                if not row['reserved_family']}
    current = {replay.key(row): row for row in report['validation_rows']
               if not row['reserved_family']}
    if previous.keys() != current.keys():
        raise ValueError('The experiment changed the target population')
    for key in previous:
        for field in ('actual', 'available_on', 'source_id'):
            if field in previous[key] and field in current[key]:
                if previous[key][field] != current[key][field]:
                    raise ValueError(f'Target evidence changed: {key} / {field}')
    both = sorted(key for key in previous
                  if 'error_pct' in previous[key] and 'error_pct' in current[key])
    fixed_available = [key for key in both if previous[key]['status'] == 'available']
    summary = {}
    for label, keys in (
            ('common', both), ('fixed_available', fixed_available),
            ('common_seen', [key for key in both if previous[key]['prior_months']]),
            ('common_unseen', [key for key in both if not previous[key]['prior_months']])):
        summary[label + '_before'] = service.error_summary([previous[key] for key in keys])
        summary[label + '_after'] = service.error_summary([current[key] for key in keys])
    return {
        **summary,
        'target_rows': len(previous),
        'lost_computable_keys': [list(key) for key in previous
                                 if 'error_pct' in previous[key] and 'error_pct' not in current[key]],
        'gained_computable_keys': [list(key) for key in current
                                   if 'error_pct' in current[key] and 'error_pct' not in previous[key]],
        'fixed_available_still_available': sum(
            current[key]['status'] == 'available' for key in fixed_available),
        'available_after': service.error_summary([
            row for row in current.values() if row['status'] == 'available']),
        'nonreserved_rows': list(current.values()),
        'selection': report['selection'],
        'chosen': report['chosen'], 'candidate_count': report['candidate_count'],
        'seconds': report['seconds']}


def check_baseline(report: dict, reference: dict) -> dict:
    before = {replay.key(row): row for row in reference['validation_rows']}
    after = {replay.key(row): row for row in report['validation_rows']}
    if before.keys() != after.keys():
        raise ValueError('Baseline target population differs in the new runtime')
    max_raw_delta = 0.0
    for key, expected in before.items():
        actual = after[key]
        for field in set(expected) | set(actual):
            old, new = expected.get(field), actual.get(field)
            if isinstance(old, float) and isinstance(new, float):
                if not math.isclose(old, new, rel_tol=1e-12, abs_tol=1e-6):
                    raise ValueError(f'Baseline numeric mismatch: {key} / {field}')
                if field == 'estimate':
                    max_raw_delta = max(max_raw_delta, abs(old - new))
            elif old != new:
                raise ValueError(f'Baseline metadata mismatch: {key} / {field}')
    if (service.canonical(report['chosen']) != service.canonical(reference['chosen']) or
            service.canonical(report['selection']) != service.canonical(reference['selection'])):
        raise ValueError('Baseline candidate selection differs')
    return {'ok': True, 'rows': len(before), 'max_raw_estimate_delta': max_raw_delta}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metric', choices=['consumer_spend', 'downloads'], required=True)
    parser.add_argument('--as-of', default='2026-09-13')
    parser.add_argument('--baseline', default=BASELINE)
    parser.add_argument('--output', required=True)
    parser.add_argument('--methods', nargs='+', choices=['baseline', *literature.METHODS],
                        default=['baseline', *literature.METHODS])
    parser.add_argument('--standalone', action='store_true')
    parser.add_argument('--staged-curvature', action='store_true')
    parser.add_argument('--recency-one-se', action='store_true')
    args = parser.parse_args()
    if args.recency_one_se and (args.staged_curvature or args.standalone or args.methods != ['baseline']):
        parser.error('--recency-one-se requires only --methods baseline, without other selection flags')
    if args.staged_curvature and (
            args.standalone or any(method not in ('baseline', 'ridge_curvature', 'ridge_curvature_anchored')
                                   for method in args.methods)):
        parser.error('--staged-curvature requires hybrid baseline/curvature methods')
    reference = json.loads((replay.ROOT / args.baseline).read_text(encoding='utf-8'))
    reference = next(item for item in reference['metrics'] if item['metric'] == args.metric)
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, history_paths = load_service_payloads(args.as_of)
    _, names = fit.identity_families()
    record = {
        'kind': 'literature_nonreserved_retrospective_comparison',
        'as_of': args.as_of, 'started_at': datetime.now(timezone.utc).isoformat(),
        'metric': args.metric, 'baseline': args.baseline,
        'methods_fixed_before_run': args.methods, 'hybrid': not args.standalone,
        'selection_strategy': ('recency_one_se' if args.recency_one_se else
                               'baseline_parent_then_curvature' if args.staged_curvature else 'flat_candidate_pool'),
        'reserved_outcomes_used_for_selection': False,
        'production_enabled': False, 'release_policy_changed': False,
        'execution_ok': False, 'completed': False, 'results': [],
        'versions': {name: importlib.metadata.version(name)
                     for name in ('numpy', 'scipy', 'gpboost', 'pygam', 'mapie', 'scikit-learn')},
        'experiment_sources': preserve_experiment_sources(),
        'input_hashes': replay.hashes(
            replay.inference_input_paths(args.metric) +
            [replay.REPORTS[args.metric], 'docs/research/anchors/anchors.jsonl',
             'docs/research/anchors/sources.json', replay.CONFIG, *history_paths.values()]),
        'limitations': [
            'Repeated retrospective development; neither pristine holdout nor future validation.',
            'Reserved-family results are omitted from this development artifact.',
            'A different isolated SciPy runtime requires baseline-equivalence verification.']}
    output = replay.ROOT / args.output
    service.write_atomic(output, record, immutable=True)
    for method in args.methods:
        started = time.perf_counter()
        captured = {}
        original_select = literature.ORIGINAL_SELECT

        def select(options, predictions, labels, metric, before, current_coverage=None):
            captured['options'] = options
            captured['predictions'] = predictions
            selector = (literature_recency.select if args.recency_one_se else
                        literature.staged_select if args.staged_curvature else original_select)
            return selector(options, predictions, labels, metric, before, current_coverage)

        try:
            with patch.object(replay, 'candidates', side_effect=lambda metric, seed: literature.candidates(
                    metric, seed, method, not args.standalone)), \
                    patch.object(replay, 'fit_model', side_effect=literature.fit_model), \
                    patch.object(fit, 'predict', side_effect=literature.predict), \
                    patch.object(replay, 'select_candidate', side_effect=select):
                report, _, _ = replay.evaluate_metric(
                    args.metric, raw, sources, payloads, names, args.as_of)
            result = {'method': 'recency_one_se' if args.recency_one_se else method, **compare(report, reference)}
            if method == 'baseline' and not args.recency_one_se:
                result['runtime_baseline_equivalence'] = check_baseline(report, reference)
            # These forecast rows have no actual values and exclude reserved games.
            # They support later standalone and interval diagnostics without refitting.
            result['literature_candidate_predictions'] = {
                option['id']: {
                    'candidate': copy.deepcopy(option),
                    'predictions': [row for row in captured['predictions'][option['id']].values()
                                    if not service.reserved_game(row['family'])]}
                for option in captured['options'] if 'literature_method' in option}
            record['results'].append(result)
            record['completed'] = len(record['results']) == len(args.methods)
            record['execution_ok'] = True
            service.write_atomic(output, record)
            print(json.dumps({
                'metric': args.metric, 'method': result['method'], 'hybrid': not args.standalone,
                'selection_strategy': record['selection_strategy'],
                'seconds': time.perf_counter() - started,
                'common_after': result['common_after'],
                'fixed_available_after': result['fixed_available_after'],
                'lost_computable': len(result['lost_computable_keys'])}), flush=True)
        except Exception as error:
            record.update(execution_ok=False, completed=False, failed_method=method,
                          error_type=type(error).__name__, error=str(error))
            service.write_atomic(output, record)
            raise


if __name__ == '__main__':
    main()
