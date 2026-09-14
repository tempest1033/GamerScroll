"""Bounded, reproducible nonlinear-model screen with preserved failures."""
from __future__ import annotations

import argparse
import json
import time
import warnings
from collections import Counter
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as replay
import target_diverse_models as diverse
from service_inputs import load_service_payloads
from target_accuracy_loop import compare


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--metric', choices=tuple(replay.REPORTS), required=True)
    parser.add_argument('--methods', nargs='+', choices=diverse.METHODS, default=list(diverse.METHODS))
    parser.add_argument('--representations', nargs='+', choices=diverse.REPRESENTATIONS,
                        default=list(diverse.REPRESENTATIONS))
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    baseline = json.loads((replay.ROOT / args.baseline /
                           'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    reference = next(row for row in baseline['metrics'] if row['metric'] == args.metric)
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    payloads, paths = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    replay.configure(args.metric)
    seed = json.loads((replay.ROOT / replay.REPORTS[args.metric]).read_text(encoding='utf-8'))
    prepared = replay.prepare_indices(diverse.BASE_OPTIONS(args.metric, seed), payloads, baseline['as_of'])
    output = {
        'kind': 'target_5_20_diverse_models', 'metric': args.metric,
        'baseline': args.baseline, 'as_of': baseline['as_of'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'production_enabled': False, 'release_ready': False, 'independent_validation': False,
        'methods_fixed_before_run': args.methods,
        'representations_fixed_before_run': args.representations,
        'runtime': {name: metadata.version(name) for name in ('numpy', 'scipy', 'scikit-learn')},
        'source_hashes': replay.hashes([
            Path(diverse.__file__).relative_to(replay.ROOT).as_posix(),
            'scripts/revenue-research/target_diverse_replay.py',
            'scripts/revenue-research/target_accuracy_loop.py',
            'scripts/revenue-research/literature_models.py',
            'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
            *replay.inference_input_paths(args.metric), *paths.values(),
        ]),
        'results': [], 'failures': [],
    }
    for representation in args.representations:
        for method in args.methods:
            started = time.perf_counter()
            trial = {'method': method, 'representation': representation}
            try:
                with warnings.catch_warnings(record=True) as caught, \
                        patch.object(replay, 'prepare_indices', return_value=prepared), \
                        patch.object(replay, 'candidates', side_effect=lambda metric, seed:
                                     diverse.options(metric, seed, method, representation)), \
                        patch.object(replay, 'fit_model', side_effect=diverse.fit_model), \
                        patch.object(fit, 'predict', side_effect=diverse.predict):
                    warnings.simplefilter('always')
                    report, _, preview = replay.evaluate_metric(
                        args.metric, raw, sources, payloads, names, baseline['as_of'])
                warning_counts = Counter(f'{type(item.message).__name__}: {item.message}' for item in caught)
                comparison = compare(report, reference)
                trial.update(execution_ok=True, comparison=comparison, report=report, preview=preview,
                             warnings=dict(warning_counts), seconds=time.perf_counter() - started)
                output['results'].append(trial)
                print(json.dumps({
                    'method': method, 'representation': representation,
                    'fixed_available': comparison['fixed_available']['after'],
                    'all_development': comparison['all']['after'],
                    'lost_available': comparison['lost_available'],
                    'catalog_available': comparison['catalog_available'],
                    'warnings': sum(warning_counts.values()), 'seconds': trial['seconds'],
                }), flush=True)
            except Exception as error:
                trial.update(execution_ok=False, error_type=type(error).__name__, error=str(error),
                             seconds=time.perf_counter() - started)
                output['failures'].append(trial)
                print(json.dumps(trial), flush=True)
            checkpoint = Path(args.output).with_stem(
                Path(args.output).stem + '-' + representation + '-' + method)
            model.write_atomic(replay.ROOT / checkpoint, trial, immutable=True)
    output['execution_ok'] = not output['failures']
    model.write_atomic(replay.ROOT / args.output, output, immutable=True)
    print(json.dumps({'output': args.output, 'execution_ok': output['execution_ok'],
                      'completed': len(output['results']), 'failed': len(output['failures'])}), flush=True)
    if output['failures']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
