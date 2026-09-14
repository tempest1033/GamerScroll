"""Reach the pre-archive months through Japan, and say how far that reaches.

Forty-four fit-eligible worldwide monthly rows sit in February and May to July
2026, months our five-market archive does not cover. The Japanese daily charts
recovered from the public archive do cover them, so the missing step is one
ratio per game: how much five-market index a unit of Japanese index stands for.

That ratio is measured on the days both sources cover, then applied to the
earlier months. It only holds for a game whose geography mix is stable, so the
spread of the daily ratio is reported beside every prediction, and a game the
Japanese chart barely sees is refused rather than extrapolated. Research only.
"""
from __future__ import annotations

import argparse
import json
import statistics
from datetime import date, timedelta
from pathlib import Path

from game_i_index_check import android_translation, harvested_payload
from score_day import load_model, score_day
from september_day_check import coverage_for, read_archive_day

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / 'docs/research/anchors/anchors.jsonl'


def days_between(start: str, end: str) -> list[str]:
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    return [(first + timedelta(days=offset)).isoformat()
            for offset in range((last - first).days + 1)]


def japanese_index(day: str, params: dict, translation: dict) -> dict[str, float] | None:
    payload = harvested_payload(day, translation)
    if payload is None:
        return None
    return score_day(payload, params)['family_totals']


def calibrate(start: str, end: str, params: dict) -> dict[str, dict]:
    """Five-market index per unit of Japanese index, per game, over the overlap."""
    translation = android_translation()
    samples: dict[str, list[float]] = {}
    days_used = []
    for day in days_between(start, end):
        japan = japanese_index(day, params, translation)
        if japan is None:
            continue
        try:
            five = score_day(read_archive_day(day), params)['family_totals']
        except FileNotFoundError:
            continue
        days_used.append(day)
        for name, value in five.items():
            japanese = japan.get(name, 0.0)
            if japanese > 0 and value > 0:
                samples.setdefault(name, []).append(value / japanese)
    ratios = {}
    for name, values in samples.items():
        ordered = sorted(values)
        low = ordered[int(0.1 * (len(ordered) - 1))]
        high = ordered[int(0.9 * (len(ordered) - 1))]
        ratios[name] = {'ratio': statistics.median(values), 'days': len(values),
                        'p10': low, 'p90': high,
                        'spread_ratio': high / low if low > 0 else None}
    return {'days': days_used, 'per_game': ratios}


def refusal(ratio: dict | None, min_days: int, max_spread: float) -> str | None:
    """Why this game cannot be carried from Japan, or None when it can.

    A ratio measured on a handful of days, or one that already moves by a factor
    of two inside the overlap window, describes a geography mix that is not
    stable enough to carry months backwards.
    """
    if ratio is None:
        return 'never seen in the Japanese charts of the overlap'
    if ratio['days'] < min_days:
        return f'only {ratio["days"]} Japanese days in the overlap'
    spread = ratio.get('spread_ratio')
    if spread and spread > max_spread:
        return f'ratio spans {spread:.1f}x across the overlap'
    return None


def monthly_labels() -> list[dict]:
    """Fit-eligible worldwide monthly rows outside the fitted month."""
    rows = []
    for line in LEDGER.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        period = row.get('period') or {}
        if (row.get('fit', {}).get('usable') and row.get('metric') == 'consumer_spend'
                and period.get('kind') == 'month' and row.get('geography') == 'WW'
                and not period['start'].startswith('2026-08') and row.get('amount_usd_m')):
            rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--calibration-start', default='2026-08-02')
    parser.add_argument('--calibration-end', default='2026-09-09')
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-3day-2026-09-11.json')
    parser.add_argument('--scale-class', default='S01|gross|WW|app_store+google_play')
    parser.add_argument('--fit-days', type=int, default=31)
    parser.add_argument('--max-spread', type=float, default=2.0,
                        help='refuse a game whose daily ratio spans more than this p90/p10 factor')
    parser.add_argument('--min-days', type=int, default=20,
                        help='refuse a game the Japanese chart shows on fewer days than this')
    parser.add_argument('--output', default='reports/rank-models/jp-transfer-check-2026-09-12.json')
    arguments = parser.parse_args()

    model = load_model(ROOT / arguments.model)
    params = model['params']
    scale = model['scales'][arguments.scale_class]
    coverage = json.loads((ROOT / arguments.coverage).read_text(encoding='utf-8'))

    calibration = calibrate(arguments.calibration_start, arguments.calibration_end, params)
    translation = android_translation()

    months: dict[str, dict[str, float]] = {}
    rows = monthly_labels()
    wanted = sorted({row['period']['start'][:7] for row in rows})
    month_days: dict[str, int] = {}
    for month in wanted:
        first = date.fromisoformat(month + '-01')
        last = (first.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        totals: dict[str, float] = {}
        counted = 0
        for day in days_between(first.isoformat(), last.isoformat()):
            japan = japanese_index(day, params, translation)
            if japan is None:
                continue
            counted += 1
            for name, value in japan.items():
                totals[name] = totals.get(name, 0.0) + value
        months[month] = totals
        month_days[month] = counted

    scored, skipped = [], []
    for row in rows:
        month = row['period']['start'][:7]
        family = None
        for candidate in (row.get('game_key'), row.get('game')):
            if candidate and candidate in calibration['per_game']:
                family = candidate
                break
        if family is None:
            from september_day_check import resolve_family
            family = resolve_family(row.get('store_ids'))
        entry = {'game': row['game'], 'month': month, 'family': family,
                 'published_usd_m': row['amount_usd_m'], 'source_id': row['source_id']}
        ratio = calibration['per_game'].get(family or '')
        reason = refusal(ratio, arguments.min_days, arguments.max_spread)
        if reason:
            skipped.append({**entry, 'reason': reason})
            continue
        japanese_total = months[month].get(family, 0.0)
        if japanese_total <= 0:
            skipped.append({**entry, 'reason': 'absent from the Japanese charts that month'})
            continue
        try:
            share = coverage_for(coverage, family)
        except KeyError:
            skipped.append({**entry, 'reason': 'no measured five-market coverage share'})
            continue
        predicted = japanese_total * ratio['ratio'] / share * scale / arguments.fit_days
        scored.append({**entry, 'japanese_index': japanese_total,
                       'five_market_ratio': ratio['ratio'],
                       'ratio_spread': ratio['spread_ratio'],
                       'coverage_share': share,
                       'days_in_month': month_days[month],
                       'predicted_usd_m': predicted,
                       'error_pct': (predicted / row['amount_usd_m'] - 1) * 100})

    errors = sorted(abs(row['error_pct']) for row in scored)
    report = {
        'calibration': {'start': arguments.calibration_start, 'end': arguments.calibration_end,
                        'days': len(calibration['days'])},
        'model': arguments.model, 'scale_class': arguments.scale_class,
        'labels_total': len(rows), 'labels_scored': len(scored), 'labels_skipped': len(skipped),
        'median_abs_error_pct': statistics.median(errors) if errors else None,
        'worst_abs_error_pct': errors[-1] if errors else None,
        'within_25_pct': sum(1 for value in errors if value <= 25),
        'month_days_harvested': month_days,
        'rows': sorted(scored, key=lambda row: (row['month'], -row['published_usd_m'])),
        'skipped': sorted(skipped, key=lambda row: (row['month'], row['game'])),
    }
    path = ROOT / arguments.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'scored={len(scored)}/{len(rows)} median_err='
          f'{report["median_abs_error_pct"]}% worst={report["worst_abs_error_pct"]}%')
    for row in report['rows']:
        print(f'  {row["month"]} {row["game"][:24]:<24} published={row["published_usd_m"]:7.1f}m '
              f'predicted={row["predicted_usd_m"]:7.1f}m {row["error_pct"]:+7.1f}%')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
