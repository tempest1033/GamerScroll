"""Frozen rank shapes with conserved market mass and explicit unidentified revenue."""
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint
from weekly_partial_bounds import load_lp


def add_fixed_shapes(model, panel, exponents):
    ranks = panel["rankLimit"]
    for k, chart in enumerate(panel["charts"]):
        key = "cn" if chart["country"] == "CN" else (
            "aos" if chart["store"] == "google_play" else "ios")
        values = np.arange(1, ranks + 1, dtype=float) ** -exponents[key]
        for r in range(1, ranks):
            model.add({k * ranks: float(values[r]), k * ranks + r: -1},
                      0, "eq", f"frozen_shape:{chart['key']}:{r + 1}")


def minimum_reference_widening(lp, original):
    """Relax only game-money equalities; preserve all accounting and shape constraints."""
    widened = lp.LinearModel(original.variables + 1)
    delta = original.variables
    for row in original.constraints:
        coefficients, amount = row["coefficients"], row["amount"]
        if row["relation"] == "eq" and row["game"] is not None:
            if amount <= 0:
                raise ValueError("Relative reference widening requires positive money labels")
            widened.add({**coefficients, delta: -amount}, amount, "ub",
                        row["name"] + ":upper", game=row["game"])
            widened.add({**{i: -value for i, value in coefficients.items()}, delta: -amount},
                        -amount, "ub", row["name"] + ":lower", game=row["game"])
        else:
            widened.add(coefficients.copy(), amount, row["relation"], row["name"], game=row["game"])
    widened.add({delta: 1}, 1, "ub", "maximum_reference_widening")
    objective = np.zeros(widened.variables)
    objective[delta] = 1
    solved = widened.solve(objective)
    return widened, solved


def main():
    paths = [
        "reports/rank-models/normalized-august-regional-panel-2026-09-10.json",
        "docs/research/same-month-market-evidence-2026-09-10.json",
        "reports/rank-models/extension-korea-conditional-bounds-2026-09-11.json",
        "scripts/revenue-research/partial-bounds.py",
        "docs/research/revenue-extension-2026-09-11/source-versions.json",
    ]
    full, markets, frozen = map(read_json, paths[:3])
    indices = [i for i, game in enumerate(full["games"]) if game["reference"] is not None]
    eligible = {full["games"][i]["key"] for i in indices}
    panel = {**full, "games": [full["games"][i] for i in indices],
             "charts": [{**chart, "observations": [
                 {**row, "gameRanks": [row["gameRanks"][i] for i in indices]}
                 for row in chart["observations"]]} for chart in full["charts"]],
             "regionalAnchors": [anchor for anchor in full["regionalAnchors"] if anchor["game_key"] in eligible]}
    histogram = rank_histograms(panel)
    if np.any(histogram.sum(axis=0) > 1 + 1e-10):
        raise ValueError("Overlapping game identities would double-count a chart slot")
    shapes = {}
    for model in frozen["models"]:
        key = tuple(model["exponents"][name] for name in ("ios", "aos", "cn"))
        shapes.setdefault(key, {"exponents": model["exponents"], "archivedModelIds": []})["archivedModelIds"].append(model["id"])
    lp = load_lp()
    rows = []
    for shape_index, shape in enumerate(shapes.values()):
        for caps in (False, True):
            for anchor_scope in ("none", "japan", "china", "all"):
                subset = {**panel, "regionalAnchors": [
                    anchor for anchor in panel["regionalAnchors"] if anchor_scope == "all" or
                    (anchor_scope == "japan" and anchor["geography"] == "JP") or
                    (anchor_scope == "china" and anchor["geography"] == "CN")]}
                model, vectors, world, source, rank_variables = lp.build_global_model(
                    subset, markets, histogram, caps)
                add_fixed_shapes(model, subset, shape["exponents"])
                exact = model.solve(np.zeros(model.variables))
                diagnostics = {
                    "exactPointFeasible": bool(exact.success), "exactSolverMessage": exact.message,
                    "exactSolverRecoveries": model.solver_recoveries,
                }
                if exact.success:
                    outside = np.zeros(model.variables)
                    outside[rank_variables:] = 1
                    minimum = model.solve(outside)
                    diagnostics.update({
                        "minimumUnidentifiedKnownGameRevenueMillion": float(minimum.fun) if minimum.success else None,
                        "minimumRelativeReferenceWidening": 0.,
                        "witnessPurpose": "Minimum unidentified known-game revenue under exact conditional labels.",
                    })
                    witness = minimum.x if minimum.success else None
                else:
                    widened, fit = minimum_reference_widening(lp, model)
                    diagnostics.update({
                        "minimumRelativeReferenceWidening": float(fit.x[-1]) if fit.success else None,
                        "wideningSolverMessage": fit.message,
                        "wideningSolverRecoveries": widened.solver_recoveries,
                        "witnessPurpose": "Smallest uniform relative widening needed for conditional consistency, not a new forecast.",
                    })
                    witness = fit.x[:-1] if fit.success else None
                if witness is not None:
                    chart_budgets = witness[:rank_variables].reshape(len(panel["charts"]), panel["rankLimit"]).sum(axis=1)
                    diagnostics["witness"] = {
                        "countryTop200BudgetsMillion": {
                            country: float(sum(value for value, chart in zip(chart_budgets, panel["charts"])
                                               if chart["country"] == country))
                            for country in sorted({chart["country"] for chart in panel["charts"]})},
                        "unidentifiedKnownGameRevenueMillion": {
                            game["key"]: float(witness[rank_variables + i]) for i, game in enumerate(panel["games"])},
                        "totalAccountedMillion": float(witness.sum()),
                    }
                rows.append({
                    **shape, "shapeIndex": shape_index, "countryCaps": caps, "regionalAnchorScope": anchor_scope,
                    "worldBudgetMillion": world, "worldBudgetSource": source,
                    "regionalAnchorIds": [anchor["id"] for anchor in subset["regionalAnchors"]],
                    **diagnostics,
                })
            print(json.dumps({"shapeIndex": shape_index, "countryCaps": caps, "completedRows": len(rows)}), flush=True)
    result = {
        "schemaVersion": 1, "productionEnabled": False, "operationalParametersAdopted": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": panel["period"], "distinctFrozenShapes": len(shapes), "rows": rows,
        "limitations": [
            "Shapes are frozen; chart budgets and unidentified revenues are latent accounting witnesses, not observed market amounts or new deployment parameters.",
            "The game money labels are the previously exposed August references; these diagnostics are not independent prediction tests.",
            "The four regional-anchor scopes isolate which constraints make a fixed shape inconsistent; none is selected as the winning training set.",
            "Relative widening is an optimization diagnostic, not a vendor uncertainty estimate, confidence interval or changed source amount.",
            "Unidentified revenue can cover unobserved markets and other missing contributions; its country attribution is not identified.",
            "August 1 is missing and the established equal-day/equal-snapshot exposure convention remains conditional.",
            "Unknown Korean three-store fee/refund amounts are not introduced as verified gross constraints.",
            "Sensor Tower country caps paired with AppMagic game labels remain a cross-product scenario under common ownership.",
            "The prior unrestricted-curve bound calculations and passed tests are preserved rather than replayed."
        ],
    }
    (ROOT / "reports/rank-models/extension-fixed-shape-accounting-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"distinctShapes": len(shapes), "scenarios": len(rows),
                      "exactFeasible": sum(row["exactPointFeasible"] for row in rows)}), flush=True)


if __name__ == "__main__":
    main()
