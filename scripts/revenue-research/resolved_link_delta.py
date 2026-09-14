"""Complete a missing identity's pair comparisons, preserving all prior pair results."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import curve_scores
from consensus_japan import load_ordinal


def main():
    paths = [
        "docs/research/appmagic-weekly-id-correction-2026-09-11.json",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
        "reports/rank-models/public-weekly-order-2026-09-11.exposure.npz",
        "reports/rank-models/weekly-reconstruction-2026-09-11.exposure.npz",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.novel-exposure.npz",
    ]
    correction, prior, old, new = map(read_json, paths[:4])
    source = read_json(correction["sourcePath"])
    store = next(row for row in source["tables"] if row["storeScope"] == correction["storeScope"])
    if source["period"] != correction["period"] or source["geography"] != correction["geography"]:
        raise ValueError("Identity correction scope does not match the preserved source")
    if store["orderedRepresentativeIds"][correction["publishedRank"] - 1] != correction["previouslyPreservedId"]:
        raise ValueError("The original position is not the specifically corrected identity")
    games = old["games"] + new["games"]
    matches = [i for i, game in enumerate(games) if correction["resolvedId"] in game["storeIds"]["aos"]]
    if len(matches) != 1 or games[matches[0]]["key"] != correction["game"]:
        raise ValueError("Resolved game identity is absent or ambiguous")
    cohort = next(row for row in prior["cohorts"] if row["storeScope"] == correction["storeScope"])
    if correction["previouslyPreservedId"] not in cohort["unmappedIds"]:
        raise ValueError("The corrected identity was already evaluated")
    mapped = sorted(cohort["mapped"] + [{
        "publishedRank": correction["publishedRank"], "id": correction["resolvedId"],
        "index": matches[0], "game": correction["game"], "newlyModeled": True}],
        key=lambda row: row["publishedRank"])
    if len({row["index"] for row in mapped}) != len(mapped):
        raise ValueError("The resolved game would duplicate another modeled family")
    position = next(i for i, row in enumerate(mapped) if row["id"] == correction["resolvedId"])
    left, right = np.triu_indices(len(mapped), 1)
    newly = (left == position) | (right == position)
    left, right = left[newly], right[newly]
    old_alternate = np.load(ROOT / paths[5])
    old_cache = {"linear": np.load(ROOT / paths[4])["JP"],
                 **{key: old_alternate[key] for key in ("previous", "next")}}
    novel = np.load(ROOT / paths[6])
    previous = {(row["method"], row["utcOffsetHours"], row["model"]): row
                for row in prior["rows"] if row["storeScope"] == correction["storeScope"]}
    ordinal = load_ordinal()
    rows = []
    for method in ("linear", "previous", "next"):
        for clock in range(105):
            histogram = np.concatenate((old_cache[method][clock], novel[method][clock]), axis=0)
            scores = np.array([curve_scores(histogram, *model["parameters"], 0)
                               for model in prior["models"]])[:, [row["index"] for row in mapped]]
            losses = ordinal.pair_losses(scores, left, right).sum(axis=1) / 2
            for i, model in enumerate(prior["models"]):
                old_row = previous[(method, -12 + clock * .25, model["id"])]
                rows.append({
                    "method": method, "utcOffsetHours": -12 + clock * .25, "model": model["id"],
                    "priorViolationsReused": old_row["fullViolations"],
                    "newPairViolations": float(losses[i]),
                    "fullViolations": float(old_row["fullViolations"] + losses[i]),
                })
    summaries = [{"model": model["id"],
                  "fullViolationRange": [min(row["fullViolations"] for row in rows if row["model"] == model["id"]),
                                         max(row["fullViolations"] for row in rows if row["model"] == model["id"])]}
                 for model in prior["models"]]
    result = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnCorrectedIdentity": False,
        "inputs": [input_fingerprint(path) for path in paths + [correction["sourcePath"]]],
        "period": correction["period"], "storeScope": correction["storeScope"],
        "mapped": mapped, "fullGames": len(mapped), "fullPairs": len(mapped) * (len(mapped) - 1) // 2,
        "priorPairsReused": len(cohort["mapped"]) * (len(cohort["mapped"]) - 1) // 2,
        "newPairsEvaluated": len(left), "summaries": summaries, "rows": rows,
        "limitations": [
            "The original truncated-ID artifact and all prior subset diagnostics remain preserved.",
            "Only newly available pair relations are evaluated; no prior exposure or pair comparison is rerun.",
            "The prior subset's order-conflict certificates remain conditional subset constraints within this larger list.",
            "Identity correction does not validate monetary amounts, provider families or a future prediction.",
            "No model or reporting clock is selected using this correction."
        ],
    }
    (ROOT / "reports/rank-models/resolved-link-delta-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"fullGames": len(mapped), "newPairs": len(left), "summaries": summaries}))


if __name__ == "__main__":
    main()
