"""Check two market-table assumptions against published totals.

The country weights multiply a market-size proxy by an assumed App Store /
Google Play split. Where a provider published a country total together with its
per-store parts, the split stops being an assumption and becomes a measurable
number, and the same window can be priced with the fitted scale. Research only.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta

from coverage_share import ROOT, market_weights, use_market_table
from score_day import load_model, score_day
from september_day_check import country_scope, read_archive_day

LEDGER = 'docs/research/anchors/anchors.jsonl'


def market_totals(ledger_path) -> list[dict]:
    rows = []
    for line in ledger_path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row['metric'] == 'market_total' and row['fee_basis'] == 'gross' and row['amount_usd_m']:
            rows.append(row)
    return rows


def published_splits(rows: list[dict]) -> list[dict]:
    """Country windows where both stores and their sum were published."""
    grouped: dict[tuple, dict] = {}
    for row in rows:
        period = row['period']
        key = (row['geography'], period.get('start'), period.get('end'))
        stores = tuple(sorted(row['stores']))
        grouped.setdefault(key, {})[stores] = row['amount_usd_m']
    splits = []
    for (geography, start, end), amounts in sorted(grouped.items()):
        ios = amounts.get(('app_store',))
        android = amounts.get(('google_play',))
        if ios is None or android is None or geography == 'WW':
            continue
        both = amounts.get(('app_store', 'google_play'))
        splits.append({'geography': geography, 'start': start, 'end': end,
                       'app_store_usd_million': ios, 'google_play_usd_million': android,
                       'combined_usd_million': both,
                       'published_ios_share': ios / (ios + android),
                       'parts_sum_matches_total': None if both is None else abs(ios + android - both) < 1e-9})
    return splits


def compare_shares(splits: list[dict], weights: dict) -> list[dict]:
    rows = []
    for split in splits:
        country = split['geography'].upper()
        ios = weights.get((country, 'ios'))
        android = weights.get((country, 'aos'))
        if ios is None or android is None or ios + android <= 0:
            continue
        table_share = ios / (ios + android)
        rows.append({**split, 'table_ios_share': table_share,
                     'difference_pct_points': (table_share - split['published_ios_share']) * 100})
    return rows


def window_dates(start: str, end: str) -> list[str]:
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    return [(first + timedelta(days=offset)).isoformat()
            for offset in range((last - first).days + 1)]


def price_window(split: dict, params: dict, scale: float, fit_days: int) -> dict | None:
    """What the fitted model says that country earned over the published window."""
    if not split['start'] or not split['end'] or split['combined_usd_million'] is None:
        return None
    dates = window_dates(split['start'], split['end'])
    masses = []
    for day in dates:
        try:
            archived = read_archive_day(day)
            scoped = country_scope(archived, split['geography'])
        except (FileNotFoundError, KeyError):
            return None
        masses.append(float(score_day(scoped, params)['app_index'].sum()))
    predicted = sum(masses) / len(masses) * scale / fit_days * len(dates)
    return {'days': len(dates), 'predicted_usd_million': predicted,
            'published_usd_million': split['combined_usd_million'],
            'ratio': predicted / split['combined_usd_million']}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--scale-class', default='S01|gross|WW|app_store+google_play')
    parser.add_argument('--fit-days', type=int, default=31)
    parser.add_argument('--market', default='')
    parser.add_argument('--output', default='reports/rank-models/store-split-check-2026-09-11.json')
    args = parser.parse_args()
    if args.market:
        use_market_table(args.market)
    model = load_model(ROOT / args.model)
    scale = model['scales'][args.scale_class]
    splits = published_splits(market_totals(ROOT / LEDGER))
    compared = compare_shares(splits, market_weights())
    for row in compared:
        row['window_pricing'] = price_window(row, model['params'], scale, args.fit_days)
    report = {
        'schema_version': 1, 'production_enabled': False,
        'model_variant': model['variant'], 'scale_class': args.scale_class,
        'store_splits': compared,
        'meaning': ('The table share is the assumption the country weight uses; the published share comes '
                    'from a provider that published both stores for the same window. Window pricing uses '
                    'the fitted monthly scale divided by the fitted month length.'),
        'limits': [
            'A store split published for one window is not necessarily that country annual split.',
            'Window pricing mixes a Sensor Tower market total with an AppMagic-based class scale, '
            'exactly as the monthly market constraint does.',
            'Charts are capped at 200 ranks, so a country total scored this way omits every app below '
            'the returned depth.',
        ],
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'store_splits': [
        {'geography': row['geography'], 'window': [row['start'], row['end']],
         'published_ios_share': round(row['published_ios_share'], 3),
         'table_ios_share': round(row['table_ios_share'], 3),
         'difference_pct_points': round(row['difference_pct_points'], 1),
         'window_pricing': None if not row['window_pricing'] else {
             'days': row['window_pricing']['days'],
             'predicted_usd_million': round(row['window_pricing']['predicted_usd_million'], 1),
             'published_usd_million': row['window_pricing']['published_usd_million'],
             'ratio': round(row['window_pricing']['ratio'], 3)}}
        for row in compared]}, indent=2))


if __name__ == '__main__':
    main()
