"""Evaluate new weekly store labels against already-frozen candidates and cached exposure."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from consensus_japan import load_ordinal


def main():
    paths = [
        "docs/research/appmagic-store-public-2026-09-11/jp-week-august31.json",
        "reports/rank-models/japan-store-pareto-2026-09-11.json",
        "reports/rank-models/consensus-transfer-2026-09-11.json",
        "reports/rank-models/public-weekly-order-2026-09-11.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/weekly-growth-2026-09-11.json",
    ]
    reference, pareto, consensus, temporal, panel, original = map(read_json, paths)
    if reference["period"] != temporal["period"]:
        raise ValueError("Cached exposures do not cover the new reference period")
    models = [{"id": row["model"]["id"], "parameters": [
        row["model"]["ios"], row["model"]["google"]]} for row in original["results"]]
    models.extend({"id": f"store_pareto_archived_{i}", "parameters": consensus["recoveredParameters"][i][:2]}
                  for i in pareto["retainedOriginalIndices"])
    cache_path = str((ROOT / paths[3]).with_suffix(".exposure.npz"))
    histograms = np.load(cache_path)["JP"]
    ordinal = load_ordinal()
    results = []
    for store_index, identity_store in enumerate(("ios", "aos")):
        scope = ("app_store_iphone", "google_play")[store_index]
        table = next(table for table in reference["tables"] if table["storeScope"] == scope)
        lookup = {app_id: i for i, game in enumerate(panel["games"]) for app_id in game["storeIds"][identity_store]}
        ids = table["orderedRepresentativeIds"]
        mapped = [{"publishedRank": rank, "id": app_id, "index": lookup[app_id],
                   "game": panel["games"][lookup[app_id]]["key"]}
                  for rank, app_id in enumerate(ids, 1) if app_id in lookup]
        if len({row["index"] for row in mapped}) != len(mapped):
            raise ValueError("Duplicated provider product family")
        indices = [row["index"] for row in mapped]
        left, right = np.triu_indices(len(indices), 1)
        exponents = sorted({model["parameters"][store_index] for model in models})
        rank = np.arange(1, panel["rankLimit"] + 1, dtype=float)
        curves = np.array([rank ** -alpha for alpha in exponents])
        rows = []
        for clock_index, histogram in enumerate(histograms):
            scores = curves @ histogram[indices, store_index].T
            losses = ordinal.pair_losses(scores, left, right).sum(axis=1) / 2
            by_exponent = dict(zip(exponents, losses))
            rows.extend({"model": model["id"], "utcOffsetHours": -12 + .25 * clock_index,
                         "violations": float(by_exponent[model["parameters"][store_index]])}
                        for model in models)
        summaries = []
        for model in models:
            own = [row for row in rows if row["model"] == model["id"]]
            values = [row["violations"] for row in own]
            summaries.append({"model": model["id"], "violationRange": [min(values), max(values)],
                              "utcViolations": next(row["violations"] for row in own if row["utcOffsetHours"] == 0),
                              "kstViolations": next(row["violations"] for row in own if row["utcOffsetHours"] == 9)})
        results.append({
            "storeScope": scope, "sourceUrl": table["sourceUrl"], "mapped": mapped,
            "unmappedIds": [app_id for app_id in ids if app_id not in lookup],
            "pairCount": len(left), "summaries": summaries, "clockScenarios": rows})
    result = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnTheseLabels": False,
        "inputs": [input_fingerprint(path) for path in paths] + [
            input_fingerprint(str((ROOT / paths[3]).with_suffix(".exposure.npz").relative_to(ROOT)))],
        "period": reference["period"], "results": results,
        "limitations": [
            "Candidates were fixed before these store-specific labels were extracted.",
            "Earlier aggregate order and overlapping dates were already inspected; no pristine forecast claim.",
            "All frozen candidates and all 105 clocks are kept without reselection.",
            "iPhone-only and Google Play order are assessed separately; cross-store monetary scale is not inferred.",
            "Existing cohort selection and provisional provider-family mapping remain limitations.",
        ],
    }
    (ROOT / "reports/rank-models/japan-weekly-store-transfer-2026-09-11.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{"scope": row["storeScope"], "games": len(row["mapped"]), "pairs": row["pairCount"],
                      "models": [s for s in row["summaries"] if s["model"] == "round13_original_frozen"
                                 or s["model"].startswith("store_pareto_")]} for row in results]))


if __name__ == "__main__":
    main()
