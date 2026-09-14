"""Incrementally consume all-country archives for future coverage research.

Keep historical reports immutable. New measurements use the same documented
proxy convention, with exact source hashes. They do not retroactively enter
historical service validation or silently alter the frozen model.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import coverage_share as coverage
from service_model import digest, write_atomic
from service_inputs import source_config, verify_preserved

BASE = {
    'consumer_spend': 'reports/rank-models/coverage-share-5day-2026-09-13.json',
    'downloads': 'reports/rank-models/coverage-downloads-5day-2026-09-13.json',
}


@lru_cache(maxsize=1)
def collector_scope() -> dict:
    """Read the collector's actual contract, not a duplicated country allowlist."""
    result = subprocess.run(['node', '-e',
        'const s=require("./src/crawlers/storefronts");'
        'process.stdout.write(JSON.stringify({countries:s.COUNTRY_CODES,no_android:[...s.NO_ANDROID]}));'],
        cwd=coverage.ROOT, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def expected_charts(weights: dict, kind: str, scope: dict) -> tuple[set, set]:
    planned = {f'{store}_{country.lower()}_{kind}' for country in scope['countries']
               for store in ('ios', 'aos') if store == 'ios' or country not in scope['no_android']}
    weighted = {f'{store}_{country.lower()}_{kind}' for (country, store), value in weights.items() if value > 0}
    return planned & weighted, weighted - planned


def refresh(metric: str, as_of: str, previous: dict | None = None,
            directory: Path | None = None) -> dict:
    path = coverage.ROOT / BASE[metric]
    base_bytes = path.read_bytes()
    base = json.loads(base_bytes)
    if previous is not None and previous['base_sha256'] != hashlib.sha256(base_bytes).hexdigest():
        raise ValueError('Base coverage evidence changed; do not reuse a stale incremental result')
    days = {row['date']: row for row in base['days'] if row['date'] <= as_of}
    sources = {}
    if previous:
        days.update({row['date']: row for row in previous['days'] if row['date'] <= as_of})
        sources.update(previous.get('new_source_hashes', {}))
    directory = directory or coverage.ROOT / 'snapshots/global'
    coverage.use_market_table(base['market_table'])
    weights = coverage.market_weights()
    lookup, games = coverage.identity_lookup()
    kind = base['chart_kind']
    required, unobserved = expected_charts(weights, kind, collector_scope())
    inputs = {
        'identities': hashlib.sha256((coverage.ROOT / 'docs/research/anchors/identities.json').read_bytes()).hexdigest(),
        'market': hashlib.sha256((coverage.ROOT / base['market_table']).read_bytes()).hexdigest(),
        'scorer': hashlib.sha256(Path(coverage.__file__).read_bytes()).hexdigest(),
        'alpha': base['alpha'], 'censored': base.get('censored_weight', 0.0),
        'stores': base.get('stores', ['ios', 'aos']), 'collector': collector_scope()}
    fingerprint = digest(inputs)
    remeasure = previous is None or previous.get('measurement_fingerprint') != fingerprint
    files = {row['date']: coverage.ROOT / row['collector_output'] / f'{row["date"]}.json.br'
             for row in base['day_sources'] if row['date'] <= as_of}
    for name in sources:
        file = Path(name)
        if file.name[:10] <= as_of:
            files[file.name[:10]] = file
    for file in sorted(directory.glob('????-??-??.json.br')):
        if file.name[:10] <= as_of:
            files.setdefault(file.name[:10], file)
    if remeasure and set(days) - set(files):
        raise ValueError('Cannot reconstruct all stale coverage days from preserved sources')
    new_days = recomputed_days = 0
    for day, file in sorted(files.items()):
        existed = day in days
        if existed and not remeasure:
            continue
        decoded = coverage.read_day(day, str(file.parent), kind)
        populated = {key for key, chart in decoded['lists'].items() if chart['times'] and any(chart['ranks'])}
        missing = sorted(required - populated)
        if missing:
            raise ValueError(f'Incomplete all-country archive {day}: {len(missing)} charts missing')
        measured = coverage.index_by_scope(decoded, lookup, games, weights, base['alpha'],
                                           inputs['censored'], tuple(inputs['stores']))
        rows = [{'game': name, 'five_market_share': float(measured['five_market'][i] / measured['total'][i]),
                 'index_total': float(measured['total'][i])}
                for i, name in enumerate(games) if measured['total'][i] > 0]
        days[day] = {'date': day, 'charts': measured['charts'], 'games_observed': len(rows), 'per_game': rows}
        sources[str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
        new_days += not existed
        recomputed_days += existed
    return {'metric': metric, 'base': BASE[metric], 'base_sha256': hashlib.sha256(base_bytes).hexdigest(),
            'as_of': as_of, 'new_days': new_days, 'recomputed_days': recomputed_days,
            'measurement_fingerprint': fingerprint, 'measurement_inputs': inputs,
            'days': [days[k] for k in sorted(days)],
            'latest_day': max(days) if days else None, 'new_source_hashes': sources,
            'unobserved_weighted_charts': sorted(unobserved),
            'usage': 'forward_coverage_diagnostic_not_historical_training_feature'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--as-of', default=datetime.now(timezone(timedelta(hours=9))).date().isoformat())
    parser.add_argument('--output', default='reports/rank-models/service-coverage.json')
    args = parser.parse_args()
    output = coverage.ROOT / args.output
    previous = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
    config = source_config()
    for relative in config['sha256']:
        if relative.endswith('.json.br'):
            verify_preserved(config, relative)
    reports = []
    for metric in BASE:
        result = refresh(metric, args.as_of, previous.get('metrics', {}).get(metric))
        added = result['new_days']
        recomputed = result['recomputed_days']
        for directory in config['global_directories']:
            result = refresh(metric, args.as_of, result, coverage.ROOT / directory)
            added += result['new_days']
            recomputed += result['recomputed_days']
        result['new_days'] = added
        result['recomputed_days'] = recomputed
        reports.append(result)
    result = {'schema_version': 1, 'production_enabled': False, 'as_of': args.as_of,
              'metrics': {row['metric']: row for row in reports}}
    write_atomic(output, result)
    print(json.dumps({'output': str(output), 'new_days': {r['metric']: r['new_days'] for r in reports}}))


if __name__ == '__main__':
    main()
