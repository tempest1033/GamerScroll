"""Independent interval expectations, not source-shape assertions."""
from __future__ import annotations

import copy
import math
import unittest

import literature_intervals as intervals


def pool():
    return [{
        'family': f'game-{i % 5}', 'month': f'2026-{i // 5 + 1:02d}', 'cohort': 'seen',
        'estimate': 100.0, 'actual': 100.0 * math.exp(-(i + 1) / 1000),
        'log_error': (i + 1) / 1000}
        for i in range(20)]


def prediction():
    return {
        'family': 'future-game', 'month': '2026-06', 'class': 'downloads',
        'status': 'estimated', 'estimate': 100.0, 'cohort': 'seen', 'prior_months': 3,
        'out_of_domain': [], 'rank_saturated': False, 'first_observed_month': '2025-12'}


class LiteratureIntervalTests(unittest.TestCase):
    def test_mapie_finite_sample_quantile_matches_hand_computation(self):
        before = pool()
        original = copy.deepcopy(before)
        lower, upper = intervals.mapie_bounds(before, 100.0, symmetric=True)
        # ceil((20 + 1) * .9) = 19, so the absolute log score is .019.
        self.assertAlmostEqual(lower, 100.0 * math.exp(-0.019), places=10)
        self.assertAlmostEqual(upper, 100.0 * math.exp(0.019), places=10)
        self.assertEqual(before, original)

    def test_first_month_and_domain_guards_survive_every_method(self):
        for method in intervals.METHODS:
            first = {**prediction(), 'first_observed_month': '2026-06'}
            self.assertEqual(intervals.interval(first, pool(), 'downloads', method)['reason'],
                             'first_observed_month_not_validated')
            outside = {**prediction(), 'out_of_domain': ['log_index']}
            self.assertEqual(intervals.interval(outside, pool(), 'downloads', method)['reason'],
                             'outside_training_domain')

    def test_twenty_rows_do_not_become_twenty_independent_months(self):
        result = intervals.interval(prediction(), pool(), 'downloads', 'month_block_max')
        self.assertEqual(result['status'], 'withheld')
        self.assertEqual(result['reason'], 'insufficient_independent_month_blocks')
        self.assertEqual(result['calibration_month_blocks'], 4)

    def test_future_residuals_cannot_change_a_present_interval(self):
        future = [{**row, 'month': '2026-07', 'log_error': 10.0,
                   'actual': 100.0 * math.exp(-10)} for row in pool()]
        for method in intervals.METHODS:
            self.assertEqual(
                intervals.interval(prediction(), pool(), 'downloads', method),
                intervals.interval(prediction(), pool() + future, 'downloads', method))


if __name__ == '__main__':
    unittest.main()
