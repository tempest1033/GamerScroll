"""Prospective check: predict labelled September days with the August model.

Every number in the August fit came from one calendar month. This scores days
the model never saw, at a time scale it was never fitted on, against the only
exact-day payment labels in the ledger. It reports level error and day-to-day
responsiveness separately, because a rank-based index can track a game's level
while compressing its short-term swings. Research only.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

from coverage_share import ROOT, use_market_table
from score_day import identity_families, load_model, score_day

ARCHIVE = ROOT / 'snapshots/rankings'
HEADER = 'time,rank,id,title'


def read_archive_day(date: str, archive: Path = ARCHIVE) -> dict:
    """The five archived markets for one date, in the shape the scorer expects."""
    lists: dict[str, dict] = {}
    for file in sorted(archive.glob(f'{date}_*_grossing.csv')):
        _, store, country, _ = file.stem.split('_')
        snapshots: dict[str, list[tuple[int, str]]] = {}
        lines = file.read_text(encoding='utf-8').lstrip('\ufeff').splitlines()
        if lines[0] != HEADER:
            raise ValueError(f'Unexpected archive header: {file.name}')
        for line in lines[1:]:
            if not line:
                continue
            time, rank, app, _ = line.split(',', 3)
            snapshots.setdefault(time, []).append((int(rank), app))
        times, ranks = [], []
        for time in sorted(snapshots):
            rows = sorted(snapshots[time])
            if [rank for rank, _ in rows] != list(range(1, len(rows) + 1)):
                raise ValueError(f'Chart ranks are not contiguous: {file.name} {time}')
            times.append(time)
            ranks.append([app for _, app in rows])
        if times:
            lists[f'{store}_{country}_grossing'] = {'times': times, 'ranks': ranks}
    if not lists:
        raise FileNotFoundError(f'No archived five-market grossing charts for {date}')
    return {'date': date, 'lists': lists}


def coverage_for(report: dict, game: str) -> float:
    shares = [row['five_market_share'] for day in report['days']
              for row in day['per_game'] if row['game'] == game]
    if not shares:
        raise KeyError(f'No measured coverage share for {game}')
    return sum(shares) / len(shares)


def scale_for_scope(scales: dict, geography: str, stores: list[str], preferred_source: str) -> tuple[str, float]:
    """A country label must be priced with that country's class scale when one exists.

    Each class carries its own free scale, so the worldwide scale already absorbs
    worldwide-specific level effects. Using it for a Japan amount imports that
    offset; the Japan class scale is the like-for-like one.
    """
    wanted = '+'.join(sorted(stores))
    candidates = [name for name in scales
                  if name.split('|')[1] == 'gross' and name.split('|')[2] == geography
                  and name.split('|')[3] == wanted]
    if not candidates:
        return '', 0.0
    same_source = [name for name in candidates if name.split('|')[0] == preferred_source]
    chosen = (same_source or sorted(candidates))[0]
    return chosen, scales[chosen]


def resolve_family(store_ids: dict) -> str | None:
    """Ledger display names differ from identity keys; resolve through the store ids."""
    families, _ = identity_families()
    names = set()
    for storefront in ('ios', 'aos'):
        for app in (store_ids or {}).get(storefront, []) or []:
            name = families.get(f'{storefront}:{app}')
            if name:
                names.add(name)
    if len(names) > 1:
        raise ValueError(f'Store ids resolve to several game families: {sorted(names)}')
    return names.pop() if names else None


def daily_labels(ledger_path: Path, game: str) -> list[dict]:
    rows = []
    for line in ledger_path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        period = row['period']
        if (row['metric'] == 'consumer_spend' and period['kind'] == 'day' and row['game'] == game
                and row['geography'] == 'WW' and row['fee_basis'] == 'gross'
                and sorted(row['stores']) == ['app_store', 'google_play']):
            rows.append({'date': period['start'], 'amount_usd_million': row['amount_usd_m'],
                         'provider': row['provider'], 'anchor_id': row['id'],
                         'qualifier': row.get('qualifier'),
                         'family': resolve_family(row.get('store_ids')) or row['game']})
    return sorted(rows, key=lambda row: row['date'])


def daily_block(game: str, labels: list[dict], model: dict, coverage: dict,
                scale: float, fit_days: int) -> dict:
    """Exact-day labels for one game, priced with the model held fixed.

    A published bound ("almost $10.1m") is not a level: predicting under it is
    correct, so bounds are checked for satisfaction and kept out of the error
    average instead of being scored as if the source had stated a number.
    """
    family = labels[0]['family']
    share = coverage_for(coverage, family)
    rows, bounds = [], []
    for label in labels:
        scored = score_day(read_archive_day(label['date']), model['params'])
        five_market = scored['family_totals'].get(family)
        if five_market is None:
            raise SystemExit(f'{game} never appeared in the five archived markets on {label["date"]}')
        predicted = five_market / share * scale / fit_days
        entry = {'date': label['date'], 'observed_usd_million': label['amount_usd_million'],
                 'predicted_usd_million': predicted, 'provider': label['provider'],
                 'anchor_id': label['anchor_id'], 'five_market_index': five_market,
                 'abs_error_pct': abs(predicted / label['amount_usd_million'] - 1.0) * 100}
        if label['qualifier'] is None:
            rows.append(entry)
        else:
            satisfied = (predicted >= label['amount_usd_million'] if label['qualifier'] == 'more_than'
                         else predicted <= label['amount_usd_million'])
            bounds.append({**entry, 'qualifier': label['qualifier'], 'satisfied': satisfied})
    changes = []
    for earlier, later in zip(rows, rows[1:]):
        changes.append({
            'from': earlier['date'], 'to': later['date'],
            'observed_change_pct': (later['observed_usd_million'] / earlier['observed_usd_million'] - 1) * 100,
            'predicted_change_pct': (later['predicted_usd_million'] / earlier['predicted_usd_million'] - 1) * 100,
            'same_direction': ((later['observed_usd_million'] > earlier['observed_usd_million'])
                               == (later['predicted_usd_million'] > earlier['predicted_usd_million'])),
        })
    errors = sorted(row['abs_error_pct'] for row in rows)
    return {'game': game, 'family': family, 'coverage_share_used': share,
            'days': rows, 'bounds': bounds, 'day_to_day': changes,
            'median_abs_error_pct': errors[len(errors) // 2] if errors else None,
            'directions_matching': sum(1 for row in changes if row['same_direction']),
            'direction_comparisons': len(changes)}


def week_labels(ledger_path: Path, label: str) -> list[dict]:
    """Gross weekly rows whose window the publisher left implicit, worldwide or per country."""
    rows = []
    for line in ledger_path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        period = row['period']
        if (row['metric'] == 'consumer_spend' and period['kind'] in ('week', 'unresolved')
                and period.get('label') == label
                and row['fee_basis'] == 'gross'
                and sorted(row['stores']) == ['app_store', 'google_play']):
            rows.append({'game': row['game'], 'amount_usd_million': row['amount_usd_m'],
                         'geography': row['geography'], 'period_kind': period['kind'],
                         'provider': row['provider'], 'anchor_id': row['id'],
                         'family': resolve_family(row.get('store_ids')) or row['game']})
    return sorted(rows, key=lambda row: (row['game'], row['geography']))


def country_scope(day: dict, country: str) -> dict:
    """Only the charts of one country, for a label that is not worldwide."""
    suffix = country.lower()
    lists = {key: rows for key, rows in day['lists'].items() if key.split('_')[1] == suffix}
    if not lists:
        raise KeyError(f'No archived chart for {country} on {day["date"]}')
    return {'date': day['date'], 'lists': lists}


def window_dates(start: str, days: int) -> list[str]:
    first = date.fromisoformat(start)
    return [(first + timedelta(days=offset)).isoformat() for offset in range(days)]


def mean_index(dates: list[str], params: dict, game: str, country: str | None = None) -> float | None:
    values = []
    for day in dates:
        archived = read_archive_day(day)
        scored = score_day(country_scope(archived, country) if country else archived, params)
        value = scored['family_totals'].get(game)
        if value is None:
            return None
        values.append(value)
    return sum(values) / len(values)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', default='Pokemon GO')
    parser.add_argument('--extra-games', default='Delta Force',
                        help='comma separated games also scored against their exact-day labels')
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-3day-2026-09-11.json')
    parser.add_argument('--scale-class', default='S01|gross|WW|app_store+google_play')
    parser.add_argument('--fit-days', type=int, default=31, help='days in the calendar month the scale was fitted on')
    parser.add_argument('--week-label', default='first week of September 2026')
    parser.add_argument('--week-windows', default='2026-08-31,2026-09-01',
                        help='candidate first days for the implicit weekly window')
    parser.add_argument('--market', default='')
    parser.add_argument('--output', default='reports/rank-models/september-day-check-2026-09-11.json')
    args = parser.parse_args()
    if args.market:
        use_market_table(args.market)
    model = load_model(ROOT / args.model)
    coverage = json.loads((ROOT / args.coverage).read_text(encoding='utf-8'))
    scale = model['scales'][args.scale_class]
    ledger_path = ROOT / 'docs/research/anchors/anchors.jsonl'
    # One game was never enough to tell a model problem from a game-specific event.
    # Every named game is scored the same way; the first one keeps the original keys
    # so existing readers of this report are unaffected.
    extra = [name.strip() for name in args.extra_games.split(',') if name.strip()]
    per_game = []
    for name in [args.game, *extra]:
        game_labels = daily_labels(ledger_path, name)
        if not game_labels:
            if name == args.game:
                raise SystemExit(f'No exact-day worldwide gross labels for {name}')
            per_game.append({'game': name, 'skipped': 'no exact-day worldwide gross labels'})
            continue
        per_game.append(daily_block(name, game_labels, model, coverage, scale, args.fit_days))
    primary = per_game[0]
    family, share = primary['family'], primary['coverage_share_used']
    rows, changes = primary['days'], primary['day_to_day']
    weekly = []
    for label in week_labels(ROOT / 'docs/research/anchors/anchors.jsonl', args.week_label):
        worldwide = label['geography'] == 'WW'
        share_for_game = 1.0
        scope_class, scope_scale = scale_for_scope(model['scales'], label['geography'],
                                                   ['app_store', 'google_play'],
                                                   args.scale_class.split('|')[0])
        if worldwide:
            try:
                share_for_game = coverage_for(coverage, label['family'])
            except KeyError:
                weekly.append({'game': label['game'], 'family': label['family'],
                               'skipped': 'no measured coverage share'})
                continue
        windows = []
        for start in args.week_windows.split(','):
            dates = window_dates(start, 7)
            index = mean_index(dates, model['params'], label['family'],
                               None if worldwide else label['geography'])
            if index is None:
                windows.append({'start': start, 'skipped': 'absent from the five archived markets'})
                continue
            predicted = index / share_for_game * scale / args.fit_days * 7
            row = {'start': start, 'end': dates[-1], 'predicted_usd_million': predicted,
                   'abs_error_pct': abs(predicted / label['amount_usd_million'] - 1.0) * 100}
            if scope_scale and scope_class != args.scale_class:
                scoped = index / share_for_game * scope_scale / args.fit_days * 7
                row['scope_matched_class'] = scope_class
                row['scope_matched_predicted_usd_million'] = scoped
                row['scope_matched_abs_error_pct'] = abs(scoped / label['amount_usd_million'] - 1.0) * 100
            windows.append(row)
        weekly.append({'game': label['game'], 'family': label['family'],
                       'geography': label['geography'],
                       'scope_note': ('Worldwide rows are divided by the measured five-market coverage share; '
                                      'country rows use that country charts only, with no coverage correction, '
                                      'so they test the estimated country weights directly.'),
                       'observed_usd_million': label['amount_usd_million'],
                       'provider': label['provider'], 'coverage_share_used': share_for_game,
                       'windows': windows})
    report = {
        'schema_version': 1, 'production_enabled': False, 'game': args.game,
        'model_variant': model['variant'], 'params': model['params'],
        'scale_class': args.scale_class, 'coverage_share_used': share,
        'days': rows, 'day_to_day': changes, 'daily_by_game': per_game,
        'weekly': {'label': args.week_label, 'games': weekly,
                   'window_note': ('The publisher did not state the week boundaries, so both plausible '
                                   'seven-day windows are scored and neither is presented as the answer.')},
        'median_abs_error_pct': sorted(row['abs_error_pct'] for row in rows)[len(rows) // 2],
        'limits': [
            'Two games and a handful of days; this is a direction check, not an accuracy measurement.',
            'Published bounds are checked for satisfaction only and are excluded from the error medians.',
            'The day labels and the class scale come from the same provider but different publications, '
            'so any level difference between those publications is included in the error.',
            'The monthly scale is divided by the fitted month length, which assumes a day is a constant '
            'share of its month.',
            'The coverage share is measured on later all-country days, not on the labelled days.',
            'Weekly rows carry no published window, so their error spans both candidate windows.',
        ],
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'coverage_share_used': round(share, 3),
                      'days': [{key: (round(value, 3) if isinstance(value, float) else value)
                                for key, value in row.items() if key != 'anchor_id'} for row in rows],
                      'day_to_day': [{key: (round(value, 1) if isinstance(value, float) else value)
                                      for key, value in row.items()} for row in changes],
                      'weekly': weekly}, indent=2, default=str))


if __name__ == '__main__':
    main()
