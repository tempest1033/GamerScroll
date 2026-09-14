"""One command for the monthly loop: collect new labels, rebuild the ledger, refit.

Run it after the providers publish last month's charts (PocketGamer and
MobileGamer both post in the first half of the following month). Steps:

1. PocketGamer harvest -> review file. Prose extraction is conservative and its
   rows enter the ledger as reference / pending; promoting one to a benchmark
   is a manual edit of a manual anchor file after reading the quoted sentence.
2. MobileGamer harvest -> manual anchor file of net-basis ranked-list rows.
   These are exact and enter as benchmark / clear in their own fee class.
3. eog.gg revenue board harvest -> manual anchor file of its own label classes
   (eog_st / eog_blend). Whether those classes help is decided by the fit's
   rolling validation, not here.
4. Ledger rebuild from every manual file.
5. `history_fit` on all labelled months, with rolling validation and the
   learning curve, into a dated report, scored on the gross and net classes.

Each step writes its own artifact and a failure stops the run. Nothing here
touches production data or pages; the fit report is research output.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import date

from coverage_share import ROOT

PYTHON = sys.executable


def steps(run_date: str, since: str) -> list[dict]:
    harvest = f'reports/rank-models/monthly-chart-harvest-{run_date}.json'
    return [
        {'name': 'pocketgamer_harvest',
         'command': [PYTHON, 'scripts/revenue-research/harvest_monthly_charts.py', '--output', harvest],
         'produces': harvest},
        # harvest_to_manual is idempotent only when it regenerates the same file: it
        # skips ledger rows except its own, so a second file would duplicate them.
        {'name': 'pocketgamer_review',
         'command': [PYTHON, 'scripts/revenue-research/harvest_to_manual.py', '--input', harvest,
                     '--output', 'docs/research/anchors/manual/2026-09-11-monthly-chart-backfill.json',
                     '--added-on', '2026-09-11', '--first-source-number', '1201'],
         'produces': 'docs/research/anchors/manual/2026-09-11-monthly-chart-backfill.json'},
        {'name': 'mobilegamer_harvest',
         'command': [PYTHON, 'scripts/revenue-research/harvest_mobilegamer_charts.py',
                     '--discover-since', since, '--added-on', '2026-09-12',
                     '--manual', 'docs/research/anchors/manual/2026-09-12-mobilegamer-net-months.json',
                     '--report', f'reports/rank-models/mobilegamer-harvest-{run_date}.json'],
         'produces': 'docs/research/anchors/manual/2026-09-12-mobilegamer-net-months.json'},
        # Review-only: earlier months the write-ups mention in passing. Rows go
        # into the ledger only after a hand check (see the module note there).
        {'name': 'passing_mentions_review',
         'command': [PYTHON, 'scripts/revenue-research/harvest_derived_months.py',
                     '--output', f'reports/rank-models/derived-months-review-{run_date}.json'],
         'produces': f'reports/rank-models/derived-months-review-{run_date}.json'},
        {'name': 'sensortower_totals',
         'command': [PYTHON, 'scripts/revenue-research/harvest_sensortower_totals.py', '--refresh',
                     '--added-on', run_date, '--report', f'reports/rank-models/sensortower-totals-{run_date}.json'],
         'produces': 'docs/research/anchors/manual/2026-09-12-sensortower-monthly-totals.json'},
        {'name': 'eog_harvest',
         'command': [PYTHON, 'scripts/revenue-research/harvest_eog_revenue.py', '--refresh',
                     '--added-on', run_date, '--report', f'reports/rank-models/eog-harvest-{run_date}.json'],
         'produces': 'docs/research/anchors/manual/2026-09-12-eog-gacha-net-months.json'},
        # MobileGamer's monthly download lists (ranks 11-20, exact) for the
        # download model; the top-ten prose stays hand-entered.
        {'name': 'downloads_harvest',
         'command': [PYTHON, 'scripts/revenue-research/harvest_mobilegamer_downloads.py',
                     '--discover-since', since, '--added-on', run_date,
                     '--report', f'reports/rank-models/mobilegamer-downloads-harvest-{run_date}.json'],
         'produces': 'docs/research/anchors/manual/2026-09-13-mobilegamer-downloads-list.json'},
        {'name': 'ledger', 'command': ['node', 'scripts/anchors/build-anchor-ledger.js'],
         'produces': 'docs/research/anchors/anchors.jsonl'},
        {'name': 'fit', 'command': [PYTHON, 'scripts/revenue-research/history_fit.py',
                                    '--score-classes', 'gross,net',
                                    '--output', f'reports/rank-models/history-fit-{run_date}.json'],
         'produces': f'reports/rank-models/history-fit-{run_date}.json'},
        # Same loop for installs: the free charts against the download labels
        # (MobileGamer top-20 download lists and GameDev Reports download
        # figures, added by hand to
        # docs/research/anchors/manual/2026-09-12-mobilegamer-downloads.json,
        # plus the install counts PocketGamer.biz's monthly chart articles
        # quote for mid-table games, in
        # docs/research/anchors/manual/2026-09-12-pocketgamer-downloads.json,
        # until a harvester exists).
        {'name': 'fit_downloads', 'command': [PYTHON, 'scripts/revenue-research/history_fit.py',
                                              '--metric', 'downloads',
                                              '--output', f'reports/rank-models/history-fit-downloads-{run_date}.json'],
         'produces': f'reports/rank-models/history-fit-downloads-{run_date}.json'},
        {'name': 'service_coverage',
         'command': [PYTHON, 'scripts/revenue-research/service_coverage.py', '--as-of', run_date],
         'produces': 'reports/rank-models/service-coverage.json'},
        {'name': 'service_readiness',
         'command': [PYTHON, 'scripts/revenue-research/service_readiness.py', '--as-of', run_date],
         'produces': 'reports/rank-models/service-readiness.json'},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', default=date.today().isoformat())
    parser.add_argument('--since', default='2025-11', help='first month of MobileGamer charts to keep')
    parser.add_argument('--only', default='', help='comma separated step names')
    parser.add_argument('--output', default='')
    arguments = parser.parse_args()
    planned = steps(arguments.date, arguments.since)
    if arguments.only:
        wanted = set(arguments.only.split(','))
        unknown = wanted - {step['name'] for step in planned}
        if unknown:
            parser.error(f'Unknown steps: {sorted(unknown)}')
        planned = [step for step in planned if step['name'] in wanted]
    results = []
    for step in planned:
        started = time.perf_counter()
        completed = subprocess.run(step['command'], cwd=ROOT, capture_output=True, text=True)
        elapsed = time.perf_counter() - started
        results.append({'step': step['name'], 'seconds': elapsed, 'exit_code': completed.returncode,
                        'produces': step['produces'],
                        'stdout_tail': completed.stdout.strip().splitlines()[-3:],
                        'stderr_tail': completed.stderr.strip().splitlines()[-3:]})
        print(json.dumps({'step': step['name'], 'seconds': round(elapsed, 1), 'exit_code': completed.returncode}))
        if completed.returncode != 0:
            print('\n'.join(completed.stderr.strip().splitlines()[-10:]))
            break
    report = {'schema_version': 1, 'production_enabled': False, 'date': arguments.date,
              'steps': results, 'ok': all(row['exit_code'] == 0 for row in results)}
    output = ROOT / (arguments.output or f'reports/rank-models/monthly-refresh-{arguments.date}.json')
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(output.relative_to(ROOT)), 'ok': report['ok']}))
    if not report['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
