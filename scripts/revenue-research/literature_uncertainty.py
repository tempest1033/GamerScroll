"""Paired game/month sensitivity of cached forecasts, without refitting models.

With only a few evaluation months, percentile ranges are descriptive sensitivity
evidence, not trustworthy nominal confidence intervals or independent validation.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import service_model as service
import service_readiness as replay
from literature_replay import BASELINE, preserve_experiment_sources

STATISTICS = ('median_error_pct', 'p90_error_pct', 'mae_log', 'max_error_pct')


def paired_sensitivity(before: list[dict], after: list[dict],
                       draws: int = 2000, seed: int = 20260913) -> dict:
    if draws < 1 or not before or len(before) != len(after):
        raise ValueError('Nonempty paired rows and a positive draw count are required')
    for old, new in zip(before, after):
        if replay.key(old) != replay.key(new) or old['actual'] != new['actual']:
            raise ValueError('Paired source targets differ')
    games = sorted({row['family'] for row in before})
    months = sorted({row['month'] for row in before})
    game_index = np.asarray([games.index(row['family']) for row in before])
    month_index = np.asarray([months.index(row['month']) for row in before])
    observed_before, observed_after = service.error_summary(before), service.error_summary(after)
    result = {
        'rows': len(before), 'games': len(games), 'months': len(months),
        'observed_before': observed_before, 'observed_after': observed_after,
        'observed_difference': {key: observed_after[key] - observed_before[key] for key in STATISTICS},
        'refits': 0, 'nominal_confidence_claim': False, 'resampling': {}}
    for mode_index, mode in enumerate(('game', 'month', 'game_and_month')):
        rng = np.random.default_rng(seed + mode_index)
        changes = {key: [] for key in STATISTICS}
        empty = 0
        for _ in range(draws):
            weights = np.ones(len(before), dtype=np.int64)
            if mode in ('game', 'game_and_month'):
                counts = rng.multinomial(len(games), np.full(len(games), 1 / len(games)))
                weights *= counts[game_index]
            if mode in ('month', 'game_and_month'):
                counts = rng.multinomial(len(months), np.full(len(months), 1 / len(months)))
                weights *= counts[month_index]
            indices = np.repeat(np.arange(len(before)), weights)
            if not len(indices):
                empty += 1
                continue
            old = service.error_summary([before[i] for i in indices])
            new = service.error_summary([after[i] for i in indices])
            for key in STATISTICS:
                changes[key].append(new[key] - old[key])
        valid = draws - empty
        if not valid:
            raise ValueError('All cluster draws had empty overlap')
        result['resampling'][mode] = {
            'requested_draws': draws, 'valid_draws': valid, 'empty_overlap_draws': empty,
            'conditional_on_nonempty_overlap': True,
            'differences': {
                key: {'p025': float(np.quantile(values, 0.025)),
                      'p50': float(np.quantile(values, 0.5)),
                      'p975': float(np.quantile(values, 0.975)),
                      'fraction_below_zero': float(np.mean(np.asarray(values) < 0))}
                for key, values in changes.items()}}
    leave_one_out = {}
    for dimension, values in (('family', games), ('month', months)):
        entries = []
        for value in values:
            indices = [i for i, row in enumerate(before) if row[dimension] != value]
            if not indices:
                continue
            old = service.error_summary([before[i] for i in indices])
            new = service.error_summary([after[i] for i in indices])
            entries.append({'omitted': value, 'rows': len(indices),
                            'difference': {key: new[key] - old[key] for key in STATISTICS}})
        leave_one_out[dimension] = entries
    result['leave_one_evaluation_cluster_out'] = leave_one_out
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default=BASELINE)
    parser.add_argument('--inputs', nargs='+', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--draws', type=int, default=2000)
    args = parser.parse_args()
    baseline = json.loads((replay.ROOT / args.baseline).read_text(encoding='utf-8'))
    record = {
        'kind': 'paired_cached_forecast_cluster_sensitivity',
        'production_enabled': False, 'refits': 0, 'nominal_confidence_claim': False,
        'completed': False, 'execution_ok': False, 'results': [],
        'input_hashes': replay.hashes([args.baseline, *args.inputs]),
        'experiment_sources': preserve_experiment_sources([Path(__file__)]),
        'limitations': [
            'Few months cannot establish nominal bootstrap coverage.',
            'These draws vary evaluation composition, not the training process.',
            'All trials remain retrospective development and omit reserved families.']}
    output = replay.ROOT / args.output
    service.write_atomic(output, record, immutable=True)
    try:
        for name in args.inputs:
            artifact = json.loads((replay.ROOT / name).read_text(encoding='utf-8'))
            if not artifact['execution_ok'] or not artifact['completed']:
                raise ValueError(f'Failed or incomplete input: {name}')
            metric = artifact['metric']
            reference = next(row for row in baseline['metrics'] if row['metric'] == metric)
            before = {replay.key(row): row for row in reference['validation_rows']
                      if not row['reserved_family'] and 'error_pct' in row}
            for trial in artifact['results']:
                after = {replay.key(row): row for row in trial['nonreserved_rows']
                         if 'error_pct' in row}
                common = sorted(before.keys() & after.keys())
                for cohort, keys in (
                        ('all_computable', common),
                        ('fixed_available', [key for key in common if before[key]['status'] == 'available'])):
                    if not keys:
                        continue
                    result = {
                        'input': name, 'metric': metric, 'cohort': cohort,
                        'method': trial.get('strategy', trial.get('method')),
                        **paired_sensitivity([before[key] for key in keys],
                                             [after[key] for key in keys], args.draws)}
                    record['results'].append(result)
                    service.write_atomic(output, record)
                    print(json.dumps({
                        'metric': metric, 'method': result['method'], 'cohort': cohort,
                        'observed_difference': result['observed_difference'],
                        'joint_sensitivity': result['resampling']['game_and_month']['differences']}),
                        flush=True)
        record.update(completed=True, execution_ok=True)
        service.write_atomic(output, record)
    except Exception as error:
        record.update(error_type=type(error).__name__, error=str(error))
        service.write_atomic(output, record)
        raise


if __name__ == '__main__':
    main()
