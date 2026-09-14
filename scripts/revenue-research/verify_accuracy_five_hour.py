"""Verify five-hour source additions and reviewed metadata against source facts."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import date, timedelta

import history_fit as fit
import service_model as model
import service_readiness as run

BASELINE = 'reports/rank-models/accuracy-five-hour-baseline-y63p2n4q'
EXPECTED = [
    ('PGD01', 'Color Block: Combo Blast', '2025-11', 1600000, None, '2026-02-17'),
    ('PGD02', 'Rainbow Six Mobile', '2026-02', 4700000, None, '2026-03-31'),
    ('PGD03', 'Fortnite', '2026-03', 7500000, 'approximately', '2026-04-08'),
    ('PGD06', 'Pokemon Champions', '2026-06', 3800000, None, '2026-07-29'),
    ('GPM12', 'Block Crazy Robo World Craft', '2025-12', 11275425, None, '2026-01-09'),
    ('GPM04', 'Block Crazy Robo World Craft', '2026-04', 10403958, None, '2026-05-05'),
    ('GPM05', 'Block Crazy Robo World Craft', '2026-05', 10333940, None, '2026-06-05'),
    ('GPM06', 'Block Crazy Robo World Craft', '2026-06', 9542299, None, '2026-07-07'),
    ('GPM07', 'Block Crazy Robo World Craft', '2026-07', 10215889, None, '2026-08-11'),
]
REVIEWED = {
    'v2:m04:dragon-ball-z-dokkan-battle:ww:month:2026-02-01:2026-02-28:consumer_spend:app_store+google_play:usd:net:unspecified:point':
        ('DRAGON BALL Z DOKKAN BATTLE', {'game_key', 'mapping_status', 'store_ids'}),
    'v2:s03:ea-sports-fc-mobile:ww:month:2026-06-01:2026-06-30:consumer_spend:app_store+google_play:usd:gross:unspecified:point':
        ('EA SPORTS FC Mobile', {'game', 'game_key', 'identity_status', 'mapping_status', 'store_ids', 'fit'}),
    'v2:s02:goddess-of-victory:ww:month:2026-07-01:2026-07-31:consumer_spend:app_store+google_play:usd:gross:unspecified:point':
        ('Goddess of Victory: NIKKE', {'identity_status', 'fit'}),
    'v2:s02:whiteout-survival:ww:month:2026-07-01:2026-07-31:consumer_spend:app_store+google_play:usd:gross:unspecified:point':
        ('Whiteout Survival', {'evidence_role', 'review_status', 'flags', 'fit'}),
}
ALIASES = {
    'Dragon Ball Z Dokkan Battle': 'DRAGON BALL Z DOKKAN BATTLE',
    'EA Sports FC mobile': 'EA SPORTS FC Mobile',
}
IDENTITY_ONLY_SOURCES = {
    'Block Crazy Robo World Craft': {'MDL01', 'MDL06', 'MDL07', 'MDL08', 'MDL09'},
    'Mahjong Wonders': {'MDL02'},
}


def load(path):
    return json.loads((run.ROOT / path).read_text(encoding='utf-8'))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', default='reports/rank-models/service-readiness.json')
    parser.add_argument('--output', default='reports/rank-models/accuracy-five-hour-verification-2026-09-13.json')
    args = parser.parse_args()
    original = [json.loads(line) for line in (run.ROOT / BASELINE / 'docs/research/anchors/anchors.jsonl')
                .read_text(encoding='utf-8').splitlines() if line]
    current = fit.ledger_rows()
    old_by_id = {row['id']: row for row in original}
    new_by_id = {row['id']: row for row in current}
    identity_only = {row['id']: row['game'] for row in original
                     if row['source_id'] in IDENTITY_ONLY_SOURCES.get(row['game'], set())}
    assert len(identity_only) == 6
    assert len(new_by_id) == len(current)
    for identity, row in old_by_id.items():
        allowed = REVIEWED.get(identity, (None, set()))[1]
        if identity in identity_only:
            allowed = {'store_ids', 'mapping_status'}
        actual = new_by_id[identity]
        assert {key: value for key, value in actual.items() if key not in allowed} == {
            key: value for key, value in row.items() if key not in allowed}, f'Unreviewed change: {identity}'
    additions = [row for row in current if row['id'] not in old_by_id]
    assert len(additions) == len(EXPECTED), (len(additions), len(EXPECTED))
    before_ids = load(BASELINE + '/docs/research/anchors/identities.json')
    identities = load('docs/research/anchors/identities.json')
    for name, entry in before_ids['games'].items():
        assert identities['games'][name] == entry, name
    assert identities['aliases'] == {**before_ids['aliases'], **ALIASES}
    assert set(identities['games']) - set(before_ids['games']) == {
        'Rainbow Six Mobile', 'Block Crazy Robo World Craft', 'Mahjong Wonders'}
    rainbow = identities['games']['Rainbow Six Mobile']
    assert rainbow['ios'] == ['1608916511']
    assert rainbow['aos'] == ['com.ubisoft.rainbowsixmobile.r6.fps.pvp.shooter']
    block = identities['games']['Block Crazy Robo World Craft']
    package = 'com.cliffs.pro.cell.building.crazy.clever.craft'
    assert block['ios'] == [] and block['aos'] == [package]
    mahjong = identities['games']['Mahjong Wonders']
    assert mahjong['ios'] == ['6747492600'] and mahjong['aos'] == ['com.nebula.mahjongtile']
    mahjong_evidence = load('reports/rank-models/accuracy-five-hour-mahjong-evidence-2026-09-13.json')
    article = run.ROOT / mahjong_evidence['source']['cached']
    assert hashlib.sha256(article.read_bytes()).hexdigest() == mahjong_evidence['source']['sha256']
    assert '18. <strong>Mahjong Wonders</strong> (Nebula Studio): 9.1m' in article.read_text(encoding='utf-8')
    for item in mahjong_evidence['snapshots']:
        path = run.ROOT / item['path']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']
        snapshot = load(item['path'])
        for store, app_id in [('ios', '6747492600'), ('android', 'com.nebula.mahjongtile')]:
            assert any(row.get('appId') == app_id and row.get('title') == 'Mahjong Wonders™'
                       for row in snapshot['rankings']['free']['us'][store])
    chart_evidence = load('reports/rank-models/accuracy-five-hour-block-crazy-evidence-2026-09-13.json')
    for chart in chart_evidence['chart_rows']:
        assert hashlib.sha256((run.ROOT / chart['image']).read_bytes()).hexdigest() == chart['sha256']
    for day, ranks in [
            ('2026-04-04', {'kr': 188, 'jp': 92, 'us': 42, 'tw': 28}),
            ('2026-05-31', {'us': 116, 'tw': 157}),
            ('2026-07-31', {'kr': 159, 'jp': 102, 'us': 47, 'tw': 43})]:
        snapshot = load('history/' + day + '.json')
        for country, rank in ranks.items():
            assert snapshot['bestRanks']['aos_' + country + '_free'][package] == rank
            assert any(item.get('appId') == package and item.get('title') == 'Block Crazy Robo World Craft'
                       for item in snapshot['rankings']['free'][country]['android'])
    sources = load('docs/research/anchors/sources.json')
    original_sources = load(BASELINE + '/docs/research/anchors/sources.json')
    revisions = load('docs/research/anchors/manual/2026-09-13-source-revisions.json')['source_revisions']
    expected_sources = {
        identity: {**source, **({'page_modified_on': revisions[source['url']]}
                               if source['url'] in revisions else {})}
        for identity, source in original_sources.items()}
    assert sources == expected_sources, 'Only reviewed page-revision metadata may change'
    names = set(identities['games'])
    reviewed_metadata = []
    for identity in sorted(identity_only):
        row = new_by_id[identity]
        family = identity_only[identity]
        assert row['mapping_status'] == 'mapped'
        assert row['store_ids'] == {
            store: identities['games'][family][store] for store in ('ios', 'aos')}
        if family == 'Mahjong Wonders':
            assert row['amount'] * row['unit_multiplier'] == 9100000
            assert row['period']['start'] == '2025-12-01' and row['period']['end'] == '2025-12-31'
        reviewed_metadata.append({'id': identity, 'family': family,
                                  'published_amount_and_scope_unchanged': True})
    for identity, (family, _) in REVIEWED.items():
        row = new_by_id[identity]
        assert row['game_key'] == family and row['mapping_status'] == 'mapped'
        assert row['store_ids'] == {
            store: before_ids['games'][family][store] for store in ('ios', 'aos')}
        assert row['identity_status'] == 'as_published'
        assert row['review_status'] == 'clear' and row['evidence_role'] == 'benchmark'
        assert row['fit']['usable'] is (row['fee_basis'] == 'gross')
        reviewed_metadata.append({'id': identity, 'family': family,
                                  'published_amount_and_scope_unchanged': True})
    effective, _ = model.monthly_labels(current, sources, names, 'consumer_spend', '2026-09-13')
    effective_by_key = {run.key(row): row for row in effective}
    for family, month, klass, expected_amount in [
            ('EA SPORTS FC Mobile', '2026-06', 'gross', 20.3),
            ('Whiteout Survival', '2026-07', 'gross', 140.9),
            ('Goddess of Victory: NIKKE', '2026-07', 'gross', 37.0),
            ('DRAGON BALL Z DOKKAN BATTLE', '2026-02', 'net', 36.1)]:
        assert effective_by_key[(family, month, klass)]['amount_usd_m'] == expected_amount
    verified = []
    for source, family, month, installs, qualifier, published in EXPECTED:
        rows = [row for row in additions if row['source_id'] == source
                and fit.family_for(row, names) == family]
        assert len(rows) == 1, (source, family, len(rows))
        row = rows[0]
        assert row['period']['kind'] == 'month'
        assert row['period']['start'] == month + '-01'
        assert row['period']['end'] == fit.month_days(month)[-1]
        assert row['currency'] == 'COUNT' and row['metric'] == 'downloads'
        assert row['provider'] == 'AppMagic' and row['geography'] == 'WW'
        assert sorted(row['stores']) == ['app_store', 'google_play']
        assert row.get('qualifier') == qualifier
        assert row['amount'] * row['unit_multiplier'] == installs, (family, row)
        assert math.isclose(fit.label_amount(row) * 1e6, installs, rel_tol=1e-12), (family, row)
        assert sources[source]['published_on'] == published
        previous_day = (date.fromisoformat(published) - timedelta(days=1)).isoformat()
        unavailable, _ = model.monthly_labels([row], sources, names, 'downloads', previous_day)
        available, _ = model.monthly_labels([row], sources, names, 'downloads', published)
        assert unavailable == []
        assert len(available) == 1 and available[0]['available_on'] == published
        verified.append({'family': family, 'month': month, 'installs': installs,
                         'available_on': published, 'ledger_id': row['id']})
    baseline = load(BASELINE + '/reports/rank-models/service-readiness.json')
    report = load(args.report)
    assert report['policy'] == baseline['policy'] == model.POLICY
    assert report['production_enabled'] is False and report['release_ready'] is False
    comparisons = []
    for previous, latest in zip(baseline['metrics'], report['metrics']):
        assert previous['metric'] == latest['metric']
        old = {run.key(row): row for row in previous['validation_rows']}
        new = {run.key(row): row for row in latest['validation_rows']}
        assert old.keys() <= new.keys()
        common = [row for key, row in new.items()
                  if key in old and 'error_pct' in row and 'error_pct' in old[key]]
        expected_count = sum('error_pct' in row for row in old.values())
        assert len(common) == expected_count, 'A previously computable target was dropped'
        comparisons.append({
            'metric': latest['metric'],
            'common_before': model.error_summary([old[run.key(row)] for row in common]),
            'common_after': model.error_summary(common),
            'expanded_after': latest['assessment']['all_computable_error'],
            'available_after': latest['assessment']['served_error'],
            'release_ready': latest['assessment']['release_ready'],
        })
    model.write_atomic(run.ROOT / args.output, {
        'ok': True, 'kind': 'source_to_ledger_and_result_verification',
        'baseline': BASELINE, 'report': args.report,
        'original_ledger_rows_unchanged': len(original) - len(REVIEWED) - len(identity_only),
        'original_amount_scope_and_period_fields_unchanged': len(original),
        'original_source_fields_and_first_publication_dates_unchanged': True,
        'sources_with_reviewed_page_revision_dates': sum('page_modified_on' in s for s in sources.values()),
        'reviewed_metadata_rows': reviewed_metadata,
        'verified_new_rows': verified,
        'identities_preserved': len(before_ids['games']),
        'release_policy_unchanged': True, 'production_enabled': False,
        'comparisons': comparisons,
    })
    print(json.dumps({'ok': True, 'original_rows_unchanged': len(original) - len(REVIEWED) - len(identity_only),
                      'metadata_only_reviews': len(reviewed_metadata),
                      'added_rows': len(verified), 'comparisons': comparisons}))


if __name__ == '__main__':
    main()
