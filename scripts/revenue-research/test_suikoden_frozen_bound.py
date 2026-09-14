import unittest

from suikoden_frozen_bound import lower_floor_comparison


class PaymentFloorTests(unittest.TestCase):
    def test_lower_bound_reports_only_a_minimum_shortfall(self):
        below = lower_floor_comparison(6, 7.5)
        self.assertEqual(below["minimumShortfallMillion"], 1.5)
        self.assertEqual(below["minimumRelativeShortfallPercent"], 20)
        self.assertFalse(below["atOrAboveReportedFloor"])
        self.assertIsNone(below["exactMonetaryError"])
        above = lower_floor_comparison(10, 7.5)
        self.assertTrue(above["atOrAboveReportedFloor"])
        self.assertEqual(above["minimumShortfallMillion"], 0)
        self.assertIsNone(above["exactMonetaryError"])
        with self.assertRaises(ValueError):
            lower_floor_comparison(1, 0)


if __name__ == "__main__":
    unittest.main()
