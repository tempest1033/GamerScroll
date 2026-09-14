"""Is the shallower Android exponent a real difference, or the chart depth?

Fitting the curve on a year of Japanese data prefers a flatter Android exponent
than the August fit. The two samples do not share a chart depth: our archive
carries about 200 games per Android chart, the public site's page yields about
140. Absence is priced at the depth a chart returned, so a shallower chart can
imitate a flatter exponent without the underlying relationship changing at all.

This separates the two. Our own Android charts are scored twice on the same
days — at full depth, and truncated to the depth the site returns — and the
exponent that makes the truncated chart reproduce the full-depth ranking of
games is reported. If that exponent is the one the Japanese year preferred, the
difference was the depth. Research only.
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

import numpy as np

from game_i_agreement import archive_day, harvested_day
from game_i_period_check import kendall_tau
from score_day import load_model

ROOT = Path(__file__).resolve().parents[2]


def day_index(order: list[str], depth: int, alpha: float, censored: float,
              tracked: list[str]) -> np.ndarray:
    """Index contribution of each tracked app on one chart."""
    position = {app: rank for rank, app in enumerate(order, start=1)}
    floor = censored * depth ** -alpha
    return np.array([position[app] ** -alpha if app in position else floor
                     for app in tracked], dtype=np.float64)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', default='2026-08-02')
    parser.add_argument('--end', default='2026-09-09')
    parser.add_argument('--model', default='reports/rank-models/august-curve-final-2026-09-11.json')
    parser.add_argument('--grid', default='0.20:0.80:0.05')
    parser.add_argument('--top', type=int, default=60,
                        help='games tracked from the top of our own chart')
    parser.add_argument('--output', default='reports/rank-models/game-i-depth-confound.json')
    arguments = parser.parse_args()

    params = load_model(ROOT / arguments.model)['params']
    censored, reference_alpha = params['censored'], params['alpha_aos']

    from datetime import date, timedelta
    first, last = date.fromisoformat(arguments.start), date.fromisoformat(arguments.end)
    days = [(first + timedelta(days=offset)).isoformat()
            for offset in range((last - first).days + 1)]

    tracked: list[str] = []
    samples = []
    for day in days:
        ours = archive_day(day, 'aos')
        theirs = harvested_day(day, 'aos')
        if not ours or not theirs:
            continue
        if not tracked:
            tracked = [app for app, _ in ours[:arguments.top]]
        samples.append({'order': [app for app, _ in ours], 'their_depth': len(theirs)})
    if not samples:
        raise SystemExit('No overlapping Android days')

    full = np.zeros(len(tracked))
    for sample in samples:
        full += day_index(sample['order'], len(sample['order']), reference_alpha, censored, tracked)

    low, high, step = (float(value) for value in arguments.grid.split(':'))
    rows = []
    for alpha in np.arange(low, high + step / 2, step):
        truncated = np.zeros(len(tracked))
        for sample in samples:
            depth = min(sample['their_depth'], len(sample['order']))
            truncated += day_index(sample['order'][:depth], depth, float(alpha), censored, tracked)
        ratio = np.log(truncated) - np.log(full)
        rows.append({'alpha_aos': round(float(alpha), 3),
                     'rmse_log_vs_full_depth': float(np.sqrt(np.mean((ratio - ratio.mean()) ** 2))),
                     'kendall_tau_vs_full_depth': kendall_tau(list(truncated), list(full))})

    best = min(rows, key=lambda row: row['rmse_log_vs_full_depth'])
    at_reference = next(row for row in rows
                        if abs(row['alpha_aos'] - reference_alpha) < step / 2)
    report = {
        'days': len(samples), 'tracked_games': len(tracked),
        'median_site_depth': statistics.median(sample['their_depth'] for sample in samples),
        'median_our_depth': statistics.median(len(sample['order']) for sample in samples),
        'reference_alpha_aos': reference_alpha,
        'best_alpha_on_truncated_charts': best,
        'at_reference_alpha': at_reference,
        'meaning': ('The exponent a truncated chart needs to reproduce the full-depth ranking. '
                    'If it matches the exponent fitted on the site\'s year, that difference was '
                    'chart depth rather than a different rank curve.'),
        'grid': rows,
    }
    path = ROOT / arguments.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'days={report["days"]} our_depth={report["median_our_depth"]} '
          f'site_depth={report["median_site_depth"]}')
    print(f'best alpha on truncated charts = {best["alpha_aos"]} '
          f'(rmse {best["rmse_log_vs_full_depth"]:.4f}); at August {reference_alpha} '
          f'rmse {at_reference["rmse_log_vs_full_depth"]:.4f}')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
