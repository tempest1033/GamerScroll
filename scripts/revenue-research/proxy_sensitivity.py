"""How much does the estimated part of the market table move the answer?

Only 25 of the 128 countries inherit a published market size; the other 103 are
regional macro allocations. This rescales exactly those 103 and re-runs the
chain, so the largest remaining assumption is reported as a number instead of a
caveat. Research only.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

from coverage_share import ROOT

PYTHON = sys.executable
ESTIMATED_METHOD = 'regional_macro_allocation'
OUT = 'reports/rank-models/market-sensitivity'


def perturb(table: dict, factor: float) -> tuple[dict, int]:
    changed = 0
    countries = []
    for row in table['countries']:
        row = dict(row)
        if row.get('method') == ESTIMATED_METHOD:
            row['marketProxyUsd'] = row['marketProxyUsd'] * factor
            row['sensitivityFactor'] = factor
            changed += 1
        countries.append(row)
    return {**table, 'countries': countries,
            'sensitivityNote': f'Estimated-only countries scaled by {factor}; research scenario.'}, changed


def run(command: list[str]) -> None:
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        raise SystemExit(f'Step failed: {" ".join(command)}\n{completed.stderr[-800:]}')


def scenario(factor: float, days: list[str], session: str, panel: str, base_fit: str) -> dict:
    tag = str(factor).replace('.', 'p')
    table = f'{OUT}/market-{tag}.json'
    coverage = f'{OUT}/coverage-{tag}.json'
    fitted = f'{OUT}/fit-{tag}.json'
    card = f'{OUT}/card-{tag}.json'
    scores = f'{OUT}/day-scores-{tag}.json'
    base = json.loads((ROOT / 'data/rank-models/global-chart-2026-v0.3.json').read_text(encoding='utf-8'))
    perturbed, changed = perturb(base, factor)
    (ROOT / table).write_text(json.dumps(perturbed) + '\n', encoding='utf-8')
    day_arguments = [f'{date}={session}' if date == '2026-09-11' else date for date in days]
    run([PYTHON, 'scripts/revenue-research/coverage_share.py', f'--market={table}',
         f'--estimates={base_fit}', f'--output={coverage}', *day_arguments])
    run([PYTHON, 'scripts/revenue-research/fit_rank_curve.py', '--panel', panel,
         '--coverage', coverage, '--output', fitted, '--market-weight', '1',
         '--variants', 'store_alpha_cn_market_coverage'])
    run([PYTHON, 'scripts/revenue-research/model_card.py', '--report', fitted, '--output', card,
         '--prospective', f'{OUT}/missing.json', '--subsample', f'{OUT}/missing.json',
         '--store-split', f'{OUT}/missing.json'])
    run([PYTHON, 'scripts/revenue-research/score_day.py', '--date', '2026-09-11',
         '--collector-output', session, '--model', card, f'--market={table}', '--output', scores])
    coverage_report = json.loads((ROOT / coverage).read_text(encoding='utf-8'))
    card_report = json.loads((ROOT / card).read_text(encoding='utf-8'))
    day = json.loads((ROOT / scores).read_text(encoding='utf-8'))
    return {
        'factor': factor, 'countries_rescaled': changed,
        'median_five_market_share': [row['median_five_market_share'] for row in coverage_report['days']],
        'params': card_report['selected_model']['params'],
        'nested_cv_rmse_log': card_report['performance']['nested_cv_rmse_log'],
        'holdout_median_abs_pct': card_report['performance']['reserved_holdout']['median_abs_pct'],
        'priced': {row['game']: row['monthly_scale_reference_usd_million'] for row in day['top']},
        'order': [row['game'] for row in day['top']],
        'artifacts': {'market': table, 'coverage': coverage, 'fit': fitted, 'day_scores': scores},
    }


def compare(base: dict, other: dict) -> dict:
    shared = [game for game in base['order'] if game in other['priced']]
    moves = [abs(other['priced'][game] / base['priced'][game] - 1) * 100 for game in shared
             if base['priced'].get(game)]
    kept = [game for game in base['order'][:10] if game in other['order'][:10]]
    return {'factor': other['factor'], 'games_compared': len(shared),
            'median_priced_change_pct': sorted(moves)[len(moves) // 2] if moves else None,
            'max_priced_change_pct': max(moves) if moves else None,
            'top10_membership_kept': len(kept) / 10,
            'same_top10_order': base['order'][:10] == other['order'][:10],
            'params_changed': base['params'] != other['params']}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--factors', default='0.7,1.3')
    parser.add_argument('--days', default='2026-09-08,2026-09-09,2026-09-11')
    parser.add_argument('--session',
                        default='reports/rank-models/sustained-rank-observations-2026-09-11/'
                                'session-F5mbni/collector-output')
    parser.add_argument('--panel', default='reports/rank-models/august-label-panel-2026-09-11.json')
    parser.add_argument('--base-fit', default='reports/rank-models/august-curve-final-2026-09-11.json')
    parser.add_argument('--output', default='reports/rank-models/proxy-sensitivity-2026-09-11.json')
    args = parser.parse_args()
    (ROOT / OUT).mkdir(parents=True, exist_ok=True)
    days = args.days.split(',')
    baseline = scenario(1.0, days, args.session, args.panel, args.base_fit)
    scenarios = [scenario(float(value), days, args.session, args.panel, args.base_fit)
                 for value in args.factors.split(',')]
    report = {
        'schema_version': 1, 'production_enabled': False,
        'estimated_method': ESTIMATED_METHOD,
        'meaning': ('Only the countries whose market size is a regional macro allocation are rescaled. '
                    'The five charted markets all carry published sizes, so this moves the worldwide '
                    'denominator and the unobserved-country mass, not the observed ranks.'),
        'baseline': baseline, 'scenarios': scenarios,
        'comparisons': [compare(baseline, row) for row in scenarios],
        'limits': ['A uniform rescale is not how the real error is distributed across countries.',
                   'The rank panel itself is unchanged, so this understates the effect for games that '
                   'earn mostly outside the five archived markets.'],
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'baseline_params': baseline['params'],
                      'comparisons': report['comparisons']}, indent=2))


if __name__ == '__main__':
    main()
