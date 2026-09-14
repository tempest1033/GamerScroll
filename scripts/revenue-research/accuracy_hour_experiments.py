"""Bounded accuracy diagnostics; never publishes or changes service model inputs.

Candidate-family decisions use nonreserved games only. The reserved split stays
out of this diagnostic summary; it is evaluated once after a decision is frozen.
All predictions still use the service runner's publication-aware outer replay.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from unittest.mock import patch

import history_fit as fit
import service_readiness as run
from service_inputs import load_service_payloads
from service_model import digest, error_summary, write_atomic


def options(metric: str, seed: dict, hypothesis: str) -> list[dict]:
    original = run_candidates(metric, seed)
    if hypothesis == 'baseline':
        return original
    if hypothesis == 'seed_free_candidates':
        pool = options(metric, seed, 'robust_within_candidates') if metric == 'downloads' else original
        plain = {'alpha_ios': 1.2, 'alpha_aos': 0.6 if metric == 'consumer_spend' else 0.8,
                 'censored': 0.0, 'country_multipliers': {'CN': 3.0 if metric == 'consumer_spend' else 1.0},
                 'knee': 20.0, 'alpha_tail_ios': 1.3, 'alpha_tail_aos': 1.3}
        return [item for item in pool if item['params'] == plain]
    if hypothesis == 'expanded_game_penalties':
        return original + options(metric, seed, 'less_shrunk_games')
    if hypothesis == 'robust_candidates':
        return original + options(metric, seed, 'robust_log_loss')
    if hypothesis == 'within_game_candidates':
        return original + options(metric, seed, 'within_game_elasticity')
    if hypothesis == 'fee_class_candidates':
        return original + options(metric, seed, 'fee_class_game_effect')
    if hypothesis == 'robust_within_candidates':
        within = options(metric, seed, 'within_game_elasticity')
        robust = copy.deepcopy(within)
        for item in robust:
            item['huber_delta'] = math.log(1.5)
            item.pop('id')
            item['id'] = digest(item)[:16]
        return original + within + robust
    if hypothesis == 'blended_within_candidates':
        pool = options(metric, seed, 'robust_within_candidates')
        blended = []
        for original_item in pool:
            if 'huber_delta' not in original_item:
                continue
            item = copy.deepcopy(original_item)
            item['blend_with_base'] = True
            item.pop('id')
            item['id'] = digest(item)[:16]
            blended.append(item)
        return pool + blended
    if hypothesis == 'blended_within_only':
        return [item for item in options(metric, seed, 'blended_within_candidates')
                if item.get('blend_with_base')]
    if hypothesis == 'recent_robust_candidates':
        recent = options(metric, seed, 'recent_game_calibration')
        for item in recent:
            item['huber_delta'] = math.log(1.5)
            item.pop('id')
            item['id'] = digest(item)[:16]
        return original + recent
    result = copy.deepcopy(original)
    for item in result:
        if hypothesis == 'stronger_feature_regularization':
            item['feature_lambda'] = 1.0
        elif hypothesis == 'unit_rank_elasticity':
            item['features'] = [f for f in item['features'] if f != 'log_index']
        elif hypothesis == 'store_composition':
            if 'ios_share' not in item['features']:
                item['features'] = item['features'] + ['ios_share']
        elif hypothesis == 'primary_only':
            item['features'] = [f for f in item['features'] if f != 'free_ratio']
        elif hypothesis in ('lagged_index_change', 'history_index_change'):
            item['features'] = item['features'] + [hypothesis]
        elif hypothesis == 'recent_game_calibration':
            item['half_life'] = 1.0
        elif hypothesis == 'less_shrunk_games':
            item['lambda'] = 0.03
        elif hypothesis == 'robust_log_loss':
            item['huber_delta'] = math.log(1.5)
        elif hypothesis == 'within_game_elasticity':
            item['features'] = item['features'] + ['log_index_within']
        elif hypothesis == 'net_class_elasticity':
            item['features'] = item['features'] + ['log_index_net']
        elif hypothesis == 'gross_training_only':
            item['training_class'] = 'gross'
        elif hypothesis == 'fee_class_game_effect':
            item['group_lambda'] = 1.0
            item['group_kind'] = 'family_fee_basis'
        else:
            raise ValueError(f'Unknown hypothesis: {hypothesis}')
        item.pop('id')
        item['id'] = digest(item)[:16]
    return list({item['id']: item for item in result}.values())


run_candidates = run.candidates
observation_row = fit.observation_row
fit_shrunk = fit.fit_shrunk
fit_model = run.fit_model
predict = fit.predict


def trial_fit_model(rows: list[dict], candidate: dict):
    baseline_model = None
    if candidate.get('blend_with_base'):
        base = {k: v for k, v in candidate.items() if k != 'blend_with_base'}
        base['features'] = [name for name in base['features'] if name != 'log_index_within']
        baseline_model = trial_fit_model(rows, base)
    if candidate.get('training_class') == 'gross':
        rows = [{**row, 'weight': 1.0} for row in rows if row['class'] == 'gross']
    if candidate.get('group_kind') == 'family_fee_basis':
        rows = [{**row, 'group': f'{row["family"]}|{row["class"]}'} for row in rows]
    means = {}
    if 'log_index_within' in candidate['features']:
        by_game = defaultdict(list)
        for row in rows:
            by_game[row['family']].append(row)
        means = {name: sum(r['weight'] * r['features']['log_index'] for r in values) /
                 sum(r['weight'] for r in values) for name, values in by_game.items()}
        rows = [{**r, 'features': {**r['features'],
                'log_index_within': r['features']['log_index'] - means[r['family']]}} for r in rows]
    with patch.object(fit, 'fit_shrunk', side_effect=lambda rows, lam, feature_lam, huber, group_lam, *rest, **kwargs:
                      fit_shrunk(rows, lam, feature_lam, candidate.get('huber_delta', huber),
                                 candidate.get('group_lambda', group_lam), *rest, **kwargs)):
        model = fit_model(rows, candidate)
    if model is not None and means:
        model['game_index_means'] = means
    if model is not None and candidate.get('group_kind') == 'family_fee_basis':
        model['fee_class_groups'] = True
    if model is not None and baseline_model is not None:
        model['baseline_model'] = baseline_model
    return model


def predict_within_game(row: dict, model: dict):
    if model.get('fee_class_groups'):
        row['group'] = f'{row["family"]}|{row["class"]}'
    if 'log_index_within' in model['feature_names']:
        reference = model.get('game_index_means', {}).get(row['family'], row['features']['log_index'])
        row['features']['log_index_within'] = row['features']['log_index'] - reference
    value = predict(row, model)
    if model.get('baseline_model') is not None:
        value = (value + predict(row, model['baseline_model'])) / 2
    return value


def observation_with_change(family, key, klass, index, coverage, min_days, market=None, groups=None):
    row = observation_row(family, key, klass, index, coverage, min_days, market, groups)
    if row is None:
        return None
    past = [(month, entry['mean_daily'].get(family, 0.0)) for month, entry in sorted(index.items())
            if month < key and entry['mean_daily'].get(family, 0.0) > 0]
    current = row['features']['log_index']
    previous = next((value for month, value in reversed(past) if run.next_month(month) == key), None)
    row['features']['lagged_index_change'] = current - math.log(previous) if previous else 0.0
    row['features']['history_index_change'] = (
        current - statistics.fmean(math.log(value) for _, value in past) if past else 0.0)
    row['features']['log_index_within'] = 0.0
    return row


def summarize(report: dict, reference: dict) -> dict:
    rows = [r for r in report['validation_rows'] if not r['reserved_family']]
    before = {run.key(r): r for r in reference['validation_rows']
              if not r['reserved_family'] and 'error_pct' in r}
    common = [r for r in rows if 'error_pct' in r and run.key(r) in before]
    baseline = [before[run.key(r)] for r in common]
    return {
        'metric': report['metric'],
        'nonreserved_error': error_summary([r for r in rows if 'error_pct' in r]),
        'common_before': error_summary(baseline),
        'common_after': error_summary(common),
        'common_seen_before': error_summary([before[run.key(r)] for r in common if r['prior_months']]),
        'common_seen_after': error_summary([r for r in common if r['prior_months']]),
        'available_nonreserved_rows': sum(r['status'] == 'available' for r in rows),
        'candidate_count': report['candidate_count'],
        'chosen': report['chosen'],
        'selection': report['selection'],
        'nonreserved_rows': rows,
    }


def main() -> None:
    global run_candidates, fit_model
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metric', choices=['consumer_spend', 'downloads'], default='downloads')
    parser.add_argument('--as-of', default='2026-09-13')
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--hypotheses', nargs='+', default=[
        'baseline', 'stronger_feature_regularization', 'unit_rank_elasticity',
        'store_composition', 'primary_only'])
    args = parser.parse_args()
    # The reference snapshot owns the old implementation even after adoption.
    baseline_root = (run.ROOT / args.baseline).parents[2]
    for module_name, filename in [('baseline_runner', 'service_readiness.py'),
                                  ('baseline_model', 'service_model.py')]:
        path = baseline_root / 'scripts/revenue-research' / filename
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if module_name == 'baseline_runner':
            run_candidates = module.candidates
        else:
            fit_model = module.fit_model
    reference = json.loads((run.ROOT / args.baseline).read_text(encoding='utf-8'))
    reference = next(m for m in reference['metrics'] if m['metric'] == args.metric)
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads(args.as_of)
    _, names = fit.identity_families()
    reports = []
    hypotheses = args.hypotheses
    for hypothesis in hypotheses:
        with patch.object(run, 'candidates', side_effect=lambda metric, seed: options(metric, seed, hypothesis)), \
                patch.object(fit, 'observation_row', side_effect=observation_with_change), \
                patch.object(run, 'fit_model', side_effect=trial_fit_model), \
                patch.object(fit, 'predict', side_effect=predict_within_game):
            result, _, _ = run.evaluate_metric(args.metric, raw, sources, payloads, names, args.as_of)
        summary = {'hypothesis': hypothesis, **summarize(result, reference)}
        reports.append(summary)
        write_atomic(run.ROOT / args.output, {
            'kind': 'nonreserved_retrospective_diagnostic', 'as_of': args.as_of,
            'hypotheses_fixed_before_run': hypotheses, 'completed': len(reports) == len(hypotheses),
            'release_policy_changed': False, 'reserved_results_used_for_selection': False,
            'baseline': args.baseline, 'results': reports,
            'limitations': ['Repeated retrospective diagnostics are development, not fresh validation.'],
        })
        print(json.dumps({k: summary[k] for k in ['hypothesis', 'common_before', 'common_after',
                                                  'available_nonreserved_rows']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
