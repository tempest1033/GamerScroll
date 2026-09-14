"""Development-only experiments for heterogeneous download response.

No reserved outcome chooses a candidate family, and no production artifact is
written. Each candidate still goes through the publication-aware nested replay.
The augmented ridge features below are an experimental representation of random
slopes, not a second service inference implementation.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
from collections import defaultdict
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as run
from accuracy_hour_experiments import summarize
from service_inputs import load_service_payloads

BASELINE = (
    'reports/rank-models/accuracy-five-hour-baseline-y63p2n4q/'
    'reports/rank-models/service-readiness.json')


def baseline_module(name: str):
    """Keep the comparison algorithm fixed after adopting service changes."""
    path = (run.ROOT / BASELINE).parents[2] / 'scripts/revenue-research' / (name + '.py')
    spec = importlib.util.spec_from_file_location('five_hour_baseline_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ORIGINAL_CANDIDATES = baseline_module('service_readiness').candidates
ORIGINAL_FIT = baseline_module('service_model').fit_model
ORIGINAL_PREDICT = fit.predict
RANDOM_PREFIX = '__random_index_slope__:'


def options(metric: str, seed: dict, hypothesis: str) -> list[dict]:
    baseline = ORIGINAL_CANDIDATES(metric, seed)
    if hypothesis == 'baseline':
        return baseline
    additions = []
    for original in baseline:
        if 'log_index_within' not in original['features'] and metric != 'consumer_spend':
            continue
        item = copy.deepcopy(original)
        item.pop('id')
        if 'log_index_within' not in item['features']:
            item['features'].append('log_index_within')
        if hypothesis in ('random_slopes_025', 'random_slopes_1'):
            item['random_slope_lambda'] = 0.25 if hypothesis.endswith('025') else 1.0
        elif hypothesis == 'pooled_within' and metric == 'consumer_spend':
            pass
        elif hypothesis == 'within_covariates':
            item['within_features'] = [
                name for name in item['features']
                if name not in ('log_index', 'log_index_within')]
            item['features'] += [name + '_within' for name in item['within_features']]
        else:
            raise ValueError(f'Unknown hypothesis: {hypothesis}')
        item['id'] = model.digest(item)[:16]
        additions.append(item)
    return baseline + additions


def trial_fit(rows: list[dict], candidate: dict) -> dict | None:
    if not rows or len({row['month'] for row in rows}) < 2:
        return None
    within = candidate.get('within_features', [])
    random_lambda = candidate.get('random_slope_lambda')
    if not within and random_lambda is None:
        return ORIGINAL_FIT(rows, candidate)
    by_game = defaultdict(list)
    for row in rows:
        by_game[row['family']].append(row)
    references = {
        game: {
            name: sum(row['weight'] * row['features'][name] for row in values)
            / sum(row['weight'] for row in values)
            for name in ['log_index', *within]}
        for game, values in by_game.items()}
    transformed = []
    random_names = [RANDOM_PREFIX + game for game in sorted(by_game)] if random_lambda is not None else []
    scale = math.sqrt(candidate['feature_lambda'] / random_lambda) if random_lambda is not None else 0.0
    for row in rows:
        reference = references[row['family']]
        features = dict(row['features'])
        features.update({name + '_within': features[name] - reference[name] for name in within})
        if random_names:
            features.update(dict.fromkeys(random_names, 0.0))
            features[RANDOM_PREFIX + row['family']] = (
                features['log_index'] - reference['log_index']) * scale
        transformed.append({**row, 'features': features})
    augmented = {**candidate, 'features': candidate['features'] + random_names}
    fitted = ORIGINAL_FIT(transformed, augmented)
    if fitted is None:
        return None
    if within:
        fitted['within_feature_references'] = references
        fitted['within_features'] = within
    if random_names:
        fitted['random_index_slopes'] = {
            name.removeprefix(RANDOM_PREFIX): fitted['beta'].pop(name) * scale
            for name in random_names}
        fitted['feature_names'] = [name for name in fitted['feature_names'] if name not in random_names]
        for name in random_names:
            fitted['feature_domain'].pop(name)
    return fitted


def trial_predict(row: dict, fitted: dict) -> float | None:
    features = dict(row['features'])
    reference = fitted.get('within_feature_references', {}).get(row['family'], {})
    for name in fitted.get('within_features', []):
        features[name + '_within'] = features[name] - reference.get(name, features[name])
    value = ORIGINAL_PREDICT({**row, 'features': features}, fitted)
    if value is not None:
        value += fitted.get('random_index_slopes', {}).get(row['family'], 0.0) * features.get(
            'log_index_within', 0.0)
    # predict_one also checks the domain after prediction.
    row['features'].update(features)
    return value


def comparison(report: dict, reference: dict) -> dict:
    summary = summarize(report, reference)
    previous = {run.key(row): row for row in reference['validation_rows']
                if not row['reserved_family'] and row['status'] == 'available'}
    common = [row for row in summary['nonreserved_rows']
              if run.key(row) in previous and 'error_pct' in row]
    summary['fixed_available_before'] = model.error_summary([previous[run.key(row)] for row in common])
    summary['fixed_available_after'] = model.error_summary(common)
    summary['available_after'] = model.error_summary([
        row for row in summary['nonreserved_rows'] if row['status'] == 'available'])
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metric', choices=['downloads', 'consumer_spend'], default='downloads')
    parser.add_argument('--as-of', default='2026-09-13')
    parser.add_argument('--baseline', default=BASELINE)
    parser.add_argument('--output', required=True)
    parser.add_argument('--hypotheses', nargs='+', default=[
        'baseline', 'random_slopes_025', 'random_slopes_1', 'within_covariates'])
    args = parser.parse_args()
    reference = json.loads((run.ROOT / args.baseline).read_text(encoding='utf-8'))
    reference = next(item for item in reference['metrics'] if item['metric'] == args.metric)
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(args.as_of)
    _, names = fit.identity_families()
    results = []
    for hypothesis in args.hypotheses:
        with patch.object(run, 'candidates', side_effect=lambda metric, seed: options(metric, seed, hypothesis)), \
                patch.object(run, 'fit_model', side_effect=trial_fit), \
                patch.object(fit, 'predict', side_effect=trial_predict):
            report, _, _ = run.evaluate_metric(args.metric, raw, sources, payloads, names, args.as_of)
        summary = {'hypothesis': hypothesis, **comparison(report, reference)}
        results.append(summary)
        model.write_atomic(run.ROOT / args.output, {
            'kind': 'nonreserved_retrospective_diagnostic',
            'as_of': args.as_of,
            'baseline': args.baseline,
            'hypotheses_fixed_before_run': args.hypotheses,
            'completed': len(results) == len(args.hypotheses),
            'reserved_outcomes_used_for_selection': False,
            'production_enabled': False,
            'release_policy_changed': False,
            'results': results,
            'limitations': ['Repeated retrospective development is not fresh independent validation.'],
        })
        print(json.dumps({key: summary[key] for key in [
            'hypothesis', 'common_after', 'fixed_available_after', 'available_nonreserved_rows'
        ]}), flush=True)


if __name__ == '__main__':
    main()
