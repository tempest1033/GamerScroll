import importlib.util
from pathlib import Path
import unittest
import numpy as np

from simulate import snapshot_weights, rank_histograms, chart_features, fit_positive, run
from constrained import fit_budget


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ModelContracts(unittest.TestCase):
    def panel(self):
        return {
            "rankLimit": 4, "period": {"start": "2026-08-01", "end": "2026-08-31"},
            "games": [{"key": "A"}, {"key": "B"}],
            "charts": [{
                "key": "ios_jp", "country": "JP", "store": "app_store",
                "annualMarketProxyUsd": 2e9,
                "observations": [
                    {"at": "2026-08-02T00:00:00", "gameRanks": [[1], []]},
                    {"at": "2026-08-02T01:00:00", "gameRanks": [[2], [3]]},
                    {"at": "2026-08-03T00:00:00", "gameRanks": [[4], [1]]},
                    {"at": "2026-08-03T01:00:00", "gameRanks": [[4], [1]]}
                ]
            }]
        }

    def test_histograms_keep_exposure_separate_from_market_weights(self):
        panel = self.panel()
        histogram = rank_histograms(panel)
        np.testing.assert_allclose(histogram[0, 0], [.25, .25, 0, .5])
        np.testing.assert_allclose(histogram[1, 0], [.5, 0, .25, 0])
        panel["charts"][0]["annualMarketProxyUsd"] *= 100
        np.testing.assert_array_equal(rank_histograms(panel), histogram)

    def test_curve_normalization_is_budget_mass_not_extra_game_weight(self):
        panel = self.panel()
        raw = chart_features(panel, {"ios": 1, "aos": 1, "cn": 1}, "raw")
        normalized = chart_features(panel, {"ios": 1, "aos": 1, "cn": 1}, "top200_conditional")
        z = np.sum(1 / np.arange(1, 5))
        np.testing.assert_allclose(raw, normalized * z)
        np.testing.assert_allclose(raw[:, 0], [.25 * 2 + .25 + .5 * .5, 1 + .25 * 2 / 3])
        with self.assertRaises(ValueError):
            chart_features(panel, {"ios": -1, "aos": 1, "cn": 1}, "raw")

    def test_elapsed_sampling_respects_intervals(self):
        observations = [{"at": f"2026-08-02T{time}:00"} for time in ("00:00", "00:01", "01:00")]
        weights = snapshot_weights(observations, "elapsed_day_linear")
        np.testing.assert_allclose(weights.sum(), 1)
        self.assertAlmostEqual(float(weights @ np.array([1, 4, 4])), 3.975)
        with self.assertRaises(ValueError):
            snapshot_weights(observations[:1], "elapsed_day_linear")

    def test_heldout_labels_do_not_change_fits(self):
        x = np.column_stack((np.linspace(.1, 1, 13), np.linspace(1, .2, 13) ** 2))
        y = x @ np.array([20., 40.])
        train = list(range(12))
        before = fit_positive(x, y, train, "log")
        changed = y.copy()
        changed[12] = np.nan
        after = fit_positive(x, changed, train, "log")
        np.testing.assert_allclose(before["predictions"], after["predictions"])
        np.testing.assert_allclose(before["predictions"], y, rtol=1e-5)

    def test_budget_and_parent_game_exclusion_are_observable(self):
        x = np.column_stack((np.linspace(.1, .3, 13), np.linspace(.3, .1, 13)))
        y = x @ np.array([40., 20.])
        train = list(range(12))
        a = fit_budget(x, y, train, 100, np.ones(2),
                       [{"gameIndex": 12, "features": np.array([.2, 0]), "target": 8}])
        b = fit_budget(x, y, train, 100, np.ones(2),
                       [{"gameIndex": 12, "features": np.array([.2, 0]), "target": 9999}])
        self.assertTrue(a["success"] and b["success"])
        np.testing.assert_allclose(a["predictions"], b["predictions"])
        self.assertLessEqual(a["modeledTop200Million"], 100 + 1e-7)

    def test_identity_only_panel_cannot_be_fit_as_a_new_period(self):
        panel = self.panel()
        panel["observationOnly"] = True
        with self.assertRaisesRegex(ValueError, "identity-only"):
            run(panel, {})

    def test_daily_integration_does_not_extrapolate(self):
        daily = load_script("daily-transfer")
        self.assertIsNone(daily.interval_average(np.array([0., 10.]), np.array([2., 4.]), -1, 9))
        result = daily.interval_average(np.array([0., 10.]), np.array([2., 4.]), 2, 8)
        self.assertAlmostEqual(result["mean"], 3)
        for start, end in [(2, 2), (3, 2), (0, np.inf)]:
            with self.assertRaises(ValueError):
                daily.interval_average(np.array([0., 10.]), np.array([2., 4.]), start, end)
        with self.assertRaises(ValueError):
            daily.interval_average(np.array([0., 0.]), np.array([2., 4.]), 0, 1)

    def test_partial_bounds_remove_only_the_heldout_game_constraints(self):
        partial = load_script("partial-bounds")
        model = partial.LinearModel(2)
        model.add({0: 1, 1: 1}, 10, "ub", "budget")
        model.add({0: 1}, 3, "eq", "game-a", game=0)
        model.add({1: 1}, 4, "eq", "game-b", game=1)
        own = partial.interval(model, np.array([1., 0.]), excluded_game=0)
        self.assertAlmostEqual(own["lower"], 0)
        self.assertAlmostEqual(own["upper"], 6)
        fixed = partial.interval(model, np.array([1., 0.]))
        self.assertAlmostEqual(fixed["lower"], 3)
        self.assertAlmostEqual(fixed["upper"], 3)

    def test_transfer_integrates_duration_and_country_contributions(self):
        from temporal_transfer import integrate_window
        series = [
            {"country": "JP", "times": np.array([0., 172800.]), "values": np.array([2., 4.])},
            {"country": "US", "times": np.array([0., 172800.]), "values": np.array([1., 1.])}
        ]
        result = integrate_window(series, 0, 172800)
        self.assertAlmostEqual(result["predictionMillion"], 8)
        self.assertEqual(result["countryPredictionsMillion"], {"JP": 6., "US": 2.})
        self.assertIsNone(integrate_window(series, 0, 172801))

    def test_minimax_relative_loss_attains_the_known_feasible_optimum(self):
        convex = load_script("convex-objectives")
        matrix = np.array([[1., 0.], [1., 1.], [0., 1.]])
        targets = np.array([2., 4., 3.])
        result = convex.fit_convex(matrix, targets, [0, 1, 2], "minimax_relative")
        self.assertAlmostEqual(result["diagnostics"]["minimumWorstTrainingRelativeError"], 1 / 9)
        self.assertAlmostEqual(float(np.max(np.abs(np.array(result["predictions"]) / targets - 1))), 1 / 9)

    def test_ordinal_ties_preserve_all_equally_supported_curves(self):
        ordinal = load_script("ordinal-profile")
        panel = self.panel()
        panel["games"][0]["key"] = "Fate/Grand Order"
        for i, game in enumerate(panel["games"]):
            game["regionalRankReferences"] = [{"geography": "JP", "rank": i + 1}]
        panel["additionalRankReferences"] = [{"geography": "JP"}]
        for row in panel["charts"][0]["observations"]:
            row["gameRanks"] = [[1], [1]]
        import copy
        google = copy.deepcopy(panel["charts"][0])
        google.update(key="gp_jp", store="google_play")
        panel["charts"].append(google)
        result = ordinal.profile(panel, exponent_step=1, mixture_step=.5,
                                 exponent_bounds=(0, 1), progress=False)
        self.assertEqual(result["minimumPairViolations"], .5)
        self.assertEqual(result["coOptimalSet"]["size"], 12)
        self.assertTrue(all(row["heldoutViolationRange"] == [.5, .5] for row in result["folds"]))


if __name__ == "__main__":
    unittest.main()
