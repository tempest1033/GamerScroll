"""Behavior tests for the market-total leave-one-out comparison."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import market_total_sensitivity as sensitivity


def scenario(tag, priced, order=None, params=None, nested=0.25, holdout=10.0):
    return {'scenario': tag, 'priced': priced, 'order': order or list(priced),
            'params': params or {'alpha_ios': 1.05, 'alpha_aos': 0.5},
            'nested_cv_rmse_log': nested, 'holdout_median_abs_pct': holdout}


class CompareTests(unittest.TestCase):
    def test_an_identical_scenario_reports_no_movement(self):
        base = scenario('all', {'A': 100.0, 'B': 50.0})
        result = sensitivity.compare(base, scenario('without-US', {'A': 100.0, 'B': 50.0}))
        self.assertEqual(result['median_amount_move_pct'], 0.0)
        self.assertEqual(result['max_amount_move_pct'], 0.0)
        self.assertEqual(result['params_changed'], {})
        self.assertEqual(result['top10_positions_unchanged'], 2)

    def test_movement_is_measured_per_game_and_the_largest_is_named(self):
        base = scenario('all', {'A': 100.0, 'B': 50.0})
        result = sensitivity.compare(base, scenario('without-CN', {'A': 110.0, 'B': 75.0}))
        self.assertAlmostEqual(result['max_amount_move_pct'], 50.0)
        self.assertEqual(result['largest_mover'], 'B')

    def test_reordering_is_counted_separately_from_amounts(self):
        base = scenario('all', {'A': 100.0, 'B': 50.0}, order=['A', 'B'])
        moved = scenario('without-CN', {'A': 100.0, 'B': 50.0}, order=['B', 'A'])
        result = sensitivity.compare(base, moved)
        self.assertEqual(result['median_amount_move_pct'], 0.0)
        self.assertEqual(result['top10_positions_unchanged'], 0)

    def test_parameter_and_error_changes_are_reported(self):
        base = scenario('all', {'A': 100.0})
        other = scenario('no-market-constraint', {'A': 100.0},
                         params={'alpha_ios': 1.2, 'alpha_aos': 0.5}, nested=0.2539, holdout=12.2)
        result = sensitivity.compare(base, other)
        self.assertEqual(result['params_changed'], {'alpha_ios': [1.05, 1.2]})
        self.assertAlmostEqual(result['nested_cv_delta'], 0.0039, places=4)
        self.assertAlmostEqual(result['holdout_delta_pct'], 2.2, places=6)

    def test_a_game_missing_from_the_other_scenario_is_skipped(self):
        base = scenario('all', {'A': 100.0, 'B': 50.0})
        result = sensitivity.compare(base, scenario('without-JP', {'A': 100.0}))
        self.assertEqual(result['games_compared'], 1)


if __name__ == '__main__':
    unittest.main(verbosity=1)
