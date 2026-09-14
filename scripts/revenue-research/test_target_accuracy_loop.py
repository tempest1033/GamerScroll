"""Observable contracts for local past-only correction experiments."""
import math
import unittest

from target_accuracy_loop import local_correction


class LocalCorrectionTests(unittest.TestCase):
    def test_latest_anchor_corrects_multiplicative_bias(self):
        history = [
            {'month': '2026-05', 'class': 'gross', 'weight': 1.0, 'residual': math.log(1.1)},
            {'month': '2026-06', 'class': 'gross', 'weight': 1.0, 'residual': math.log(1.2)},
        ]
        self.assertAlmostEqual(
            100 * math.exp(local_correction(history, '2026-07', 'gross', 'local_full')), 120)
        self.assertAlmostEqual(
            100 * math.exp(local_correction(history, '2026-07', 'gross', 'local_half')),
            100 * math.sqrt(1.2))

    def test_future_and_different_fee_class_do_not_enter(self):
        history = [
            {'month': '2026-06', 'class': 'gross', 'weight': 1.0, 'residual': math.log(1.2)},
            {'month': '2026-07', 'class': 'gross', 'weight': 1.0, 'residual': 100.0},
            {'month': '2026-08', 'class': 'gross', 'weight': 1.0, 'residual': 100.0},
            {'month': '2026-06', 'class': 'net', 'weight': 1.0, 'residual': 100.0},
        ]
        for mode in ('local_half', 'local_full', 'local_recent'):
            self.assertAlmostEqual(
                local_correction(history, '2026-07', 'gross', mode),
                math.log(1.2) * (0.5 if mode == 'local_half' else 1.0))

    def test_recent_level_has_one_month_half_life(self):
        history = [
            {'month': '2026-05', 'class': 'downloads', 'weight': 1.0, 'residual': 0.2},
            {'month': '2026-06', 'class': 'downloads', 'weight': 1.0, 'residual': 0.8},
        ]
        self.assertAlmostEqual(local_correction(history, '2026-07', 'downloads', 'local_recent'), 0.6)

    def test_no_matching_history_leaves_estimate_unchanged(self):
        self.assertEqual(local_correction([], '2026-07', 'gross', 'local_full'), 0.0)


if __name__ == '__main__':
    unittest.main()
