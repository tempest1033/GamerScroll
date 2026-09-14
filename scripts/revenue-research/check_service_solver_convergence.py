"""Bounded numerical check of frozen-choice service fits on development rows.

Compute the ridge/Huber objective and stationarity from its published formula,
independently of the solver's matrix construction. More iterations are a
diagnostic, not a new candidate or an adoption decision.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as run
from service_inputs import load_service_payloads


def objective(rows, fitted):
    latest = max(int(r['month'][:4]) * 12 + int(r['month'][5:7]) for r in rows)
    gradient = defaultdict(float)
    value = 0.0
    weight_sum = 0.0
    for row in rows:
        features = dict(row['features'])
        if 'log_index_within' in fitted['feature_names']:
            features['log_index_within'] = (
                features['log_index'] - fitted['game_index_means'][row['family']])
        terms = {('class', row['class']): 1.0, ('game', row['family']): 1.0}
        correction = fitted['log_scale'][row['class']] + fitted['b'][row['family']]
        for name, coefficient in fitted['beta'].items():
            feature = features[name] - (fitted['centre'] if name == 'log_index' else 0.0)
            correction += coefficient * feature
            terms[('feature', name)] = feature
        if 'game_slopes' in fitted:
            feature = features[fitted['game_slope_feature']]
            correction += fitted['game_slopes'][row['family']] * feature
            terms[('slope', row['family'])] = feature
        error = row['log_y'] - row['x'] - correction
        delta = fitted['huber_delta']
        loss = error * error if abs(error) <= delta else 2 * delta * abs(error) - delta * delta
        age = latest - (int(row['month'][:4]) * 12 + int(row['month'][5:7]))
        weight = row['weight']
        if fitted['half_life'] != math.inf:
            weight *= 0.5 ** (age / fitted['half_life'])
        value += weight * loss
        weight_sum += weight
        score = max(-delta, min(delta, error))
        for term, feature in terms.items():
            gradient[term] -= weight * score * feature
    for kind, coefficients, penalty in (
        ('feature', fitted['beta'], fitted['feature_lambda']),
        ('game', fitted['b'], fitted['lambda']),
        ('slope', fitted.get('game_slopes', {}), fitted.get('game_slope_lambda', math.inf)),
    ):
        if penalty == math.inf:
            continue
        for name, coefficient in coefficients.items():
            value += penalty * coefficient * coefficient
            gradient[(kind, name)] += penalty * coefficient
    return {
        'objective': value,
        'max_gradient_per_weight': max(map(abs, gradient.values())) / weight_sum,
    }


def main():
    as_of = '2026-09-13'
    reference = json.loads((run.ROOT / 'reports/rank-models/service-readiness.json').read_text())
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text())
    payloads, _ = load_service_payloads(as_of)
    _, names = fit.identity_families()
    original = fit.fit_shrunk
    checks = []
    for report in reference['metrics']:
        metric = report['metric']
        run.configure(metric)
        seed = json.loads((run.ROOT / run.REPORTS[metric]).read_text())
        options = {item['id']: item for item in run.candidates(metric, seed)}
        chosen = [options[s['candidate']] for s in report['selection']]
        indices, _, _ = run.prepare_indices(chosen, payloads, as_of)
        for selection in report['selection']:
            month = selection['month']
            candidate = options[selection['candidate']]
            if 'huber_delta' not in candidate:
                continue
            cutoff = model.next_month(month) + '-01'
            labels, _ = model.monthly_labels(raw, sources, set(names), metric, min(cutoff, as_of))
            index = indices[run.index_key(candidate)]
            training = model.training_rows(labels, index, names, month, as_of=cutoff)
            before = model.fit_model(training, candidate)
            if before is None:
                continue
            with patch.object(fit, 'fit_shrunk',
                              side_effect=lambda *a, **kw: original(*a, **kw, iterations=80)):
                after = model.fit_model(training, candidate)
            low, high = objective(training, before), objective(training, after)
            assert high['objective'] <= low['objective'] + 1e-10 * max(1, low['objective'])
            changes = []
            for row in report['validation_rows']:
                if row['month'] != month or row['reserved_family'] or 'error_pct' not in row:
                    continue
                predicted = model.predict_one(row['family'], month, row['class'], index, names, after)
                changes.append({
                    'family': row['family'], 'before_error_pct': row['error_pct'],
                    'after_error_pct': 100 * abs(predicted['estimate'] / row['actual'] - 1),
                    'estimate_change_pct': 100 * (predicted['estimate'] / row['estimate'] - 1),
                })
            check = {'metric': metric, 'month': month, 'candidate': candidate['id'],
                     'training_rows': len(training), 'iterations_8': low, 'iterations_80': high,
                     'development_changes': changes}
            checks.append(check)
            print(json.dumps({k: check[k] for k in ('metric', 'month', 'iterations_8', 'iterations_80')}),
                  flush=True)
    result = {
        'kind': 'independent_fixed_candidate_huber_convergence_diagnostic',
        'completed': True, 'production_enabled': False, 'reserved_outcomes_used': False,
        'iterations': [8, 80], 'results': checks,
        'limitations': ['Fixed selected candidates only; no selection or calibration recomputation.'],
    }
    model.write_atomic(
        run.ROOT / 'reports/rank-models/accuracy-five-hour-solver-convergence-2026-09-13.json', result)
    print(json.dumps({'completed': True, 'checked_fits': len(checks)}), flush=True)


if __name__ == '__main__':
    main()
