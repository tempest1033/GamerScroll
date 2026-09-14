"""Print ledger rows for a period prefix, or the day-score bands. Research helper."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--prefix', default='2026-09')
    parser.add_argument('--bands', action='store_true', help='show day-score bands instead')
    parser.add_argument('--cadence', action='store_true', help='show cadence and round stability instead')
    arguments = parser.parse_args()
    if arguments.cadence:
        import collections
        import statistics
        refresh = json.loads((ROOT / 'reports/rank-models/refresh-rate-2026-09-11.json')
                             .read_text(encoding='utf-8'))
        grouped = collections.defaultdict(list)
        for key, pairs in refresh['per_chart'].items():
            for pair in pairs:
                grouped[(round(pair['minutes']), key.split('_')[0])].append(pair)
        print('comparisons', refresh['comparisons'])
        for key in sorted(grouped):
            pairs = grouped[key]
            identical = sum(1 for pair in pairs if pair['identical']) / len(pairs)
            top10 = sum(1 for pair in pairs if pair['top10_identical']) / len(pairs)
            moved = statistics.median(pair['positions_changed'] for pair in pairs)
            print(f'{key[0]:3d}min {key[1]:4} pairs={len(pairs):5d} identical={identical:6.1%} '
                  f'top10={top10:6.1%} median_moved={moved:5.0f}')
        for event in refresh.get('refresh_events', []):
            print(f"republish {event['store']} {event['from']}->{event['to']} "
                  f"{event['minutes']:.0f}min charts {event['charts_changed']}/{event['charts_in_window']} "
                  f"({event['share_changed']:.0%}) median moved {event['median_positions_changed']:.0f}")
        stability = json.loads((ROOT / 'reports/rank-models/round-stability-2026-09-11.json')
                               .read_text(encoding='utf-8'))
        rounds = stability['consecutive_rounds']
        print('round pairs', len(rounds),
              'min tau', round(min(row['kendall_tau_top'] for row in rounds), 4),
              'max median move pct', round(max(row['median_abs_index_change_pct'] for row in rounds), 3))
        return
    if arguments.bands:
        day = json.loads((ROOT / 'reports/rank-models/day-scores-final-2026-09-11.json')
                         .read_text(encoding='utf-8'))
        coverage = json.loads((ROOT / 'reports/rank-models/band-coverage-2026-09-11.json')
                              .read_text(encoding='utf-8'))
        print('held-out band:', json.dumps(day['held_out_error_band'], ensure_ascii=False))
        print('empirical error:', json.dumps(coverage['empirical_error_reserved'], ensure_ascii=False))
        for row in day['top'][:6]:
            label = row.get('label_dependence_band_usd_million')
            error = row.get('held_out_error_band_usd_million')
            print(f"{row['game'][:22]:22} {row['monthly_scale_reference_usd_million']:7.1f} | "
                  f"label {label[0]:6.1f}-{label[1]:6.1f} | held-out {error[0]:6.1f}-{error[1]:6.1f}")
        return
    for line in (ROOT / 'docs/research/anchors/anchors.jsonl').read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        period = row.get('period') or {}
        stamp = f"{period.get('start') or ''}{period.get('label') or ''}"
        if not stamp.startswith(arguments.prefix) and arguments.prefix not in stamp:
            continue
        print(f"{row['game'][:26]:26} | {row['geography']:2} | {','.join(row['stores']):22} | "
              f"{str(row.get('amount_usd_m')):>7} | {period.get('kind'):10} | "
              f"{period.get('start')}..{period.get('end')} | {row['metric'][:14]:14} | "
              f"{row['fee_basis']:11} | {row['source_id']:6} | {row['review_status']}")


if __name__ == '__main__':
    main()
