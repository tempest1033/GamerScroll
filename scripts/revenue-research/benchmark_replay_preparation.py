"""Compare replay preparation with the preserved pre-optimization implementation.

One old/new pair per metric verifies complete numerical/availability semantics
and measures wall time. No service generation or production switch is changed.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import time
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as run
from service_inputs import load_service_payloads

BASELINE = 'reports/rank-models/accuracy-five-hour-cluster-baseline-mji69u77'


def baseline_module(name):
    path = run.ROOT / BASELINE / 'scripts/revenue-research' / (name + '.py')
    spec = importlib.util.spec_from_file_location('pre_optimization_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--output', default='reports/rank-models/accuracy-five-hour-replay-optimization-2026-09-13.json')
    args = parser.parse_args()
    old_run = baseline_module('service_readiness')
    old_fit = baseline_module('history_fit')
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads('2026-09-13')
    _, names = fit.identity_families()
    results = []
    for metric in ('consumer_spend', 'downloads'):
        started = time.perf_counter()
        with patch.object(fit, 'training_before', old_fit.training_before):
            before = old_run.evaluate_metric(metric, raw, sources, payloads, names, '2026-09-13')
        old_seconds = time.perf_counter() - started
        started = time.perf_counter()
        after = run.evaluate_metric(metric, raw, sources, payloads, names, '2026-09-13')
        new_seconds = time.perf_counter() - started
        # Numerical outputs, availability, selections and coefficients must
        # match. A later security review added a frozen dependency; shared
        # provenance hashes must still match and added entries are reported.
        before[0].pop('seconds')
        after[0].pop('seconds')
        old_hashes = before[1].pop('inference_input_hashes')
        new_hashes = after[1].pop('inference_input_hashes')
        assert old_hashes.items() <= new_hashes.items(), f'Changed shared provenance for {metric}'
        assert before == after, f'Observable replay output changed for {metric}'
        results.append({
            'metric': metric, 'outputs_identical': True,
            'before_seconds': old_seconds, 'after_seconds': new_seconds,
            'speedup': old_seconds / new_seconds,
            'validation_targets': len(after[0]['validation_rows']),
            'preview_families': len(after[2]['rows']),
            'added_frozen_dependencies': sorted(set(new_hashes) - set(old_hashes)),
        })
    result = {
        'ok': True, 'kind': 'replay_preparation_equivalence_and_timing',
        'baseline': BASELINE, 'production_enabled': False, 'results': results,
        'limitations': ['Single paired wall-time measurement, not an accuracy result or throughput guarantee.'],
    }
    model.write_atomic(run.ROOT / args.output, result)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
