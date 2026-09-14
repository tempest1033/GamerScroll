"""Optional literature models; never imported by the production service.

The existing service owns eligibility, metadata, domain checks and intervals.
These adapters replace only the learned log response in experimental replay.
"""
from __future__ import annotations

import math
from functools import partial

import numpy as np

import history_fit as fit
import literature_splines as curvature
import service_model as service
import service_readiness as replay

ORIGINAL_FIT = service.fit_model
ORIGINAL_PREDICT = fit.predict
ORIGINAL_CANDIDATES = replay.candidates
ORIGINAL_SELECT = partial(replay.select_candidate, recency_stability=False)
METHODS = ('gam_smooth', 'gam_monotone', 'gam_temporal',
           'gpboost_intercept', 'gpboost_slope', 'gpboost_lmm',
           'ridge_curvature', 'ridge_curvature_anchored')


def curvature_parent_id(candidate: dict) -> str:
    fields = {'id', 'literature_method', 'curvature_lambda', 'spline_count',
              'curvature_pooling', 'curvature_anchor_strength'}
    return service.digest({key: value for key, value in candidate.items() if key not in fields})[:16]


def staged_select(options: list[dict], predictions: dict, labels: list[dict],
                  metric: str, before: str, current_coverage: dict | None = None):
    """Keep the original parent choice; only then compare its curvature children."""
    parents = [option for option in options if 'literature_method' not in option]
    if not parents:
        raise ValueError('Staged curvature requires the original parent candidates')
    parent, parent_selection = ORIGINAL_SELECT(
        parents, predictions, labels, metric, before, current_coverage)
    if len(parents) == len(options):
        return parent, parent_selection
    detail = {'mode': 'baseline_parent_then_curvature', 'parent_candidate': parent['id'],
              'parent_selection': parent_selection}
    if parent_selection['mode'] != 'past_only_inner_selection':
        return parent, {**detail, 'curvature_selection': 'retain_parent_warmup'}
    children = [option for option in options
                if option.get('literature_method', '').startswith('ridge_curvature') and
                curvature_parent_id(option) == parent['id']]
    if not children:
        return parent, {**detail, 'curvature_selection': 'no_matching_curvature_child'}
    chosen, selection = ORIGINAL_SELECT(
        [parent, *children], predictions, labels, metric, before, current_coverage)
    return chosen, {**detail, 'curvature_selection': selection}


def candidates(metric: str, seed: dict, method: str, hybrid: bool = True) -> list[dict]:
    originals = ORIGINAL_CANDIDATES(metric, seed)
    if method == 'baseline':
        return originals
    if method not in METHODS:
        raise ValueError(f'Unknown literature method: {method}')
    if method in ('ridge_curvature', 'ridge_curvature_anchored'):
        additions = []
        for original in originals:
            if original['half_life'] != math.inf:
                continue
            if metric == 'downloads' and 'random_slope_lambda' not in original:
                continue
            if method == 'ridge_curvature_anchored' and 'huber_delta' in original:
                continue
            for penalty in (0.1, 1.0):
                item = {key: value for key, value in original.items() if key != 'id'}
                item['features'] = list(item['features'])
                item.update(literature_method=method, curvature_lambda=penalty, spline_count=6)
                if method == 'ridge_curvature_anchored':
                    item.update(curvature_pooling='anchored_backbone_orthogonal',
                                curvature_anchor_strength=3.0)
                item['id'] = service.digest(item)[:16]
                additions.append(item)
        return (originals if hybrid else []) + additions
    additions = []
    for original in originals:
        penalties = (0.25, 1.0) if method == 'gam_temporal' else (1.0,)
        if (original['lambda'] not in penalties or original['half_life'] != math.inf or
                'log_index_within' in original['features']):
            continue
        item = {k: v for k, v in original.items() if k != 'id'}
        item['features'] = list(item['features'])
        if method in ('gpboost_slope', 'gpboost_lmm', 'gam_temporal'):
            item['features'].append('log_index_within')
        if method == 'gam_temporal':
            item['random_slope_lambda'] = 0.25
        item['literature_method'] = method
        if method.startswith('gam_'):
            item.update(spline_count=6, spline_lambda=3.0)
        elif method == 'gpboost_lmm':
            item.update(matrix_inversion_method='cholesky',
                        target_centering='weighted_training_mean',
                        linear_design='training_standardized_rank_reduced')
        else:
            item.update(boosting_rounds=40, learning_rate=0.05,
                        num_leaves=7, min_data_in_leaf=5,
                        matrix_inversion_method='cholesky',
                        target_centering='weighted_training_mean')
        item['id'] = service.digest(item)[:16]
        additions.append(item)
    return (originals if hybrid else []) + additions


def observation_weights(rows: list[dict], half_life: float) -> np.ndarray:
    latest = max(row['month'] for row in rows)
    return np.asarray([
        row.get('weight', 1.0) * (
            0.5 ** ((len(fit.months_between(row['month'], latest)) - 1) / half_life)
            if half_life != math.inf else 1.0)
        for row in rows], dtype=float)


def features(row: dict, fitted: dict) -> dict:
    if 'log_index_within' in fitted['feature_names']:
        return service.within_game_observation(row, fitted['game_index_means'])['features']
    return row['features']


def matrix(rows: list[dict], fitted: dict, game_columns: bool) -> np.ndarray:
    names = fitted['feature_names']
    classes = sorted(fitted['class_counts'])[1:]
    games = sorted(fitted['labels_per_game']) if game_columns else []
    return np.asarray([
        [features(row, fitted)[name] for name in names] +
        [float(row['class'] == klass) for klass in classes] +
        [float(row['family'] == game) for game in games] +
        ([float(row['family'] == game) * features(row, fitted)[fitted['game_slope_feature']]
          for game in games] if fitted.get('game_slopes') else [])
        for row in rows], dtype=float)


def fit_model(rows: list[dict], candidate: dict) -> dict | None:
    fitted = ORIGINAL_FIT(rows, candidate)
    method = candidate.get('literature_method')
    if fitted is None or method is None:
        return fitted
    weights = observation_weights(rows, candidate['half_life'])
    if not np.isfinite(weights).all() or np.any(weights <= 0):
        raise ValueError('Literature weights must be positive and finite')
    if method in ('ridge_curvature', 'ridge_curvature_anchored'):
        return curvature.augment_fit(rows, candidate, fitted, weights)
    names = fitted['feature_names']
    if method.startswith('gam_'):
        from pygam import LinearGAM, l, s

        x = matrix(rows, fitted, game_columns=True)
        terms = s(
            0, n_splines=candidate['spline_count'], lam=candidate['spline_lambda'],
            constraints='monotonic_inc' if method == 'gam_monotone' else None)
        for column in range(1, len(names)):
            terms += l(column, lam=candidate['feature_lambda'])
        class_end = len(names) + len(fitted['class_counts']) - 1
        for column in range(len(names), class_end):
            terms += l(column, lam=0.0)
        game_end = class_end + len(fitted['labels_per_game'])
        for column in range(class_end, game_end):
            terms += l(column, lam=candidate['lambda'])
        for column in range(game_end, x.shape[1]):
            terms += l(column, lam=candidate['random_slope_lambda'])
        # Model the entire log-index response, keeping only calendar-day scaling
        # as an offset. A constrained residual would not constrain the response.
        y = np.asarray([row['log_y'] - row['x'] + row['features']['log_index']
                        for row in rows])
        external = LinearGAM(terms).fit(x, y, weights=weights)
    elif method.startswith('gpboost_'):
        import gpboost as gpb

        x = matrix(rows, fitted, game_columns=False)
        groups = np.asarray([row['family'] for row in rows])
        gp_args = {'group_data': groups, 'weights': weights,
                   'num_parallel_threads': 1, 'seed': 0,
                   'matrix_inversion_method': candidate.get('matrix_inversion_method', 'cholesky')}
        if method == 'gpboost_slope':
            gp_args.update(
                group_rand_coef_data=np.asarray([
                    features(row, fitted)['log_index_within'] for row in rows]).reshape(-1, 1),
                ind_effect_group_rand_coef=[1])
        gp = gpb.GPModel(**gp_args)
        y = np.asarray([row['log_y'] - row['x'] for row in rows])
        # Joint covariance/tree optimization is sensitive to a large shared
        # offset on small panels. Restore this exact training-only translation
        # at prediction; never perturb observations or add outcome noise.
        fitted['_literature_target_center'] = float(np.average(y, weights=weights))
        y = y - fitted['_literature_target_center']
        if method == 'gpboost_lmm':
            from scipy.linalg import qr

            mean = np.average(x, axis=0, weights=weights)
            scale = np.sqrt(np.average((x - mean) ** 2, axis=0, weights=weights))
            scale = np.where(scale > 1e-12, scale, 1.0)
            standardized = (x - mean) / scale
            _, triangular, pivot = qr(standardized, mode='economic', pivoting=True)
            rank = int(np.linalg.matrix_rank(triangular))
            columns = sorted(int(column) for column in pivot[:rank])
            design = np.column_stack([np.ones(len(rows)), standardized[:, columns]])
            fitted['_literature_linear_design'] = {
                'mean': mean.tolist(), 'scale': scale.tolist(), 'columns': columns}
            gp.fit(y=y, X=design)
            external = gp
        else:
            external = gpb.train(
                {'learning_rate': candidate['learning_rate'],
                 'num_leaves': candidate['num_leaves'],
                 'min_data_in_leaf': candidate['min_data_in_leaf'],
                 'verbose': -1, 'num_threads': 1, 'seed': 0},
                gpb.Dataset(x, label=y), gp_model=gp,
                num_boost_round=candidate['boosting_rounds'])
    else:
        raise ValueError(f'Unsupported literature method: {method}')
    fitted['_literature_method'] = method
    fitted['_literature_model'] = external
    return fitted


def predict(row: dict, fitted: dict) -> float | None:
    method = fitted.get('_literature_method')
    if method is None:
        return ORIGINAL_PREDICT(row, fitted)
    if row['class'] not in fitted['class_counts']:
        return None
    if method == 'ridge_curvature':
        return curvature.predict(row, fitted)
    external = fitted['_literature_model']
    if method.startswith('gam_'):
        value = external.predict(matrix([row], fitted, game_columns=True))[0]
        value += row['x'] - row['features']['log_index']
    elif method == 'gpboost_lmm':
        design = fitted['_literature_linear_design']
        x = matrix([row], fitted, game_columns=False)
        standardized = (x - np.asarray(design['mean'])) / np.asarray(design['scale'])
        x = np.column_stack([np.ones(1), standardized[:, design['columns']]])
        value = external.predict(
            X_pred=x, group_data_pred=np.asarray([row['family']]),
            predict_response=True, predict_var=False)['mu'][0]
        value += row['x'] + fitted['_literature_target_center']
    else:
        arguments = {
            'data': matrix([row], fitted, game_columns=False),
            'group_data_pred': np.asarray([row['family']]),
            'predict_var': False, 'pred_latent': False}
        if method == 'gpboost_slope':
            arguments['group_rand_coef_data_pred'] = np.asarray(
                [[features(row, fitted)['log_index_within']]])
        value = (external.predict(**arguments)['response_mean'][0] + row['x'] +
                 fitted['_literature_target_center'])
    if not math.isfinite(value):
        raise ValueError('Literature prediction is not finite')
    return float(value)
