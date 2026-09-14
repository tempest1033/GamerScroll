"""Price the archived Japanese rank site in model terms, not rank terms.

Rank agreement alone does not say whether a source can replace our own charts:
the index weights the top of a chart steeply, so a two-place difference near the
top moves a game's index far more than the same difference at rank 150. This
scores the same Japanese days twice with the same frozen model — once from our
archive, once from the site's derived games chart — and reports the ratio
between the two indices per game.

The site keys its Google Play rows by the iOS app id, so Android rows are
translated through the identity table rather than by title text. Research only.
"""
from __future__ import annotations

import argparse
import json
import statistics
from datetime import date, timedelta
from pathlib import Path

from game_i_agreement import harvested_day
from score_day import identity_families, load_model, score_day
from september_day_check import read_archive_day

ROOT = Path(__file__).resolve().parents[2]
IDENTITIES = ROOT / 'docs/research/anchors/identities.json'
ALIASES = ROOT / 'docs/research/anchors/game-i-jp-aliases.json'


def japanese_aliases() -> dict[str, dict]:
    """Japanese store ids for games whose ledger row names another regional app."""
    if not ALIASES.exists():
        return {}
    return json.loads(ALIASES.read_text(encoding='utf-8'))['games']


def android_translation() -> dict[str, str]:
    """iOS app id -> our Google Play package id, for games we already identify.

    The site publishes one internal id per game and reuses the iOS id on its
    Android pages, so this table is what lets an Android row enter the scorer
    under the same identity our archive uses.
    """
    identities = json.loads(IDENTITIES.read_text(encoding='utf-8'))
    table = {}
    for entry in identities['games'].values():
        packages = entry.get('aos') or []
        if not packages:
            continue
        for app in entry.get('ios') or []:
            table[str(app)] = packages[0]
    # Ledger rows carry resolved store ids for games the identity table does not
    # list, such as Japan-only titles that never entered the August panel.
    ledger = ROOT / 'docs/research/anchors/anchors.jsonl'
    for line in ledger.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        store_ids = json.loads(line).get('store_ids') or {}
        packages = store_ids.get('aos') or []
        if not packages:
            continue
        for app in store_ids.get('ios') or []:
            table.setdefault(str(app), packages[0])
    for entry in japanese_aliases().values():
        packages = entry.get('aos') or []
        for app in entry.get('ios') or []:
            if packages:
                table[str(app)] = packages[0]
    return table


def harvested_payload(day: str, translation: dict[str, str]) -> dict | None:
    """One day from the site in the shape the scorer expects."""
    lists = {}
    for store in ('ios', 'aos'):
        rows = harvested_day(day, store)
        if not rows:
            return None
        if store == 'aos':
            order = [translation.get(app, f'gamei-{app}') for app, _ in rows]
        else:
            order = [app for app, _ in rows]
        lists[f'{store}_jp_grossing'] = {'times': ['00:00'], 'ranks': [order]}
    return {'date': day, 'lists': lists}


def japan_only(day: dict) -> dict:
    """Our archive day reduced to the two Japanese charts."""
    lists = {key: rows for key, rows in day['lists'].items() if key.split('_')[1] == 'jp'}
    return {'date': day['date'], 'lists': lists}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    parser.add_argument('--model', default='reports/rank-models/august-curve-estimates-2026-09-11.json')
    parser.add_argument('--top', type=int, default=20)
    parser.add_argument('--output', default='reports/rank-models/game-i-index-check.json')
    arguments = parser.parse_args()

    model = load_model(ROOT / arguments.model)
    params = model['params']
    translation = android_translation()

    first, last = date.fromisoformat(arguments.start), date.fromisoformat(arguments.end)
    days = [(first + timedelta(days=offset)).isoformat()
            for offset in range((last - first).days + 1)]

    per_game: dict[str, list[float]] = {}
    totals: dict[str, list[float]] = {}
    rows = []
    for day in days:
        try:
            ours = japan_only(read_archive_day(day))
        except FileNotFoundError:
            continue
        theirs = harvested_payload(day, translation)
        if theirs is None or not ours['lists']:
            continue
        ours_scored = score_day(ours, params)['family_totals']
        theirs_scored = score_day(theirs, params)['family_totals']
        ranked = sorted(ours_scored, key=lambda name: -ours_scored[name])[:arguments.top]
        ratios = []
        for name in ranked:
            ours_value = ours_scored.get(name, 0.0)
            theirs_value = theirs_scored.get(name, 0.0)
            if ours_value <= 0 or theirs_value <= 0:
                continue
            ratio = theirs_value / ours_value
            ratios.append(ratio)
            per_game.setdefault(name, []).append(ratio)
            summed = totals.setdefault(name, [0.0, 0.0])
            summed[0] += ours_value
            summed[1] += theirs_value
        if ratios:
            rows.append({'day': day, 'games': len(ratios),
                         'median_ratio': statistics.median(ratios),
                         'worst_ratio': max(ratios, key=lambda value: abs(value - 1))})

    all_ratios = [ratio for values in per_game.values() for ratio in values]
    games = sorted(per_game, key=lambda name: -len(per_game[name]))
    # Monthly and annual labels are priced from a summed index, so the error that
    # matters is the one left after a period is added up, not the daily spread.
    period = {name: values[1] / values[0] for name, values in totals.items() if values[0] > 0}
    period_deviation = sorted(abs(ratio - 1) * 100 for ratio in period.values())
    report = {
        'model': arguments.model,
        'days': len(rows),
        'observations': len(all_ratios),
        'median_ratio': statistics.median(all_ratios) if all_ratios else None,
        'median_absolute_deviation_pct': (
            statistics.median(abs(ratio - 1) * 100 for ratio in all_ratios) if all_ratios else None),
        'p90_absolute_deviation_pct': (
            sorted(abs(ratio - 1) * 100 for ratio in all_ratios)[int(0.9 * (len(all_ratios) - 1))]
            if all_ratios else None),
        'period_sum_ratio_median': statistics.median(period.values()) if period else None,
        'period_sum_median_deviation_pct': (
            statistics.median(period_deviation) if period_deviation else None),
        'period_sum_worst_deviation_pct': period_deviation[-1] if period_deviation else None,
        'period_sum_ratio_per_game': period,
        'per_game': {name: {'days': len(per_game[name]),
                            'median_ratio': statistics.median(per_game[name]),
                            'worst_ratio': max(per_game[name], key=lambda value: abs(value - 1))}
                     for name in games},
        'rows': rows,
    }
    path = ROOT / arguments.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'days={report["days"]} observations={report["observations"]} '
          f'median_ratio={report["median_ratio"]} '
          f'median_dev={report["median_absolute_deviation_pct"]}% '
          f'p90_dev={report["p90_absolute_deviation_pct"]}%')
    print(f'period-sum: median_ratio={report["period_sum_ratio_median"]} '
          f'median_dev={report["period_sum_median_deviation_pct"]}% '
          f'worst_dev={report["period_sum_worst_deviation_pct"]}%')
    for name in games[:10]:
        entry = report['per_game'][name]
        print(f'  {name}: median={entry["median_ratio"]:.3f} worst={entry["worst_ratio"]:.3f} '
              f'days={entry["days"]}')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
