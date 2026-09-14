"""Estimate the rank-to-payment curve from labelled August observations.

Research only: nothing here is applied to production. Amounts stay as published;
net rows are never divided by a fee factor. Instead each (source, fee basis,
geography) class carries its own multiplicative scale, so a net-basis list can
inform the curve shape without being converted into gross spending.
"""
from __future__ import annotations

import itertools
import json
import hashlib
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

RANKS = np.arange(1, 201, dtype=float)
CENSORED_RANK = 200.0


@dataclass(frozen=True)
class Design:
    """Observation counts that make the index a fast function of the parameters."""

    histogram: np.ndarray      # games x charts x 200 observed-rank counts
    absent: np.ndarray         # games x charts snapshots without the game
    appeared: np.ndarray       # games x charts: the game held a rank at least once
    snapshots: np.ndarray      # charts: observed snapshot count
    weights: np.ndarray        # charts: country x store market proxy weight
    is_ios: np.ndarray         # charts: App Store flag
    countries: list[str]
    games: list[str]
    depths: list                # charts: returned depth per snapshot
    stores: list                # charts: app_store / google_play
    # Per-design memo. Keying a module-level cache by id() would let a freed design
    # hand its matrices to an unrelated one that reuses the same address.
    cache: dict = field(default_factory=dict, compare=False, repr=False)


def build_design(panel: dict) -> Design:
    games = [game['key'] for game in panel['games']]
    charts = panel['charts']
    histogram = np.zeros((len(games), len(charts), 200))
    absent = np.zeros((len(games), len(charts)))
    snapshots = np.zeros(len(charts))
    depths = []
    for c, chart in enumerate(charts):
        snapshots[c] = len(chart['observations'])
        depths.append(np.array([observation['depth'] for observation in chart['observations']], dtype=int))
        for observation in chart['observations']:
            for g, rank in enumerate(observation['ranks']):
                if rank is None:
                    absent[g, c] += 1
                else:
                    histogram[g, c, int(rank) - 1] += 1
    if not snapshots.all():
        raise ValueError('A chart without observations cannot enter the design')
    return Design(
        histogram=histogram, absent=absent, appeared=histogram.sum(axis=2) > 0, snapshots=snapshots,
        weights=np.array([chart['annualMarketProxyUsd'] for chart in charts], dtype=float),
        is_ios=np.array([chart['store'] == 'app_store' for chart in charts]),
        countries=[chart['country'] for chart in charts], games=games,
        depths=depths, stores=[chart['store'] for chart in charts])


def chart_mass(design: Design, alpha_ios: float, alpha_aos: float, alpha_cn: float | None = None) -> np.ndarray:
    """Mean total rank weight a chart carries, independent of which apps hold the ranks."""
    key = ('mass', alpha_ios, alpha_aos, alpha_cn)
    cached = design.cache.get(key)
    if cached is not None:
        return cached
    alphas = chart_alphas(design, alpha_ios, alpha_aos, alpha_cn)
    cumulative = {alpha: np.concatenate(([0.0], np.cumsum(RANKS ** -alpha))) for alpha in set(alphas)}
    masses = np.array([float(np.mean(cumulative[alpha][depth]))
                       for depth, alpha in zip(design.depths, alphas)])
    design.cache[key] = masses
    return masses


def market_selector(design: Design, market_totals: list) -> tuple:
    """Rows picking each published total's charts, so predictions batch as a matrix product."""
    rows, published = [], []
    for total in market_totals:
        selector = np.array([country == total['geography'] and store in total['stores']
                             for country, store in zip(design.countries, design.stores)], dtype=float)
        if not selector.any():
            continue
        rows.append(selector)
        published.append(total['amount_usd_million'])
    if not rows:
        return np.zeros((0, len(design.countries))), np.zeros(0)
    return np.array(rows), np.array(published)


def market_penalty_batch(design, alpha_ios, alpha_aos, weight_matrix, market_totals,
                         alpha_cn=None) -> np.ndarray:
    """Market-total log ratio error for every weight column at once."""
    selector, published = market_selector(design, market_totals)
    if not selector.size:
        return np.zeros(weight_matrix.shape[1])
    masses = chart_mass(design, alpha_ios, alpha_aos, alpha_cn)
    predicted = selector @ (weight_matrix * (design.weights * masses)[:, None])
    if not np.all(predicted > 0):
        return np.full(weight_matrix.shape[1], np.inf)
    offset = np.log(published)[:, None] - np.log(predicted)
    centred = offset - offset.mean(axis=0, keepdims=True)   # one free market scale
    return np.sqrt(np.mean(centred ** 2, axis=0))


def market_residuals(design: Design, params: dict, market_totals: list) -> np.ndarray:
    """Log residuals of published country market totals under one shared market scale.

    Chart mass does not depend on which apps hold the ranks, so these totals
    identify the relative country weights that game labels alone leave loose.
    """
    if not market_totals:
        return np.array([])
    masses = chart_mass(design, params['alpha_ios'], params['alpha_aos'], params.get('alpha_cn'))
    multipliers = np.ones(len(design.countries))
    for country, value in params.get('country_multipliers', {}).items():
        multipliers[[i for i, code in enumerate(design.countries) if code == country]] = value
    predicted, published = [], []
    for row in market_totals:
        columns = [index for index, (country, store) in enumerate(zip(design.countries, design.stores))
                   if country == row['geography'] and store in row['stores']]
        if not columns:
            continue
        value = float(np.sum(design.weights[columns] * multipliers[columns] * masses[columns]))
        if value <= 0:
            continue
        predicted.append(value)
        published.append(row['amount_usd_million'])
    if not predicted:
        return np.array([])
    offset = np.log(published) - np.log(predicted)
    return offset - offset.mean()      # one free market scale, so only ratios are scored


def chart_alphas(design: Design, alpha_ios: float, alpha_aos: float, alpha_cn: float | None) -> np.ndarray:
    """Per-chart exponent: per store, and optionally a separate one for China."""
    alphas = np.where(design.is_ios, alpha_ios, alpha_aos).astype(float)
    if alpha_cn is not None:
        alphas = np.where(np.array([code == 'CN' for code in design.countries]), alpha_cn, alphas)
    return alphas


def chart_index(design: Design, alpha_ios: float, alpha_aos: float, censored: float,
                censored_aos: float | None = None, alpha_cn: float | None = None,
                absence_scope: str = 'every_chart') -> np.ndarray:
    """Mean per-snapshot rank weight for every game and chart.

    Unobserved snapshots never contribute; absence below the returned depth
    contributes `censored` times the rank-200 weight instead of a fabricated rank.
    """
    alphas = chart_alphas(design, alpha_ios, alpha_aos, alpha_cn)
    weights = RANKS[None, :] ** -alphas[:, None]
    observed = np.einsum('gcr,cr->gc', design.histogram, weights)
    floor = CENSORED_RANK ** -alphas
    weight = np.where(design.is_ios, censored, censored if censored_aos is None else censored_aos)
    absent = design.absent
    if absence_scope == 'appeared':
        # Only charts the game was ever seen in; never appearing is then worth nothing.
        absent = absent * design.appeared
    elif absence_scope != 'every_chart':
        raise ValueError(f'Unknown absence scope: {absence_scope}')
    return (observed + absent * weight[None, :] * floor[None, :]) / design.snapshots[None, :]


def cached_chart_index(design: Design, alpha_ios: float, alpha_aos: float, censored: float,
                       censored_aos: float | None = None, alpha_cn: float | None = None,
                       absence_scope: str = 'every_chart') -> np.ndarray:
    key = (alpha_ios, alpha_aos, censored, censored_aos, alpha_cn, absence_scope)
    matrix = design.cache.get(key)
    if matrix is None:
        matrix = chart_index(design, alpha_ios, alpha_aos, censored, censored_aos, alpha_cn,
                             absence_scope)
        design.cache[key] = matrix
    return matrix


def model_index(design: Design, params: dict, scope_mask: np.ndarray) -> np.ndarray:
    per_chart = cached_chart_index(design, params['alpha_ios'], params['alpha_aos'], params['censored'],
                                   params.get('censored_aos'), params.get('alpha_cn'),
                                   params.get('absence_scope', 'every_chart'))
    multipliers = np.ones(len(design.countries))
    for country, value in params.get('country_multipliers', {}).items():
        multipliers[[i for i, code in enumerate(design.countries) if code == country]] = value
    index = per_chart @ (design.weights * multipliers * scope_mask)
    coverage = params.get('coverage')
    if coverage is not None and scope_mask.all():
        # Worldwide labels are compared against five markets only; dividing by the
        # measured five-market share of a game's index restores the missing markets.
        index = index / coverage
    return index


@dataclass(frozen=True)
class Labels:
    """Vectorised label arrays so cross-validation stays cheap enough to search."""

    records: list
    log_amount: np.ndarray
    game: np.ndarray
    klass: np.ndarray
    geography: list
    bound: np.ndarray          # 0 point, +1 published floor, -1 published ceiling
    class_names: list


def label_records(panel: dict) -> list[dict]:
    records = []
    for g, game in enumerate(panel['games']):
        for label in game['labels']:
            records.append({
                'game_index': g, 'game': game['key'], 'anchor_id': label['anchorId'],
                'amount': label['amountUsdMillion'], 'geography': label['geography'],
                'qualifier': label['qualifier'], 'fee_basis': label['feeBasis'],
                'klass': f"{label['sourceId']}|{label['feeBasis']}|{label['geography']}"
                         f"|{'+'.join(sorted(label['stores']))}",
            })
    if any(record['amount'] is None or record['amount'] <= 0 for record in records):
        raise ValueError('Every label needs a positive USD amount')
    return records


def prepare_labels(records: list[dict]) -> Labels:
    class_names = sorted({record['klass'] for record in records})
    class_index = {name: index for index, name in enumerate(class_names)}
    bound = {None: 0, 'more_than': 1, 'approximately': 0, 'less_than': -1, 'nearly': -1}
    return Labels(
        records=records,
        log_amount=np.array([math.log(record['amount']) for record in records]),
        game=np.array([record['game_index'] for record in records]),
        klass=np.array([class_index[record['klass']] for record in records]),
        geography=[record['geography'] for record in records],
        bound=np.array([bound[record['qualifier']] for record in records]),
        class_names=class_names)


def scope_masks(design: Design, records: list[dict]) -> dict:
    masks = {}
    for geography in {record['geography'] for record in records}:
        if geography == 'WW':
            masks[geography] = np.ones(len(design.countries))
        else:
            mask = np.array([code == geography for code in design.countries], dtype=float)
            if not mask.any():
                raise ValueError(f'No archived chart covers geography {geography}')
            masks[geography] = mask
    return masks


def residuals(records, indices, scales):
    """Signed log residuals, with published qualifiers treated as one-sided bounds."""
    out = []
    for record in records:
        index = indices[record['geography']][record['game_index']]
        if index <= 0 or record['klass'] not in scales:
            out.append(None)
            continue
        gap = math.log(record['amount']) - math.log(scales[record['klass']] * index)
        qualifier = record['qualifier']
        if qualifier == 'more_than':
            gap = max(0.0, gap)          # a floor is satisfied by any larger prediction
        elif qualifier in ('less_than', 'nearly'):
            gap = min(0.0, gap)          # a ceiling is satisfied by any smaller prediction
        out.append(gap)
    return out


def fit_scales(records, indices, exclude_game=None):
    sums, counts = {}, {}
    for record in records:
        if exclude_game is not None and record['game_index'] == exclude_game:
            continue
        index = indices[record['geography']][record['game_index']]
        if index <= 0:
            continue
        sums[record['klass']] = sums.get(record['klass'], 0.0) + math.log(record['amount']) - math.log(index)
        counts[record['klass']] = counts.get(record['klass'], 0) + 1
    return {klass: math.exp(value / counts[klass]) for klass, value in sums.items()}


def apply_bounds(gap: np.ndarray, bound: np.ndarray) -> np.ndarray:
    """A published floor or ceiling is only violated on one side."""
    gap = np.where(bound > 0, np.maximum(gap, 0.0), gap)
    return np.where(bound < 0, np.minimum(gap, 0.0), gap)


@dataclass(frozen=True)
class BatchPlan:
    """Fixed label bookkeeping reused by every batched parameter evaluation."""

    combined: np.ndarray
    class_count: np.ndarray
    game_class_count: np.ndarray
    identified: np.ndarray
    classes: int
    games: int


def batch_plan(design: Design, labels: Labels) -> BatchPlan:
    classes = len(labels.class_names)
    games = len(design.games)
    combined = labels.game * classes + labels.klass
    class_count = np.bincount(labels.klass, minlength=classes)
    game_class_count = np.bincount(combined, minlength=games * classes)
    identified = (class_count[labels.klass] - game_class_count[combined]) > 0
    return BatchPlan(combined=combined, class_count=class_count, game_class_count=game_class_count,
                     identified=identified, classes=classes, games=games)


def evaluate_batch(design, labels, masks, plan, alpha_ios, alpha_aos, censored,
                   multiplier_matrix, coverage=None, market_totals=None, market_weight=1.0,
                   countries=(), extras=None):
    """Cross-validated log RMSE for many country-multiplier columns at once.

    `multiplier_matrix` is charts x columns. Batching turns an exhaustive search
    from millions of small numpy calls into a handful of matrix products, so the
    search keeps grid-quality optima at interactive speed.
    """
    extras = extras or {}
    per_chart = cached_chart_index(design, alpha_ios, alpha_aos, censored,
                                   extras.get('censored_aos'), extras.get('alpha_cn'),
                                   extras.get('absence_scope', 'every_chart'))
    columns = multiplier_matrix.shape[1]
    indices = {}
    for geography, mask in masks.items():
        scaled = per_chart @ (multiplier_matrix * (design.weights * mask)[:, None])
        if coverage is not None and mask.all():
            scaled = scaled / coverage[:, None]
        indices[geography] = scaled
    per_label = np.empty((len(labels.records), columns))
    for position, (geography, game) in enumerate(zip(labels.geography, labels.game)):
        per_label[position] = indices[geography][game]
    if not np.all(per_label > 0):
        return np.full(columns, np.inf)
    offset = labels.log_amount[:, None] - np.log(per_label)
    class_sum = np.zeros((plan.classes, columns))
    np.add.at(class_sum, labels.klass, offset)
    game_class_sum = np.zeros((plan.games * plan.classes, columns))
    np.add.at(game_class_sum, plan.combined, offset)
    remaining_sum = class_sum[labels.klass] - game_class_sum[plan.combined]
    remaining_count = (plan.class_count[labels.klass] - plan.game_class_count[plan.combined])[:, None]
    with np.errstate(invalid='ignore', divide='ignore'):
        held_scale = remaining_sum / np.maximum(remaining_count, 1)
    gaps = apply_bounds(offset - held_scale, labels.bound[:, None])[plan.identified]
    if not gaps.size:
        return np.full(columns, np.inf)
    score = np.sqrt(np.mean(gaps ** 2, axis=0))
    if market_totals and market_weight > 0:
        penalty = market_penalty_batch(design, alpha_ios, alpha_aos, multiplier_matrix, market_totals,
                                       extras.get('alpha_cn'))
        score = np.sqrt(score ** 2 + market_weight * penalty ** 2)
    return score


def market_penalty(design, params, market_totals) -> float:
    residuals = market_residuals(design, params, market_totals)
    return float(np.sqrt(np.mean(residuals ** 2))) if residuals.size else 0.0


def market_combos(matrix, design, countries):
    """Recover the country multiplier tuples encoded in a batched weight matrix."""
    if not countries:
        return [()] * matrix.shape[1]
    rows = [next(index for index, code in enumerate(design.countries) if code == country)
            for country in countries]
    return [tuple(matrix[row, column] for row in rows) for column in range(matrix.shape[1])]


def multiplier_matrix(design: Design, countries, combos):
    matrix = np.ones((len(design.countries), len(combos)))
    for column, combo in enumerate(combos):
        for country, value in zip(countries, combo):
            matrix[[i for i, code in enumerate(design.countries) if code == country], column] = value
    return matrix


def extra_axis(variant: dict, alphas, censored_values):
    """Optional fourth parameter a variant may ask the grid to estimate as well.

    Returns the parameter name and its candidate values. Variants that do not ask
    for one search exactly the grid they did before.
    """
    name = variant.get('extra')
    if name is None:
        return None, [None]
    if name == 'censored_aos':
        return name, list(censored_values)
    if name == 'alpha_cn':
        return name, list(alphas)
    raise ValueError(f'Unknown extra parameter axis: {name}')


def exhaustive_search(design, labels, masks, variant, alphas, censored_values, multiplier_values):
    """Full grid over exponents, censoring and country weights, batched per column."""
    plan = batch_plan(design, labels)
    countries = variant['countries']
    combos = list(itertools.product(multiplier_values, repeat=len(countries))) or [()]
    matrix = multiplier_matrix(design, countries, combos)
    coverage = variant.get('coverage')
    market_totals = variant.get('market_totals')
    market_weight = variant.get('market_weight', 0.0)
    extra_name, extra_values = extra_axis(variant, alphas, censored_values)
    scope = variant.get('absence_scope', 'every_chart')
    scoped = {} if scope == 'every_chart' else {'absence_scope': scope}
    best, best_score = None, math.inf
    for alpha_ios, alpha_aos, censored, extra in itertools.product(alphas, alphas, censored_values,
                                                                   extra_values):
        if variant['stores'] == 'shared' and alpha_ios != alpha_aos:
            continue
        extras = {extra_name: extra} if extra_name else {}
        extras.update(scoped)
        scores = evaluate_batch(design, labels, masks, plan, alpha_ios, alpha_aos, censored,
                                matrix, coverage, market_totals, market_weight, countries, extras)
        column = int(np.argmin(scores))
        if scores[column] < best_score:
            best_score = float(scores[column])
            best = {'alpha_ios': alpha_ios, 'alpha_aos': alpha_aos, 'censored': censored,
                    'country_multipliers': dict(zip(countries, combos[column])), 'coverage': coverage,
                    **extras}
    if best is None:
        raise ValueError('No parameter combination produced an identified cross-validation score')
    return best, best_score


def evaluate(design, labels: Labels, masks, params, detail=False):
    indices = {geography: model_index(design, params, mask) for geography, mask in masks.items()}
    per_label = np.array([indices[geography][game]
                          for geography, game in zip(labels.geography, labels.game)])
    if not np.all(per_label > 0):
        return {'params': params, 'fitted_rmse_log': math.inf, 'cv_rmse_log': math.inf,
                'cv_labels': 0, 'cv_median_abs_pct': math.inf, 'scales': {}, 'held_out': []}
    offset = labels.log_amount - np.log(per_label)
    classes = len(labels.class_names)
    games = int(labels.game.max()) + 1
    class_sum = np.bincount(labels.klass, weights=offset, minlength=classes)
    class_count = np.bincount(labels.klass, minlength=classes)
    present = class_count > 0
    combined = labels.game * classes + labels.klass
    game_class_sum = np.bincount(combined, weights=offset, minlength=games * classes).reshape(games, classes)
    game_class_count = np.bincount(combined, minlength=games * classes).reshape(games, classes)
    class_mean = np.divide(class_sum, class_count, out=np.zeros(classes), where=present)
    fitted_gap = apply_bounds(offset - class_mean[labels.klass], labels.bound)
    remaining_sum = class_sum[None, :] - game_class_sum
    remaining_count = class_count[None, :] - game_class_count
    identified = remaining_count[labels.game, labels.klass] > 0
    with np.errstate(invalid='ignore', divide='ignore'):
        held_scale = np.where(identified,
                              remaining_sum[labels.game, labels.klass]
                              / np.maximum(remaining_count[labels.game, labels.klass], 1), 0.0)
    held_gap = apply_bounds(offset - held_scale, labels.bound)[identified]
    if not held_gap.size:
        return {'params': params, 'fitted_rmse_log': math.inf, 'cv_rmse_log': math.inf,
                'cv_labels': 0, 'cv_median_abs_pct': math.inf, 'scales': {}, 'held_out': []}
    result = {
        'params': params,
        'scales': {name: math.exp(class_sum[index] / class_count[index])
                   for index, name in enumerate(labels.class_names) if class_count[index]},
        'fitted_rmse_log': float(np.sqrt(np.mean(fitted_gap ** 2))),
        'cv_rmse_log': float(np.sqrt(np.mean(held_gap ** 2))),
        'cv_labels': int(held_gap.size),
        'cv_median_abs_pct': float(np.median(np.abs(np.expm1(held_gap))) * 100),
        'held_out': [],
    }
    if detail:
        gaps = apply_bounds(offset - held_scale, labels.bound)
        result['held_out'] = [
            {'game': record['game'], 'anchor_id': record['anchor_id'], 'klass': record['klass'],
             'amount_usd_million': record['amount'], 'log_error': float(gaps[position]),
             'error_pct': float(np.expm1(gaps[position]) * 100)}
            for position, record in enumerate(labels.records) if identified[position]]
    return result


def grid_selection(design, labels, masks, variant, alphas, censored_values, multiplier_values,
                   exclusions):
    """Select parameters for many held-out game sets in a single grid pass.

    A label's model index depends on the parameters alone, never on which games a
    split holds out, so the grid is evaluated once and every split is an
    aggregation over the labels it keeps. The full fit is just the empty
    exclusion, and it finds the same optimum as searching each split separately.
    """
    countries = variant['countries']
    combos = list(itertools.product(multiplier_values, repeat=len(countries))) or [()]
    matrix = multiplier_matrix(design, countries, combos)
    coverage = variant.get('coverage')
    market_totals = variant.get('market_totals')
    market_weight = variant.get('market_weight', 0.0)
    classes = len(labels.class_names)
    games = len(design.games)
    columns = matrix.shape[1]
    combined = labels.game * classes + labels.klass
    class_count = np.bincount(labels.klass, minlength=classes)
    game_class_count = np.bincount(combined, minlength=games * classes).reshape(games, classes)
    own_count = class_count[labels.klass] - game_class_count[labels.game, labels.klass]
    splits = [set(exclusion) for exclusion in exclusions]
    excluded = np.array([[game in split for game in labels.game.tolist()] for split in splits])
    if not excluded.size:
        return []
    # splits x classes x labels: which labels each split removes, grouped by class, so a split's
    # class sums are one contraction instead of a rebuilt subset.
    class_indicator = np.array([labels.klass == klass for klass in range(classes)], dtype=float)
    removal = excluded[:, None, :] * class_indicator[None, :, :]
    removed_count = removal.sum(axis=2)                                          # splits x classes
    best_score = np.full(len(splits), math.inf)
    best_params: list[dict | None] = [None] * len(splits)
    constrained = bool(market_totals) and market_weight > 0
    market_floor = math.sqrt(market_weight) if constrained else 0.0
    extra_name, extra_values = extra_axis(variant, alphas, censored_values)
    scope = variant.get('absence_scope', 'every_chart')
    scoped = {} if scope == 'every_chart' else {'absence_scope': scope}
    for alpha_ios, alpha_aos, censored, extra in itertools.product(alphas, alphas, censored_values,
                                                                   extra_values):
        if variant['stores'] == 'shared' and alpha_ios != alpha_aos:
            continue
        extras = {extra_name: extra} if extra_name else {}
        extras.update(scoped)
        penalty = (market_penalty_batch(design, alpha_ios, alpha_aos, matrix, market_totals,
                                        extras.get('alpha_cn'))
                   if constrained else np.zeros(columns))
        # A country weight whose market-total error alone already beats no split can be
        # skipped: the total score is at least sqrt(weight) times that error.
        ceiling = float(np.max(best_score))
        keep = (np.arange(columns) if not math.isfinite(ceiling)
                else np.flatnonzero(market_floor * penalty < ceiling))
        if not keep.size:
            continue
        active = matrix[:, keep]
        per_chart = cached_chart_index(design, alpha_ios, alpha_aos, censored,
                                       extras.get('censored_aos'), extras.get('alpha_cn'),
                                       scope)
        indices = {}
        for geography, mask in masks.items():
            scaled = per_chart @ (active * (design.weights * mask)[:, None])
            if coverage is not None and mask.all():
                scaled = scaled / coverage[:, None]
            indices[geography] = scaled
        per_label = np.empty((len(labels.records), keep.size))
        for position, (geography, game) in enumerate(zip(labels.geography, labels.game)):
            per_label[position] = indices[geography][game]
        positive = per_label > 0
        # A split only fails on a column where one of the labels it keeps has no index.
        usable = np.array([np.all(positive[~excluded[row]], axis=0) for row in range(len(splits))])
        with np.errstate(invalid='ignore', divide='ignore'):
            offset = labels.log_amount[:, None] - np.log(np.where(positive, per_label, 1.0))
        class_sum = np.zeros((classes, keep.size))
        np.add.at(class_sum, labels.klass, offset)
        game_class_sum = np.zeros((games * classes, keep.size))
        np.add.at(game_class_sum, combined, offset)
        game_class_sum = game_class_sum.reshape(games, classes, keep.size)
        removed_sum = np.einsum('rkl,lc->rkc', removal, offset)                  # splits x classes x cols
        own_sum = class_sum[labels.klass] - game_class_sum[labels.game, labels.klass]
        remaining_sum = own_sum[None, :, :] - removed_sum[:, labels.klass, :]
        remaining_count = own_count[None, :] - removed_count[:, labels.klass]
        valid = (remaining_count > 0) & ~excluded
        with np.errstate(invalid='ignore', divide='ignore'):
            held_scale = remaining_sum / np.maximum(remaining_count, 1)[:, :, None]
        gaps = apply_bounds(offset[None, :, :] - held_scale, labels.bound[None, :, None])
        squares = np.where(valid[:, :, None], gaps ** 2, 0.0).sum(axis=1)
        counts = valid.sum(axis=1)
        with np.errstate(invalid='ignore', divide='ignore'):
            scores = np.sqrt(squares / np.maximum(counts, 1)[:, None])
        scores = np.where(usable & (counts[:, None] > 0), scores, math.inf)
        if constrained:
            scores = np.sqrt(scores ** 2 + market_weight * penalty[keep][None, :] ** 2)
        for row in range(len(splits)):
            column = int(np.argmin(scores[row]))
            if scores[row, column] < best_score[row]:
                best_score[row] = float(scores[row, column])
                best_params[row] = {'alpha_ios': alpha_ios, 'alpha_aos': alpha_aos,
                                    'censored': censored,
                                    'country_multipliers': dict(zip(countries, combos[keep[column]])),
                                    'coverage': coverage, **extras}
    return best_params


def fold_selection_batch(design, labels, masks, variant, alphas, censored_values, multiplier_values):
    """Leave-one-game-out selection for every labelled game, in one grid pass."""
    fold_games = sorted(set(labels.game.tolist()))
    selected = grid_selection(design, labels, masks, variant, alphas, censored_values,
                              multiplier_values, [{game} for game in fold_games])
    return {game: params for game, params in zip(fold_games, selected) if params is not None}


def grid(values):
    return [round(value, 4) for value in values]


def candidate_parameters(variant, alphas, censored_values, multiplier_values):
    for alpha_ios, alpha_aos, censored in itertools.product(alphas, alphas, censored_values):
        if variant['stores'] == 'shared' and alpha_ios != alpha_aos:
            continue
        for multipliers in multiplier_combinations(variant['countries'], multiplier_values):
            yield {'alpha_ios': alpha_ios, 'alpha_aos': alpha_aos, 'censored': censored,
                   'country_multipliers': multipliers, 'coverage': variant.get('coverage')}


def describe(params: dict) -> dict:
    described = {key: value for key, value in params.items() if key != 'coverage'}
    described['coverage_correction'] = params.get('coverage') is not None
    return described


def search(design, labels, masks, variant, alphas, censored_values, multiplier_values, params=None):
    best = params or select_parameters(design, labels, masks, variant, alphas,
                                       censored_values, multiplier_values)
    return evaluate(design, labels, masks, best, detail=True)


def select_parameters(design, labels, masks, variant, alphas, censored_values, multiplier_values):
    if variant.get('search') == 'coordinate':
        params, _ = coordinate_search(design, labels, masks, variant, alphas, censored_values, multiplier_values)
        return params
    params, _ = exhaustive_search(design, labels, masks, variant, alphas, censored_values, multiplier_values)
    return params


def subset_labels(labels: Labels, keep: np.ndarray) -> Labels:
    return Labels(records=[record for record, flag in zip(labels.records, keep) if flag],
                  log_amount=labels.log_amount[keep], game=labels.game[keep], klass=labels.klass[keep],
                  geography=[value for value, flag in zip(labels.geography, keep) if flag],
                  bound=labels.bound[keep], class_names=labels.class_names)


def nested_cross_validation(design, labels, masks, variant, alphas, censored_values, multiplier_values,
                            selections=None):
    """Honest comparison: the curve parameters are re-selected inside every fold.

    Selecting exponents on all games and then reporting a scale-only hold-out
    flatters richer variants; here a held-out game influences neither the
    parameters nor the class scales used to predict it.
    """
    folds, errors = [], []
    coordinate = variant.get('search') == 'coordinate'
    if selections is None and not coordinate:
        selections = fold_selection_batch(design, labels, masks, variant, alphas,
                                          censored_values, multiplier_values)
    for game_index in sorted(set(labels.game.tolist())):
        keep = labels.game != game_index
        inner = subset_labels(labels, keep)
        if not inner.records:
            continue
        best = (selections.get(game_index) if selections is not None
                else select_parameters(design, inner, masks, variant, alphas,
                                       censored_values, multiplier_values))
        if best is None:
            continue
        indices = {geography: model_index(design, best, mask) for geography, mask in masks.items()}
        scales = fit_scales(inner.records, indices)
        held = subset_labels(labels, ~keep)
        for record, gap in zip(held.records, residuals(held.records, indices, scales)):
            if gap is None:
                continue
            errors.append(gap)
            folds.append({'game': record['game'], 'anchor_id': record['anchor_id'],
                          'klass': record['klass'], 'selected_params': describe(best),
                          'log_error': gap, 'error_pct': float(np.expm1(gap) * 100)})
    if not errors:
        raise ValueError('Nested cross-validation produced no identified predictions')
    array = np.array(errors)
    return {'variant': variant['id'], 'folds': folds, 'labels': len(errors),
            'nested_cv_rmse_log': float(np.sqrt(np.mean(array ** 2))),
            'nested_cv_median_abs_pct': float(np.median(np.abs(np.expm1(array))) * 100),
            'nested_cv_worst_abs_pct': float(np.max(np.abs(np.expm1(array))) * 100),
            'selected_parameter_sets': [dict(t) for t in {tuple(sorted(
                {**row['selected_params'],
                 'country_multipliers': json.dumps(row['selected_params']['country_multipliers'], sort_keys=True)}
                .items())) for row in folds}]}


def coverage_vector(design: Design, path: Path):
    """Per-game five-market share of all-country index mass, measured separately."""
    if not path.exists():
        return None, {'status': 'coverage_report_missing'}
    report = json.loads(path.read_text(encoding='utf-8'))
    per_day = {}
    for day in report['days']:
        for row in day['per_game']:
            per_day.setdefault(row['game'], []).append(row['five_market_share'])
    values, missing, spread = [], [], []
    for name in design.games:
        shares = per_day.get(name)
        if not shares:
            missing.append(name)
            values.append(1.0)
            continue
        values.append(float(np.mean(shares)))
        spread.append(float(max(shares) - min(shares)))
    return np.array(values), {
        'status': 'applied', 'source': str(path.name), 'days': [day['date'] for day in report['days']],
        'games_without_measured_share': missing,
        'uncorrected_for_missing_games': True,
        'max_day_to_day_share_spread': max(spread) if spread else None,
        'assumption': ('The geography mix measured on the all-country snapshot days also holds for the '
                       'labelled month. Games absent from those snapshots keep a share of 1.0 and are listed.'),
    }


def holdout_split(design: Design, fraction: int = 4):
    """Deterministic, name-based reserve so the split never follows the results."""
    digest = [(name, int(hashlib.sha256(name.encode('utf-8')).hexdigest()[:8], 16)) for name in design.games]
    return sorted(name for name, value in digest if value % fraction == 0)


def evaluate_holdout(design, labels, masks, variant, holdout, alphas, censored_values, multiplier_values,
                     params=None):
    reserved = {design.games.index(name) for name in holdout}
    training = subset_labels(labels, np.array([game not in reserved for game in labels.game]))
    best = params or select_parameters(design, training, masks, variant, alphas,
                                       censored_values, multiplier_values)
    indices = {geography: model_index(design, best, mask) for geography, mask in masks.items()}
    scales = fit_scales(training.records, indices)
    held = subset_labels(labels, np.array([game in reserved for game in labels.game]))
    rows = []
    for record, gap in zip(held.records, residuals(held.records, indices, scales)):
        if gap is None:
            continue
        rows.append({'game': record['game'], 'anchor_id': record['anchor_id'], 'klass': record['klass'],
                     'amount_usd_million': record['amount'], 'qualifier': record['qualifier'],
                     'log_error': gap, 'error_pct': float(np.expm1(gap) * 100)})
    errors = np.array([row['log_error'] for row in rows]) if rows else np.array([])
    return {'variant': variant['id'], 'selected_params': describe(best),
            'holdout_games': holdout, 'training_games': len(design.games) - len(holdout),
            'predicted_labels': len(rows),
            'rmse_log': float(np.sqrt(np.mean(errors ** 2))) if rows else None,
            'median_abs_pct': float(np.median(np.abs(np.expm1(errors))) * 100) if rows else None,
            'worst_abs_pct': float(np.max(np.abs(np.expm1(errors))) * 100) if rows else None,
            'rows': rows}


def multiplier_combinations(countries, values):
    if not countries:
        return [{}]
    return [dict(zip(countries, combo)) for combo in itertools.product(values, repeat=len(countries))]


def coordinate_search(design, labels, masks, variant, alphas, censored_values, multiplier_values,
                      passes: int = 6, starts=None):
    """Greedy coordinate descent for variants whose full grid is too large.

    Exhaustive search over every alpha, censoring and country-weight combination
    costs millions of evaluations per fold. Descending one axis at a time from
    several starting points reaches the same optimum on the tested grids at a
    tiny fraction of the cost. Exhaustive search stays available for comparison.
    """
    best_params, best_score = None, math.inf
    for start in starts or [(1.0, 1.0, 1.0), (0.7, 0.7, 0.0), (1.4, 0.5, 1.0)]:
        params, score = _descend(design, labels, masks, variant, alphas, censored_values,
                                 multiplier_values, passes, start)
        if score < best_score:
            best_params, best_score = params, score
    return best_params, best_score


def combined_score(design, labels, masks, variant, params) -> float:
    label_score = evaluate(design, labels, masks, params)['cv_rmse_log']
    weight = variant.get('market_weight', 0.0)
    if not weight or not variant.get('market_totals'):
        return label_score
    penalty = market_penalty(design, params, variant['market_totals'])
    return math.sqrt(label_score ** 2 + weight * penalty ** 2)


def _descend(design, labels, masks, variant, alphas, censored_values, multiplier_values, passes, start):
    alpha_ios, alpha_aos, censored = start
    params = {'alpha_ios': alpha_ios, 'alpha_aos': alpha_aos if variant['stores'] != 'shared' else alpha_ios,
              'censored': censored,
              'country_multipliers': {country: 1.0 for country in variant['countries']},
              'coverage': variant.get('coverage')}
    best_score = combined_score(design, labels, masks, variant, params)
    axes = ['alpha_ios'] if variant['stores'] == 'shared' else ['alpha_ios', 'alpha_aos']
    axes = axes + ['censored'] + [('country', country) for country in variant['countries']]
    for _ in range(passes):
        improved = False
        for axis in axes:
            if axis == 'alpha_ios' and variant['stores'] == 'shared':
                options = [{'alpha_ios': value, 'alpha_aos': value} for value in alphas]
            elif axis in ('alpha_ios', 'alpha_aos'):
                options = [{axis: value} for value in alphas]
            elif axis == 'censored':
                options = [{'censored': value} for value in censored_values]
            else:
                options = [{'country_multipliers': {**params['country_multipliers'], axis[1]: value}}
                           for value in multiplier_values]
            for option in options:
                candidate = {**params, **option}
                score = combined_score(design, labels, masks, variant, candidate)
                if score < best_score - 1e-12:
                    params, best_score, improved = candidate, score, True
        if not improved:
            break
    return params, best_score


def published_country_totals(period: dict) -> list:
    rows = [json.loads(line) for line in
            (Path(__file__).resolve().parents[2] / 'docs/research/anchors/anchors.jsonl')
            .read_text(encoding='utf-8').splitlines() if line]
    return [{'geography': row['geography'], 'provider': row['provider'], 'stores': row['stores'],
             'amount_usd_million': row['amount_usd_m'], 'notes': row.get('notes'),
             'amount_usd_m': row['amount_usd_m']}
            for row in rows if row['metric'] == 'market_total' and row['geography'] != 'WW'
            and row['period']['start'] == period['start'] and row['period']['end'] == period['end']
            and row['fee_basis'] == 'gross' and row['amount_usd_m']]


def main():
    root = Path(__file__).resolve().parents[2]
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--panel', default='reports/rank-models/august-label-panel-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-2026-09-11.json')
    parser.add_argument('--output', default='reports/rank-models/august-curve-estimates-2026-09-11.json')
    parser.add_argument('--variants', default='all',
                        help='all, or a comma separated list of variant ids')
    parser.add_argument('--market-weight', type=float, default=1.0,
                        help='relative weight of the published market-total constraint')
    parser.add_argument('--market-geographies', default='',
                        help='comma separated countries to keep from the published totals; '
                             'empty keeps every published total')
    arguments = parser.parse_args()
    panel = json.loads((root / arguments.panel).read_text(encoding='utf-8'))
    design = build_design(panel)
    records = label_records(panel)
    masks = scope_masks(design, records)
    labels = prepare_labels(records)
    alphas = grid(np.arange(0.30, 2.01, 0.05))
    censored_values = grid(np.arange(0.0, 1.01, 0.1))
    multiplier_values = grid([0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0])
    coarse_alphas = alphas
    coarse_censored = censored_values
    coarse_multipliers = multiplier_values
    variants = [
        {'id': 'shared_alpha', 'stores': 'shared', 'countries': []},
        {'id': 'store_alpha', 'stores': 'per_store', 'countries': []},
        {'id': 'store_alpha_cn', 'stores': 'per_store', 'countries': ['CN']},
        {'id': 'store_alpha_cn_jp', 'stores': 'per_store', 'countries': ['CN', 'JP']},
        {'id': 'store_alpha_four_markets', 'stores': 'per_store', 'countries': ['CN', 'JP', 'KR', 'TW'],
         'search': 'coordinate'},
        # Do the data support a more granular curve than one exponent per store?
        {'id': 'store_alpha_cn_censored_per_store', 'stores': 'per_store', 'countries': ['CN'],
         'extra': 'censored_aos'},
        {'id': 'store_alpha_cn_exponent', 'stores': 'per_store', 'countries': ['CN'],
         'extra': 'alpha_cn'},
        # Should a game that never charts in a market still be credited a floor there?
        {'id': 'store_alpha_cn_appeared_only', 'stores': 'per_store', 'countries': ['CN'],
         'absence_scope': 'appeared'},
    ]
    market_totals = published_country_totals(panel['period'])
    if arguments.market_geographies:
        kept = {code.strip() for code in arguments.market_geographies.split(',') if code.strip()}
        market_totals = [total for total in market_totals if total['geography'] in kept]
    if market_totals and arguments.market_weight > 0:
        variants += [{**variant, 'id': f"{variant['id']}_market",
                      'market_totals': market_totals, 'market_weight': arguments.market_weight}
                     for variant in variants if variant['countries']]
    coverage, coverage_meta = coverage_vector(design, root / arguments.coverage)
    if coverage is not None:
        variants += [{**variant, 'id': f"{variant['id']}_coverage", 'coverage': coverage}
                     for variant in variants]
    if arguments.variants != 'all':
        wanted = set(arguments.variants.split(','))
        variants = [variant for variant in variants if variant['id'] in wanted]
        if not variants:
            raise SystemExit('No variant matched --variants')
    results = []
    nested = []
    holdout = holdout_split(design)
    reserved = {design.games.index(name) for name in holdout}
    fold_games = sorted(set(labels.game.tolist()))
    holdout_params = {}
    for variant in variants:
        chosen = None
        fold_choice = None
        if variant.get('search') != 'coordinate':
            # One grid pass answers the full fit, the reserved holdout and every fold.
            selected = grid_selection(design, labels, masks, variant, coarse_alphas, coarse_censored,
                                      coarse_multipliers,
                                      [set(), reserved] + [{game} for game in fold_games])
            chosen, holdout_params[variant['id']] = selected[0], selected[1]
            fold_choice = {game: params for game, params in zip(fold_games, selected[2:])
                           if params is not None}
        best = search(design, labels, masks, variant, alphas, censored_values, multiplier_values,
                      params=chosen)
        results.append({'variant': variant['id'], 'params': describe(best['params']),
                        **{key: best[key] for key in
                           ('fitted_rmse_log', 'cv_rmse_log', 'cv_labels', 'cv_median_abs_pct')},
                        'market_rmse_log': market_penalty(design, best['params'], market_totals),
                        'market_constrained': bool(variant.get('market_weight')),
                        'scales': best['scales'], 'held_out': best['held_out']})
        nested.append(nested_cross_validation(design, labels, masks, variant,
                                              coarse_alphas, coarse_censored, coarse_multipliers,
                                              selections=fold_choice))
    baseline_params = {'alpha_ios': 1.25, 'alpha_aos': 0.5625, 'censored': 0.0,
                       'country_multipliers': {}, 'coverage': None}
    baseline = evaluate(design, labels, masks, baseline_params, detail=True)
    best_variant = min(nested, key=lambda row: row['nested_cv_rmse_log'])
    holdout_result = evaluate_holdout(
        design, labels, masks, next(v for v in variants if v['id'] == best_variant['variant']),
        holdout, coarse_alphas, coarse_censored, coarse_multipliers,
        params=holdout_params.get(best_variant['variant']))
    output = {
        'schema_version': 1, 'production_enabled': False,
        'panel': arguments.panel, 'market_model': panel['provenance']['marketModel'],
        'coverage_report': arguments.coverage,
        'games': len(design.games), 'labels': len(records),
        'label_classes': sorted({record['klass'] for record in records}),
        'estimator': 'Per-class multiplicative scale in log space; leave-one-game-out selection on cross-validated log RMSE.',
        'baseline_round13_exponents': {'params': describe(baseline['params']),
                                       **{key: baseline[key] for key in
                                          ('fitted_rmse_log', 'cv_rmse_log', 'cv_labels', 'cv_median_abs_pct')}},
        'baseline_held_out': baseline['held_out'],
        'coverage_correction': coverage_meta,
        'market_totals': [{'geography': row['geography'], 'provider': row['provider'],
                           'stores': row['stores'], 'amount_usd_million': row['amount_usd_m'],
                           'notes': row.get('notes')} for row in market_totals],
        'market_constraint_meaning': ('Published country totals only constrain the ratios between country '
                                      'weights; one free market scale is removed before scoring them.'),
        'variants': results,
        'nested_cross_validation': nested,
        'reserved_holdout': holdout_result,
        'selection_note': ('variants[].cv_* re-fit only the class scales per fold, so richer variants look better '
                           'than they generalise. nested_cross_validation re-selects the curve parameters inside '
                           'every fold and is the comparison used for adoption.'),
    }
    path = root / arguments.output
    path.write_text(json.dumps(output, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(path.relative_to(root)).replace('\\', '/'),
                      'baseline_cv_rmse_log': round(baseline['cv_rmse_log'], 4),
                      'variants': [{'variant': row['variant'], 'cv_rmse_log': round(row['cv_rmse_log'], 4),
                                    'cv_median_abs_pct': round(row['cv_median_abs_pct'], 1),
                                    'params': row['params']} for row in results],
                      'nested': [{'variant': row['variant'],
                                  'nested_cv_rmse_log': round(row['nested_cv_rmse_log'], 4),
                                  'nested_cv_median_abs_pct': round(row['nested_cv_median_abs_pct'], 1),
                                  'nested_cv_worst_abs_pct': round(row['nested_cv_worst_abs_pct'], 1),
                                  'distinct_selected_parameter_sets': len(row['selected_parameter_sets'])}
                                 for row in nested],
                      'reserved_holdout': {key: holdout_result[key] for key in
                                           ('variant', 'selected_params', 'holdout_games', 'predicted_labels',
                                            'rmse_log', 'median_abs_pct', 'worst_abs_pct')}}, indent=2))


if __name__ == '__main__':
    main()
