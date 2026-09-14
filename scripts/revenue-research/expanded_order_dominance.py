"""Identify curve-independent conflicts in the expanded frozen weekly cohort."""
import json
from collections import Counter
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from store_order_dominance import cumulative_dominance


def order_conflicts(histogram, mapped):
    """Return published-order pairs that cannot be strict under a monotone curve."""
    result = []
    for p, first in enumerate(mapped):
        for second in mapped[p + 1:]:
            dominance = cumulative_dominance(
                histogram[second["index"]], histogram[first["index"]])
            if dominance["weakDominance"]:
                result.append({
                    "publishedHigher": first["game"], "publishedLower": second["game"],
                    "publishedRanks": [first["publishedRank"], second["publishedRank"]],
                    "involvesExpandedGame": first["newlyModeled"] or second["newlyModeled"],
                    "dominance": dominance,
                })
    return result


def main():
    paths = [
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.json",
        "reports/rank-models/public-weekly-order-2026-09-11.exposure.npz",
        "reports/rank-models/weekly-reconstruction-2026-09-11.exposure.npz",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.novel-exposure.npz",
    ]
    cohort = read_json(paths[0])
    old_linear = np.load(ROOT / paths[1])["JP"]
    old_alternate = np.load(ROOT / paths[2])
    novel = np.load(ROOT / paths[3])
    old = {"linear": old_linear, **{key: old_alternate[key] for key in ("previous", "next")}}
    rows = []
    for method in ("linear", "previous", "next"):
        if old[method].shape[0] != 105 or novel[method].shape[0] != 105:
            raise ValueError("Incomplete cached clock coverage")
        for clock in range(105):
            histogram = np.concatenate((old[method][clock], novel[method][clock]), axis=0)
            for s, store in enumerate(cohort["cohorts"]):
                conflicts = order_conflicts(histogram[:, s], store["mapped"])
                rows.append({
                    "method": method, "utcOffsetHours": -12 + clock * .25,
                    "storeScope": store["storeScope"],
                    "conditionalConflicts": conflicts, "conflictCount": len(conflicts),
                    "newPairConflictCount": sum(row["involvesExpandedGame"] for row in conflicts),
                })
    summaries = []
    for store in cohort["cohorts"]:
        own = [row for row in rows if row["storeScope"] == store["storeScope"]]
        count = Counter((pair["publishedHigher"], pair["publishedLower"])
                        for row in own for pair in row["conditionalConflicts"])
        summaries.append({
            "storeScope": store["storeScope"], "scenarios": len(own),
            "mappedGames": len(store["mapped"]),
            "conflictCountRange": [min(row["conflictCount"] for row in own),
                                   max(row["conflictCount"] for row in own)],
            "newPairConflictCountRange": [min(row["newPairConflictCount"] for row in own),
                                          max(row["newPairConflictCount"] for row in own)],
            "scenariosWithoutPairwiseCertificate": [
                {"method": row["method"], "utcOffsetHours": row["utcOffsetHours"]}
                for row in own if not row["conflictCount"]],
            "pairScenarioCounts": [
                {"publishedHigher": first, "publishedLower": second, "scenarios": number,
                 "presentUnderEveryClockAndReconstruction": number == len(own)}
                for (first, second), number in sorted(count.items(), key=lambda item: (-item[1], item[0]))],
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "coefficientsFitted": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": cohort["period"], "summaries": summaries, "rows": rows,
        "limitations": [
            "Every conflict is conditional on the cached equal-time exposures, observed scope and stationary common curve.",
            "Nonnegative non-increasing curves include but are not limited to power laws; market multipliers cannot fix a within-store pair.",
            "Weak dominance rules out the published strict order but may permit a tie; it does not force a strict reversal for every curve.",
            "Cumulative comparisons use the existing 1e-12 numerical tolerance.",
            "No pairwise certificate does not establish that the entire order has a jointly feasible curve.",
            "Daily market spending variation, game families, unobserved ranks and vendor estimation differences remain possible explanations.",
            "Scenario counts are sensitivity diagnostics, not probabilities or independent observations.",
            "All frozen candidates and prior exposures remain unchanged; these results never assign dollars."
        ],
    }
    (ROOT / "reports/rank-models/expanded-order-dominance-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summaries, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
