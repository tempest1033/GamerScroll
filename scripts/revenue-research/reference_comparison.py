"""Compare the fitted model against ledger rows that are not allowed to fit it.

Some August rows are reference-only: another vendor's modelled estimate, a
pending review, or an unstated fee basis. They must not enter the fit, but they
can still be checked against it. Ordering is compared directly, and levels only
after one free scale per source, because an unstated basis carries an unknown
constant. Research only.
"""
from __future__ import annotations

import argparse
import json
import math

import numpy as np

from coverage_share import ROOT
from round_stability import kendall_tau
from score_day import load_model, score_day
from september_day_check import coverage_for, read_archive_day, resolve_family

LEDGER = 'docs/research/anchors/anchors.jsonl'


STORE_SCOPES = {('app_store', 'google_play'): ('ios', 'aos'), ('app_store',): ('ios',)}


def reference_rows(ledger_path, period: dict, fitted_anchor_ids: set[str]) -> list[dict]:
    """August consumer-spend rows the fit never saw, kept with their reason."""
    rows = []
    for line in ledger_path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        fit = row.get('fit') or {}
        if (row['id'] in fitted_anchor_ids
                or row['metric'] != 'consumer_spend' or row['period'].get('start') != period['start']
                or row['period'].get('end') != period['end'] or fit.get('usable')
                or row['mapping_status'] != 'mapped' or row.get('duplicate_of')
                or not row.get('amount_usd_m')):
            continue
        if tuple(sorted(row['stores'])) not in STORE_SCOPES:
            continue  # iOS App Store and Google Play only
        family = resolve_family(row.get('store_ids'))
        if not family:
            continue
        rows.append({'game': row['game'], 'family': family, 'geography': row['geography'],
                     'amount_usd_million': row['amount_usd_m'], 'provider': row['provider'],
                     'source_id': row['source_id'], 'fee_basis': row['fee_basis'],
                     'currency': row['currency'], 'anchor_id': row['id'],
                     'stores': sorted(row['stores']),
                     'excluded_because': fit.get('reasons', [])})
    return rows


def month_index(dates: list[str], params: dict, stores: tuple = ('ios', 'aos')) -> dict:
    """Mean per-snapshot index per game over the month's archived days."""
    totals: dict[str, list[float]] = {}
    used = []
    for date in dates:
        try:
            day = read_archive_day(date)
        except FileNotFoundError:
            continue
        used.append(date)
        scoped = {'date': day['date'],
                  'lists': {key: rows for key, rows in day['lists'].items()
                            if key.split('_')[0] in stores}}
        scored = score_day(scoped, params)
        for game, value in scored['family_totals'].items():
            totals.setdefault(game, []).append(value)
    return {'index': {game: float(np.mean(values)) for game, values in totals.items()},
            'days_used': used}


def month_dates(period: dict) -> list[str]:
    from datetime import date, timedelta
    first, last = date.fromisoformat(period['start']), date.fromisoformat(period['end'])
    return [(first + timedelta(days=offset)).isoformat() for offset in range((last - first).days + 1)]


def compare(rows: list[dict], index: dict, coverage: dict) -> dict:
    priced, skipped = [], []
    for row in rows:
        value = index.get(row['family'])
        if value is None:
            skipped.append({**row, 'skipped': 'absent from the five archived markets'})
            continue
        try:
            share = coverage_for(coverage, row['family']) if row['geography'] == 'WW' else 1.0
        except KeyError:
            skipped.append({**row, 'skipped': 'no measured coverage share'})
            continue
        priced.append({**row, 'index': value / share})
    by_source: dict[str, list[dict]] = {}
    for row in priced:
        by_source.setdefault(f"{row['source_id']}|{'+'.join(row.get('stores', []))}", []).append(row)
    sources = []
    for source, group in sorted(by_source.items()):
        store_scope = group[0].get('stores', [])
        logs = [math.log(row['amount_usd_million'] / row['index']) for row in group]
        scale = math.exp(sum(logs) / len(logs))
        errors = [abs(row['index'] * scale / row['amount_usd_million'] - 1) * 100 for row in group]
        published_order = [row['family'] for row in sorted(group, key=lambda row: -row['amount_usd_million'])]
        model_order = [row['family'] for row in sorted(group, key=lambda row: -row['index'])]
        sources.append({
            'source_id': group[0]['source_id'], 'store_scope': store_scope,
            'provider': group[0]['provider'], 'rows': len(group),
            'fee_basis': group[0]['fee_basis'], 'fitted_scale': scale,
            'median_abs_error_pct_after_one_scale': float(np.median(errors)),
            'worst_abs_error_pct_after_one_scale': float(np.max(errors)),
            'kendall_tau_order': kendall_tau(published_order, model_order),
            'games': [{'game': row['game'], 'published_usd_million': row['amount_usd_million'],
                       'model_priced_usd_million': row['index'] * scale,
                       'abs_error_pct': abs(row['index'] * scale / row['amount_usd_million'] - 1) * 100}
                      for row in sorted(group, key=lambda row: -row['amount_usd_million'])],
        })
    return {'sources': sources, 'skipped': skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--panel', default='reports/rank-models/august-label-panel-2026-09-11.json')
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-3day-2026-09-11.json')
    parser.add_argument('--coverage-ios', default='reports/rank-models/coverage-share-ios-2026-09-11.json')
    parser.add_argument('--output', default='reports/rank-models/reference-comparison-2026-09-11.json')
    args = parser.parse_args()
    panel = json.loads((ROOT / args.panel).read_text(encoding='utf-8'))
    model = load_model(ROOT / args.model)
    coverage = json.loads((ROOT / args.coverage).read_text(encoding='utf-8'))
    ios_path = ROOT / args.coverage_ios
    coverage_ios = json.loads(ios_path.read_text(encoding='utf-8')) if ios_path.exists() else None
    fitted = {label['anchorId'] for game in panel['games'] for label in game['labels']}
    rows = reference_rows(ROOT / LEDGER, panel['period'], fitted)
    # Each store scope needs its own index and its own coverage measurement: an App Store
    # only amount must not be compared against a two-store index.
    result = {'sources': [], 'skipped': []}
    days_used = 0
    for scope, stores in sorted(STORE_SCOPES.items()):
        group = [row for row in rows if tuple(row['stores']) == scope]
        if not group:
            continue
        scope_coverage = coverage if stores == ('ios', 'aos') else coverage_ios
        if scope_coverage is None:
            result['skipped'].extend({**row, 'skipped': 'no coverage measurement for this store scope'}
                                     for row in group)
            continue
        monthly = month_index(month_dates(panel['period']), model['params'], stores)
        days_used = max(days_used, len(monthly['days_used']))
        scoped = compare(group, monthly['index'], scope_coverage)
        result['sources'].extend(scoped['sources'])
        result['skipped'].extend(scoped['skipped'])
    report = {
        'schema_version': 1, 'production_enabled': False, 'period': panel['period'],
        'model_variant': model['variant'], 'days_used': days_used,
        'reference_rows_found': len(rows),
        'fitted_rows_excluded': len(fitted),
        'meaning': ('These rows never entered the fit. One free scale per source absorbs the unstated fee '
                    'basis, so only the ordering and the relative spread are being tested.'),
        'limits': ['A modelled vendor estimate is not a measurement; agreement with it is not accuracy.',
                   'One scale per source is fitted here, so absolute level is not tested.',
                   'Rows whose stores go beyond the App Store and Google Play are excluded entirely.',
                   'App Store only rows are scored against App Store charts with an App Store coverage '
                   'measurement, never against the two-store index.'],
        **result,
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'reference_rows_found': len(rows),
                      'days_used': len(monthly['days_used']),
                      'sources': [{key: (round(value, 4) if isinstance(value, float) else value)
                                   for key, value in source.items() if key != 'games'}
                                  for source in result['sources']],
                      'skipped': [{'game': row['game'], 'reason': row['skipped']}
                                  for row in result['skipped']]}, indent=2))


if __name__ == '__main__':
    main()
