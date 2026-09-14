"""Score one collected all-country day with the estimated curve, fast.

The fitting stage is research; this is the part that has to be usable in a real
run: it turns a day of collected grossing charts into per-game index scores in
seconds, using the same censoring and family rules the fit was estimated under.
Research only - nothing here writes to production data or pages.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from coverage_share import ROOT, read_day, market_weights, use_market_table

CENSORED_RANK = 200.0


def load_model(path: Path) -> dict:
    report = json.loads(path.read_text(encoding='utf-8'))
    if 'selected_model' in report:
        return report['selected_model']
    best = min(report['nested_cross_validation'], key=lambda row: row['nested_cv_rmse_log'])
    variant = next(row for row in report['variants'] if row['variant'] == best['variant'])
    return {'variant': best['variant'], 'params': variant['params'], 'scales': variant['scales']}


def label_dependence_bands(report: dict | None) -> dict | None:
    """Relative spread of each game's priced amount across label subsamples.

    A game that carries no label has no spread of its own, so the median spread
    over the labelled games is offered instead, marked as such.
    """
    if not report:
        return None
    per_game = {}
    for game, row in report['summary']['priced_usd_million'].items():
        if not row or not row.get('median'):
            continue
        per_game[game] = {'low': row['p05'] / row['median'], 'high': row['p95'] / row['median']}
    if not per_game:
        return None
    lows = sorted(band['low'] for band in per_game.values())
    highs = sorted(band['high'] for band in per_game.values())
    middle = len(lows) // 2
    return {'per_game': per_game, 'fallback': {'low': lows[middle], 'high': highs[middle]},
            'source': 'label subsample draws', 'draws': report['summary']['draws']}


def held_out_error_band(report: dict | None) -> dict | None:
    """Multiplicative band measured from held-out error, not from label resampling."""
    if not report:
        return None
    measured = report.get('empirical_error_reserved')
    if not measured or not measured.get('p90_factor'):
        return None
    return {'factor': measured['p90_factor'], 'labels': measured['labels'],
            'median_factor': measured['median_factor'],
            'source': 'reserved-game held-out errors'}


def identity_families() -> tuple[dict, list]:
    identities = json.loads((ROOT / 'docs/research/anchors/identities.json').read_text(encoding='utf-8'))
    families = {}
    for name, entry in identities['games'].items():
        for storefront, ids in (('ios', entry['ios']), ('aos', entry['aos'])):
            for app in ids:
                families[f'{storefront}:{app}'] = name
    return families, sorted(identities['games'])


def score_day(day: dict, params: dict, censored_scope: str = 'every_chart',
              censored_depth: str = 'returned') -> dict:
    """Index per app id, then collapsed to identity families.

    Absence is handled exactly as in the fit: a snapshot without the app counts
    `censored` times the rank-200 weight, never a fabricated rank and never zero
    revenue. `censored_scope` decides which charts an absent app is credited in.
    The fit credits absence in every chart of its panel, so `every_chart` is the
    convention the fitted scales belong to; scoring a day with
    `charts_with_any_appearance` instead under-prices by a median of about 35%
    and by nearly 60% for a game that is strong in a few markets.

    `censored_depth` decides what "absent" is worth. The fitted panel only
    contains 200-row charts, so both settings agree there, but an all-country day
    includes Google Play charts that return as few as 27 rows: being outside a
    27-row chart is far weaker evidence than being outside a 200-row one, and
    `returned` prices it at the depth the store actually returned.
    """
    weights = market_weights()
    multipliers = params.get('country_multipliers', {})
    alpha = {'ios': params['alpha_ios'], 'aos': params['alpha_aos']}
    censored = params['censored']

    def curve(ranks: np.ndarray, storefront: str, country: str) -> np.ndarray:
        """rank ** -alpha, with the optional refinements `history_fit` validates:
        a per-country head slope (alpha_ios_JP), and a steeper tail below a knee
        (knee / knee_ios / alpha_tail_ios). Without those keys this is the single
        slope the frozen model card was fitted with, so existing cards score
        exactly as before."""
        head = float(params.get(f'alpha_{storefront}_{country}', alpha[storefront]))
        tail = float(params.get(f'alpha_tail_{storefront}', alpha[storefront]))
        knee = float(params.get(f'knee_{storefront}', params.get('knee', 0.0)))
        shifted = ranks + float(params.get('rank_shift', 0.0))
        value = shifted ** -head
        if knee > 0:
            value = np.where(shifted > knee, knee ** -head * (shifted / knee) ** -tail, value)
        return value

    app_ids: dict[str, int] = {}
    chart_rows = []
    for key, rows in day['lists'].items():
        storefront, country, chart = key.split('_')
        if chart != 'grossing':
            continue
        country = country.upper()
        weight = weights.get((country, storefront))
        if weight is None or weight <= 0:
            continue
        weight *= multipliers.get(country, 1.0)
        best_rank: dict[int, np.ndarray] = {}
        snapshots = len(rows['ranks'])
        columns, ranks = [], []
        depths = []
        for snapshot, order in enumerate(rows['ranks']):
            depths.append(len(order))
            for position, app in enumerate(order, start=1):
                index = app_ids.setdefault(f'{storefront}:{app}', len(app_ids))
                columns.append(index)
                ranks.append(position)
        chart_rows.append({'key': key, 'storefront': storefront, 'country': country, 'weight': weight,
                           'snapshots': snapshots, 'apps': np.array(columns, dtype=np.int64),
                           'ranks': np.array(ranks, dtype=np.float64),
                           'depths': np.array(depths, dtype=np.float64)})
        del best_rank
    if not chart_rows:
        raise ValueError('No grossing chart in this day matched the market weight table')
    total = np.zeros(len(app_ids))
    by_country: dict[str, float] = {}
    for chart in chart_rows:
        if censored_depth == 'returned':
            usable = chart['depths'][chart['depths'] > 0]
            floor = (censored * float(np.mean(curve(usable, chart['storefront'], chart['country'])))
                     if usable.size else 0.0)
        elif censored_depth == 'fixed_200':
            floor = censored * float(curve(np.array([float(CENSORED_RANK)]), chart['storefront'], chart['country'])[0])
        else:
            raise ValueError(f'Unknown censored depth rule: {censored_depth}')
        observed = curve(chart['ranks'], chart['storefront'], chart['country'])
        contribution = np.zeros(len(app_ids))
        np.add.at(contribution, chart['apps'], observed - floor)
        present = np.zeros(len(app_ids), dtype=bool)
        present[chart['apps']] = True
        if censored_scope == 'charts_with_any_appearance':
            contribution += present * floor * chart['snapshots']
        elif censored_scope == 'every_chart':
            contribution += floor * chart['snapshots']
        else:
            raise ValueError(f'Unknown censored scope: {censored_scope}')
        scaled = contribution * chart['weight'] / chart['snapshots']
        total += scaled
        country = chart['key'].split('_')[1].upper()
        by_country[country] = by_country.get(country, 0.0) + float(scaled.sum())
    families, _ = identity_families()
    order = {app: index for app, index in app_ids.items()}
    family_totals: dict[str, float] = {}
    for app, index in order.items():
        name = families.get(app)
        if name is None:
            continue
        family_totals[name] = family_totals.get(name, 0.0) + float(total[index])
    return {'app_index': total, 'app_ids': app_ids, 'charts': len(chart_rows),
            'family_totals': family_totals, 'country_totals': by_country}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True)
    parser.add_argument('--collector-output', default='')
    parser.add_argument('--model', default='reports/rank-models/august-curve-estimates-2026-09-11.json')
    parser.add_argument('--market', default='')
    parser.add_argument('--scale-class', default='S01|gross|WW|app_store+google_play')
    parser.add_argument('--top', type=int, default=25)
    parser.add_argument('--bands', default='', help='subsample stability report for label-dependence bands')
    parser.add_argument('--error-band', default='',
                        help='band coverage report, for a band measured from held-out error')
    parser.add_argument('--censored-depth', default='returned', choices=('returned', 'fixed_200'),
                        help='what absence is worth: the depth the chart returned, or always rank 200')
    parser.add_argument('--censored-scope', default='every_chart',
                        choices=('every_chart', 'charts_with_any_appearance'),
                        help='which charts credit an absent game; the fit uses every chart')
    parser.add_argument('--output', default='reports/rank-models/day-scores-2026-09-11.json')
    args = parser.parse_args()
    if args.market:
        use_market_table(args.market)
    model = load_model(ROOT / args.model)
    bands = None
    if args.bands:
        band_path = ROOT / args.bands
        bands = label_dependence_bands(json.loads(band_path.read_text(encoding='utf-8'))
                                       if band_path.exists() else None)
    error_band = None
    if args.error_band:
        error_path = ROOT / args.error_band
        error_band = held_out_error_band(json.loads(error_path.read_text(encoding='utf-8'))
                                         if error_path.exists() else None)
    started = time.perf_counter()
    day = read_day(args.date, args.collector_output)
    read_seconds = time.perf_counter() - started
    scored_at = time.perf_counter()
    result = score_day(day, model['params'], censored_scope=args.censored_scope,
                       censored_depth=args.censored_depth)
    score_seconds = time.perf_counter() - scored_at
    scale = model['scales'].get(args.scale_class)
    families = sorted(result['family_totals'].items(), key=lambda row: -row[1])
    rows = []
    for position, (name, value) in enumerate(families, start=1):
        priced = (value * scale) if scale else None
        row = {'rank': position, 'game': name, 'index': value,
               'monthly_scale_reference_usd_million': priced}
        if bands and priced is not None:
            band = bands['per_game'].get(name)
            chosen = band or bands['fallback']
            row['label_dependence_band_usd_million'] = [priced * chosen['low'], priced * chosen['high']]
            row['band_basis'] = 'this game' if band else 'median of labelled games'
        if error_band and priced is not None:
            row['held_out_error_band_usd_million'] = [priced / error_band['factor'],
                                                      priced * error_band['factor']]
        rows.append(row)
    report = {
        'schema_version': 1, 'production_enabled': False, 'date': args.date,
        'model_variant': model['variant'], 'params': model['params'],
        'market_table': args.market or 'data/rank-models/global-chart-2026-v0.3.json',
        'scale_class': args.scale_class, 'scale_applied': scale is not None,
        'scale_meaning': ('The class scale was estimated on calendar-month labels. A single day scored with '
                          'it is a monthly-rate reference, not that day revenue.'),
        'charts_scored': result['charts'], 'apps_scored': len(result['app_ids']),
        'censored_depth_rule': args.censored_depth,
        'censored_scope_rule': args.censored_scope,
        'absence_meaning': ('Absence is credited in every chart, matching the convention the scales were '
                            'fitted under. Aggregates over all charted apps must not use this rule.'),
        'identified_games': len(result['family_totals']),
        'label_dependence_bands': None if not bands else
            {'source': bands['source'], 'draws': bands['draws'],
             'meaning': ('Range of the same estimate when the curve is re-fitted on random subsets of the '
                         'labelled games. It covers label dependence only, not model or period error. '
                         'Measured against the labels it holds about one in ten of them, so it is not an '
                         'accuracy interval; use held_out_error_band for that.')},
        'held_out_error_band': None if not error_band else
            {'source': error_band['source'], 'labels': error_band['labels'],
             'p90_factor': error_band['factor'], 'median_factor': error_band['median_factor'],
             'meaning': ('Multiplicative band from the errors this model made on games the fit never saw: '
                         'estimate divided by and multiplied by the 90th-percentile error factor.')},
        'timing_seconds': {'read': read_seconds, 'score': score_seconds},
        'top': rows[:args.top], 'all_identified_games': rows,
    }
    path = ROOT / args.output
    path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(path.relative_to(ROOT)).replace('\\', '/'),
                      'charts': report['charts_scored'], 'apps': report['apps_scored'],
                      'identified_games': report['identified_games'],
                      'timing_seconds': {key: round(value, 3) for key, value in report['timing_seconds'].items()},
                      'top': [{'rank': row['rank'], 'game': row['game'],
                               'monthly_scale_reference_usd_million':
                                   round(row['monthly_scale_reference_usd_million'], 1)
                                   if row['monthly_scale_reference_usd_million'] else None}
                              for row in rows[:10]]}, indent=2))


if __name__ == '__main__':
    main()
