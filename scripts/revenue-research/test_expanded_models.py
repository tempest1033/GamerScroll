import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
import unittest
import numpy as np

from weekly_growth import weekly_histograms
from weekly_partial_bounds import build_model
from store_order_dominance import cumulative_dominance
from store_pareto import nondominated


def load_lp():
    spec = importlib.util.spec_from_file_location("partial_bounds_tests", Path(__file__).with_name("partial-bounds.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ExpandedResearchContracts(unittest.TestCase):
    def test_mixture_interval_respects_each_stores_available_game_capacity(self):
        from holiday_mixture_identification import mixture_interval
        exact = mixture_interval([.2, .05], [100, 100], 25)
        self.assertEqual(exact["status"], "feasible")
        self.assertAlmostEqual(exact["minimumIosMixture"], .5)
        self.assertAlmostEqual(exact["maximumIosMixture"], .5)
        flexible = mixture_interval([.2, .05], [100, 100], 20)
        self.assertAlmostEqual(flexible["minimumIosMixture"], 3 / 7)
        self.assertEqual(flexible["maximumIosMixture"], 1)
        self.assertEqual(mixture_interval([.2, .05], [100, 100], 26)["status"], "infeasible")
        self.assertEqual(mixture_interval([0, .2], [100, 100], 20)["minimumIosMixture"], 0)

    def test_daily_budget_witness_meets_totals_and_exposes_impossible_targets(self):
        from daily_budget_identification import minimum_daily_concentration
        shares = np.array([[.1, .2], [0, 0]])
        feasible = minimum_daily_concentration(shares, [100, 100], 18)
        self.assertTrue(feasible["feasible"])
        self.assertAlmostEqual(feasible["minimumMaxDailyBudgetToUniformMean"], 1.6)
        allocations = np.asarray(feasible["latentStoreDailyBudgetsMillion"])
        np.testing.assert_allclose(allocations.sum(axis=1), [100, 100])
        self.assertGreaterEqual(float(np.sum(allocations * shares)), 18 - 1e-8)
        impossible = minimum_daily_concentration(shares, [100, 100], 25)
        self.assertFalse(impossible["feasible"])
        self.assertIsNone(impossible["latentStoreDailyBudgetsMillion"])

    def test_historical_source_requires_the_exact_recorded_bytes(self):
        import hashlib
        from verify_expanded import resolve_fingerprint
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "module.py").write_bytes(b"new implementation")
            (root / "old-version.txt").write_bytes(b"original implementation")
            expected = hashlib.sha256(b"original implementation").hexdigest()
            item = {"path": "module.py", "sha256": expected}
            archive = {("module.py", expected): "old-version.txt"}
            self.assertEqual(resolve_fingerprint(item, root, archive, {}), "old-version.txt")
            (root / "old-version.txt").write_bytes(b"corrupted archive")
            with self.assertRaises(ValueError):
                resolve_fingerprint(item, root, archive, {})

    def test_store_budget_ceiling_cannot_overallocate_either_store(self):
        from holiday_budget_gate import common_budget_ceiling
        self.assertAlmostEqual(common_budget_ceiling([160, 80], .625), 80 / .375)
        self.assertEqual(common_budget_ceiling([160, 80], 0), 80)
        self.assertEqual(common_budget_ceiling([160, 80], 1), 160)
        with self.assertRaises(ValueError):
            common_budget_ceiling([-1, 80], .5)
        with self.assertRaises(ValueError):
            common_budget_ceiling([160, 80], 1.1)

    def test_hold_conventions_preserve_boundaries_without_extrapolating(self):
        from temporal_transfer import interval_average
        times = np.array([0., 10., 20.])
        values = [1., 4., 2.]
        self.assertAlmostEqual(interval_average(times, values, 5, 15, method="previous")["mean"], 2.5)
        self.assertAlmostEqual(interval_average(times, values, 5, 15, method="next")["mean"], 3.)
        for method in ("previous", "next"):
            self.assertIsNone(interval_average(times, values, -1, 15, method=method))
            self.assertIsNone(interval_average(times, values, 5, 21, method=method))
        with self.assertRaises(ValueError):
            interval_average(times, values, 0, 10, method="guess")
        from temporal_transfer import integrate_window
        series = [
            {"country": "JP", "times": times, "values": values},
            {"country": "US", "times": times, "values": [2., 2., 2.]},
        ]
        for method, mean in (("previous", 2.5), ("next", 3.)):
            result = integrate_window(series, 5, 15, method=method)
            self.assertAlmostEqual(result["predictionMillion"], (mean + 2) * 10 / 86400)
            self.assertAlmostEqual(sum(result["countryPredictionsMillion"].values()),
                                   result["predictionMillion"])

    def test_reference_omission_removes_the_game_from_both_stores(self):
        from reference_stability import losses_without_games
        pairs = [("A", "B"), ("B", "C"), ("A", "C")]
        first = np.array([[2, 0, 2], [0, 2, 0]])
        second = np.array([[0, 2, 2], [2, 0, 0]])
        before = losses_without_games([(first, pairs), (second, pairs)], ("A",))
        first[:, [0, 2]] = 2 - first[:, [0, 2]]
        second[:, [0, 2]] = 2 - second[:, [0, 2]]
        after = losses_without_games([(first, pairs), (second, pairs)], ("A",))
        np.testing.assert_array_equal(before, [[0, 1], [1, 0]])
        np.testing.assert_array_equal(after, before)

    def test_added_constraints_take_effect_after_an_earlier_solve(self):
        lp = load_lp()
        model = lp.LinearModel(1)
        model.add({0: 1}, 10, "ub", "initial_budget")
        self.assertAlmostEqual(model.solve(np.array([-1.])).x[0], 10)
        model.add({0: -1}, -12, "ub", "new_incompatible_floor")
        self.assertEqual(model.solve(np.zeros(1)).status, 2)

    def test_numerical_recovery_preserves_infeasibility_and_original_failure(self):
        lp = load_lp()
        initial = SimpleNamespace(status=4, message="numerical ambiguity")
        recovered = SimpleNamespace(status=2, message="infeasible", success=False)
        model = lp.LinearModel(1)
        with patch.object(lp, "linprog", side_effect=[initial, recovered]) as solve:
            result = model.solve(np.zeros(1))
        self.assertFalse(result.success)
        self.assertEqual(solve.call_count, 2)
        self.assertEqual(model.solver_recoveries[0]["initial"]["status"], 4)
        self.assertEqual(model.solver_recoveries[0]["retry"]["status"], 2)
        with patch.object(lp, "linprog", return_value=SimpleNamespace(status=1, message="time limit")):
            with self.assertRaisesRegex(RuntimeError, "time limit"):
                model.solve(np.zeros(1))

    def test_clock_and_explicit_window_shift_have_the_same_observable_exposure(self):
        observations = [{"at": f"2026-08-0{day}T00:00:00", "gameRanks": [[rank]]}
                        for day, rank in ((1, 1), (2, 2), (3, 2))]
        panel = {"games": [{"key": "A"}], "rankLimit": 2, "charts": [
            {"key": f"{store}_jp", "country": "JP", "store": kind, "observations": observations}
            for store, kind in (("ios", "app_store"), ("aos", "google_play"))]}
        weeks = [{"period": {"start": "2026-08-01", "end": "2026-08-01"}}]
        _, direct = weekly_histograms(panel, weeks, 9)
        _, equivalent = weekly_histograms(panel, weeks, 0, window_shift_hours=-9)
        _, lagged = weekly_histograms(panel, weeks, 9, window_shift_hours=24)
        np.testing.assert_allclose(direct[0]["histogram"], equivalent[0]["histogram"])
        np.testing.assert_allclose(direct[0]["histogram"][0, 0], [.5, .5])
        np.testing.assert_allclose(lagged[0]["histogram"][0, 0], [0, 1])

    def test_later_week_labels_and_exposures_cannot_change_training_feasibility(self):
        lp = load_lp()
        hist = np.zeros((5, 1, 2, 2))
        hist[1, 0, 0, 1] = 1
        hist[2:4, 0, 0, 0] = 1
        weeks = [{"mappedRows": []} for _ in range(5)]
        weeks[2]["mappedRows"] = [{"gameIndex": 0, "revenueGrowthPercent": 100}]
        weeks[3]["mappedRows"] = [{"gameIndex": 0, "revenueGrowthPercent": 0}]
        before, _ = build_model(lp, hist, weeks, 1)
        objective = np.zeros(before.variables)
        objective[-1] = -1
        first = before.solve(objective)
        hist[4] = 1000
        weeks[4]["mappedRows"] = [{"gameIndex": 0, "revenueGrowthPercent": -99}]
        after, _ = build_model(lp, hist, weeks, 1)
        second = after.solve(objective)
        self.assertTrue(first.success and second.success)
        self.assertGreater(first.x[-1], 0)
        self.assertAlmostEqual(first.fun, second.fun)

    def test_dominance_distinguishes_ties_from_a_curve_independent_conflict(self):
        equal = cumulative_dominance([.2, .3, .1], [.2, .3, .1])
        self.assertTrue(equal["weakDominance"])
        self.assertFalse(equal["strictAtSomeCutoff"])
        dominant = cumulative_dominance([.5, .25, .25], [0, .25, .25])
        self.assertTrue(dominant["weakDominance"])
        self.assertTrue(dominant["strictAtSomeCutoff"])
        crossing = cumulative_dominance([.2, 0, .8], [0, .5, .5])
        self.assertFalse(crossing["weakDominance"])

    def test_pareto_filter_keeps_tradeoffs_and_all_ties(self):
        values = [[1, 3], [2, 2], [3, 1], [2, 3], [1, 3]]
        np.testing.assert_array_equal(nondominated(values), [True, True, True, False, True])
        with self.assertRaises(ValueError):
            nondominated([[1, np.nan]])

    def test_completed_checkpoint_resumes_without_recomputing_windows(self):
        import weekly_clock_lag as module
        paths = [
            module.PANEL, "reports/rank-models/weekly-growth-2026-09-11.json",
            "reports/rank-models/consensus-japan-2026-09-11.json",
            "reports/rank-models/normalized-august-regional-panel-2026-09-10.json"]
        fingerprints = [{"path": path, "sha256": "fixture"} for path in paths]
        windows = [{"effectiveWindowOffsetHours": offset} for offset in sorted({
            row["effectiveWindowOffsetHours"] for row in module.scenarios()})]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root / "reports/rank-models"
            folder.mkdir(parents=True)
            target = folder / "weekly-clock-lag-2026-09-11.json"
            target.with_suffix(".partial.json").write_text(json.dumps({
                "inputs": fingerprints, "windows": windows, "status": "partial"}), encoding="utf-8")
            with patch.object(module, "ROOT", root), \
                    patch.object(module, "read_json", return_value={"games": [], "charts": [], "results": []}), \
                    patch.object(module, "rank_histograms", return_value=np.zeros((0, 2, 2))), \
                    patch.object(module, "input_fingerprint", side_effect=lambda path: {"path": path, "sha256": "fixture"}), \
                    patch.object(module, "weekly_histograms", side_effect=AssertionError("Cached windows must not be recomputed")), \
                    patch("sys.argv", ["weekly_clock_lag.py", "--resume"]):
                module.main()
            resumed = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(resumed["status"], "complete")
            self.assertEqual(resumed["windows"], windows)


if __name__ == "__main__":
    unittest.main()
