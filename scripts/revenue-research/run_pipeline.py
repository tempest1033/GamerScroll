"""Reproduce the whole research pipeline in one command, with timings.

Order matters: the panel needs the ledger, the fit needs the panel and the
coverage measurement, the card needs the fit, and every check needs the card.
Each step writes its own artifact, so a failure stops the run instead of
leaving a half-updated set. Research only: no production path is touched.

The coverage measurement needs exponents before the fit exists, so it reads the
previous fit report; its own alpha sensitivity shows the measured share moves by
only a few points across the plausible exponent range.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time

from coverage_share import ROOT

PYTHON = sys.executable
SESSION = 'reports/rank-models/sustained-rank-observations-2026-09-11/session-F5mbni/collector-output'


def steps(session: str, coverage_days: list[str]) -> list[dict]:
    # A day may name its own collector output as "date=path"; otherwise the session
    # given for this run supplies the 2026-09-11 snapshot and the rest resolve on their own.
    day_arguments = [date if '=' in date else (f'{date}={session}' if date == '2026-09-11' else date)
                     for date in coverage_days]
    return [
        {'name': 'panel', 'command': ['node', 'scripts/revenue-research/august-panel.js'],
         'produces': 'reports/rank-models/august-label-panel-2026-09-11.json'},
        {'name': 'coverage', 'command': [PYTHON, 'scripts/revenue-research/coverage_share.py',
                                         '--estimates=reports/rank-models/august-curve-final-2026-09-11.json',
                                         '--output=reports/rank-models/coverage-share-3day-2026-09-11.json',
                                         *day_arguments],
         'produces': 'reports/rank-models/coverage-share-3day-2026-09-11.json'},
        {'name': 'coverage_ios', 'command': [PYTHON, 'scripts/revenue-research/coverage_share.py',
                                             '--estimates=reports/rank-models/august-curve-final-2026-09-11.json',
                                             '--stores=ios',
                                             '--output=reports/rank-models/coverage-share-ios-2026-09-11.json',
                                             *day_arguments],
         'produces': 'reports/rank-models/coverage-share-ios-2026-09-11.json'},
        {'name': 'fit', 'command': [PYTHON, 'scripts/revenue-research/fit_rank_curve.py',
                                    '--panel', 'reports/rank-models/august-label-panel-2026-09-11.json',
                                    '--coverage', 'reports/rank-models/coverage-share-3day-2026-09-11.json',
                                    '--output', 'reports/rank-models/august-curve-final-2026-09-11.json',
                                    '--market-weight', '1',
                                    '--variants', 'store_alpha_cn_market_coverage,store_alpha_cn_jp_market_coverage'],
         'produces': 'reports/rank-models/august-curve-final-2026-09-11.json'},
        {'name': 'card', 'command': [PYTHON, 'scripts/revenue-research/model_card.py'],
         'produces': 'reports/rank-models/model-card-2026-09-11.json'},
        {'name': 'subsample', 'command': [PYTHON, 'scripts/revenue-research/subsample_stability.py',
                                          '--games', 'all'],
         'produces': 'reports/rank-models/subsample-stability-2026-09-11.json'},
        {'name': 'band_coverage', 'command': [PYTHON, 'scripts/revenue-research/band_coverage.py'],
         'produces': 'reports/rank-models/band-coverage-2026-09-11.json'},
        {'name': 'day_scores', 'command': [PYTHON, 'scripts/revenue-research/score_day.py',
                                           '--date', '2026-09-11', '--collector-output', session,
                                           '--model', 'reports/rank-models/model-card-2026-09-11.json',
                                           '--bands', 'reports/rank-models/subsample-stability-2026-09-11.json',
                                           '--error-band', 'reports/rank-models/band-coverage-2026-09-11.json',
                                           '--output', 'reports/rank-models/day-scores-final-2026-09-11.json'],
         'produces': 'reports/rank-models/day-scores-final-2026-09-11.json'},
        {'name': 'audit', 'command': [PYTHON, 'scripts/revenue-research/audit_model.py',
                                      '--date', '2026-09-11', '--collector-output', session,
                                      '--model', 'reports/rank-models/august-curve-final-2026-09-11.json',
                                      '--output', 'reports/rank-models/model-audit-final-2026-09-11.json'],
         'produces': 'reports/rank-models/model-audit-final-2026-09-11.json'},
        {'name': 'round_stability', 'command': [PYTHON, 'scripts/revenue-research/round_stability.py',
                                                '--date', '2026-09-11', '--collector-output', session],
         'produces': 'reports/rank-models/round-stability-2026-09-11.json'},
        {'name': 'september_check', 'command': [PYTHON, 'scripts/revenue-research/september_day_check.py'],
         'produces': 'reports/rank-models/september-day-check-2026-09-11.json'},
        {'name': 'store_split', 'command': [PYTHON, 'scripts/revenue-research/store_split_check.py'],
         'produces': 'reports/rank-models/store-split-check-2026-09-11.json'},
        {'name': 'reference', 'command': [PYTHON, 'scripts/revenue-research/reference_comparison.py'],
         'produces': 'reports/rank-models/reference-comparison-2026-09-11.json'},
        {'name': 'country_bias', 'command': [PYTHON, 'scripts/revenue-research/country_bias_check.py'],
         'produces': 'reports/rank-models/country-bias-2026-09-11.json'},
        {'name': 'ordering', 'command': [PYTHON, 'scripts/revenue-research/ordering_check.py'],
         'produces': 'reports/rank-models/ordering-check-2026-09-11.json'},
        {'name': 'proxy_sensitivity', 'command': [PYTHON, 'scripts/revenue-research/proxy_sensitivity.py',
                                                  '--session', session],
         'produces': 'reports/rank-models/proxy-sensitivity-2026-09-11.json'},
        {'name': 'market_total_sensitivity',
         'command': [PYTHON, 'scripts/revenue-research/market_total_sensitivity.py',
                     '--session', session],
         'produces': 'reports/rank-models/market-total-sensitivity-2026-09-11.json'},
        {'name': 'external_order', 'command': [PYTHON, 'scripts/revenue-research/external_order_check.py'],
         'produces': 'reports/rank-models/external-order-check-2026-09-11.json'},
        {'name': 'refresh_rate', 'command': [PYTHON, 'scripts/revenue-research/refresh_rate.py',
                                             '--date', '2026-09-11', '--collector-output', session],
         'produces': 'reports/rank-models/refresh-rate-2026-09-11.json'},
        {'name': 'snapshot_weighting',
         'command': [PYTHON, 'scripts/revenue-research/snapshot_weighting.py',
                     '--date', '2026-09-11', '--collector-output', session],
         'produces': 'reports/rank-models/snapshot-weighting-2026-09-11.json'},
        {'name': 'round_audit', 'command': [PYTHON, 'scripts/revenue-research/round_audit.py'],
         'produces': 'reports/rank-models/round-audit-2026-09-11.json'},
        {'name': 'archive_gaps', 'command': [PYTHON, 'scripts/revenue-research/archive_gaps.py'],
         'produces': 'reports/rank-models/archive-gaps-2026-09-11.json'},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', default=SESSION)
    parser.add_argument('--coverage-days', default='2026-09-08,2026-09-09,2026-09-11')
    parser.add_argument('--only', default='', help='comma separated step names')
    parser.add_argument('--output', default='reports/rank-models/pipeline-run-2026-09-11.json')
    arguments = parser.parse_args()
    planned = steps(arguments.session, arguments.coverage_days.split(','))
    if arguments.only:
        wanted = set(arguments.only.split(','))
        planned = [step for step in planned if step['name'] in wanted]
    results = []
    for step in planned:
        started = time.perf_counter()
        completed = subprocess.run(step['command'], cwd=ROOT, capture_output=True, text=True)
        elapsed = time.perf_counter() - started
        results.append({'step': step['name'], 'seconds': elapsed, 'exit_code': completed.returncode,
                        'produces': step['produces'],
                        'stderr_tail': completed.stderr.strip().splitlines()[-3:]})
        print(json.dumps({'step': step['name'], 'seconds': round(elapsed, 1),
                          'exit_code': completed.returncode}))
        if completed.returncode != 0:
            break
    report = {'schema_version': 1, 'production_enabled': False, 'session': arguments.session,
              'coverage_days': arguments.coverage_days.split(','), 'steps': results,
              'total_seconds': sum(row['seconds'] for row in results),
              'ok': all(row['exit_code'] == 0 for row in results)}
    (ROOT / arguments.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': arguments.output, 'ok': report['ok'],
                      'total_seconds': round(report['total_seconds'], 1)}))
    if not report['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
