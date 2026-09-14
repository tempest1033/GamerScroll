"""Score the pre-archive months directly from our own five-market history.

The worldwide monthly labels for February and May to July 2026 were so far
reached only by carrying Japanese charts through a per-game ratio
(`jp_transfer_check`). `history/` holds our own five-market best-of-day ranks
for those months, so the same labels can be priced without that detour.

Three steps, each reported separately:

1. Overlap: on the days both sources cover, the ratio between the archive
   index (per-snapshot mean) and the history index (best of day), per game.
   This sizes the observation-type difference; it is not a correction factor.
2. Scale: the fitted curve is kept, but the worldwide scale is re-derived on
   the August labels from the history index itself, so a best-of-day index is
   priced by a best-of-day scale. The median implied scale is used and the
   per-game spread is kept beside it.
3. Months outside August: mean daily history index, coverage-corrected, times
   that scale, prorated by calendar length. Errors are reported next to the
   Japan-transfer prediction for the same label where one exists.

The coverage share still comes from September all-country days, which assumes
a stable geography mix, the same assumption the Japan transfer makes. Research
only; no production change.
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from coverage_share import ROOT
from history_panel import best_rank_payload, month_totals, score_best_ranks
from score_day import identity_families, load_model, score_day
from september_day_check import coverage_for, read_archive_day, resolve_family

LEDGER = ROOT / 'docs/research/anchors/anchors.jsonl'
FIT_MONTH = '2026-08'
FIT_MONTH_DAYS = 31


def worldwide_monthly_labels() -> list[dict]:
    """Fit-eligible worldwide monthly consumer-spend rows, every month."""
    rows = []
    for line in LEDGER.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        period = row.get('period') or {}
        if (row.get('fit', {}).get('usable') and row.get('metric') == 'consumer_spend'
                and period.get('kind') == 'month' and row.get('geography') == 'WW'
                and row.get('amount_usd_m')):
            rows.append(row)
    return rows


def family_for(row: dict, names: set[str]) -> str | None:
    for candidate in (row.get('game_key'), row.get('game')):
        if candidate and candidate in names:
            return candidate
    return resolve_family(row.get('store_ids'))


def quantiles(values: list[float]) -> dict:
    ordered = sorted(values)
    return {'n': len(ordered), 'median': statistics.median(ordered),
            'p10': ordered[int(0.1 * (len(ordered) - 1))],
            'p90': ordered[int(0.9 * (len(ordered) - 1))]}


def overlap_agreement(start: str, end: str, params: dict) -> dict:
    """Archive index over history index, per game, on days both sources cover."""
    from jp_transfer_check import days_between
    ratios: dict[str, list[float]] = {}
    days = []
    for day in days_between(start, end):
        payload = best_rank_payload(day)
        if payload is None:
            continue
        try:
            archive = score_day(read_archive_day(day), params)['family_totals']
        except FileNotFoundError:
            continue
        history = score_best_ranks(payload, params)['family_totals']
        days.append(day)
        for name, value in archive.items():
            other = history.get(name, 0.0)
            if value > 0 and other > 0:
                ratios.setdefault(name, []).append(value / other)
    per_game = {name: quantiles(values) for name, values in ratios.items()}
    medians = [row['median'] for row in per_game.values()]
    return {'days': days, 'per_game': per_game,
            'median_of_game_medians': statistics.median(medians) if medians else None}


def monthly_mean_index(month: str, params: dict) -> dict:
    totals = month_totals(month, params)
    observed = len(totals['days'])
    means = {name: value / observed for name, value in totals['family_totals'].items()} if observed else {}
    return {'month': month, 'observed_days': observed, 'calendar_days': totals['calendar_days'],
            'min_depth': totals['min_depth'], 'mean_daily': means}


def implied_scales(labels: list[dict], month: dict, coverage: dict, names: set[str]) -> list[dict]:
    """Label amount per unit of coverage-corrected mean daily index, per August label."""
    rows = []
    for row in labels:
        family = family_for(row, names)
        mean = month['mean_daily'].get(family or '', 0.0)
        if family is None or mean <= 0:
            rows.append({'game': row['game'], 'family': family, 'reason': 'absent from history index'})
            continue
        try:
            share = coverage_for(coverage, family)
        except KeyError:
            rows.append({'game': row['game'], 'family': family, 'reason': 'no measured coverage share'})
            continue
        rows.append({'game': row['game'], 'family': family, 'published_usd_m': row['amount_usd_m'],
                     'mean_daily_index': mean, 'coverage_share': share,
                     'implied_scale': row['amount_usd_m'] / (mean / share)})
    return rows


def price(mean_daily: float, share: float, scale: float, calendar_days: int) -> float:
    """Monthly USD million for a month of `calendar_days` from a 31-day scale."""
    return mean_daily / share * scale * calendar_days / FIT_MONTH_DAYS


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-3day-2026-09-11.json')
    parser.add_argument('--scale-class', default='S01|gross|WW|app_store+google_play')
    parser.add_argument('--overlap-start', default='2026-08-02')
    parser.add_argument('--overlap-end', default='2026-09-06')
    parser.add_argument('--min-days', type=int, default=20,
                        help='a month observed on fewer history days than this is not scored')
    parser.add_argument('--japan', default='reports/rank-models/jp-transfer-check-2026-09-12.json',
                        help='Japan-transfer report to place beside each label; blank to skip')
    parser.add_argument('--output', default='reports/rank-models/history-label-check-2026-09-12.json')
    arguments = parser.parse_args()

    model = load_model(ROOT / arguments.model)
    params = model['params']
    archive_scale = model['scales'][arguments.scale_class]
    coverage = json.loads((ROOT / arguments.coverage).read_text(encoding='utf-8'))
    _, family_names = identity_families()
    names = set(family_names)

    overlap = overlap_agreement(arguments.overlap_start, arguments.overlap_end, params)

    labels = worldwide_monthly_labels()
    by_month: dict[str, list[dict]] = {}
    for row in labels:
        by_month.setdefault(row['period']['start'][:7], []).append(row)
    months = {month: monthly_mean_index(month, params) for month in sorted(by_month)}

    august = implied_scales(by_month.get(FIT_MONTH, []), months[FIT_MONTH], coverage, names) \
        if FIT_MONTH in months else []
    usable = [row['implied_scale'] for row in august if 'implied_scale' in row]
    if not usable:
        raise SystemExit('No August label could be priced from the history index; no scale to derive')
    scale_best = statistics.median(usable)
    scale_rows = quantiles(usable)
    ratio_based = (archive_scale * overlap['median_of_game_medians']
                   if overlap['median_of_game_medians'] else None)

    scored, skipped, in_sample = [], [], []
    japan_rows = {}
    if arguments.japan and (ROOT / arguments.japan).exists():
        report = json.loads((ROOT / arguments.japan).read_text(encoding='utf-8'))
        japan_rows = {(row['game'], row['month']): row for row in report['rows']}
    for month, rows in sorted(by_month.items()):
        state = months[month]
        for row in rows:
            family = family_for(row, names)
            entry = {'game': row['game'], 'month': month, 'family': family,
                     'published_usd_m': row['amount_usd_m'], 'source_id': row['source_id']}
            if state['observed_days'] < arguments.min_days:
                skipped.append({**entry, 'reason': f'only {state["observed_days"]} identified history days'})
                continue
            mean = state['mean_daily'].get(family or '', 0.0)
            if family is None or mean <= 0:
                skipped.append({**entry, 'reason': 'absent from history index'})
                continue
            try:
                share = coverage_for(coverage, family)
            except KeyError:
                skipped.append({**entry, 'reason': 'no measured coverage share'})
                continue
            predicted = price(mean, share, scale_best, state['calendar_days'])
            result = {**entry, 'mean_daily_index': mean, 'coverage_share': share,
                      'observed_days': state['observed_days'], 'calendar_days': state['calendar_days'],
                      'predicted_usd_m': predicted,
                      'error_pct': (predicted / row['amount_usd_m'] - 1) * 100}
            japan = japan_rows.get((row['game'], month))
            if japan:
                result['japan_transfer_error_pct'] = japan['error_pct']
            (in_sample if month == FIT_MONTH else scored).append(result)

    errors = sorted(abs(row['error_pct']) for row in scored)
    paired = [row for row in scored if 'japan_transfer_error_pct' in row]
    report = {
        'schema_version': 1, 'production_enabled': False,
        'model': arguments.model, 'params': params, 'scale_class': arguments.scale_class,
        'history_observation': 'best rank of the day per app from history/*.json bestRanks',
        'overlap': {'start': arguments.overlap_start, 'end': arguments.overlap_end,
                    'days': len(overlap['days']),
                    'archive_over_history_median': overlap['median_of_game_medians'],
                    'per_game': overlap['per_game']},
        'scale': {'archive_scale': archive_scale, 'history_scale': scale_best,
                  'history_scale_spread': scale_rows,
                  'ratio_based_cross_check': ratio_based,
                  'derived_from': august,
                  'meaning': 'USD million per unit of coverage-corrected mean daily best-rank index '
                             'over a 31-day month; median of the August label implications, curve fixed'},
        'months': {month: {'observed_days': state['observed_days'], 'calendar_days': state['calendar_days'],
                           'min_depth': state['min_depth']} for month, state in months.items()},
        'labels_total': len(labels), 'labels_scored': len(scored), 'labels_skipped': len(skipped),
        'in_sample_august': in_sample,
        'median_abs_error_pct': statistics.median(errors) if errors else None,
        'worst_abs_error_pct': errors[-1] if errors else None,
        'within_25_pct': sum(1 for value in errors if value <= 25),
        'paired_with_japan': {
            'labels': len(paired),
            'history_median_abs_error_pct': statistics.median(abs(r['error_pct']) for r in paired) if paired else None,
            'japan_median_abs_error_pct': statistics.median(abs(r['japan_transfer_error_pct']) for r in paired) if paired else None,
        },
        'rows': sorted(scored, key=lambda row: (row['month'], -row['published_usd_m'])),
        'skipped': sorted(skipped, key=lambda row: (row['month'], row['game'])),
    }
    path = ROOT / arguments.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'overlap days={len(overlap["days"])} archive/history median={overlap["median_of_game_medians"]}')
    print(f'scale archive={archive_scale:.4g} history={scale_best:.4g} '
          f'(p10 {scale_rows["p10"]:.4g}, p90 {scale_rows["p90"]:.4g}, n={scale_rows["n"]}) '
          f'ratio-based={ratio_based}')
    for month, state in months.items():
        print(f'  {month}: {state["observed_days"]}/{state["calendar_days"]} days, '
              f'min depth {min(state["min_depth"].values()) if state["min_depth"] else None}')
    print(f'scored={len(scored)}/{len(labels) - len(in_sample)} median_err='
          f'{report["median_abs_error_pct"]}% worst={report["worst_abs_error_pct"]}% '
          f'within25={report["within_25_pct"]}')
    for row in report['rows']:
        japan = row.get('japan_transfer_error_pct')
        tail = f' | japan {japan:+7.1f}%' if japan is not None else ''
        print(f'  {row["month"]} {row["game"][:24]:<24} published={row["published_usd_m"]:7.1f}m '
              f'predicted={row["predicted_usd_m"]:7.1f}m {row["error_pct"]:+7.1f}%{tail}')
    for row in report['skipped']:
        print(f'  skip {row["month"]} {row["game"][:24]:<24} {row["reason"]}')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
