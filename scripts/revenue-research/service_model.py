"""Monthly estimate contracts shared by validation and the unpublished service.

Historical replay is not a fresh holdout: the existing curves and current
identity/market tables have already been inspected. Release requires a future,
timestamped prediction evaluation as well as the retrospective checks.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import statistics
import tempfile
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import history_fit as fit

POLICY = {
    'version': 1,
    'period': 'calendar_month',
    'geography': 'WW',
    'stores': ['app_store', 'google_play'],
    'min_observed_fraction': 0.90,
    'interval_coverage': 0.90,
    'min_calibration_rows': 20,
    'min_calibration_games': 5,
    'min_calibration_months': 3,
    'min_evaluation_rows': 50,
    'min_evaluation_games': 10,
    'min_evaluation_months': 3,
    'min_served_fraction': 0.50,
    'median_error_pct': {'consumer_spend': 10.0, 'downloads': 15.0},
    'p90_error_pct': {'consumer_spend': 30.0, 'downloads': 40.0},
    'max_interval_factor': {'consumer_spend': 1.50, 'downloads': 1.75},
}
SCOPE = {
    'consumer_spend': {'unit': 'USD', 'fee_basis': 'gross', 'metric': 'consumer_spend',
                       'excludes': ['advertising', 'web_shops', 'alternative_android_stores']},
    'downloads': {'unit': 'installs', 'fee_basis': 'not_applicable', 'metric': 'downloads',
                  'excludes': ['alternative_android_stores']},
}


def canonical(value) -> bytes:
    """Standards-compliant JSON; model penalties use the explicit string 'inf'."""
    def safe(item):
        if isinstance(item, float) and not math.isfinite(item):
            if item == math.inf:
                return 'inf'
            raise ValueError('Non-finite output')
        if isinstance(item, dict):
            return {k: safe(v) for k, v in item.items()}
        if isinstance(item, (list, tuple)):
            return [safe(v) for v in item]
        return item
    return (json.dumps(safe(value), sort_keys=True, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()


def digest(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def write_atomic(path: Path, value, immutable: bool = False) -> None:
    """A failed calculation/write never replaces the previous valid artifact."""
    data = canonical(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    if immutable:
        try:
            with path.open('xb') as stream:
                stream.write(data)
        except FileExistsError:
            if path.read_bytes() != data:
                raise ValueError(f'Immutable artifact already differs: {path}') from None
        return
    handle, name = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def next_month(month: str) -> str:
    return (date.fromisoformat(fit.month_days(month)[-1]) + timedelta(days=1)).isoformat()[:7]


def reserved_game(name: str) -> bool:
    """Stable, outcome-independent family split, shared across regional apps."""
    return int(hashlib.sha256(name.encode()).hexdigest()[:8], 16) % 5 == 0


def paired_cluster_scale(pairs: list[tuple[tuple, float]], dimension: int) -> float | None:
    """Descriptive cluster scale for a paired loss difference, not a coverage guarantee."""
    centre = statistics.fmean(value for _, value in pairs)
    clusters = defaultdict(float)
    for key, value in pairs:
        clusters[key[dimension]] += value - centre
    count = len(clusters)
    if count < 2:
        return None
    return math.sqrt(count / (count - 1) * sum(value * value for value in clusters.values())) / len(pairs)


def monthly_labels(raw: list[dict], sources: dict, names: set[str],
                   metric: str, as_of: str) -> tuple[list[dict], dict]:
    """Reconstruct published monthly labels at cutoff, never average revisions.

    Publishers citing AppMagic are one provider, not independent evidence.
    Choose by role, exactness and latest known publication, never by model error.
    The service only promises months; overlapping H1/week/day rows stay research.
    """
    grouped = defaultdict(list)
    rejected = Counter()
    for row in raw:
        if row.get('metric') != metric:
            continue
        if row.get('provider') != 'AppMagic':
            rejected['different_provider'] += 1
            continue
        period = row.get('period') or {}
        if period.get('kind') != 'month':
            rejected['non_month_period'] += 1
            continue
        try:
            start = date.fromisoformat(period.get('start')).isoformat()
            end = date.fromisoformat(period.get('end')).isoformat()
        except (ValueError, TypeError):
            rejected['non_calendar_month_period'] += 1
            continue
        # The research helper can infer month boundaries from a start date.
        # Service labels must instead preserve explicit full-calendar bounds.
        if (start != period['start'] or end != period['end'] or start[8:] != '01' or
                end != fit.month_days(start[:7])[-1]):
            rejected['non_calendar_month_period'] += 1
            continue
        bounds = start, end
        if (row.get('geography') != 'WW' or
                sorted(row.get('stores') or []) != ['app_store', 'google_play'] or
                row.get('currency') != ('USD' if metric == 'consumer_spend' else 'COUNT') or
                row.get('review_status') != 'clear' or row.get('evidence_role') not in fit.ROLE_PRIORITY or
                row.get('identity_status') == 'unresolved' or
                row.get('qualifier') not in (None, '', 'approximately') or
                metric == 'consumer_spend' and row.get('fee_basis') not in ('gross', 'net')):
            rejected['scope_or_review'] += 1
            continue
        source = sources.get(row.get('source_id'), {})
        published = source.get('published_on')
        try:
            published = date.fromisoformat(published).isoformat()
        except (ValueError, TypeError):
            rejected['unknown_publication_date'] += 1
            continue
        first_published = published
        modified = source.get('page_modified_on')
        if modified is not None:
            try:
                modified = date.fromisoformat(modified).isoformat()
            except (ValueError, TypeError):
                rejected['unknown_content_revision_date'] += 1
                continue
            # The current body is not evidence of the pre-edit amount. Keep
            # published_on unchanged for the separate prospective-novelty guard.
            published = max(published, modified)
        if published > as_of or bounds[1] >= as_of:
            rejected['not_available_at_cutoff'] += 1
            continue
        family = fit.family_for(row, names)
        if family not in names:
            rejected['unmapped_identity'] += 1
            continue
        amount = fit.label_amount(row)
        if not math.isfinite(amount) or amount <= 0:
            raise ValueError(f'Invalid label amount: {row.get("id")}')
        klass = row['fee_basis'] if metric == 'consumer_spend' else 'downloads'
        grouped[(family, bounds[0][:7], klass)].append((row, published, amount, first_published))
    labels, conflicts = [], []
    for (family, month, klass), members in sorted(grouped.items()):
        priority = min((fit.ROLE_PRIORITY[r['evidence_role']], bool(r.get('qualifier'))) for r, _, _, _ in members)
        kept = [m for m in members
                if (fit.ROLE_PRIORITY[m[0]['evidence_role']], bool(m[0].get('qualifier'))) == priority]
        # An unrelated page edit must not promote an older citation above a
        # newer publication. Availability and citation priority are distinct.
        row, published, amount, _ = max(kept, key=lambda m: (m[3], m[0]['source_id'], m[0].get('id', '')))
        if max(m[2] for m in kept) / min(m[2] for m in kept) > 1.10:
            conflicts.append({'family': family, 'month': month, 'class': klass,
                              'sources': sorted({m[0]['source_id'] for m in kept})})
        labels.append({'family': family, 'month': month, 'period_key': month,
                       'period_start': month + '-01', 'period_end': fit.month_days(month)[-1],
                       'class': klass, 'amount_usd_m': amount, 'available_on': published,
                       'source_id': row['source_id'], 'provider': 'AppMagic',
                       'hedged': bool(row.get('qualifier'))})
    return labels, {'rejected': dict(rejected), 'conflicts_retained': conflicts,
                    'input_rows': sum(len(v) for v in grouped.values()),
                    'independent_family_months': len({(r['family'], r['month']) for r in labels}),
                    'labels': len(labels)}


def unique_targets(labels: list[dict], metric: str) -> list[dict]:
    """One service outcome per family/month; revenue means gross player spend."""
    klass = 'gross' if metric == 'consumer_spend' else 'downloads'
    return [r for r in labels if r['class'] == klass]


def training_rows(labels: list[dict], index: dict, names: list[str], before: str,
                  reserve: bool = True, as_of: str | None = None) -> list[dict]:
    labels = [r for r in fit.training_before(labels, before, as_of)
              if not reserve or not reserved_game(r['family'])]
    # A net/gross pair is one provider-period's evidence, not two samples.
    counts = Counter((r['family'], r['month']) for r in labels)
    rows = fit.design(labels, index, dict.fromkeys(names, 1.0), 1)
    for row in rows:
        row['weight'] = 1.0 / counts[(row['family'], row['month'])]
    return rows


def within_game_observation(row: dict, means: dict[str, float]) -> dict:
    """Separate temporal movement from cross-game size; unseen games are neutral."""
    current = row['features']['log_index']
    return {**row, 'features': {**row['features'],
            'log_index_within': current - means.get(row['family'], current)}}


def fit_model(rows: list[dict], candidate: dict) -> dict | None:
    if not rows or len({r['month'] for r in rows}) < 2:
        return None
    means = {}
    if 'log_index_within' in candidate['features']:
        by_game = defaultdict(list)
        for row in rows:
            by_game[row['family']].append(row)
        means = {name: sum(r['weight'] * r['features']['log_index'] for r in values) /
                 sum(r['weight'] for r in values) for name, values in by_game.items()}
        rows = [within_game_observation(row, means) for row in rows]
    model = fit.fit_shrunk(rows, candidate['lambda'], candidate['feature_lambda'],
                           candidate.get('huber_delta', math.inf), math.inf,
                           candidate['features'], candidate['half_life'],
                           game_slope_feature=('log_index_within' if 'random_slope_lambda' in candidate else None),
                           game_slope_lam=candidate.get('random_slope_lambda', math.inf))
    if means:
        model['game_index_means'] = means
    model['labels_per_game'] = {
        game: len({r['month'] for r in rows if r['family'] == game})
        for game in model['labels_per_game']}
    model['class_counts'] = dict(Counter(r['class'] for r in rows))
    model['feature_domain'] = {
        feature: [min(r['features'][feature] for r in rows), max(r['features'][feature] for r in rows)]
        for feature in candidate['features']}
    return model


def predict_one(family: str, month: str, klass: str, index: dict,
                names: list[str], model: dict | None) -> dict:
    """Single inference implementation used by replay, previews and frozen runs."""
    base = {'family': family, 'month': month, 'class': klass}
    # Service coverage is explicitly one for every catalog member. Other
    # members cannot change its log-median centre (zero); retain membership.
    coverage = {family: 1.0} if family in names else {}
    observation = fit.observation_row(family, month, klass, index, coverage, 1)
    if observation is None:
        return {**base, 'status': 'unavailable', 'reason': 'insufficient_chart_observation'}
    if model is None or model['class_counts'].get(klass, 0) < fit.MIN_CLASS_LABELS:
        return {**base, 'status': 'unavailable', 'reason': 'insufficient_training'}
    if 'log_index_within' in model.get('feature_names', []):
        observation = within_game_observation(observation, model['game_index_means'])
    log_value = fit.predict(observation, model)
    if log_value is None or not math.isfinite(log_value):
        raise ValueError('Prediction is not finite')
    value = math.exp(log_value) * 1e6
    if not math.isfinite(value) or value <= 0:
        raise ValueError('Prediction is not positive and finite')
    prior = model['labels_per_game'].get(family, 0)
    first_observed = index[month].get('first_observed_month', {}).get(family)
    frozen_origin = model.get('first_observed_months', {}).get(family)
    if frozen_origin is not None:
        first_observed = min(first_observed or frozen_origin, frozen_origin)
    saturated = observation['features']['top_share'] >= 0.90
    cohort = 'saturated' if saturated else 'seen' if prior else 'unseen'
    outside = [name for name, (low, high) in model['feature_domain'].items()
               if observation['features'][name] < low - 1e-10 or observation['features'][name] > high + 1e-10]
    return {**base, 'status': 'estimated', 'estimate': value, 'cohort': cohort,
            'prior_months': prior, 'out_of_domain': outside, 'rank_saturated': saturated,
            'first_observed_month': first_observed}


def residual(prediction: dict, label: dict) -> dict | None:
    if prediction.get('status') != 'estimated':
        return None
    actual = label['amount_usd_m'] * 1e6
    return {**prediction, 'actual': actual, 'available_on': label['available_on'],
            'source_id': label['source_id'],
            'log_error': math.log(prediction['estimate'] / actual),
            'error_pct': 100 * abs(prediction['estimate'] / actual - 1)}


def interval(prediction: dict, past: list[dict], metric: str) -> dict:
    if prediction.get('status') != 'estimated':
        return prediction
    if prediction.get('first_observed_month') == prediction['month']:
        return {**prediction, 'status': 'withheld', 'reason': 'first_observed_month_not_validated'}
    if prediction['out_of_domain']:
        return {**prediction, 'status': 'withheld', 'reason': 'outside_training_domain'}
    pool = [r for r in past if r['month'] < prediction['month'] and r['cohort'] == prediction['cohort']]
    if (len(pool) < POLICY['min_calibration_rows'] or
            len({r['family'] for r in pool}) < POLICY['min_calibration_games'] or
            len({r['month'] for r in pool}) < POLICY['min_calibration_months']):
        return {**prediction, 'status': 'withheld', 'reason': 'insufficient_interval_calibration'}
    errors = sorted(abs(r['log_error']) for r in pool)
    rank = math.ceil((len(errors) + 1) * POLICY['interval_coverage'])
    if rank > len(errors):
        return {**prediction, 'status': 'withheld', 'reason': 'insufficient_interval_calibration'}
    factor = math.exp(errors[rank - 1])
    if factor > POLICY['max_interval_factor'][metric]:
        return {**prediction, 'status': 'withheld', 'reason': 'interval_too_wide', 'interval_factor': factor}
    return {**prediction, 'status': 'available', 'lower': prediction['estimate'] / factor,
            'upper': prediction['estimate'] * factor, 'interval_factor': factor,
            'interval_nominal_coverage': POLICY['interval_coverage'], 'calibration_rows': len(pool)}


def error_summary(rows: list[dict]) -> dict:
    if not rows:
        return {'rows': 0}
    errors = sorted(r['error_pct'] for r in rows)
    return {'rows': len(rows), 'games': len({r['family'] for r in rows}),
            'months': len({r['month'] for r in rows}),
            'median_error_pct': statistics.median(errors),
            'p90_error_pct': errors[max(0, math.ceil(len(errors) * 0.9) - 1)],
            'mae_log': statistics.fmean(abs(r['log_error']) for r in rows),
            'max_error_pct': max(errors)}


def assess(rows: list[dict], metric: str, prospective: bool = False,
           catalog_rows: list[dict] | None = None) -> dict:
    """All gates block. Coverage denominator includes unserved target rows."""
    available = [r for r in rows if r['status'] == 'available']
    errors = [r for r in rows if 'error_pct' in r]
    summary = error_summary(available)
    served = len(available) / len(rows) if rows else 0.0
    catalog = rows if catalog_rows is None else catalog_rows
    catalog_fraction = sum(r['status'] == 'available' for r in catalog) / len(catalog) if catalog else 0.0
    covered = sum(r['lower'] <= r['actual'] <= r['upper'] for r in available)
    hit_rate = covered / len(available) if available else None
    gates = {
        'enough_rows': len(available) >= POLICY['min_evaluation_rows'],
        'enough_games': summary.get('games', 0) >= POLICY['min_evaluation_games'],
        'enough_months': summary.get('months', 0) >= POLICY['min_evaluation_months'],
        'served_fraction': served >= POLICY['min_served_fraction'],
        'catalog_served_fraction': catalog_fraction >= POLICY['min_served_fraction'],
        'median_error': summary.get('median_error_pct', math.inf) <= POLICY['median_error_pct'][metric],
        'tail_error': summary.get('p90_error_pct', math.inf) <= POLICY['p90_error_pct'][metric],
        'interval_coverage': hit_rate is not None and hit_rate >= POLICY['interval_coverage'],
        'prospective_validation': prospective,
    }
    return {'release_ready': all(gates.values()), 'gates': gates,
            'target_rows': len(rows), 'served_fraction': served,
            'catalog_rows': len(catalog), 'catalog_served_fraction': catalog_fraction,
            'served_error': summary, 'all_computable_error': error_summary(errors),
            'interval_hit_rate': hit_rate,
            'by_cohort': {c: error_summary([r for r in errors if r['cohort'] == c])
                          for c in sorted({r['cohort'] for r in errors})},
            'withheld_reasons': dict(Counter(r.get('reason') for r in rows if r['status'] != 'available'))}
