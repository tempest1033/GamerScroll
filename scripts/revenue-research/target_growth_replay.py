"""Evaluate published-growth supervision without modifying observed labels."""
import hashlib
import html
import json
import re
from unittest.mock import patch

import history_fit as fit
import service_model as model
import service_readiness as replay
from service_inputs import load_service_payloads
from target_accuracy_loop import compare
from target_growth_models import BASE_OPTIONS, GrowthAdapter


def main():
    baseline_path = 'reports/rank-models/target-5-20-baseline-1ym9dq8t'
    baseline = json.loads((replay.ROOT / baseline_path / 'reports/rank-models/service-readiness.json')
                          .read_text(encoding='utf-8'))
    evidence_path = 'reports/rank-models/target-5-20-growth-evidence.json'
    evidence = json.loads((replay.ROOT / evidence_path).read_text(encoding='utf-8'))
    body = (replay.ROOT / evidence['preserved_body']).read_text(encoding='utf-8')
    text = html.unescape(re.sub(r'<[^>]+>', '', body))
    for quote in [evidence['scope_quote'], *(row['quote'] for row in evidence['rows'])]:
        if quote not in text:
            raise ValueError(f'Published growth evidence missing from preserved body: {quote}')
    raw = fit.ledger_rows()
    sources = json.loads((replay.ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
    if sources[evidence['source_id']]['published_on'] != evidence['published_on']:
        raise ValueError('Growth source publication differs from the verified registry')
    payloads, _ = load_service_payloads(baseline['as_of'])
    _, names = fit.identity_families()
    metric = 'consumer_spend'
    reference = next(row for row in baseline['metrics'] if row['metric'] == metric)
    replay.configure(metric)
    seed = json.loads((replay.ROOT / replay.REPORTS[metric]).read_text(encoding='utf-8'))
    prepared = replay.prepare_indices(BASE_OPTIONS(metric, seed), payloads, baseline['as_of'])
    result = {
        'kind': 'published_growth_constraint_experiment', 'metric': metric,
        'production_enabled': False, 'independent_validation': False, 'baseline': baseline_path,
        'observed_labels_unchanged': True, 'new_point_labels_created': 0,
        'evidence': evidence_path,
        'body_sha256': hashlib.sha256((replay.ROOT / evidence['preserved_body']).read_bytes()).hexdigest(),
        'results': [],
    }
    for penalty in (0.25, 1.0):
        adapter = GrowthAdapter(evidence, prepared[0], names, penalty)
        with patch.object(replay, 'prepare_indices', return_value=prepared), \
                patch.object(replay, 'training_rows', side_effect=adapter.training_rows), \
                patch.object(replay, 'candidates', side_effect=adapter.options), \
                patch.object(replay, 'fit_model', side_effect=adapter.fit_model), \
                patch.object(fit, 'predict', side_effect=adapter.predict):
            report, _, preview = replay.evaluate_metric(
                metric, raw, sources, payloads, names, baseline['as_of'])
        comparison = compare(report, reference)
        if any(row['cutoff'] < evidence['published_on'] for row in adapter.audit):
            raise ValueError('A growth constraint entered before its publication')
        result['results'].append({'penalty': penalty, 'comparison': comparison,
                                  'report': report, 'preview': preview, 'fit_audit': adapter.audit})
        print(json.dumps({'penalty': penalty, 'comparison': comparison,
                          'growth_fit_calls': len(adapter.audit)}), flush=True)
    result['execution_ok'] = True
    model.write_atomic(replay.ROOT / 'reports/rank-models/target-5-20-growth-replay.json',
                       result, immutable=True)


if __name__ == '__main__':
    main()
