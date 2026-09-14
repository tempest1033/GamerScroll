"""Are the label-dependence bands honest?

Day scores carry a band: the range an amount takes when the curve is re-fitted on
random subsets of the labelled games. A band is only useful if published amounts
actually fall inside it, so this scores the bands against the labels themselves,
separating games the fit used from the eight reserved ones it never saw.
Research only.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError('no values')
    position = fraction * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def bands(draws: list[dict], low: float, high: float) -> dict[str, dict]:
    priced: dict[str, list[float]] = {}
    for draw in draws:
        for game, amount in (draw.get('priced_usd_million') or {}).items():
            if amount and amount > 0:
                priced.setdefault(game, []).append(float(amount))
    return {game: {'draws': len(values), 'low': percentile(values, low),
                   'high': percentile(values, high), 'median': statistics.median(values)}
            for game, values in priced.items() if len(values) >= 5}


def label_rows(report: dict, variant_id: str) -> list[dict]:
    """Observed and predicted amounts, tagged by whether the fit had seen the game."""
    holdout = report['reserved_holdout']
    reserved = set(holdout['holdout_games'])
    rows = []
    for row in holdout['rows']:
        rows.append({**row, 'seen_by_fit': False})
    variant = next((item for item in report['variants'] if item['variant'] == variant_id), None)
    for row in (variant or {}).get('held_out', []):
        if row['game'] not in reserved:
            rows.append({**row, 'seen_by_fit': True})
    for row in rows:
        row['predicted_usd_million'] = row['amount_usd_million'] * math.exp(row['log_error'])
    return rows


def score(rows: list[dict], band_table: dict[str, dict]) -> dict:
    checked, covered, misses, widths = [], 0, [], []
    for row in rows:
        band = band_table.get(row['game'])
        if not band:
            continue
        inside = band['low'] <= row['amount_usd_million'] <= band['high']
        covered += int(inside)
        widths.append((band['high'] - band['low']) / band['median'] * 100 if band['median'] else None)
        entry = {'game': row['game'], 'observed_usd_million': row['amount_usd_million'],
                 'band_low': band['low'], 'band_high': band['high'],
                 'predicted_usd_million': row['predicted_usd_million'],
                 'inside_band': inside, 'seen_by_fit': row['seen_by_fit'],
                 'error_pct': row['error_pct']}
        checked.append(entry)
        if not inside:
            distance = (row['amount_usd_million'] / band['high'] - 1 if row['amount_usd_million'] > band['high']
                        else row['amount_usd_million'] / band['low'] - 1)
            misses.append({**entry, 'distance_outside_pct': distance * 100})
    usable_widths = [width for width in widths if width is not None]
    needed = []
    for row in rows:
        band = band_table.get(row['game'])
        if not band or band['median'] <= 0 or row['amount_usd_million'] <= 0:
            continue
        half_width = max(abs(math.log(band['high'] / band['median'])),
                         abs(math.log(band['median'] / band['low'])))
        distance = abs(math.log(row['amount_usd_million'] / band['median']))
        if half_width > 0:
            needed.append(distance / half_width)
    return {
        'labels_checked': len(checked),
        'inside_band': covered,
        'coverage_pct': covered / len(checked) * 100 if checked else None,
        'median_band_width_pct': statistics.median(usable_widths) if usable_widths else None,
        'widening_factor_for_90pct': percentile(needed, 0.90) if needed else None,
        'misses': sorted(misses, key=lambda item: -abs(item['distance_outside_pct'])),
        'rows': checked,
    }


def empirical_error(rows: list[dict]) -> dict | None:
    """Held-out error distribution, as multiplicative factors around an estimate.

    This is what an honest band needs: the spread of published amounts around the
    model's own prediction, measured on games the fit never used.
    """
    magnitudes = sorted(abs(math.log(row['amount_usd_million'] / row['predicted_usd_million']))
                        for row in rows
                        if row['amount_usd_million'] > 0 and row['predicted_usd_million'] > 0)
    if len(magnitudes) < 5:
        return None
    return {
        'labels': len(magnitudes),
        'median_abs_log_error': percentile(magnitudes, 0.50),
        'p90_abs_log_error': percentile(magnitudes, 0.90),
        'median_factor': math.exp(percentile(magnitudes, 0.50)),
        'p90_factor': math.exp(percentile(magnitudes, 0.90)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', default='reports/rank-models/august-curve-final-2026-09-11.json')
    parser.add_argument('--subsample', default='reports/rank-models/subsample-stability-2026-09-11.json')
    parser.add_argument('--low', type=float, default=0.05)
    parser.add_argument('--high', type=float, default=0.95)
    parser.add_argument('--output', default='reports/rank-models/band-coverage-2026-09-11.json')
    arguments = parser.parse_args()

    report = json.loads((ROOT / arguments.report).read_text(encoding='utf-8'))
    subsample = json.loads((ROOT / arguments.subsample).read_text(encoding='utf-8'))
    variant_id = report['reserved_holdout']['variant']
    band_table = bands(subsample['draws'], arguments.low, arguments.high)
    rows = label_rows(report, variant_id)
    unseen = [row for row in rows if not row['seen_by_fit']]
    seen = [row for row in rows if row['seen_by_fit']]

    payload = {
        'schema_version': 1,
        'production_enabled': False,
        'question': ('Do published amounts fall inside the label-dependence band the scorer '
                     'publishes next to each estimate?'),
        'band_percentiles': [arguments.low, arguments.high],
        'draws': subsample['summary']['draws'],
        'variant': variant_id,
        'meaning': ('The band only covers sensitivity to which games carry labels. It does not '
                    'include provider disagreement, month-to-month drift or the market-size proxy, '
                    'so coverage below the nominal 90% means the band understates real uncertainty.'),
        'reserved_games': score(unseen, band_table),
        'games_the_fit_used': score(seen, band_table),
        'empirical_error_reserved': empirical_error(unseen),
        'empirical_error_meaning': ('Absolute log distance between published amounts and this model\'s '
                                    'predictions on the reserved games. Applying the p90 factor around an '
                                    'estimate gives a band that nine in ten reserved labels fall inside, '
                                    'unlike the label-dependence band.'),
    }
    path = ROOT / arguments.output
    path.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': arguments.output,
                      'reserved': {key: payload['reserved_games'][key]
                                   for key in ('labels_checked', 'inside_band', 'coverage_pct',
                                               'median_band_width_pct', 'widening_factor_for_90pct')},
                      'used': {key: payload['games_the_fit_used'][key]
                               for key in ('labels_checked', 'inside_band', 'coverage_pct',
                                           'median_band_width_pct', 'widening_factor_for_90pct')}}))


if __name__ == '__main__':
    main()
