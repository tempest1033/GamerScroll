"""Verify the reviewed 2026-09-13 source-to-ledger supplement and report its yield."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import history_fit as fit
from service_model import canonical, error_summary, monthly_labels, write_atomic
from service_readiness import ROOT, audit_identity, key

BASELINE = ROOT / 'reports/rank-models/service-supplement-baseline-18nkf9kj'
MANUAL = ROOT / 'docs/research/anchors/manual/2026-09-13-service-supplement.json'
EVIDENCE = ROOT / 'reports/rank-models/service-supplement-evidence-2026-09-13.json'

# Expected values independently transcribed from the observed article passages.
EXPECTED_GROSS = [
    ('P01', '2026-01', 'Clash Royale', 37), ('P01', '2026-01', 'PUBG Mobile', 147),
    ('P01', '2025-12', 'PUBG Mobile', 76.1), ('S01', '2026-01', 'Brawl Stars', 30.8),
    ('S02', '2026-07', 'Smash Fest', 3.4), ('PGS01', '2026-02', 'Pikmin Bloom', 3.7),
    ('PGS01', '2026-05', 'Pikmin Bloom', 8.7), ('PGS01', '2026-06', 'Pikmin Bloom', 7.1),
    ('PGS02', '2026-01', 'Pixel Flow', 22.7), ('PGS02', '2026-04', 'Pixel Flow', 27),
]
EXPECTED_DOWNLOADS = [
    ('PGD01', '2026-01', 'Color Block: Combo Blast', 9.4), ('PGD01', '2026-01', 'Royal Kingdom', 10),
    ('PGD01', '2026-01', 'Heartopia', 12.2), ('PGD01', '2026-01', 'Gossip Harbor', 8.9),
    ('PGD01', '2026-01', 'Arrows: Puzzle Escape', 11.7), ('PGD03', '2026-03', 'Subway Surfers City', 11.9),
    ('PGD03', '2026-03', 'Subway Surfers', 13.5), ('PGD03', '2026-03', 'Super Bear Adventure', 8.1),
    ('PGD06', '2026-06', 'Meowdoku', 10.1), ('PGD06', '2026-06', 'Fortnite', 8.6),
    ('PGD06', '2026-06', 'Football League 2026', 9.4), ('PGS02', '2026-01', 'Pixel Flow', 4.8),
]


def main() -> None:
    raw = fit.ledger_rows()
    sources = json.loads((ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    before = [json.loads(line) for line in (BASELINE / 'docs/research/anchors/anchors.jsonl').read_text(
        encoding='utf-8').splitlines() if line.strip()]
    old_sources = json.loads((BASELINE / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    old_names = set(json.loads((BASELINE / 'docs/research/anchors/identities.json').read_text(
        encoding='utf-8'))['games'])
    names = set(fit.identity_families()[1])
    evidence = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    for metric, expected in [('consumer_spend', EXPECTED_GROSS), ('downloads', EXPECTED_DOWNLOADS)]:
        for source, month, game, amount in expected:
            matched = [r for r in raw if r['source_id'] == source and r.get('game_key') == game
                       and r.get('metric') == metric and fit.period_key(r['period']) == month]
            assert len(matched) == 1, (source, month, game, matched)
            row = matched[0]
            assert fit.label_amount(row) == amount
            assert row['currency'] == ('USD' if metric == 'consumer_spend' else 'COUNT')
            assert row['fee_basis'] == ('gross' if metric == 'consumer_spend' else 'unspecified')
            assert row['review_status'] == 'clear' and row['geography'] == 'WW'
            assert sorted(row['stores']) == ['app_store', 'google_play']
    measures = {}
    for metric in ('consumer_spend', 'downloads'):
        old, _ = monthly_labels(before, old_sources, old_names, metric, '2026-09-13')
        new, _ = monthly_labels(raw, sources, names, metric, '2026-09-13')
        old_keys = {key(r) for r in old}
        novel = [r for r in new if key(r) not in old_keys]
        measures[metric] = {'before': len(old), 'after': len(new), 'novel': [
            {k: r[k] for k in ('family', 'month', 'class', 'amount_usd_m', 'source_id')} for r in novel]}
    assert sources['PGS01']['published_on'] == '2026-07-01'
    assert sources['PGS02']['published_on'] == '2026-08-24'
    assert len(evidence['identity_checks']) == 3
    old_report = json.loads((BASELINE / 'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    current = json.loads((ROOT / 'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    assert current['policy'] == old_report['policy'], 'Release thresholds must not be weakened'
    comparisons = {}
    for old_metric, new_metric in zip(old_report['metrics'], current['metrics']):
        assert old_metric['metric'] == new_metric['metric']
        old_rows = {key(r): r for r in old_metric['validation_rows'] if 'error_pct' in r}
        new_rows = {key(r): r for r in new_metric['validation_rows'] if 'error_pct' in r}
        shared = sorted(old_rows.keys() & new_rows.keys())
        comparisons[new_metric['metric']] = {
            'shared_before': error_summary([old_rows[k] for k in shared]),
            'shared_after': error_summary([new_rows[k] for k in shared]),
            'all_after': new_metric['assessment'],
            'new_computable_rows': len(new_rows.keys() - old_rows.keys())}
    result = {'schema_version': 1, 'production_enabled': False, 'passed': True,
              'checked_source_rows': len(EXPECTED_GROSS) + len(EXPECTED_DOWNLOADS),
              'ledger_rows_before': len(before), 'ledger_rows_after': len(raw),
              'identity_audit': audit_identity(), 'yield': measures,
              'model_comparison': comparisons, 'release_policy_unchanged': True,
              'manual_sha256': hashlib.sha256(MANUAL.read_bytes()).hexdigest(),
              'evidence_sha256': hashlib.sha256(EVIDENCE.read_bytes()).hexdigest(),
              'baseline': str(BASELINE.relative_to(ROOT))}
    write_atomic(ROOT / 'reports/rank-models/service-supplement-verification.json', result)
    print(canonical(result).decode())


if __name__ == '__main__':
    main()
