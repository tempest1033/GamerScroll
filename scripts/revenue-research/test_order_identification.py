import unittest
from datetime import datetime, timedelta
import numpy as np
from order_feasibility import strict_order_feasibility
from exact_order_certificate import exact_certificate
from intraday_order_relaxation import union_histogram, compact_witness


class OrderIdentificationContracts(unittest.TestCase):
    def test_unanimous_store_conflicts_exclude_missing_and_mixed_scope_pairs(self):
        from earlier_provider_consistency import compare_unanimous_order
        result = compare_unanimous_order(
            ["A", "B", "C", "missing"], [{"A": 2, "B": 1, "C": 3}, {"A": 3, "B": 1, "C": 2}])
        self.assertEqual(result["commonGames"], ["A", "B", "C"])
        self.assertEqual(result["pairCount"], 3)
        self.assertEqual(result["conditionalProviderOrderConflicts"],
                         [{"publishedHigher": "A", "publishedLower": "B", "storeRankPairs": [[2, 1], [3, 1]]}])
        self.assertEqual(result["unanimousAgreements"], 1)
        self.assertEqual(result["storeDisagreementsUnresolved"], 1)

    def test_joint_order_witness_and_individually_possible_but_incompatible_pairs(self):
        feasible = strict_order_feasibility([[1, 1], [0, 1], [0, 0]])
        self.assertEqual(feasible["status"], "strict_order_feasible")
        self.assertAlmostEqual(feasible["maximumCommonMargin"], .5)
        self.assertTrue(np.all(np.diff(feasible["scores"]) < 0))
        self.assertAlmostEqual(sum(feasible["basisWeights"]), 1)
        incompatible = strict_order_feasibility([[1, 0], [0, 1], [.6, .6]])
        self.assertEqual(incompatible["status"], "weak_order_infeasible_at_solver_tolerance")
        self.assertLess(incompatible["maximumCommonMargin"], 0)

    def test_ties_and_invalid_features_never_become_strict_order(self):
        self.assertEqual(strict_order_feasibility([[1, 1], [1, 1]])["status"], "identical_features")
        for features in ([[1]], [[1, -1], [0, 1]], [[1, np.nan], [0, 1]]):
            with self.subTest(features=features), self.assertRaises(ValueError):
                strict_order_feasibility(features)

    def test_integer_certificate_proves_a_joint_conflict_without_rounding_counts(self):
        counts = np.array([[1, 0, 0], [0, 1, 0], [1, 0, 1]])
        proof = exact_certificate(counts)
        self.assertTrue(proof["certified"])
        integers = np.asarray(proof["integerGapWeights"], dtype=object)
        self.assertGreater(sum(integers), 0)
        self.assertTrue(all(integers >= 0))
        self.assertTrue(all(integers @ (counts[:-1] - counts[1:]).astype(object) <= 0))
        self.assertFalse(exact_certificate([[1, 1], [0, 1], [0, 0]])["certified"])
        with self.assertRaises(ValueError):
            exact_certificate([[.5, 0], [0, 1]])

    def test_union_extension_requires_real_boundaries_and_keeps_identity_order(self):
        stamps = [(datetime(2026, 8, 30) + timedelta(hours=12 * i)).isoformat() for i in range(24)]
        original = {"rankLimit": 2, "charts": [{
            "country": "JP", "store": "google_play",
            "observations": [{"at": stamp, "gameRanks": [[1]]} for stamp in stamps]}]}
        extra = {"charts": [{
            "country": "JP", "store": "google_play",
            "observations": [{"at": stamp, "gameRanks": [[2]]} for stamp in stamps]}]}
        cohort = {"period": {"start": "2026-08-31", "end": "2026-09-06"}}
        store = {"mapped": [{"index": 1}, {"index": 0}]}
        hist, early = union_histogram(original, extra, cohort, 1, store)
        wider, later = union_histogram(original, extra, cohort, 1, store, extra_shift_hours=48)
        self.assertEqual(early[0], later[0])
        self.assertGreater(len(later), len(early))
        np.testing.assert_array_equal(hist[:, 0], [[0, 1], [1, 0]])
        np.testing.assert_array_equal(wider[:, 0], hist[:, 0])
        with self.assertRaises(ValueError):
            union_histogram(original, extra, cohort, 1, store, extra_shift_hours=120)
        extra["charts"][0]["observations"][-1]["at"] = "2026-09-20T00:00:00"
        with self.assertRaises(ValueError):
            union_histogram(original, extra, cohort, 1, store)

    def test_sparse_witness_preserves_time_cutoff_meaning(self):
        result = compact_witness({"basisWeights": [0., .25, .75, 0.], "scores": [1, 0]},
                                 ["first", "second"], 2)
        self.assertEqual(result["latentAllocationAtoms"], [
            {"atKst": "first", "cutoff": 2, "weight": .25},
            {"atKst": "second", "cutoff": 1, "weight": .75},
        ])
        self.assertEqual(result["scores"], [1, 0])


if __name__ == "__main__":
    unittest.main()
