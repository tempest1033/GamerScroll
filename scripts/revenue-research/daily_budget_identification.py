"""Necessary daily-budget concentration under measured subperiod store totals.

Latent allocations are feasibility witnesses only, never imputed market data.
"""
import json
from datetime import datetime, timedelta
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import weekly_histograms, curve_scores
from weekly_partial_bounds import load_lp


def minimum_daily_concentration(shares, budgets, lower_bound):
    shares = np.asarray(shares, dtype=float)
    budgets = np.asarray(budgets, dtype=float)
    if shares.ndim != 2 or shares.shape[0] != len(budgets) or shares.shape[1] == 0:
        raise ValueError("One daily share vector per store budget is required")
    if not np.all(np.isfinite(shares)) or np.any(shares < 0) or np.any(shares > 1):
        raise ValueError("Daily game shares must be finite and within the store budget")
    if not np.all(np.isfinite(budgets)) or np.any(budgets <= 0) or not np.isfinite(lower_bound) or lower_bound < 0:
        raise ValueError("Positive store budgets and a nonnegative lower bound are required")
    stores, days = shares.shape
    lp = load_lp()
    model = lp.LinearModel(stores * days + 1)
    peak = model.variables - 1
    for store, budget in enumerate(budgets):
        columns = [store * days + day for day in range(days)]
        model.add(dict.fromkeys(columns, 1), budget, "eq", f"store_total:{store}")
        for column in columns:
            model.add({column: 1, peak: -budget / days}, 0, "ub", f"daily_peak:{column}")
    model.add(lp.sparse(-shares.reshape(-1)), -lower_bound, "ub", "published_game_lower_bound_closure")
    objective = np.zeros(model.variables)
    objective[peak] = 1
    solution = model.solve(objective)
    return {
        "feasible": bool(solution.success), "solverMessage": solution.message,
        "minimumMaxDailyBudgetToUniformMean": float(solution.x[peak]) if solution.success else None,
        "latentStoreDailyBudgetsMillion": solution.x[:-1].reshape(stores, days).tolist()
        if solution.success else None,
        "solverRecoveries": model.solver_recoveries,
    }


def main():
    paths = [
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/pareto-holiday-budget-gate-2026-09-11.json",
    ]
    panel, gate = map(read_json, paths)
    game_index = next(i for i, game in enumerate(panel["games"]) if game["key"] == "Fate/Grand Order")
    reduced = {**panel, "games": [panel["games"][game_index]], "charts": [
        {**chart, "observations": [{**row, "gameRanks": [row["gameRanks"][game_index]]}
                                  for row in chart["observations"]]}
        for chart in panel["charts"] if chart["country"] == "JP"]}
    start = datetime.fromisoformat(gate["period"]["start"])
    end = datetime.fromisoformat(gate["period"]["end"])
    dates = [(start + timedelta(days=day)).date().isoformat() for day in range((end - start).days + 1)]
    windows = [{"period": {"start": date, "end": date}} for date in dates]
    eligible, excluded = [], []
    for candidate in gate["rows"]:
        peak = next(row for row in candidate["capacityScenarios"]
                    if row["scenario"] == "single_listed_product_per_store")
        if peak["independentStoreCapacityBelowReference"]:
            excluded.append({"candidateIndex": candidate["candidateIndex"],
                             "reason": "Already proven below the reference even at rank 1 throughout.",
                             "peakUpperMillion": peak["independentStorePeakUpperMillion"]})
        else:
            eligible.append(candidate)
    rows = []
    for method in ("linear", "previous", "next"):
        for step in range(105):
            offset = -12 + step * .25
            _, exposures = weekly_histograms(reduced, windows, offset, reconstruction=method)
            if any(row["histogram"] is None for row in exposures):
                raise ValueError("Daily windows lack boundary observations")
            for candidate in eligible:
                ios, google, _ = candidate["parameters"]
                shares = np.array([
                    [curve_scores(row["histogram"], ios, google, 1)[0] for row in exposures],
                    [curve_scores(row["histogram"], ios, google, 0)[0] for row in exposures]])
                result = minimum_daily_concentration(shares, gate["storeBudgetsMillion"],
                                                     gate["referenceLowerMillion"])
                rows.append({"method": method, "utcOffsetHours": offset,
                             "candidateIndex": candidate["candidateIndex"], **result})
            if (step + 1) % 35 == 0:
                print(json.dumps({"method": method, "clocksDone": step + 1}), flush=True)
    summaries = []
    for candidate in eligible:
        own = [row for row in rows if row["candidateIndex"] == candidate["candidateIndex"]]
        valid = [row["minimumMaxDailyBudgetToUniformMean"] for row in own if row["feasible"]]
        summaries.append({
            "candidateIndex": candidate["candidateIndex"], "scenarios": len(own),
            "feasibleScenarios": len(valid), "requiredConcentrationRange": [min(valid), max(valid)] if valid else None})
    output = {
        "schemaVersion": 1, "productionEnabled": False, "noCoefficientRefit": True,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": gate["period"], "dates": dates, "storeBudgetsMillion": gate["storeBudgetsMillion"],
        "referenceLowerMillion": gate["referenceLowerMillion"], "excludedByExistingPeakProof": excluded,
        "summaries": summaries, "rows": rows,
        "limitations": [
            "The more-than reference is relaxed to its closed lower bound, making feasibility conservative.",
            "Every store's full measured holiday spending is provisionally available to its modeled TOP200.",
            "The fitted monthly cross-store mixture is not retained; the measured subperiod budgets replace it.",
            "Daily allocations are latent mathematical witnesses, not observations or adopted correction factors.",
            "A feasible nonuniform allocation does not prove actual daily spending followed it.",
            "All 105 clocks and three reconstruction conventions are reported; none is chosen to make a model pass.",
            "The one-listed-local-product and stationary-curve assumptions, plus cross-provider source uncertainty, remain."
        ],
    }
    (ROOT / "reports/rank-models/daily-budget-identification-2026-09-11.json").write_text(
        json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summaries), flush=True)


if __name__ == "__main__":
    main()
