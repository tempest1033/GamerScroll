"""Verify only the new kernel sensitivity/decomposition evidence and attach it."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import service_model as service
import service_readiness as replay
from verify_target_accuracy_round import check_statistics, independent_statistics, key, load


def main() -> None:
    source = 'reports/rank-models/target-5-20-downloads-kernel-sensitivity.json'
    result = load(source)
    if result['execution_ok'] is not True or result['failures']:
        raise ValueError('Required sensitivity execution failed')
    baseline = load(result['baseline'] + '/reports/rank-models/service-readiness.json')
    reference = next(row for row in baseline['metrics'] if row['metric'] == 'downloads')
    before = {key(row): row for row in reference['validation_rows']
              if not row['reserved_family'] and 'error_pct' in row}
    available_keys = {identity for identity, row in before.items() if row['status'] == 'available'}
    counts = Counter(row['kind'] for row in result['folds'])
    if counts != {'training_family': 41, 'publication_block': 16}:
        raise ValueError('Sensitivity scenario population changed')
    measured = []
    withholding = Counter()
    for fold in result['folds']:
        checked = {}
        for side in ('before', 'after'):
            rows = {key(row): row for row in fold[side]['rows']}
            if rows.keys() != before.keys():
                raise ValueError('Fixed computable population changed')
            for identity, row in rows.items():
                for field in ('actual', 'available_on', 'source_id'):
                    if row[field] != before[identity][field]:
                        raise ValueError(f'Evaluation source changed: {identity} / {field}')
                expected = abs(row['estimate'] - row['actual']) / row['actual'] * 100
                if not math.isclose(row['error_pct'], expected, abs_tol=1e-10):
                    raise ValueError('Row error does not follow its prediction and actual')
            checked[side] = {}
            for population, identities in (('fixed_all', set(before)), ('fixed_available', available_keys)):
                selected = [rows[identity] for identity in identities]
                statistics = independent_statistics(selected)
                check_statistics(fold[side][population]['error'], statistics)
                if fold[side][population]['missing']:
                    raise ValueError('A fixed target lost its computable prediction')
                lost = {key(row) for row in selected if row['status'] != 'available'}
                if {tuple(row) for row in fold[side][population]['unavailable']} != lost:
                    raise ValueError('Withholding changes were not retained')
                checked[side][population] = statistics
                if population == 'fixed_available':
                    withholding[(fold['kind'], side)] += bool(lost)
        measured.append({'kind': fold['kind'], **checked})
    for kind in counts:
        for population in ('fixed_available', 'fixed_all'):
            for field in ('median_error_pct', 'p90_error_pct', 'max_error_pct', 'mae_log'):
                deltas = [row['after'][population][field] - row['before'][population][field]
                          for row in measured if row['kind'] == kind]
                expected = {
                    'comparable_folds': len(deltas), 'improved': sum(value < -1e-10 for value in deltas),
                    'worsened': sum(value > 1e-10 for value in deltas),
                    'unchanged': sum(abs(value) <= 1e-10 for value in deltas),
                    'best_change': min(deltas), 'worst_change': max(deltas),
                }
                check_statistics(result['summary'][kind][population][field], expected)
    decomposition = load('reports/rank-models/target-5-20-kernel-decomposition.json')
    parent = {key(row): row for row in decomposition['parent_report']['validation_rows']}
    check_statistics(decomposition['parent_comparison']['fixed_available']['after'],
                     independent_statistics([parent[identity] for identity in available_keys]))
    verification = {
        'ok': True, 'created_at': datetime.now(timezone.utc).isoformat(),
        'scenarios': dict(counts), 'all_fixed_rows': 87, 'fixed_available_rows': 26,
        'independent_statistics_verified': True, 'evaluation_amounts_sources_unchanged': True,
        'model_adopted': False, 'accuracy_goal_met': False,
        'source': source, 'source_sha256': hashlib.sha256((replay.ROOT / source).read_bytes()).hexdigest(),
        'summary': result['summary'],
        'folds_with_original_display_withheld': [
            {'kind': kind, 'side': side, 'folds': count}
            for (kind, side), count in sorted(withholding.items())],
        'decomposition': 'reports/rank-models/target-5-20-kernel-decomposition.json',
        'new_publication_block_behavior_tests_passed': 1,
        'limitations': [
            'Perturbations overlap; they are not independent accuracy confirmations.',
            'The parent-only counterfactual uses a frozen kernel selection schedule, not a new selected model.',
            'The original 5/20 accuracy objective remains unmet.',
        ],
    }
    output = 'reports/rank-models/target-5-20-kernel-verification.json'
    service.write_atomic(replay.ROOT / output, verification, immutable=True)
    current_path = 'reports/rank-models/service-readiness.json'
    current = load(current_path)
    preview = load('reports/rank-models/service-preview.json')
    original, original_preview = copy.deepcopy(current), copy.deepcopy(preview)
    folder = Path(tempfile.mkdtemp(prefix='target-5-20-kernel-metadata-baseline-',
                                  dir=replay.ROOT / 'reports/rank-models'))
    for filename in ('service-readiness.json', 'service-preview.json', 'service-current.json', 'service-health.json'):
        data = (replay.ROOT / 'reports/rank-models' / filename).read_bytes()
        with (folder / filename).open('xb') as stream:
            stream.write(data)
        if hashlib.sha256((folder / filename).read_bytes()).digest() != hashlib.sha256(data).digest():
            raise ValueError('Metadata preservation failed')
    current['target_accuracy_round']['kernel_followup'] = {
        'verification': output, 'scenarios': dict(counts), 'model_adopted': False,
        'goal_met': False, 'new_behavior_tests_passed': 1, 'summary': result['summary'],
        'previous_metadata': folder.relative_to(replay.ROOT).as_posix(),
    }
    preview['readiness_sha256'] = service.digest(current)
    replay.publish_rehearsal(replay.ROOT / current_path, current, preview)
    actual, actual_preview = load(current_path), load('reports/rank-models/service-preview.json')
    pointer = load('reports/rank-models/service-current.json')
    for field in original:
        if field != 'target_accuracy_round' and actual[field] != original[field]:
            raise ValueError(f'Service content changed: {field}')
    for field in original_preview:
        if field != 'readiness_sha256' and actual_preview[field] != original_preview[field]:
            raise ValueError(f'Preview content changed: {field}')
    if pointer['readiness_sha256'] != service.digest(actual) or actual_preview['readiness_sha256'] != service.digest(actual):
        raise ValueError('Updated generation digest mismatch')
    print(json.dumps({'ok': True, 'scenarios': dict(counts),
                      'model_adopted': False, 'metadata_updated': True,
                      'withholding': verification['folds_with_original_display_withheld']}), flush=True)


if __name__ == '__main__':
    main()
