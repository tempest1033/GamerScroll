"""Calibrate country x store weights against published market totals.

The proxy weight table was built from mixed-year market estimates, so the game
level fit had to buy back the error with a country multiplier. Chart mass for a
country depends only on its weight and the rank exponent, so the same published
market totals can set those weights directly - market evidence for market size,
game labels for curve shape. Research only; the production table is untouched.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np

from coverage_share import ROOT, market_weights

ARCHIVE = ROOT / 'snapshots/rankings'


def chart_mass(period: tuple[str, str], alpha: dict) -> dict:
    """Mean per-snapshot sum of rank weights for each archived country/store chart."""
    masses: dict[tuple[str, str], list] = {}
    for file in sorted(ARCHIVE.glob('*_grossing.csv')):
        match = re.match(r'^(\d{4}-\d{2}-\d{2})_(ios|aos)_([a-z]{2})_grossing\.csv$', file.name)
        if not match or not period[0] <= match.group(1) <= period[1]:
            continue
        _, storefront, country = match.groups()
        snapshots: dict[str, list] = {}
        for line in file.read_text(encoding='utf-8').splitlines()[1:]:
            if not line:
                continue
            time, rank = line.split(',', 2)[:2]
            snapshots.setdefault(time, []).append(int(rank))
        for ranks in snapshots.values():
            masses.setdefault((country.upper(), storefront), []).append(
                float(np.sum(np.array(ranks, dtype=float) ** -alpha[storefront])))
    return {key: {'mean_rank_mass': float(np.mean(values)), 'snapshots': len(values)}
            for key, values in masses.items()}


def published_country_totals(period: tuple[str, str]) -> list:
    rows = [json.loads(line) for line in
            (ROOT / 'docs/research/anchors/anchors.jsonl').read_text(encoding='utf-8').splitlines() if line]
    return [row for row in rows if row['metric'] == 'market_total' and row['geography'] != 'WW'
            and row['period']['start'] == period[0] and row['period']['end'] == period[1]
            and row['fee_basis'] == 'gross' and row['amount_usd_m']]


def calibrate(alpha: dict, period: tuple[str, str]) -> dict:
    weights = market_weights()
    masses = chart_mass(period, alpha)
    totals = published_country_totals(period)
    if not totals:
        raise ValueError('No published country market totals for this period')
    calibrated, notes = {}, []
    reference = None
    for row in totals:
        country = row['geography']
        stores = [store for store in ('ios', 'aos')
                  if (country, store) in masses
                  and ('app_store' if store == 'ios' else 'google_play') in row['stores']]
        if not stores:
            notes.append({'geography': country, 'status': 'no_matching_archived_chart'})
            continue
        scored = sum(weights[(country, store)] * masses[(country, store)]['mean_rank_mass'] for store in stores)
        if scored <= 0:
            notes.append({'geography': country, 'status': 'zero_scored_mass'})
            continue
        share = row['amount_usd_m'] / scored
        reference = reference or share
        factor = share / reference
        for store in stores:
            calibrated[(country, store)] = weights[(country, store)] * factor
        notes.append({'geography': country, 'provider': row['provider'],
                      'published_usd_million': row['amount_usd_m'], 'stores': row['stores'],
                      'archived_stores_used': stores, 'weight_factor': factor,
                      'store_scope_note': row.get('notes')})
    return {'alpha': alpha, 'period': {'start': period[0], 'end': period[1]},
            'calibrated': calibrated, 'per_country': notes, 'masses': masses, 'base_weights': weights}


def write_table(result: dict, output: Path, source_table: Path) -> dict:
    market = json.loads(source_table.read_text(encoding='utf-8'))
    changed = []
    for row in market['countries']:
        country = row['country'].upper()
        factors = {store: result['calibrated'].get((country, store)) for store in ('ios', 'aos')}
        if not any(factors.values()):
            row['weightCalibration'] = 'proxy_uncalibrated'
            continue
        base_ios = result['base_weights'][(country, 'ios')]
        base_aos = result['base_weights'][(country, 'aos')]
        total_base = base_ios + base_aos
        new_ios = factors['ios'] if factors['ios'] is not None else base_ios
        new_aos = factors['aos'] if factors['aos'] is not None else base_aos
        new_total = new_ios + new_aos
        row['marketProxyUsd'] = new_total if new_total > 0 else row['marketProxyUsd']
        row['storeShares'] = {**row['storeShares'],
                              'ios': new_ios / new_total if new_total else row['storeShares']['ios'],
                              'android': new_aos / new_total if new_total else row['storeShares']['android'],
                              'basis': 'calibrated_to_published_market_total',
                              'confidence': 'published_country_total'}
        row['weightCalibration'] = 'calibrated'
        changed.append({'country': country, 'previous_total_usd': total_base, 'calibrated_total_usd': new_total,
                        'factor': new_total / total_base if total_base else None})
    market['status'] = 'research_calibrated_weights'
    market['productionEnabled'] = False
    market['calibration'] = {
        'source': 'scripts/revenue-research/calibrate_weights.py',
        'period': result['period'], 'alpha': result['alpha'],
        'method': ('Chart mass for a country depends only on its weight and the rank exponent, so weights for '
                   'countries with a published market total are rescaled to reproduce that total. Countries '
                   'without a published total keep their proxy weight and are marked uncalibrated.'),
        'limits': ['Published totals are products of rounded published figures.',
                   'Only the archived five markets have chart mass, and only three have published totals.',
                   'The level is relative; the global scale still comes from labelled games.'],
        'per_country': result['per_country'], 'changed': changed}
    output.write_text(json.dumps(market, indent=2) + '\n', encoding='utf-8')
    return {'output': str(output.relative_to(ROOT)).replace('\\', '/'), 'changed': changed}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--alpha-ios', type=float, required=True)
    parser.add_argument('--alpha-aos', type=float, required=True)
    parser.add_argument('--start', default='2026-08-01')
    parser.add_argument('--end', default='2026-08-31')
    parser.add_argument('--source-table', default='data/rank-models/global-chart-2026-v0.3.json')
    parser.add_argument('--output', default='reports/rank-models/market-weights-calibrated-2026-09-11.json')
    args = parser.parse_args()
    result = calibrate({'ios': args.alpha_ios, 'aos': args.alpha_aos}, (args.start, args.end))
    written = write_table(result, ROOT / args.output, ROOT / args.source_table)
    print(json.dumps({**written, 'per_country': [
        {key: row[key] for key in ('geography', 'weight_factor', 'published_usd_million') if key in row}
        for row in result['per_country']]}, indent=2))


if __name__ == '__main__':
    main()
