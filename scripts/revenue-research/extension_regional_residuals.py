"""Account for unobserved contributions inside a measured region without double counting."""
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint
from weekly_partial_bounds import load_lp
from extension_fixed_shape_accounting import add_fixed_shapes


def build_regional_residual_model(lp, panel, markets, histogram, caps, exponents):
    anchors = panel["regionalAnchors"]
    for i, first in enumerate(anchors):
        for second in anchors[i + 1:]:
            if first["game_key"] == second["game_key"] and first["geography"] == second["geography"] \
                    and set(first["stores"]) & set(second["stores"]):
                raise ValueError("Overlapping regional anchor scopes cannot be summed as separate residuals")
    base, vectors, world, source, rank_variables = lp.build_global_model(
        {**panel, "regionalAnchors": []}, markets, histogram, caps)
    add_fixed_shapes(base, panel, exponents)
    model = lp.LinearModel(base.variables + len(anchors))
    for row in base.constraints:
        coefficients = row["coefficients"].copy()
        if row["name"].startswith("market:"):
            country = row["name"].split(":", 1)[1]
            for a, anchor in enumerate(anchors):
                if anchor["geography"] == country:
                    coefficients[base.variables + a] = 1
        model.add(coefficients, row["amount"], row["relation"], row["name"], game=row["game"])
    names = [game["key"] for game in panel["games"]]
    game_anchor_variables = {i: [] for i in range(len(names))}
    for a, anchor in enumerate(anchors):
        i = names.index(anchor["game_key"])
        residual = base.variables + a
        coefficients = {residual: 1}
        for k, chart in enumerate(panel["charts"]):
            if chart["country"] == anchor["geography"] and chart["store"] in anchor["stores"]:
                for rank, value in enumerate(histogram[i, k]):
                    if value:
                        coefficients[k * panel["rankLimit"] + rank] = float(value)
        model.add(coefficients, anchor["amount_usd_m"], "eq", "regional_with_residual:" + anchor["id"], game=i)
        game_anchor_variables[i].append(residual)
    for i, indices in game_anchor_variables.items():
        if indices:
            # These regional pieces are contained in the global unobserved amount.
            model.add({**dict.fromkeys(indices, 1), rank_variables + i: -1},
                      0, "ub", f"regional_residual_subset_of_global:{i}", game=i)
    return model, rank_variables, base.variables, world, source, game_anchor_variables


def main():
    paths = [
        "reports/rank-models/normalized-august-regional-panel-2026-09-10.json",
        "docs/research/same-month-market-evidence-2026-09-10.json",
        "reports/rank-models/extension-fixed-shape-accounting-2026-09-11.json",
        "docs/research/revenue-extension-2026-09-11/apple-current-device-segments.json",
        "scripts/revenue-research/partial-bounds.py",
    ]
    full, markets, previous = map(read_json, paths[:3])
    indices = [i for i, game in enumerate(full["games"]) if game["reference"] is not None]
    panel = {**full, "games": [full["games"][i] for i in indices], "charts": [
        {**chart, "observations": [{**row, "gameRanks": [row["gameRanks"][i] for i in indices]}
                                  for row in chart["observations"]]} for chart in full["charts"]]}
    histogram = rank_histograms(panel)
    shapes = {row["shapeIndex"]: row["exponents"] for row in previous["rows"]}
    lp = load_lp()
    rows = []
    for shape, exponents in shapes.items():
        for caps in (False, True):
            model, rank_variables, regional_start, world, source, groups = build_regional_residual_model(
                lp, panel, markets, histogram, caps, exponents)
            outside = np.zeros(model.variables)
            outside[rank_variables:regional_start] = 1
            minimum = model.solve(outside)
            if not minimum.success:
                raise RuntimeError(f"Regional-residual accounting unexpectedly failed: {minimum.message}")
            regional_ranges = []
            for a, anchor in enumerate(panel["regionalAnchors"]):
                objective = np.zeros(model.variables)
                objective[regional_start + a] = 1
                low, high = model.solve(objective), model.solve(-objective)
                if not low.success or not high.success:
                    raise RuntimeError("Regional residual range failed")
                regional_ranges.append({
                    "anchorId": anchor["id"], "game": anchor["game_key"], "country": anchor["geography"],
                    "referenceMillion": anchor["amount_usd_m"],
                    "unobservedInsideRegionRangeMillion": [float(low.fun), float(-high.fun)],
                    "minimumUnobservedFraction": float(low.fun / anchor["amount_usd_m"]),
                })
            witness = minimum.x
            chart_budgets = witness[:rank_variables].reshape(len(panel["charts"]), panel["rankLimit"]).sum(axis=1)
            residuals = witness[rank_variables:regional_start]
            regional = witness[regional_start:]
            rows.append({
                "shapeIndex": shape, "exponents": exponents, "countryCaps": caps,
                "worldBudgetMillion": world, "worldBudgetSource": source,
                "minimumGlobalUnobservedKnownGameRevenueMillion": float(minimum.fun),
                "regionalRanges": regional_ranges,
                "minimumGlobalUnobservedWitness": {
                    "top200ChartBudgetSumMillion": float(chart_budgets.sum()),
                    "globalUnobservedGameSumMillion": float(residuals.sum()),
                    "accountedWorldMillionExcludingNestedRegionalDoubleCount": float(chart_budgets.sum() + residuals.sum()),
                    "nestedRegionalUnobservedSumMillion": float(regional.sum()),
                    "regions": [{
                        "country": country,
                        "observedChartBudgetsMillion": float(sum(value for value, chart in zip(chart_budgets, panel["charts"])
                                                               if chart["country"] == country)),
                        "nestedRegionalUnobservedMillion": float(sum(value for value, anchor in zip(regional, panel["regionalAnchors"])
                                                                     if anchor["geography"] == country)),
                    } for country in sorted({chart["country"] for chart in panel["charts"]})],
                    "gameAmounts": [{
                        "game": game["key"], "globalUnobservedMillion": float(residuals[i]),
                        "nestedRegionalUnobservedMillion": float(sum(witness[column] for column in groups[i])),
                    } for i, game in enumerate(panel["games"])],
                },
                "solverRecoveries": model.solver_recoveries,
            })
            print(json.dumps({"shapeIndex": shape, "countryCaps": caps,
                              "minimumGlobalUnobservedMillion": float(minimum.fun),
                              "regionalRanges": regional_ranges}), flush=True)
    result = {
        "schemaVersion": 1, "productionEnabled": False, "operationalParametersAdopted": False,
        "inputs": [input_fingerprint(path) for path in paths], "period": panel["period"], "rows": rows,
        "limitations": [
            "This is a scope-relaxation hypothesis; current iPhone chart titles do not prove every archived historical device scope.",
            "Regional residuals can represent missing devices, chart tails or other unobserved contributions; they are not measured iPad spending.",
            "Regional residuals are subsets of global unobserved revenue and are counted only once in the world budget.",
            "Known regional residuals also consume their country budget in the country-cap scenario.",
            "All money labels remain previously exposed vendor estimates under conditional period and family assumptions.",
            "Because fully latent allocations are possible, feasibility alone does not identify a useful prediction.",
            "The frozen curves, source amounts and previous infeasibility results are preserved; no newly fitted forecast is adopted.",
            "Bounds are feasible-set ranges, not confidence intervals, error rates or independent validation."
        ],
    }
    (ROOT / "reports/rank-models/extension-regional-residuals-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
