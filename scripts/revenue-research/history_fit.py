"""Learn the rank-to-revenue model from every labelled month, and measure whether
more months make it better.

Observations are the site's own five-market best-of-day ranks (`history_panel`),
available daily since 2025-12-12. Labels are published monthly worldwide
amounts from the anchor ledger, split into evidence classes by fee basis: the
gross class (PocketGamer, before the platform cut) and the net class
(MobileGamer, after it). Each class gets its own scale; they are never mixed.

Model, in logs:

    log y[g, m, c] = log(I[g, m] / cov[g]) + log(D[m] / 31) + log S[c] + b[g]

I is the mean daily index of game g in month m under the curve parameters
(a two-slope power law: rank ** -alpha to the knee, a steeper tail below it),
cov[g] its five-market coverage share, D[m] the calendar length, S[c] the class
scale and b[g] a per-game term. b[g] is shrunk towards zero by the number of
labels the game has: n / (n + lambda) times its mean residual. A game with one
label barely moves; a game with eight labels keeps its structural gap (bundle
mismatch, unobserved markets) as its own correction.

Three shared covariates then explain what they can before the game term does,
and because they exist for every game they carry to unlabelled ones:

    log y = ... + log S[c] + beta . f[g, m] + b[g]

f = (centred log index, free-chart ratio, month market ratio). The log index
lets published revenue grow slower than the rank index; the free-chart ratio
log(1 + free index / grossing index) marks launch and promotion months, when a
game climbs the download chart ahead of the grossing chart; the market ratio
log(M[m] / mean M) is the published worldwide monthly total (or the quarter
average when only that is published), zero when neither exists. A first pass
with eight country/store share features found them shrunk to nothing by
validation, so they were removed.

The loss is Huber in log space when validation prefers it: residuals beyond
delta are weighted down, so one event month does not pull the shared
coefficients. Curve parameters, both penalties and delta are chosen by
rolling validation only: every month is predicted from the months before it,
never from itself or later. The same rolling errors, grouped by how many
prior labels the game had, are the learning curve.

Validation is also offered two month-shape covariates: `volatility`,
log(peak day index / mean day index), which marks event months, and
`ios_share`, the iOS part of the grossing index minus one half. Labels may be
weighted by age with a half-life in months, so a game whose structure moved
(a web shop) is priced by its recent months. Finally the ENSEMBLE_SIZE trials
with the lowest rolling error are averaged in log space and scored as one more
candidate, because the error surface is flat and a single winner is partly a
noise pick. Research only; no production change.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from datetime import date, timedelta
from itertools import product
from pathlib import Path

from coverage_share import ROOT
from history_panel import FIRST_IDENTIFIED_DAY, best_rank_payload, month_days, score_best_ranks
from score_day import identity_families
from september_day_check import coverage_for, resolve_family

LEDGER = ROOT / 'docs/research/anchors/anchors.jsonl'
FIT_MONTH_DAYS = 31
ROLE_PRIORITY = {'benchmark': 0, 'candidate': 1}
# A class scale learnt from fewer labels than this is not a prediction, so
# rolling validation does not score that class until the training months hold
# at least this many of its labels (one derived December gross figure would
# otherwise "predict" every January gross label from a single point).
MIN_CLASS_LABELS = 5

# Wide enough that the validated optimum sits inside, not on an edge; the
# rolling error surface is flat within about one point of it. censored 0 means
# an app outside a chart earns nothing from that chart, which rolling
# validation prefers to any positive floor.
#
# The curve has two slopes since 2026-09-12: rank ** -alpha down to the knee,
# then a steeper alpha_tail below it (continuous at the knee). Rolling
# validation put the optimum inside this grid (knee 20-30, iOS tail 1.4,
# Android tail 1.0-1.3) and cut rmse_log from 0.167 to 0.160 against the single
# slope; censored 0 and the Chinese multiplier 3.0 were re-validated against
# 0.1-0.5 and 2-5 on the same day and are fixed here to keep the run short.
#
# With the 524-label ledger of the evening of 2026-09-12 two 432-point sweeps
# in a row preferred a flatter Android head (0.5), an earlier knee (15) and a
# steeper Android tail (1.4) by 0.002 mae, so those values joined the grid.
DEFAULT_GRID = {
    'alpha_ios': [1.1, 1.2],
    # 2026-09-13 fine grid (559 labels, 15,552 trials): the best point sat at
    # the Android head 0.4 / knee 10 edge (mae_log 0.093 vs 0.094 at 0.5/15),
    # so 0.4 and 10 replace 0.7 and 30, which never won.
    'alpha_aos': [0.4, 0.5, 0.6],
    'censored': [0.0],
    'cn_multiplier': [3.0],
    'knee': [10.0, 15.0, 20.0],
    'alpha_tail_ios': [1.2, 1.3, 1.4],
    'alpha_tail_aos': [1.3, 1.4],
    # Japanese iOS charts concentrate spending at the very top: a steeper head
    # slope there took rmse_log from 0.159 to 0.157 on 2026-09-12 (Korea, Taiwan
    # and the US showed no such effect and keep the shared slope).
    'alpha_ios_JP': [1.2, 1.6],
}
# Options that never won a rolling validation (lambda 2, feature ridge 10, group
# ridge 1, a 4-month half-life next to 3) were dropped from the defaults on
# 2026-09-12 so the monthly run stays in minutes; any of them can be passed back
# on the command line.
DEFAULT_LAMBDAS = [0.5, 1.0]
DEFAULT_FEATURE_LAMBDAS = [1.0]
DEFAULT_HUBER_DELTAS = [0.3, math.inf]
DEFAULT_GROUP_LAMBDAS = [4.0, math.inf]
DICTIONARY = ROOT / 'reports/rank-models/sustained-rank-observations-2026-09-11/session-F5mbni/collector-output/apps.json'
FEATURE_NAMES = ['log_index', 'free_ratio', 'log_market', 'volatility', 'ios_share', 'trend', 'log_index_net',
                 'top_share', 'log_chart_mass', 'log_coverage', 'share_CN', 'share_JP', 'share_KR', 'share_TW',
                 'active_fraction']
# log_coverage: log of the family's five-market coverage share, centred on the
# median family. The offset already divides by the share; a positive beta pulls
# that correction back (1 = no correction at all). Offered to validation for the
# download fit, where many families barely chart in the five markets and the
# 1/share correction turns a rank-150 Taiwan sighting into 30m installs.
# trend: months since 2025-12, a drift in the scale when market totals are
# missing; log_index_net: the size elasticity may differ between the net and
# gross providers. Both are offered to validation only, not in the defaults.
BASE_FEATURES = FEATURE_NAMES[:3]
# Validation chooses the covariate set: the base three with volatility, or all
# five (the base alone and base + iOS share never won and were dropped from the
# default list on 2026-09-12; pass --feature-sets to try them again).
SHAPE_FEATURES = BASE_FEATURES + ['volatility', 'ios_share']
DEFAULT_FEATURE_SETS = [BASE_FEATURES + ['volatility'], SHAPE_FEATURES]
DEFAULT_HALF_LIVES = [3.0]  # months; inf (every label equal) is always tried as well
DEFAULT_EXTRA_CLASS_WEIGHTS = [0.0, 1.0]  # for label classes outside the scored ones; 0.25 never won
ENSEMBLE_SIZE = 5


# ----------------------------------------------------------------- labels --

def ledger_rows() -> list[dict]:
    rows = []
    for line in LEDGER.read_text(encoding='utf-8').splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


# Which published quantity the fit explains, and which chart carries it. The
# revenue fit reads the grossing charts with the free charts as a covariate;
# the download fit (`--metric downloads`) swaps them and uses the download
# market table. Set once from the command line; every function reads it.
METRIC = {'name': 'consumer_spend', 'primary': 'grossing', 'secondary': 'free', 'currency': 'USD',
          'market_table': 'data/rank-models/global-chart-2026-v0.3.json'}
DOWNLOAD_METRIC = {'name': 'downloads', 'primary': 'free', 'secondary': 'grossing', 'currency': 'COUNT',
                   'market_table': 'data/rank-models/global-downloads-2026-v0.1.json'}
# Defaults for `--metric downloads`. First set from the five sweeps of
# 2026-09-12 (135 AppMagic install labels); re-swept on 2026-09-13 with 198
# labels (PocketGamer and GamingonPhone rows added). The coverage covariate
# stays essential: many families barely chart in the five markets, so
# validation keeps only ~35% of the 1/share correction (beta ~0.66) and reads
# the index sub-proportionally (log_index beta ~ -0.55). With the wider label
# set the Android free chart wants a flat head (0.6 to rank 50, then 1.3) where
# the 135-label fit chose 1.0/knee 10; the iOS head is indifferent between 1.0
# and 1.2. The market-total covariate, feature ridge 0.01 and a 2-month
# half-life each gave ~0.001 and are kept as options. Rolling median 10.5%,
# mae_log 0.146, p80 band x1.26 (was 11.9% / 0.151 / x1.28 with the old grid).
DOWNLOAD_DEFAULTS = {
    'grid': {'alpha_ios': [1.0, 1.2], 'alpha_aos': [0.6, 0.8], 'censored': [0.0], 'cn_multiplier': [1.0],
             'knee': [20.0, 50.0], 'alpha_tail_ios': [1.3], 'alpha_tail_aos': [1.3], 'alpha_ios_JP': [1.0]},
    'lambdas': [0.1, 0.25],
    'feature_lambdas': [0.01, 0.03],
    'half_lives': [2.0, 3.0],
    'feature_sets': [['log_index', 'free_ratio', 'log_coverage', 'log_market'],
                     ['log_index', 'free_ratio', 'log_coverage']],
    # Five all-country days (2026-09-08, 09, 11, 12, 13); the fifth day left the
    # 153 shared rows unchanged and fixed the two India-driven families the
    # four-day file placed at +63% / -71% (2026-09-13).
    'coverage': 'reports/rank-models/coverage-downloads-5day-2026-09-13.json',
    'score_classes': 'downloads',
}
HEDGED_QUALIFIERS = {'approximately': 1.0, 'nearly': 0.99}  # usable hedges and the factor applied
MIN_PERIOD_DAYS = 7  # a daily chart cannot resolve one day's revenue: rank 1 is censored and time zones differ
HEDGED_WEIGHT = 1.0  # fit weight of a hedged ("about", "nearly") label relative to an exact one
WEEK_ORDINALS = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4}
MONTH_NAMES = {name: i for i, name in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
     'september', 'october', 'november', 'december'], start=1)}


def period_bounds(period: dict) -> tuple[str, str] | None:
    """(start, end) of a month, day, week or dated range; None when unusable.

    A week given only as "first week of September 2026" is read as the
    calendar days 1-7 of that month, the convention of the weekly trade press.
    """
    kind = period.get('kind')
    start, end = period.get('start'), period.get('end')
    if kind == 'month' and start:
        return start[:7] + '-01', month_days(start[:7])[-1]
    if kind in ('day', 'week', 'range') and start and end and start <= end:
        return start, end
    if kind == 'week' and period.get('label'):
        match = re.match(r'\s*(first|second|third|fourth) week of ([a-z]+) (\d{4})\s*$', period['label'].lower())
        if match and match.group(2) in MONTH_NAMES:
            first = date(int(match.group(3)), MONTH_NAMES[match.group(2)], 1 + 7 * (WEEK_ORDINALS[match.group(1)] - 1))
            return first.isoformat(), (first + timedelta(days=6)).isoformat()
    return None


def period_key(period: dict) -> str | None:
    """Index key: the calendar month for a month, `start..end` otherwise."""
    bounds = period_bounds(period)
    if bounds is None:
        return None
    return bounds[0][:7] if period.get('kind') == 'month' else f'{bounds[0]}..{bounds[1]}'


def period_days(period: dict) -> int:
    bounds = period_bounds(period)
    return 0 if bounds is None else (date.fromisoformat(bounds[1]) - date.fromisoformat(bounds[0])).days + 1


def label_amount(row: dict) -> float:
    """Published amount in millions: USD for spend, installs for downloads."""
    if row.get('amount_usd_m'):
        return float(row['amount_usd_m'])
    return float(row.get('amount') or 0.0) * float(row.get('unit_multiplier') or 1e6) / 1e6


def label_class(row: dict) -> str:
    """The scale class: the fee basis for spend, 'downloads' otherwise, unless the row names its own."""
    if row.get('label_class'):
        return row['label_class']
    return row['fee_basis'] if METRIC['name'] == 'consumer_spend' else METRIC['name']


def eligible(row: dict) -> bool:
    period = row.get('period') or {}
    return (row.get('metric') == METRIC['name'] and period_days(period) >= MIN_PERIOD_DAYS
            and row.get('geography') == 'WW' and row.get('currency') == METRIC['currency']
            and sorted(row.get('stores') or []) == ['app_store', 'google_play']
            and row.get('review_status') == 'clear'
            and row.get('evidence_role') in ROLE_PRIORITY
            and (not row.get('qualifier') or row.get('qualifier') in HEDGED_QUALIFIERS)
            and (METRIC['name'] != 'consumer_spend' or row.get('fee_basis') in ('gross', 'net'))
            and label_amount(row) > 0)


def family_for(row: dict, names: set[str]) -> str | None:
    for candidate in (row.get('game_key'), row.get('game')):
        if candidate and candidate in names:
            return candidate
    try:
        return resolve_family(row.get('store_ids'))
    except ValueError:
        return None


def collect_labels(rows: list[dict], names: set[str],
                   sources: dict | None = None) -> tuple[list[dict], list[dict]]:
    """One label per (family, month, class); benchmark beats candidate, then median.

    The class is the fee basis unless the row names its own `label_class`
    (a provider whose method differs from the gross and net providers).
    Returns the labels and the conflicts where two kept sources disagree by
    more than ten percent, so a disagreement is visible instead of averaged away.
    """
    grouped: dict[tuple, list[dict]] = {}
    for row in rows:
        if not eligible(row):
            continue
        family = family_for(row, names)
        if family is None:
            continue
        key = (family, period_key(row['period']), label_class(row))
        grouped.setdefault(key, []).append(row)
    labels, conflicts = [], []
    for (family, key, klass), members in sorted(grouped.items()):
        best_role = min(ROLE_PRIORITY[m['evidence_role']] for m in members)
        kept = [m for m in members if ROLE_PRIORITY[m['evidence_role']] == best_role]
        exact = [m for m in kept if not m.get('qualifier')]
        kept = exact or kept  # an exact figure beats a hedged one of the same role
        amounts = sorted(label_amount(m) * HEDGED_QUALIFIERS.get(m.get('qualifier'), 1.0) for m in kept)
        start, end = period_bounds(members[0]['period'])
        if amounts[-1] / amounts[0] > 1.10:
            conflicts.append({'family': family, 'month': key, 'class': klass,
                              'amounts': amounts, 'sources': sorted(m['source_id'] for m in kept)})
        availability = {}
        if sources is not None:
            published = [sources.get(m['source_id'], {}).get('published_on') for m in kept]
            availability['available_on'] = max(published) if all(published) else None
        labels.append({'family': family, 'month': end[:7], 'period_key': key, 'class': klass,
                       'period_start': start, 'period_end': end,
                       'amount_usd_m': statistics.median(amounts), 'hedged': not exact,
                       'sources': sorted({m['source_id'] for m in kept}), **availability})
    return labels, conflicts


def label_periods(labels: list[dict]) -> dict[str, tuple[str, str]]:
    """Sub-month periods the index must be aggregated over, by key."""
    return {label['period_key']: (label['period_start'], label['period_end'])
            for label in labels if label['period_key'] != label['month']}


def cross_class_check(labels: list[dict], mad_multiplier: float = 5.0) -> tuple[list[dict], dict]:
    """Drop game-months whose net and gross labels disagree with the rest.

    Both classes describe the same provider estimate before and after the
    platform cut, so their ratio is nearly constant (0.698 with a MAD of 0.002
    on the first pass). A pair far outside that band is a bundle or reading
    mismatch, or a preliminary figure: the net figures come from write-ups
    published in the first days of the next month and AppMagic revises them
    afterwards (Brawl Stars February: $21m in the March 4 article, about $23m
    in the April 14 one; Honor of Kings January: $172m+, then ~$188m, then
    $193m), while the gross lists appear later in the month. The net label is
    therefore the side dropped and the pair is reported. The band is the
    robust z-score convention on the observed ratios, not a fixed tolerance.
    """
    by_key: dict[tuple[str, str], dict[str, dict]] = {}
    for label in labels:
        by_key.setdefault((label['family'], label.get('period_key', label['month'])), {})[label['class']] = label
    ratios = {key: rows['net']['amount_usd_m'] / rows['gross']['amount_usd_m']
              for key, rows in by_key.items() if 'net' in rows and 'gross' in rows}
    if len(ratios) < 3:
        return labels, {'pairs': len(ratios), 'excluded': []}
    median = statistics.median(ratios.values())
    mad = statistics.median(abs(value - median) for value in ratios.values()) or 1e-9
    excluded = {key for key, value in ratios.items() if abs(value - median) > mad_multiplier * mad}
    kept = [label for label in labels
            if label['class'] != 'net' or (label['family'], label.get('period_key', label['month'])) not in excluded]
    report = {'pairs': len(ratios), 'median_net_over_gross': median, 'mad': mad,
              'excluded': [{'family': key[0], 'month': key[1], 'net_over_gross': ratios[key],
                            'gross': by_key[key]['gross']['amount_usd_m'], 'net': by_key[key]['net']['amount_usd_m']}
                           for key in sorted(excluded)]}
    return kept, report


def family_groups(names: set[str], dictionary: Path) -> dict[str, str]:
    """Developer name per family from the collected chart dictionary.

    The first listed iOS id (else Android id) decides; the developer string is
    lower-cased and stripped of corporate suffixes so 'Cygames, Inc.' and
    'Cygames Inc' are one group. A family whose ids are absent from the
    dictionary has no group and is priced without a group term.
    """
    import re
    identities = json.loads((ROOT / 'docs/research/anchors/identities.json').read_text(encoding='utf-8'))
    payload = json.loads(dictionary.read_text(encoding='utf-8')) if dictionary.exists() else {}
    entries = payload.get('apps', payload) if isinstance(payload, dict) else {}
    suffix = re.compile(r'\b(co|ltd|inc|corp|corporation|limited|pte|private|llc|gmbh|k\.?k|games?|entertainment|'
                        r'mobile|technology|network|international|holdings?)\b\.?', re.I)
    groups = {}
    for name in names:
        entry = identities['games'].get(name) or {}
        slots = [f'ios:{app}' for app in entry.get('ios', [])] + [f'aos:{app}' for app in entry.get('aos', [])]
        developer = next((entries[slot].get('d') for slot in slots
                          if isinstance(entries.get(slot), dict) and entries[slot].get('d')), None)
        if not developer:
            continue
        cleaned = re.sub(r'[^a-z0-9]+', ' ', suffix.sub(' ', developer.lower())).strip()
        if cleaned:
            groups[name] = cleaned
    return groups


# ------------------------------------------------------------ observations --

def load_payloads(first: str, last: str) -> dict[str, dict]:
    payloads = {}
    for month in months_between(first[:7], last[:7]):
        for day in month_days(month):
            if day < max(first, FIRST_IDENTIFIED_DAY) or day > last:
                continue
            payload = best_rank_payload(day)
            if payload is not None:
                payloads[day] = payload
    return payloads


def months_between(first: str, last: str) -> list[str]:
    year, month = int(first[:4]), int(first[5:7])
    out = []
    while f'{year}-{month:02d}' <= last:
        out.append(f'{year}-{month:02d}')
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return out


def curve_params(point: dict) -> dict:
    """Index parameters for one grid point.

    Beyond the four fitted ones, a point may carry `rank_shift` (Mandelbrot
    shift, default 0) and `<cc>_multiplier` for any country code, applied to
    that country's charts like the Chinese one.
    """
    multipliers = {key[:-11].upper(): value for key, value in point.items()
                   if key.endswith('_multiplier') and key != 'cn_multiplier'}
    params = {'alpha_ios': point['alpha_ios'], 'alpha_aos': point['alpha_aos'],
              'censored': point['censored'], 'rank_shift': point.get('rank_shift', 0.0),
              'country_multipliers': {'CN': point['cn_multiplier'], **multipliers}}
    for key in ('knee', 'knee_ios', 'knee_aos', 'alpha_tail_ios', 'alpha_tail_aos'):  # optional two-slope curve
        if key in point:
            params[key] = point[key]
    for key, value in point.items():  # optional per-country head slope, e.g. alpha_ios_JP
        if key.startswith('alpha_') and key.count('_') == 2:
            params[key] = value
    return params


def monthly_index(payloads: dict[str, dict], params: dict) -> dict[str, dict]:
    """Mean daily family index per month (grossing and free), its within-month
    peak day, the iOS part of the grossing index, and the days it rests on."""
    totals: dict[str, dict[str, float]] = {}
    free_totals: dict[str, dict[str, float]] = {}
    peaks: dict[str, dict[str, float]] = {}
    ios_totals: dict[str, dict[str, float]] = {}
    days: dict[str, int] = {}
    for day, payload in payloads.items():
        month = day[:7]
        bucket = totals.setdefault(month, {})
        peak = peaks.setdefault(month, {})
        ios = ios_totals.setdefault(month, {})
        scored = score_best_ranks(payload, params, 'grossing')
        for name, value in scored['family_totals'].items():
            bucket[name] = bucket.get(name, 0.0) + value
            peak[name] = max(peak.get(name, 0.0), value)
            ios[name] = ios.get(name, 0.0) + sum(part for key, part in scored['family_by_chart'].get(name, {}).items()
                                                 if key.startswith('ios_'))
        free_bucket = free_totals.setdefault(month, {})
        try:
            free_scored = score_best_ranks(payload, params, 'free')['family_totals']
        except ValueError:  # a day without free charts contributes no free index
            free_scored = {}
        for name, value in free_scored.items():
            free_bucket[name] = free_bucket.get(name, 0.0) + value
        days[month] = days.get(month, 0) + 1
    return {month: {'month': month, 'observed_days': days[month], 'calendar_days': len(month_days(month)),
                    'mean_daily': {name: value / days[month] for name, value in bucket.items()},
                    'mean_daily_free': {name: value / days[month] for name, value in free_totals[month].items()},
                    'max_daily': peaks[month],
                    'ios_share': {name: ios_totals[month][name] / value for name, value in bucket.items() if value > 0}}
            for month, bucket in totals.items()}


def rank_tables(payloads: dict[str, dict]) -> tuple[dict, list[str]]:
    """Flatten every day's charts once into arrays the index can be computed from
    for any curve parameters, so a grid point costs a few vector operations
    instead of a Python pass over 272 days of rank tables.

    Only apps that belong to an identity family are kept: with no censored
    floor the family index is exactly the sum over its apps' chart entries of
    weight * multiplier * curve(rank), which is what `score_best_ranks` returns.
    """
    import numpy as np

    from coverage_share import market_weights

    families, names = identity_families()
    name_index = {name: i for i, name in enumerate(names)}
    weights = market_weights()
    countries: dict[str, int] = {}
    tables: dict[tuple[str, str], dict] = {}
    for day, payload in payloads.items():
        for kind in ('grossing', 'free'):
            family, store, country, weight, rank = [], [], [], [], []
            used = 0
            for key, chart in payload['charts'].items():
                st, cc, ck = key.split('_')
                if ck != kind:
                    continue
                chart_weight = weights.get((cc.upper(), st))
                if chart_weight is None or chart_weight <= 0:
                    continue
                used += 1
                cc_index = countries.setdefault(cc.upper(), len(countries))
                for app, r in chart['ranks'].items():
                    name = families.get(f'{st}:{app}')
                    if name is None:
                        continue
                    family.append(name_index[name])
                    store.append(0 if st == 'ios' else 1)
                    country.append(cc_index)
                    weight.append(chart_weight)
                    rank.append(float(r))
            tables[(day, kind)] = {'used': used, 'family': np.array(family, dtype=int),
                                   'store': np.array(store, dtype=int), 'country': np.array(country, dtype=int),
                                   'weight': np.array(weight, dtype=float), 'rank': np.array(rank, dtype=float)}
    tables['_countries'] = countries
    return tables, list(names)


def monthly_index_fast(payloads: dict[str, dict], tables: dict, names: list[str], params: dict,
                       periods: dict[str, tuple[str, str]] | None = None) -> dict[str, dict]:
    """`monthly_index` from the flattened tables; identical output for censored 0.

    `periods` adds sub-month buckets (key -> (start, end)) aggregated the same
    way, so a published week or day can be a label; each carries its calendar
    month under 'month' for the market, trend and rolling order.
    """
    import numpy as np

    periods = periods or {}
    if params.get('censored', 0.0):
        return monthly_index(payloads, params)
    countries = tables['_countries']
    multiplier = np.ones(len(countries))
    for code, value in params.get('country_multipliers', {}).items():
        if code in countries:
            multiplier[countries[code]] = value
    alpha = np.array([params['alpha_ios'], params['alpha_aos']])
    tail = np.array([params.get('alpha_tail_ios', params['alpha_ios']), params.get('alpha_tail_aos', params['alpha_aos'])])
    knee = np.array([float(params.get('knee_ios', params.get('knee', 0.0))),
                     float(params.get('knee_aos', params.get('knee', 0.0)))])
    shift = float(params.get('rank_shift', 0.0))

    head_overrides = [(0 if key.split('_')[1] == 'ios' else 1, countries[key.split('_')[2]], value)
                      for key, value in params.items()
                      if key.startswith('alpha_') and key.count('_') == 2 and key.split('_')[2] in countries]

    def curve(table: dict) -> 'np.ndarray':
        rank = table['rank'] + shift
        a = alpha[table['store']]
        for store_index, country_index, head in head_overrides:  # per-country head slope
            a = np.where((table['store'] == store_index) & (table['country'] == country_index), head, a)
        value = rank ** -a
        k = knee[table['store']]
        below = (k > 0) & (rank > k)
        if below.any():
            value[below] = k[below] ** -a[below] * (rank[below] / k[below]) ** -tail[table['store']][below]
        return table['weight'] * multiplier[table['country']] * value

    n = len(names)
    totals: dict[str, 'np.ndarray'] = {}
    free_totals: dict[str, 'np.ndarray'] = {}
    peaks: dict[str, 'np.ndarray'] = {}
    ios_totals: dict[str, 'np.ndarray'] = {}
    country_totals: dict[str, 'np.ndarray'] = {}
    active_days: dict[str, 'np.ndarray'] = {}
    first_seen: dict[int, str] = {}
    top_days: dict[str, 'np.ndarray'] = {}
    days: dict[str, int] = {}
    for day in payloads:
        gross = tables[(day, METRIC['primary'])]  # the chart the metric is read from
        if not gross['used']:
            raise ValueError(f"No {METRIC['primary']} chart on {day} matched the market weight table")
        contribution = curve(gross)
        family_total = np.bincount(gross['family'], contribution, minlength=n)
        for family_index in np.nonzero(family_total)[0]:
            first_seen[family_index] = min(first_seen.get(family_index, day), day)
        country_part = np.bincount(gross['country'] * n + gross['family'], contribution,
                                   minlength=len(countries) * n).reshape(len(countries), n)
        ios_part = np.bincount(gross['family'][gross['store'] == 0], contribution[gross['store'] == 0], minlength=n)
        free = tables[(day, METRIC['secondary'])]  # the other chart, a covariate
        free_part = np.bincount(free['family'], curve(free), minlength=n) if free['used'] else None
        top_part = np.bincount(gross['family'][gross['rank'] == 1.0], minlength=n)
        buckets = [day[:7]] + [key for key, (start, end) in periods.items() if start <= day <= end]
        for month in buckets:
            totals[month] = totals.get(month, 0) + family_total
            ios_totals[month] = ios_totals.get(month, 0) + ios_part
            country_totals[month] = country_totals.get(month, 0) + country_part
            active_days[month] = active_days.get(month, 0) + (family_total > 0)
            top_days[month] = top_days.get(month, 0) + (top_part > 0)
            peaks[month] = np.maximum(peaks.get(month, 0), family_total)
            if free_part is not None:
                free_totals[month] = free_totals.get(month, 0) + free_part
            days[month] = days.get(month, 0) + 1
    out = {}
    for month, total in totals.items():
        count = days[month]
        present = np.nonzero(total)[0]
        free_total = free_totals.get(month)
        if month in periods:
            start, end = periods[month]
            calendar = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
        else:
            calendar = len(month_days(month))
        out[month] = {'month': periods[month][1][:7] if month in periods else month[:7],
                       'observed_days': count, 'calendar_days': calendar,
                      'mean_daily': {names[i]: float(total[i]) / count for i in present},
                      'mean_daily_free': ({names[i]: float(free_total[i]) / count for i in np.nonzero(free_total)[0]}
                                          if free_total is not None else {}),
                      'max_daily': {names[i]: float(peaks[month][i]) for i in present},
                      'ios_share': {names[i]: float(ios_totals[month][i] / total[i]) for i in present},
                      'country_shares': {
                           names[i]: {code: float(country_totals[month][ci, i] / total[i])
                                      for code, ci in countries.items()} for i in present},
                      'active_days': {names[i]: int(active_days[month][i]) for i in present},
                      'first_observed_month': {names[i]: first_seen[i][:7] for i in present},
                      'top_days': {names[i]: int(top_days[month][i]) for i in present if top_days[month][i]},
                      'chart_mass': float(total.sum()) / count}
    return out


def market_calendar(rows: list[dict]) -> dict[str, float]:
    """Published worldwide two-store monthly market totals, USD million, per month.

    Providers measure the market on different bases (Sensor Tower's monthly
    totals run about 5% above AppMagic's), so mixing them would read the basis
    gap as seasonality. The provider covering the most months supplies the
    whole series; within it a month's own total wins, otherwise a quarter
    total is spread over its months by calendar length. Only clear rows count,
    and when the chosen provider has several clear rows for a month the median
    is used.
    """
    monthly: dict[str, dict[str, list[float]]] = {}
    quarterly: dict[str, dict[str, list[float]]] = {}
    for row in rows:
        period = row.get('period') or {}
        if (row.get('metric') != 'market_total' or row.get('geography') != 'WW'
                or sorted(row.get('stores') or []) != ['app_store', 'google_play']
                or row.get('review_status') != 'clear' or row.get('fee_basis') != 'gross'
                or not row.get('amount_usd_m') or not period.get('start')):
            continue
        provider = row.get('provider') or 'unknown'
        if period.get('kind') == 'month':
            monthly.setdefault(provider, {}).setdefault(period['start'][:7], []).append(row['amount_usd_m'])
        elif period.get('kind') == 'quarter' and period.get('end'):
            quarterly.setdefault(provider, {}).setdefault(f"{period['start']}..{period['end']}", []).append(row['amount_usd_m'])
    providers = set(monthly) | set(quarterly)
    if not providers:
        return {}
    chosen = max(providers, key=lambda p: (len(monthly.get(p, {})), len(quarterly.get(p, {})), p))
    calendar = {month: statistics.median(values) for month, values in monthly.get(chosen, {}).items()}
    quarterly = quarterly.get(chosen, {})
    for span, values in quarterly.items():
        start, end = span.split('..')
        months = months_between(start[:7], end[:7])
        lengths = {month: len(month_days(month)) for month in months}
        total_days = sum(lengths.values())
        for month in months:
            calendar.setdefault(month, statistics.median(values) * lengths[month] / total_days)
    return calendar


# ------------------------------------------------------------------- model --

def design(labels: list[dict], index: dict[str, dict], coverage: dict[str, float],
           min_days: int, market: dict[str, float] | None = None,
           groups: dict[str, str] | None = None) -> list[dict]:
    """Attach the shared log-offset x and the covariates to every label with an observed index."""
    rows = []
    for label in labels:
        observation = observation_row(label['family'], label.get('period_key', label['month']),
                                      label['class'], index, coverage, min_days, market, groups)
        if observation is None:
            continue
        rows.append({**observation, **label, 'log_y': math.log(label['amount_usd_m']),
                     'weight': HEDGED_WEIGHT if label.get('hedged') else 1.0})
    return rows


def observation_row(family: str, key: str, klass: str, index: dict,
                    coverage: dict[str, float], min_days: int,
                    market: dict | None = None, groups: dict | None = None) -> dict | None:
    """Shared training/inference features. No outcome value is required or read."""
    month = index.get(key)
    if month is None or month['observed_days'] < min(min_days, month['calendar_days']):
        return None
    mean = month['mean_daily'].get(family, 0.0)
    share = coverage.get(family)
    if mean <= 0 or not share or not 0 < share <= 1:
        return None
    market = market or {}
    market_centre = statistics.fmean(math.log(v) for v in market.values()) if market else 0.0
    positive_shares = [v for v in coverage.values() if v and v > 0]
    coverage_centre = statistics.median(math.log(v) for v in positive_shares) if positive_shares else 0.0
    features = features_for(month, family, mean, market, market_centre)
    features['log_index_net'] = features['log_index'] if klass == 'net' else 0.0
    features['log_coverage'] = math.log(share) - coverage_centre
    return {'family': family, 'month': month_key(month), 'class': klass,
            'x': math.log(mean / share) + math.log(month['calendar_days'] / FIT_MONTH_DAYS),
            'features': features, 'group': (groups or {}).get(family)}


def features_for(month: dict, family: str, mean_daily: float,
                 market: dict[str, float], market_centre: float) -> dict[str, float]:
    """Covariates for one label, by name.

    The log size is centred inside the fit on the training rows, so a model
    never learns the centre from months it is asked to predict. The market
    ratio is centred on the published calendar itself and is zero for a month
    with no published total, which is "no information", not "average". The
    volatility is log(peak day / mean day) of the grossing index, zero when
    the peak is unknown; the iOS share is centred on one half so an unknown
    share is also zero.
    """
    free = month.get('mean_daily_free', {}).get(family, 0.0)
    free_ratio = math.log1p(free / mean_daily) if mean_daily > 0 and free > 0 else 0.0
    total = market.get(month_key(month))
    log_market = math.log(total) - market_centre if total else 0.0
    peak = month.get('max_daily', {}).get(family, 0.0)
    volatility = math.log(peak / mean_daily) if mean_daily > 0 and peak > mean_daily else 0.0
    ios_share = month.get('ios_share', {}).get(family)
    key = month_key(month)
    trend = ((int(key[:4]) - 2025) * 12 + int(key[5:7]) - 12) / 12.0 if key else 0.0
    observed = month.get('observed_days') or 0
    top_share = month.get('top_days', {}).get(family, 0) / observed if observed else 0.0
    mass = month.get('chart_mass')
    return {'log_index': math.log(mean_daily), 'free_ratio': free_ratio, 'log_market': log_market,
            'volatility': volatility, 'ios_share': (ios_share - 0.5) if ios_share is not None else 0.0,
            'trend': trend, 'log_index_net': 0.0,
            # share of the period's days spent at rank 1 on some chart: the top
            # of a chart is censored, so a game that sits there earns more than
            # its rank says (Honor of Kings at $130m and $190m is rank 1 both times)
            'top_share': top_share,
            # log of the month's total index over every family: the market-share
            # formulation (revenue = market x index share) says a month with more
            # chart mass pays less per index unit
            'log_chart_mass': math.log(mass) if mass else 0.0,
            # filled in by `design`, which knows the family's coverage share
            'log_coverage': 0.0,
            **{f'share_{code}': month.get('country_shares', {}).get(family, {}).get(code, 0.0)
                for code in ('CN', 'JP', 'KR', 'TW')},
            'active_fraction': month.get('active_days', {}).get(family, 0) / observed if observed else 0.0}


def month_key(month: dict) -> str:
    return month.get('month', '')


def fit_shrunk(rows: list[dict], lam: float, feature_lam: float = math.inf,
               huber_delta: float = math.inf, group_lam: float = math.inf,
               feature_names: list[str] | None = None, half_life: float = math.inf,
               class_weights: dict[str, float] | None = None, iterations: int = 8,
               game_slope_feature: str | None = None, game_slope_lam: float = math.inf) -> dict:
    """Class scales, covariates, group terms and shrunk per-game terms, as one ridge fit.

    Minimises, over the labels with r = log y - x,
        sum w[age] * w[class] * rho(r - logS[class] - beta.f - u[group] - b[game])
        + feature_lam * |beta|^2 + group_lam * sum u[group]^2 + lambda * sum b[game]^2,
    where rho is squared error, or the Huber loss with knee `huber_delta` in
    log units solved by iteratively reweighted least squares, w[age] is
    0.5 ** (months before the latest training month / half_life), one when the
    half-life is inf, and w[class] is the weight given to a label class
    (default one; a class at zero is dropped from the fit entirely, so the
    game's label count does not include it). The game penalty is what identifies the split between a
    shared scale and the game terms: with a single class and no covariates it
    gives b[g] = n/(n+lambda) times the game's mean residual around the scale.
    A group term (the developer) sits between the scale and the game: a game
    with no label of its own is still priced with its developer's term when a
    sibling has labels. Only the covariates in `feature_names` (default the
    base three) enter. The scales are never penalised. Each penalty at inf
    removes its terms. An optional game-specific slope multiplies the supplied
    training-centred feature and has its own ridge penalty. An unseen game has
    zero slope deviation from the pooled response.
    """
    import numpy as np

    class_weights = class_weights or {}
    rows = [row for row in rows if class_weights.get(row['class'], 1.0) > 0]
    classes = sorted({row['class'] for row in rows})
    games = sorted({row['family'] for row in rows})
    counts = {game: sum(1 for row in rows if row['family'] == game) for game in games}
    names = list(feature_names) if feature_names is not None else list(BASE_FEATURES)
    use_games = lam != math.inf
    use_features = feature_lam != math.inf and bool(names) and all('features' in row for row in rows)
    use_groups = group_lam != math.inf
    use_slopes = game_slope_feature is not None and game_slope_lam != math.inf
    groups = sorted({row['group'] for row in rows if row.get('group')}) if use_groups else []
    n_features = len(names) if use_features else 0
    centre = statistics.fmean(row['features']['log_index'] for row in rows) if use_features else 0.0
    class_col = {klass: i for i, klass in enumerate(classes)}
    feature_col = {name: len(classes) + i for i, name in enumerate(names)} if use_features else {}
    group_col = {group: len(classes) + n_features + i for i, group in enumerate(groups)}
    base = len(classes) + n_features + len(group_col)
    game_col = ({game: base + i for i, game in enumerate(games)} if use_games else {})
    slope_col = ({game: base + len(game_col) + i for i, game in enumerate(games)} if use_slopes else {})
    width = base + len(game_col) + len(slope_col)
    penalties = n_features + len(group_col) + len(game_col) + len(slope_col)
    design_rows = np.zeros((len(rows) + penalties, width))
    target = np.zeros(len(rows) + penalties)
    for i, row in enumerate(rows):
        design_rows[i, class_col[row['class']]] = 1.0
        if use_features:
            for name, col in feature_col.items():
                design_rows[i, col] = row['features'][name] - (centre if name == 'log_index' else 0.0)
        if use_groups and row.get('group') in group_col:
            design_rows[i, group_col[row['group']]] = 1.0
        if use_games:
            design_rows[i, game_col[row['family']]] = 1.0
        if use_slopes:
            design_rows[i, slope_col[row['family']]] = row['features'][game_slope_feature]
        target[i] = row['log_y'] - row['x']
    offset = len(rows)
    for col in feature_col.values():  # ridge rows: sqrt(feature_lam) * beta = 0
        design_rows[offset, col] = math.sqrt(feature_lam)
        offset += 1
    for col in group_col.values():  # ridge rows: sqrt(group_lam) * u[group] = 0
        design_rows[offset, col] = math.sqrt(group_lam)
        offset += 1
    for col in game_col.values():  # ridge rows: sqrt(lambda) * b[game] = 0
        design_rows[offset, col] = math.sqrt(lam)
        offset += 1
    for col in slope_col.values():
        design_rows[offset, col] = math.sqrt(game_slope_lam)
        offset += 1
    recency = np.ones(len(rows) + penalties)
    latest = max(row['month'] for row in rows) if rows else ''
    for i, row in enumerate(rows):
        if half_life != math.inf:
            recency[i] = 0.5 ** ((len(months_between(row['month'], latest)) - 1) / half_life)
        recency[i] *= class_weights.get(row['class'], 1.0) * row.get('weight', 1.0)

    def solve(weights: 'np.ndarray') -> 'np.ndarray':
        root = np.sqrt(weights)[:, None]
        return np.linalg.lstsq(design_rows * root, target * root[:, 0], rcond=None)[0]

    weights = recency.copy()
    solution = solve(weights)
    if huber_delta != math.inf:
        for _ in range(iterations):
            residual = target[:len(rows)] - design_rows[:len(rows)] @ solution
            weights[:len(rows)] = recency[:len(rows)] * np.minimum(1.0, huber_delta / np.maximum(np.abs(residual), 1e-12))
            solution = solve(weights)
    return {'log_scale': {klass: float(solution[col]) for klass, col in class_col.items()},
            'beta': {name: float(solution[col]) for name, col in feature_col.items()},
            'feature_names': names if use_features else [],
            'centre': centre,
            'u': {group: float(solution[col]) for group, col in group_col.items()},
            'b': {game: float(solution[game_col[game]]) if use_games else 0.0 for game in games},
            'labels_per_game': counts, 'lambda': lam, 'feature_lambda': feature_lam,
            'group_lambda': group_lam, 'huber_delta': huber_delta, 'half_life': half_life,
            'class_weights': dict(class_weights),
            **({'game_slope_feature': game_slope_feature, 'game_slope_lambda': game_slope_lam,
                'game_slopes': {game: float(solution[col]) for game, col in slope_col.items()}}
               if use_slopes else {}),
            'downweighted_labels': (int((weights[:len(rows)] < recency[:len(rows)]).sum())
                                    if huber_delta != math.inf else 0)}


def predict(row: dict, model: dict) -> float | None:
    log_scale = model['log_scale'].get(row['class'])
    if log_scale is None:
        return None
    value = row['x'] + log_scale + model['b'].get(row['family'], 0.0)
    value += model.get('u', {}).get(row.get('group') or '', 0.0)
    if model.get('beta') and 'features' in row:
        value += sum(beta * (row['features'][name] - (model['centre'] if name == 'log_index' else 0.0))
                     for name, beta in model['beta'].items())
    if model.get('game_slopes'):
        value += model['game_slopes'].get(row['family'], 0.0) * row['features'][model['game_slope_feature']]
    return value


def pct_error(log_pred: float, log_y: float) -> float:
    return (math.exp(log_pred - log_y) - 1) * 100


def training_before(rows: list[dict], month: str, as_of: str | None = None) -> list[dict]:
    """A period must have ended, and a supplied publication date must be known."""
    boundary = month + '-01'
    cutoff = as_of or boundary
    return [row for row in rows
            if (row['period_end'] if 'period_end' in row else month_days(row['month'])[-1]) < boundary
            and ('available_on' not in row or
                 bool(row['available_on']) and row['available_on'] <= cutoff)]


def rolling(rows: list[dict], lam: float, feature_lam: float = math.inf,
            huber_delta: float = math.inf, group_lam: float = math.inf,
            feature_names: list[str] | None = None, half_life: float = math.inf,
            class_weights: dict[str, float] | None = None) -> list[dict]:
    """Predict every month from the months strictly before it."""
    months = sorted({row['month'] for row in rows})
    results = []
    for k in range(1, len(months)):
        train = training_before(rows, months[k])
        test = [row for row in rows if row['month'] == months[k]]
        if not train:
            continue
        model = fit_shrunk(train, lam, feature_lam, huber_delta, group_lam, feature_names, half_life, class_weights)
        class_counts: dict[str, int] = {}
        for row in train:
            if (class_weights or {}).get(row['class'], 1.0) > 0:
                class_counts[row['class']] = class_counts.get(row['class'], 0) + 1
        for row in test:
            if class_counts.get(row['class'], 0) < MIN_CLASS_LABELS:
                continue
            log_pred = predict(row, model)
            if log_pred is None:
                continue
            results.append({'month': row['month'], 'family': row['family'], 'class': row['class'],
                            'training_months': k, 'prior_labels': model['labels_per_game'].get(row['family'], 0),
                            'group_seen': bool(row.get('group')) and row['group'] in model.get('u', {}),
                            'published_usd_m': row['amount_usd_m'],
                            'predicted_usd_m': math.exp(log_pred),
                            'error_pct': pct_error(log_pred, row['log_y'])})
    return results


def summarise(results: list[dict]) -> dict:
    errors = sorted(abs(row['error_pct']) for row in results)
    if not errors:
        return {'labels': 0}
    log_errors = [math.log(row['predicted_usd_m'] / row['published_usd_m']) for row in results]
    return {'labels': len(errors), 'median_abs_error_pct': statistics.median(errors),
            'p75_abs_error_pct': errors[int(0.75 * (len(errors) - 1))],
            'within_25_pct': sum(1 for value in errors if value <= 25),
            'mae_log': statistics.fmean(abs(value) for value in log_errors),
            'rmse_log': math.sqrt(statistics.fmean(value ** 2 for value in log_errors))}


def learning_curve(results: list[dict]) -> dict:
    by_month = {}
    for month in sorted({row['month'] for row in results}):
        rows = [row for row in results if row['month'] == month]
        by_month[month] = {'training_months': rows[0]['training_months'], **summarise(rows),
                           'seen_games': summarise([row for row in rows if row['prior_labels'] > 0]),
                           'unseen_games': summarise([row for row in rows if row['prior_labels'] == 0])}
    buckets = {}
    for low, high, name in ((0, 0, '0'), (1, 1, '1'), (2, 2, '2'), (3, 4, '3-4'), (5, 99, '5+')):
        rows = [row for row in results if low <= row['prior_labels'] <= high]
        buckets[name] = summarise(rows)
    unseen = [row for row in results if row['prior_labels'] == 0]
    return {'by_month': by_month, 'by_prior_labels': buckets,
            'unseen_games_by_group': {
                'developer_seen': summarise([row for row in unseen if row.get('group_seen')]),
                'developer_unseen': summarise([row for row in unseen if not row.get('group_seen')])}}


# -------------------------------------------------------------------- main --

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metric', default='consumer_spend', choices=('consumer_spend', 'downloads'),
                        help='consumer_spend reads the grossing charts against published revenue; downloads reads '
                             'the free charts against published install counts with the download market table')
    parser.add_argument('--market', default='', help='market weight table; default depends on --metric')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-4day-2026-09-12b.json',
                        help='five-market coverage share per family, measured on four all-country days (Sep 8, 9, '
                             '11, 12) with the current identity table (every family covered, no fallback median). '
                             'Re-run coverage_share.py on the same days whenever identities.json changes: the '
                             '2026-09-12 refresh after the Uma Musume regional editions took the same 204 rolling '
                             'rows from mae 0.1114 to 0.1054, and the fourth day 0.1001 to 0.0989')
    parser.add_argument('--first-day', default=FIRST_IDENTIFIED_DAY)
    parser.add_argument('--last-day', default=date.today().isoformat())
    parser.add_argument('--min-days', type=int, default=15)
    parser.add_argument('--grid', default='', help='JSON object overriding the parameter grid')
    parser.add_argument('--lambdas', default='', help='comma-separated shrinkage weights to try')
    parser.add_argument('--feature-lambdas', default='',
                        help='comma-separated ridge weights for the covariate coefficients')
    parser.add_argument('--huber-deltas', default='',
                        help='comma-separated Huber knees in log units; inf is squared error')
    parser.add_argument('--group-lambdas', default='',
                        help='comma-separated ridge weights for developer group terms; inf disables them')
    parser.add_argument('--half-lives', default='',
                        help='comma-separated recency half-lives in months; inf weights every label equally')
    parser.add_argument('--feature-sets', default='',
                        help='semicolon-separated covariate sets, each a comma list of covariate names')
    parser.add_argument('--score-classes', default='',
                        help='comma-separated label classes that selection and the reported errors are measured '
                             'on; every class still trains. Default: every class')
    parser.add_argument('--extra-class-weights', default='',
                        help='comma-separated weights tried for the label classes outside --score-classes; '
                             '0 drops them from the fit')
    parser.add_argument('--curve-only', action='store_true',
                        help='try only the option values given, without the "term switched off" baselines '
                             'that every run otherwise adds; for sweeping a large curve grid quickly')
    parser.add_argument('--full-grid', action='store_true',
                        help='validate every option combination at every curve point (the pre-2026-09-12 '
                             'behaviour, about 60x slower). Default: two stages - the curve grid with one fixed '
                             'option set, then every option combination at the best curve point only')
    parser.add_argument('--dictionary', default=str(DICTIONARY))
    parser.add_argument('--output', default='reports/rank-models/history-fit-2026-09-12.json')
    arguments = parser.parse_args()
    defaults = {'grid': DEFAULT_GRID, 'lambdas': DEFAULT_LAMBDAS, 'feature_lambdas': DEFAULT_FEATURE_LAMBDAS,
                'feature_sets': DEFAULT_FEATURE_SETS}
    if arguments.metric == 'downloads':
        METRIC.update(DOWNLOAD_METRIC)
        defaults = DOWNLOAD_DEFAULTS
        if arguments.coverage == parser.get_default('coverage'):
            arguments.coverage = DOWNLOAD_DEFAULTS['coverage']
        if not arguments.score_classes:
            arguments.score_classes = DOWNLOAD_DEFAULTS['score_classes']
    from coverage_share import use_market_table
    use_market_table(arguments.market or METRIC['market_table'])
    baseline = set() if arguments.curve_only else {math.inf}
    score_classes = {name for name in arguments.score_classes.split(',') if name}
    extra_weights = ([float(v) for v in arguments.extra_class_weights.split(',')]
                     if arguments.extra_class_weights else DEFAULT_EXTRA_CLASS_WEIGHTS)

    def keep(results: list[dict]) -> list[dict]:
        return [r for r in results if not score_classes or r['class'] in score_classes]

    grid = {**defaults['grid'], **(json.loads(arguments.grid) if arguments.grid else {})}
    lambdas = [float(v) for v in arguments.lambdas.split(',')] if arguments.lambdas else defaults['lambdas']
    feature_lambdas = ([float(v) for v in arguments.feature_lambdas.split(',')]
                       if arguments.feature_lambdas else defaults['feature_lambdas'])
    huber_deltas = ([float(v) for v in arguments.huber_deltas.split(',')]
                    if arguments.huber_deltas else DEFAULT_HUBER_DELTAS)
    group_lambdas = ([float(v) for v in arguments.group_lambdas.split(',')]
                     if arguments.group_lambdas else DEFAULT_GROUP_LAMBDAS)
    half_lives = ([float(v) for v in arguments.half_lives.split(',')] if arguments.half_lives
                  else defaults.get('half_lives', DEFAULT_HALF_LIVES))
    feature_sets = ([[name for name in group.split(',') if name] for group in arguments.feature_sets.split(';')]
                    if arguments.feature_sets else defaults['feature_sets'])
    unknown = {name for names in feature_sets for name in names} - set(FEATURE_NAMES)
    if unknown:
        raise SystemExit(f'Unknown covariates {sorted(unknown)}; known: {FEATURE_NAMES}')
    _, family_names = identity_families()
    names = set(family_names)

    all_rows = ledger_rows()
    sources = json.loads((ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    labels, conflicts = collect_labels(all_rows, names, sources)
    labels, cross_check = cross_class_check(labels)
    market = market_calendar(all_rows)
    groups = family_groups(names, Path(arguments.dictionary))
    coverage_report = json.loads((ROOT / arguments.coverage).read_text(encoding='utf-8'))
    coverage, fallback_games = {}, []
    measured = []
    for family in names:
        try:
            coverage[family] = coverage_for(coverage_report, family)
            measured.append(coverage[family])
        except KeyError:
            fallback_games.append(family)
    fallback = statistics.median(measured)
    for family in fallback_games:
        coverage[family] = fallback

    payloads = load_payloads(arguments.first_day, arguments.last_day)
    if not payloads:
        raise SystemExit('No history days with best ranks in the requested window')

    extra_classes = sorted({label['class'] for label in labels} - score_classes) if score_classes else []
    weightings = ([{klass: weight for klass in extra_classes} for weight in sorted(set(extra_weights))]
                  if extra_classes else [{}])
    trials = []
    points = [dict(zip(grid, values)) for values in product(*grid.values())]
    tables, table_names = rank_tables(payloads)
    design_cache: dict[str, list[dict]] = {}

    def rows_for(point: dict) -> list[dict]:
        key = json.dumps(point, sort_keys=True)
        if key not in design_cache:
            index = monthly_index_fast(payloads, tables, table_names, curve_params(point), label_periods(labels))
            design_cache[key] = design(labels, index, coverage, arguments.min_days, market, groups)
        return design_cache[key]

    def run_trials(point: dict, option_sets: list[tuple]) -> None:
        rows = rows_for(point)
        for lam, feature_lam, names, delta, group_lam, half_life, class_weights in option_sets:
            results = rolling(rows, lam, feature_lam, delta, group_lam, names, half_life, class_weights)
            trials.append({'point': point, 'lambda': lam, 'feature_lambda': feature_lam,
                           'features': names, 'huber_delta': delta, 'group_lambda': group_lam,
                           'half_life': half_life, 'class_weights': class_weights,
                           'rows': len(rows), 'rolling': summarise(keep(results)),
                           '_results': results, '_rows': rows})

    covariate_options = ([(feature_lam, names) for feature_lam in feature_lambdas if feature_lam != math.inf
                          for names in feature_sets] + [(math.inf, [])] * (not arguments.curve_only))
    every_option = [(lam, feature_lam, names, delta, group_lam, half_life, class_weights)
                    for lam in sorted(set(lambdas) | baseline)
                    for feature_lam, names in covariate_options
                    for delta in sorted(set(huber_deltas) | baseline)
                    for group_lam in sorted(set(group_lambdas) | baseline)
                    for half_life in sorted(set(half_lives) | baseline)
                    for class_weights in weightings]
    # Stage one holds one option set fixed (the first value of each list, the
    # richest covariate set, extra classes off) while the curve grid is swept;
    # the curve and the options were found to be nearly independent, so this
    # loses nothing measurable and runs about 60x faster than the full product.
    stage_one = [(lambdas[0], feature_lambdas[0], feature_sets[-1], huber_deltas[0], group_lambdas[0], half_lives[0],
                  weightings[0])]
    # --curve-only drops the switched-off baselines but keeps the two stages:
    # until 2026-09-13 it also forced the full product, so a 243-point curve
    # sweep took 24 minutes instead of about two.
    if arguments.full_grid or len(points) == 1:
        for point in points:
            run_trials(point, every_option)
        stage_one_best = None
    else:
        for point in points:
            run_trials(point, stage_one)
        stage_one_best = min((t for t in trials if t['rolling'].get('labels')),
                             key=lambda t: (t['rolling']['mae_log'], t['rolling']['rmse_log']))
        run_trials(stage_one_best['point'], every_option)
    # Mean absolute log error uses every label without letting a few event
    # months dominate the way rmse does, and does not jump between neighbouring
    # trials the way the median alone does; rmse breaks ties. (rmse-first
    # selection on 2026-09-12 chose a model whose tail was better but whose
    # typical error was a point worse on the same labels.)
    scored = [trial for trial in trials if trial['rolling'].get('labels')]
    best = min(scored, key=lambda trial: (trial['rolling']['mae_log'], trial['rolling']['rmse_log']))

    def show(value: float) -> float | str:
        return value if value != math.inf else 'inf'

    def describe(trial: dict) -> dict:
        return {'lambda': show(trial['lambda']), 'feature_lambda': show(trial['feature_lambda']),
                'features': trial['features'], 'huber_delta': show(trial['huber_delta']),
                'group_lambda': show(trial['group_lambda']), 'half_life': show(trial['half_life']),
                'class_weights': trial['class_weights']}

    def split(results: list[dict]) -> dict:
        unseen = [r for r in results if r['prior_labels'] == 0]
        return {'rolling': summarise(results), 'unseen_games': summarise(unseen),
                'unseen_games_with_seen_developer': summarise([r for r in unseen if r.get('group_seen')]),
                'seen_games': summarise([r for r in results if r['prior_labels'] > 0])}

    def ablation(use_games: bool, use_features: bool, use_huber: bool | None = None,
                 use_groups: bool | None = None, use_recency: bool | None = None,
                 features: list[str] | None = None, use_extra: bool | None = None) -> dict:
        """Best trial at the chosen curve point with the given terms switched on or off."""
        pool = [t for t in trials if t['point'] == best['point']
                and (t['lambda'] != math.inf) == use_games and (t['feature_lambda'] != math.inf) == use_features
                and (use_huber is None or (t['huber_delta'] != math.inf) == use_huber)
                and (use_groups is None or (t['group_lambda'] != math.inf) == use_groups)
                and (use_recency is None or (t['half_life'] != math.inf) == use_recency)
                and (features is None or t['features'] == features)
                and (use_extra is None or any(w > 0 for w in t['class_weights'].values()) == use_extra)]
        if not pool:  # the requested switch was not in this run's grid
            return {'not_tried': True, 'rolling': {}, 'unseen_games': {}, 'unseen_games_with_seen_developer': {},
                    'seen_games': {}}
        chosen = min(pool, key=lambda t: (t['rolling'].get('mae_log', math.inf), t['rolling'].get('rmse_log', math.inf)))
        return {**describe(chosen), **split(keep(chosen['_results']))}

    ablations = {} if arguments.curve_only else {
                 'scale_only': ablation(False, False), 'game_terms_only': ablation(True, False),
                 'covariates_only': ablation(False, True), 'game_terms_and_covariates': ablation(True, True),
                 'game_terms_and_covariates_squared_loss': ablation(True, True, False),
                 'game_terms_and_covariates_huber': ablation(True, True, True),
                 'without_developer_groups': ablation(True, True, None, False),
                 'with_developer_groups': ablation(True, True, None, True),
                 'without_recency': ablation(True, True, None, None, False),
                 'with_recency': ablation(True, True, None, None, True)}
    for names in feature_sets if not arguments.curve_only else []:
        ablations['covariates_' + '+'.join(names)] = ablation(True, True, None, None, None, names)
    if extra_classes and not arguments.curve_only:
        ablations['without_extra_classes'] = ablation(True, True, None, None, None, None, False)
        ablations['with_extra_classes'] = ablation(True, True, None, None, None, None, True)

    # Near-best ensemble: the error surface is flat around the optimum, so the
    # single winner is partly a noise pick. The ENSEMBLE_SIZE trials with the
    # lowest rolling rmse_log are averaged in log space on the labels every
    # member predicted, and scored like any other candidate.
    members = sorted(scored, key=lambda t: (t['rolling']['mae_log'], t['rolling']['rmse_log']))[:ENSEMBLE_SIZE]
    pooled: dict[tuple, list[dict]] = {}
    for member in members:
        for r in keep(member['_results']):
            pooled.setdefault((r['month'], r['family'], r['class']), []).append(r)
    ensemble_results = []
    for rows_for_label in pooled.values():
        if len(rows_for_label) < len(members):
            continue
        log_pred = statistics.fmean(math.log(r['predicted_usd_m']) for r in rows_for_label)
        first = rows_for_label[0]
        ensemble_results.append({**first, 'predicted_usd_m': math.exp(log_pred),
                                 'error_pct': pct_error(log_pred, math.log(first['published_usd_m']))})
    ensemble = {'size': len(members), 'members': [{'point': m['point'], **describe(m),
                                                   'rmse_log': m['rolling']['rmse_log']} for m in members],
                **split(ensemble_results),
                'beats_single_best': (bool(ensemble_results)
                                      and summarise(ensemble_results)['mae_log'] < best['rolling']['mae_log'])}

    final = fit_shrunk(best['_rows'], best['lambda'], best['feature_lambda'], best['huber_delta'],
                       best['group_lambda'], best['features'], best['half_life'], best['class_weights'])
    in_sample = []
    for row in best['_rows']:
        log_pred = predict(row, final)
        if log_pred is None:  # a class the chosen weighting dropped from the fit
            continue
        in_sample.append({'family': row['family'], 'month': row['month'], 'class': row['class'],
                          'published_usd_m': row['amount_usd_m'], 'predicted_usd_m': math.exp(log_pred),
                          'error_pct': pct_error(log_pred, row['log_y'])})
    rolling_errors = sorted(abs(math.log(r['predicted_usd_m'] / r['published_usd_m'])) for r in keep(best['_results']))
    band_factor = math.exp(rolling_errors[int(0.8 * (len(rolling_errors) - 1))]) if rolling_errors else None

    scales = {klass: math.exp(value) for klass, value in final['log_scale'].items()}
    report = {
        'schema_version': 1, 'production_enabled': False,
        'observation': 'history/*.json bestRanks, five markets, best rank of the day',
        'window': {'first_day': min(payloads), 'last_day': max(payloads), 'days': len(payloads)},
        'labels': {'total': len(labels), 'fitted': best['rows'],
                   'by_class': {klass: sum(1 for row in best['_rows'] if row['class'] == klass)
                                for klass in sorted({row['class'] for row in best['_rows']})},
                   'by_month': {month: sum(1 for row in best['_rows'] if row['month'] == month)
                                for month in sorted({row['month'] for row in best['_rows']})},
                   'conflicts_over_10_pct': conflicts,
                   'cross_class_check': cross_check,
                   'developer_groups': {name: groups[name] for name in sorted(groups)},
                   'coverage_fallback_games': sorted(fallback_games), 'coverage_fallback_share': fallback},
        'market_calendar': {'months': dict(sorted(market.items())),
                            'meaning': 'published worldwide two-store monthly totals in USD million; quarter '
                                       'totals spread by calendar days; months absent here enter the fit with '
                                       'a zero market ratio'},
        'validation_status': 'retrospective_model_selection_not_independent_service_accuracy',
        'validation_limitations': [
            'Coverage and market tables are not historical as-of vintages.',
            'The same rolling outcomes select hyperparameters and report error.',
            'Cross-class filtering uses the full label corpus.',
            'Published dates gate training; later revisions are not reconstructed per fold.',
        ],
        'selection': {'grid': grid, 'lambdas': lambdas, 'feature_lambdas': feature_lambdas,
                      'huber_deltas': [show(v) for v in huber_deltas],
                      'group_lambdas': [show(v) for v in group_lambdas],
                      'half_lives': [show(v) for v in half_lives], 'feature_sets': feature_sets,
                      'mode': 'full_grid' if arguments.full_grid else 'curve_only' if arguments.curve_only else 'two_stage',
                      'stage_one_point': stage_one_best['point'] if stage_one_best else None,
                      'score_classes': sorted(score_classes) or 'all', 'extra_classes': extra_classes,
                      'extra_class_weights': sorted(set(extra_weights)) if extra_classes else [],
                      'trials': len(trials),
                      'rule': 'lowest rolling mean absolute log error, then rolling rmse_log'},
        'chosen': {'params': curve_params(best['point']), **describe(best), 'rolling': best['rolling']},
        'ablations_at_chosen_point': ablations,
        'ensemble_of_near_best': ensemble,
        'learning_curve': learning_curve(keep(best['_results'])),
        'final_fit': {'scales_usd_m_per_index': scales,
                      'net_over_gross_scale': (scales['net'] / scales['gross']) if {'net', 'gross'} <= scales.keys() else None,
                      'covariates': {name: {'beta': value} for name, value in final.get('beta', {}).items()},
                      'covariate_meaning': 'log_index: elasticity of the label to index size minus one '
                                           '(0 = proportional); free_ratio: effect per unit of '
                                           'log(1 + free index / grossing index); log_market: elasticity to '
                                           'the published monthly market total (1 = fully proportional); '
                                           'volatility: effect per unit of log(peak day / mean day); '
                                           'ios_share: effect per unit of (iOS share of the index - 0.5)',
                      'huber_downweighted_labels': final.get('downweighted_labels', 0),
                      'developer_terms': {group: {'u': value, 'multiplier': math.exp(value),
                                                  'games': sorted(g for g, gr in groups.items() if gr == group)}
                                          for group, value in sorted(final.get('u', {}).items(),
                                                                     key=lambda kv: -abs(kv[1]))},
                      'game_terms': {game: {'labels': final['labels_per_game'][game], 'b': value,
                                            'multiplier': math.exp(value)}
                                     for game, value in sorted(final['b'].items(), key=lambda kv: -abs(kv[1]))},
                      'in_sample': summarise([{**row} for row in in_sample]),
                      'band_factor_p80': band_factor,
                      'band_meaning': 'multiplicative factor covering 80% of rolling next-month errors; '
                                      'not a confidence interval for unlabelled games'},
        'trial_table': sorted(({'point': t['point'], **describe(t),
                                'labels': t['rolling'].get('labels'),
                                'median_abs_error_pct': t['rolling'].get('median_abs_error_pct'),
                                'mae_log': t['rolling'].get('mae_log'),
                                'rmse_log': t['rolling'].get('rmse_log')} for t in trials),
                              key=lambda t: (t['median_abs_error_pct'] is None, t['median_abs_error_pct'] or 0)),
        'rolling_rows': sorted(keep(best['_results']), key=lambda r: (r['month'], -r['published_usd_m'])),
        'in_sample_rows': sorted(in_sample, key=lambda r: (r['month'], -r['published_usd_m'])),
    }
    path = ROOT / arguments.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'days={len(payloads)} labels={len(labels)} fitted={best["rows"]} trials={len(trials)}')
    print(f'labels after cross-class check={len(labels)} excluded pairs={len(cross_check.get("excluded", []))} '
          f'groups={len(groups)}')
    print(f'chosen {best["point"]} {describe(best)} rolling={best["rolling"]}')
    for name, row in {**ablations, 'ensemble_of_near_best': ensemble}.items():
        if row.get('not_tried'):
            continue
        dev = row['unseen_games_with_seen_developer']
        print(f'  {name:<40} mae={row["rolling"].get("mae_log", 0):.3f} rmse={row["rolling"].get("rmse_log", 0):.3f} '
              f'median={row["rolling"].get("median_abs_error_pct", 0):.1f}% '
              f'seen={row["seen_games"].get("median_abs_error_pct", 0):.1f}% '
              f'unseen={row["unseen_games"].get("median_abs_error_pct", 0):.1f}% (n={row["unseen_games"].get("labels")}) '
              f'unseen+dev={dev.get("median_abs_error_pct", 0):.1f}% (n={dev.get("labels")})')
    print('covariates:', {k: round(v['beta'], 3) for k, v in report['final_fit']['covariates'].items()},
          'market months:', len(market))
    print('developer terms:', {k: (round(v['multiplier'], 2), len(v['games']))
                               for k, v in list(report['final_fit']['developer_terms'].items())[:8]})
    print('learning curve by month:')
    for month, row in report['learning_curve']['by_month'].items():
        print(f'  {month} train={row["training_months"]} n={row["labels"]} median={row["median_abs_error_pct"]:.1f}% '
              f'seen={row["seen_games"].get("median_abs_error_pct")} unseen={row["unseen_games"].get("median_abs_error_pct")}')
    print('by prior labels:', {k: (v.get('labels'), round(v['median_abs_error_pct'], 1) if v.get('labels') else None)
                               for k, v in report['learning_curve']['by_prior_labels'].items()})
    print('scales', scales, 'net/gross', report['final_fit']['net_over_gross_scale'])
    print('largest game terms:')
    for game, row in list(report['final_fit']['game_terms'].items())[:12]:
        print(f'  {game[:26]:<26} n={row["labels"]} x{row["multiplier"]:.2f}')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
