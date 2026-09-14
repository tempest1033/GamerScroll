"""Budget-conserving diagnostics with explicit evidence-based accounting bounds."""
from __future__ import annotations

import argparse
import json
import numpy as np
from scipy.optimize import minimize

from simulate import ROOT, read_json, chart_features, group_features


MARKET_EVIDENCE = read_json("docs/research/same-month-market-evidence-2026-09-10.json")
WORLD_BUDGET = {
    **MARKET_EVIDENCE["sources"]["appmagic_august"],
    "amountMillion": next(row["amount"] for row in MARKET_EVIDENCE["monthlyMarkets"]
                          if row["source"] == "appmagic_august" and row["geography"] == "WW"),
    "period": MARKET_EVIDENCE["period"],
    "interpretation": "Rounded aggregate conditional ceiling, not a measured top-200 budget."
}


def fit_budget(shares, y, train, world_budget, group_prior, regional=None, market_constraints=None):
    train = np.asarray(train)
    a = shares[train] * world_budget
    targets = y[train]
    regional = regional or []
    # Every feature is a nonnegative fraction; x allocates the known world budget.
    def value(x):
        p = a @ x
        if np.any(p <= 0):
            return np.inf
        return float(np.mean(np.log(p / targets) ** 2))

    def gradient(x):
        p = a @ x
        return 2 * (a.T @ (np.log(p / targets) / p)) / len(targets)

    constraints = [{"type": "ineq", "fun": lambda x: 1 - x.sum(),
                    "jac": lambda x: -np.ones_like(x)}]
    for row in market_constraints or []:
        vector = row["allocation"]
        cap = row["amountMillion"] / world_budget
        constraints.append({"type": "ineq",
                            "fun": lambda x, vector=vector, cap=cap: cap - vector @ x,
                            "jac": lambda x, vector=vector: -vector})
    for row in regional:
        # These side labels are present only if their parent game is in training.
        if row["gameIndex"] not in train:
            continue
        vector = row["features"] * world_budget
        target = row["target"]
        constraints.append({"type": "eq",
                            "fun": lambda x, vector=vector, target=target: (vector @ x - target) / world_budget,
                            "jac": lambda x, vector=vector: vector / world_budget})
    starts = [group_prior / group_prior.sum() * 0.5,
              np.full(shares.shape[1], 0.5 / shares.shape[1])]
    solutions = [minimize(value, start, jac=gradient, method="SLSQP",
                          bounds=[(np.finfo(float).eps, 1.0)] * shares.shape[1],
                          constraints=constraints,
                          options={"ftol": 1e-12, "maxiter": 2000})
                 for start in starts]
    viable = [solution for solution in solutions if solution.success
              and solution.x.sum() <= 1 + 1e-8
              and all(abs(constraint["fun"](solution.x)) <= 1e-8
                      if constraint["type"] == "eq" else constraint["fun"](solution.x) >= -1e-8
                      for constraint in constraints)]
    if not viable:
        return {"success": False, "failures": [{"message": item.message, "status": int(item.status)}
                                             for item in solutions]}
    selected = min(viable, key=lambda solution: solution.fun)
    budgets = selected.x * world_budget
    return {"success": True, "predictions": (shares @ budgets).tolist(),
            "groupBudgetsMillion": budgets.tolist(),
            "modeledTop200Million": float(budgets.sum()),
            "unallocatedWorldBudgetMillion": float(world_budget - budgets.sum()),
            "trainingIndices": train.tolist(), "trainingMeanSquaredLogError": float(selected.fun),
            "solver": {"name": "scipy.optimize.minimize:SLSQP", "status": int(selected.status),
                       "message": selected.message, "iterations": int(selected.nit),
                       "startOutcomes": [{"success": bool(item.success), "loss": float(item.fun),
                                          "message": item.message} for item in solutions]}}


def run(budget, country_bounds=False):
    panel = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    registry = read_json("scripts/revenue-research/grouping-candidates.json")
    y = np.array([game["reference"]["amount"] for game in panel["games"]])
    all_indices = list(range(len(y)))
    results = []
    for curve in ("round13", "reciprocal"):
        chart_matrix = chart_features(panel, registry["curves"][curve]["exponents"], "top200_conditional")
        for grouping in ("cn_jp_rest_stores", "country_store_groups"):
            matrix, groups, membership = group_features(chart_matrix, panel["charts"], grouping)
            market_priors = np.array([chart["annualMarketProxyUsd"] / 1e9 for chart in panel["charts"]])
            group_prior = np.array([market_priors[membership == i].sum() for i in range(len(groups))])
            shares = matrix / group_prior
            market_constraints = []
            if country_bounds:
                for row in MARKET_EVIDENCE["monthlyMarkets"]:
                    if row["source"] != "sensor_tower_august" or row["geography"] == "WW":
                        continue
                    allocation = np.zeros(len(groups))
                    for k, chart in enumerate(panel["charts"]):
                        if chart["country"] == row["geography"]:
                            allocation[membership[k]] += market_priors[k] / group_prior[membership[k]]
                    market_constraints.append({"geography": row["geography"],
                                               "amountMillion": row["amount"], "allocation": allocation})
            fgo_index = next(i for i, game in enumerate(panel["games"]) if game["key"] == "Fate/Grand Order")
            jp_features = np.zeros(len(groups))
            for k, chart in enumerate(panel["charts"]):
                if chart["country"] == "JP":
                    jp_features[membership[k]] += chart_matrix[fgo_index, k] / group_prior[membership[k]]
            jp_anchor = next(anchor for anchor in panel["regionalAnchors"]
                             if anchor["game_key"] == "Fate/Grand Order" and anchor["geography"] == "JP")
            for region_mode in ("none", "japan_component"):
                regional = [] if region_mode == "none" else [
                    {"gameIndex": fgo_index, "features": jp_features, "target": jp_anchor["amount_usd_m"]}]
                fitted = fit_budget(shares, y, all_indices, budget, group_prior, regional, market_constraints)
                folds = []
                for heldout in all_indices:
                    train = [i for i in all_indices if i != heldout]
                    fit = fit_budget(shares, y, train, budget, group_prior, regional, market_constraints)
                    folds.append({"heldoutIndex": heldout, **fit})
                candidate_id = f"{curve}:{grouping}:{region_mode}"
                results.append({"id": candidate_id, "curve": curve, "grouping": grouping,
                                "regionalConstraint": region_mode, "groupNames": groups,
                                "fitted": fitted, "folds": folds,
                                "fgoJapanPrediction": float(jp_features @ np.array(fitted["groupBudgetsMillion"]))
                                if fitted["success"] else None,
                                "regionalLabelPolicy": "JP side label excluded whenever FGO is held out",
                                "countryAccounting": [{
                                    "geography": row["geography"], "capMillion": row["amountMillion"],
                                    "modeledTop200Million": float(row["allocation"] @ np.array(fitted["groupBudgetsMillion"]))
                                    if fitted["success"] else None} for row in market_constraints],
                                "groupPriorAnnualBillion": group_prior.tolist()})
                print(json.dumps({"candidate": candidate_id, "fullFitSuccess": fitted["success"],
                                  "successfulFolds": sum(row["success"] for row in folds)}), flush=True)
    return {"schemaVersion": 1, "productionEnabled": False, "status": "conditional_budget_constraint_diagnostic",
            "worldBudgetEvidence": {**WORLD_BUDGET, "scenarioBudgetMillion": budget},
            "scenarioBudgetSource": next((row["source"] for row in MARKET_EVIDENCE["monthlyMarkets"]
                                          if row["geography"] == "WW" and row["amount"] == budget),
                                         "explicit_sensitivity_override"),
            "countryBoundsSource": "sensor_tower_august" if country_bounds else None,
            "crossProviderScenario": country_bounds,
            "names": [game["key"] for game in panel["games"]], "targetsMillion": y.tolist(),
            "results": results,
            "limitations": [
                "The world total is assumed known; this is not a forward revenue forecast.",
                "Unallocated budget covers unobserved charts, countries, and lower ranks collectively.",
                "No missing rank is imputed from the budget.",
                "Fixed historical curve selection remains exposed to this sample.",
                "Exact regional equality is a diagnostic assumption applied to a rounded vendor estimate, not an asserted error-free measurement.",
                "Budget conservation is necessary for monetary interpretation but not sufficient for accuracy."
            ]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--budget", type=float, default=WORLD_BUDGET["amountMillion"])
    parser.add_argument("--country-bounds", action="store_true")
    parser.add_argument("--output", default="reports/rank-models/budget-constrained-simulation-2026-09-10.json")
    args = parser.parse_args()
    result = run(args.budget, args.country_bounds)
    (ROOT / args.output).write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": args.output}))
