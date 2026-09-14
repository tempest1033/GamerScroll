"""How much does one collection round change the scored picture?

Each collected round is scored on its own and compared with the neighbouring
round and with the whole day. This separates model instability from genuine
short-term chart movement: if two rounds 25 minutes apart already disagree, no
monthly claim can be read off a single round. Research only.
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from coverage_share import ROOT, read_day, use_market_table
from score_day import load_model, score_day


def split_by_time(day: dict, time: str) -> dict:
    """One round of the day, keeping only charts that actually returned then."""
    lists = {}
    for key, rows in day['lists'].items():
        keep = [index for index, value in enumerate(rows['times']) if value == time]
        if not keep:
            continue
        lists[key] = {'times': [rows['times'][index] for index in keep],
                      'ranks': [rows['ranks'][index] for index in keep]}
    return {'date': day['date'], 'lists': lists}


def kendall_tau(first: list[str], second: list[str]) -> float:
    """Rank agreement over the games both orderings contain."""
    shared = [name for name in first if name in set(second)]
    position = {name: index for index, name in enumerate(second)}
    concordant = discordant = 0
    for left in range(len(shared)):
        for right in range(left + 1, len(shared)):
            delta = position[shared[right]] - position[shared[left]]
            if delta > 0:
                concordant += 1
            elif delta < 0:
                discordant += 1
    total = concordant + discordant
    return (concordant - discordant) / total if total else 1.0


def ordering(scored: dict, top: int) -> list[str]:
    return [name for name, _ in sorted(scored['family_totals'].items(), key=lambda row: -row[1])][:top]


def compare(rounds: list[dict], top: int) -> dict:
    consecutive = []
    for earlier, later in zip(rounds, rounds[1:]):
        shared = set(earlier['order']) & set(later['order'])
        moves = [abs(later['totals'][name] / earlier['totals'][name] - 1.0) * 100 for name in shared
                 if earlier['totals'][name] > 0]
        consecutive.append({
            'from': earlier['time'], 'to': later['time'],
            'kendall_tau_top': kendall_tau(earlier['order'], later['order']),
            'top_membership_kept': len(shared) / max(len(earlier['order']), 1),
            'median_abs_index_change_pct': float(np.median(moves)) if moves else None,
            'max_abs_index_change_pct': float(np.max(moves)) if moves else None,
            'top10_changed': [name for name in earlier['order'][:10] if name not in later['order'][:10]],
        })
    return {'consecutive_rounds': consecutive}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True)
    parser.add_argument('--collector-output', default='')
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--market', default='')
    parser.add_argument('--top', type=int, default=50)
    parser.add_argument('--output', default='reports/rank-models/round-stability-2026-09-11.json')
    args = parser.parse_args()
    if args.market:
        use_market_table(args.market)
    model = load_model(ROOT / args.model)
    day = read_day(args.date, args.collector_output)
    times = sorted({value for rows in day['lists'].values() for value in rows['times']})
    rounds = []
    for time in times:
        part = split_by_time(day, time)
        scored = score_day(part, model['params'])
        rounds.append({'time': time, 'charts': scored['charts'],
                       'order': ordering(scored, args.top), 'totals': scored['family_totals']})
    whole = score_day(day, model['params'])
    whole_order = ordering(whole, args.top)
    report = {
        'schema_version': 1, 'production_enabled': False, 'date': args.date,
        'model_variant': model['variant'], 'top': args.top,
        'rounds': [{'time': row['time'], 'charts': row['charts'],
                    'kendall_tau_vs_whole_day': kendall_tau(row['order'], whole_order),
                    'identified_games': len(row['totals'])} for row in rounds],
        'meaning': ('Disagreement between rounds is real chart movement plus scoring sensitivity; '
                    'it bounds how much a single round can be trusted, and does not measure amount accuracy.'),
    }
    report.update(compare(rounds, args.top))
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'rounds': report['rounds'],
                      'consecutive': [{key: (round(value, 4) if isinstance(value, float) else value)
                                       for key, value in row.items() if key != 'top10_changed'}
                                      for row in report['consecutive_rounds']]}, indent=2))


if __name__ == '__main__':
    main()
