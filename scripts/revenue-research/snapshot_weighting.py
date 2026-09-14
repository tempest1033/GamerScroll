"""Does averaging snapshots over-weight whichever chart state was sampled most?

The App Store republishes in steps, so several snapshots inside one day can be
the same published state. Averaging every snapshot then weights a state by how
often it happened to be sampled rather than by how long it stood. This scores the
day twice - every snapshot, and one snapshot per distinct published state - and
reports the gap. Research only.
"""
from __future__ import annotations

import argparse
import json
import statistics

from coverage_share import ROOT, read_day
from score_day import load_model, score_day


def collapse_repeats(day: dict) -> tuple[dict, dict]:
    """Keep one snapshot per distinct published state of each chart."""
    lists, stats = {}, {'charts': 0, 'snapshots': 0, 'states': 0, 'per_chart': {}}
    for key, rows in day['lists'].items():
        times, ranks = rows['times'], rows['ranks']
        kept_times, kept_ranks = [], []
        for time, order in zip(times, ranks):
            if kept_ranks and kept_ranks[-1] == order:
                continue
            kept_times.append(time)
            kept_ranks.append(order)
        lists[key] = {**rows, 'times': kept_times, 'ranks': kept_ranks}
        stats['charts'] += 1
        stats['snapshots'] += len(times)
        stats['states'] += len(kept_times)
        stats['per_chart'][key] = {'snapshots': len(times), 'states': len(kept_times)}
    return {**day, 'lists': lists}, stats


def compare(full: dict, collapsed: dict) -> dict:
    shared = [game for game in full['family_totals'] if game in collapsed['family_totals']]
    moves = sorted(((abs(collapsed['family_totals'][game] / full['family_totals'][game] - 1) * 100, game)
                    for game in shared if full['family_totals'][game] > 0))
    ranked_full = [game for game, _ in sorted(full['family_totals'].items(), key=lambda row: -row[1])][:10]
    ranked_collapsed = [game for game, _ in sorted(collapsed['family_totals'].items(),
                                                   key=lambda row: -row[1])][:10]
    return {
        'games_compared': len(moves),
        'median_index_move_pct': statistics.median(value for value, _ in moves) if moves else None,
        'max_index_move_pct': moves[-1][0] if moves else None,
        'largest_mover': moves[-1][1] if moves else None,
        'top10_positions_unchanged': sum(1 for index, game in enumerate(ranked_full)
                                         if index < len(ranked_collapsed)
                                         and ranked_collapsed[index] == game),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', default='2026-09-11')
    parser.add_argument('--collector-output', default='')
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--output', default='reports/rank-models/snapshot-weighting-2026-09-11.json')
    arguments = parser.parse_args()
    model = load_model(ROOT / arguments.model)
    day = read_day(arguments.date, arguments.collector_output)
    collapsed_day, stats = collapse_repeats(day)
    full = score_day(day, model['params'])
    collapsed = score_day(collapsed_day, model['params'])
    duplicated = [{'chart': key, **value} for key, value in stats['per_chart'].items()
                  if value['snapshots'] > value['states']]
    payload = {
        'schema_version': 1,
        'production_enabled': False,
        'date': arguments.date,
        'question': ('Does averaging every snapshot bias a day towards the chart state that happened '
                     'to be sampled most often?'),
        'snapshots': stats['snapshots'],
        'distinct_states': stats['states'],
        'charts': stats['charts'],
        'charts_with_repeats': len(duplicated),
        'repeat_examples': sorted(duplicated, key=lambda row: row['states'])[:10],
        'comparison': compare(full, collapsed),
        'meaning': ('A large gap would mean the snapshot schedule, not the stores, is setting the '
                    'numbers. A small gap means repeated states are harmless and averaging every '
                    'snapshot stays the simpler rule.'),
    }
    (ROOT / arguments.output).write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: payload[key] for key in
                      ('snapshots', 'distinct_states', 'charts', 'charts_with_repeats', 'comparison')},
                     indent=2))


if __name__ == '__main__':
    main()
