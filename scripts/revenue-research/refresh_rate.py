"""How often does a store chart actually change?

Sampling faster than the store refreshes buys storage, not information. This
compares consecutive snapshots of each chart inside one collected day and
reports how often the returned order was byte-for-byte the same, per store and
per country. Research only; it reads collected snapshots and writes a report.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict

import numpy as np

from coverage_share import ROOT, read_day


def minutes_between(first: str, second: str) -> float:
    def parse(value: str) -> int:
        hours, minutes = value.split(':')
        return int(hours) * 60 + int(minutes)
    delta = parse(second) - parse(first)
    return float(delta + 24 * 60 if delta < 0 else delta)


def chart_changes(rows: dict, depth: int) -> list[dict]:
    """Consecutive snapshot comparisons for one chart."""
    pairs = []
    times, ranks = rows['times'], rows['ranks']
    for index in range(1, len(times)):
        before, after = ranks[index - 1][:depth], ranks[index][:depth]
        moved = sum(1 for left, right in zip(before, after) if left != right)
        pairs.append({'from': times[index - 1], 'to': times[index],
                      'minutes': minutes_between(times[index - 1], times[index]),
                      'identical': before == after,
                      'positions_changed': moved,
                      'top10_identical': before[:10] == after[:10]})
    return pairs


def summarise(per_chart: dict) -> dict:
    groups = defaultdict(list)
    for key, pairs in per_chart.items():
        store, country, _ = key.split('_')
        for pair in pairs:
            groups[(store, country.upper())].append(pair)
    rows = []
    for (store, country), pairs in sorted(groups.items()):
        identical = [pair for pair in pairs if pair['identical']]
        rows.append({'store': store, 'country': country, 'comparisons': len(pairs),
                     'identical_share': len(identical) / len(pairs) if pairs else None,
                     'top10_identical_share': sum(pair['top10_identical'] for pair in pairs) / len(pairs)
                     if pairs else None,
                     'median_positions_changed': float(np.median([pair['positions_changed']
                                                                  for pair in pairs])) if pairs else None})
    return rows


def refresh_events(per_chart: dict, threshold: float = 0.5) -> list[dict]:
    """Windows where a store republished its charts wholesale.

    The App Store holds an order byte for byte and then replaces most of it at
    once, so the interesting question is not "how much did it drift" but "when
    did it republish, and in how many countries at the same time".
    """
    windows: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for key, pairs in per_chart.items():
        store, country, _ = key.split('_')
        for pair in pairs:
            windows[(store, pair['from'], pair['to'])].append(
                {'country': country.upper(), **pair})
    events = []
    for (store, start, end), entries in sorted(windows.items()):
        changed = [entry for entry in entries if not entry['identical']]
        share = len(changed) / len(entries)
        if share < threshold:
            continue
        events.append({
            'store': store, 'from': start, 'to': end,
            'minutes': entries[0]['minutes'],
            'charts_in_window': len(entries),
            'charts_changed': len(changed),
            'share_changed': share,
            'median_positions_changed': float(np.median([entry['positions_changed']
                                                         for entry in changed])),
            'countries_changed': sorted(entry['country'] for entry in changed)[:20],
        })
    return events


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True)
    parser.add_argument('--collector-output', default='')
    parser.add_argument('--depth', type=int, default=200)
    parser.add_argument('--output', default='reports/rank-models/refresh-rate-2026-09-11.json')
    args = parser.parse_args()
    day = read_day(args.date, args.collector_output)
    per_chart = {}
    for key, rows in day['lists'].items():
        if not key.endswith('_grossing') or len(rows['times']) < 2:
            continue
        per_chart[key] = chart_changes(rows, args.depth)
    if not per_chart:
        raise SystemExit('Need at least two snapshots of a grossing chart to compare')
    by_store = summarise(per_chart)
    all_pairs = [pair for pairs in per_chart.values() for pair in pairs]
    intervals = sorted({pair['minutes'] for pair in all_pairs})
    report = {
        'schema_version': 1, 'production_enabled': False, 'date': args.date,
        'charts': len(per_chart), 'comparisons': len(all_pairs),
        'sampling_intervals_minutes': intervals,
        'identical_share': sum(pair['identical'] for pair in all_pairs) / len(all_pairs),
        'top10_identical_share': sum(pair['top10_identical'] for pair in all_pairs) / len(all_pairs),
        'median_positions_changed': float(np.median([pair['positions_changed'] for pair in all_pairs])),
        'by_store_country': by_store,
        'refresh_events': refresh_events(per_chart),
        'refresh_event_meaning': ('A window where more than half of a store\'s charts changed at once. '
                                  'For the App Store these are its republish moments; Google Play has no '
                                  'such moments because its tail moves continuously.'),
        'meaning': ('An identical comparison means the store returned the same order at both times. '
                    'It bounds how much a faster schedule can add, and says nothing about how often '
                    'the store recomputes its ranking internally.'),
        'limits': ['One day and one collector; other days or hours may move differently.',
                   'Identical order can still hide revenue movement inside a rank.'],
        'per_chart': per_chart,
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items()
                      if key not in ('per_chart', 'by_store_country', 'meaning', 'limits')}, indent=2))
    print(json.dumps({'by_store_country': [{key: (round(value, 3) if isinstance(value, float) else value)
                                            for key, value in row.items()} for row in by_store[:12]]},
                     indent=2))


if __name__ == '__main__':
    main()
