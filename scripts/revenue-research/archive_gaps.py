"""Where is the rank history missing, and does the backup cover what exists?

A multi-year panel is only as good as its gaps are visible. This walks the local
archive day by day, reports which expected charts never arrived, and checks the
monthly bundles against the files on disk. It never writes into the archive.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from coverage_share import ROOT

NAME = re.compile(r'^(\d{4}-\d{2}-\d{2})_(ios|aos)_([a-z]{2})_(grossing|free)\.csv$')
# China has no Google Play, so an aos_cn chart is not a gap - it never exists.
EXPECTED_MARKETS = (('ios', 'cn'), ('ios', 'jp'), ('aos', 'jp'), ('ios', 'kr'), ('aos', 'kr'),
                    ('ios', 'tw'), ('aos', 'tw'), ('ios', 'us'), ('aos', 'us'))
CHARTS = ('grossing', 'free')


def scan(source: Path) -> dict:
    present = defaultdict(set)
    unexpected = []
    for path in sorted(source.iterdir()):
        if not path.is_file():
            continue
        match = NAME.match(path.name)
        if not match:
            unexpected.append(path.name)
            continue
        day, store, country, chart = match.groups()
        present[day].add((store, country, chart))
    return {'present': present, 'unexpected': unexpected}


def day_range(first: str, last: str) -> list[str]:
    start, end = date.fromisoformat(first), date.fromisoformat(last)
    return [(start + timedelta(days=offset)).isoformat() for offset in range((end - start).days + 1)]


def gaps(present: dict, charts=CHARTS, markets=EXPECTED_MARKETS, through: str | None = None) -> dict:
    """`through` extends the window past the newest file, so a stalled feed shows up."""
    if not present:
        return {'days': [], 'missing_days': [], 'partial_days': []}
    expected = {(store, country, chart) for store, country in markets for chart in charts}
    last = max(max(present), through) if through else max(present)
    days = day_range(min(present), last)
    rows, missing_days, partial = [], [], []
    for day in days:
        have = present.get(day, set())
        if not have:
            missing_days.append(day)
            rows.append({'date': day, 'charts': 0, 'missing': sorted('_'.join(item) for item in expected)})
            continue
        absent = sorted('_'.join(item) for item in expected - have)
        rows.append({'date': day, 'charts': len(have), 'missing': absent})
        if absent:
            partial.append({'date': day, 'missing': absent})
    return {'days': rows, 'missing_days': missing_days, 'partial_days': partial,
            'expected_per_day': len(expected), 'first': days[0], 'last': days[-1]}


def bundle_coverage(source: Path, bundles: Path) -> list[dict]:
    """Every archive file should sit in a month bundle with a matching size."""
    rows = []
    for manifest_path in sorted(bundles.glob('*.manifest.json')):
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        bundled = {row['name']: row['bytes'] for row in manifest['files']}
        on_disk = {path.name: path.stat().st_size for path in source.glob(f"{manifest['month']}-*")
                   if path.is_file()}
        missing = sorted(set(on_disk) - set(bundled))
        changed = sorted(name for name, size in on_disk.items()
                         if name in bundled and bundled[name] != size)
        rows.append({'month': manifest['month'], 'bundle': manifest['bundle'],
                     'files_on_disk': len(on_disk), 'files_in_bundle': len(bundled),
                     'not_in_bundle': missing, 'size_changed_since_bundle': changed})
    return rows


def names_at_ref(ref: str, source: str) -> set[str] | None:
    """File names the given git ref holds for this path, or None when the ref is unavailable."""
    completed = subprocess.run(['git', 'ls-tree', '--name-only', ref, f'{source}/'],
                               cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        return None
    return {line.rsplit('/', 1)[-1] for line in completed.stdout.splitlines() if line.strip()}


def classify_missing(report: dict, local: dict, upstream: set[str] | None) -> dict:
    """Separate a stalled feed from a stale checkout: both look like a hole locally."""
    if upstream is None:
        return {'ref_available': False}
    recoverable, absent = [], []
    for row in report['days']:
        for name in row['missing']:
            store, country, chart = name.split('_')
            filename = f"{row['date']}_{store}_{country}_{chart}.csv"
            (recoverable if filename in upstream else absent).append(filename)
    return {'ref_available': True, 'present_upstream_not_local': sorted(recoverable),
            'absent_everywhere': sorted(absent),
            'local_files': sum(len(value) for value in local.values()),
            'upstream_files': len(upstream)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='snapshots/rankings')
    parser.add_argument('--bundles', default='reports/archive-bundles')
    parser.add_argument('--through', default=date.today().isoformat(),
                        help='last day the archive is expected to cover')
    parser.add_argument('--ref', default='origin/main',
                        help='git ref to compare against; a local hole may already exist upstream')
    parser.add_argument('--output', default='reports/rank-models/archive-gaps-2026-09-11.json')
    args = parser.parse_args()
    source = ROOT / args.source
    scanned = scan(source)
    report = gaps(scanned['present'], through=args.through)
    report.update({
        'schema_version': 1, 'production_enabled': False,
        'source': args.source, 'unexpected_names': scanned['unexpected'],
        'bundles': bundle_coverage(source, ROOT / args.bundles),
        'against_ref': classify_missing(report, scanned['present'],
                                        names_at_ref(args.ref, args.source)),
        'ref': args.ref,
        'meaning': ('A missing chart is recorded as missing. Nothing is backfilled from a neighbouring '
                    'day, and aos_cn is not expected because China has no Google Play.'),
    })
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'window': [report['first'], report['last']],
                      'expected_per_day': report['expected_per_day'],
                      'days': len(report['days']), 'missing_days': report['missing_days'],
                      'partial_days': [{'date': row['date'], 'missing': row['missing']}
                                       for row in report['partial_days']][:10],
                      'partial_day_count': len(report['partial_days']),
                      'against_ref': {key: (len(value) if isinstance(value, list) else value)
                                      for key, value in report['against_ref'].items()},
                      'bundles': [{key: (value if not isinstance(value, list) else len(value))
                                   for key, value in row.items()} for row in report['bundles']]},
                     indent=2))


if __name__ == '__main__':
    main()
