"""Observable contracts for monthly service readiness and safe delivery."""
from __future__ import annotations

import copy
import json
import math
import sys
import tempfile
import unittest
import subprocess
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import history_fit as fit
import service_model as service
import service_readiness as run
import service_inputs
import service_coverage


def raw(amount=100, month='2026-01', source='A', **extra):
    return {'game': 'Game', 'game_key': 'Game', 'metric': 'consumer_spend',
            'provider': 'AppMagic', 'geography': 'WW', 'stores': ['app_store', 'google_play'],
            'currency': 'USD', 'fee_basis': 'gross', 'review_status': 'clear',
            'evidence_role': 'benchmark', 'qualifier': None, 'amount_usd_m': amount,
            'period': {'kind': 'month', 'start': month + '-01', 'end': fit.month_days(month)[-1]},
            'source_id': source, **extra}


def index(month='2026-01', mean=10.0):
    return {month: {'month': month, 'observed_days': 31, 'calendar_days': 31,
                    'mean_daily': {'Game': mean}, 'mean_daily_free': {},
                    'max_daily': {'Game': mean}, 'ios_share': {'Game': 0.5}, 'top_days': {}}}


def prediction(month='2026-08', **extra):
    return {'family': 'Game', 'month': month, 'class': 'gross', 'estimate': 100.0,
            'status': 'estimated', 'cohort': 'seen', 'out_of_domain': [], **extra}


def calibration():
    return [prediction(month=f'2026-{m:02}', family=f'Game{g}', log_error=math.log(1.1),
                       error_pct=10.0, actual=100 / 1.1)
            for m in (2, 3, 4, 5) for g in range(5)]


class Availability(unittest.TestCase):
    def test_month_label_requires_complete_explicit_calendar_bounds(self):
        for period in [
                {'kind': 'month', 'start': '2026-01-01', 'end': '2026-06-30'},
                {'kind': 'month', 'start': '2026-01-02', 'end': '2026-01-31'},
                {'kind': 'month', 'start': '2026-02-01', 'end': '2026-02-27'},
                {'kind': 'month', 'start': '2026-01-01'},
                {'kind': 'month', 'start': '2026-02-30', 'end': '2026-02-30'}]:
            with self.subTest(period=period):
                labels, audit = service.monthly_labels(
                    [raw(period=period)], {'A': {'published_on': '2026-02-02'}},
                    {'Game'}, 'consumer_spend', '2026-03-01')
                self.assertEqual(labels, [])
                self.assertEqual(audit['rejected']['non_calendar_month_period'], 1)

    def test_leap_month_keeps_its_explicit_calendar_end(self):
        labels, _ = service.monthly_labels(
            [raw(period={'kind': 'month', 'start': '2024-02-01', 'end': '2024-02-29'})],
            {'A': {'published_on': '2024-03-01'}}, {'Game'}, 'consumer_spend', '2024-03-02')
        self.assertEqual(len(labels), 1)
        self.assertEqual((labels[0]['period_start'], labels[0]['period_end']),
                         ('2024-02-01', '2024-02-29'))

    def test_h1_period_cannot_train_a_month_inside_it(self):
        row = raw(period={'kind': 'range', 'start': '2026-01-01', 'end': '2026-06-30'})
        labels, _ = fit.collect_labels([row], {'Game'}, {'A': {'published_on': '2026-07-10'}})
        self.assertEqual(labels[0]['month'], '2026-06')
        self.assertEqual(fit.training_before(labels, '2026-02'), [])
        self.assertEqual(fit.training_before(labels, '2026-07'), [])
        self.assertEqual(fit.training_before(labels, '2026-08'), labels)

    def test_unknown_publication_is_not_available_and_future_revision_does_not_replace_past(self):
        sources = {'A': {'published_on': '2026-02-02'}, 'B': {'published_on': '2026-03-15'}}
        rows = [raw(100), raw(150, source='B'), raw(999, source='MISSING')]
        early, audit = service.monthly_labels(rows, sources, {'Game'}, 'consumer_spend', '2026-03-01')
        later, _ = service.monthly_labels(rows, sources, {'Game'}, 'consumer_spend', '2026-04-01')
        self.assertEqual(early[0]['amount_usd_m'], 100)
        self.assertEqual(later[0]['amount_usd_m'], 150)
        self.assertEqual(audit['rejected']['unknown_publication_date'], 1)

    def test_reprints_are_one_outcome_and_gross_net_one_training_weight(self):
        rows = [raw(100), raw(100, source='B'), raw(70, fee_basis='net')]
        labels, audit = service.monthly_labels(rows, {'A': {'published_on': '2026-02-02'},
                                                     'B': {'published_on': '2026-02-03'}},
                                               {'Game'}, 'consumer_spend', '2026-03-01')
        self.assertEqual(audit['independent_family_months'], 1)
        self.assertEqual(len(service.unique_targets(labels, 'consumer_spend')), 1)
        designed = service.training_rows(labels, index(), ['Game'], '2026-03', reserve=False)
        self.assertEqual(sum(r['weight'] for r in designed), 1)
        self.assertEqual({r['class'] for r in designed}, {'gross', 'net'})

    def test_month_service_excludes_overlapping_ranges_and_other_provider(self):
        rows = [raw(), raw(provider='Sensor Tower'),
                raw(period={'kind': 'range', 'start': '2026-01-01', 'end': '2026-06-30'})]
        labels, audit = service.monthly_labels(rows, {'A': {'published_on': '2026-07-02'}},
                                               {'Game'}, 'consumer_spend', '2026-08-01')
        self.assertEqual(len(labels), 1)
        self.assertEqual(audit['rejected']['non_month_period'], 1)
        self.assertEqual(audit['rejected']['different_provider'], 1)

    def test_unknown_training_date_is_not_treated_as_old(self):
        self.assertEqual(fit.training_before([{'month': '2026-01', 'available_on': None}], '2026-03'), [])

    def test_unresolved_source_identity_is_not_cleared_by_a_known_game_name(self):
        labels, audit = service.monthly_labels(
            [raw(identity_status='unresolved')], {'A': {'published_on': '2026-02-02'}},
            {'Game'}, 'consumer_spend', '2026-03-01')
        self.assertEqual(labels, [])
        self.assertEqual(audit['rejected']['scope_or_review'], 1)


class Inference(unittest.TestCase):
    def test_random_slopes_shrink_game_response_and_leave_unseen_deviation_neutral(self):
        # Symmetric x has sum(x^2)=2 per game. With slope penalty 2,
        # deviations from the pooled .5 slope shrink by 2/(2+2).
        rows = []
        for name, elasticity in [('Slow', 0.25), ('Fast', 0.75)]:
            for month, x in [('2026-01', -1), ('2026-03', 0), ('2026-05', 1)]:
                rows.append({'family': name, 'month': month, 'class': 'gross', 'weight': 1.0,
                             'x': x, 'log_y': elasticity * x, 'features': {'log_index': x}})
        original = copy.deepcopy(rows)
        candidate = {'lambda': math.inf, 'feature_lambda': 0, 'half_life': math.inf,
                     'features': ['log_index_within'], 'random_slope_lambda': 2.0}
        fitted = service.fit_model(rows, candidate)
        stored = json.loads(service.canonical(fitted))
        data = index('2026-07')
        data['2026-07']['mean_daily'] = dict.fromkeys(['Slow', 'Fast', 'Unseen'], math.e)
        for name, expected in [('Slow', math.exp(0.375)), ('Fast', math.exp(0.625)), ('Unseen', math.e)]:
            answer = service.predict_one(name, '2026-07', 'gross', data, ['Slow', 'Fast', 'Unseen'], stored)
            self.assertAlmostEqual(answer['estimate'] / 1e6, expected, places=8)
        self.assertEqual(rows, original)
        split = copy.deepcopy(rows)
        split[0]['weight'] = 0.25
        split.append({**copy.deepcopy(rows[0]), 'weight': 0.75})
        equivalent = service.fit_model(split, candidate)
        answer = service.predict_one('Slow', '2026-07', 'gross', data, ['Slow', 'Fast'], equivalent)
        self.assertAlmostEqual(answer['estimate'] / 1e6, math.exp(0.375), places=8)

    def test_within_game_model_separates_temporal_change_from_unseen_game_size(self):
        # Independent generating law: between-game elasticity .2, temporal .8.
        rows = []
        for name, reference in [('Game', 10), ('Large', 1000)]:
            for month, ratio in [('2026-01', 0.5), ('2026-03', 1), ('2026-05', 2)]:
                value = reference * ratio
                rows.append({'family': name, 'month': month, 'class': 'gross', 'weight': 1.0,
                             'x': math.log(value), 'log_y': math.log(reference ** 0.2 * ratio ** 0.8),
                             'features': {'log_index': math.log(value)}})
        original = copy.deepcopy(rows)
        candidate = {'lambda': math.inf, 'feature_lambda': 0, 'half_life': math.inf,
                     'features': ['log_index', 'log_index_within']}
        model = service.fit_model(rows, candidate)
        stored = json.loads(service.canonical(model))
        data = index('2026-07', 40)
        data['2026-07']['mean_daily']['Unseen'] = 100
        for name, expected in [('Game', 10 ** 0.2 * 4 ** 0.8), ('Unseen', 100 ** 0.2)]:
            answer = service.predict_one(name, '2026-07', 'gross', data, ['Game', 'Large', 'Unseen'], stored)
            self.assertAlmostEqual(answer['estimate'] / 1e6, expected, places=8)
        self.assertEqual(rows, original)
        # Splitting one evidence weight cannot change the learned reference or output.
        split = copy.deepcopy(rows)
        split[0]['weight'] = 0.25
        split.append({**copy.deepcopy(rows[0]), 'weight': 0.75})
        equivalent = service.fit_model(split, candidate)
        actual = service.predict_one('Game', '2026-07', 'gross', data, ['Game', 'Large'], equivalent)
        self.assertAlmostEqual(actual['estimate'] / 1e6, 10 ** 0.2 * 4 ** 0.8, places=8)

    def test_training_and_inference_share_hand_computed_offset(self):
        labels, _ = fit.collect_labels([raw()], {'Game'})
        designed = fit.design(labels, index(), {'Game': 0.5}, 15)
        observed = fit.observation_row('Game', '2026-01', 'gross', index(), {'Game': 0.5}, 15)
        self.assertAlmostEqual(observed['x'], math.log(20))
        self.assertEqual(observed['features'], designed[0]['features'])
        self.assertEqual(observed['x'], designed[0]['x'])
        self.assertNotIn('log_y', observed)

    def test_serialized_fit_gives_same_known_prediction_without_training_outcomes(self):
        model = {'log_scale': {'gross': math.log(5)}, 'b': {}, 'beta': {}, 'centre': 0,
                 'labels_per_game': {'Game': 2}, 'class_counts': {'gross': 5}, 'feature_domain': {},
                 'lambda': math.inf}
        stored = json.loads(service.canonical(model))
        answer = service.predict_one('Game', '2026-01', 'gross', index(), ['Game'], stored)
        self.assertAlmostEqual(answer['estimate'], 50e6)
        self.assertEqual(answer['prior_months'], 2)
        self.assertEqual(stored['lambda'], 'inf')
        expanded = service.predict_one('Game', '2026-01', 'gross', index(), ['Other', 'Game'], stored)
        self.assertEqual(expanded, answer)

    def test_future_month_keeps_frozen_observation_origin_instead_of_becoming_a_new_launch(self):
        model = {'log_scale': {'gross': math.log(5)}, 'b': {}, 'beta': {}, 'centre': 0,
                 'labels_per_game': {'Game': 2}, 'class_counts': {'gross': 5}, 'feature_domain': {},
                 'first_observed_months': {'Game': '2026-01'}}
        data = index('2026-09')
        data['2026-09']['first_observed_month'] = {'Game': '2026-09'}
        answer = service.predict_one('Game', '2026-09', 'gross', data, ['Game'], model)
        self.assertEqual(answer['first_observed_month'], '2026-01')
        self.assertEqual(service.interval(answer, calibration(), 'consumer_spend')['status'], 'available')
        model['first_observed_months'] = {}
        answer = service.predict_one('Game', '2026-09', 'gross', data, ['Game'], model)
        self.assertEqual(service.interval(answer, calibration(), 'consumer_spend')['reason'],
                         'first_observed_month_not_validated')

    def test_missing_coverage_never_receives_a_median_fallback(self):
        self.assertIsNone(fit.observation_row('Game', '2026-01', 'gross', index(), {}, 1))
        self.assertEqual(service.predict_one('Missing', '2026-01', 'gross', index(), ['Missing'], None)['status'],
                         'unavailable')
        self.assertEqual(
            service.predict_one('Game', '2026-01', 'gross', index(), ['Other'], None)['reason'],
            'insufficient_chart_observation')

    def test_missing_and_snapshot_substituted_charts_are_not_zeros(self):
        weights = {('US', 'ios'): 1}
        good = {'charts': {'ios_us_grossing': {}, 'ios_us_free': {}}, 'snapshot_fallback_charts': []}
        bad = {'charts': {'ios_us_grossing': {}}, 'snapshot_fallback_charts': []}
        fallback = {**good, 'snapshot_fallback_charts': ['ios_us_free']}
        kept, audit = run.complete_payloads({'2026-01-01': good, '2026-01-02': bad, '2026-01-03': fallback}, weights)
        self.assertEqual(list(kept), ['2026-01-01'])
        self.assertEqual(audit['rejected_days']['2026-01-02']['missing'], ['ios_us_free'])
        self.assertEqual(audit['rejected_days']['2026-01-03']['snapshot_substitutions'], ['ios_us_free'])

    def test_partial_month_is_not_scaled_into_a_publishable_month(self):
        data = index()
        data['2026-01']['observed_days'] = 15
        self.assertEqual(run.usable_index(data, '2026-02-01')[0], {})
        self.assertEqual(run.usable_index(index(), '2026-01-31')[0], {})

    def test_geographic_features_equal_weighted_chart_contributions(self):
        payload = {'charts': {
            'ios_us_grossing': {'ranks': {'one': 1}, 'depth': 1},
            'ios_jp_grossing': {'ranks': {'two': 2}, 'depth': 2},
            'ios_us_free': {'ranks': {'one': 2}, 'depth': 2}}}
        params = {'alpha_ios': 1, 'alpha_aos': 1, 'censored': 0}
        original_metric = dict(fit.METRIC)
        try:
            fit.METRIC.update(primary='grossing', secondary='free')
            with patch('history_fit.identity_families', return_value=({'ios:one': 'Game', 'ios:two': 'Game'}, ['Game'])), \
                    patch('coverage_share.market_weights', return_value={('US', 'ios'): 2, ('JP', 'ios'): 4}):
                tables, names = fit.rank_tables({'2026-01-01': payload})
                actual = fit.monthly_index_fast({'2026-01-01': payload}, tables, names, params)['2026-01']
            # US: 2*1^-1 = 2; JP: 4*2^-1 = 2; no invented missing-market mass.
            self.assertEqual(actual['mean_daily']['Game'], 4)
            self.assertEqual(actual['country_shares']['Game'], {'US': 0.5, 'JP': 0.5})
            self.assertEqual(actual['active_days']['Game'], 1)
            features = fit.features_for(actual, 'Game', 4, {}, 0)
            self.assertEqual(features['share_JP'], 0.5)
            self.assertEqual(features['active_fraction'], 1)
        finally:
            fit.METRIC.clear()
            fit.METRIC.update(original_metric)


class Validation(unittest.TestCase):
    def test_warmup_uses_current_observation_availability_without_a_target_outcome(self):
        options = [{'id': 'untrained'}, {'id': 'primary_only'}]
        selected, report = run.select_candidate(options, {'untrained': {}, 'primary_only': {}}, [],
                                                 'consumer_spend', '2026-03',
                                                 {'untrained': 0, 'primary_only': 100})
        self.assertEqual(selected['id'], 'primary_only')
        self.assertEqual(report['predictable_catalog'], 100)

    def test_pending_net_target_is_not_misrepresented_as_unseen_gross_outcome(self):
        row = raw(fee_basis='net', review_status='pending')
        self.assertTrue(run.target_outcome_known([row], {'Game'}, 'consumer_spend', '2026-01'))
        self.assertFalse(run.target_outcome_known([row], {'Game'}, 'consumer_spend', '2026-02'))

    def test_future_outcome_changes_neither_selection_nor_interval(self):
        options = [{'id': 'A'}, {'id': 'B'}]
        labels = []
        cache = {'A': {}, 'B': {}}
        for month in ('2026-01', '2026-02', '2026-08'):
            for g in range(10):
                label = {'family': f'Family{g}', 'month': month, 'class': 'gross', 'amount_usd_m': 1,
                         'available_on': service.next_month(month) + '-02', 'source_id': 'A'}
                labels.append(label)
                for name, value in [('A', 1e6), ('B', 2e6)]:
                    cache[name][run.key(label)] = prediction(month=month, family=label['family'], estimate=value)
        selected, _ = run.select_candidate(options, cache, labels, 'consumer_spend', '2026-06')
        changed = copy.deepcopy(labels)
        for row in changed:
            if row['month'] == '2026-08':
                row['amount_usd_m'] = 1e9
        again, _ = run.select_candidate(options, cache, changed, 'consumer_spend', '2026-06')
        self.assertEqual(selected, again)
        self.assertEqual(selected['id'], 'A')
        expected = service.interval(prediction(), calibration(), 'consumer_spend')
        actual = service.interval(prediction(), calibration() + [prediction(log_error=100)], 'consumer_spend')
        self.assertEqual(expected, actual)
        self.assertAlmostEqual(expected['lower'], 100 / 1.1)
        self.assertAlmostEqual(expected['upper'], 110)

    def test_thin_or_wide_intervals_and_out_of_domain_predictions_are_withheld(self):
        self.assertEqual(service.interval(prediction(), [], 'consumer_spend')['reason'],
                         'insufficient_interval_calibration')
        wide = [{**r, 'log_error': math.log(2)} for r in calibration()]
        self.assertEqual(service.interval(prediction(), wide, 'consumer_spend')['reason'], 'interval_too_wide')
        self.assertEqual(service.interval(prediction(out_of_domain=['log_index']), calibration(),
                                         'consumer_spend')['reason'], 'outside_training_domain')

    def test_quality_cannot_pass_by_hiding_most_targets_or_without_future_evidence(self):
        available = service.interval(prediction(), calibration(), 'consumer_spend')
        rows = [{**available, 'family': f'Game{g}', 'month': f'2026-{m:02}', 'actual': 100,
                 'error_pct': 0, 'log_error': 0} for m in (6, 7, 8) for g in range(20)]
        report = service.assess(rows, 'consumer_spend')
        self.assertFalse(report['release_ready'])
        self.assertFalse(report['gates']['prospective_validation'])
        self.assertTrue(service.assess(rows, 'consumer_spend', prospective=True)['release_ready'])
        rows += [{'status': 'unavailable', 'reason': 'no_chart'} for _ in range(100)]
        self.assertFalse(service.assess(rows, 'consumer_spend', prospective=True)['gates']['served_fraction'])

    def test_current_body_waits_for_page_revision_but_first_publication_still_blocks_novelty(self):
        sources = {'A': {'published_on': '2026-02-01', 'page_modified_on': '2026-03-02'}}
        rows = [raw()]
        earlier, audit = service.monthly_labels(rows, sources, {'Game'}, 'consumer_spend', '2026-03-01')
        self.assertEqual(earlier, [])
        self.assertEqual(audit['rejected']['not_available_at_cutoff'], 1)
        available, _ = service.monthly_labels(rows, sources, {'Game'}, 'consumer_spend', '2026-03-02')
        self.assertEqual(available[0]['available_on'], '2026-03-02')
        self.assertTrue(run.target_outcome_known(
            rows, {'Game'}, 'consumer_spend', '2026-01', sources=sources, published_by='2026-02-02'))
        invalid, audit = service.monthly_labels(
            rows, {'A': {**sources['A'], 'page_modified_on': 'unknown'}},
            {'Game'}, 'consumer_spend', '2026-03-03')
        self.assertEqual(invalid, [])
        self.assertEqual(audit['rejected']['unknown_content_revision_date'], 1)

    def test_page_edit_does_not_promote_an_older_citation(self):
        rows = [raw(90, source='A'), raw(100, source='B')]
        sources = {
            'A': {'published_on': '2026-02-01', 'page_modified_on': '2026-03-02'},
            'B': {'published_on': '2026-02-15'},
        }
        labels, _ = service.monthly_labels(rows, sources, {'Game'}, 'consumer_spend', '2026-03-03')
        self.assertEqual(labels[0]['source_id'], 'B')
        self.assertEqual(labels[0]['amount_usd_m'], 100)
        self.assertEqual(labels[0]['available_on'], '2026-02-15')

    def test_frozen_validation_rejects_missing_or_changed_identity_resolver(self):
        dependency = 'scripts/revenue-research/september_day_check.py'
        with tempfile.TemporaryDirectory() as directory, patch.object(run, 'ROOT', Path(directory)):
            paths = run.inference_input_paths('downloads')
            for name in paths:
                path = Path(directory) / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(name.encode('utf-8'))
            bundle = {'schema_version': 1, 'production_enabled': False, 'policy': service.POLICY,
                      'metric': 'downloads', 'inference_input_hashes': run.hashes(paths)}
            run.validate_frozen(bundle)
            missing = copy.deepcopy(bundle)
            missing['inference_input_hashes'].pop(dependency, None)
            with self.assertRaisesRegex(ValueError, 'manifest'):
                run.validate_frozen(missing)
            (Path(directory) / dependency).write_bytes(b'changed identity resolver fixture')
            with self.assertRaisesRegex(ValueError, 'inputs changed'):
                run.validate_frozen(bundle)

    def test_prospective_evaluation_requires_outcome_published_after_prediction(self):
        artifact = {'kind': 'prospective_prediction', 'policy': service.POLICY,
                    'created_at': '2026-02-01T00:00:00+00:00', 'as_of': '2026-02-01',
                    'metric': 'consumer_spend', 'month': '2026-01',
                    'rows': [prediction(month='2026-01')]}
        with self.assertRaisesRegex(ValueError, 'demonstrably follow'):
            run.evaluate_predictions(artifact, [raw()], {'A': {'published_on': '2026-02-01'}}, '2026-02-05')
        result = run.evaluate_predictions(artifact, [raw()], {'A': {'published_on': '2026-02-02'}}, '2026-02-05')
        self.assertEqual(result['matched_outcomes'], 1)
        self.assertFalse(result['assessment']['release_ready'])

    def test_later_revision_cannot_hide_earlier_or_undated_target_evidence(self):
        artifact = {'kind': 'prospective_prediction', 'policy': service.POLICY,
                    'created_at': '2026-02-02T00:00:00+00:00', 'as_of': '2026-02-02',
                    'metric': 'consumer_spend', 'month': '2026-01',
                    'rows': [prediction(month='2026-01')]}
        cases = [
            (raw(90, source='EARLY'), '2026-02-01'),
            (raw(90, source='EARLY'), '2026-02-02'),
            (raw(90, source='EARLY', fee_basis='net', review_status='pending'), '2026-02-01'),
            (raw(90, source='EARLY'), None),
        ]
        for earlier, published in cases:
            with self.subTest(published=published, fee_basis=earlier['fee_basis']):
                sources = {'EARLY': {'published_on': published},
                           'REVISION': {'published_on': '2026-02-03'}}
                with self.assertRaisesRegex(ValueError, 'demonstrably follow'):
                    run.evaluate_predictions(
                        artifact, [earlier, raw(100, source='REVISION')], sources, '2026-02-05')


class Delivery(unittest.TestCase):
    def test_coverage_refresh_invalidates_old_identity_measurements(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            identity = root / 'docs/research/anchors/identities.json'
            identity.parent.mkdir(parents=True)
            identity.write_text(json.dumps({'games': {'Old': {'ios': ['id'], 'aos': []}}}), encoding='utf-8')
            (root / 'market.json').write_text('{}', encoding='utf-8')
            archive = root / 'snapshots/global/2026-09-08.json.br'
            archive.parent.mkdir(parents=True)
            archive.write_bytes(b'preserved test input')
            base = {'days': [{'date': '2026-09-08', 'per_game': []}], 'market_table': 'market.json',
                    'chart_kind': 'grossing', 'alpha': {'ios': 1, 'aos': 1},
                    'day_sources': [{'date': '2026-09-08', 'collector_output': 'snapshots/global'}]}
            (root / 'base.json').write_text(json.dumps(base), encoding='utf-8')
            decoded = {'lists': {'ios_us_grossing': {'times': ['00:00'], 'ranks': [['id']]}}}
            with patch('coverage_share.ROOT', root), \
                    patch('service_coverage.BASE', {'consumer_spend': 'base.json'}), \
                    patch('coverage_share.use_market_table'), \
                    patch('coverage_share.market_weights', return_value={('US', 'ios'): 1}), \
                    patch('service_coverage.collector_scope', return_value={'countries': ['US'], 'no_android': ['US']}), \
                    patch('coverage_share.read_day', return_value=decoded):
                first = service_coverage.refresh('consumer_spend', '2026-09-09')
                cached = service_coverage.refresh('consumer_spend', '2026-09-09', first)
                self.assertEqual(cached['recomputed_days'], 0)
                identity.write_text(json.dumps({'games': {'New': {'ios': ['id'], 'aos': []}}}), encoding='utf-8')
                updated = service_coverage.refresh('consumer_spend', '2026-09-09', cached)
            self.assertEqual(updated['recomputed_days'], 1)
            self.assertEqual(updated['days'][0]['per_game'], [
                {'game': 'New', 'five_market_share': 1.0, 'index_total': 1.0}])
            self.assertEqual(first['days'][0]['per_game'][0]['game'], 'Old')

    def test_coverage_completeness_uses_collector_contract_and_exposes_unobservable_weight(self):
        weights = {('RU', 'ios'): 1, ('RU', 'aos'): 1, ('US', 'ios'): 1, ('US', 'aos'): 1}
        required, unknown = service_coverage.expected_charts(
            weights, 'free', {'countries': ['RU', 'US'], 'no_android': ['RU']})
        self.assertEqual(required, {'ios_ru_free', 'ios_us_free', 'aos_us_free'})
        self.assertEqual(unknown, {'aos_ru_free'})

    def test_preserved_inputs_fill_only_missing_days_and_respect_cutoff(self):
        config = {'history_files': {'2026-09-10': 'kept/2026-09-10.json',
                                    '2026-09-11': 'kept/2026-09-11.json',
                                    '2026-09-12': 'kept/2026-09-12.json'}}
        with patch('service_inputs.source_config', return_value=config), \
                patch('history_fit.load_payloads', return_value={'2026-09-10': {'original': True}}), \
                patch('service_inputs.verify_preserved', side_effect=lambda _, path: Path(path)), \
                patch('history_fit.best_rank_payload', return_value={'preserved': True}):
            payloads, paths = service_inputs.load_service_payloads('2026-09-11')
        self.assertEqual(payloads, {'2026-09-10': {'original': True}, '2026-09-11': {'preserved': True}})
        self.assertEqual(paths['2026-09-10'], 'history/2026-09-10.json')
        self.assertEqual(paths['2026-09-11'], 'kept/2026-09-11.json')

    def test_partial_bundle_update_keeps_last_complete_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'service-readiness.json'
            first = {'as_of': '2026-09-12', 'metrics': [], 'rank_age_days': 0}
            preview = {'rows': [1]}
            run.publish_rehearsal(path, first, preview)
            pointer = path.with_name('service-current.json')
            before = pointer.read_bytes()
            original = service.os.replace
            def fail_preview(source, target):
                if Path(target) == path.with_name('service-preview.json'):
                    raise PermissionError('simulated disk failure')
                return original(source, target)
            with patch('service_model.os.replace', side_effect=fail_preview):
                with self.assertRaises(PermissionError):
                    run.publish_rehearsal(path, {**first, 'as_of': '2026-09-13'}, {'rows': [2]})
            self.assertEqual(pointer.read_bytes(), before)
            generation = json.loads(before)['generation']
            self.assertEqual(json.loads((Path(tmp) / generation / 'service-preview.json').read_bytes()), preview)

    def test_unknown_monthly_step_fails_instead_of_reporting_an_empty_success(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('monthly_refresh.py')),
                                 '--only', 'not_a_real_step'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('Unknown steps', result.stderr)

    def test_failed_serialization_or_replace_preserves_last_good_and_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'last-good.json'
            service.write_atomic(path, {'ok': 1})
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'Non-finite'):
                service.write_atomic(path, {'value': math.nan})
            self.assertEqual(path.read_bytes(), before)
            with patch('service_model.os.replace', side_effect=PermissionError('denied')):
                with self.assertRaises(PermissionError):
                    service.write_atomic(path, {'ok': 2})
            self.assertEqual(path.read_bytes(), before)

    def test_frozen_artifact_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'frozen.json'
            service.write_atomic(path, {'value': 1}, immutable=True)
            service.write_atomic(path, {'value': 1}, immutable=True)
            with self.assertRaisesRegex(ValueError, 'already differs'):
                service.write_atomic(path, {'value': 2}, immutable=True)
            self.assertEqual(json.loads(path.read_bytes()), {'value': 1})


if __name__ == '__main__':
    unittest.main()
