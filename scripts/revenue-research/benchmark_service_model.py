"""Compare cached aggregation with the independent explicit daily scorer."""
from __future__ import annotations

import json
import math
import time

import history_fit as fit
from service_model import write_atomic
from service_readiness import ROOT, complete_payloads, configure
from service_inputs import load_service_payloads
from coverage_share import market_weights


def main() -> None:
    report = json.loads((ROOT / 'reports/rank-models/service-readiness.json').read_text(encoding='utf-8'))
    params = next(r['chosen']['params'] for r in report['metrics'] if r['metric'] == 'consumer_spend')
    configure('consumer_spend')
    payloads, _ = complete_payloads(load_service_payloads(report['as_of'])[0],
                                   market_weights(), ('grossing',))
    start = time.perf_counter()
    expected = fit.monthly_index(payloads, params)
    reference_seconds = time.perf_counter() - start
    start = time.perf_counter()
    tables, names = fit.rank_tables(payloads)
    flatten_seconds = time.perf_counter() - start
    start = time.perf_counter()
    actual = fit.monthly_index_fast(payloads, tables, names, params)
    aggregate_seconds = time.perf_counter() - start
    checked = 0
    maximum = 0.0
    if set(actual) != set(expected):
        raise AssertionError('Month sets differ')
    for month in expected:
        for field in ('observed_days', 'calendar_days'):
            if actual[month][field] != expected[month][field]:
                raise AssertionError(f'{month}:{field}')
        for field in ('mean_daily', 'mean_daily_free', 'max_daily', 'ios_share'):
            a, e = actual[month][field], expected[month][field]
            if set(a) != set(e):
                raise AssertionError(f'{month}:{field}: families differ')
            for game, value in e.items():
                if not math.isclose(a[game], value, rel_tol=1e-12, abs_tol=1e-9):
                    raise AssertionError(f'{month}:{field}:{game}')
                maximum = max(maximum, abs(a[game] - value) / max(abs(value), 1))
                checked += 1
    result = {'schema_version': 1, 'production_enabled': False, 'passed': True,
              'days': len(payloads), 'checked_values': checked, 'max_relative_difference': maximum,
              'reference_seconds': reference_seconds, 'flatten_seconds': flatten_seconds,
              'aggregate_seconds': aggregate_seconds,
              'speedup_including_flatten': reference_seconds / (flatten_seconds + aggregate_seconds),
              'comparison': 'same ranks and parameters; independent score_best_ranks daily implementation',
              'not_an_accuracy_validation': True}
    write_atomic(ROOT / 'reports/rank-models/service-optimization.json', result)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
