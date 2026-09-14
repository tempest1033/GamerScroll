"""Behavior tests for the band honesty check."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import band_coverage


def draws(values_by_game):
    count = max(len(values) for values in values_by_game.values())
    return [{'priced_usd_million': {game: values[index] for game, values in values_by_game.items()}}
            for index in range(count)]


class BandTests(unittest.TestCase):
    def test_a_band_spans_the_requested_percentiles(self):
        table = band_coverage.bands(draws({'A': [10, 11, 12, 13, 14]}), 0.05, 0.95)
        self.assertEqual(table['A']['draws'], 5)
        self.assertAlmostEqual(table['A']['median'], 12.0)
        self.assertAlmostEqual(table['A']['low'], 10.2)
        self.assertAlmostEqual(table['A']['high'], 13.8)

    def test_a_game_with_too_few_draws_is_left_out(self):
        self.assertEqual(band_coverage.bands(draws({'A': [10, 11]}), 0.05, 0.95), {})

    def test_zero_and_missing_amounts_do_not_enter_a_band(self):
        table = band_coverage.bands(draws({'A': [10, 0, 12, 13, 14, 15]}), 0.0, 1.0)
        self.assertEqual(table['A']['draws'], 5)


class ScoreTests(unittest.TestCase):
    def setUp(self):
        self.table = {'A': {'draws': 30, 'low': 90.0, 'high': 110.0, 'median': 100.0}}

    def row(self, observed, error_pct=0.0, seen=False):
        return {'game': 'A', 'amount_usd_million': observed, 'log_error': 0.0,
                'error_pct': error_pct, 'seen_by_fit': seen,
                'predicted_usd_million': observed}

    def test_an_observation_inside_the_band_counts_as_covered(self):
        result = band_coverage.score([self.row(105.0)], self.table)
        self.assertEqual(result['inside_band'], 1)
        self.assertEqual(result['coverage_pct'], 100.0)
        self.assertEqual(result['misses'], [])

    def test_an_observation_outside_reports_its_distance(self):
        result = band_coverage.score([self.row(132.0)], self.table)
        self.assertEqual(result['inside_band'], 0)
        self.assertAlmostEqual(result['misses'][0]['distance_outside_pct'], 20.0)

    def test_band_width_is_reported_relative_to_the_median(self):
        result = band_coverage.score([self.row(100.0)], self.table)
        self.assertAlmostEqual(result['median_band_width_pct'], 20.0)

    def test_the_widening_factor_says_how_far_short_the_band_falls(self):
        result = band_coverage.score([self.row(121.0)], self.table)
        # The half width is the wider side, log(100/90); log(1.21) is 1.81 times that.
        self.assertAlmostEqual(result['widening_factor_for_90pct'], 1.81, places=2)

    def test_a_game_without_a_band_is_skipped(self):
        result = band_coverage.score([{**self.row(100.0), 'game': 'B'}], self.table)
        self.assertEqual(result['labels_checked'], 0)
        self.assertIsNone(result['coverage_pct'])


class EmpiricalErrorTests(unittest.TestCase):
    def rows(self, factors):
        return [{'amount_usd_million': 100.0 * factor, 'predicted_usd_million': 100.0}
                for factor in factors]

    def test_too_few_labels_produce_no_measurement(self):
        self.assertIsNone(band_coverage.empirical_error(self.rows([1.1, 0.9, 1.2, 1.05])))

    def test_the_factor_is_symmetric_in_log_space(self):
        measured = band_coverage.empirical_error(self.rows([1.25, 0.8, 1.0, 1.1, 1.0, 1.0, 1.0]))
        # 1.25 and 0.8 are the same distance in log space, so both raise the same factor.
        self.assertGreater(measured['p90_factor'], 1.0)
        self.assertAlmostEqual(measured['p90_factor'], 1.25, places=1)
        self.assertEqual(measured['labels'], 7)

    def test_a_perfect_model_reports_no_spread(self):
        measured = band_coverage.empirical_error(self.rows([1.0] * 6))
        self.assertAlmostEqual(measured['p90_factor'], 1.0)
        self.assertAlmostEqual(measured['median_factor'], 1.0)


class LabelRowTests(unittest.TestCase):
    def test_reserved_and_fitted_labels_are_separated_and_priced(self):
        report = {
            'reserved_holdout': {'variant': 'v', 'holdout_games': ['A'],
                                 'rows': [{'game': 'A', 'amount_usd_million': 100.0,
                                           'log_error': 0.0, 'error_pct': 0.0}]},
            'variants': [{'variant': 'v', 'held_out': [
                {'game': 'A', 'amount_usd_million': 100.0, 'log_error': 0.5, 'error_pct': 64.9},
                {'game': 'B', 'amount_usd_million': 50.0, 'log_error': 0.0, 'error_pct': 0.0}]}],
        }
        rows = band_coverage.label_rows(report, 'v')
        self.assertEqual([(row['game'], row['seen_by_fit']) for row in rows],
                         [('A', False), ('B', True)])
        self.assertAlmostEqual(rows[0]['predicted_usd_million'], 100.0)


if __name__ == '__main__':
    unittest.main(verbosity=1)
