"""Is the model biased against games that earn in one particular country?

A country weight that is too low shows up as under-prediction for games whose
index mass sits in that country. This measures, per labelled game, where its
index comes from and whether that share moves its held-out error. It is a
diagnostic of the weight table, not a correction of it. Research only.
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from coverage_share import ROOT
import fit_rank_curve as fit


def country_shares(design, params) -> dict:
    """Per game, the fraction of modelled index mass each archived country carries."""
    codes = sorted(set(design.countries))
    per_country = {}
    for code in codes:
        mask = np.array([country == code for country in design.countries], dtype=float)
        per_country[code] = fit.model_index(design, params, mask)
    total = sum(per_country.values())
    shares = {}
    for position, game in enumerate(design.games):
        if total[position] <= 0:
            continue
        shares[game] = {code: float(values[position] / total[position])
                        for code, values in per_country.items()}
    return shares


def rank_correlation(first: list[float], second: list[float]) -> float | None:
    """Spearman correlation, which needs no assumption about the shape of the relation."""
    if len(first) < 3:
        return None
    def ranks(values):
        order = np.argsort(np.argsort(np.array(values, dtype=float)))
        return order.astype(float)
    left, right = ranks(first), ranks(second)
    left -= left.mean()
    right -= right.mean()
    denominator = float(np.sqrt((left ** 2).sum() * (right ** 2).sum()))
    return float((left * right).sum() / denominator) if denominator else None


def split_medians(shares: list[float], errors: list[float]) -> dict:
    """Median error for the games above and below the median country share."""
    if len(shares) < 4:
        return {}
    cut = float(np.median(shares))
    high = [error for share, error in zip(shares, errors) if share > cut]
    low = [error for share, error in zip(shares, errors) if share <= cut]
    if not high or not low:
        return {}
    return {'share_cut': cut, 'high_share_games': len(high), 'low_share_games': len(low),
            'high_share_median_error_pct': float(np.median(high)),
            'low_share_median_error_pct': float(np.median(low))}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--panel', default='reports/rank-models/august-label-panel-2026-09-11.json')
    parser.add_argument('--fit', default='reports/rank-models/august-curve-final-2026-09-11.json')
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--klass', default='S01|gross|WW|app_store+google_play')
    parser.add_argument('--output', default='reports/rank-models/country-bias-2026-09-11.json')
    args = parser.parse_args()
    panel = json.loads((ROOT / args.panel).read_text(encoding='utf-8'))
    report = json.loads((ROOT / args.fit).read_text(encoding='utf-8'))
    card = json.loads((ROOT / args.model).read_text(encoding='utf-8'))
    variant = next(row for row in report['variants']
                   if row['variant'] == card['selected_model']['variant'])
    params = dict(card['selected_model']['params'])
    design = fit.build_design(panel)
    coverage, _ = fit.coverage_vector(design, ROOT / card['coverage_report'])
    params['coverage'] = coverage if card['selected_model']['coverage_correction'] else None
    shares = country_shares(design, params)
    rows = []
    for held in variant['held_out']:
        if held['klass'] != args.klass or held['game'] not in shares:
            continue
        rows.append({'game': held['game'], 'error_pct': held['error_pct'],
                     'log_error': held['log_error'], 'shares': shares[held['game']]})
    # The coverage correction is itself an assumption: if the games it rescales most are
    # also the ones it gets wrong, the correction is mis-specified rather than merely noisy.
    coverage_rows = []
    if coverage is not None:
        by_game = {name: float(value) for name, value in zip(design.games, coverage)}
        for row in rows:
            if by_game.get(row['game'], 0.0) > 0:
                coverage_rows.append({'game': row['game'], 'five_market_share': by_game[row['game']],
                                      'error_pct': row['error_pct']})
    coverage_bias = None
    if len(coverage_rows) >= 3:
        values = [row['five_market_share'] for row in coverage_rows]
        errors = [row['error_pct'] for row in coverage_rows]
        coverage_bias = {'games': len(coverage_rows),
                         'median_five_market_share': float(np.median(values)),
                         'spearman_share_vs_error': rank_correlation(values, errors),
                         **split_medians(values, errors),
                         'meaning': ('A negative correlation would mean the games the correction '
                                     'rescales most are the ones it overshoots.')}
    countries = sorted({code for row in rows for code in row['shares']})
    per_country = []
    for code in countries:
        values = [row['shares'][code] for row in rows]
        errors = [row['error_pct'] for row in rows]
        per_country.append({'country': code, 'games': len(rows),
                            'median_share': float(np.median(values)),
                            'spearman_share_vs_error': rank_correlation(values, errors),
                            **split_medians(values, errors)})
    output = {
        'schema_version': 1, 'production_enabled': False,
        'klass': args.klass, 'model_variant': card['selected_model']['variant'],
        'params': card['selected_model']['params'],
        'meaning': ('A positive correlation means games that earn more in that country are '
                    'over-predicted; a negative one means they are under-predicted. Error is the '
                    'leave-one-game-out scale error already reported for the fit.'),
        'limits': ['Country shares are modelled, not observed revenue splits.',
                   'With one label class and a few dozen games, only a strong bias is detectable.',
                   'A per-country weight change would need its own published totals, not this diagnostic.'],
        'per_country': per_country, 'games': rows,
        'coverage_correction_bias': coverage_bias,
    }
    (ROOT / args.output).write_text(json.dumps(output, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'games': len(rows), 'per_country': [
        {key: (round(value, 3) if isinstance(value, float) else value) for key, value in row.items()}
        for row in per_country],
        'coverage_correction_bias': None if not coverage_bias else
        {key: (round(value, 3) if isinstance(value, float) else value)
         for key, value in coverage_bias.items() if key != 'meaning'}}, indent=2))


if __name__ == '__main__':
    main()
