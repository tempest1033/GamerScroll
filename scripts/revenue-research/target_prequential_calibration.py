"""Research-only calibration from past out-of-sample service predictions.

The backbone schedule is frozen. Each month's correction and interval use only
labels available at that replay cutoff. No training, ledger or service write
occurs here; immutable experiment output is the only generated artifact.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

import history_fit as fit
import service_model as model
import service_readiness as replay
from target_accuracy_loop import compare
from verify_target_accuracy_round import check_statistics, independent_statistics

METHODS = ('cohort_median', 'family_shrunk', 'family_only_shrunk')
PREDICTION_FIELDS = (
    'family', 'month', 'class', 'estimate', 'cohort', 'prior_months',
    'out_of_domain', 'rank_saturated', 'first_observed_month',
)


def prediction_only(row: dict) -> dict:
    """Discard outcomes and previously computed intervals before recalibration."""
    if 'estimate' not in row:
        return {key: row[key] for key in ('family', 'month', 'class', 'status', 'reason')}
    return {**{key: row[key] for key in PREDICTION_FIELDS}, 'status': 'estimated'}


def correction(prediction: dict, past: list[dict], cutoff: str, method: str) -> tuple[float, int]:
    """Estimate signed overprediction; sparse history shrinks toward zero."""
    if method not in METHODS:
        raise ValueError(f'Unknown calibration method: {method}')
    pool = [
        row for row in past
        if row['month'] < prediction['month']
        and row.get('available_on') and row['available_on'] <= cutoff
        and not model.reserved_game(row['family'])
        and row['class'] == prediction['class']
        and row['cohort'] == prediction['cohort']
    ]
    if not pool:
        return 0.0, 0
    if method == 'cohort_median':
        return statistics.median(row['log_error'] for row in pool) * len(pool) / (len(pool) + 8), len(pool)
    local = [row['log_error'] for row in pool if row['family'] == prediction['family']]
    centre = (sum(row['log_error'] for row in pool) / (len(pool) + 8)
              if method == 'family_shrunk' else 0.0)
    value = centre + sum(error - centre for error in local) / (len(local) + 2)
    return value, len(pool)


def recalibrate(prediction: dict, past: list[dict], cutoff: str, method: str) -> tuple[dict, dict]:
    current = copy.deepcopy(prediction)
    if current['status'] != 'estimated':
        return current, {'correction_log': 0.0, 'pool_rows': 0}
    value, count = correction(current, past, cutoff, method)
    current['estimate'] *= math.exp(-value)
    if not math.isfinite(current['estimate']) or current['estimate'] <= 0:
        raise ValueError('Calibrated estimate must be positive and finite')
    return current, {'correction_log': value, 'pool_rows': count}


def experiment(reference: dict, preview: dict, raw: list[dict], sources: dict,
               names: list[str], as_of: str, method: str) -> dict:
    metric = reference['metric']
    replay.configure(metric)
    original = {replay.key(row): prediction_only(row) for row in reference['validation_rows']}
    corrected, outer, audit = {}, [], []
    for month in sorted({row['month'] for row in reference['validation_rows']}):
        cutoff = min(model.next_month(month) + '-01', as_of)
        labels, _ = model.monthly_labels(raw, sources, set(names), metric, cutoff)
        native_past = replay.candidate_errors(original, labels, metric, month)
        corrected_past = replay.candidate_errors(corrected, labels, metric, month)
        for old in reference['validation_rows']:
            if old['month'] != month:
                continue
            identity = replay.key(old)
            prediction, detail = recalibrate(original[identity], native_past, cutoff, method)
            corrected[identity] = prediction
            row = model.interval(prediction, corrected_past, metric)
            if 'actual' in old:
                row.update(actual=old['actual'], available_on=old['available_on'], source_id=old['source_id'],
                           error_pct=100 * abs(prediction['estimate'] / old['actual'] - 1),
                           log_error=math.log(prediction['estimate'] / old['actual']))
            outer.append({**row, 'reserved_family': old['reserved_family']})
            audit.append({'key': list(identity), 'cutoff': cutoff, **detail})

    # This is the original in-sample catalog preview, not independent accuracy.
    month = preview['month']
    labels, _ = model.monthly_labels(raw, sources, set(names), metric, as_of)
    native_past = replay.candidate_errors(original, labels, metric, month)
    corrected_past = replay.candidate_errors(corrected, labels, metric, month)
    catalog = []
    for old in preview['rows']:
        prediction, _ = recalibrate(prediction_only(old), native_past, as_of, method)
        catalog.append(model.interval(prediction, corrected_past, metric))
    report = copy.deepcopy(reference)
    report.update(validation_rows=outer, assessment=model.assess(outer, metric, catalog_rows=catalog),
                  reserved_family_error=model.error_summary(
                      [row for row in outer if row['reserved_family'] and 'error_pct' in row]))
    comparison = compare(report, reference)
    before = {replay.key(row): row for row in reference['validation_rows'] if not row['reserved_family']}
    after = {replay.key(row): row for row in outer if not row['reserved_family']}
    for group, identities in (
        ('all', [key for key, row in before.items() if 'error_pct' in row]),
        ('fixed_available', [key for key, row in before.items() if row['status'] == 'available']),
    ):
        check_statistics(comparison[group]['after'], independent_statistics([after[key] for key in identities]))
    for old, row, detail in zip(reference['validation_rows'], outer, audit):
        if replay.key(old) != replay.key(row):
            raise ValueError('Temporal reconstruction changed target ordering')
        if 'estimate' in old and not math.isclose(
                row['estimate'] / old['estimate'], math.exp(-detail['correction_log']), rel_tol=1e-12):
            raise ValueError('Prediction does not follow recorded calibration')
    fixed = comparison['fixed_available']['after']
    return {
        'method': method, 'metric': metric, 'execution_ok': True, 'comparison': comparison,
        'target_met': fixed['median_error_pct'] <= 5.0 and fixed['p90_error_pct'] <= 20.0
        and not comparison['lost_available']
        and comparison['catalog_available'] >= sum(row['status'] == 'available' for row in preview['rows']),
        'report': report, 'preview': {**preview, 'rows': catalog}, 'audit': audit,
        'checks': {'independent_error_statistics': True, 'prediction_correction_relationship': True,
                   'target_amounts_sources_and_population_preserved': True},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    source_paths = [
        f'{args.baseline}/reports/rank-models/service-readiness.json',
        'reports/rank-models/service-preview.json',
        'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
        'docs/research/anchors/identities.json',
        'scripts/revenue-research/target_prequential_calibration.py',
    ]
    before_hashes = replay.hashes(source_paths)
    baseline = json.loads((replay.ROOT / source_paths[0]).read_text(encoding='utf-8'))
    preview = json.loads((replay.ROOT / source_paths[1]).read_text(encoding='utf-8'))
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / source_paths[3]).read_text(encoding='utf-8'))
    _, names = fit.identity_families()
    output = {
        'kind': 'past_only_out_of_sample_calibration', 'created_at': datetime.now(timezone.utc).isoformat(),
        'as_of': baseline['as_of'], 'baseline': args.baseline, 'source_hashes': before_hashes,
        'methods_fixed_before_run': list(METHODS), 'results': [], 'failures': [],
        'model_adopted': False, 'production_enabled': False, 'release_ready': False,
        'independent_validation': False, 'ledger_changed': False,
        'limitations': [
            'This is retrospective development reuse, not a new independent month.',
            'The original past-only backbone selection schedule is frozen, not reselected on corrected errors.',
            'Cohort shrinkage uses eight zero-error pseudo-observations; family shrinkage uses two.',
            'No correction is selected using a target-month outcome or reserved-family outcome.',
            'The current catalog preview remains in-sample; it is not an accuracy test.',
            'No new external source was retrieved and no login, cookie or session state was changed.',
        ],
    }
    for reference in baseline['metrics']:
        current_preview = next(row for row in preview['metrics'] if row['metric'] == reference['metric'])
        for method in METHODS:
            try:
                result = experiment(reference, current_preview, raw, sources, names, baseline['as_of'], method)
                output['results'].append(result)
                print(json.dumps({key: result[key] for key in ('method', 'metric', 'target_met', 'comparison')}),
                      flush=True)
            except Exception as error:
                output['failures'].append({'metric': reference['metric'], 'method': method,
                                           'type': type(error).__name__, 'error': str(error)})
    unchanged = before_hashes == replay.hashes(source_paths)
    output.update(execution_ok=not output['failures'] and unchanged, source_artifacts_unchanged=unchanged)
    model.write_atomic(replay.ROOT / args.output, output, immutable=True)
    print(json.dumps({'output': args.output, 'execution_ok': output['execution_ok'],
                      'completed': len(output['results']), 'failures': output['failures']}), flush=True)
    if not output['execution_ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
