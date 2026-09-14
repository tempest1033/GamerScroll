"""Remove learning families or source-linked outcomes under identical exclusions.

Removed outcomes remain evaluation targets but cannot train, select or calibrate
either model. Source blocks remove all citations/classes of their family-month
outcomes, not just a source ID string. These overlapping scenarios are sensitivity
checks, not independent test sets. Failed scenarios remain failures.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import time
from collections import defaultdict
from pathlib import Path
from unittest.mock import patch

import history_fit as fit
import literature_models as literature
import literature_recency
import service_model as service
import service_readiness as replay
from literature_replay import BASELINE, compare, preserve_experiment_sources
from service_inputs import load_service_payloads


def fixed_comparison(before: dict, after: dict, keys: set) -> dict:
    old = {replay.key(row): row for row in before['validation_rows']}
    new = {replay.key(row): row for row in after['validation_rows']}
    common = sorted(key for key in keys if 'error_pct' in old[key] and 'error_pct' in new[key])
    return {
        'requested_rows': len(keys), 'comparable_rows': len(common),
        'missing_keys': [list(key) for key in sorted(keys - set(common))],
        'before': service.error_summary([old[key] for key in common]),
        'after': service.error_summary([new[key] for key in common]),
        'available_before': sum(old[key]['status'] == 'available' for key in keys),
        'available_after': sum(new[key]['status'] == 'available' for key in keys)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metric', choices=['consumer_spend', 'downloads'], required=True)
    parser.add_argument('--method', choices=['baseline', *literature.METHODS], default='ridge_curvature_anchored')
    parser.add_argument('--baseline', default=BASELINE)
    parser.add_argument('--output', required=True)
    parser.add_argument('--staged-curvature', action='store_true')
    parser.add_argument('--recency-one-se', action='store_true')
    parser.add_argument('--reference-sensitivity', default='')
    parser.add_argument('--source-blocks', action='store_true')
    parser.add_argument('--group-sizes', nargs='+', type=int, default=[1])
    parser.add_argument('--group-scenarios', type=int, default=100)
    parser.add_argument('--seed', type=int, default=20260913)
    args = parser.parse_args()
    if args.recency_one_se and (args.staged_curvature or args.method != 'baseline'):
        parser.error('--recency-one-se requires --method baseline without --staged-curvature')
    if args.staged_curvature and args.method not in ('ridge_curvature', 'ridge_curvature_anchored'):
        parser.error('--staged-curvature requires a curvature method')
    if args.reference_sensitivity and args.group_sizes != [1]:
        parser.error('The preserved single-family reference applies only to --group-sizes 1')
    if args.source_blocks and (args.reference_sensitivity or not args.recency_one_se):
        parser.error('Source blocks require recency comparison without a family reference')
    if args.group_scenarios < 1 or len(set(args.group_sizes)) != len(args.group_sizes):
        parser.error('Positive scenario count and distinct group sizes are required')
    baseline = json.loads((replay.ROOT / args.baseline).read_text(encoding='utf-8'))
    reference = next(row for row in baseline['metrics'] if row['metric'] == args.metric)
    expected_cases = {}
    if args.reference_sensitivity:
        previous = json.loads((replay.ROOT / args.reference_sensitivity).read_text(encoding='utf-8'))
        if not previous['execution_ok'] or not previous['completed'] or previous['metric'] != args.metric:
            raise ValueError('Invalid prior sensitivity reference')
        expected_cases = {row['excluded_family']: row for row in previous['results']}
    fixed_keys = {replay.key(row) for row in reference['validation_rows']
                  if not row['reserved_family'] and row['status'] == 'available'}
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, history_paths = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    replay.configure(args.metric)
    seed = json.loads((replay.ROOT / replay.REPORTS[args.metric]).read_text(encoding='utf-8'))
    all_options = literature.candidates(args.metric, seed, args.method, hybrid=True)
    # Label exclusions do not change rank observations or curve aggregation.
    indices, quality, audits = replay.prepare_indices(all_options, payloads, baseline['as_of'])
    last_month = max(row['month'] for row in reference['selection'])
    cutoff = min(replay.next_month(last_month) + '-01', baseline['as_of'])
    vintage, _ = service.monthly_labels(raw, sources, set(names), args.metric, cutoff)
    learning_families = sorted({
        row['family'] for index in indices.values()
        for row in service.training_rows(vintage, index, names, last_month, as_of=cutoff)})
    source_outcomes = defaultdict(set)
    if args.source_blocks:
        # Fix blocks using actual publication-available training membership,
        # never from a candidate's measured error or a reserved-family outcome.
        for month in sorted(row['month'] for row in reference['selection']):
            cutoff = min(replay.next_month(month) + '-01', baseline['as_of'])
            vintage, _ = service.monthly_labels(raw, sources, set(names), args.metric, cutoff)
            for index in indices.values():
                for row in service.training_rows(vintage, index, names, month, as_of=cutoff):
                    source_outcomes[row['source_id']].add((row['family'], row['month']))
    learning_units = sorted(source_outcomes) if args.source_blocks else learning_families
    if not learning_units:
        raise ValueError('No eligible learning units')
    import numpy as np

    exclusion_sets = []
    rng = np.random.default_rng(args.seed)
    for size in args.group_sizes:
        if not 1 <= size < len(learning_units):
            raise ValueError('Each exclusion must leave at least one learning unit')
        if size == 1:
            exclusion_sets.extend((name,) for name in learning_units)
            continue
        requested = min(args.group_scenarios, math.comb(len(learning_units), size))
        selected = set()
        for _ in range(requested * 20):
            selected.add(tuple(sorted(str(name) for name in rng.choice(
                learning_units, size=size, replace=False))))
            if len(selected) == requested:
                break
        if len(selected) != requested:
            raise ValueError('Could not construct the requested distinct exclusion sets')
        exclusion_sets.extend(sorted(selected))
    record = {
        'kind': 'learning_source_block_sensitivity' if args.source_blocks else 'learning_family_exclusion_sensitivity',
        'metric': args.metric, 'method': 'recency_one_se' if args.recency_one_se else args.method,
        'baseline': args.baseline,
        'selection_strategy': ('recency_one_se' if args.recency_one_se else
                               'baseline_parent_then_curvature' if args.staged_curvature else 'flat_candidate_pool'),
        'reference_sensitivity': args.reference_sensitivity or None,
        'production_enabled': False, 'release_policy_changed': False,
        'excluded_from_fit_selection_and_calibration': True,
        'original_evaluation_targets_retained': True,
        'families_fixed_before_run': learning_families,
        'exclusion_unit': 'source' if args.source_blocks else 'family',
        'source_outcomes_fixed_before_run': {
            name: [list(key) for key in sorted(keys)] for name, keys in source_outcomes.items()},
        'exclusion_sets_fixed_before_run': [list(group) for group in exclusion_sets],
        'group_sizes': args.group_sizes, 'seed': args.seed,
        'original_available_keys': [list(key) for key in sorted(fixed_keys)],
        'completed': False, 'execution_ok': False, 'results': [], 'errors': [],
        'input_hashes': replay.hashes([
            args.baseline, 'docs/research/anchors/anchors.jsonl',
            'docs/research/anchors/sources.json', replay.CONFIG, *history_paths.values(),
            *([args.reference_sensitivity] if args.reference_sensitivity else [])]),
        'experiment_sources': preserve_experiment_sources([Path(__file__)]),
        'limitations': [
            'Overlapping exclusion scenarios are not independent experiments or providers.',
            'Current identities and curves were inspected historically.',
            ('Source blocks use all historical training folds and may share the same outcomes.'
             if args.source_blocks else 'Only families that can affect the last historical fold are removed.'),
            'Future independent evaluation and commercial-use permission remain required.']}
    output = replay.ROOT / args.output
    service.write_atomic(output, record, immutable=True)
    print(json.dumps({'metric': args.metric, 'learning_units': len(learning_units),
                      'scenarios': len(exclusion_sets), 'group_sizes': args.group_sizes}), flush=True)
    original_training = replay.training_rows
    original_errors = replay.candidate_errors
    original_select = literature.ORIGINAL_SELECT
    started = time.perf_counter()
    for exclusion_group in exclusion_sets:
        excluded = set(exclusion_group)
        excluded_outcomes = set().union(*(source_outcomes[name] for name in excluded)) if args.source_blocks else set()
        scenario_started = time.perf_counter()
        audit = {'training_row_exclusion_events': 0, 'selection_calibration_exclusion_events': 0}
        training_cache, fit_cache = {}, {}

        def excluded_row(row):
            return ((row['family'], row['month']) in excluded_outcomes if args.source_blocks
                    else row['family'] in excluded)

        def training(*positional, **keyword):
            # Labels/sources, index identity, cutoff and exclusion are fixed
            # within a scenario. Reuse the same read-only rows across selectors.
            key = (id(positional[1]), positional[3],
                   keyword.get('reserve', True), keyword.get('as_of'))
            if key not in training_cache:
                rows = original_training(*positional, **keyword)
                training_cache[key] = ([row for row in rows if not excluded_row(row)],
                                       sum(excluded_row(row) for row in rows))
            rows, count = training_cache[key]
            audit['training_row_exclusion_events'] += count
            return rows

        def fitted(rows, option):
            # Recency changes selection only: its native fits are identical.
            # Copies protect the cache from final-model metadata additions.
            if not args.recency_one_se:
                return literature.fit_model(rows, option)
            key = (id(rows), option['id'])
            if key not in fit_cache:
                fit_cache[key] = literature.fit_model(rows, option)
            return copy.deepcopy(fit_cache[key])

        def errors(*positional, **keyword):
            rows = original_errors(*positional, **keyword)
            audit['selection_calibration_exclusion_events'] += sum(excluded_row(row) for row in rows)
            return [row for row in rows if not excluded_row(row)]

        try:
            reports = []
            with patch.object(replay, 'training_rows', side_effect=training), \
                    patch.object(replay, 'candidate_errors', side_effect=errors), \
                    patch.object(replay, 'prepare_indices', return_value=(indices, quality, audits)), \
                    patch.object(replay, 'fit_model', side_effect=fitted), \
                    patch.object(fit, 'predict', side_effect=literature.predict):
                for variant, method in (('reference', 'baseline'), ('candidate', args.method)):
                    selector = original_select
                    if variant == 'candidate':
                        if args.recency_one_se:
                            selector = literature_recency.select
                        elif args.staged_curvature:
                            selector = literature.staged_select
                    with patch.object(replay, 'candidates', side_effect=lambda metric, seed: literature.candidates(
                            metric, seed, method, hybrid=True)), \
                            patch.object(replay, 'select_candidate', side_effect=selector):
                        report, _, _ = replay.evaluate_metric(
                            args.metric, raw, sources, payloads, names, baseline['as_of'])
                        reports.append(report)
            before, after = reports
            comparison = compare(after, before)
            original_fixed = fixed_comparison(before, after, fixed_keys)
            if expected_cases:
                expected = expected_cases[exclusion_group[0]]
                for actual, saved in (
                        (comparison['common_before'], expected['common_before']),
                        (original_fixed['before'], expected['fixed_original_available']['before'])):
                    if actual.keys() != saved.keys():
                        raise ValueError('The baseline summary contract changed')
                    for key in actual:
                        if not math.isclose(actual[key], saved[key], rel_tol=1e-12, abs_tol=1e-9):
                            raise ValueError(f'Cached baseline differs from preserved evidence: {key}')
                if before['selection'] != expected['baseline_selection']:
                    raise ValueError('Cached baseline selections differ from preserved evidence')
            if audit['training_row_exclusion_events'] <= 0:
                raise ValueError('The selected learning unit did not affect any fit')
            result = {
                'excluded_family': exclusion_group[0] if not args.source_blocks and len(exclusion_group) == 1 else None,
                'excluded_families': [] if args.source_blocks else list(exclusion_group),
                'excluded_sources': list(exclusion_group) if args.source_blocks else [],
                'excluded_outcomes': [list(key) for key in sorted(excluded_outcomes)],
                'audit': audit,
                'seconds': time.perf_counter() - scenario_started,
                'baseline_matches_prior_sensitivity': bool(expected_cases),
                'native_fit_cache_entries': len(fit_cache),
                'common_before': comparison['common_before'],
                'common_after': comparison['common_after'],
                'lost_computable_keys': comparison['lost_computable_keys'],
                'fixed_original_available': original_fixed,
                'baseline_selection': before['selection'],
                'candidate_selection': after['selection']}
            record['results'].append(result)
        except Exception as error:
            record['errors'].append({'excluded_units': list(exclusion_group),
                                     'error_type': type(error).__name__, 'error': str(error)})
        record['seconds'] = time.perf_counter() - started
        service.write_atomic(output, record)
        done = len(record['results']) + len(record['errors'])
        if done % 10 == 0 or done == len(exclusion_sets):
            print(json.dumps({'metric': args.metric, 'completed_scenarios': done,
                              'total_scenarios': len(exclusion_sets),
                              'failed_scenarios': len(record['errors']),
                              'seconds': record['seconds']}), flush=True)
    record['completed'] = True
    record['execution_ok'] = not record['errors']
    service.write_atomic(output, record)
    if record['errors']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
