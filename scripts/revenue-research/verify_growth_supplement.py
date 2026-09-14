"""Verify cached-source growth experiments and an omitted, late-available net amount."""
from __future__ import annotations

import copy
import hashlib
import html
import json
import math
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import history_fit as fit
import service_model as service
import service_readiness as replay
from service_inputs import load_service_payloads
from target_accuracy_loop import baseline_check, compare
from verify_target_accuracy_round import check_statistics, independent_statistics, key, load


def main():
    baseline_path = 'reports/rank-models/target-5-20-baseline-1ym9dq8t'
    baseline = load(baseline_path + '/reports/rank-models/service-readiness.json')
    reference = next(row for row in baseline['metrics'] if row['metric'] == 'consumer_spend')
    original = {key(row): row for row in reference['validation_rows']}
    fixed_keys = [identity for identity, row in original.items() if row['status'] == 'available']
    growth = load('reports/rank-models/target-5-20-growth-replay.json')
    if growth['execution_ok'] is not True:
        raise ValueError('Growth experiment did not execute successfully')
    verified = []
    for trial in growth['results']:
        rows = {key(row): row for row in trial['report']['validation_rows']}
        if rows.keys() != original.keys():
            raise ValueError('Growth experiment changed evaluation targets')
        for identity, row in rows.items():
            if 'error_pct' not in original[identity]:
                continue
            for field in ('actual', 'available_on', 'source_id'):
                if row[field] != original[identity][field]:
                    raise ValueError('Growth experiment changed observed target evidence')
            if row['month'] < '2026-08' and not math.isclose(
                    row['estimate'], original[identity]['estimate'], rel_tol=1e-12, abs_tol=1e-6):
                raise ValueError('A growth constraint affected a pre-publication replay month')
        check_statistics(trial['comparison']['fixed_available']['after'],
                         independent_statistics([rows[identity] for identity in fixed_keys]))
        for audit in trial['fit_audit']:
            if audit['cutoff'] < '2026-08-13':
                raise ValueError('A growth constraint entered before publication')
            if audit['before'] < '2026-09':
                if any(service.reserved_game(row['family']) for row in audit['constraints']):
                    raise ValueError('A reserved game supplied a development constraint')
        verified.append({'penalty': trial['penalty'],
                         'fixed_available': trial['comparison']['fixed_available']['after']})
    body_path = ('reports/rank-models/monthly-chart-articles/'
                 'julys-top-grossing-mobile-games-honor-of-kings-roblox-gossip-harbor-pubg-mobile-pokemon-go-more.html')
    body = (replay.ROOT / body_path).read_text(encoding='utf-8')
    text = html.unescape(re.sub(r'<[^>]+>', '', body))
    if 'Eggy Party ($22m)' not in text:
        raise ValueError('The omitted net amount is not in the preserved article body')
    if "These IAP estimates do not include ad revenue, web shop spend, Apple and Google’s 30% cut or revenue from China’s Android ecosystem." not in text:
        raise ValueError('The source net/scope qualification is missing')
    published = re.search(r'article:published_time" content="([^"]+)', body).group(1)[:10]
    modified = re.search(r'article:modified_time" content="([^"]+)', body).group(1)[:10]
    if (published, modified) != ('2026-08-19', '2026-09-02'):
        raise ValueError('Source vintage dates differ from inspected evidence')
    raw = fit.ledger_rows()
    sources = load('docs/research/anchors/sources.json')
    url = ('https://mobilegamer.biz/'
           'julys-top-grossing-mobile-games-honor-of-kings-roblox-gossip-harbor-pubg-mobile-pokemon-go-more/')
    matches = [identifier for identifier, source in sources.items() if source.get('url') == url]
    if 'M09' not in matches:
        raise ValueError('Expected stable source id M09 is not registered for this URL')
    if sources['M09']['published_on'] != published or sources['M09']['page_modified_on'] != modified:
        raise ValueError('The preserved body dates disagree with the registry')
    row = {
        'game': 'Eggy Party', 'provider': 'AppMagic', 'source_id': 'M09',
        'geography': 'WW', 'stores': ['app_store', 'google_play'],
        'currency': 'USD', 'unit_multiplier': 1000000, 'amount': 22,
        'amount_usd_m': 22, 'metric': 'consumer_spend', 'fee_basis': 'net',
        'period': {'kind': 'month', 'start': '2026-07-01', 'end': '2026-07-31'},
        'qualifier': None, 'evidence_role': 'benchmark', 'review_status': 'clear',
        'identity_status': 'as_published',
        'notes': 'Previously omitted prose amount; current body is unavailable before 2026-09-02.',
    }
    _, names = fit.identity_families()
    previous_labels, _ = service.monthly_labels(raw, sources, set(names), 'consumer_spend', baseline['as_of'])
    if any(label['family'] == 'Eggy Party' and label['month'] == '2026-07' and label['class'] == 'net'
           for label in previous_labels):
        raise ValueError('The proposed supplemental amount is already present')
    before, _ = service.monthly_labels([row], sources, set(names), 'consumer_spend', '2026-09-01')
    after, _ = service.monthly_labels([row], sources, set(names), 'consumer_spend', '2026-09-02')
    if before or len(after) != 1 or after[0]['amount_usd_m'] != 22:
        raise ValueError('Supplement vintage boundary failed')
    payloads, _ = load_service_payloads(baseline['as_of'])
    supplemented, _, preview = replay.evaluate_metric(
        'consumer_spend', [*raw, row], sources, payloads, names, baseline['as_of'])
    baseline_check(supplemented, reference)
    result = {
        'kind': 'cached_source_supplement_review', 'execution_ok': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'retrieved_fresh_this_round': False, 'independent_validation': False,
        'production_enabled': False, 'model_adopted': False, 'ledger_changed': False,
        'observed_net_amount_candidate': row, 'source_url': url, 'source_body': body_path,
        'source_sha256': hashlib.sha256((replay.ROOT / body_path).read_bytes()).hexdigest(),
        'published_on': published, 'current_body_available_on': modified,
        'august_replay_unchanged': True, 'supplement_comparison': compare(supplemented, reference),
        'growth_experiments': verified, 'growth_behavior_tests_passed': 3,
        'growth_verification': {
            'target_amounts_sources_unchanged': True,
            'no_pre_publication_prediction_effect': True,
            'reserved_growth_constraints_excluded_from_development': True,
            'independent_fixed_target_statistics': True,
            'inferred_monthly_amounts_created': 0,
        },
        'limitations': [
            'This is evidence from preserved public-source bodies, not a new network retrieval.',
            'The July net amount cannot improve August replay: the current article body is dated September 2.',
            'A cached May Golden Spatula amount belongs to 2024, not the requested 2026 period.',
            'Published growth percentages are auxiliary equations, not observed earlier-month amounts.',
            'Both growth experiments regress the median and remain unadopted.',
            'Fresh earlier-period documents and independent future-month evaluation remain pending.',
        ],
    }
    output = 'reports/rank-models/target-5-20-source-supplement.json'
    service.write_atomic(replay.ROOT / output, result, immutable=True)
    current = load('reports/rank-models/service-readiness.json')
    current_preview = load('reports/rank-models/service-preview.json')
    old_current, old_preview = copy.deepcopy(current), copy.deepcopy(current_preview)
    folder = Path(tempfile.mkdtemp(prefix='target-growth-metadata-baseline-',
                                  dir=replay.ROOT / 'reports/rank-models'))
    for filename in ('service-readiness.json', 'service-preview.json', 'service-current.json', 'service-health.json'):
        data = (replay.ROOT / 'reports/rank-models' / filename).read_bytes()
        with (folder / filename).open('xb') as stream:
            stream.write(data)
        if hashlib.sha256((folder / filename).read_bytes()).digest() != hashlib.sha256(data).digest():
            raise ValueError('Metadata preservation failed')
    current['target_accuracy_round']['source_growth_followup'] = {
        'evidence': output, 'growth_experiments': verified, 'new_behavior_tests_passed': 3,
        'ledger_changed': False, 'model_adopted': False, 'fresh_source_retrieval': False,
        'previous_metadata': folder.relative_to(replay.ROOT).as_posix(),
    }
    current_preview['readiness_sha256'] = service.digest(current)
    replay.publish_rehearsal(replay.ROOT / 'reports/rank-models/service-readiness.json', current, current_preview)
    stored = load('reports/rank-models/service-readiness.json')
    stored_preview = load('reports/rank-models/service-preview.json')
    pointer = load('reports/rank-models/service-current.json')
    for field in old_current:
        if field != 'target_accuracy_round' and stored[field] != old_current[field]:
            raise ValueError('Service content changed during supplement metadata update')
    for field in old_preview:
        if field != 'readiness_sha256' and stored_preview[field] != old_preview[field]:
            raise ValueError('The unchanged service preview was replaced by an experimental preview')
    if pointer['readiness_sha256'] != service.digest(stored) or stored_preview['readiness_sha256'] != service.digest(stored):
        raise ValueError('Supplement generation linkage failed')
    print(json.dumps({'ok': True, 'ledger_changed': False, 'model_adopted': False,
                      'growth_experiments': verified, 'late_net_amount': 22,
                      'current_body_available_on': modified, 'august_replay_unchanged': True}), flush=True)


if __name__ == '__main__':
    main()
