"""Read the site's daily history files as five-market rank observations.

`history/{date}.json` has been written every day since 2025-12-03 for KR, JP,
US, CN and TW, eight months before the research archive under `snapshots/`
begins on 2026-08-02. Two parts of it describe grossing charts:

- `rankings.grossing.{country}.{store}` is an ordered list, but not a chart.
  On days the archive also covers, no single archived snapshot reproduces its
  order (19 to 66 of 200 positions agree), so a position in it is not a rank.
- `bestRanks.{store}_{country}_grossing` maps app id to the best rank seen in
  that day's collected snapshots. On archived days it equals the per-day
  minimum of the archive exactly, and it is populated from 2025-12-12.

Only `bestRanks` is used. A best-of-day rank is a more flattering observation
than the per-snapshot mean the curve was fitted on, and ranks may tie or leave
gaps, so this module scores explicit rank values itself with the same
censoring rule as `score_day` and treats the result as a distinct observation
type. Depth is the deepest rank returned: the iOS charts hold 100 rows before
2026-02-05 and 200 rows after. Research only; nothing here writes to
`history/` or production.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from coverage_share import ROOT, market_weights
from score_day import identity_families

HISTORY = ROOT / 'history'
FIVE_MARKETS = ('cn', 'jp', 'kr', 'tw', 'us')
STORES = ('ios', 'aos')
FIRST_IDENTIFIED_DAY = '2025-12-12'


def history_file(day: str, directory: Path = HISTORY) -> Path:
    return directory / f'{day}.json'


def snapshot_time_kst(timestamp: str | None) -> str | None:
    """The build timestamp as an `HH:MM` KST label, or None when absent."""
    if not timestamp:
        return None
    moment = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    return (moment.astimezone(timezone.utc) + timedelta(hours=9)).strftime('%H:%M')


def best_rank_payload(day: str, directory: Path = HISTORY) -> dict | None:
    """One day's five-market grossing charts as `{app id: best rank}` tables.

    Returns None when the file is missing or carries no `bestRanks`. Charts
    outside the five markets and empty charts are left out; grossing and free
    charts are both kept, under their own keys, and the scorer picks one kind.
    Rows with an empty id or a non-positive rank are dropped and counted, never
    given a rank.
    """
    path = history_file(day, directory)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding='utf-8'))
    best = data.get('bestRanks')
    if not isinstance(best, dict):
        return None
    charts: dict[str, dict] = {}
    for key, table in best.items():
        parts = key.split('_')
        if len(parts) != 3 or parts[2] not in ('grossing', 'free'):
            continue
        store, country = parts[0], parts[1]
        if store not in STORES or country not in FIVE_MARKETS or not isinstance(table, dict):
            continue
        ranks: dict[str, int] = {}
        dropped = 0
        for app, rank in table.items():
            if not app or not isinstance(rank, int) or rank < 1:
                dropped += 1
                continue
            ranks[str(app)] = rank
        if not ranks:
            continue
        charts[key] = {'ranks': ranks, 'depth': max(ranks.values()),
                       'rows': len(ranks), 'dropped': dropped}
    # Free charts entered `bestRanks` on 2026-01-20; before that the day file
    # only carries the end-of-day snapshot under `rankings.free` (ordered
    # lists). Fill a missing free chart from it, rank = list position, and
    # record the substitution so a caller can tell snapshot from best-of-day.
    fallback: list[str] = []
    snapshot = (data.get('rankings') or {}).get('free')
    if isinstance(snapshot, dict):
        for country, stores in snapshot.items():
            if country not in FIVE_MARKETS or not isinstance(stores, dict):
                continue
            for store_key, rows in stores.items():
                store = 'aos' if store_key == 'android' else store_key
                key = f'{store}_{country}_free'
                if store not in STORES or key in charts or not isinstance(rows, list):
                    continue
                ranks = {str(row['appId']): rank for rank, row in enumerate(rows, start=1)
                         if isinstance(row, dict) and row.get('appId')}
                if ranks:
                    charts[key] = {'ranks': ranks, 'depth': max(ranks.values()), 'rows': len(ranks), 'dropped': 0}
                    fallback.append(key)
    if not charts:
        return None
    return {'date': day, 'time_kst': snapshot_time_kst(data.get('timestamp')), 'charts': charts,
            'snapshot_fallback_charts': fallback}


def score_best_ranks(payload: dict, params: dict, kind: str = 'grossing') -> dict:
    """Index per identity family from explicit best-of-day ranks of one chart kind.

    Mirrors `score_day` under its fitted convention (`every_chart`, depth as
    returned): a present app contributes `rank ** -alpha`, every chart credits
    `censored * depth ** -alpha` to every app, and each chart is weighted by
    its market proxy and country multiplier. Ranks are used as given, so tied
    or gapped best ranks keep their values instead of being renumbered.
    `kind` selects the grossing or the free charts; they are never mixed.
    """
    weights = market_weights()
    multipliers = params.get('country_multipliers', {})
    alpha = {'ios': params['alpha_ios'], 'aos': params['alpha_aos']}
    censored = params['censored']
    # Optional Mandelbrot shift: value = (rank + shift) ** -alpha flattens the
    # very top of the chart; zero is the plain power law the fit was built on.
    shift = float(params.get('rank_shift', 0.0))
    # Optional second slope below the knee: ranks past `knee` fall with
    # alpha_tail instead of alpha, continuous at the knee. Absent, one slope.
    knee = {store: float(params.get(f'knee_{store}', params.get('knee', 0.0))) for store in ('ios', 'aos')}
    tail = {'ios': params.get('alpha_tail_ios', alpha['ios']), 'aos': params.get('alpha_tail_aos', alpha['aos'])}

    def value(rank: float, store: str, country: str = '') -> float:
        rank += shift
        # A country may carry its own head slope (alpha_ios_JP); the tail is shared.
        head = params.get(f'alpha_{store}_{country}', alpha[store])
        if knee[store] > 0 and rank > knee[store]:
            return knee[store] ** -head * (rank / knee[store]) ** -tail[store]
        return rank ** -head

    families, _ = identity_families()
    app_index: dict[str, float] = {}
    app_by_chart: dict[str, dict[str, float]] = {}
    floor_by_chart: dict[str, float] = {}
    floor_total = 0.0
    used = 0
    observed_by_country: dict[str, float] = {}
    floor_by_country: dict[str, float] = {}
    for key, chart in payload['charts'].items():
        store, country, chart_kind = key.split('_')
        if chart_kind != kind:
            continue
        weight = weights.get((country.upper(), store))
        if weight is None or weight <= 0:
            continue
        weight *= multipliers.get(country.upper(), 1.0)
        used += 1
        floor = censored * value(float(chart['depth']), store, country.upper())
        floor_total += floor * weight
        floor_by_chart[key] = floor * weight
        floor_by_country[country.upper()] = floor_by_country.get(country.upper(), 0.0) + floor * weight
        for app, rank in chart['ranks'].items():
            observed = value(float(rank), store, country.upper())
            slot = f'{store}:{app}'
            app_index[slot] = app_index.get(slot, 0.0) + (observed - floor) * weight
            app_by_chart.setdefault(slot, {})[key] = (observed - floor) * weight
            observed_by_country[country.upper()] = (observed_by_country.get(country.upper(), 0.0)
                                                    + (observed - floor) * weight)
    if not used:
        raise ValueError(f'No {kind} chart in this day matched the market weight table')
    # As in the fitted panel, every app seen anywhere that day is credited the
    # censored floor of every used chart; a family is the sum of its seen apps.
    for slot in app_index:
        app_index[slot] += floor_total
        charts = app_by_chart.setdefault(slot, {})
        for key, floor in floor_by_chart.items():
            charts[key] = charts.get(key, 0.0) + floor
    by_country = {country: observed_by_country.get(country, 0.0) + floor_by_country[country] * len(app_index)
                  for country in floor_by_country}
    family_totals: dict[str, float] = {}
    family_by_chart: dict[str, dict[str, float]] = {}
    for app, value in app_index.items():
        name = families.get(app)
        if name is None:
            continue
        family_totals[name] = family_totals.get(name, 0.0) + value
        bucket = family_by_chart.setdefault(name, {})
        for key, part in app_by_chart[app].items():
            bucket[key] = bucket.get(key, 0.0) + part
    return {'app_index': app_index, 'charts': used, 'family_totals': family_totals,
            'family_by_chart': family_by_chart, 'country_totals': by_country, 'floor_total': floor_total}


def month_days(month: str) -> list[str]:
    """Every calendar day of `YYYY-MM`."""
    first = datetime.strptime(month + '-01', '%Y-%m-%d').date()
    days = []
    current = first
    while current.month == first.month:
        days.append(current.isoformat())
        current += timedelta(days=1)
    return days


def month_totals(month: str, params: dict, directory: Path = HISTORY) -> dict:
    """Summed best-rank family index over the identified days of one month.

    Days before `FIRST_IDENTIFIED_DAY` carry no ids and are not counted. The
    shallowest depth seen per chart is reported so a 100-row month is visible.
    """
    totals: dict[str, float] = {}
    counted = []
    depths: dict[str, int] = {}
    for day in month_days(month):
        if day < FIRST_IDENTIFIED_DAY:
            continue
        payload = best_rank_payload(day, directory)
        if payload is None:
            continue
        scored = score_best_ranks(payload, params)
        counted.append(day)
        for name, value in scored['family_totals'].items():
            totals[name] = totals.get(name, 0.0) + value
        for key, chart in payload['charts'].items():
            if key.endswith('_grossing'):
                depths[key] = min(depths.get(key, chart['depth']), chart['depth'])
    return {'month': month, 'days': counted, 'calendar_days': len(month_days(month)),
            'family_totals': totals, 'min_depth': depths}
