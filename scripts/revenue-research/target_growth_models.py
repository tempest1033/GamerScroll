"""Learn shrunk temporal-response updates from published growth constraints.

These are auxiliary growth equations, never fabricated monthly amount labels.
The same fitting rule applies to every eligible constraint and does not change
the original observed anchors, evaluation population, or withholding policy.
"""
from __future__ import annotations

import math
from collections import defaultdict

import history_fit as fit
import service_model as model
import service_readiness as replay

BASE_FIT = model.fit_model
BASE_PREDICT = fit.predict
BASE_TRAINING = model.training_rows
BASE_OPTIONS = replay.candidates


def eligible_constraints(evidence: dict, rows: list[dict], before: str, cutoff: str) -> list[dict]:
    if evidence['published_on'] > cutoff:
        return []
    anchors = {(row['family'], row['month'], row['class']) for row in rows}
    return [row for row in evidence['rows']
            if row['from_month'] < row['to_month'] < before
            and (row['family'], row['to_month'], row['class']) in anchors]


def slope_update(equations: list[tuple[float, float]], penalty: float) -> float:
    return sum(x * residual for x, residual in equations) / (
        sum(x * x for x, _ in equations) + penalty)


class GrowthAdapter:
    def __init__(self, evidence: dict, indices: dict, names: list[str], penalty: float):
        self.evidence, self.indices, self.names, self.penalty = evidence, indices, names, penalty
        self.audit = []

    def training_rows(self, labels, index, names, before, reserve=True, as_of=None):
        rows = BASE_TRAINING(labels, index, names, before, reserve=reserve, as_of=as_of)
        return [{**row, '_growth_before': before, '_growth_cutoff': as_of} for row in rows]

    def options(self, metric: str, seed: dict) -> list[dict]:
        return [{**candidate, 'id': f'growth-{self.penalty}:' + candidate['id'],
                 'growth_penalty': self.penalty} for candidate in BASE_OPTIONS(metric, seed)]

    def fit_model(self, rows: list[dict], candidate: dict) -> dict | None:
        fitted = BASE_FIT(rows, candidate)
        if fitted is None:
            return fitted
        before, cutoff = rows[0]['_growth_before'], rows[0]['_growth_cutoff']
        constraints = eligible_constraints(self.evidence, rows, before, cutoff)
        index = self.indices[replay.index_key(candidate)]
        equations, centres = defaultdict(list), {}
        used = []
        for constraint in constraints:
            observations = [
                fit.observation_row(constraint['family'], month, constraint['class'],
                                    index, dict.fromkeys(self.names, 1.0), 1)
                for month in (constraint['from_month'], constraint['to_month'])]
            if any(row is None for row in observations):
                continue
            if 'log_index_within' in fitted['feature_names']:
                observations = [model.within_game_observation(row, fitted['game_index_means'])
                                for row in observations]
            old, new = observations
            predicted_change = BASE_PREDICT(new, fitted) - BASE_PREDICT(old, fitted)
            reported_change = math.log1p(constraint['reported_growth_pct'] / 100)
            x = new['features']['log_index'] - old['features']['log_index']
            identity = (constraint['family'], constraint['class'])
            equations[identity].append((x, reported_change - predicted_change))
            centres[identity] = new['features']['log_index']
            used.append({**constraint, 'index_change': x,
                         'base_predicted_log_growth': predicted_change})
        fitted['_growth_slopes'] = {
            identity: {'slope': slope_update(values, self.penalty), 'centre': centres[identity]}
            for identity, values in equations.items()}
        if used:
            self.audit.append({'before': before, 'cutoff': cutoff, 'candidate': candidate['id'],
                               'constraints': used})
        return fitted

    @staticmethod
    def predict(row: dict, fitted: dict) -> float | None:
        value = BASE_PREDICT(row, fitted)
        if value is None:
            return value
        update = fitted.get('_growth_slopes', {}).get((row['family'], row['class']))
        if update is not None:
            value += update['slope'] * (row['features']['log_index'] - update['centre'])
        return value
