"""Check the integrated download-only rule against independent preserved results."""
from __future__ import annotations

import json
from pathlib import Path

import service_model as service
import service_readiness as replay
from literature_replay import BASELINE


def main() -> None:
    directory = replay.ROOT / 'reports/rank-models/literature-adoption'
    current = json.loads((directory / 'service-readiness.json').read_text(encoding='utf-8'))
    preview = json.loads((directory / 'service-preview.json').read_text(encoding='utf-8'))
    baseline = json.loads((replay.ROOT / BASELINE).read_text(encoding='utf-8'))
    reviewed = json.loads((replay.ROOT /
                           'reports/rank-models/literature-recency-reserved-review-2026-09-13.json')
                          .read_text(encoding='utf-8'))
    checks = {
        'public_disabled': current['production_enabled'] is False and preview['production_enabled'] is False,
        'release_withheld': current['release_ready'] is False and preview['release_ready'] is False,
        'policy_unchanged': current['policy'] == baseline['policy'],
        'identity_unchanged': current['identity_audit'] == baseline['identity_audit'],
        'preview_hash_matches': preview['readiness_sha256'] == service.digest(current),
        'preview_is_not_prospective': preview['kind'] == 'in_sample_internal_preview',
        'as_of_unchanged': current['as_of'] == preview['as_of'] == baseline['as_of'],
        'review_execution_succeeded': reviewed['execution_ok'] is True and reviewed['completed'] is True}
    metrics = []
    for metric in ('consumer_spend', 'downloads'):
        actual = next(item for item in current['metrics'] if item['metric'] == metric)
        expected = (next(item for item in baseline['metrics'] if item['metric'] == metric)
                    if metric == 'consumer_spend' else
                    next(item['report'] for item in reviewed['metrics'] if item['metric'] == metric))
        checks[metric + '_matches_independent_expected_report'] = service.canonical(
            {key: value for key, value in actual.items() if key != 'seconds'}) == service.canonical(
            {key: value for key, value in expected.items() if key != 'seconds'})
        frozen_path = (replay.ROOT / current['frozen_models'][metric]).resolve()
        frozen_path.relative_to(replay.ROOT.resolve())
        frozen = json.loads(frozen_path.read_text(encoding='utf-8'))
        old = json.loads((replay.ROOT / baseline['frozen_models'][metric]).read_text(encoding='utf-8'))
        replay.validate_frozen(frozen)
        checks[metric + '_source_data_unchanged'] = frozen['source_hashes'] == old['source_hashes']
        checks[metric + '_current_final_coefficients_unchanged'] = frozen['model'] == old['model']
        checks[metric + '_frozen_policy_unchanged'] = frozen['policy'] == baseline['policy']
        changed = {name for name, value in frozen['inference_input_hashes'].items()
                   if old['inference_input_hashes'].get(name) != value}
        checks[metric + '_only_expected_core_dependencies_changed'] = changed == {
            'scripts/revenue-research/service_model.py',
            'scripts/revenue-research/service_readiness.py'}
        metrics.append({
            'metric': metric, 'all_computable_error': actual['assessment']['all_computable_error'],
            'served_error': actual['assessment']['served_error'],
            'interval_hit_rate': actual['assessment']['interval_hit_rate'],
            'catalog_available': sum(row['status'] == 'available' for item in preview['metrics']
                                     if item['metric'] == metric for row in item['rows'])})
    record = {'ok': all(checks.values()), 'checks': checks, 'metrics': metrics,
              'production_enabled': False, 'adoption_scope': 'download_candidate_selection_only',
              'verification': 'integrated output compared with pre-integration baseline/proposal, not itself'}
    output = replay.ROOT / 'reports/rank-models/literature-adoption-verification-2026-09-13.json'
    service.write_atomic(output, record, immutable=True)
    print(json.dumps(record))
    if not record['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
