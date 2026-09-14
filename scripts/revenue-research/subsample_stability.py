"""How much does the estimate depend on which games happen to be labelled?

The whole curve rests on 28 labelled games. Re-estimating on random subsets of
them shows how far the parameters and a priced prediction move when a few games
are absent. This is a dependence diagnostic, not a confidence interval: the
subsets are not independent samples of the population of games. Research only.
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np

from coverage_share import ROOT
import fit_rank_curve as fit

SCALE_CLASS = 'S01|gross|WW|app_store+google_play'


def run(panel: dict, coverage_path, draws: int, keep_fraction: float, seed: int,
        market_weight: float, target_games: list[str]) -> dict:
    design = fit.build_design(panel)
    records = fit.label_records(panel)
    labels = fit.prepare_labels(records)
    masks = fit.scope_masks(design, records)
    coverage, _ = fit.coverage_vector(design, coverage_path)
    variant = {'id': 'subsample', 'stores': 'per_store', 'countries': ['CN'], 'coverage': coverage,
               'market_totals': fit.published_country_totals(panel['period']),
               'market_weight': market_weight}
    alphas = fit.grid(np.arange(0.30, 2.01, 0.05))
    censored_values = fit.grid(np.arange(0.0, 1.01, 0.1))
    multiplier_values = fit.grid([0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0])
    game_count = len(design.games)
    keep = max(3, int(round(keep_fraction * game_count)))
    generator = np.random.default_rng(seed)
    targets = [design.games.index(name) for name in target_games if name in design.games]
    draws_out = []
    started = time.perf_counter()
    plans = []
    for draw in range(draws):
        chosen = generator.choice(game_count, size=keep, replace=False)
        subset = fit.subset_labels(labels, np.isin(labels.game, chosen))
        if len(set(subset.klass.tolist())) < 2:
            continue
        plans.append({'draw': draw, 'subset': subset,
                      'excluded': set(range(game_count)) - set(chosen.tolist())})
    # Every draw is one exclusion set, so the whole grid is searched once for all of them.
    selected = fit.grid_selection(design, labels, masks, variant, alphas, censored_values,
                                  multiplier_values, [plan['excluded'] for plan in plans])
    for plan, params in zip(plans, selected):
        if params is None:
            continue
        draw, subset = plan['draw'], plan['subset']
        result = fit.evaluate(design, subset, masks, params)
        scale = result['scales'].get(SCALE_CLASS)
        index = fit.model_index(design, params, masks['WW'])
        priced = {design.games[position]: float(index[position] * scale) if scale else None
                  for position in targets}
        draws_out.append({'draw': draw, 'games_used': keep,
                          'params': fit.describe(params), 'scale': scale,
                          'cv_rmse_log': result['cv_rmse_log'], 'priced_usd_million': priced})
    elapsed = time.perf_counter() - started
    return {'design_games': game_count, 'draws': draws_out, 'seconds': elapsed}


def percentiles(values: list[float]) -> dict | None:
    clean = [value for value in values if value is not None and np.isfinite(value)]
    if not clean:
        return None
    array = np.array(clean, dtype=float)
    return {'n': int(array.size), 'p05': float(np.percentile(array, 5)),
            'median': float(np.median(array)), 'p95': float(np.percentile(array, 95)),
            'min': float(array.min()), 'max': float(array.max())}


def summarise(result: dict, target_games: list[str]) -> dict:
    draws = result['draws']
    summary = {'draws': len(draws), 'seconds': result['seconds'],
               'parameters': {}, 'priced_usd_million': {}}
    for key in ('alpha_ios', 'alpha_aos', 'censored'):
        summary['parameters'][key] = percentiles([draw['params'][key] for draw in draws])
    summary['parameters']['country_multiplier_CN'] = percentiles(
        [draw['params']['country_multipliers'].get('CN') for draw in draws])
    summary['parameters']['cv_rmse_log'] = percentiles([draw['cv_rmse_log'] for draw in draws])
    for game in target_games:
        values = [draw['priced_usd_million'].get(game) for draw in draws]
        row = percentiles(values)
        if row:
            row['spread_pct_of_median'] = (row['p95'] - row['p05']) / row['median'] * 100
        summary['priced_usd_million'][game] = row
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--panel', default='reports/rank-models/august-label-panel-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-3day-2026-09-11.json')
    parser.add_argument('--draws', type=int, default=30)
    parser.add_argument('--keep-fraction', type=float, default=0.8)
    parser.add_argument('--seed', type=int, default=20260911)
    parser.add_argument('--market-weight', type=float, default=1.0)
    parser.add_argument('--games', default='Honor of Kings,MONOPOLY GO!,Pokemon GO,Royal Match',
                        help='comma separated game keys, or "all" for every labelled game')
    parser.add_argument('--output', default='reports/rank-models/subsample-stability-2026-09-11.json')
    args = parser.parse_args()
    panel = json.loads((ROOT / args.panel).read_text(encoding='utf-8'))
    target_games = ([game['key'] for game in panel['games']] if args.games == 'all'
                    else [name for name in args.games.split(',') if name])
    result = run(panel, ROOT / args.coverage, args.draws, args.keep_fraction, args.seed,
                 args.market_weight, target_games)
    summary = summarise(result, target_games)
    report = {
        'schema_version': 1, 'production_enabled': False,
        'panel': args.panel, 'coverage_report': args.coverage,
        'keep_fraction': args.keep_fraction, 'seed': args.seed,
        'scale_class': SCALE_CLASS,
        'meaning': ('Each draw re-estimates the curve on a random subset of labelled games. The spread '
                    'shows how much the answer depends on which games happen to carry labels; it is not '
                    'a confidence interval and does not cover unlabelled games or other months.'),
        'summary': summary, 'draws': result['draws'],
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'summary': summary}, indent=2))


if __name__ == '__main__':
    main()
