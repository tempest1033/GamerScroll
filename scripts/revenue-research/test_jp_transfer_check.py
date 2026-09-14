"""Tests for carrying worldwide months backwards through Japanese charts."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from jp_transfer_check import days_between, monthly_labels, refusal  # noqa: E402

STABLE = {'ratio': 4.0, 'days': 39, 'p10': 3.6, 'p90': 4.4, 'spread_ratio': 4.4 / 3.6}


class Refusal(unittest.TestCase):
    def test_a_stable_well_observed_game_is_carried(self):
        self.assertIsNone(refusal(STABLE, min_days=20, max_spread=2.0))

    def test_a_game_absent_from_japan_is_refused(self):
        self.assertEqual(refusal(None, 20, 2.0),
                         'never seen in the Japanese charts of the overlap')

    def test_too_few_observed_days_is_refused(self):
        reason = refusal({**STABLE, 'days': 9}, 20, 2.0)
        self.assertIn('9 Japanese days', reason)

    def test_a_ratio_that_already_doubles_inside_the_overlap_is_refused(self):
        # A mix that moves this much in five weeks cannot be carried back months.
        reason = refusal({**STABLE, 'p10': 2.0, 'p90': 6.0, 'spread_ratio': 3.0}, 20, 2.0)
        self.assertIn('3.0x', reason)


class Days(unittest.TestCase):
    def test_the_window_includes_both_ends(self):
        self.assertEqual(days_between('2026-02-27', '2026-03-01'),
                         ['2026-02-27', '2026-02-28', '2026-03-01'])


class Labels(unittest.TestCase):
    def test_only_fit_eligible_worldwide_months_outside_august_are_returned(self):
        for row in monthly_labels():
            self.assertTrue(row['fit']['usable'])
            self.assertEqual(row['geography'], 'WW')
            self.assertEqual(row['period']['kind'], 'month')
            self.assertFalse(row['period']['start'].startswith('2026-08'))


if __name__ == '__main__':
    unittest.main()
