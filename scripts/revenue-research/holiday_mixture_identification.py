"""Budget-compatible mixture intervals under explicit product-capacity assumptions."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import curve_scores


def mixture_interval(capacity, budgets, required):
    capacity = np.asarray(capacity, dtype=float)
    budgets = np.asarray(budgets, dtype=float)
    if capacity.shape != (2,) or budgets.shape != (2,):
        raise ValueError("Two store capacities and budgets are required")
    if not np.all(np.isfinite(capacity)) or np.any(capacity < 0) or np.any(capacity > 1):
        raise ValueError("Capacities must be finite fractions")
    if not np.all(np.isfinite(budgets)) or np.any(budgets <= 0) or not np.isfinite(required) or required <= 0:
        raise ValueError("Positive finite budgets and required revenue are necessary")
    if capacity @ budgets < required:
        return {"status": "infeasible", "minimumIosMixture": None, "maximumIosMixture": None}
    if capacity[1] * budgets[1] >= required:
        lower = 0.
    else:
        minimum_ios = (required - capacity[1] * budgets[1]) / capacity[0]
        lower = minimum_ios / (minimum_ios + budgets[1])
    if capacity[0] * budgets[0] >= required:
        upper = 1.
    else:
        minimum_google = (required - capacity[0] * budgets[0]) / capacity[1]
        upper = budgets[0] / (budgets[0] + minimum_google)
    return {"status": "feasible", "minimumIosMixture": float(lower), "maximumIosMixture": float(upper)}


def main():
    path = "reports/rank-models/pareto-holiday-budget-gate-2026-09-11.json"
    gate = read_json(path)
    rows = []
    for candidate in gate["rows"]:
        ios, google, mixture = candidate["parameters"]
        scenarios = []
        for scope in candidate["capacityScenarios"]:
            perfect = np.zeros((1, 2, 200))
            for s, count in enumerate(scope["listingCapacityByStore"]):
                perfect[0, s, :count] = 1
            capacity = [float(curve_scores(perfect, ios, google, mix)[0]) for mix in (1, 0)]
            result = mixture_interval(capacity, gate["storeBudgetsMillion"], gate["referenceLowerMillion"])
            inside = result["status"] == "feasible" and (
                result["minimumIosMixture"] <= mixture <= result["maximumIosMixture"])
            scenarios.append({
                "scope": scope["scenario"], "storeGameCapacityFractions": capacity, **result,
                "fixedMonthlyMixtureInsideCapacityInterval": inside,
            })
        rows.append({"candidateIndex": candidate["candidateIndex"], "monthlyMixture": mixture,
                     "capacityScenarios": scenarios})
    result = {
        "schemaVersion": 1, "productionEnabled": False, "parametersChanged": False,
        "inputs": [input_fingerprint(path)], "period": gate["period"], "rows": rows,
        "limitations": [
            "Intervals describe possible modeled TOP200 budget mixtures, not whole-store market shares.",
            "They use the most favorable rank positions for the stated number of listings.",
            "The published greater-than amount is relaxed to a closed lower bound.",
            "A mixture inside the capacity interval is not proof that actual rank histories or daily budgets realize it.",
            "The fitted monthly mixture is tested, not replaced by an endpoint that happens to pass.",
            "Provider and product-family scope uncertainty are unchanged from the parent budget gate."
        ],
    }
    (ROOT / "reports/rank-models/holiday-mixture-identification-2026-09-11.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(rows))


if __name__ == "__main__":
    main()
