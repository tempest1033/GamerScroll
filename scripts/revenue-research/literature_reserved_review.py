"""Review the frozen recency policy on reserved families without tuning it."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import history_fit as fit
import literature_recency as recency
import service_model as service
import service_readiness as replay
from literature_replay import BASELINE, preserve_experiment_sources
from service_inputs import load_service_payloads


def main() -> None:
    baseline = json.loads((replay.ROOT / BASELINE).read_text(encoding='utf-8'))
    if service.canonical(baseline['policy']) != service.canonical(service.POLICY):
        raise ValueError('The release policy changed before reserved review')
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, paths = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    record = {
        'kind': 'reserved_family_review_after_recency_policy_freeze',
        'policy_frozen_before_review': True, 'retrospective_not_pristine_holdout': True,
        'production_enabled': False, 'release_policy_changed': False,
        'execution_ok': False, 'completed': False, 'metrics': [],
        'experiment_sources': preserve_experiment_sources([Path(__file__)]),
        'input_hashes': replay.hashes([
            BASELINE, 'docs/research/anchors/anchors.jsonl',
            'docs/research/anchors/sources.json', replay.CONFIG, *paths.values()]),
        'limitations': [
            'Reserved outcomes did not choose or tune the new recency rule.',
            'The same reserved games were inspected in previous rounds.',
            'The review is not a new prospective month or independent provider.',
            'Historical source revisions and fixed market tables retain their disclosed limitations.']}
    output = replay.ROOT / 'reports/rank-models/literature-recency-reserved-review-2026-09-13.json'
    service.write_atomic(output, record, immutable=True)
    try:
        for metric in ('consumer_spend', 'downloads'):
            before = next(item for item in baseline['metrics'] if item['metric'] == metric)
            with patch.object(replay, 'select_candidate', side_effect=recency.select):
                after, _, _ = replay.evaluate_metric(
                    metric, raw, sources, payloads, names, baseline['as_of'])
            old_rows = {replay.key(row): row for row in before['validation_rows']}
            new_rows = {replay.key(row): row for row in after['validation_rows']}
            if old_rows.keys() != new_rows.keys():
                raise ValueError('Reserved review changed the target population')
            for key, old in old_rows.items():
                new = new_rows[key]
                if ('estimate' in old) != ('estimate' in new):
                    raise ValueError(f'Computability changed: {key}')
                for field in ('actual', 'source_id', 'available_on', 'reserved_family'):
                    if old.get(field) != new.get(field):
                        raise ValueError(f'Review source evidence changed: {key}/{field}')
            result = {
                'metric': metric,
                'all_computable_before': before['assessment']['all_computable_error'],
                'all_computable_after': after['assessment']['all_computable_error'],
                'reserved_before': before['reserved_family_error'],
                'reserved_after': after['reserved_family_error'],
                'served_before': before['assessment']['served_error'],
                'served_after': after['assessment']['served_error'],
                'interval_hit_rate_before': before['assessment']['interval_hit_rate'],
                'interval_hit_rate_after': after['assessment']['interval_hit_rate'],
                'report': after}
            record['metrics'].append(result)
            service.write_atomic(output, record)
            print(json.dumps({key: value for key, value in result.items() if key != 'report'}), flush=True)
        record.update(execution_ok=True, completed=True)
        service.write_atomic(output, record)
    except Exception as error:
        record.update(error_type=type(error).__name__, error=str(error))
        service.write_atomic(output, record)
        raise


if __name__ == '__main__':
    main()
