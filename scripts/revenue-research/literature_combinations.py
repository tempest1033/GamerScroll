"""Past-only forecast combination of cached service and literature predictions.

Compare a global half-blend and a cohort-specific half-blend. The half weight
is fixed before replay; no current outcome or reserved family selects a blend.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from pathlib import Path

import history_fit as fit
import literature_intervals
import service_model as service
import service_readiness as replay
from literature_intervals import prediction_from_row
from literature_replay import BASELINE, compare, preserve_experiment_sources


def combine(baseline: dict, alternative: dict) -> dict:
    if replay.key(baseline) != replay.key(alternative):
        raise ValueError('Combination components refer to different targets')
    if baseline['status'] != 'estimated':
        return baseline
    if alternative['status'] != 'estimated':
        return {key: baseline[key] for key in ('family', 'month', 'class')} | {
            'status': 'unavailable', 'reason': 'combination_component_unavailable'}
    prior = min(baseline['prior_months'], alternative['prior_months'])
    saturated = baseline['rank_saturated'] or alternative['rank_saturated']
    return {
        **baseline,
        'estimate': math.exp((math.log(baseline['estimate']) +
                              math.log(alternative['estimate'])) / 2.0),
        'prior_months': prior,
        'rank_saturated': saturated,
        'cohort': 'saturated' if saturated else 'seen' if prior else 'unseen',
        'out_of_domain': sorted(set(baseline['out_of_domain']) | set(alternative['out_of_domain'])),
        'first_observed_month': min(baseline['first_observed_month'],
                                    alternative['first_observed_month'])}


def select_alternative(baseline: dict, alternatives: dict, labels: list[dict],
                       metric: str, before: str, cohort: str | None) -> tuple[str | None, dict]:
    pools = {'baseline': replay.candidate_errors(baseline, labels, metric, before)}
    pools.update({name: replay.candidate_errors(predictions, labels, metric, before)
                  for name, predictions in alternatives.items()})
    if cohort is not None:
        pools = {name: [row for row in rows if row['cohort'] == cohort]
                 for name, rows in pools.items()}
    common = set.intersection(*({replay.key(row) for row in rows} for rows in pools.values()))
    detail = {'month': before, 'cohort': cohort, 'common_rows': len(common),
              'common_months': len({key[1] for key in common})}
    if len(common) < 10 or detail['common_months'] < 2:
        return None, {**detail, 'mode': 'retain_baseline_warmup'}
    scores = {name: statistics.fmean(abs(row['log_error']) for row in rows
                                    if replay.key(row) in common)
              for name, rows in pools.items()}
    candidate = min(alternatives, key=lambda name: (scores[name], name))
    improved = scores[candidate] < scores['baseline']
    return (candidate if improved else None), {
        **detail, 'mode': 'past_only_half_blend' if improved else 'retain_better_baseline',
        'candidate': candidate if improved else None, 'baseline_mae_log': scores['baseline'],
        'alternative_mae_log': scores[candidate], 'fixed_alternative_weight': 0.5}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default=BASELINE)
    parser.add_argument('--inputs', nargs='+', required=True)
    parser.add_argument('--metric', choices=['consumer_spend', 'downloads'], required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    baseline = json.loads((replay.ROOT / args.baseline).read_text(encoding='utf-8'))
    reference = next(row for row in baseline['metrics'] if row['metric'] == args.metric)
    previous = [row for row in reference['validation_rows'] if not row['reserved_family']]
    baseline_predictions = {replay.key(row): prediction_from_row(row) for row in previous}
    by_method = {}
    for name in args.inputs:
        artifact = json.loads((replay.ROOT / name).read_text(encoding='utf-8'))
        if not artifact['execution_ok'] or not artifact['completed']:
            raise ValueError(f'Failed or incomplete input: {name}')
        if artifact['metric'] != args.metric or artifact['baseline'] != args.baseline:
            raise ValueError(f'Incompatible candidate input: {name}')
        for result in artifact['results']:
            method_predictions = {}
            for candidate_id, candidate in result['literature_candidate_predictions'].items():
                predictions = {replay.key(row): row for row in candidate['predictions']}
                method_predictions[candidate_id] = predictions
            # An explicitly later input supersedes an earlier implementation
            # of that method; do not silently retain obsolete solver variants.
            by_method[result['method']] = method_predictions
    alternatives = {}
    for predictions_by_id in by_method.values():
        for candidate_id, predictions in predictions_by_id.items():
            if candidate_id in alternatives and alternatives[candidate_id] != predictions:
                raise ValueError(f'Conflicting cached forecasts for {candidate_id}')
            alternatives[candidate_id] = predictions
    if not alternatives:
        raise ValueError('No alternative forecasts')
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    _, names = fit.identity_families()
    truth, _ = service.monthly_labels(raw, sources, set(names), args.metric, baseline['as_of'])
    truth = {replay.key(row): row for row in service.unique_targets(truth, args.metric)}
    record = {
        'kind': 'past_only_forecast_combination_diagnostic', 'metric': args.metric,
        'production_enabled': False, 'release_policy_changed': False,
        'reserved_outcomes_used_for_selection': False, 'baseline': args.baseline,
        'strategies_fixed_before_run': ['global_half_blend', 'cohort_half_blend'],
        'active_method_candidates': {name: sorted(values) for name, values in by_method.items()},
        'alternative_weight': 0.5, 'execution_ok': False, 'completed': False, 'results': [],
        'experiment_sources': preserve_experiment_sources([Path(__file__),
                                                           Path(literature_intervals.__file__)]),
        'input_hashes': replay.hashes([
            args.baseline, *args.inputs, 'docs/research/anchors/anchors.jsonl',
            'docs/research/anchors/sources.json', 'docs/research/anchors/identities.json']),
        'limitations': [
            'Retrospective development, not independent future validation.',
            'The geometric half average is applied to point forecasts, not independent predictive distributions.',
            'Combination intervals are recalibrated on their own earlier issued forecasts.',
            'No component failure is replaced with a successful forecast.']}
    output = replay.ROOT / args.output
    service.write_atomic(output, record, immutable=True)
    try:
        for strategy in record['strategies_fixed_before_run']:
            started = time.perf_counter()
            selected, rows, selections = {}, [], []
            for month in sorted({row['month'] for row in previous}):
                cutoff = min(replay.next_month(month) + '-01', baseline['as_of'])
                vintage, _ = service.monthly_labels(raw, sources, set(names), args.metric, cutoff)
                cohorts = ('seen', 'unseen', 'saturated') if strategy == 'cohort_half_blend' else (None,)
                choices = {}
                for cohort in cohorts:
                    candidate, detail = select_alternative(
                        baseline_predictions, alternatives, vintage, args.metric, month, cohort)
                    choices[cohort] = candidate
                    selections.append(detail)
                past = replay.candidate_errors(selected, vintage, args.metric, month)
                for target in (row for row in previous if row['month'] == month):
                    key = replay.key(target)
                    prediction = baseline_predictions[key]
                    cohort = prediction.get('cohort') if strategy == 'cohort_half_blend' else None
                    chosen = choices.get(cohort)
                    if chosen is not None:
                        prediction = combine(prediction, alternatives[chosen][key])
                    selected[key] = prediction
                    row = service.interval(prediction, past, args.metric)
                    measured = service.residual(prediction, truth[key])
                    if measured:
                        row.update({field: measured[field] for field in
                                    ('actual', 'available_on', 'source_id', 'error_pct', 'log_error')})
                    rows.append({**row, 'reserved_family': False})
            report = {'validation_rows': rows, 'selection': selections,
                      'chosen': {'strategy': strategy, 'alternative_weight': 0.5},
                      'candidate_count': len(alternatives) + 1,
                      'seconds': time.perf_counter() - started}
            result = {'strategy': strategy, **compare(report, reference),
                      'assessment': service.assess(rows, args.metric)}
            record['results'].append(result)
            service.write_atomic(output, record)
            print(json.dumps({key: result[key] for key in
                              ('strategy', 'common_after', 'fixed_available_after',
                               'lost_computable_keys')}), flush=True)
        record.update(execution_ok=True, completed=True)
        service.write_atomic(output, record)
    except Exception as error:
        record.update(error_type=type(error).__name__, error=str(error))
        service.write_atomic(output, record)
        raise


if __name__ == '__main__':
    main()
