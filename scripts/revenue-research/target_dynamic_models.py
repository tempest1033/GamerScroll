"""Past-only state-space and pooled autoregressive residual adapters."""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

import history_fit as fit
import literature_models as encoding
import service_model as model
import service_readiness as replay
from target_accuracy_loop import age_months

BASE_OPTIONS = replay.candidates
BASE_FIT = model.fit_model
BASE_PREDICT = fit.predict
METHODS = ('kalman_level', 'residual_ar1')
REPRESENTATIONS = ('residual',)


def state_forecast(history: list[dict], month: str, method: str,
                   variance: float, rho: float) -> float:
    """Stationary AR mean reversion or a random-walk Kalman level."""
    history = sorted((row for row in history if row['month'] < month), key=lambda row: row['month'])
    if not history:
        return 0.0
    if method == 'residual_ar1':
        return rho ** age_months(history[-1]['month'], month) * history[-1]['residual']
    if method != 'kalman_level':
        raise ValueError('Unknown residual time-series model')
    level, uncertainty = 0.0, variance
    previous = history[0]['month']
    for row in history:
        uncertainty += 0.1 * variance * age_months(previous, row['month'])
        measurement = variance / row['weight']
        gain = uncertainty / (uncertainty + measurement)
        level += gain * (row['residual'] - level)
        uncertainty *= 1.0 - gain
        previous = row['month']
    return level


def options(metric: str, seed: dict, method: str, representation: str) -> list[dict]:
    if method not in METHODS or representation != 'residual':
        raise ValueError('Unknown dynamic candidate')
    original = BASE_OPTIONS(metric, seed)
    additions = []
    for parent in original:
        if parent['half_life'] != math.inf or parent['lambda'] != 0.25:
            continue
        if metric == 'downloads' and ('random_slope_lambda' not in parent or 'huber_delta' in parent):
            continue
        item = {key: value for key, value in parent.items() if key != 'id'}
        item['dynamic_method'] = method
        additions.append({**item, 'id': model.digest(item)[:16]})
    return original + additions


def fit_model(rows: list[dict], candidate: dict) -> dict | None:
    fitted = BASE_FIT(rows, candidate)
    if fitted is None or 'dynamic_method' not in candidate:
        return fitted
    histories = defaultdict(list)
    residuals = []
    for row in rows:
        observation = (model.within_game_observation(row, fitted['game_index_means'])
                       if 'log_index_within' in fitted['feature_names'] else row)
        residual = row['log_y'] - BASE_PREDICT(observation, fitted)
        histories[(row['family'], row['class'])].append({
            'month': row['month'], 'residual': residual, 'weight': row['weight'],
        })
        residuals.append(residual)
    weights = encoding.observation_weights(rows, candidate['half_life'])
    variance = max(float(np.average(np.asarray(residuals) ** 2, weights=weights)), 1e-8)
    numerator = denominator = 0.0
    for values in histories.values():
        values.sort(key=lambda row: row['month'])
        for previous, current in zip(values, values[1:]):
            if age_months(previous['month'], current['month']) == 1:
                weight = min(previous['weight'], current['weight'])
                numerator += weight * previous['residual'] * current['residual']
                denominator += weight * previous['residual'] ** 2
    # A stationary, training-only AR estimate. No row-specific outcome tuning.
    rho = min(0.95, max(-0.95, numerator / denominator)) if denominator > 1e-12 else 0.0
    fitted['_dynamic'] = {'method': candidate['dynamic_method'], 'histories': dict(histories),
                          'variance': variance, 'rho': rho}
    return fitted


def predict(row: dict, fitted: dict) -> float | None:
    value = BASE_PREDICT(row, fitted)
    if value is None or '_dynamic' not in fitted:
        return value
    state = fitted['_dynamic']
    correction = state_forecast(
        state['histories'].get((row['family'], row['class']), []),
        row['month'], state['method'], state['variance'], state['rho'])
    return value + correction
