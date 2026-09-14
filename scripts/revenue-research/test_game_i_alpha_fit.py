"""Tests for the Japanese re-estimate of the rank curve and its depth control."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from game_i_alpha_fit import index_at, rmse_log  # noqa: E402
from game_i_depth_confound import day_index  # noqa: E402


def sample(ranks_ios, ranks_aos, depth=200):
    games = len(ranks_ios)
    return {'days': 1,
            'ranks': {'ios': np.array(ranks_ios, dtype=np.float64).reshape(games, -1),
                      'aos': np.array(ranks_aos, dtype=np.float64).reshape(games, -1)},
            'depths': {'ios': np.array([depth], dtype=np.float64),
                       'aos': np.array([depth], dtype=np.float64)}}


class Index(unittest.TestCase):
    def test_a_better_rank_is_worth_more(self):
        values = index_at(sample([[1], [10]], [[1], [10]]), 1.0, 1.0, 1.0)
        self.assertGreater(values[0], values[1])

    def test_absence_is_priced_at_the_returned_depth_not_zero(self):
        values = index_at(sample([[0]], [[0]], depth=100), 1.0, 1.0, 1.0)
        self.assertGreater(values[0], 0.0)

    def test_a_charting_game_beats_an_absent_one(self):
        values = index_at(sample([[150], [0]], [[150], [0]], depth=200), 1.0, 1.0, 1.0)
        self.assertGreater(values[0], values[1])


class LogError(unittest.TestCase):
    def test_one_free_scale_is_removed(self):
        index = np.array([1.0, 2.0, 4.0])
        published = np.array([10.0, 20.0, 40.0])
        self.assertAlmostEqual(rmse_log(index, published), 0.0)
        self.assertAlmostEqual(rmse_log(index * 7.5, published), 0.0)

    def test_a_wrong_shape_is_not_removed_by_the_scale(self):
        self.assertGreater(rmse_log(np.array([1.0, 2.0, 4.0]), np.array([10.0, 20.0, 80.0])), 0.0)


class DayIndex(unittest.TestCase):
    def test_present_apps_are_priced_by_rank(self):
        values = day_index(['a', 'b'], 200, 1.0, 1.0, ['a', 'b'])
        self.assertAlmostEqual(values[0], 1.0)
        self.assertAlmostEqual(values[1], 0.5)

    def test_an_app_outside_a_shallow_chart_is_priced_at_that_depth(self):
        # Being outside a 100-row chart is weaker evidence than outside a 200-row one.
        shallow = day_index(['a'], 100, 1.0, 1.0, ['missing'])[0]
        deep = day_index(['a'], 200, 1.0, 1.0, ['missing'])[0]
        self.assertGreater(shallow, deep)


if __name__ == '__main__':
    unittest.main()
