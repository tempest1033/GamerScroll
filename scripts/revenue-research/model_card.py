"""Freeze one estimated model into a card the scorer and reports can load.

The card carries the parameters, the per-source scales, the evidence they were
estimated from and the limits that survive estimation. Research only: writing a
card does not enable production use.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from coverage_share import ROOT


def prospective_summary(check: dict | None) -> dict | None:
    """The out-of-period evidence, kept as measured: weeks usable, single days not."""
    if not check:
        return None
    weekly = [row for row in check['weekly']['games'] if 'windows' in row]
    return {
        'source': check.get('output_path', 'reports/rank-models/september-day-check-2026-09-11.json'),
        'weekly': {
            'label': check['weekly']['label'],
            'games': [{'game': row['game'], 'geography': row.get('geography', 'WW'),
                       'abs_error_pct_range': sorted(window['abs_error_pct'] for window in row['windows']
                                                     if 'abs_error_pct' in window)}
                      for row in weekly],
            'window_note': check['weekly']['window_note'],
        },
        'daily': {'game': check['game'], 'days': len(check['days']),
                  'median_abs_error_pct': check['median_abs_error_pct'],
                  # A second game separates a model limit from one title's event pattern.
                  'by_game': [{'game': block['game'], 'days': len(block['days']),
                               'median_abs_error_pct': block['median_abs_error_pct'],
                               'directions_matching': block['directions_matching'],
                               'direction_comparisons': block['direction_comparisons'],
                               'bounds_satisfied': sum(1 for row in block['bounds'] if row['satisfied']),
                               'bounds': len(block['bounds'])}
                              for block in check.get('daily_by_game', []) if 'days' in block],
                  'note': 'Single days are underestimated and their direction is not reliably tracked.'},
    }


def extra_evidence(subsample: dict | None, store_split: dict | None) -> dict:
    """Diagnostics that qualify the point estimate rather than improve it."""
    evidence = {}
    if subsample:
        summary = subsample['summary']
        evidence['label_subsample_dependence'] = {
            'draws': summary['draws'], 'keep_fraction': subsample['keep_fraction'],
            'parameters': summary['parameters'],
            'priced_spread_pct_of_median': {game: (row or {}).get('spread_pct_of_median')
                                            for game, row in summary['priced_usd_million'].items()},
            'meaning': subsample['meaning'],
        }
    if store_split:
        evidence['published_store_splits'] = [
            {'geography': row['geography'], 'window': [row['start'], row['end']],
             'published_ios_share': row['published_ios_share'], 'table_ios_share': row['table_ios_share'],
             'difference_pct_points': row['difference_pct_points'],
             'window_pricing_ratio': (row['window_pricing'] or {}).get('ratio')}
            for row in store_split['store_splits']]
    return evidence


def build_card(report: dict, variant_id: str | None, report_path: str, check: dict | None = None,
               subsample: dict | None = None, store_split: dict | None = None) -> dict:
    nested = {row['variant']: row for row in report['nested_cross_validation']}
    variant_id = variant_id or min(nested.values(), key=lambda row: row['nested_cv_rmse_log'])['variant']
    variant = next(row for row in report['variants'] if row['variant'] == variant_id)
    fold = nested[variant_id]
    holdout = report['reserved_holdout']
    return {
        'schema_version': 1,
        'production_enabled': False,
        'model_id': f'rank-curve-2026-09-11-{variant_id}',
        'source_report': report_path,
        'panel': report['panel'],
        'market_model': report['market_model'],
        'coverage_report': report['coverage_report'],
        'selected_model': {
            'variant': variant_id,
            'params': {key: value for key, value in variant['params'].items()
                       if key != 'coverage_correction'},
            'coverage_correction': variant['params']['coverage_correction'],
            'scales': variant['scales'],
        },
        'scale_meaning': ('index x scale = USD million for that evidence class over the labelled month. '
                          'Classes differ by provider and fee basis, so a net-basis class scale must not be '
                          'used to report gross consumer spending. Which index is required is part of the '
                          'contract and is not visible in the number: a worldwide class scale prices the '
                          'five-market index divided by that game\'s measured five-market coverage share, '
                          'while a country class scale prices that country\'s charts with no coverage '
                          'correction. Applying a worldwide scale to an uncorrected five-market index '
                          'underprices by roughly the coverage share and fails silently. A window shorter '
                          'than the fitted month is priced by dividing the monthly scale by the fitted '
                          'month length and multiplying by the window length.'),
        'estimated_from': {
            'labels': report['labels'], 'games': report['games'],
            'label_classes': report['label_classes'],
            'market_totals': report['market_totals'],
            'period': 'calendar month 2026-08 for labels; five archived markets for ranks',
        },
        'performance': {
            'label_cv_rmse_log': variant['cv_rmse_log'],
            'label_cv_median_abs_pct': variant['cv_median_abs_pct'],
            'nested_cv_rmse_log': fold['nested_cv_rmse_log'],
            'nested_cv_median_abs_pct': fold['nested_cv_median_abs_pct'],
            'nested_cv_worst_abs_pct': fold['nested_cv_worst_abs_pct'],
            'market_ratio_rmse_log': variant['market_rmse_log'],
            'reserved_holdout': {key: holdout[key] for key in
                                 ('variant', 'holdout_games', 'predicted_labels', 'rmse_log',
                                  'median_abs_pct', 'worst_abs_pct')},
            'baseline_round13_exponents': report['baseline_round13_exponents'],
            'prospective_september': prospective_summary(check),
        },
        'qualifying_evidence': extra_evidence(subsample, store_split),
        'parameter_stability': {
            'distinct_selected_parameter_sets': len(fold['selected_parameter_sets']),
            'selected_parameter_sets': fold['selected_parameter_sets'],
        },
        'limits': [
            'Ranks come from five archived markets; worldwide labels are reconciled with a measured '
            'coverage share from all-country snapshot days, not with observed August geography.',
            'The China weight multiplier absorbs both market-size error in the proxy table and any '
            'China-specific rank-to-payment difference; the two are not separated.',
            'Absence below the returned chart depth is credited at that depth\'s weight - the theoretical '
            'maximum for an unseen app - never zero revenue and never a fabricated rank. The fit and the '
            'per-game scorer credit absence in every chart, which nested cross-validation prefers to '
            'crediting it only where a game has charted (0.250 against 0.311). Aggregates over all charted '
            'apps and the coverage measurement must instead use observed ranks only: a per-game bound is '
            'not revenue, and summing it over thousands of apps inflates a market total about thirteenfold.',
            'Published market totals are products of rounded figures and constrain only country ratios.',
            'Fold-level parameter ranges show the data do not pin the exponents tightly.',
            'Worst-case per-label error stays far above the median; this is not an accuracy guarantee.',
            'Per-store, per-game amounts are uncalibrated: against eight published App Store only figures '
            'the median gap is 43% with errors in both directions, while the same games two-store totals '
            'land within 17%. Never split a game between the stores with this model.',
            'Per-country, per-game amounts are uncalibrated: aggregate country totals match published '
            'figures while one game still came out 26-40% under its published Japan week, even after '
            'pricing it with the Japan class scale. A country amount must use that country class scale, '
            'never the worldwide one, which sits 38% lower.',
            'Single-day amounts are not supported; the index compresses short spikes.',
            'The band published next to each amount measures label dependence only - how much the '
            'number moves when the curve is re-fitted on subsets of labelled games. Scored against the '
            'labels it covers 9% of reserved and 12.5% of fitted ones, so it is roughly seven times too '
            'narrow to be read as an accuracy interval, and it excludes provider disagreement, '
            'month-to-month drift and market-size proxy error entirely.',
        ],
        'not_validated': [
            'No full calendar month outside August has been predicted and scored; only a September week '
            'and four single days, and the single days were not predicted well.',
            'Ordering agreement against published monthly order mixes model error with within-month movement.',
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', default='reports/rank-models/august-curve-final-2026-09-11.json')
    parser.add_argument('--variant', default=None)
    parser.add_argument('--output', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--prospective', default='reports/rank-models/september-day-check-2026-09-11.json')
    parser.add_argument('--subsample', default='reports/rank-models/subsample-stability-2026-09-11.json')
    parser.add_argument('--store-split', default='reports/rank-models/store-split-check-2026-09-11.json')
    args = parser.parse_args()
    report = json.loads((ROOT / args.report).read_text(encoding='utf-8'))
    check_path = ROOT / args.prospective
    check = json.loads(check_path.read_text(encoding='utf-8')) if check_path.exists() else None
    if check is not None:
        check['output_path'] = args.prospective
    optional = []
    for value in (args.subsample, args.store_split):
        path = ROOT / value
        optional.append(json.loads(path.read_text(encoding='utf-8')) if path.exists() else None)
    card = build_card(report, args.variant, args.report, check, optional[0], optional[1])
    (ROOT / args.output).write_text(json.dumps(card, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'model_id': card['model_id'],
                      'params': card['selected_model']['params'],
                      'performance': {key: card['performance'][key] for key in
                                      ('nested_cv_rmse_log', 'nested_cv_median_abs_pct',
                                       'market_ratio_rmse_log')},
                      'holdout_median_abs_pct': card['performance']['reserved_holdout']['median_abs_pct']},
                     indent=2))


if __name__ == '__main__':
    main()
