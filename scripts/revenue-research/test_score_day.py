"""Behavior tests for the usable day scorer and the frozen model card."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coverage_share
import model_card
import round_stability
import score_day
import september_day_check
import store_split_check
import archive_bundle
import archive_gaps
import audit_model
import refresh_rate
import country_bias_check
import ordering_check
import proxy_sensitivity
import reference_comparison
import subsample_stability


def market_table(rows):
    handle = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
    countries = [{'country': country, 'marketProxyUsd': proxy,
                  'storeShares': {'ios': ios, 'android': 1.0 - ios}}
                 for country, proxy, ios in rows]
    json.dump({'countries': countries}, handle)
    handle.close()
    path = Path(handle.name)
    return str(path.relative_to(coverage_share.ROOT)) if path.is_relative_to(coverage_share.ROOT) else handle.name


def day(lists):
    return {'date': '2026-09-11',
            'lists': {key: {'times': [f'{index:02d}:00' for index in range(len(ranks))], 'ranks': ranks}
                      for key, ranks in lists.items()}}


PARAMS = {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 1.0}


class DayScorerTests(unittest.TestCase):
    def setUp(self):
        self._table = coverage_share._MARKET_TABLE['path']
        table = market_table([('US', 100.0, 1.0), ('JP', 50.0, 1.0), ('CN', 40.0, 1.0)])
        coverage_share.use_market_table(table)
        self._families = score_day.identity_families
        score_day.identity_families = lambda: ({'ios:1': 'Alpha', 'ios:2': 'Alpha', 'ios:3': 'Beta'},
                                               ['Alpha', 'Beta'])
        self.addCleanup(coverage_share.use_market_table, self._table)
        self.addCleanup(lambda: setattr(score_day, 'identity_families', self._families))

    def index_of(self, result, app):
        return float(result['app_index'][result['app_ids'][app]])

    def test_an_absent_snapshot_is_credited_at_the_rank_200_floor_not_zero(self):
        both = score_day.score_day(day({'ios_us_grossing': [['1'], ['1']]}), PARAMS,
                                   censored_depth='fixed_200')
        half = score_day.score_day(day({'ios_us_grossing': [['1'], ['9']]}), PARAMS,
                                   censored_depth='fixed_200')
        floor = 100.0 * (1.0 / 200.0)
        self.assertAlmostEqual(self.index_of(both, 'ios:1'), 100.0)
        self.assertAlmostEqual(self.index_of(half, 'ios:1'), (100.0 + floor) / 2)
        self.assertGreater(self.index_of(half, 'ios:1'), 0.0)

    def test_a_knee_steepens_only_the_tail_and_a_country_head_slope_applies_to_that_country(self):
        lists = {'ios_us_grossing': [['1'] + [str(n) for n in range(10, 60)]],
                 'ios_jp_grossing': [['3', '2']]}
        single = score_day.score_day(day(lists), {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0})
        two_slope = score_day.score_day(day(lists), {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0,
                                                     'knee': 20.0, 'alpha_tail_ios': 2.0, 'alpha_ios_JP': 2.0})
        self.assertAlmostEqual(self.index_of(two_slope, 'ios:1'), self.index_of(single, 'ios:1'))  # rank 1: head only
        self.assertAlmostEqual(self.index_of(two_slope, 'ios:15'), self.index_of(single, 'ios:15'))  # above the knee
        # app '40' sits at rank 32 in the US chart: 20^-1 * (32/20)^-2 instead of 32^-1
        self.assertAlmostEqual(self.index_of(two_slope, 'ios:40'), 100.0 * (1 / 20) * ((32 / 20) ** -2))
        self.assertLess(self.index_of(two_slope, 'ios:40'), self.index_of(single, 'ios:40'))
        # Japan rank 2 uses the Japanese head slope: 50 * 2^-2, not 50 * 2^-1
        self.assertAlmostEqual(self.index_of(two_slope, 'ios:2'), 50.0 * 2 ** -2)
        self.assertAlmostEqual(self.index_of(single, 'ios:2'), 50.0 * 2 ** -1)

    def test_an_app_missing_from_a_chart_entirely_is_not_credited_in_that_chart(self):
        scored = score_day.score_day(day({'ios_us_grossing': [['1']], 'ios_jp_grossing': [['3']]}), PARAMS,
                                     censored_scope='charts_with_any_appearance',
                                     censored_depth='fixed_200')
        every = score_day.score_day(day({'ios_us_grossing': [['1']], 'ios_jp_grossing': [['3']]}),
                                    PARAMS, censored_scope='every_chart', censored_depth='fixed_200')
        self.assertAlmostEqual(self.index_of(scored, 'ios:1'), 100.0)
        self.assertAlmostEqual(self.index_of(every, 'ios:1'), 100.0 + 50.0 / 200.0)

    def test_the_default_scope_matches_the_convention_the_fit_was_estimated_under(self):
        rows = {'ios_us_grossing': [['1']], 'ios_jp_grossing': [['3']]}
        default = score_day.score_day(day(rows), PARAMS, censored_depth='fixed_200')
        every = score_day.score_day(day(rows), PARAMS, censored_scope='every_chart',
                                    censored_depth='fixed_200')
        self.assertAlmostEqual(self.index_of(default, 'ios:1'), self.index_of(every, 'ios:1'))

    def test_absence_is_priced_at_the_depth_the_chart_returned(self):
        rows = {'ios_us_grossing': [['1', '2'], ['2']]}
        returned = score_day.score_day(day(rows), PARAMS, censored_depth='returned')
        fixed = score_day.score_day(day(rows), PARAMS, censored_depth='fixed_200')
        # Missing from a two-row chart is weak evidence; missing from 200 rows is strong.
        self.assertAlmostEqual(self.index_of(returned, 'ios:1'), 100.0 * 1.75 / 2)
        self.assertAlmostEqual(self.index_of(fixed, 'ios:1'), 100.0 * 1.005 / 2)
        with self.assertRaises(ValueError):
            score_day.score_day(day(rows), PARAMS, censored_depth='nonsense')

    def test_a_full_depth_chart_scores_the_same_under_both_depth_rules(self):
        rows = {'ios_us_grossing': [[str(index) for index in range(1, 201)]]}
        returned = score_day.score_day(day(rows), PARAMS, censored_depth='returned')
        fixed = score_day.score_day(day(rows), PARAMS, censored_depth='fixed_200')
        self.assertAlmostEqual(self.index_of(returned, 'ios:1'), self.index_of(fixed, 'ios:1'))

    def test_a_country_multiplier_scales_only_its_own_country(self):
        rows = {'ios_us_grossing': [['1']], 'ios_cn_grossing': [['1']]}
        plain = score_day.score_day(day(rows), PARAMS)
        boosted = score_day.score_day(day(rows), dict(PARAMS, country_multipliers={'CN': 3.0}))
        self.assertAlmostEqual(self.index_of(plain, 'ios:1'), 140.0)
        self.assertAlmostEqual(self.index_of(boosted, 'ios:1'), 100.0 + 120.0)
        self.assertAlmostEqual(boosted['country_totals']['US'], 100.0)

    def test_two_app_ids_of_one_game_collapse_into_a_single_family_total(self):
        scored = score_day.score_day(day({'ios_us_grossing': [['1', '2', '3']]}), PARAMS)
        self.assertAlmostEqual(scored['family_totals']['Alpha'], 100.0 + 50.0)
        self.assertAlmostEqual(scored['family_totals']['Beta'], 100.0 / 3)

    def test_free_charts_and_countries_without_a_market_weight_are_ignored(self):
        scored = score_day.score_day(day({'ios_us_grossing': [['1']], 'ios_us_free': [['3']],
                                          'ios_zz_grossing': [['3']]}), PARAMS)
        self.assertEqual(scored['charts'], 1)
        self.assertNotIn('Beta', scored['family_totals'])
        with self.assertRaises(ValueError):
            score_day.score_day(day({'ios_zz_grossing': [['1']]}), PARAMS)


class AccountingTests(unittest.TestCase):
    def setUp(self):
        self._table = coverage_share._MARKET_TABLE['path']
        coverage_share.use_market_table(market_table([('US', 100.0, 1.0), ('JP', 50.0, 1.0)]))
        self._families = score_day.identity_families
        score_day.identity_families = lambda: ({'ios:1': 'Alpha'}, ['Alpha'])
        self._total = audit_model.published_market_total
        self._country = audit_model.published_country_totals
        audit_model.published_market_total = lambda: {'rows': [{'provider': 'p', 'amount_usd_million': 100.0,
                                                                'qualifier': None}]}
        audit_model.published_country_totals = lambda: []
        self.addCleanup(coverage_share.use_market_table, self._table)
        self.addCleanup(lambda: setattr(score_day, 'identity_families', self._families))
        self.addCleanup(lambda: setattr(audit_model, 'published_market_total', self._total))
        self.addCleanup(lambda: setattr(audit_model, 'published_country_totals', self._country))

    def test_the_market_total_counts_observed_ranks_only(self):
        rows = {'ios_us_grossing': [['1']], 'ios_jp_grossing': [['2']]}
        model = {'params': dict(PARAMS), 'scales': {'k': 1.0}}
        audit = audit_model.accounting_check(day(rows), model, 'k')
        # Observed only: rank 1 in US plus rank 1 in JP, with no absence credit anywhere.
        self.assertAlmostEqual(audit['all_charted_apps_usd_million'], 150.0)
        self.assertAlmostEqual(audit['ratio_to_published']['p'], 1.5)

    def test_absence_credit_would_inflate_the_same_total(self):
        rows = {'ios_us_grossing': [['1']], 'ios_jp_grossing': [['2']]}
        with_absence = score_day.score_day(day(rows), dict(PARAMS), censored_scope='every_chart',
                                           censored_depth='fixed_200')
        self.assertGreater(float(with_absence['app_index'].sum()), 150.0)


class BandTests(unittest.TestCase):
    def report(self):
        return {'summary': {'draws': 30, 'priced_usd_million': {
            'A': {'median': 100.0, 'p05': 90.0, 'p95': 115.0},
            'B': {'median': 50.0, 'p05': 40.0, 'p95': 60.0},
            'C': None}}}

    def test_each_labelled_game_keeps_its_own_relative_band(self):
        bands = score_day.label_dependence_bands(self.report())
        self.assertAlmostEqual(bands['per_game']['A']['low'], 0.9)
        self.assertAlmostEqual(bands['per_game']['A']['high'], 1.15)
        self.assertNotIn('C', bands['per_game'])

    def test_an_unlabelled_game_falls_back_to_the_median_band(self):
        bands = score_day.label_dependence_bands(self.report())
        self.assertGreater(bands['fallback']['high'], 1.0)
        self.assertLess(bands['fallback']['low'], 1.0)

    def test_no_subsample_report_means_no_bands_rather_than_a_fake_range(self):
        self.assertIsNone(score_day.label_dependence_bands(None))
        self.assertIsNone(score_day.label_dependence_bands({'summary': {'draws': 0, 'priced_usd_million': {}}}))


class ModelCardTests(unittest.TestCase):
    def report(self):
        return {
            'panel': 'panel.json', 'market_model': 'market.json', 'coverage_report': 'coverage.json',
            'labels': 39, 'games': 28, 'label_classes': 6, 'market_totals': 3,
            'baseline_round13_exponents': {'cv_rmse_log': 0.48},
            'variants': [
                {'variant': 'weak', 'params': {'alpha_ios': 1.0, 'coverage_correction': False},
                 'scales': {'S|gross|WW|app_store+google_play': 2.0}, 'cv_rmse_log': 0.30,
                 'cv_median_abs_pct': 15.0, 'market_rmse_log': 0.2},
                {'variant': 'strong', 'params': {'alpha_ios': 1.05, 'coverage_correction': True},
                 'scales': {'S|gross|WW|app_store+google_play': 3.0}, 'cv_rmse_log': 0.22,
                 'cv_median_abs_pct': 10.0, 'market_rmse_log': 0.05}],
            'nested_cross_validation': [
                {'variant': 'weak', 'nested_cv_rmse_log': 0.33, 'nested_cv_median_abs_pct': 15.0,
                 'nested_cv_worst_abs_pct': 90.0, 'selected_parameter_sets': ['a']},
                {'variant': 'strong', 'nested_cv_rmse_log': 0.25, 'nested_cv_median_abs_pct': 10.8,
                 'nested_cv_worst_abs_pct': 170.0, 'selected_parameter_sets': ['a', 'b', 'c']}],
            'reserved_holdout': {'variant': 'strong', 'holdout_games': ['x'], 'predicted_labels': 11,
                                 'rmse_log': 0.17, 'median_abs_pct': 13.1, 'worst_abs_pct': 28.3},
        }

    def test_the_card_freezes_the_best_nested_variant_with_its_scales(self):
        card = model_card.build_card(self.report(), None, 'report.json')
        self.assertEqual(card['selected_model']['variant'], 'strong')
        self.assertEqual(card['selected_model']['params'], {'alpha_ios': 1.05})
        self.assertTrue(card['selected_model']['coverage_correction'])
        self.assertEqual(card['selected_model']['scales']['S|gross|WW|app_store+google_play'], 3.0)
        self.assertEqual(card['performance']['reserved_holdout']['median_abs_pct'], 13.1)
        self.assertFalse(card['production_enabled'])
        self.assertEqual(card['parameter_stability']['distinct_selected_parameter_sets'], 3)

    def test_an_explicit_variant_overrides_the_nested_ranking(self):
        card = model_card.build_card(self.report(), 'weak', 'report.json')
        self.assertEqual(card['selected_model']['variant'], 'weak')
        self.assertEqual(card['performance']['nested_cv_rmse_log'], 0.33)

    def test_the_scorer_loads_a_card_without_rescanning_variants(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'card.json'
            path.write_text(json.dumps(model_card.build_card(self.report(), 'weak', 'report.json')),
                            encoding='utf-8')
            loaded = score_day.load_model(path)
        self.assertEqual(loaded['variant'], 'weak')
        self.assertEqual(loaded['scales']['S|gross|WW|app_store+google_play'], 2.0)


class RoundStabilityTests(unittest.TestCase):
    def day(self):
        return {'date': '2026-09-11', 'lists': {
            'ios_us_grossing': {'times': ['15:04', '15:29'], 'ranks': [['1', '2'], ['2', '1']]},
            'ios_jp_grossing': {'times': ['15:04'], 'ranks': [['1']]}}}

    def test_a_round_keeps_only_the_charts_that_returned_at_that_time(self):
        first = round_stability.split_by_time(self.day(), '15:04')
        second = round_stability.split_by_time(self.day(), '15:29')
        self.assertEqual(sorted(first['lists']), ['ios_jp_grossing', 'ios_us_grossing'])
        self.assertEqual(sorted(second['lists']), ['ios_us_grossing'])
        self.assertEqual(second['lists']['ios_us_grossing']['ranks'], [['2', '1']])

    def test_identical_and_reversed_orderings_are_the_tau_extremes(self):
        order = ['a', 'b', 'c', 'd']
        self.assertEqual(round_stability.kendall_tau(order, order), 1.0)
        self.assertEqual(round_stability.kendall_tau(order, list(reversed(order))), -1.0)

    def test_tau_compares_only_games_present_in_both_orderings(self):
        self.assertEqual(round_stability.kendall_tau(['a', 'x', 'b'], ['a', 'b', 'y']), 1.0)
        self.assertEqual(round_stability.kendall_tau(['a'], ['b']), 1.0)


class ArchiveDayTests(unittest.TestCase):
    def archive(self, rows):
        folder = Path(tempfile.mkdtemp())
        for name, text in rows.items():
            (folder / name).write_text(text, encoding='utf-8')
        return folder

    def test_an_archived_chart_becomes_one_snapshot_per_time_in_rank_order(self):
        folder = self.archive({'2026-09-04_ios_us_grossing.csv':
                               'time,rank,id,title\n00:00,2,b,B\n00:00,1,a,A\n12:00,1,b,B\n'})
        day = september_day_check.read_archive_day('2026-09-04', folder)
        self.assertEqual(day['lists']['ios_us_grossing']['times'], ['00:00', '12:00'])
        self.assertEqual(day['lists']['ios_us_grossing']['ranks'], [['a', 'b'], ['b']])

    def test_a_chart_with_missing_rank_positions_is_rejected_not_renumbered(self):
        folder = self.archive({'2026-09-04_ios_us_grossing.csv': 'time,rank,id,title\n00:00,1,a,A\n00:00,3,c,C\n'})
        with self.assertRaises(ValueError):
            september_day_check.read_archive_day('2026-09-04', folder)

    def test_a_date_without_archived_charts_fails_loudly(self):
        with self.assertRaises(FileNotFoundError):
            september_day_check.read_archive_day('2026-01-01', self.archive({}))

    def test_coverage_share_averages_the_measured_days_for_that_game(self):
        report = {'days': [{'per_game': [{'game': 'A', 'five_market_share': 0.6},
                                         {'game': 'B', 'five_market_share': 0.2}]},
                           {'per_game': [{'game': 'A', 'five_market_share': 0.8}]}]}
        self.assertAlmostEqual(september_day_check.coverage_for(report, 'A'), 0.7)
        with self.assertRaises(KeyError):
            september_day_check.coverage_for(report, 'C')

    def test_a_ledger_display_name_resolves_to_its_identity_family_by_store_ids(self):
        original = september_day_check.identity_families
        september_day_check.identity_families = lambda: ({'ios:1': 'MONOPOLY GO!', 'aos:9': 'MONOPOLY GO!',
                                                          'ios:7': 'Other'}, ['MONOPOLY GO!', 'Other'])
        self.addCleanup(lambda: setattr(september_day_check, 'identity_families', original))
        self.assertEqual(september_day_check.resolve_family({'ios': ['1'], 'aos': ['9']}), 'MONOPOLY GO!')
        self.assertIsNone(september_day_check.resolve_family({'ios': ['404'], 'aos': []}))
        with self.assertRaises(ValueError):
            september_day_check.resolve_family({'ios': ['1', '7'], 'aos': []})

    def test_only_exact_day_worldwide_gross_labels_of_that_game_are_used(self):
        rows = [
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'WW', 'fee_basis': 'gross',
             'stores': ['google_play', 'app_store'], 'amount_usd_m': 6.1, 'provider': 'p', 'id': 'keep',
             'period': {'kind': 'day', 'start': '2026-09-04', 'end': '2026-09-04'}},
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'US', 'fee_basis': 'gross',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 1.0, 'provider': 'p', 'id': 'region',
             'period': {'kind': 'day', 'start': '2026-09-04', 'end': '2026-09-04'}},
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'WW', 'fee_basis': 'net',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 4.0, 'provider': 'p', 'id': 'net',
             'period': {'kind': 'day', 'start': '2026-09-04', 'end': '2026-09-04'}},
            {'metric': 'downloads', 'game': 'A', 'geography': 'WW', 'fee_basis': 'gross',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 9.0, 'provider': 'p', 'id': 'downloads',
             'period': {'kind': 'day', 'start': '2026-09-05', 'end': '2026-09-05'}},
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'WW', 'fee_basis': 'gross',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 99.0, 'provider': 'p', 'id': 'month',
             'period': {'kind': 'month', 'start': '2026-08-01', 'end': '2026-08-31'}},
        ]
        folder = Path(tempfile.mkdtemp()) / 'anchors.jsonl'
        folder.write_text('\n'.join(json.dumps(row) for row in rows) + '\n', encoding='utf-8')
        labels = september_day_check.daily_labels(folder, 'A')
        self.assertEqual([row['anchor_id'] for row in labels], ['keep'])


class WeeklyScopeTests(unittest.TestCase):
    def test_country_scope_keeps_only_that_country_charts(self):
        day = {'date': '2026-09-04', 'lists': {'ios_jp_grossing': {'times': ['00:00'], 'ranks': [['a']]},
                                               'aos_jp_grossing': {'times': ['00:00'], 'ranks': [['b']]},
                                               'ios_us_grossing': {'times': ['00:00'], 'ranks': [['c']]}}}
        scoped = september_day_check.country_scope(day, 'JP')
        self.assertEqual(sorted(scoped['lists']), ['aos_jp_grossing', 'ios_jp_grossing'])
        with self.assertRaises(KeyError):
            september_day_check.country_scope(day, 'KR')

    def test_weekly_rows_keep_country_labels_that_share_the_published_week(self):
        rows = [
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'WW', 'fee_basis': 'gross',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 44.2, 'provider': 'p', 'id': 'ww',
             'store_ids': {}, 'period': {'kind': 'week', 'label': 'W', 'start': None, 'end': None}},
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'JP', 'fee_basis': 'gross',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 11.0, 'provider': 'p', 'id': 'jp',
             'store_ids': {}, 'period': {'kind': 'unresolved', 'label': 'W', 'start': None, 'end': None}},
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'WW', 'fee_basis': 'net',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 30.0, 'provider': 'p', 'id': 'net',
             'store_ids': {}, 'period': {'kind': 'week', 'label': 'W', 'start': None, 'end': None}},
            {'metric': 'consumer_spend', 'game': 'A', 'geography': 'WW', 'fee_basis': 'gross',
             'stores': ['app_store', 'google_play'], 'amount_usd_m': 9.9, 'provider': 'p', 'id': 'other-week',
             'store_ids': {}, 'period': {'kind': 'week', 'label': 'V', 'start': None, 'end': None}},
        ]
        path = Path(tempfile.mkdtemp()) / 'anchors.jsonl'
        path.write_text('\n'.join(json.dumps(row) for row in rows) + '\n', encoding='utf-8')
        labels = september_day_check.week_labels(path, 'W')
        self.assertEqual([(row['anchor_id'], row['geography']) for row in labels],
                         [('jp', 'JP'), ('ww', 'WW')])

    def test_window_dates_covers_seven_consecutive_days(self):
        dates = september_day_check.window_dates('2026-08-31', 7)
        self.assertEqual(dates[0], '2026-08-31')
        self.assertEqual(dates[-1], '2026-09-06')
        self.assertEqual(len(dates), 7)


class StoreSplitTests(unittest.TestCase):
    def rows(self):
        window = {'kind': 'range', 'start': '2026-08-08', 'end': '2026-08-16', 'label': None}
        month = {'kind': 'month', 'start': '2026-08-01', 'end': '2026-08-31', 'label': None}
        def row(geography, stores, amount, period, fee='gross'):
            return {'metric': 'market_total', 'geography': geography, 'stores': stores,
                    'amount_usd_m': amount, 'fee_basis': fee, 'period': period}
        return [
            row('JP', ['app_store'], 160, window),
            row('JP', ['google_play'], 80, window),
            row('JP', ['app_store', 'google_play'], 240, window),
            row('US', ['app_store', 'google_play'], 1879.02, month),
            row('WW', ['app_store'], 4000, window),
            row('WW', ['google_play'], 2000, window),
        ]

    def test_only_countries_with_both_published_store_parts_are_compared(self):
        splits = store_split_check.published_splits(self.rows())
        self.assertEqual([row['geography'] for row in splits], ['JP'])
        self.assertAlmostEqual(splits[0]['published_ios_share'], 160 / 240)
        self.assertTrue(splits[0]['parts_sum_matches_total'])

    def test_the_table_share_is_reported_next_to_the_published_share(self):
        splits = store_split_check.published_splits(self.rows())
        weights = {('JP', 'ios'): 66.0, ('JP', 'aos'): 34.0}
        compared = store_split_check.compare_shares(splits, weights)
        self.assertAlmostEqual(compared[0]['table_ios_share'], 0.66)
        self.assertAlmostEqual(compared[0]['difference_pct_points'], (0.66 - 160 / 240) * 100)

    def test_a_country_absent_from_the_weight_table_is_skipped(self):
        splits = store_split_check.published_splits(self.rows())
        self.assertEqual(store_split_check.compare_shares(splits, {('US', 'ios'): 1.0}), [])

    def test_window_dates_are_inclusive_of_both_ends(self):
        dates = store_split_check.window_dates('2026-08-08', '2026-08-16')
        self.assertEqual(len(dates), 9)
        self.assertEqual([dates[0], dates[-1]], ['2026-08-08', '2026-08-16'])


class SubsampleSummaryTests(unittest.TestCase):
    def draws(self):
        return {'design_games': 28, 'seconds': 12.0, 'draws': [
            {'draw': 0, 'params': {'alpha_ios': 1.0, 'alpha_aos': 0.5, 'censored': 1.0,
                                   'country_multipliers': {'CN': 3.0}}, 'cv_rmse_log': 0.22,
             'scale': 1.0, 'priced_usd_million': {'A': 100.0}},
            {'draw': 1, 'params': {'alpha_ios': 1.1, 'alpha_aos': 0.55, 'censored': 0.7,
                                   'country_multipliers': {'CN': 4.0}}, 'cv_rmse_log': 0.24,
             'scale': 1.0, 'priced_usd_million': {'A': 120.0}},
            {'draw': 2, 'params': {'alpha_ios': 1.05, 'alpha_aos': 0.5, 'censored': 1.0,
                                   'country_multipliers': {}}, 'cv_rmse_log': 0.23,
             'scale': None, 'priced_usd_million': {'A': None}},
        ]}

    def test_percentiles_ignore_missing_values_and_keep_the_observed_range(self):
        self.assertIsNone(subsample_stability.percentiles([None, None]))
        row = subsample_stability.percentiles([1.0, 2.0, None, 3.0])
        self.assertEqual((row['n'], row['min'], row['median'], row['max']), (3, 1.0, 2.0, 3.0))

    def test_the_summary_reports_parameter_and_price_spread_over_the_draws(self):
        summary = subsample_stability.summarise(self.draws(), ['A'])
        self.assertEqual(summary['draws'], 3)
        self.assertEqual(summary['parameters']['alpha_ios']['min'], 1.0)
        self.assertEqual(summary['parameters']['alpha_ios']['max'], 1.1)
        self.assertEqual(summary['parameters']['country_multiplier_CN']['n'], 2)
        priced = summary['priced_usd_million']['A']
        self.assertEqual(priced['n'], 2)
        self.assertGreater(priced['spread_pct_of_median'], 0)

    def test_a_game_nobody_priced_is_reported_as_missing_rather_than_zero(self):
        summary = subsample_stability.summarise(self.draws(), ['B'])
        self.assertIsNone(summary['priced_usd_million']['B'])


class ReferenceComparisonTests(unittest.TestCase):
    PERIOD = {'start': '2026-08-01', 'end': '2026-08-31'}

    def ledger(self, rows):
        path = Path(tempfile.mkdtemp()) / 'anchors.jsonl'
        path.write_text('\n'.join(json.dumps(row) for row in rows) + '\n', encoding='utf-8')
        return path

    def row(self, anchor_id, **overrides):
        base = {'id': anchor_id, 'metric': 'consumer_spend', 'game': 'A', 'geography': 'WW',
                'stores': ['app_store', 'google_play'], 'amount_usd_m': 10.0, 'provider': 'p',
                'source_id': 'N02', 'fee_basis': 'unspecified', 'currency': 'USD',
                'mapping_status': 'mapped', 'store_ids': {'ios': ['1'], 'aos': []},
                'fit': {'usable': False, 'reasons': ['fee_basis:unspecified']},
                'period': dict(self.PERIOD, kind='month', label=None)}
        base.update(overrides)
        return base

    def setUp(self):
        original = reference_comparison.resolve_family
        reference_comparison.resolve_family = lambda ids: 'A' if (ids or {}).get('ios') else None
        self.addCleanup(lambda: setattr(reference_comparison, 'resolve_family', original))

    def test_rows_already_used_by_the_fit_are_never_reused_as_a_check(self):
        path = self.ledger([self.row('fitted'), self.row('fresh')])
        rows = reference_comparison.reference_rows(path, self.PERIOD, {'fitted'})
        self.assertEqual([row['anchor_id'] for row in rows], ['fresh'])

    def test_usable_unmapped_and_extra_store_rows_are_left_out(self):
        path = self.ledger([
            self.row('usable', fit={'usable': True, 'reasons': []}),
            self.row('unmapped', mapping_status='unmapped'),
            self.row('one-store', stores=['app_store', 'google_play', 'one_store']),
            self.row('no-amount', amount_usd_m=None),
            self.row('other-month', period={'start': '2026-07-01', 'end': '2026-07-31', 'kind': 'month'}),
            self.row('keep'),
        ])
        rows = reference_comparison.reference_rows(path, self.PERIOD, set())
        self.assertEqual([row['anchor_id'] for row in rows], ['keep'])

    def test_one_free_scale_per_source_absorbs_the_unstated_basis(self):
        rows = [{'game': 'A', 'family': 'A', 'geography': 'WW', 'amount_usd_million': 20.0,
                 'provider': 'p', 'source_id': 'N02', 'fee_basis': 'unspecified', 'currency': 'USD',
                 'anchor_id': 'a', 'excluded_because': []},
                {'game': 'B', 'family': 'B', 'geography': 'WW', 'amount_usd_million': 10.0,
                 'provider': 'p', 'source_id': 'N02', 'fee_basis': 'unspecified', 'currency': 'USD',
                 'anchor_id': 'b', 'excluded_because': []}]
        coverage = {'days': [{'per_game': [{'game': 'A', 'five_market_share': 1.0},
                                           {'game': 'B', 'five_market_share': 1.0}]}]}
        result = reference_comparison.compare(rows, {'A': 2.0, 'B': 1.0}, coverage)
        source = result['sources'][0]
        self.assertAlmostEqual(source['fitted_scale'], 10.0)
        self.assertAlmostEqual(source['median_abs_error_pct_after_one_scale'], 0.0)
        self.assertEqual(source['kendall_tau_order'], 1.0)

    def test_an_app_store_only_row_is_kept_and_tagged_with_its_store_scope(self):
        path = self.ledger([self.row('ios-only', stores=['app_store']),
                            self.row('both'),
                            self.row('one-store', stores=['app_store', 'google_play', 'one_store'])])
        rows = reference_comparison.reference_rows(path, self.PERIOD, set())
        self.assertEqual([(row['anchor_id'], row['stores']) for row in rows],
                         [('ios-only', ['app_store']), ('both', ['app_store', 'google_play'])])

    def test_store_scopes_are_scored_separately_rather_than_pooled(self):
        rows = [{'game': 'A', 'family': 'A', 'geography': 'WW', 'amount_usd_million': 20.0,
                 'provider': 'p', 'source_id': 'N', 'fee_basis': 'unspecified', 'currency': 'USD',
                 'anchor_id': 'a', 'stores': ['app_store'], 'excluded_because': []},
                {'game': 'B', 'family': 'B', 'geography': 'WW', 'amount_usd_million': 10.0,
                 'provider': 'p', 'source_id': 'N', 'fee_basis': 'unspecified', 'currency': 'USD',
                 'anchor_id': 'b', 'stores': ['app_store', 'google_play'], 'excluded_because': []}]
        coverage = {'days': [{'per_game': [{'game': 'A', 'five_market_share': 1.0},
                                           {'game': 'B', 'five_market_share': 1.0}]}]}
        result = reference_comparison.compare(rows, {'A': 2.0, 'B': 1.0}, coverage)
        self.assertEqual(len(result['sources']), 2)
        self.assertEqual(sorted(row['store_scope'] for row in result['sources'])[0], ['app_store'])

    def test_a_game_without_archived_ranks_is_reported_as_skipped(self):
        rows = [{'game': 'A', 'family': 'A', 'geography': 'WW', 'amount_usd_million': 20.0,
                 'provider': 'p', 'source_id': 'N02', 'fee_basis': 'unspecified', 'currency': 'USD',
                 'anchor_id': 'a', 'excluded_because': []}]
        result = reference_comparison.compare(rows, {}, {'days': []})
        self.assertEqual(result['sources'], [])
        self.assertEqual(result['skipped'][0]['skipped'], 'absent from the five archived markets')


class CountryBiasTests(unittest.TestCase):
    def test_rank_correlation_is_one_for_a_monotone_relation_and_minus_one_when_reversed(self):
        shares = [0.1, 0.2, 0.3, 0.4]
        self.assertAlmostEqual(country_bias_check.rank_correlation(shares, [1.0, 2.0, 3.0, 9.0]), 1.0)
        self.assertAlmostEqual(country_bias_check.rank_correlation(shares, [9.0, 3.0, 2.0, 1.0]), -1.0)

    def test_rank_correlation_needs_at_least_three_games(self):
        self.assertIsNone(country_bias_check.rank_correlation([0.1, 0.2], [1.0, 2.0]))

    def test_the_split_compares_games_above_and_below_the_median_share(self):
        result = country_bias_check.split_medians([0.1, 0.2, 0.3, 0.4], [-10.0, -6.0, 4.0, 8.0])
        self.assertEqual((result['high_share_games'], result['low_share_games']), (2, 2))
        self.assertAlmostEqual(result['high_share_median_error_pct'], 6.0)
        self.assertAlmostEqual(result['low_share_median_error_pct'], -8.0)

    def test_a_country_every_game_shares_equally_yields_no_split(self):
        self.assertEqual(country_bias_check.split_medians([0.2] * 4, [1.0, 2.0, 3.0, 4.0]), {})


class OrderingTests(unittest.TestCase):
    def test_a_perfect_order_agrees_on_every_pair(self):
        scores = ordering_check.pair_scores([100.0, 50.0, 10.0], [9.0, 5.0, 1.0])
        self.assertEqual(scores['pairs'], 3)
        self.assertEqual(scores['agreement'], 1.0)
        self.assertEqual(scores['clear_inversions'], [])

    def test_a_swap_between_close_amounts_is_not_counted_as_a_clear_inversion(self):
        scores = ordering_check.pair_scores([100.0, 96.0], [1.0, 2.0], clear_gap=0.10)
        self.assertEqual(scores['agreement'], 0.0)
        self.assertEqual(scores['clear_pairs'], 0)
        self.assertIsNone(scores['clear_agreement'])

    def test_a_swap_between_separated_amounts_is_reported(self):
        scores = ordering_check.pair_scores([100.0, 50.0], [1.0, 2.0], clear_gap=0.10)
        self.assertEqual(scores['clear_pairs'], 1)
        self.assertEqual(scores['clear_agreement'], 0.0)
        self.assertEqual(scores['clear_inversions'], [(0, 1)])

    def test_equal_published_amounts_carry_no_order_to_check(self):
        scores = ordering_check.pair_scores([10.0, 10.0], [1.0, 2.0])
        self.assertEqual(scores['pairs'], 0)
        self.assertIsNone(scores['agreement'])

    def test_top_overlap_needs_enough_games_and_counts_membership(self):
        self.assertIsNone(ordering_check.top_overlap(['a', 'b'], ['b', 'a'], 5))
        self.assertEqual(ordering_check.top_overlap(['a', 'b', 'c'], ['c', 'b', 'x'], 3), 2 / 3)


class ProxySensitivityTests(unittest.TestCase):
    def table(self):
        return {'countries': [
            {'country': 'US', 'method': 'inherited_v0.1', 'marketProxyUsd': 100.0},
            {'country': 'ZZ', 'method': 'regional_macro_allocation', 'marketProxyUsd': 10.0},
            {'country': 'YY', 'method': 'regional_macro_allocation', 'marketProxyUsd': 5.0}]}

    def test_only_the_estimated_countries_are_rescaled(self):
        perturbed, changed = proxy_sensitivity.perturb(self.table(), 1.3)
        sizes = {row['country']: row['marketProxyUsd'] for row in perturbed['countries']}
        self.assertEqual(changed, 2)
        self.assertEqual(sizes['US'], 100.0)
        self.assertAlmostEqual(sizes['ZZ'], 13.0)
        self.assertAlmostEqual(sizes['YY'], 6.5)

    def test_the_original_table_is_not_modified_in_place(self):
        original = self.table()
        proxy_sensitivity.perturb(original, 2.0)
        self.assertEqual(original['countries'][1]['marketProxyUsd'], 10.0)

    def test_the_comparison_reports_price_movement_and_order_changes(self):
        base = {'factor': 1.0, 'priced': {'a': 100.0, 'b': 50.0}, 'order': ['a', 'b'],
                'params': {'alpha_ios': 1.0}}
        other = {'factor': 1.3, 'priced': {'a': 110.0, 'b': 50.0}, 'order': ['b', 'a'],
                 'params': {'alpha_ios': 1.0}}
        result = proxy_sensitivity.compare(base, other)
        self.assertEqual(result['games_compared'], 2)
        self.assertAlmostEqual(result['max_priced_change_pct'], 10.0)
        self.assertFalse(result['same_top10_order'])
        self.assertFalse(result['params_changed'])


class ArchiveBundleTests(unittest.TestCase):
    def workspace(self):
        source = Path(tempfile.mkdtemp())
        for name, text in {'2026-08-02_ios_us_grossing.csv': 'time,rank,id,title\n00:00,1,a,A\n',
                           '2026-08-03_ios_us_grossing.csv': 'time,rank,id,title\n00:00,1,b,B\n',
                           '2026-09-01_ios_us_grossing.csv': 'time,rank,id,title\n00:00,1,c,C\n'}.items():
            (source / name).write_text(text, encoding='utf-8')
        return source, Path(tempfile.mkdtemp())

    def test_only_that_month_is_bundled_and_the_originals_stay(self):
        source, target = self.workspace()
        manifest = archive_bundle.build(source, target, '2026-08')
        self.assertEqual(manifest['file_count'], 2)
        self.assertEqual(sorted(row['name'] for row in manifest['files']),
                         ['2026-08-02_ios_us_grossing.csv', '2026-08-03_ios_us_grossing.csv'])
        self.assertEqual(len(list(source.iterdir())), 3)

    def test_verification_reads_every_member_back_and_rehashes_it(self):
        source, target = self.workspace()
        manifest = archive_bundle.build(source, target, '2026-08')
        result = archive_bundle.verify(target / '2026-08.zip', manifest)
        self.assertEqual(result['checked'], 2)
        self.assertEqual(result['mismatched'], [])

    def test_a_changed_file_is_reported_rather_than_passed(self):
        source, target = self.workspace()
        manifest = archive_bundle.build(source, target, '2026-08')
        manifest['files'][0]['sha256'] = 'f' * 64
        manifest['files'].append({'name': 'absent.csv', 'bytes': 1, 'sha256': 'a' * 64})
        result = archive_bundle.verify(target / '2026-08.zip', manifest)
        problems = {row['problem'] for row in result['mismatched']}
        self.assertEqual(problems, {'hash differs', 'missing from bundle'})


class ArchiveGapTests(unittest.TestCase):
    MARKETS = (('ios', 'cn'), ('ios', 'us'), ('aos', 'us'))
    CHARTS = ('grossing',)

    def test_unexpected_file_names_are_listed_not_silently_ignored(self):
        folder = Path(tempfile.mkdtemp())
        (folder / '2026-08-02_ios_us_grossing.csv').write_text('x', encoding='utf-8')
        (folder / 'notes.txt').write_text('x', encoding='utf-8')
        scanned = archive_gaps.scan(folder)
        self.assertEqual(scanned['unexpected'], ['notes.txt'])
        self.assertEqual(scanned['present']['2026-08-02'], {('ios', 'us', 'grossing')})

    def test_a_hole_in_the_middle_and_a_stalled_tail_are_both_reported(self):
        present = {'2026-08-01': {('ios', 'cn', 'grossing'), ('ios', 'us', 'grossing'),
                                  ('aos', 'us', 'grossing')},
                   '2026-08-03': {('ios', 'cn', 'grossing'), ('ios', 'us', 'grossing'),
                                  ('aos', 'us', 'grossing')}}
        report = archive_gaps.gaps(present, self.CHARTS, self.MARKETS, through='2026-08-05')
        self.assertEqual(report['missing_days'], ['2026-08-02', '2026-08-04', '2026-08-05'])
        self.assertEqual(report['expected_per_day'], 3)
        self.assertEqual(report['partial_days'], [])

    def test_a_partly_collected_day_lists_the_charts_that_never_arrived(self):
        present = {'2026-08-01': {('ios', 'us', 'grossing')}}
        report = archive_gaps.gaps(present, self.CHARTS, self.MARKETS, through='2026-08-01')
        self.assertEqual(report['partial_days'],
                         [{'date': '2026-08-01', 'missing': ['aos_us_grossing', 'ios_cn_grossing']}])

    def test_missing_files_are_split_into_recoverable_and_truly_absent(self):
        report = {'days': [{'date': '2026-08-02', 'missing': ['ios_us_grossing', 'aos_us_grossing']}]}
        upstream = {'2026-08-02_ios_us_grossing.csv'}
        result = archive_gaps.classify_missing(report, {'2026-08-01': {1, 2}}, upstream)
        self.assertEqual(result['present_upstream_not_local'], ['2026-08-02_ios_us_grossing.csv'])
        self.assertEqual(result['absent_everywhere'], ['2026-08-02_aos_us_grossing.csv'])

    def test_an_unavailable_ref_is_reported_rather_than_assumed_clean(self):
        self.assertEqual(archive_gaps.classify_missing({'days': []}, {}, None), {'ref_available': False})


class RefreshRateTests(unittest.TestCase):
    def test_a_comparison_across_midnight_stays_positive(self):
        self.assertEqual(refresh_rate.minutes_between('23:50', '00:15'), 25.0)
        self.assertEqual(refresh_rate.minutes_between('15:04', '15:29'), 25.0)

    def test_an_unchanged_chart_is_marked_identical_with_nothing_moved(self):
        rows = {'times': ['15:00', '15:25'], 'ranks': [['a', 'b', 'c'], ['a', 'b', 'c']]}
        pairs = refresh_rate.chart_changes(rows, depth=200)
        self.assertEqual(len(pairs), 1)
        self.assertTrue(pairs[0]['identical'])
        self.assertEqual(pairs[0]['positions_changed'], 0)

    def test_a_reordered_tail_counts_positions_but_keeps_the_top_ten_flag(self):
        before = [f'g{index}' for index in range(20)]
        after = before[:10] + list(reversed(before[10:]))
        rows = {'times': ['15:00', '15:25'], 'ranks': [before, after]}
        pairs = refresh_rate.chart_changes(rows, depth=200)
        self.assertFalse(pairs[0]['identical'])
        self.assertTrue(pairs[0]['top10_identical'])
        self.assertEqual(pairs[0]['positions_changed'], 10)

    def test_the_depth_limit_ignores_movement_below_it(self):
        rows = {'times': ['15:00', '15:25'], 'ranks': [['a', 'b', 'c'], ['a', 'b', 'z']]}
        self.assertTrue(refresh_rate.chart_changes(rows, depth=2)[0]['identical'])

    def test_the_summary_groups_by_store_and_country(self):
        per_chart = {'ios_us_grossing': [{'identical': True, 'top10_identical': True,
                                          'positions_changed': 0, 'minutes': 25.0}],
                     'aos_us_grossing': [{'identical': False, 'top10_identical': False,
                                          'positions_changed': 12, 'minutes': 25.0}]}
        rows = refresh_rate.summarise(per_chart)
        self.assertEqual([(row['store'], row['country']) for row in rows],
                         [('aos', 'US'), ('ios', 'US')])
        self.assertEqual(rows[1]['identical_share'], 1.0)
        self.assertEqual(rows[0]['median_positions_changed'], 12.0)


class CoverageCensoringTests(unittest.TestCase):
    def scope(self, censored):
        day = {'date': '2026-09-11', 'lists': {
            'ios_us_grossing': {'times': ['00:00'], 'ranks': [['1', '9']]},
            'ios_de_grossing': {'times': ['00:00'], 'ranks': [['9', '9b']]}}}
        lookup = {'ios:1': 0}
        weights = {('US', 'ios'): 100.0, ('DE', 'ios'): 50.0}
        return coverage_share.index_by_scope(day, lookup, ['Alpha'], weights,
                                             {'ios': 1.0, 'aos': 1.0}, censored)

    def test_observed_only_ignores_a_game_that_never_appears(self):
        result = self.scope(0.0)
        self.assertAlmostEqual(float(result['total'][0]), 100.0)
        self.assertAlmostEqual(float(result['five_market'][0]), 100.0)

    def test_a_censoring_weight_credits_absence_at_the_returned_depth(self):
        result = self.scope(1.0)
        # Absent from a two-row German chart: credited at rank-2 weight, not rank-200.
        self.assertAlmostEqual(float(result['total'][0]), 100.0 + 50.0 * 0.5)

    def test_the_five_market_share_falls_when_absence_is_credited(self):
        without = self.scope(0.0)
        with_floor = self.scope(1.0)
        self.assertEqual(float(without['five_market'][0] / without['total'][0]), 1.0)
        self.assertLess(float(with_floor['five_market'][0] / with_floor['total'][0]), 1.0)


class HeldOutErrorBandTests(unittest.TestCase):
    def test_no_report_means_no_band(self):
        self.assertIsNone(score_day.held_out_error_band(None))
        self.assertIsNone(score_day.held_out_error_band({'empirical_error_reserved': None}))

    def test_the_measured_factor_is_carried_through(self):
        band = score_day.held_out_error_band({'empirical_error_reserved': {
            'labels': 11, 'p90_factor': 1.3, 'median_factor': 1.1}})
        self.assertEqual(band['factor'], 1.3)
        self.assertEqual(band['labels'], 11)
        self.assertEqual(band['source'], 'reserved-game held-out errors')


class CoverageDayArgumentTests(unittest.TestCase):
    def test_a_date_may_carry_its_own_collector_output_directory(self):
        days = coverage_share.parse_days(['2026-09-08', '2026-09-11=reports/session/collector-output'])
        self.assertEqual(days, [('2026-09-08', ''), ('2026-09-11', 'reports/session/collector-output')])


if __name__ == '__main__':
    unittest.main(verbosity=1)
