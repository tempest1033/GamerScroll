"""Independently verify fixed-target experimental errors and publish only metadata.

No model, ledger, identity, public gate or estimate is promoted by this command.
An immutable audit and summary precede the existing atomic generation writer.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import statistics
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import service_model as service
import service_readiness as replay

BASELINE = 'reports/rank-models/target-5-20-baseline-1ym9dq8t'
SUMMARY = 'reports/rank-models/target-5-20-diverse-models.json'
INPUTS = [
    'target-5-20-revenue-local-next-next-complete.json',
    'target-5-20-downloads-local-next-next-complete.json',
    'target-5-20-revenue-selection.json',
    'target-5-20-downloads-selection.json',
    'target-5-20-revenue-combined-half.json',
    'target-5-20-revenue-combined-recent.json',
    'target-5-20-diverse-revenue.json',
    'target-5-20-diverse-downloads.json',
    'target-5-20-diverse-revenue-mlp-default.json',
    'target-5-20-diverse-downloads-mlp-default.json',
    'target-5-20-dynamic-revenue.json',
    'target-5-20-dynamic-downloads.json',
]


def load(path: str) -> dict:
    return json.loads((replay.ROOT / path).read_text(encoding='utf-8'))


def key(row: dict) -> tuple:
    return row['family'], row['month'], row['class']


def independent_statistics(rows: list[dict]) -> dict:
    errors = sorted(100 * abs(row['estimate'] - row['actual']) / row['actual'] for row in rows)
    return {
        'rows': len(rows), 'games': len({row['family'] for row in rows}),
        'months': len({row['month'] for row in rows}),
        'median_error_pct': statistics.median(errors),
        'p90_error_pct': errors[math.ceil(0.9 * len(errors)) - 1],
        'max_error_pct': max(errors),
        'mae_log': statistics.fmean(abs(math.log(row['estimate']) - math.log(row['actual'])) for row in rows),
    }


def check_statistics(actual: dict, expected: dict) -> None:
    for field, value in expected.items():
        if not math.isclose(actual[field], value, rel_tol=1e-11, abs_tol=1e-10):
            raise ValueError(f'Independent metric mismatch: {field}: {actual[field]} != {value}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish-metadata', action='store_true')
    args = parser.parse_args()
    baseline = load(BASELINE + '/reports/rank-models/service-readiness.json')
    baseline_receipt = load(BASELINE + '/receipt.json')
    # This is a mutation-boundary guard, not a repeated model execution.
    for relative, evidence in baseline_receipt['source_files'].items():
        if relative == 'docs/research/rank-model-service-readiness.md':
            continue
        if hashlib.sha256((replay.ROOT / relative).read_bytes()).hexdigest() != evidence['sha256']:
            raise ValueError(f'Preserved service baseline changed: {relative}')
    references = {row['metric']: row for row in baseline['metrics']}
    comparisons = []
    for filename in INPUTS:
        relative = 'reports/rank-models/' + filename
        source = load(relative)
        if source.get('execution_ok') is not True:
            raise ValueError(f'Experiment execution failed: {relative}')
        metric = source['metric']
        reference = references[metric]
        before = {key(row): row for row in reference['validation_rows'] if not row['reserved_family']}
        fixed = [identity for identity, row in before.items() if row['status'] == 'available']
        all_computable = [identity for identity, row in before.items() if 'error_pct' in row]
        if len(fixed) != (8 if metric == 'consumer_spend' else 26):
            raise ValueError('Frozen displayed population changed')
        for trial in source['results']:
            report = trial['report']
            after = {key(row): row for row in report['validation_rows'] if not row['reserved_family']}
            if before.keys() != after.keys():
                raise ValueError('Evaluation target population changed')
            if report['assessment']['release_ready']:
                raise ValueError('A retrospective trial became release-ready')
            for identity in all_computable:
                row, old = after[identity], before[identity]
                if any(row.get(field) != old[field] for field in ('actual', 'available_on', 'source_id')):
                    raise ValueError('Target amount or source changed')
                ratio = row['estimate'] / old['actual']
                if not math.isclose(row['error_pct'], abs(ratio - 1) * 100, abs_tol=1e-10):
                    raise ValueError('Stored row error does not follow its prediction')
            for name, identities in (('all', all_computable), ('fixed_available', fixed)):
                expected = independent_statistics([after[identity] for identity in identities])
                check_statistics(trial['comparison'][name]['after'], expected)
                check_statistics(trial['comparison'][name]['before'],
                                 independent_statistics([before[identity] for identity in identities]))
            lost = [list(identity) for identity in fixed if after[identity]['status'] != 'available']
            if lost != trial['comparison']['lost_available']:
                raise ValueError('Withholding losses were not reported')
            preview = trial['preview']
            if len(preview['rows']) != 144 or len({row['family'] for row in preview['rows']}) != 144:
                raise ValueError('Preview catalog population changed')
            available = sum(row['status'] == 'available' for row in preview['rows'])
            if available != trial['comparison']['catalog_available']:
                raise ValueError('Catalog visibility count mismatch')
            comparison = trial['comparison']
            entry = {
                'source': relative, 'metric': metric,
                'method': trial.get('method', trial.get('mode')),
                'representation': trial.get('representation', source.get('local_mode', 'native')),
                'fixed_available': comparison['fixed_available']['after'],
                'all_development': comparison['all']['after'],
                'lost_available': lost, 'catalog_available': available,
                'superseded_mlp_configuration': (
                    trial.get('method') == 'mlp' and '-mlp-default' not in filename),
            }
            entry['target_met'] = (
                entry['fixed_available']['median_error_pct'] <= 5.0
                and entry['fixed_available']['p90_error_pct'] <= 20.0 and not lost)
            comparisons.append(entry)
    if len(comparisons) != 47:
        raise ValueError(f'Expected 47 preserved experiment configurations; got {len(comparisons)}')
    sensitivity = load('reports/rank-models/target-5-20-revenue-sensitivity.json')
    if sensitivity['execution_ok'] is not True or len(sensitivity['folds']) != 42:
        raise ValueError('Revenue sensitivity review incomplete')
    summary = {
        'kind': 'target_5_20_round_checkpoint', 'execution_ok': True,
        'created_at': datetime.now(timezone.utc).isoformat(), 'as_of': baseline['as_of'],
        'baseline': BASELINE, 'status': 'in_progress', 'stage': 'diverse_model_screen_completed',
        'objective_completed': False, 'production_enabled': False, 'release_ready': False,
        'model_adopted': False, 'independent_validation': False,
        'target': {'median_error_pct': 5.0, 'p90_error_pct': 20.0},
        'nonlinear_and_dynamic_model_families': [
            'extra_trees', 'random_forest', 'gradient_boosting', 'svr_rbf',
            'kernel_ridge', 'mlp', 'kalman_level', 'residual_ar1'],
        'all_experiment_configurations': len(comparisons),
        'diverse_model_configurations': 32,
        'active_diverse_configurations': 28,
        'comparisons': comparisons,
        'revenue_training_family_sensitivity': sensitivity['summary'],
        'label_consistency': 'reports/rank-models/target-5-20-label-consistency.json',
        'checks': {
            'independent_error_computation': True,
            'target_amounts_and_sources_unchanged': True,
            'all_baseline_computable_targets_retained': True,
            'withholding_and_catalog_losses_reported': True,
            'original_models_and_inputs_unchanged': True,
            'current_behavior_tests_passed': 9,
            'initial_mlp_test_failed': True,
            'mlp_failure_resolved_using_default_regularization': True,
        },
        'initial_failure_evidence': (
            'reports/rank-models/target-diverse-initial-code-whuw6n9i/initial-test-failure.json'),
        'evidence_sha256': replay.hashes(
            ['reports/rank-models/' + name for name in INPUTS] + [
                'reports/rank-models/target-5-20-revenue-sensitivity.json',
                'reports/rank-models/target-5-20-label-consistency.json']),
        'limitations': [
            'Retrospective development comparisons are not independent future accuracy.',
            'Eight revenue rows in one month and 26 download rows in two months are insufficient.',
            'The best central and tail errors from different models must not be combined.',
            'The same-provider repetition audit does not establish a five-percent error floor.',
            'Neural solver warnings remain recorded; no warning-only tuning was performed.',
            'No model met both requested accuracy thresholds on the fixed displayed populations.',
            'Future evaluation, broader coverage, missing charts and data-use permission remain pending.',
        ],
    }
    if any(row['target_met'] for row in comparisons):
        raise ValueError('Reconcile an achieved experimental target before recording nonachievement')
    service.write_atomic(replay.ROOT / SUMMARY, summary, immutable=True)
    if args.publish_metadata:
        report = load('reports/rank-models/service-readiness.json')
        preview = load('reports/rank-models/service-preview.json')
        original_preview = copy.deepcopy(preview)
        preservation = Path(tempfile.mkdtemp(prefix='target-5-20-metadata-baseline-',
                                            dir=replay.ROOT / 'reports/rank-models'))
        for filename in ('service-preview.json', 'service-current.json', 'service-health.json'):
            source = replay.ROOT / 'reports/rank-models' / filename
            data = source.read_bytes()
            with (preservation / filename).open('xb') as stream:
                stream.write(data)
            if hashlib.sha256((preservation / filename).read_bytes()).digest() != hashlib.sha256(data).digest():
                raise ValueError('Metadata baseline preservation failed')
        report['target_accuracy_round'] = {
            field: summary[field] for field in (
                'created_at', 'status', 'stage', 'objective_completed', 'model_adopted',
                'independent_validation', 'target', 'all_experiment_configurations',
                'diverse_model_configurations', 'active_diverse_configurations', 'checks')}
        report['target_accuracy_round'].update(
            summary=SUMMARY, summary_sha256=hashlib.sha256((replay.ROOT / SUMMARY).read_bytes()).hexdigest(),
            previous_metadata=preservation.relative_to(replay.ROOT).as_posix())
        preview['readiness_sha256'] = service.digest(report)
        replay.publish_rehearsal(replay.ROOT / 'reports/rank-models/service-readiness.json', report, preview)
        current = load('reports/rank-models/service-readiness.json')
        current_preview = load('reports/rank-models/service-preview.json')
        pointer = load('reports/rank-models/service-current.json')
        for field, value in baseline.items():
            if service.canonical(current[field]) != service.canonical(value):
                raise ValueError(f'Original service content changed during metadata update: {field}')
        if {k: v for k, v in current_preview.items() if k != 'readiness_sha256'} != {
                k: v for k, v in original_preview.items() if k != 'readiness_sha256'}:
            raise ValueError('Preview estimates changed during metadata update')
        expected_digest = service.digest(report)
        if pointer['readiness_sha256'] != expected_digest or current_preview['readiness_sha256'] != expected_digest:
            raise ValueError('Generation pointer/readiness linkage mismatch')
        generation = 'reports/rank-models/' + pointer['generation']
        if load(generation + '/service-readiness.json') != current or load(generation + '/service-preview.json') != current_preview:
            raise ValueError('Generation aliases differ from their immutable checkpoint')
    verification = {
        'ok': True, 'configurations_checked': 47, 'new_model_families': 8,
        'accuracy_goal_met': False, 'model_promoted': False,
        'metadata_published': args.publish_metadata, 'summary': SUMMARY,
        'production_enabled': False,
    }
    service.write_atomic(replay.ROOT / 'reports/rank-models/target-5-20-verification.json',
                         verification, immutable=True)
    print(json.dumps(verification), flush=True)


if __name__ == '__main__':
    main()
