"""Resolve only weekly scenarios not already closed by a pairwise certificate."""
import json
from collections import Counter
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from order_feasibility import strict_order_feasibility


def main():
    paths = [
        "reports/rank-models/expanded-order-dominance-2026-09-11.json",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.json",
        "reports/rank-models/public-weekly-order-2026-09-11.exposure.npz",
        "reports/rank-models/weekly-reconstruction-2026-09-11.exposure.npz",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.novel-exposure.npz",
    ]
    diagnosed, cohort = map(read_json, paths[:2])
    old_linear = np.load(ROOT / paths[2])["JP"]
    alternate = np.load(ROOT / paths[3])
    novel = np.load(ROOT / paths[4])
    old = {"linear": old_linear, **{key: alternate[key] for key in ("previous", "next")}}
    rows = []
    for s, store in enumerate(cohort["cohorts"]):
        summary = next(row for row in diagnosed["summaries"] if row["storeScope"] == store["storeScope"])
        indices = [row["index"] for row in store["mapped"]]
        for scenario in summary["scenariosWithoutPairwiseCertificate"]:
            method, offset = scenario["method"], scenario["utcOffsetHours"]
            clock = round((offset + 12) * 4)
            histogram = np.concatenate((old[method][clock], novel[method][clock]), axis=0)[indices, s]
            cutoff = np.arange(1, histogram.shape[1] + 1, dtype=float)
            result = strict_order_feasibility(np.cumsum(histogram, axis=1) / cutoff)
            rows.append({**scenario, "storeScope": store["storeScope"], **result})
    result = {
        "schemaVersion": 1, "productionEnabled": False, "coefficientsAdopted": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": cohort["period"], "newlySolvedScenarios": len(rows), "rows": rows,
        "statusCounts": dict(Counter(row["status"] for row in rows)),
        "previouslyClosedPairwiseScenarios": sum(
            row["scenarios"] - len(row["scenariosWithoutPairwiseCertificate"])
            for row in diagnosed["summaries"]),
        "limitations": [
            "Only scenarios without an existing pairwise certificate are solved.",
            "Any nonnegative non-increasing rank curve with unit TOP200 sum is a mixture of normalized top-k cutoff curves.",
            "The maximum adjacent margin tests joint order existence, not monetary accuracy or an adopted fitted curve.",
            "Margins near zero are explicitly unresolved at numerical tolerance, not exact proofs.",
            "A feasible curve may be irregular and need not resemble an economically verified revenue curve.",
            "Time-constant market budgets, cached interpolation, product-family scope and provider estimates remain conditional assumptions."
        ],
    }
    (ROOT / "reports/rank-models/remaining-order-feasibility-2026-09-11.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in (
        "newlySolvedScenarios", "statusCounts", "previouslyClosedPairwiseScenarios")}))


if __name__ == "__main__":
    main()
