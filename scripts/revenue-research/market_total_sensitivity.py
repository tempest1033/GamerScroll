"""How much does the fit depend on the three published country totals?

The market constraint that ties the country weights together rests on exactly
three gross country totals for the fitted month (CN, JP, US) from one provider.
This re-runs the selected variant while leaving each of them out, and once with
no market constraint at all, so the dependence is a measured number rather than
an assumption. Research only.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

from coverage_share import ROOT

PYTHON = sys.executable
OUT = 'reports/rank-models/market-total-sensitivity'
VARIANT = 'store_alpha_cn_market_coverage'
NO_MARKET_VARIANT = 'store_alpha_cn_coverage'


def run(command: list[str]) -> None:
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        raise SystemExit(f'Step failed: {" ".join(command)}\n{completed.stderr[-800:]}')


def scenario(tag: str, geographies: str, panel: str, coverage: str, session: str,
             variant: str = VARIANT, market_weight: str = '1') -> dict:
    fitted = f'{OUT}/fit-{tag}.json'
    card = f'{OUT}/card-{tag}.json'
    scores = f'{OUT}/day-scores-{tag}.json'
    command = [PYTHON, 'scripts/revenue-research/fit_rank_curve.py', '--panel', panel,
               '--coverage', coverage, '--output', fitted, '--market-weight', market_weight,
               '--variants', variant]
    if geographies:
        command += ['--market-geographies', geographies]
    run(command)
    run([PYTHON, 'scripts/revenue-research/model_card.py', '--report', fitted, '--output', card,
         '--prospective', f'{OUT}/missing.json', '--subsample', f'{OUT}/missing.json',
         '--store-split', f'{OUT}/missing.json'])
    run([PYTHON, 'scripts/revenue-research/score_day.py', '--date', '2026-09-11',
         '--collector-output', session, '--model', card, '--output', scores])
    report = json.loads((ROOT / fitted).read_text(encoding='utf-8'))
    card_report = json.loads((ROOT / card).read_text(encoding='utf-8'))
    day = json.loads((ROOT / scores).read_text(encoding='utf-8'))
    return {
        'scenario': tag,
        'market_totals_used': [f"{row['geography']} {row['amount_usd_million']}"
                               for row in report['market_totals']],
        'params': card_report['selected_model']['params'],
        'nested_cv_rmse_log': card_report['performance']['nested_cv_rmse_log'],
        'holdout_median_abs_pct': card_report['performance']['reserved_holdout']['median_abs_pct'],
        'market_rmse_log': next((row['market_rmse_log'] for row in report['variants']
                                 if row['variant'] == variant), None),
        'priced': {row['game']: row['monthly_scale_reference_usd_million'] for row in day['top']},
        'order': [row['game'] for row in day['top']],
    }


def compare(base: dict, other: dict) -> dict:
    shared = [game for game in base['order'] if game in other['priced'] and base['priced'].get(game)]
    moves = sorted((abs(other['priced'][game] / base['priced'][game] - 1) * 100, game)
                   for game in shared)
    same_rank = sum(1 for index, game in enumerate(base['order'][:10])
                    if index < len(other['order']) and other['order'][index] == game)
    return {
        'scenario': other['scenario'],
        'games_compared': len(shared),
        'median_amount_move_pct': moves[len(moves) // 2][0] if moves else None,
        'max_amount_move_pct': moves[-1][0] if moves else None,
        'largest_mover': moves[-1][1] if moves else None,
        'top10_positions_unchanged': same_rank,
        'params_changed': {key: [base['params'].get(key), other['params'].get(key)]
                           for key in set(base['params']) | set(other['params'])
                           if base['params'].get(key) != other['params'].get(key)},
        'nested_cv_delta': (other['nested_cv_rmse_log'] - base['nested_cv_rmse_log']
                            if other['nested_cv_rmse_log'] is not None else None),
        'holdout_delta_pct': (other['holdout_median_abs_pct'] - base['holdout_median_abs_pct']
                              if other['holdout_median_abs_pct'] is not None else None),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--panel', default='reports/rank-models/august-label-panel-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-3day-2026-09-11.json')
    parser.add_argument('--session', default='reports/rank-models/sustained-rank-observations-2026-09-11/session-F5mbni/collector-output')
    parser.add_argument('--output', default='reports/rank-models/market-total-sensitivity-2026-09-11.json')
    arguments = parser.parse_args()
    (ROOT / OUT).mkdir(parents=True, exist_ok=True)

    base = scenario('all', '', arguments.panel, arguments.coverage, arguments.session)
    countries = sorted({entry.split()[0] for entry in base['market_totals_used']})
    scenarios = [base]
    for country in countries:
        kept = ','.join(code for code in countries if code != country)
        scenarios.append(scenario(f'without-{country}', kept, arguments.panel,
                                  arguments.coverage, arguments.session))
    scenarios.append(scenario('no-market-constraint', '', arguments.panel, arguments.coverage,
                              arguments.session, variant=NO_MARKET_VARIANT, market_weight='0'))

    payload = {
        'schema_version': 1,
        'production_enabled': False,
        'question': ('The country weights are tied together by three published country totals. '
                     'How much of the fitted model survives dropping any one of them?'),
        'scenarios': scenarios,
        'comparisons': [compare(base, other) for other in scenarios[1:]],
    }
    path = ROOT / arguments.output
    path.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': arguments.output, 'scenarios': len(scenarios),
                      'countries': countries,
                      'worst_median_move_pct': max((row['median_amount_move_pct'] or 0)
                                                   for row in payload['comparisons'])}))


if __name__ == '__main__':
    main()
