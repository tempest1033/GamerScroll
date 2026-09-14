"""Promote the verified download-only research result to the local service aliases."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import service_model as service
import service_readiness as replay
from literature_replay import BASELINE

ORIGINAL = ('reports/rank-models/accuracy-five-hour-baseline-y63p2n4q/'
            'reports/rank-models/service-readiness.json')

EVIDENCE = [
    'literature-runtime-revenue-baseline-v2-2026-09-13.json',
    'literature-runtime-downloads-baseline-v2-2026-09-13.json',
    'literature-revenue-first-screen-2026-09-13.json',
    'literature-downloads-first-screen-2026-09-13.json',
    'literature-revenue-centered-gpboost-2026-09-13.json',
    'literature-downloads-centered-gpboost-2026-09-13.json',
    'literature-revenue-temporal-gam-2026-09-13.json',
    'literature-downloads-temporal-gam-2026-09-13.json',
    'literature-revenue-linear-mixed-2026-09-13.json',
    'literature-downloads-linear-mixed-2026-09-13.json',
    'literature-fixed-intervals-2026-09-13.json',
    'literature-revenue-combinations-2026-09-13.json',
    'literature-downloads-combinations-2026-09-13.json',
    'literature-combination-uncertainty-2026-09-13.json',
    'literature-revenue-recency-stability-2026-09-13.json',
    'literature-downloads-recency-stability-2026-09-13.json',
    'literature-revenue-recency-training-sensitivity-2026-09-13.json',
    'literature-downloads-recency-training-sensitivity-2026-09-13.json',
    'literature-recency-training-summary-2026-09-13.json',
    'literature-recency-uncertainty-2026-09-13.json',
    'literature-recency-reserved-review-2026-09-13.json',
    'literature-revenue-recency-multigroup-2026-09-13.json',
    'literature-downloads-recency-multigroup-2026-09-13.json',
    'literature-recency-multigroup-summary-2026-09-13.json',
    'literature-adoption-verification-2026-09-13.json',
    'literature-adoption-render-verification-2026-09-13.json',
]


def compare_rows(before: dict, after: dict, available_only: bool) -> dict:
    previous = {replay.key(row): row for row in before['validation_rows']
                if 'error_pct' in row and (not available_only or row['status'] == 'available')}
    current = {replay.key(row): row for row in after['validation_rows']}
    if any(name not in current or 'error_pct' not in current[name] for name in previous):
        raise ValueError('An original computable target was lost')
    for name, row in previous.items():
        if current[name]['actual'] != row['actual']:
            raise ValueError(f'An original target amount changed: {name}')
    return {
        'row_keys': [list(name) for name in sorted(previous)],
        'before': service.error_summary(list(previous.values())),
        'after': service.error_summary([current[name] for name in previous]),
        'still_available': sum(current[name]['status'] == 'available' for name in previous)}


def main() -> None:
    output = replay.ROOT / 'reports/rank-models/service-readiness.json'
    baseline = json.loads((replay.ROOT / BASELINE).read_text(encoding='utf-8'))
    original = json.loads((replay.ROOT / ORIGINAL).read_text(encoding='utf-8'))
    previous = json.loads(output.read_text(encoding='utf-8'))
    directory = output.parent / 'literature-adoption'
    current = json.loads((directory / 'service-readiness.json').read_text(encoding='utf-8'))
    preview = json.loads((directory / 'service-preview.json').read_text(encoding='utf-8'))
    for field in ('metrics', 'policy', 'frozen_models', 'identity_audit', 'latest_rank_day'):
        if service.canonical(previous[field]) != service.canonical(baseline[field]):
            raise ValueError(f'The service alias changed; reconcile before promotion: {field}')
    if current['production_enabled'] or current['release_ready']:
        raise ValueError('This checkpoint is internal research only')
    for name in ('literature-adoption-verification-2026-09-13.json',
                 'literature-adoption-render-verification-2026-09-13.json'):
        if json.loads((output.parent / name).read_text(encoding='utf-8')).get('ok') is not True:
            raise ValueError(f'Required integration verification failed: {name}')
    comparisons = {}
    for metric in ('consumer_spend', 'downloads'):
        before = next(item for item in baseline['metrics'] if item['metric'] == metric)
        after = next(item for item in current['metrics'] if item['metric'] == metric)
        comparisons[metric] = {
            'same_computable': compare_rows(before, after, False),
            'same_round_start_available': compare_rows(before, after, True),
            'interval_hit_rate_before': before['assessment']['interval_hit_rate'],
            'interval_hit_rate_after': after['assessment']['interval_hit_rate']}
    comparisons['original_download_available'] = compare_rows(
        next(item for item in original['metrics'] if item['metric'] == 'downloads'),
        next(item for item in current['metrics'] if item['metric'] == 'downloads'), True)
    comparison_path = output.parent / 'literature-adoption-same-targets-2026-09-13.json'
    comparison = {
        'kind': 'fixed_cohort_retrospective_comparison', 'execution_ok': True,
        'production_enabled': False, 'baseline': BASELINE, 'original_baseline': ORIGINAL,
        'adopted_report': str((directory / 'service-readiness.json').relative_to(replay.ROOT)),
        'comparisons': comparisons,
        'limitations': ['Repeated retrospective evaluation, not prospective or independent validation.',
                        'Targets remain AppMagic estimates, not publisher accounting records.']}
    service.write_atomic(comparison_path, comparison, immutable=True)
    evidence_paths = ['reports/rank-models/' + name for name in EVIDENCE]
    evidence_paths.append(comparison_path.relative_to(replay.ROOT).as_posix())
    current['literature_round'] = {
        'status': 'in_progress', 'model_adopted': True,
        'adoption_scope': 'download_candidate_selection_only',
        'approved_new_minutes': 300,
        'started_at': '2026-09-13T18:56:24.827+09:00',
        'deadline_at': '2026-09-13T23:56:24.827+09:00',
        'checkpoint_created_at': datetime.now(timezone.utc).isoformat(),
        'baseline': BASELINE,
        'previous_checkpoint': f'reports/rank-models/service-runs/{service.digest(previous)[:24]}/service-readiness.json',
        'research_note': 'docs/research/rank-model-literature-round-2026-09-13.md',
        'evidence_sha256': replay.hashes(evidence_paths),
        'same_target_comparison': comparison_path.relative_to(replay.ROOT).as_posix(),
        'decision': ('Enable only the frozen download recency-stability rule. Retain revenue selection; '
                     'do not adopt GPBoost, pyGAM, spline augmentation, forecast combinations or new intervals.'),
        'rule_limitations': [
            'The paired game/month scale is a selection heuristic, not a valid clustered confidence interval.',
            'Multi-family perturbations overlap; some download scenarios regress and are preserved.',
            'Reserved-family outcomes were reviewed after freezing; they did not tune the rule.',
            'The final current fitted coefficients are unchanged; historical July selection and calibration changed.',
            'The new result is still retrospective and does not establish prospective accuracy.'],
        'public_release_gates_unchanged': True, 'commit_push_deployment_performed': False}
    preview['readiness_sha256'] = service.digest(current)
    replay.publish_rehearsal(output, current, preview)
    print(json.dumps({
        'checkpoint_attached': True, 'model_adopted': True,
        'adoption_scope': current['literature_round']['adoption_scope'],
        'same_target_summary': {name: {key: value for key, value in item.items() if key != 'row_keys'}
                                for name, item in comparisons['downloads'].items()
                                if isinstance(item, dict)},
        'original_25_after': comparisons['original_download_available']['after'],
        'evidence_files': len(evidence_paths), 'readiness_sha256': service.digest(current),
        'goal_round_status': current['literature_round']['status']}))


if __name__ == '__main__':
    main()
