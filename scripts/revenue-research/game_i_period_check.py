"""Score a period that predates our archive, using the site's Japanese ranks.

The fit only ever saw 2026-08. The published Japanese year and year-to-date
figures sit outside it, and until now they had no ranks to pair with, so they
could not be scored at all. With the site's dated charts they can: the same
frozen model prices each day of the period, the daily indices are summed, and
the sum is compared with the published amount.

Level is compared under one free scale, as the market-total constraint already
does, because the published figures come from another provider on an
unstated fee basis: only ratios between games are the model's to get right.
Ordering is reported separately, since it needs no scale at all. Research only.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
from datetime import date, timedelta
from pathlib import Path

from game_i_index_check import android_translation, harvested_payload, japanese_aliases
from score_day import load_model, score_day

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / 'docs/research/anchors/anchors.jsonl'


def labels(period_start: str, period_end: str, source_id: str) -> list[dict]:
    """Published Japanese figures whose period is fully stated.

    A row with an undisclosed cutoff is refused rather than scored against a
    guessed end date: the year-to-date rows carry no cutoff, and treating one as
    a closed period would compare a full-period index with a partial amount.
    """
    rows = [json.loads(line) for line in LEDGER.read_text(encoding='utf-8').splitlines() if line.strip()]
    return [row for row in rows
            if row.get('source_id') == source_id
            and row.get('geography') == 'JP'
            and row.get('metric') == 'consumer_spend'
            and (row.get('period') or {}).get('start') == period_start
            and (row.get('period') or {}).get('end')
            and (row.get('period') or {}).get('end') == period_end
            and sorted(row.get('stores') or []) == ['app_store', 'google_play']
            and row.get('amount_usd_m')]


def period_index(start: str, end: str, params: dict) -> tuple[dict[str, float], list[str]]:
    """Summed daily Japanese index per store app id, and the days used.

    App ids rather than identity families, because the games published in a
    Japanese top ten include titles that never entered the August panel and so
    have no family entry; the ledger row itself already carries their store ids.
    """
    translation = android_translation()
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    totals: dict[str, float] = {}
    used = []
    for offset in range((last - first).days + 1):
        day = (first + timedelta(days=offset)).isoformat()
        payload = harvested_payload(day, translation)
        if payload is None:
            continue
        scored = score_day(payload, params)
        index = scored['app_index']
        for key, position in scored['app_ids'].items():
            value = float(index[position])
            if value:
                totals[key] = totals.get(key, 0.0) + value
        used.append(day)
    return totals, used


def store_keys(row: dict, aliases: dict[str, dict]) -> list[str]:
    """The scorer keys for one labelled game.

    An alias replaces the ledger's ids rather than adding to them: the two name
    different regional releases of the same franchise, and summing both would
    count a global app's revenue inside a Japanese figure.
    """
    alias = aliases.get(row.get('game_key') or row['game']) or aliases.get(row['game'])
    store_ids = ({'ios': alias.get('ios') or [], 'aos': alias.get('aos') or []}
                 if alias else (row.get('store_ids') or {}))
    return ([f'ios:{app}' for app in store_ids.get('ios') or []]
            + [f'aos:{app}' for app in store_ids.get('aos') or []])


def free_scale(pairs: list[tuple[float, float]]) -> float:
    """One scale for the whole set, so only ratios between games are scored.

    The published figures come from another provider on an unstated fee basis, so
    their absolute level is not the model's to reproduce; the geometric mean of
    the ratios removes exactly one degree of freedom and leaves the rest visible.
    """
    return math.exp(statistics.fmean(math.log(published) - math.log(index)
                                     for index, published in pairs))


def kendall_tau(left: list[float], right: list[float]) -> float | None:
    if len(left) < 2:
        return None
    concordant = discordant = 0
    for first in range(len(left)):
        for second in range(first + 1, len(left)):
            a = left[first] - left[second]
            b = right[first] - right[second]
            if a == 0 or b == 0:
                continue
            if (a > 0) == (b > 0):
                concordant += 1
            else:
                discordant += 1
    total = concordant + discordant
    return (concordant - discordant) / total if total else None


def open_ended_labels(period_start: str, source_id: str) -> list[dict]:
    """Published rows for a period that states a start but no cutoff."""
    rows = [json.loads(line) for line in LEDGER.read_text(encoding='utf-8').splitlines() if line.strip()]
    return [row for row in rows
            if row.get('source_id') == source_id
            and row.get('geography') == 'JP'
            and row.get('metric') == 'consumer_spend'
            and (row.get('period') or {}).get('start') == period_start
            and not (row.get('period') or {}).get('end')
            and sorted(row.get('stores') or []) == ['app_store', 'google_play']
            and row.get('amount_usd_m')]


def infer_cutoff(arguments) -> None:
    """Ask which cutoff date makes the undisclosed year-to-date figures consistent.

    The figures state a start but no end, so they cannot be scored as a period.
    They can still be read the other way round: with the scale measured on the
    same source's completed year, the cumulative index reaches each published
    amount on one particular day. That day is an estimate of the article's data
    cutoff, and it is reported as an inference, never written back as a period.
    """
    if not arguments.scale:
        raise SystemExit('--infer-cutoff needs --scale from a completed period of the same source')
    model = load_model(ROOT / arguments.model)
    rows = open_ended_labels(arguments.start, arguments.source)
    if not rows:
        raise SystemExit(f'No open-ended {arguments.source} rows starting {arguments.start}')

    window_start, window_end = arguments.infer_cutoff.split(':')
    aliases = japanese_aliases()
    translation = android_translation()
    first = date.fromisoformat(arguments.start)
    last = date.fromisoformat(window_end)

    running: dict[str, float] = {}
    by_day: dict[str, dict[str, float]] = {}
    for offset in range((last - first).days + 1):
        day = (first + timedelta(days=offset)).isoformat()
        payload = harvested_payload(day, translation)
        if payload is None:
            continue
        scored = score_day(payload, model['params'])
        index = scored['app_index']
        for key, position in scored['app_ids'].items():
            value = float(index[position])
            if value:
                running[key] = running.get(key, 0.0) + value
        by_day[day] = dict(running)

    candidates = []
    for day, totals in by_day.items():
        if day < window_start:
            continue
        errors = []
        for row in rows:
            index = sum(totals.get(key, 0.0) for key in store_keys(row, aliases))
            if index <= 0:
                continue
            errors.append(abs(index * arguments.scale / row['amount_usd_m'] - 1) * 100)
        if errors:
            candidates.append({'cutoff': day, 'games': len(errors),
                               'median_abs_error_pct': statistics.median(errors)})
    if not candidates:
        raise SystemExit('No harvested days in the requested cutoff window')

    best = min(candidates, key=lambda row: row['median_abs_error_pct'])
    report = {'source': arguments.source, 'period_start': arguments.start,
              'scale_usd_m_per_index': arguments.scale, 'model': arguments.model,
              'window': arguments.infer_cutoff, 'best_cutoff': best,
              'candidates': sorted(candidates, key=lambda row: row['cutoff'])}
    default = f'reports/rank-models/game-i-cutoff-{arguments.start}.json'
    path = ROOT / (arguments.output or default)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'best cutoff={best["cutoff"]} median_err={best["median_abs_error_pct"]:.1f}% '
          f'games={best["games"]} (of {len(candidates)} candidate days)')
    print(f'-> {path}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    parser.add_argument('--source', default='J1')
    parser.add_argument('--model', default='reports/rank-models/august-curve-final-2026-09-11.json')
    parser.add_argument('--output', default='')
    parser.add_argument('--infer-cutoff', default='',
                        help='score open-ended year-to-date rows at every end date in '
                             'START:END and report which cutoff fits best')
    parser.add_argument('--scale', type=float, default=0.0,
                        help='carry a scale measured on another period of the same source '
                             'instead of fitting a free one')
    arguments = parser.parse_args()
    if arguments.infer_cutoff:
        infer_cutoff(arguments)
        return

    model = load_model(ROOT / arguments.model)
    params = model['params']
    rows = labels(arguments.start, arguments.end, arguments.source)
    if not rows:
        raise SystemExit(f'No {arguments.source} labels for {arguments.start}..{arguments.end}')

    totals, used = period_index(arguments.start, arguments.end, params)
    if not used:
        raise SystemExit('No harvested Japanese charts for this period')

    aliases = japanese_aliases()
    scored = []
    unmatched = []
    for row in rows:
        keys = store_keys(row, aliases)
        index = sum(totals.get(key, 0.0) for key in keys)
        if not keys or index <= 0:
            unmatched.append(row['game'])
            continue
        scored.append({'game': row['game'], 'store_keys': keys,
                       'published_usd_m': row['amount_usd_m'], 'index': index,
                       'published_rank_note': row.get('notes')})

    if len(scored) < 2:
        raise SystemExit('Too few games could be indexed for this period')

    scale = free_scale([(row['index'], row['published_usd_m']) for row in scored])
    for row in scored:
        row['predicted_usd_m'] = row['index'] * scale
        row['error_pct'] = (row['predicted_usd_m'] / row['published_usd_m'] - 1) * 100

    errors = sorted(abs(row['error_pct']) for row in scored)
    tau = kendall_tau([row['index'] for row in scored],
                      [row['published_usd_m'] for row in scored])
    by_model = sorted(scored, key=lambda row: -row['index'])
    by_published = sorted(scored, key=lambda row: -row['published_usd_m'])
    report = {
        'period': {'start': arguments.start, 'end': arguments.end},
        'source': arguments.source,
        'model': arguments.model,
        'days_used': len(used),
        'days_expected': (date.fromisoformat(arguments.end)
                          - date.fromisoformat(arguments.start)).days + 1,
        'games_scored': len(scored),
        'games_unmatched': unmatched,
        'free_scale_usd_m_per_index': scale,
        'median_abs_error_pct': statistics.median(errors),
        'worst_abs_error_pct': errors[-1],
        'kendall_tau_vs_published': tau,
        'model_order': [row['game'] for row in by_model],
        'published_order': [row['game'] for row in by_published],
        'rows': sorted(scored, key=lambda row: -row['published_usd_m']),
    }
    default = f'reports/rank-models/game-i-period-{arguments.start}-{arguments.end}.json'
    path = ROOT / (arguments.output or default)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'days={report["days_used"]}/{report["days_expected"]} games={report["games_scored"]} '
          f'median_err={report["median_abs_error_pct"]:.1f}% worst={report["worst_abs_error_pct"]:.1f}% '
          f'tau={tau:.3f}' if tau is not None else '')
    for row in report['rows']:
        print(f'  {row["game"]:<26} published={row["published_usd_m"]:8.1f}m '
              f'predicted={row["predicted_usd_m"]:8.1f}m  {row["error_pct"]:+.1f}%')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
