"""Measure catalog-unit-coverage inference without changing replay semantics.

The preserved original and optimized predictor run on identical inputs in
alternating order. Compare every report, model, and preview value, not only
summary accuracy. No production setting or service generation is changed.
"""
from __future__ import annotations

import importlib.util
import json
import statistics
import time
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as run
from service_inputs import load_service_payloads

BASELINE = 'reports/rank-models/accuracy-five-hour-inference-baseline-izjmbq6j'


def main():
    path = run.ROOT / BASELINE / 'scripts/revenue-research/service_model.py'
    spec = importlib.util.spec_from_file_location('original_service_inference', path)
    original = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    raw = fit.ledger_rows()
    sources = json.loads((run.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, _ = load_service_payloads('2026-09-13')
    _, names = fit.identity_families()
    results = []
    for metric in ('consumer_spend', 'downloads'):
        timings = {'before': [], 'after': []}
        for repetition in range(3):
            order = ('before', 'after') if repetition % 2 == 0 else ('after', 'before')
            outputs = {}
            for label in order:
                predictor = original.predict_one if label == 'before' else model.predict_one
                started = time.perf_counter()
                with patch.object(run, 'predict_one', predictor):
                    output = run.evaluate_metric(metric, raw, sources, payloads, names, '2026-09-13')
                timings[label].append(time.perf_counter() - started)
                output[0].pop('seconds')
                outputs[label] = output
            assert outputs['before'] == outputs['after'], f'Changed observable output: {metric}'
            print(json.dumps({'metric': metric, 'completed_pair': repetition + 1,
                              'outputs_identical': True}), flush=True)
        before = statistics.median(timings['before'])
        after = statistics.median(timings['after'])
        results.append({
            'metric': metric, 'pairs': 3, 'outputs_identical': True,
            'timings': timings, 'median_before_seconds': before,
            'median_after_seconds': after, 'speedup': before / after,
        })
    report = {
        'ok': True, 'kind': 'service_inference_equivalence_and_timing',
        'baseline': BASELINE, 'production_enabled': False, 'results': results,
        'limitations': [
            'Three paired local measurements, not throughput or accuracy guarantees.',
            'Input loading and immutable artifact writes are outside measured replay time.',
        ],
    }
    model.write_atomic(
        run.ROOT / 'reports/rank-models/accuracy-five-hour-inference-optimization-2026-09-13.json',
        report)
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
