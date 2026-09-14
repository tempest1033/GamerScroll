"""Checks that decide whether the estimated curve is usable, beyond fit error.

Three separate questions, reported separately:
  1. accounting - do the scored games sum to something compatible with the
     published two-store market total?
  2. stability - how much do the selected parameters move across folds and
     across the days used for the coverage correction?
  3. ordering - does the scored order agree with the published monthly order?
Research only; no production output is written.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from coverage_share import ROOT, read_day, use_market_table
from score_day import load_model, score_day


def published_market_total(period=('2026-08-01', '2026-08-31')) -> dict:
    rows = [json.loads(line) for line in
            (ROOT / 'docs/research/anchors/anchors.jsonl').read_text(encoding='utf-8').splitlines() if line]
    totals = [row for row in rows if row['metric'] == 'market_total' and row['geography'] == 'WW'
              and row['period']['start'] == period[0] and row['period']['end'] == period[1]
              and row['fee_basis'] == 'gross']
    return {'rows': [{'provider': row['provider'], 'amount_usd_million': row['amount_usd_m'],
                      'qualifier': row['qualifier']} for row in totals]}


def accounting_check(day: dict, model: dict, scale_class: str) -> dict:
    """Observed chart mass for every charted app, converted with the gross class scale.

    Absence credit is a per-game bound, not revenue that exists, so summing it
    over thousands of charted apps would invent market size: with the fit's
    every-chart convention the total comes out about thirteen times the published
    one. The accounting therefore scores observed ranks only, which is exactly
    what the market constraint in the fit compares against.
    """
    scale = model['scales'][scale_class]
    observed_only = {**model['params'], 'censored': 0.0}
    result = score_day(day, observed_only)
    total = float(result['app_index'].sum()) * scale
    identified = float(sum(result['family_totals'].values())) * scale
    published = published_market_total()
    amounts = [row['amount_usd_million'] for row in published['rows']]
    country_rows = published_country_totals()
    per_country = []
    for row in country_rows:
        scored = result['country_totals'].get(row['geography'])
        if scored is None:
            continue
        per_country.append({'geography': row['geography'], 'provider': row['provider'],
                            'published_usd_million': row['amount_usd_million'],
                            'scored_usd_million': scored * scale,
                            'ratio': scored * scale / row['amount_usd_million'],
                            'store_scope': row['stores']})
    return {
        'scale_class': scale_class,
        'absence_rule': 'observed ranks only (censored weight set to zero for the aggregate)',
        'scored_apps': len(result['app_ids']),
        'all_charted_apps_usd_million': total,
        'identified_games_usd_million': identified,
        'published_two_store_market_totals_usd_million': published['rows'],
        'ratio_to_published': {row['provider']: total / row['amount_usd_million']
                               for row in published['rows']},
        'per_country': per_country,
        'per_country_meaning': ('Scored chart mass for one country against that country published market '
                                'total. Store scope differences are listed rather than reconciled.'),
        'meaning': ('The scale converts a month of labels, so a single scored day is compared as a monthly '
                    'rate. A ratio far from 1 means the scored mass is not consistent with the published '
                    'market size, independent of per-game error.'),
    }


def published_country_totals(period=('2026-08-01', '2026-08-31')) -> list:
    rows = [json.loads(line) for line in
            (ROOT / 'docs/research/anchors/anchors.jsonl').read_text(encoding='utf-8').splitlines() if line]
    return [{'geography': row['geography'], 'provider': row['provider'], 'stores': row['stores'],
             'amount_usd_million': row['amount_usd_m']}
            for row in rows if row['metric'] == 'market_total' and row['geography'] != 'WW'
            and row['period']['start'] == period[0] and row['period']['end'] == period[1]
            and row['fee_basis'] == 'gross' and row['amount_usd_m']]


def stability(report: dict) -> dict:
    rows = []
    for variant in report['nested_cross_validation']:
        selections = variant['selected_parameter_sets']
        alphas_ios = [row['alpha_ios'] for row in selections]
        alphas_aos = [row['alpha_aos'] for row in selections]
        censored = [row['censored'] for row in selections]
        rows.append({
            'variant': variant['variant'], 'distinct_parameter_sets': len(selections),
            'alpha_ios_range': [min(alphas_ios), max(alphas_ios)],
            'alpha_aos_range': [min(alphas_aos), max(alphas_aos)],
            'censored_range': [min(censored), max(censored)],
            'country_multiplier_values': sorted({row['country_multipliers'] for row in selections}),
        })
    return {'per_variant': rows,
            'meaning': ('Ranges come from re-selecting parameters inside every fold. Wide ranges mean the '
                        'data do not pin the parameter down, even when the average error looks good.')}


def ordering_check(day: dict, model: dict, labels_period=('2026-08-01', '2026-08-31')) -> dict:
    rows = [json.loads(line) for line in
            (ROOT / 'docs/research/anchors/anchors.jsonl').read_text(encoding='utf-8').splitlines() if line]
    published = {}
    for row in rows:
        if (row['metric'] == 'consumer_spend' and row['geography'] == 'WW' and row['fee_basis'] == 'gross'
                and row['period']['start'] == labels_period[0] and row['period']['end'] == labels_period[1]
                and row['qualifier'] is None and row['fit']['usable']):
            published[row['game_key']] = row['amount_usd_m']
    scored = score_day(day, model['params'])['family_totals']
    pairs = [(name, published[name], scored.get(name)) for name in published if scored.get(name)]
    inversions, comparisons = 0, 0
    for i in range(len(pairs)):
        for j in range(i + 1, len(pairs)):
            comparisons += 1
            if (pairs[i][1] - pairs[j][1]) * (pairs[i][2] - pairs[j][2]) < 0:
                inversions += 1
    return {'games_compared': len(pairs), 'pairs': comparisons, 'inversions': inversions,
            'agreement': 1 - inversions / comparisons if comparisons else None,
            'missing_from_scored_day': sorted(set(published) - {name for name, _, _ in pairs}),
            'meaning': ('Published monthly order versus one scored day. Disagreement mixes model error with '
                        'genuine within-month movement; it is not a pure model metric.')}


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True)
    parser.add_argument('--collector-output', default='')
    parser.add_argument('--model', default='reports/rank-models/august-curve-estimates-2026-09-11.json')
    parser.add_argument('--market', default='')
    parser.add_argument('--scale-class', default='S01|gross|WW|app_store+google_play')
    parser.add_argument('--output', default='reports/rank-models/model-audit-2026-09-11.json')
    args = parser.parse_args()
    if args.market:
        use_market_table(args.market)
    report = json.loads((ROOT / args.model).read_text(encoding='utf-8'))
    model = load_model(ROOT / args.model)
    day = read_day(args.date, args.collector_output)
    audit = {
        'schema_version': 1, 'production_enabled': False, 'date': args.date,
        'market_table': args.market or 'data/rank-models/global-chart-2026-v0.3.json',
        'model_report': args.model,
        'model_variant': model['variant'], 'params': model['params'],
        'accounting': accounting_check(day, model, args.scale_class),
        'stability': stability(report),
        'ordering': ordering_check(day, model),
        'coverage_correction': report['coverage_correction'],
        'reserved_holdout': {key: report['reserved_holdout'][key] for key in
                             ('variant', 'selected_params', 'holdout_games', 'predicted_labels',
                              'rmse_log', 'median_abs_pct', 'worst_abs_pct')},
    }
    path = ROOT / args.output
    path.write_text(json.dumps(audit, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(path.relative_to(ROOT)).replace('\\', '/'),
                      'accounting': {'all_charted_apps_usd_million':
                                     round(audit['accounting']['all_charted_apps_usd_million'], 1),
                                     'ratio_to_published':
                                     {key: round(value, 3) for key, value
                                      in audit['accounting']['ratio_to_published'].items()},
                                     'per_country': [{'geography': row['geography'],
                                                      'ratio': round(row['ratio'], 3),
                                                      'published_usd_million': row['published_usd_million']}
                                                     for row in audit['accounting']['per_country']]},
                      'ordering': {key: audit['ordering'][key] for key in
                                   ('games_compared', 'pairs', 'inversions', 'agreement')},
                      'stability': audit['stability']['per_variant'][:3]}, indent=2))


if __name__ == '__main__':
    main()
