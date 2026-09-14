"""Re-estimate the rank curve from a year of Japanese data, and compare.

Every exponent in the model came from one month of one panel. A year of Japanese
daily charts with ten published annual figures is an independent sample of the
same relationship: different months, a different country mix, a different label
provider and a different rank source.

Fitting the two store exponents on that sample alone answers a question the
August fit cannot answer about itself — whether the curve it found is a property
of the data or of the month it was fitted on. The scale stays free, so only the
shape is estimated. Nothing here is adopted: the output is a comparison.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from coverage_share import market_weights
from game_i_agreement import harvested_day
from game_i_index_check import android_translation, japanese_aliases
from game_i_period_check import labels, store_keys
from score_day import load_model

ROOT = Path(__file__).resolve().parents[2]


def observations(start: str, end: str, games: list[list[str]]) -> dict:
    """Per game, per store: the rank on each day, or the depth it was absent from.

    Collected once so the search can re-price the same sample at any exponent
    without re-reading a year of charts.
    """
    translation = android_translation()
    ranks = {store: [[] for _ in games] for store in ('ios', 'aos')}
    depths = {store: [] for store in ('ios', 'aos')}
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    days = 0
    for offset in range((last - first).days + 1):
        day = (first + timedelta(days=offset)).isoformat()
        per_store = {}
        for store in ('ios', 'aos'):
            rows = harvested_day(day, store)
            if not rows:
                per_store = {}
                break
            per_store[store] = rows
        if not per_store:
            continue
        days += 1
        for store, rows in per_store.items():
            position = {}
            for index, (app, _) in enumerate(rows, start=1):
                key = f'{store}:{app}' if store == 'ios' else f'aos:{translation.get(app, app)}'
                position.setdefault(key, index)
            depths[store].append(len(rows))
            for game_index, keys in enumerate(games):
                found = [position[key] for key in keys if key in position]
                ranks[store][game_index].append(min(found) if found else 0)
    return {'days': days,
            'ranks': {store: np.array(values, dtype=np.float64) for store, values in ranks.items()},
            'depths': {store: np.array(values, dtype=np.float64) for store, values in depths.items()}}


def index_at(sample: dict, alpha_ios: float, alpha_aos: float, censored: float) -> np.ndarray:
    """Summed index per game at one pair of exponents."""
    weights = market_weights()
    total = np.zeros(sample['ranks']['ios'].shape[0])
    for store, alpha in (('ios', alpha_ios), ('aos', alpha_aos)):
        weight = weights.get(('JP', store), 0.0)
        if weight <= 0:
            continue
        depths = sample['depths'][store]
        floor = censored * depths ** -alpha
        ranks = sample['ranks'][store]
        present = ranks > 0
        priced = np.where(present, np.where(present, ranks, 1.0) ** -alpha, floor)
        total += weight * priced.sum(axis=1)
    return total


def rmse_log(index: np.ndarray, published: np.ndarray) -> float:
    """Log error after removing the one free scale."""
    residual = np.log(published) - np.log(index)
    return float(np.sqrt(np.mean((residual - residual.mean()) ** 2)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', default='2025-01-01')
    parser.add_argument('--end', default='2025-12-31')
    parser.add_argument('--source', default='J1')
    parser.add_argument('--model', default='reports/rank-models/august-curve-final-2026-09-11.json')
    parser.add_argument('--grid', default='0.30:1.70:0.05')
    parser.add_argument('--output', default='reports/rank-models/game-i-alpha-fit-2025.json')
    arguments = parser.parse_args()

    model = load_model(ROOT / arguments.model)
    fitted = model['params']
    rows = labels(arguments.start, arguments.end, arguments.source)
    aliases = japanese_aliases()
    keyed = [(row, store_keys(row, aliases)) for row in rows]
    keyed = [(row, keys) for row, keys in keyed if keys]
    sample = observations(arguments.start, arguments.end, [keys for _, keys in keyed])
    published = np.array([row['amount_usd_m'] for row, _ in keyed], dtype=np.float64)

    low, high, step = (float(value) for value in arguments.grid.split(':'))
    candidates = np.arange(low, high + step / 2, step)
    best = None
    surface = []
    for alpha_ios in candidates:
        for alpha_aos in candidates:
            index = index_at(sample, alpha_ios, alpha_aos, fitted['censored'])
            if np.any(index <= 0):
                continue
            error = rmse_log(index, published)
            surface.append({'alpha_ios': round(float(alpha_ios), 3),
                            'alpha_aos': round(float(alpha_aos), 3),
                            'rmse_log': error})
            if best is None or error < best['rmse_log']:
                best = surface[-1]

    at_august = rmse_log(index_at(sample, fitted['alpha_ios'], fitted['alpha_aos'],
                                  fitted['censored']), published)
    index = index_at(sample, best['alpha_ios'], best['alpha_aos'], fitted['censored'])
    scale = math.exp(float(np.mean(np.log(published) - np.log(index))))
    errors = sorted(abs(value * scale / amount - 1) * 100
                    for value, amount in zip(index, published))

    report = {
        'period': {'start': arguments.start, 'end': arguments.end},
        'days_used': sample['days'], 'games': len(keyed), 'source': arguments.source,
        'august_params': {'alpha_ios': fitted['alpha_ios'], 'alpha_aos': fitted['alpha_aos'],
                          'censored': fitted['censored']},
        'japanese_year_best': best,
        'rmse_log_at_august_params': at_august,
        'rmse_log_penalty_of_august_params_pct': (at_august / best['rmse_log'] - 1) * 100,
        'median_abs_error_pct_at_best': statistics.median(errors),
        'note': ('Fitted on Japanese charts against one provider\'s annual figures with a free '
                 'scale, so this estimates curve shape only. Not adopted: the model keeps its '
                 'August parameters.'),
        'surface': sorted(surface, key=lambda row: row['rmse_log'])[:40],
    }
    path = ROOT / arguments.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'days={sample["days"]} games={len(keyed)}')
    print(f'august:   ios={fitted["alpha_ios"]} aos={fitted["alpha_aos"]} rmse_log={at_august:.4f}')
    print(f'japan-25: ios={best["alpha_ios"]} aos={best["alpha_aos"]} rmse_log={best["rmse_log"]:.4f} '
          f'median_err={report["median_abs_error_pct_at_best"]:.1f}%')
    print(f'August parameters cost {report["rmse_log_penalty_of_august_params_pct"]:.1f}% more log error')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
