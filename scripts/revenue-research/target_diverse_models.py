"""Six nonlinear model families, isolated from the unpublished service runtime.

Compare direct monthly response and residual-on-linear-backbone representations.
All encoders, class/game columns, centres and weights use training rows only.
"""
from __future__ import annotations

import math

import numpy as np
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.kernel_ridge import KernelRidge
from sklearn.neural_network import MLPRegressor
from sklearn.svm import SVR

import history_fit as fit
import literature_models as encoding
import service_model as model
import service_readiness as replay

BASE_FIT = model.fit_model
BASE_PREDICT = fit.predict
BASE_OPTIONS = replay.candidates
METHODS = ('extra_trees', 'random_forest', 'gradient_boosting', 'svr_rbf', 'kernel_ridge', 'mlp')
REPRESENTATIONS = ('residual', 'direct')


def estimator(method: str, numeric_features: int):
    if method == 'extra_trees':
        return ExtraTreesRegressor(n_estimators=64, min_samples_leaf=3, random_state=17, n_jobs=1)
    if method == 'random_forest':
        return RandomForestRegressor(n_estimators=64, min_samples_leaf=3, max_features=0.7,
                                     random_state=17, n_jobs=1)
    if method == 'gradient_boosting':
        return GradientBoostingRegressor(n_estimators=80, learning_rate=0.05, max_depth=2,
                                         min_samples_leaf=5, loss='huber', random_state=17)
    if method == 'svr_rbf':
        return SVR(C=1.0, epsilon=0.03, kernel='rbf', gamma='scale')
    if method == 'kernel_ridge':
        return KernelRidge(alpha=1.0, kernel='rbf', gamma=1.0 / max(1, numeric_features))
    if method == 'mlp':
        return MLPRegressor(hidden_layer_sizes=(16, 8), activation='tanh', solver='lbfgs',
                            random_state=17)
    raise ValueError(f'Unknown nonlinear model: {method}')


def options(metric: str, seed: dict, method: str, representation: str) -> list[dict]:
    originals = BASE_OPTIONS(metric, seed)
    if method not in METHODS or representation not in REPRESENTATIONS:
        raise ValueError('Unknown experimental model or response representation')
    additions = []
    for original in originals:
        if original['half_life'] != math.inf or original['lambda'] != 0.25:
            continue
        if metric == 'downloads' and ('random_slope_lambda' not in original or 'huber_delta' in original):
            continue
        item = {key: value for key, value in original.items() if key != 'id'}
        item.update(diverse_method=method, diverse_representation=representation)
        additions.append({**item, 'id': model.digest(item)[:16]})
    if not additions:
        raise ValueError('No nonlinear candidates')
    return originals + additions


def fit_model(rows: list[dict], candidate: dict) -> dict | None:
    fitted = BASE_FIT(rows, candidate)
    if fitted is None or 'diverse_method' not in candidate:
        return fitted
    weights = encoding.observation_weights(rows, candidate['half_life'])
    x = encoding.matrix(rows, fitted, game_columns=True)
    numeric = len(fitted['feature_names'])
    mean = np.average(x[:, :numeric], axis=0, weights=weights)
    scale = np.sqrt(np.average((x[:, :numeric] - mean) ** 2, axis=0, weights=weights))
    scale = np.where(scale > 1e-12, scale, 1.0)
    x[:, :numeric] = (x[:, :numeric] - mean) / scale
    representation = candidate['diverse_representation']
    if representation == 'residual':
        observations = [
            model.within_game_observation(row, fitted['game_index_means'])
            if 'log_index_within' in fitted['feature_names'] else row for row in rows]
        y = np.asarray([row['log_y'] - BASE_PREDICT(observation, fitted)
                        for row, observation in zip(rows, observations)])
    else:
        y = np.asarray([row['log_y'] - row['x'] + row['features']['log_index'] for row in rows])
    centre = float(np.average(y, weights=weights))
    external = estimator(candidate['diverse_method'], numeric)
    external.fit(x, y - centre, sample_weight=weights)
    fitted['_diverse'] = {
        'external': external, 'representation': representation,
        'numeric': numeric, 'mean': mean, 'scale': scale, 'target_centre': centre,
    }
    return fitted


def predict(row: dict, fitted: dict) -> float | None:
    state = fitted.get('_diverse')
    if state is None:
        return BASE_PREDICT(row, fitted)
    if row['class'] not in fitted['class_counts']:
        return None
    x = encoding.matrix([row], fitted, game_columns=True)
    numeric = state['numeric']
    x[:, :numeric] = (x[:, :numeric] - state['mean']) / state['scale']
    response = float(state['external'].predict(x)[0]) + state['target_centre']
    value = (BASE_PREDICT(row, fitted) if state['representation'] == 'residual'
             else row['x'] - row['features']['log_index']) + response
    if not math.isfinite(value):
        raise ValueError('Nonlinear prediction is not finite')
    return value
