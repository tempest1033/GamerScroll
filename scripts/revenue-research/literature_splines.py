"""Penalized curvature features for the unchanged native ridge/Huber solver.

The spline's affine component is excluded and its remaining columns are
orthogonalized against the training intercept/log-index. Existing linear,
class and game penalties are retained. No pyGAM runtime is required.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.interpolate import BSpline

import history_fit as fit
import service_model as service

ORIGINAL_PREDICT = fit.predict
PREFIX = '__log_index_curvature_'


def spline_basis(knots: list[float], degree: int = 3) -> BSpline:
    count = len(knots) - degree - 1
    return BSpline(knots, np.eye(count), degree)


def roughness(knots: list[float]) -> np.ndarray:
    """Exact intervalwise quadrature of products of cubic second derivatives."""
    basis = spline_basis(knots)
    derivative = basis.derivative(2)
    points, weights = np.polynomial.legendre.leggauss(3)
    result = np.zeros((basis.c.shape[0], basis.c.shape[0]))
    distinct = sorted(set(knots))
    for lower, upper in zip(distinct, distinct[1:]):
        x = (points + 1) * (upper - lower) / 2 + lower
        values = derivative(x)
        result += values.T @ (values * (weights * (upper - lower) / 2)[:, None])
    return result


def extended_basis(z: np.ndarray, knots: list[float]) -> np.ndarray:
    """Use linear boundary continuation, never an exploding cubic extrapolation."""
    basis = spline_basis(knots)
    bounded = np.clip(z, 0.0, 1.0)
    values = basis(bounded)
    return values + (z - bounded)[:, None] * basis.derivative()(bounded)


def build_state(x: np.ndarray, weights: np.ndarray, feature_lambda: float,
                curvature_lambda: float, count: int = 6) -> dict | None:
    if count < 4 or feature_lambda <= 0 or curvature_lambda <= 0:
        raise ValueError('Positive penalties and at least four cubic basis functions are required')
    if not (np.isfinite(x).all() and np.isfinite(weights).all() and np.all(weights > 0)):
        raise ValueError('Finite observations and positive evidence weights are required')
    lower, upper = float(x.min()), float(x.max())
    if upper - lower <= 1e-12:
        return None
    knots = ([0.0] * 4 + np.linspace(0, 1, count - 2)[1:-1].tolist() + [1.0] * 4)
    eigenvalues, vectors = np.linalg.eigh(roughness(knots))
    positive = eigenvalues > max(float(eigenvalues.max()), 1.0) * 1e-10
    values = eigenvalues[positive]
    normalized = values / values.mean()
    transform = vectors[:, positive] / np.sqrt(normalized)[None, :]
    transform *= math.sqrt(feature_lambda / curvature_lambda)
    z = (x - lower) / (upper - lower)
    columns = extended_basis(z, knots) @ transform
    affine = np.column_stack([np.ones(len(x)), z])
    root_weight = np.sqrt(weights)
    projection = np.linalg.lstsq(
        affine * root_weight[:, None], columns * root_weight[:, None], rcond=None)[0]
    return {
        'schema_version': 1, 'lower': lower, 'upper': upper, 'knots': knots,
        'transform': transform.tolist(), 'affine_projection': projection.tolist(),
        'feature_names': [PREFIX + str(i) for i in range(len(values))],
        'roughness_normalization': float(values.mean()),
        'curvature_lambda': curvature_lambda,
        'extrapolation': 'linear_boundary_continuation'}


def encoded(x: np.ndarray, state: dict) -> np.ndarray:
    z = (x - state['lower']) / (state['upper'] - state['lower'])
    columns = extended_basis(z, state['knots']) @ np.asarray(state['transform'])
    affine = np.column_stack([np.ones(len(x)), z])
    return columns - affine @ np.asarray(state['affine_projection'])


def values_for(row: dict, state: dict) -> np.ndarray:
    projections = state.get('backbone_projections')
    factor = 1.0
    if projections is not None:
        count = state['anchor_months'].get(row['family'], 0)
        factor = count / (count + state['anchor_strength'])
        if not count:
            return np.zeros(len(state['feature_names']))
    values = encoded(np.asarray([row['features']['log_index']]), state)[0]
    if projections is not None:
        values = values - np.asarray([
            ORIGINAL_PREDICT(row, projection) - row['x'] for projection in projections])
    return values * factor


def augment_fit(rows: list[dict], candidate: dict, reference: dict,
                weights: np.ndarray) -> dict:
    x = np.asarray([row['features']['log_index'] for row in rows])
    state = build_state(x, weights, candidate['feature_lambda'],
                        candidate['curvature_lambda'], candidate.get('spline_count', 6))
    if state is None:
        return {**reference, 'curvature_state': None, '_literature_method': 'ridge_curvature'}
    names = state['feature_names']
    values = encoded(x, state)
    if candidate.get('curvature_pooling') == 'anchored_backbone_orthogonal':
        state['anchor_months'] = dict(reference['labels_per_game'])
        state['anchor_strength'] = candidate['curvature_anchor_strength']
        prepared = [service.within_game_observation(row, reference['game_index_means'])
                    if 'log_index_within' in candidate['features'] else row for row in rows]
        factors = {
            name: count / (count + state['anchor_strength'])
            for name, count in state['anchor_months'].items()}
        projections = []
        for column in range(len(names)):
            projection_rows = [
                {**row, 'log_y': row['x'] + float(values[i, column]),
                 'weight': row.get('weight', 1.0) * factors[row['family']]}
                for i, row in enumerate(prepared)]
            # The native unpenalized fit projects onto precisely the original
            # class/features/game/slopes design, with the same recency weights.
            projection = fit.fit_shrunk(
                projection_rows, lam=0.0, feature_lam=0.0,
                feature_names=candidate['features'], half_life=candidate['half_life'],
                game_slope_feature=reference.get('game_slope_feature'),
                game_slope_lam=0.0 if reference.get('game_slope_feature') else math.inf)
            projections.append(projection)
        state['backbone_projections'] = projections
        values = np.asarray([values_for(row, state) for row in prepared])
    transformed = [
        {**row, 'features': {**row['features'], **dict(zip(names, vector.tolist()))}}
        for row, vector in zip(rows, values)]
    fitted = service.fit_model(transformed, {**candidate, 'features': candidate['features'] + names})
    fitted['curvature_state'] = state
    fitted['_literature_method'] = 'ridge_curvature'
    # Internal encodings are not independently observed inputs. The original
    # measured feature domain still blocks unsupported extrapolation.
    fitted['feature_domain'] = {
        name: domain for name, domain in fitted['feature_domain'].items() if name not in names}
    return fitted


def predict(row: dict, fitted: dict) -> float | None:
    if 'log_index_within' in fitted['feature_names']:
        row = service.within_game_observation(row, fitted['game_index_means'])
    state = fitted.get('curvature_state')
    if state is not None:
        values = values_for(row, state)
        row = {**row, 'features': {**row['features'],
                                 **dict(zip(state['feature_names'], values.tolist()))}}
    return ORIGINAL_PREDICT(row, fitted)
