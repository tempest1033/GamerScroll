import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fit_rank_curve as fit


def panel(observations_ios, observations_aos, labels_by_game):
    games = [{'key': name, 'labels': labels} for name, labels in labels_by_game.items()]
    def chart(key, country, store, weight, rows):
        return {'key': key, 'country': country, 'store': store, 'annualMarketProxyUsd': weight,
                'observations': [{'at': f'2026-08-0{index + 1}T00:00',
                                  'returnedRows': len(row), 'depth': len(row),
                                  'ranks': row} for index, row in enumerate(rows)]}
    return {'games': games, 'charts': [
        chart('ios_us', 'US', 'app_store', 100.0, observations_ios),
        chart('aos_us', 'US', 'google_play', 50.0, observations_aos)]}


def label(amount, klass='S|gross|WW|app_store+google_play', qualifier=None, geography='WW'):
    source, fee, _, stores = klass.split('|')
    return {'anchorId': f'{source}:{amount}', 'amountUsdMillion': amount, 'geography': geography,
            'stores': stores.split('+'), 'feeBasis': fee, 'qualifier': qualifier, 'sourceId': source,
            'provider': 'test', 'evidenceRole': 'benchmark', 'usableForGrossFit': fee == 'gross'}


class DesignTests(unittest.TestCase):
    def test_absent_snapshots_contribute_a_censored_floor_not_a_rank(self):
        data = panel([[1, None]], [[None, 2]], {'a': [label(10)], 'b': [label(5)]})
        design = fit.build_design(data)
        without = fit.chart_index(design, 1.0, 1.0, 0.0)
        self.assertEqual(without[0, 0], 1.0)
        self.assertEqual(without[0, 1], 0.0)
        with_floor = fit.chart_index(design, 1.0, 1.0, 0.5)
        self.assertAlmostEqual(with_floor[0, 1], 0.5 / 200)
        self.assertAlmostEqual(with_floor[1, 0], 0.5 / 200)

    def test_unobserved_snapshots_never_dilute_another_charts_average(self):
        data = panel([[1], [1]], [[3]], {'a': [label(10)], 'b': [label(5)]})
        design = fit.build_design(data)
        index = fit.chart_index(design, 1.0, 1.0, 0.0)
        self.assertAlmostEqual(index[0, 0], 1.0)
        self.assertAlmostEqual(index[0, 1], 1 / 3)

    def test_country_multiplier_scales_only_its_own_market(self):
        data = panel([[1, 2]], [[1, 2]], {'a': [label(10)], 'b': [label(5)]})
        design = fit.build_design(data)
        base = {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0, 'country_multipliers': {}}
        mask = np.ones(2)
        plain = fit.model_index(design, base, mask)
        scaled = fit.model_index(design, {**base, 'country_multipliers': {'US': 2.0}}, mask)
        np.testing.assert_allclose(scaled, plain * 2)


class EstimatorTests(unittest.TestCase):
    def setUp(self):
        self.data = panel([[1, 2, 3]], [[1, 2, 3]],
                          {'a': [label(30)], 'b': [label(15)], 'c': [label(10)]})
        self.design = fit.build_design(self.data)
        self.records = fit.label_records(self.data)
        self.labels = fit.prepare_labels(self.records)
        self.masks = fit.scope_masks(self.design, self.records)

    def test_exact_inverse_rank_data_is_recovered_with_zero_error(self):
        params = {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0, 'country_multipliers': {}}
        result = fit.evaluate(self.design, self.labels, self.masks, params)
        self.assertAlmostEqual(result['fitted_rmse_log'], 0.0, places=9)
        self.assertAlmostEqual(result['cv_rmse_log'], 0.0, places=9)
        self.assertEqual(result['cv_labels'], 3)

    def test_a_wrong_exponent_is_penalised_more_than_the_true_one(self):
        base = {'censored': 0.0, 'country_multipliers': {}}
        true = fit.evaluate(self.design, self.labels, self.masks,
                            {**base, 'alpha_ios': 1.0, 'alpha_aos': 1.0})
        wrong = fit.evaluate(self.design, self.labels, self.masks,
                             {**base, 'alpha_ios': 0.3, 'alpha_aos': 0.3})
        self.assertLess(true['cv_rmse_log'], wrong['cv_rmse_log'])

    def test_net_labels_inform_the_shape_without_being_converted(self):
        data = panel([[1, 2, 3]], [[1, 2, 3]], {
            'a': [label(30)], 'b': [label(15)],
            'c': [label(7.0, klass='X|net|WW|app_store+google_play')],
            'd': [label(3.5, klass='X|net|WW|app_store+google_play')]})
        data['charts'][0]['observations'][0]['ranks'] = [1, 2, 3, 6]
        data['charts'][1]['observations'][0]['ranks'] = [1, 2, 3, 6]
        design = fit.build_design(data)
        records = fit.label_records(data)
        labels = fit.prepare_labels(records)
        masks = fit.scope_masks(design, records)
        result = fit.evaluate(design, labels, masks,
                              {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0,
                               'country_multipliers': {}}, detail=True)
        scales = result['scales']
        self.assertAlmostEqual(result['fitted_rmse_log'], 0.0, places=9)
        self.assertGreater(scales['S|gross|WW|app_store+google_play'],
                           scales['X|net|WW|app_store+google_play'])
        self.assertEqual(len({row['game'] for row in result['held_out']}), 4)

    def test_a_published_floor_is_not_penalised_when_the_prediction_is_larger(self):
        gaps = fit.apply_bounds(np.array([-0.5, 0.5]), np.array([1, 1]))
        np.testing.assert_allclose(gaps, [0.0, 0.5])
        ceilings = fit.apply_bounds(np.array([-0.5, 0.5]), np.array([-1, -1]))
        np.testing.assert_allclose(ceilings, [-0.5, 0.0])

    def test_a_class_with_a_single_game_cannot_validate_that_game(self):
        data = panel([[1, 2]], [[1, 2]], {
            'a': [label(30)], 'b': [label(15), label(4, klass='X|net|WW|app_store+google_play')]})
        design = fit.build_design(data)
        records = fit.label_records(data)
        labels = fit.prepare_labels(records)
        masks = fit.scope_masks(design, records)
        result = fit.evaluate(design, labels, masks,
                              {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0,
                               'country_multipliers': {}}, detail=True)
        self.assertEqual(result['cv_labels'], 2)
        self.assertNotIn('X|net|WW|app_store+google_play', {row['klass'] for row in result['held_out']})

    def test_regional_labels_use_only_that_geography(self):
        data = panel([[1, 2]], [[1, 2]], {'a': [label(30)], 'b': [label(15)]})
        data['charts'][1]['country'] = 'JP'
        design = fit.build_design(data)
        records = fit.label_records(data)
        masks = fit.scope_masks(design, records + [{'geography': 'JP'}])
        self.assertEqual(list(masks['JP']), [0.0, 1.0])
        self.assertEqual(list(masks['WW']), [1.0, 1.0])
        with self.assertRaises(ValueError):
            fit.scope_masks(design, records + [{'geography': 'KR'}])


class FoldSelectionBatchTests(unittest.TestCase):
    """The fold-batched selector must pick exactly what per-fold search picks."""

    ALPHAS = [0.5, 0.75, 1.0, 1.25]
    CENSORED = [0.0, 0.5, 1.0]
    MULTIPLIERS = [0.5, 1.0, 2.0]

    def setup(self, variant_extra=None, labels_by_game=None):
        data = panel([[1, 2, 3], [2, 1, 3]], [[3, 1, 2], [1, 3, 2]],
                     labels_by_game or {'a': [label(30)], 'b': [label(12)], 'c': [label(4)]})
        design = fit.build_design(data)
        records = fit.label_records(data)
        labels = fit.prepare_labels(records)
        masks = fit.scope_masks(design, records)
        variant = {'id': 'test', 'stores': 'per_store', 'countries': ['US'], **(variant_extra or {})}
        return design, labels, masks, variant

    def two_country_setup(self, games=3):
        """A Japan weight that genuinely changes the fit, so the optimum is unique."""
        def chart(key, country, store, weight, rows):
            return {'key': key, 'country': country, 'store': store, 'annualMarketProxyUsd': weight,
                    'observations': [{'at': f'2026-08-0{index + 1}T00:00', 'returnedRows': len(row),
                                      'depth': len(row), 'ranks': row}
                                     for index, row in enumerate(rows)]}
        amounts = [30, 12, 4, 22, 7, 3][:games]
        us_first = [1, 5, 20, 2, 12, 40][:games]
        us_second = [3, 9, 30, 4, 15, 45][:games]
        jp_ranks = [30, 2, 1, 26, 6, 11][:games]
        data = {'games': [{'key': chr(ord('a') + index), 'labels': [label(amount)]}
                          for index, amount in enumerate(amounts)],
                'charts': [chart('ios_us', 'US', 'app_store', 100.0, [us_first, us_second]),
                           chart('aos_us', 'US', 'google_play', 40.0, [us_second, us_first]),
                           chart('ios_jp', 'JP', 'app_store', 60.0,
                                 [jp_ranks, [value + 1 for value in jp_ranks]])]}
        design = fit.build_design(data)
        records = fit.label_records(data)
        labels = fit.prepare_labels(records)
        masks = fit.scope_masks(design, records)
        return design, labels, masks, {'id': 'test', 'stores': 'per_store', 'countries': ['JP']}

    def assert_same_selection(self, design, labels, masks, variant):
        """Equal optimum value per fold; equal parameters whenever it is unique."""
        fast = fit.fold_selection_batch(design, labels, masks, variant,
                                        self.ALPHAS, self.CENSORED, self.MULTIPLIERS)
        for game in sorted(set(labels.game.tolist())):
            inner = fit.subset_labels(labels, labels.game != game)
            slow = fit.select_parameters(design, inner, masks, variant,
                                         self.ALPHAS, self.CENSORED, self.MULTIPLIERS)
            fast_score = fit.combined_score(design, inner, masks, variant, fast[game])
            slow_score = fit.combined_score(design, inner, masks, variant, slow)
            self.assertAlmostEqual(fast_score, slow_score, places=10, msg=f'fold {game}')
            if fit.describe(fast[game]) != fit.describe(slow):
                self.assertLess(abs(fast_score - slow_score), 1e-10,
                                f'fold {game}: different parameters must be a genuine tie')

    def test_batched_folds_match_per_fold_search(self):
        design, labels, masks, variant = self.setup()
        self.assert_same_selection(design, labels, masks, variant)

    def test_batched_folds_match_when_the_country_weight_actually_matters(self):
        design, labels, masks, variant = self.two_country_setup()
        fast = fit.fold_selection_batch(design, labels, masks, variant,
                                        self.ALPHAS, self.CENSORED, self.MULTIPLIERS)
        for game in sorted(set(labels.game.tolist())):
            inner = fit.subset_labels(labels, labels.game != game)
            slow = fit.select_parameters(design, inner, masks, variant,
                                         self.ALPHAS, self.CENSORED, self.MULTIPLIERS)
            self.assertEqual(fit.describe(fast[game]), fit.describe(slow), f'fold {game}')

    def test_batched_folds_match_with_the_market_constraint(self):
        design, labels, masks, variant = self.setup(
            {'market_totals': [{'geography': 'US', 'stores': ['app_store'], 'amount_usd_million': 120.0},
                               {'geography': 'US', 'stores': ['google_play'], 'amount_usd_million': 40.0}],
             'market_weight': 1.0})
        self.assert_same_selection(design, labels, masks, variant)

    def test_batched_folds_match_with_the_coverage_correction(self):
        design, labels, masks, variant = self.setup()
        variant['coverage'] = np.array([0.5, 0.8, 1.0])
        self.assert_same_selection(design, labels, masks, variant)

    def test_the_empty_exclusion_reproduces_the_full_grid_search(self):
        design, labels, masks, variant = self.two_country_setup()
        selected = fit.grid_selection(design, labels, masks, variant, self.ALPHAS, self.CENSORED,
                                      self.MULTIPLIERS, [set()])
        direct = fit.select_parameters(design, labels, masks, variant,
                                       self.ALPHAS, self.CENSORED, self.MULTIPLIERS)
        self.assertEqual(fit.describe(selected[0]), fit.describe(direct))

    def test_a_multi_game_exclusion_matches_searching_the_training_subset(self):
        design, labels, masks, variant = self.two_country_setup(games=6)
        reserved = {0, 2}
        selected = fit.grid_selection(design, labels, masks, variant, self.ALPHAS, self.CENSORED,
                                      self.MULTIPLIERS, [reserved])
        training = fit.subset_labels(labels, np.array([game not in reserved for game in labels.game]))
        direct = fit.select_parameters(design, training, masks, variant,
                                       self.ALPHAS, self.CENSORED, self.MULTIPLIERS)
        self.assertAlmostEqual(fit.combined_score(design, training, masks, variant, selected[0]),
                               fit.combined_score(design, training, masks, variant, direct), places=10)

    def test_a_shared_exponent_variant_keeps_both_exponents_equal(self):
        design, labels, masks, variant = self.setup({'stores': 'shared'})
        selected = fit.fold_selection_batch(design, labels, masks, variant,
                                            self.ALPHAS, self.CENSORED, self.MULTIPLIERS)
        for params in selected.values():
            self.assertEqual(params['alpha_ios'], params['alpha_aos'])


class ExtraAxisTests(unittest.TestCase):
    def design(self):
        # Absences are what the censoring weight acts on, so each chart needs one.
        data = panel([[1, None], [2, 3]], [[2, None], [None, 4]], {'a': [label(20)], 'b': [label(6)]})
        return fit.build_design(data)

    def test_a_per_store_censoring_weight_only_changes_the_play_charts(self):
        design = self.design()
        shared = fit.chart_index(design, 1.0, 1.0, 1.0)
        split = fit.chart_index(design, 1.0, 1.0, 1.0, censored_aos=0.0)
        ios = [index for index, flag in enumerate(design.is_ios) if flag]
        play = [index for index, flag in enumerate(design.is_ios) if not flag]
        np.testing.assert_allclose(shared[:, ios], split[:, ios])
        self.assertTrue(np.all(split[:, play] <= shared[:, ios].max()))
        self.assertFalse(np.allclose(shared[:, play], split[:, play]))

    def test_a_china_exponent_leaves_other_countries_untouched(self):
        data = {'games': [{'key': 'a', 'labels': [label(20)]}, {'key': 'b', 'labels': [label(6)]}],
                'charts': [{'key': 'ios_us', 'country': 'US', 'store': 'app_store',
                            'annualMarketProxyUsd': 100.0,
                            'observations': [{'at': '2026-08-01T00:00', 'returnedRows': 2, 'depth': 2,
                                              'ranks': [1, 2]}]},
                           {'key': 'ios_cn', 'country': 'CN', 'store': 'app_store',
                            'annualMarketProxyUsd': 80.0,
                            'observations': [{'at': '2026-08-01T00:00', 'returnedRows': 2, 'depth': 2,
                                              'ranks': [2, 1]}]}]}
        design = fit.build_design(data)
        plain = fit.chart_index(design, 1.0, 1.0, 1.0)
        china = fit.chart_index(design, 1.0, 1.0, 1.0, alpha_cn=2.0)
        us = design.countries.index('US')
        cn = design.countries.index('CN')
        np.testing.assert_allclose(plain[:, us], china[:, us])
        self.assertFalse(np.allclose(plain[:, cn], china[:, cn]))

    def test_the_cache_separates_designs_by_every_curve_parameter(self):
        design = self.design()
        first = fit.cached_chart_index(design, 1.0, 1.0, 1.0)
        second = fit.cached_chart_index(design, 1.0, 1.0, 1.0, censored_aos=0.0)
        self.assertFalse(np.allclose(first, second))
        np.testing.assert_allclose(first, fit.cached_chart_index(design, 1.0, 1.0, 1.0))

    def test_appeared_only_absence_drops_the_floor_where_a_game_never_charted(self):
        data = panel([[1, None], [2, None]], [[None, 1], [None, 2]],
                     {'a': [label(20)], 'b': [label(6)]})
        design = fit.build_design(data)
        every = fit.chart_index(design, 1.0, 1.0, 1.0)
        appeared = fit.chart_index(design, 1.0, 1.0, 1.0, absence_scope='appeared')
        ios = [index for index, flag in enumerate(design.is_ios) if flag][0]
        play = [index for index, flag in enumerate(design.is_ios) if not flag][0]
        # Game 'a' never holds a rank on Play, so only the every-chart rule credits it there.
        self.assertGreater(every[0, play], 0.0)
        self.assertEqual(appeared[0, play], 0.0)
        self.assertAlmostEqual(every[0, ios], appeared[0, ios])

    def test_an_unknown_absence_scope_is_rejected(self):
        design = fit.build_design(panel([[1]], [[1]], {'a': [label(3)]}))
        with self.assertRaises(ValueError):
            fit.chart_index(design, 1.0, 1.0, 1.0, absence_scope='sometimes')

    def test_an_unknown_extra_axis_is_rejected(self):
        with self.assertRaises(ValueError):
            fit.extra_axis({'extra': 'nonsense'}, [1.0], [0.5])
        self.assertEqual(fit.extra_axis({}, [1.0], [0.5]), (None, [None]))


class NestedSelectionTests(unittest.TestCase):
    def test_two_designs_never_share_cached_index_matrices(self):
        first = fit.build_design(panel([[1, 2]], [[1, 2]], {'a': [label(30)], 'b': [label(15)]}))
        first_index = fit.cached_chart_index(first, 1.0, 1.0, 0.0).copy()
        second = fit.build_design(panel([[2, 1, 4]], [[2, 1, 4]],
                                        {'x': [label(9)], 'y': [label(8)], 'z': [label(7)]}))
        second_index = fit.cached_chart_index(second, 1.0, 1.0, 0.0)
        self.assertEqual(second_index.shape, (3, 2))
        self.assertEqual(first_index.shape, (2, 2))
        self.assertIsNot(first.cache, second.cache)
        np.testing.assert_allclose(second_index[:, 0], [0.5, 1.0, 0.25])

    def test_nested_folds_never_see_the_held_out_game(self):
        data = panel([[1, 2, 3, 4]], [[1, 2, 3, 4]],
                     {'a': [label(40)], 'b': [label(20)], 'c': [label(13)], 'd': [label(10)]})
        design = fit.build_design(data)
        records = fit.label_records(data)
        labels = fit.prepare_labels(records)
        masks = fit.scope_masks(design, records)
        variant = {'id': 'shared', 'stores': 'shared', 'countries': []}
        result = fit.nested_cross_validation(design, labels, masks, variant,
                                             [0.5, 1.0, 1.5], [0.0], [1.0])
        self.assertEqual(result['labels'], 4)
        self.assertEqual({row['game'] for row in result['folds']}, {'a', 'b', 'c', 'd'})
        for row in result['folds']:
            self.assertIn(row['selected_params']['alpha_ios'], (0.5, 1.0, 1.5))

    def test_subset_labels_keeps_arrays_and_records_aligned(self):
        data = panel([[1, 2]], [[1, 2]], {'a': [label(30)], 'b': [label(15)]})
        labels = fit.prepare_labels(fit.label_records(data))
        kept = fit.subset_labels(labels, labels.game != 0)
        self.assertEqual([record['game'] for record in kept.records], ['b'])
        self.assertEqual(list(kept.game), [1])
        self.assertEqual(len(kept.geography), 1)
        self.assertEqual(kept.class_names, labels.class_names)


class CoverageAndHoldoutTests(unittest.TestCase):
    def setUp(self):
        self.data = panel([[1, 2, 3, 4]], [[1, 2, 3, 4]],
                          {'a': [label(40)], 'b': [label(20)], 'c': [label(13)], 'd': [label(10)]})
        self.design = fit.build_design(self.data)
        self.records = fit.label_records(self.data)
        self.labels = fit.prepare_labels(self.records)
        self.masks = fit.scope_masks(self.design, self.records)

    def test_coverage_correction_only_rescales_worldwide_scope(self):
        params = {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0, 'country_multipliers': {},
                  'coverage': np.array([0.5, 1.0, 1.0, 1.0])}
        plain = fit.model_index(self.design, {**params, 'coverage': None}, self.masks['WW'])
        corrected = fit.model_index(self.design, params, self.masks['WW'])
        self.assertAlmostEqual(corrected[0], plain[0] * 2)
        self.assertAlmostEqual(corrected[1], plain[1])
        partial = np.array([1.0, 0.0])
        regional_plain = fit.model_index(self.design, {**params, 'coverage': None}, partial)
        regional = fit.model_index(self.design, params, partial)
        np.testing.assert_allclose(regional, regional_plain)

    def test_missing_coverage_report_disables_the_correction(self):
        vector, meta = fit.coverage_vector(self.design, Path('does-not-exist.json'))
        self.assertIsNone(vector)
        self.assertEqual(meta['status'], 'coverage_report_missing')

    def test_coverage_vector_averages_days_and_lists_unmeasured_games(self):
        report = {'days': [
            {'date': '2026-09-08', 'per_game': [{'game': 'a', 'five_market_share': 0.4},
                                                {'game': 'b', 'five_market_share': 0.9}]},
            {'date': '2026-09-09', 'per_game': [{'game': 'a', 'five_market_share': 0.6}]}]}
        path = Path(self.enterContext(tempfile.TemporaryDirectory())) / 'coverage.json'
        path.write_text(json.dumps(report), encoding='utf-8')
        vector, meta = fit.coverage_vector(self.design, path)
        self.assertAlmostEqual(vector[self.design.games.index('a')], 0.5)
        self.assertAlmostEqual(vector[self.design.games.index('b')], 0.9)
        self.assertEqual(vector[self.design.games.index('c')], 1.0)
        self.assertIn('c', meta['games_without_measured_share'])
        self.assertAlmostEqual(meta['max_day_to_day_share_spread'], 0.2)

    def test_holdout_is_deterministic_and_excluded_from_training(self):
        first = fit.holdout_split(self.design)
        self.assertEqual(first, fit.holdout_split(self.design))
        self.assertTrue(set(first).issubset(set(self.design.games)))
        variant = {'id': 'shared', 'stores': 'shared', 'countries': []}
        forced = [self.design.games[0]]
        result = fit.evaluate_holdout(self.design, self.labels, self.masks, variant, forced,
                                      [0.5, 1.0], [0.0], [1.0])
        self.assertEqual(result['holdout_games'], forced)
        self.assertEqual(result['training_games'], len(self.design.games) - 1)
        self.assertEqual({row['game'] for row in result['rows']}, set(forced))


class CoordinateSearchTests(unittest.TestCase):
    def setUp(self):
        data = panel([[1, 2, 3, 4]], [[4, 3, 2, 1]],
                     {'a': [label(40)], 'b': [label(22)], 'c': [label(14)], 'd': [label(11)]})
        self.design = fit.build_design(data)
        records = fit.label_records(data)
        self.labels = fit.prepare_labels(records)
        self.masks = fit.scope_masks(self.design, records)

    def test_coordinate_search_matches_the_exhaustive_optimum_on_a_small_grid(self):
        variant = {'id': 'store', 'stores': 'per_store', 'countries': [], 'search': 'coordinate'}
        alphas = [0.5, 1.0, 1.5]
        censored = [0.0, 1.0]
        params, score = fit.coordinate_search(self.design, self.labels, self.masks, variant,
                                              alphas, censored, [1.0])
        exhaustive = min(
            (evaluated for evaluated in (
                fit.evaluate(self.design, self.labels, self.masks, candidate)
                for candidate in fit.candidate_parameters({**variant, 'countries': []},
                                                          alphas, censored, [1.0]))),
            key=lambda row: row['cv_rmse_log'])
        self.assertAlmostEqual(score, exhaustive['cv_rmse_log'], places=9)
        self.assertIn(params['alpha_ios'], alphas)

    def test_coordinate_search_keeps_every_requested_country_axis(self):
        variant = {'id': 'markets', 'stores': 'per_store', 'countries': ['US'], 'search': 'coordinate'}
        params, _ = fit.coordinate_search(self.design, self.labels, self.masks, variant,
                                          [1.0], [0.0], [0.5, 1.0, 2.0])
        self.assertEqual(set(params['country_multipliers']), {'US'})
        self.assertIn(params['country_multipliers']['US'], (0.5, 1.0, 2.0))


class BatchEvaluationTests(unittest.TestCase):
    def setUp(self):
        data = panel([[1, 2, 3, 4, None]], [[4, 3, None, 1, 2]],
                     {'a': [label(40)], 'b': [label(22)], 'c': [label(14)],
                      'd': [label(11)], 'e': [label(6, klass='S|gross|WW|app_store+google_play')]})
        data['charts'][1]['country'] = 'JP'
        self.design = fit.build_design(data)
        self.records = fit.label_records(data)
        self.labels = fit.prepare_labels(self.records)
        self.masks = fit.scope_masks(self.design, self.records)
        self.plan = fit.batch_plan(self.design, self.labels)

    def scores_one_by_one(self, combos, alpha_ios, alpha_aos, censored, coverage=None):
        return [fit.evaluate(self.design, self.labels, self.masks,
                             {'alpha_ios': alpha_ios, 'alpha_aos': alpha_aos, 'censored': censored,
                              'country_multipliers': dict(zip(['US', 'JP'], combo)),
                              'coverage': coverage})['cv_rmse_log']
                for combo in combos]

    def test_batch_scores_match_single_parameter_evaluation(self):
        combos = [(0.5, 1.0), (1.0, 1.0), (2.0, 0.25)]
        matrix = fit.multiplier_matrix(self.design, ['US', 'JP'], combos)
        batched = fit.evaluate_batch(self.design, self.labels, self.masks, self.plan,
                                     1.1, 0.6, 0.4, matrix)
        np.testing.assert_allclose(batched, self.scores_one_by_one(combos, 1.1, 0.6, 0.4), rtol=1e-12)

    def test_batch_respects_the_coverage_correction(self):
        coverage = np.array([0.4, 0.8, 1.0, 0.5, 0.9])
        combos = [(1.0, 1.0), (1.5, 0.5)]
        matrix = fit.multiplier_matrix(self.design, ['US', 'JP'], combos)
        batched = fit.evaluate_batch(self.design, self.labels, self.masks, self.plan,
                                     0.9, 0.7, 1.0, matrix, coverage)
        np.testing.assert_allclose(batched, self.scores_one_by_one(combos, 0.9, 0.7, 1.0, coverage),
                                   rtol=1e-12)

    def test_exhaustive_search_returns_the_grid_minimum(self):
        variant = {'id': 'markets', 'stores': 'per_store', 'countries': ['JP']}
        alphas = [0.6, 1.0, 1.4]
        censored = [0.0, 1.0]
        multipliers = [0.5, 1.0, 2.0]
        best, score = fit.exhaustive_search(self.design, self.labels, self.masks, variant,
                                            alphas, censored, multipliers)
        every = [fit.evaluate(self.design, self.labels, self.masks, candidate)['cv_rmse_log']
                 for candidate in fit.candidate_parameters(variant, alphas, censored, multipliers)]
        self.assertAlmostEqual(score, min(every), places=12)
        self.assertAlmostEqual(
            fit.evaluate(self.design, self.labels, self.masks, best)['cv_rmse_log'], score, places=12)


class MarketConstraintTests(unittest.TestCase):
    def setUp(self):
        data = panel([[1, 2, 3]], [[1, 2, 3]], {'a': [label(30)], 'b': [label(15)], 'c': [label(10)]})
        data['charts'][1]['country'] = 'JP'
        self.design = fit.build_design(data)
        records = fit.label_records(data)
        self.labels = fit.prepare_labels(records)
        self.masks = fit.scope_masks(self.design, records)

    def test_chart_mass_counts_every_rank_the_chart_returned(self):
        masses = fit.chart_mass(self.design, 1.0, 1.0)
        self.assertAlmostEqual(masses[0], 1 + 1 / 2 + 1 / 3)
        self.assertAlmostEqual(masses[1], 1 + 1 / 2 + 1 / 3)

    def test_market_residuals_score_ratios_not_the_absolute_level(self):
        totals = [{'geography': 'US', 'stores': ['app_store'], 'amount_usd_million': 100.0},
                  {'geography': 'JP', 'stores': ['google_play'], 'amount_usd_million': 50.0}]
        params = {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0, 'country_multipliers': {}}
        residuals = fit.market_residuals(self.design, params, totals)
        doubled = fit.market_residuals(
            self.design, {**params, 'country_multipliers': {'US': 2.0, 'JP': 2.0}}, totals)
        np.testing.assert_allclose(residuals, doubled, atol=1e-12)
        self.assertAlmostEqual(float(residuals.sum()), 0.0, places=12)

    def test_market_residuals_reward_the_ratio_the_published_totals_imply(self):
        totals = [{'geography': 'US', 'stores': ['app_store'], 'amount_usd_million': 100.0},
                  {'geography': 'JP', 'stores': ['google_play'], 'amount_usd_million': 100.0}]
        params = {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 0.0, 'country_multipliers': {}}
        wrong = fit.market_penalty(self.design, params, totals)
        # chart weights are 100 and 50, so doubling Japan makes the two markets equal
        right = fit.market_penalty(self.design, {**params, 'country_multipliers': {'JP': 2.0}}, totals)
        self.assertGreater(wrong, right)
        self.assertAlmostEqual(right, 0.0, places=12)

    def test_batched_market_scores_match_the_single_parameter_combined_score(self):
        totals = [{'geography': 'US', 'stores': ['app_store'], 'amount_usd_million': 100.0},
                  {'geography': 'JP', 'stores': ['google_play'], 'amount_usd_million': 60.0}]
        variant = {'id': 'm', 'stores': 'per_store', 'countries': ['JP'],
                   'market_totals': totals, 'market_weight': 1.0}
        plan = fit.batch_plan(self.design, self.labels)
        combos = [(0.5,), (1.0,), (2.0,)]
        matrix = fit.multiplier_matrix(self.design, ['JP'], combos)
        batched = fit.evaluate_batch(self.design, self.labels, self.masks, plan, 1.1, 0.7, 0.5,
                                     matrix, None, totals, 1.0, ['JP'])
        expected = [fit.combined_score(self.design, self.labels, self.masks, variant,
                                       {'alpha_ios': 1.1, 'alpha_aos': 0.7, 'censored': 0.5,
                                        'country_multipliers': {'JP': value}, 'coverage': None})
                    for (value,) in combos]
        np.testing.assert_allclose(batched, expected, rtol=1e-12)

    def test_batched_market_penalty_matches_the_per_parameter_penalty(self):
        totals = [{'geography': 'US', 'stores': ['app_store'], 'amount_usd_million': 100.0},
                  {'geography': 'JP', 'stores': ['google_play'], 'amount_usd_million': 60.0}]
        combos = [(0.5,), (1.0,), (2.0,), (4.0,)]
        matrix = fit.multiplier_matrix(self.design, ['JP'], combos)
        batched = fit.market_penalty_batch(self.design, 1.1, 0.7, matrix, totals)
        expected = [fit.market_penalty(self.design,
                                       {'alpha_ios': 1.1, 'alpha_aos': 0.7,
                                        'country_multipliers': {'JP': value}}, totals)
                    for (value,) in combos]
        np.testing.assert_allclose(batched, expected, rtol=1e-12)

    def test_a_published_total_without_a_matching_chart_is_skipped(self):
        totals = [{'geography': 'KR', 'stores': ['app_store'], 'amount_usd_million': 10.0}]
        selector, published = fit.market_selector(self.design, totals)
        self.assertEqual(selector.size, 0)
        self.assertEqual(published.size, 0)
        np.testing.assert_allclose(
            fit.market_penalty_batch(self.design, 1.0, 1.0, np.ones((2, 3)), totals), np.zeros(3))


if __name__ == '__main__':
    unittest.main()
