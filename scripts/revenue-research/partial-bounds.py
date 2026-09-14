"""Conditional identification bounds, not point estimates or confidence intervals.

The only rank-shape restriction is non-increasing, nonnegative rank revenue.
Missing-market revenue remains an explicit latent nonnegative variable instead
of being absorbed into a fitted country multiplier.
"""
import json
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import csr_matrix

from simulate import ROOT, read_json, rank_histograms


class LinearModel:
    def __init__(self, variables):
        self.variables = variables
        self.constraints = []
        self.cache = {}
        self.solver_recoveries = []

    def add(self, coefficients, amount, relation, name, game=None):
        self.constraints.append({"coefficients": coefficients, "amount": float(amount),
                                 "relation": relation, "name": name, "game": game})
        self.cache.clear()

    def matrices(self, excluded_game):
        if excluded_game in self.cache:
            return self.cache[excluded_game]
        output = {}
        for relation in ("eq", "ub"):
            rows = [row for row in self.constraints if row["relation"] == relation
                    and (excluded_game is None or row["game"] != excluded_game)]
            ri, ci, values = [], [], []
            for r, row in enumerate(rows):
                for c, value in row["coefficients"].items():
                    if value:
                        ri.append(r); ci.append(c); values.append(value)
            output[relation] = (csr_matrix((values, (ri, ci)), shape=(len(rows), self.variables)),
                                np.array([row["amount"] for row in rows]))
        self.cache[excluded_game] = output
        return output

    def solve(self, objective, excluded_game=None):
        matrices = self.matrices(excluded_game)
        result = linprog(objective, A_ub=matrices["ub"][0], b_ub=matrices["ub"][1],
                         A_eq=matrices["eq"][0] if len(matrices["eq"][1]) else None,
                         b_eq=matrices["eq"][1] if len(matrices["eq"][1]) else None,
                         bounds=(0, None), method="highs", options={"time_limit": 60})
        if result.status == 4:
            initial = {"method": "highs", "status": int(result.status), "message": result.message}
            # One bounded numerical recovery using a different HiGHS algorithm.
            result = linprog(objective, A_ub=matrices["ub"][0], b_ub=matrices["ub"][1],
                             A_eq=matrices["eq"][0] if len(matrices["eq"][1]) else None,
                             b_eq=matrices["eq"][1] if len(matrices["eq"][1]) else None,
                             bounds=(0, None), method="highs-ipm",
                             options={"presolve": False, "time_limit": 60})
            self.solver_recoveries.append({
                "initial": initial, "retry": {"method": "highs-ipm", "presolve": False,
                                             "status": int(result.status), "message": result.message}})
        if result.status not in (0, 2, 3):
            raise RuntimeError(f"LP solver failed: {result.status}: {result.message}")
        return result


def sparse(vector):
    return {int(i): float(vector[i]) for i in np.flatnonzero(vector)}


def monotonicity(model, charts, ranks):
    for k in range(charts):
        for rank in range(ranks - 1):
            model.add({k * ranks + rank + 1: 1, k * ranks + rank: -1},
                      0, "ub", f"chart:{k}:rank:{rank + 1}:monotonicity")


def interval(model, vector, excluded_game=None):
    low = model.solve(vector, excluded_game)
    high = model.solve(-vector, excluded_game)
    if low.status == 2 or high.status == 2:
        return {"status": "infeasible", "lower": None, "upper": None}
    return {"status": "bounded" if low.status == high.status == 0 else "unbounded",
            "lower": float(low.fun) if low.status == 0 else None,
            "upper": float(-high.fun) if high.status == 0 else None}


def china_model(panel, markets, histogram):
    k = next(i for i, chart in enumerate(panel["charts"]) if chart["country"] == "CN")
    exposure = histogram[:, k]
    names = [game["key"] for game in panel["games"]]
    targets = {game["key"]: game["reference"]["amount"] for game in panel["games"]}
    reports = []
    for source in ("appmagic_august", "sensor_tower_august"):
        market = next(row for row in markets["monthlyMarkets"]
                      if row["source"] == source and row["geography"] == ("CN" if source == "sensor_tower_august" else "WW"))
        model = LinearModel(panel["rankLimit"])
        monotonicity(model, 1, panel["rankLimit"])
        model.add(dict.fromkeys(range(panel["rankLimit"]), 1), market["amount"], "ub", "available_market_ceiling")
        for anchor in panel["regionalAnchors"]:
            if anchor["geography"] == "CN":
                i = names.index(anchor["game_key"])
                model.add(sparse(exposure[i]), anchor["amount_usd_m"], "eq", anchor["id"], game=i)
        hok = names.index("Honor of Kings")
        model.add(sparse(exposure[hok]), targets["Honor of Kings"], "ub", "China_cannot_exceed_same_game_global", game=hok)
        fgo = names.index("Fate/Grand Order")
        jp = next(anchor["amount_usd_m"] for anchor in panel["regionalAnchors"]
                  if anchor["geography"] == "JP" and anchor["game_key"] == "Fate/Grand Order")
        model.add(sparse(exposure[fgo]), targets["Fate/Grand Order"] - jp, "ub",
                  "China_cannot_exceed_same_game_global_minus_Japan", game=fgo)
        feasibility = model.solve(np.zeros(model.variables))
        minimum_budget = model.solve(np.ones(model.variables))
        reports.append({
            "marketCeilingSource": source, "ceilingMillion": market["amount"],
            "crossProviderScenario": source == "sensor_tower_august",
            "feasible": bool(feasibility.success), "solverMessage": feasibility.message,
            "minimumTop200BudgetMillion": float(minimum_budget.fun) if minimum_budget.success else None,
            "leaveOwnLabelsOut": [
                {"game": name, "chinaAmountRangeMillion": interval(model, exposure[i], excluded_game=i),
                 "globalReferenceNotUsedForOwnBounds": targets[name]}
                for i, name in enumerate(names) if np.any(exposure[i])]
        })
    return reports


def build_global_model(panel, markets, histogram, with_country_caps):
    """Build shared accounting constraints without solving or choosing a rank curve."""
    names = [game["key"] for game in panel["games"]]
    n, chart_count, ranks = histogram.shape
    rank_variables = chart_count * ranks
    variables = rank_variables + n
    model = LinearModel(variables)
    monotonicity(model, chart_count, ranks)
    source = "sensor_tower_august" if with_country_caps else "appmagic_august"
    world = next(row["amount"] for row in markets["monthlyMarkets"]
                 if row["source"] == source and row["geography"] == "WW")
    model.add(dict.fromkeys(range(variables), 1), world, "ub", "world_budget_including_latent_revenues")
    if with_country_caps:
        for market in markets["monthlyMarkets"]:
            if market["source"] != source or market["geography"] == "WW":
                continue
            indices = [k * ranks + rank for k, chart in enumerate(panel["charts"])
                       if chart["country"] == market["geography"] for rank in range(ranks)]
            model.add(dict.fromkeys(indices, 1), market["amount"], "ub", f"market:{market['geography']}")
    vectors = []
    for i, game in enumerate(panel["games"]):
        vector = np.zeros(variables)
        vector[:rank_variables] = histogram[i].reshape(-1)
        vector[rank_variables + i] = 1
        vectors.append(vector)
        model.add(sparse(vector), game["reference"]["amount"], "eq",
                  f"global:{game['reference']['anchorId']}", game=i)
    for anchor in panel["regionalAnchors"]:
        i = names.index(anchor["game_key"])
        vector = np.zeros(variables)
        for k, chart in enumerate(panel["charts"]):
            if chart["country"] == anchor["geography"] and chart["store"] in anchor["stores"]:
                vector[k * ranks:(k + 1) * ranks] = histogram[i, k]
        model.add(sparse(vector), anchor["amount_usd_m"], "eq", anchor["id"], game=i)
    return model, vectors, world, source, rank_variables


def global_model(panel, markets, histogram, with_country_caps):
    model, vectors, world, source, rank_variables = build_global_model(
        panel, markets, histogram, with_country_caps)
    names = [game["key"] for game in panel["games"]]
    n, variables = len(names), model.variables
    feasibility = model.solve(np.zeros(variables))
    outside = np.zeros(variables)
    outside[rank_variables:] = 1
    return {"worldBudgetMillion": world, "worldBudgetSource": source,
            "crossProviderScenario": with_country_caps,
            "variables": variables, "rankVariables": rank_variables, "latentUnobservedGameVariables": n,
            "feasible": bool(feasibility.success), "solverMessage": feasibility.message,
            "unobservedKnownGameRevenueRangeMillion": interval(model, outside),
            "leaveOwnLabelsOut": [{"game": name, "rangeMillion": interval(model, vectors[i], excluded_game=i),
                                  "referenceNotUsedForOwnBounds": panel["games"][i]["reference"]["amount"]}
                                 for i, name in enumerate(names)]}


def main():
    panel = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    markets = read_json("docs/research/same-month-market-evidence-2026-09-10.json")
    histogram = rank_histograms(panel)
    result = {"schemaVersion": 1, "productionEnabled": False, "status": "conditional_identification_bounds",
              "china": china_model(panel, markets, histogram),
              "global": [global_model(panel, markets, histogram, caps) for caps in (False, True)],
              "assumptions": [
                  "Nonnegative, non-increasing, game-independent monthly rank-response curves.",
                  "The same rank-response curve applies across the observed month within each chart.",
                  "Equal-observed-day/equal-snapshot exposure approximates the month; August 1 remains missing.",
                  "TOP200 chart budgets plus explicit latent game revenues cannot exceed the stated world total.",
                  "Point vendor amounts are treated as conditional constraints; vendor estimation error is not a confidence interval.",
                  "Only the cross-provider scenario imports Sensor Tower country totals into AppMagic game equations.",
                  "The upper/lower limits are conditional feasible-set bounds, not statistical confidence intervals.",
                  "Latent revenues are unknown variables for accounting, never fitted per-game corrections for deployment.",
                  "Own global and regional game labels are all excluded for that game's reported held-out bounds."
              ]}
    output = ROOT / "reports/rank-models/partial-identification-bounds-2026-09-10.json"
    output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
