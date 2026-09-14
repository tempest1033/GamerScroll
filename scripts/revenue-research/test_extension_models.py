"""Delta behavior contracts for the extended research, not old model-search reruns."""
import ast
import copy
import itertools
import unittest
import numpy as np
from simulate import ROOT
from weekly_partial_bounds import load_lp
from extension_fixed_shape_accounting import minimum_reference_widening
from extension_regional_residuals import build_regional_residual_model
from extension_global_day import build_charts, curve_levels, identity_lookup, map_reference
from extension_unmapped_order import additional_inversion_bounds


def accounting_fixture():
    panel = {
        "rankLimit": 1, "games": [{"key": "Game", "reference": {"amount": 10, "anchorId": "global"}}],
        "charts": [{"key": "us", "country": "US", "store": "app_store"},
                   {"key": "cn", "country": "CN", "store": "app_store"}],
        "regionalAnchors": [{"id": "regional", "game_key": "Game", "geography": "CN",
                             "stores": ["app_store"], "amount_usd_m": 6}]}
    markets = {"monthlyMarkets": [
        {"source": source, "geography": country, "amount": amount}
        for source in ("appmagic_august", "sensor_tower_august")
        for country, amount in (("WW", 10), ("US", 4), ("CN", 6))]}
    return panel, markets


class ExtensionAccountingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lp = load_lp()

    def test_extracted_builder_preserves_legacy_observable_ranges(self):
        path = ROOT / "reports/rank-models/source-versions/cdb7ad70ea220f778e104ccabd8077372db152ccce357c42bfb4d8e84a1ae3ce.txt"
        parsed = ast.parse(path.read_text(encoding="utf-8"))
        function = next(node for node in parsed.body if isinstance(node, ast.FunctionDef)
                        and node.name == "global_model")
        namespace = vars(self.lp).copy()
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(path), "exec"), namespace)
        panel, markets = accounting_fixture()
        histogram = np.ones((1, 2, 1))
        for caps in (False, True):
            with self.subTest(caps=caps):
                before = namespace["global_model"](panel, markets, histogram, caps)
                after = self.lp.global_model(panel, markets, histogram, caps)
                self.assertEqual(before, after)

    def test_nested_regional_revenue_consumes_world_budget_once(self):
        panel, markets = accounting_fixture()
        model, rank_start, _, _, _, _ = build_regional_residual_model(
            self.lp, panel, markets, np.array([[[1.], [0.]]]), True,
            {"ios": 1, "aos": 1, "cn": 1})
        objective = np.zeros(model.variables)
        objective[rank_start] = 1
        solved = model.solve(objective)
        self.assertTrue(solved.success)
        self.assertAlmostEqual(solved.fun, 6)
        self.assertAlmostEqual(solved.x[:rank_start].sum() + solved.x[rank_start], 10)

    def test_nested_revenue_also_consumes_its_country_cap(self):
        panel, markets = accounting_fixture()
        for market in markets["monthlyMarkets"]:
            if market["source"] == "sensor_tower_august" and market["geography"] == "CN":
                market["amount"] = 5
        model, *_ = build_regional_residual_model(
            self.lp, panel, markets, np.array([[[1.], [0.]]]), True,
            {"ios": 1, "aos": 1, "cn": 1})
        self.assertEqual(model.solve(np.zeros(model.variables)).status, 2)

    def test_overlapping_region_scopes_are_not_independent_residuals(self):
        panel, markets = accounting_fixture()
        panel["regionalAnchors"].append({**panel["regionalAnchors"][0], "id": "duplicate"})
        with self.assertRaisesRegex(ValueError, "Overlapping"):
            build_regional_residual_model(self.lp, panel, markets, np.ones((1, 2, 1)),
                                          True, {"ios": 1, "aos": 1, "cn": 1})

    def test_relative_reference_relaxation_does_not_relax_market_budget(self):
        model = self.lp.LinearModel(1)
        model.add({0: 1}, 10, "eq", "game amount", game=0)
        model.add({0: 1}, 8, "ub", "market cap")
        _, solved = minimum_reference_widening(self.lp, model)
        self.assertTrue(solved.success)
        self.assertAlmostEqual(solved.x[0], 8)
        self.assertAlmostEqual(solved.x[-1], .2)


class ExtensionGlobalArchiveTests(unittest.TestCase):
    def setUp(self):
        self.games = [{"key": "Game", "storeIds": {"ios": ["target"], "aos": []}}]
        self.market = {"countries": [{"country": "US", "storeWeights": {"ios": 1, "android": 0}}]}
        self.days = [{"date": "2026-09-08", "ids": ["other", "target"], "lists": {
            "ios_us_grossing": {"times": ["00:00", "06:00", "12:00"],
                                "ranks": [[0, 1], [], [0]]}}}]

    def test_unmapped_apps_do_not_compress_rank_positions(self):
        chart = build_charts(self.days, self.market, self.games)[0]
        self.assertEqual(chart["observations"][0]["gameRanks"], [[2]])
        self.assertEqual(chart["observations"][1]["gameRanks"], [[]])
        self.assertEqual(len(chart["observations"]), 2)

    def test_missing_chart_is_not_a_zero_contribution_observation(self):
        self.days[0]["lists"] = {}
        with self.assertRaisesRegex(ValueError, "Insufficient"):
            build_charts(self.days, self.market, self.games)

    def test_invalid_dictionary_index_and_repeated_apps_fail(self):
        for ranks in ([0, 100], [0, 0]):
            with self.subTest(ranks=ranks):
                days = copy.deepcopy(self.days)
                days[0]["lists"]["ios_us_grossing"]["ranks"][0] = ranks
                with self.assertRaises(ValueError):
                    build_charts(days, self.market, self.games)

    def test_normalized_chart_retains_its_full_scope_weight(self):
        chart = {"country": "US", "store": "ios", "weight": .3,
                 "observations": [{"gameRanks": [[rank] for rank in range(1, 201)]}]}
        values = curve_levels(chart, {"exponents": {"ios": 1.25}}, 200)
        self.assertAlmostEqual(values.sum(), 30)
        self.assertAlmostEqual(values[0, 0] / values[0, 1], 2 ** 1.25)

    def test_href_store_identity_and_unmapped_rows_stay_distinct(self):
        games = [{"key": "iOS", "storeIds": {"ios": ["123"], "aos": []}},
                 {"key": "Google", "storeIds": {"ios": [], "aos": ["123"]}}]
        rows = [{"rank": 1, "href": "https://appmagic.rocks/google-play/title/123"},
                {"rank": 2, "href": "https://appmagic.rocks/iphone/unknown/456"}]
        mapped, missing = map_reference(rows, identity_lookup(games))
        self.assertEqual(mapped[0]["gameIndex"], 1)
        self.assertEqual(missing[0]["rank"], 2)
        self.assertIsNone(missing[0]["gameIndex"])


class UnmappedOrderTests(unittest.TestCase):
    def test_completion_extrema_match_small_exhaustive_orderings(self):
        # Known model order is reference rank 4 followed by 1; ranks 2 and 3 are missing.
        additional = []
        for order in itertools.permutations([1, 2, 3, 4]):
            if order.index(4) > order.index(1):
                continue
            inversions = sum(order[i] > order[j] for i in range(4) for j in range(i + 1, 4))
            additional.append(inversions - 1)
        self.assertEqual(additional_inversion_bounds([2., 1.], [4, 1], [2, 3]),
                         {"minimum": min(additional), "maximum": max(additional)})

    def test_missing_game_cannot_be_inserted_inside_an_observed_tie(self):
        self.assertEqual(additional_inversion_bounds([1., 1.], [3, 1], [2]),
                         {"minimum": 1, "maximum": 1})


if __name__ == "__main__":
    unittest.main()
