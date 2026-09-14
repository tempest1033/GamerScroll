import unittest

from fgo_monthly_growth import (
    calendar_ranks,
    growth_interval,
    lower_bound_mixture,
    monthly_index_bounds,
)


class MonthlyGrowthTests(unittest.TestCase):
    def test_unknown_days_are_bounded_not_zero_imputed(self):
        result = monthly_index_bounds([1, 2, None, 201], 1)
        self.assertEqual(result["lower"], 0.375)
        self.assertEqual(result["upper"], 0.625)
        self.assertEqual(result["unknownDays"], 1)
        self.assertEqual(result["observedBeyondLimitDays"], 1)
        ratio = growth_interval(result, monthly_index_bounds([1, 1, 1, 1], 1))
        self.assertEqual(ratio["lower"], 1.6)
        self.assertAlmostEqual(ratio["upper"], 8 / 3)

    def test_lower_bound_does_not_require_exact_equality(self):
        result = lower_bound_mixture(
            {"lower": 6, "upper": 8}, {"lower": 2, "upper": 2}, 4.4)
        allowed = result["baselineGoogleContributionIntervalNotRuledOut"]
        self.assertEqual(allowed[0], 0)
        self.assertAlmostEqual(allowed[1], 0.6)
        self.assertFalse(result["allAppStoreContributionRuledOut"])
        self.assertTrue(result["allGooglePlayContributionRuledOut"])
        self.assertIsNone(lower_bound_mixture(
            {"lower": 1, "upper": 3}, {"lower": 2, "upper": 4}, 4.4
        )["baselineGoogleContributionIntervalNotRuledOut"])
        self.assertEqual(lower_bound_mixture(
            {"lower": 5, "upper": 5}, {"lower": 6, "upper": 6}, 4.4
        )["baselineGoogleContributionIntervalNotRuledOut"], [0, 1])

    def test_calendar_uses_observed_column_and_preserves_blanks(self):
        rows = [[f"{day}日", "1", "" if day == 2 else "5"] for day in range(1, 32)]
        ranks = calendar_ranks(rows, "2026-07", 2)
        self.assertIsNone(ranks[1])
        self.assertEqual(ranks[0], 5)
        with self.assertRaises(ValueError):
            calendar_ranks(rows[:-1], "2026-07", 2)
        with self.assertRaises(ValueError):
            monthly_index_bounds([0], 1)


if __name__ == "__main__":
    unittest.main()
