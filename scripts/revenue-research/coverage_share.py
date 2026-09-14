"""How much modelled index mass sits outside the five archived markets?

The August fit can only see CN, JP, KR, TW and US charts, while its labels are
worldwide. This measures, per game, the share of index mass those five markets
carry in an all-country snapshot, so the coverage gap is quantified instead of
being silently absorbed by a scale factor. Research only; no production change.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FIVE_MARKETS = ('CN', 'JP', 'KR', 'TW', 'US')
READER = r"""
const store = require('./scripts/lib/global-rankings');
const [dir, date, kind] = process.argv.slice(1);
const day = store.readDay(date, dir || undefined);
const rows = {};
for (const [key, list] of Object.entries(day.lists)) {
  if (!key.endsWith('_' + (kind || 'grossing'))) continue;
  rows[key] = { times: list.times, ranks: list.ranks.map((order) => order.map((index) => day.ids[index])) };
}
process.stdout.write(JSON.stringify({ date: day.date, lists: rows }));
"""


def read_day(date: str, directory: str = '', kind: str = 'grossing') -> dict:
    result = subprocess.run([  # the archive is brotli-compressed by the existing Node store
        'node', '-e', READER, '--', directory, date, kind], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def parse_days(arguments: list[str]) -> list[tuple[str, str]]:
    """`date` reads the default archive; `date=directory` reads an isolated session."""
    days = []
    for value in arguments:
        date, _, directory = value.partition('=')
        days.append((date, directory))
    return days


def identity_lookup() -> tuple[dict, list]:
    identities = json.loads((ROOT / 'docs/research/anchors/identities.json').read_text(encoding='utf-8'))
    games = sorted(identities['games'])
    lookup = {}
    for index, name in enumerate(games):
        entry = identities['games'][name]
        for storefront, ids in (('ios', entry['ios']), ('aos', entry['aos'])):
            for app in ids:
                lookup[f'{storefront}:{app}'] = index
    return lookup, games


DEFAULT_MARKET = 'data/rank-models/global-chart-2026-v0.3.json'
_MARKET_TABLE = {'path': DEFAULT_MARKET}


def use_market_table(path: str) -> None:
    """Point every weight consumer in this process at one market table."""
    _MARKET_TABLE['path'] = path


def market_weights(path: str | None = None) -> dict:
    market = json.loads((ROOT / (path or _MARKET_TABLE['path'])).read_text(encoding='utf-8'))
    weights = {}
    for row in market['countries']:
        code = row['country'].upper()
        weights[(code, 'ios')] = row['marketProxyUsd'] * row['storeShares']['ios']
        weights[(code, 'aos')] = row['marketProxyUsd'] * row['storeShares']['android']
    return weights


def index_by_scope(day: dict, lookup: dict, games: list, weights: dict, alpha: dict,
                   censored: float = 0.0, stores: tuple = ('ios', 'aos')) -> dict:
    """Five-market and worldwide index mass per game.

    `censored` credits a game that is absent from a snapshot at that snapshot's
    returned depth, the same bound the fit uses. Zero keeps the older
    observed-only measurement, so the two conventions can be compared.
    """
    totals = np.zeros(len(games))
    five = np.zeros(len(games))
    covered, skipped = [], []
    for key, list_rows in day['lists'].items():
        storefront, country, _ = key.split('_')
        if storefront not in stores:
            continue
        country = country.upper()
        weight = weights.get((country, storefront))
        if weight is None or weight <= 0:
            skipped.append(key)
            continue
        covered.append(key)
        snapshots = len(list_rows['times'])
        contribution = np.zeros(len(games))
        for order in list_rows['ranks']:
            best = {}
            for position, app in enumerate(order, start=1):
                index = lookup.get(f'{storefront}:{app}')
                if index is None:
                    continue
                best[index] = min(best.get(index, position), position)
            for index, rank in best.items():
                contribution[index] += rank ** -alpha[storefront]
            if censored:
                floor = censored * max(len(order), 1) ** -alpha[storefront]
                absent = np.ones(len(games))
                for index in best:
                    absent[index] = 0.0
                contribution += absent * floor
        contribution *= weight / snapshots
        totals += contribution
        if country in FIVE_MARKETS:
            five += contribution
    return {'total': totals, 'five_market': five, 'charts': len(covered), 'skipped_charts': skipped}


def main() -> None:
    arguments = [value for value in sys.argv[1:] if not value.startswith('--')]
    options = dict(value.split('=', 1) for value in sys.argv[1:] if value.startswith('--'))
    if '--market' in options:
        use_market_table(options['--market'])
    # Each argument is a date, optionally date=collector-output-directory for days that
    # live in an isolated research session instead of the default archive.
    days = parse_days(arguments or ['2026-09-08', '2026-09-09'])
    estimates = json.loads((ROOT / options.get('--estimates',
                                               'reports/rank-models/august-curve-estimates-2026-09-11.json'))
                           .read_text(encoding='utf-8'))
    chosen = min(estimates['variants'], key=lambda row: row['cv_rmse_log'])['params']
    alpha = {'ios': float(options.get('--alpha-ios', chosen['alpha_ios'])),
             'aos': float(options.get('--alpha-aos', chosen['alpha_aos']))}
    censored = float(options.get('--censored', 0.0))
    stores = tuple(options.get('--stores', 'ios,aos').split(','))
    kind = options.get('--kind', 'grossing')  # grossing for the revenue model, free for downloads
    lookup, games = identity_lookup()
    weights = market_weights()
    report = {'schema_version': 1, 'production_enabled': False,
              'alpha': alpha, 'alpha_source': 'selected August curve variant; sensitivity is reported below',
              'meaning': ('Share of modelled index mass contributed by the five archived markets in an '
                          'all-country snapshot. It is a coverage diagnostic, not a revenue estimate.'),
              'days': []}
    for date, directory in days:
        day = read_day(date, directory, kind)
        result = index_by_scope(day, lookup, games, weights, alpha, censored, stores)
        rows = []
        for index, name in enumerate(games):
            if result['total'][index] <= 0:
                continue
            rows.append({'game': name, 'five_market_share': float(result['five_market'][index] / result['total'][index]),
                         'index_total': float(result['total'][index])})
        rows.sort(key=lambda row: row['five_market_share'])
        shares = np.array([row['five_market_share'] for row in rows])
        report['days'].append({
            'date': date, 'charts': result['charts'], 'skipped_charts': len(result['skipped_charts']),
            'games_observed': len(rows),
            'median_five_market_share': float(np.median(shares)),
            'min_five_market_share': float(shares.min()), 'max_five_market_share': float(shares.max()),
            'per_game': rows})
    sensitivity = []
    for test_alpha in ({'ios': 0.7, 'aos': 0.7}, {'ios': 1.0, 'aos': 1.0}, {'ios': 1.25, 'aos': 0.5625}):
        day = read_day(days[-1][0], days[-1][1], kind)
        result = index_by_scope(day, lookup, games, weights, test_alpha, censored, stores)
        mask = result['total'] > 0
        sensitivity.append({'alpha': test_alpha,
                            'median_five_market_share': float(np.median(result['five_market'][mask] / result['total'][mask]))})
    report['alpha_sensitivity'] = sensitivity
    report['market_table'] = _MARKET_TABLE['path']
    report['chart_kind'] = kind
    report['censored_weight'] = censored
    report['stores'] = list(stores)
    report['censored_meaning'] = ('Absence credited at the snapshot returned depth, matching the fit. '
                                  'Zero measures observed ranks only.')
    report['day_sources'] = [{'date': date, 'collector_output': directory or 'snapshots/global'}
                             for date, directory in days]
    path = ROOT / options.get('--output', 'reports/rank-models/coverage-share-2026-09-11.json')
    path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(path.relative_to(ROOT)).replace('\\', '/'),
                      'days': [{'date': day['date'], 'games': day['games_observed'],
                                'median_five_market_share': round(day['median_five_market_share'], 3),
                                'min': round(day['min_five_market_share'], 3),
                                'max': round(day['max_five_market_share'], 3)} for day in report['days']],
                      'alpha_sensitivity': sensitivity}, indent=2))


if __name__ == '__main__':
    main()
