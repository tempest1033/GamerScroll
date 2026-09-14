"""Independent expected values for integer-weighted residual summaries."""
import math
import unittest

import numpy as np

from paired_cluster_uncertainty import prepare_statistics, weighted_statistics


class WeightedSummaries(unittest.TestCase):
    def test_integer_weights_match_hand_expansion_including_zero_weight(self):
        rows = [{'error_pct': value, 'log_error': value / 10} for value in (9, 3, 1, 7)]
        # Expanded errors are [1, 3, 3, 7]: median 3, nearest-rank p90 7.
        actual = weighted_statistics(prepare_statistics(rows), np.array([0, 2, 1, 1]))
        self.assertEqual(actual[0], 3)
        self.assertEqual(actual[1], 7)
        self.assertTrue(math.isclose(actual[2], 0.35))

    def test_empty_draw_is_not_reported_as_zero_error(self):
        prepared = prepare_statistics([{'error_pct': 10, 'log_error': 0.1}])
        with self.assertRaisesRegex(ValueError, 'No sampled observations'):
            weighted_statistics(prepared, np.array([0]))


if __name__ == '__main__':
    unittest.main()
