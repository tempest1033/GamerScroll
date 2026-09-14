"""Check each stated condition of this round against the artifacts on disk.

Every line prints the evidence it found, not a claim, so a condition with no
artifact shows up as MISSING rather than passing quietly. Research only.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / 'reports/rank-models'


def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def count(value) -> int:
    """Collector reports write a count for some fields and a list for others."""
    if value is None:
        return 0
    return value if isinstance(value, int) else len(value)


def shown(path: Path) -> str:
    """Project-relative when possible; an outside path prints in full."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def check(name: str, path: Path, describe) -> tuple[str, str]:
    payload = load(path)
    if payload is None:
        return name, f'MISSING {shown(path)}'
    try:
        return name, describe(payload)
    except Exception as error:  # a malformed artifact is evidence too
        return name, f'UNREADABLE {shown(path)}: {error!r}'


def main() -> None:
    session = REPORTS / 'sustained-rank-observations-2026-09-11/session-F5mbni/observations.json'
    results = [
        check('isolated sampling, failures preserved', session, lambda payload: (
            f"{len(payload['samples'])} rounds, status {payload['status']}, "
            f"charts collected {sum(audit['report']['collected'] for sample in payload['samples'] for audit in sample['audits'])}"
            f"/{sum(audit['report']['expected'] for sample in payload['samples'] for audit in sample['audits'])}, "
            f"failed {sum(1 for sample in payload['samples'] for audit in sample['audits'] for chart in audit['report']['charts'].values() if chart['status'] != 'ok')}, "
            f"statuses {sorted({audit['report']['status'] for sample in payload['samples'] for audit in sample['audits']})}")),
        check('data-estimated parameters', REPORTS / 'model-card-2026-09-11.json', lambda payload: (
            f"{payload['selected_model']['variant']} params {payload['selected_model']['params']}, "
            f"production_enabled {payload['production_enabled']}")),
        check('unseen validation subset', REPORTS / 'model-card-2026-09-11.json', lambda payload: (
            f"{len(payload['performance']['reserved_holdout']['holdout_games'])} reserved games, "
            f"{payload['performance']['reserved_holdout']['predicted_labels']} labels, "
            f"median {payload['performance']['reserved_holdout']['median_abs_pct']:.1f}%")),
        check('amount error', REPORTS / 'model-card-2026-09-11.json', lambda payload: (
            f"nested CV {payload['performance']['nested_cv_rmse_log']:.3f} "
            f"(median {payload['performance']['nested_cv_median_abs_pct']:.1f}%)")),
        check('ordering reported separately', REPORTS / 'ordering-check-2026-09-11.json', lambda payload: (
            f"clear-pair agreement {payload['overall_clear_agreement']}")),
        check('coverage reported separately', REPORTS / 'coverage-share-3day-2026-09-11.json', lambda payload: (
            'days ' + ', '.join(f"{row['date']} median {row['median_five_market_share']:.2f}"
                                for row in payload['days']))),
        check('stability reported separately', REPORTS / 'round-stability-2026-09-11.json', lambda payload: (
            f"{len(payload['consecutive_rounds'])} round pairs, "
            f"min tau {min(row['kendall_tau_top'] for row in payload['consecutive_rounds']):.3f}")),
        check('uncertainty honesty', REPORTS / 'band-coverage-2026-09-11.json', lambda payload: (
            f"reserved coverage {payload['reserved_games']['coverage_pct']:.1f}%, "
            f"held-out p90 factor {payload['empirical_error_reserved']['p90_factor']:.3f}")),
        check('market constraint dependence', REPORTS / 'market-total-sensitivity-2026-09-11.json',
              lambda payload: 'worst median move ' + str(round(max(
                  row['median_amount_move_pct'] or 0 for row in payload['comparisons']), 2)) + '%'),
        check('snapshot weighting', REPORTS / 'snapshot-weighting-2026-09-11.json', lambda payload: (
            f"{payload['snapshots']} snapshots, {payload['distinct_states']} states, "
            f"median move {payload['comparison']['median_index_move_pct']:.2f}%")),
        check('store refresh behaviour', REPORTS / 'refresh-rate-2026-09-11.json', lambda payload: (
            f"{payload['comparisons']} comparisons, "
            f"{sum(1 for event in payload['refresh_events'] if event['store'] == 'ios')} App Store republishes")),
        check('archive integrity', REPORTS / 'archive-gaps-2026-09-11.json', lambda payload: (
            f"{len(payload['days'])} days {payload['first']}..{payload['last']}, "
            f"missing {len(payload['missing_days'])}, partial {len(payload['partial_days'])}")),
        check('pipeline reproduces', REPORTS / 'pipeline-run-2026-09-11.json', lambda payload: (
            f"{len(payload['steps'])} steps, ok {payload['ok']}, {payload['total_seconds']:.1f}s")),
    ]
    ledger = (ROOT / 'docs/research/anchors/anchors.jsonl')
    rows = [json.loads(line) for line in ledger.read_text(encoding='utf-8').splitlines() if line.strip()]
    results.append(('monetary anchors expanded',
                    f"{len(rows)} rows, {sum(1 for row in rows if row['fit']['usable'])} fit-usable, "
                    f"periods {min(row['period']['start'] or '9999' for row in rows)}.."
                    f"{max(row['period']['start'] or '' for row in rows)}"))
    width = max(len(name) for name, _ in results)
    missing = [name for name, evidence in results if evidence.startswith(('MISSING', 'UNREADABLE'))]
    for name, evidence in results:
        print(f'{name:<{width}}  {evidence}')
    print(f'\n{len(results) - len(missing)}/{len(results)} conditions have artifacts on disk')
    output = ROOT / 'reports/rank-models/round-audit-2026-09-11.json'
    output.write_text(json.dumps({
        'schema_version': 1,
        'production_enabled': False,
        'meaning': ('Each condition of this round checked against the artifact that would prove it. '
                    'A condition without its artifact reports MISSING instead of passing silently. '
                    'When run as a pipeline step the pipeline-run line describes the previous '
                    'complete run, because the current one writes its report last.'),
        'conditions': [{'condition': name, 'evidence': evidence} for name, evidence in results],
        'conditions_with_evidence': len(results) - len(missing),
        'conditions_total': len(results),
        'missing': missing,
    }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
