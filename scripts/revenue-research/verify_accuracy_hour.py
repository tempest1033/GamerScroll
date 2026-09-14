"""Verify the dated accuracy round against preserved inputs, not output-derived expectations."""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import statistics
from pathlib import Path

import history_fit as fit
import service_readiness as run
from harvest_monthly_charts import strip_html
from service_model import canonical, error_summary, monthly_labels, write_atomic


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def paired_family_resampling(before: dict, after: dict, draws: int = 2000) -> dict:
    """Descriptive paired family-cluster bootstrap, not prospective confidence."""
    keys = sorted(before.keys() & after.keys())
    games = sorted({key[0] for key in keys})
    blocks = {game: [key for key in keys if key[0] == game] for game in games}
    rng = random.Random(20260913)
    changes = []
    for _ in range(draws):
        sample = [key for game in rng.choices(games, k=len(games)) for key in blocks[game]]
        changes.append(statistics.median(after[key]['error_pct'] for key in sample) -
                       statistics.median(before[key]['error_pct'] for key in sample))
    changes.sort()
    return {'draws': draws, 'sampling_unit': 'family', 'seed': 20260913,
            'median_error_change_pp_95pct_resampling_interval':
                [changes[int(draws * 0.025)], changes[int(draws * 0.975) - 1]],
            'limitation': 'Conditional historical sensitivity; shared month shocks and model-selection uncertainty are not covered.'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default='reports/rank-models/accuracy-hour-baseline-ptjbpbna')
    parser.add_argument('--model-only', default='reports/rank-models/accuracy-hour-model-only-cvupkssy')
    parser.add_argument('--source-stage', default='reports/rank-models/accuracy-hour-source-stage-2026-09-13.json')
    parser.add_argument('--output', default='reports/rank-models/accuracy-hour-verification-2026-09-13.json')
    args = parser.parse_args()
    baseline = run.ROOT / args.baseline
    before = read(baseline / 'reports/rank-models/service-readiness.json')
    model_only = read(run.ROOT / args.model_only / 'service-readiness.json')
    source_stage = read(run.ROOT / args.source_stage)
    current = read(run.ROOT / 'reports/rank-models/service-readiness.json')
    old_ledger = {row['id']: row for row in map(json.loads,
                  (baseline / 'docs/research/anchors/anchors.jsonl').read_text(encoding='utf-8').splitlines())}
    raw = fit.ledger_rows()
    ledger = {row['id']: row for row in raw}
    added = ledger.keys() - old_ledger.keys()
    assert len(added) == 1, f'Expected one new source row, found {len(added)}'
    assert old_ledger.keys() <= ledger.keys()
    assert all(ledger[key] == row for key, row in old_ledger.items()), 'Existing source evidence changed'
    new = ledger[next(iter(added))]
    expected = {
        'game_key': 'Meowdoku', 'geography': 'WW', 'stores': ['app_store', 'google_play'],
        'amount': 779000, 'unit_multiplier': 1, 'currency': 'COUNT', 'metric': 'downloads',
        'source_id': 'PGD06', 'provider': 'AppMagic', 'qualifier': None,
        'review_status': 'clear', 'evidence_role': 'benchmark',
    }
    assert all(new[key] == value for key, value in expected.items())
    assert {k: new['period'][k] for k in ['kind', 'start', 'end']} == {
        'kind': 'month', 'start': '2026-05-01', 'end': '2026-05-31'}
    sources = read(run.ROOT / 'docs/research/anchors/sources.json')
    assert sources == read(baseline / 'docs/research/anchors/sources.json')
    assert sources['PGD06']['published_on'] == '2026-07-29'
    html_path = run.ROOT / 'reports/rank-models/monthly-chart-articles/june-2026-mobile-game-charts.html'
    source = strip_html(html_path.read_text(encoding='utf-8'))
    subject = "The clear success story when it comes to installs this June was Oakever Games’ Meowdoku: Brain Puzzle Games"
    quote = "After picking up 779,000 downloads in its launch month of May, this title exploded in June with 10.1m new installs"
    assert subject in source and quote in source
    assert 0 < source.index(quote) - source.index(subject) < 1000
    _, names = fit.identity_families()
    early, _ = monthly_labels(raw, sources, set(names), 'downloads', '2026-07-01')
    later, _ = monthly_labels(raw, sources, set(names), 'downloads', '2026-08-01')
    new_key = ('Meowdoku', '2026-05', 'downloads')
    assert new_key not in {run.key(row) for row in early}
    label = next(row for row in later if run.key(row) == new_key)
    assert label['amount_usd_m'] * 1e6 == 779000
    assert before['policy'] == model_only['policy'] == current['policy']
    assert not current['release_ready'] and not current['production_enabled']
    assert current['identity_audit'] == before['identity_audit']
    results = []
    for old_metric, model_metric, source_metric, metric in zip(
            before['metrics'], model_only['metrics'], source_stage['metrics'], current['metrics']):
        assert old_metric['metric'] == model_metric['metric'] == metric['metric']
        old_rows = {run.key(row): row for row in old_metric['validation_rows']}
        model_rows = {run.key(row): row for row in model_metric['validation_rows']}
        source_rows = {run.key(row): row for row in source_metric['validation_rows']}
        rows = {run.key(row): row for row in metric['validation_rows']}
        assert old_rows.keys() <= rows.keys(), 'A difficult target was removed'
        assert old_rows.keys() == model_rows.keys(), 'Model-only comparison changed target membership'
        for key in old_rows:
            assert old_rows[key].get('actual') == rows[key].get('actual'), 'A pre-existing outcome changed'
            if key[1] <= '2026-06':
                assert source_rows[key].get('estimate') == model_rows[key].get('estimate'), 'Late source leaked into an early prediction'
        if metric['metric'] == 'consumer_spend':
            assert rows == old_rows, 'Revenue predictions changed without an adopted revenue intervention'
        else:
            assert rows.keys() - old_rows.keys() == {new_key}
            assert rows[new_key]['actual'] == 779000
            assert rows[new_key]['reason'] == 'first_observed_month_not_validated'
            development = read(run.ROOT / 'reports/rank-models/accuracy-hour-download-robust-within-2026-09-13.json')
            for expected_row in development['results'][0]['nonreserved_rows']:
                actual_row = rows[run.key(expected_row)]
                assert actual_row.get('estimate') == expected_row.get('estimate'), 'Adopted model differs from the development decision'
        old_computable = {key: row for key, row in old_rows.items() if 'error_pct' in row}
        common = {key: rows[key] for key in old_computable}
        assert all('error_pct' in row for row in common.values())
        results.append({
            'metric': metric['metric'],
            'common_before': error_summary(list(old_computable.values())),
            'common_after': error_summary(list(common.values())),
            'all_after': metric['assessment']['all_computable_error'],
            'model_only_after': model_metric['assessment']['all_computable_error'],
            'source_stage_after': source_metric['assessment']['all_computable_error'],
            'reserved_before': old_metric['reserved_family_error'],
            'reserved_after': metric['reserved_family_error'],
            'served_before': old_metric['assessment']['served_error'],
            'served_after': metric['assessment']['served_error'],
            'interval_hit_rate_before': old_metric['assessment']['interval_hit_rate'],
            'interval_hit_rate_after': metric['assessment']['interval_hit_rate'],
            'catalog_available_before': round(old_metric['assessment']['catalog_served_fraction'] *
                                              old_metric['assessment']['catalog_rows']),
            'catalog_available_after': round(metric['assessment']['catalog_served_fraction'] *
                                             metric['assessment']['catalog_rows']),
            'paired_sensitivity': paired_family_resampling(old_computable, common),
        })
    report = {
        'checks_passed': True, 'production_enabled': False, 'as_of': current['as_of'],
        'baseline': args.baseline, 'model_only': args.model_only, 'source_stage': args.source_stage,
        'preserved_source_rows': len(old_ledger), 'new_source_rows': len(added),
        'source_evidence': {'url': sources['PGD06']['url'], 'published_on': '2026-07-29',
                            'cached_html': str(html_path.relative_to(run.ROOT)),
                            'sha256': hashlib.sha256(html_path.read_bytes()).hexdigest(),
                            'subject': subject, 'quote': quote, 'expected_installs': 779000},
        'unchanged_release_policy': True, 'no_removed_computable_targets': True,
        'late_publication_does_not_change_early_predictions': True,
        'readiness_sha256': hashlib.sha256(canonical(current)).hexdigest(),
        'results': results,
    }
    write_atomic(run.ROOT / args.output, report)
    print(json.dumps({'checks_passed': True, 'output': args.output, 'results': results}, ensure_ascii=False))


if __name__ == '__main__':
    main()
