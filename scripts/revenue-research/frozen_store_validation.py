"""Evaluate new Japanese store breakdowns without selecting a curve on them."""
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import frozen_models, input_fingerprint
from consensus_japan import load_ordinal
from store_order_dominance import cumulative_dominance


def main():
    panel_path = "reports/rank-models/normalized-august-regional-panel-2026-09-10.json"
    original_path = "reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json"
    consensus_path = "reports/rank-models/consensus-transfer-2026-09-11.json"
    panel, original, consensus = map(read_json, (panel_path, original_path, consensus_path))
    training = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    fixed = [row for row in frozen_models(training) if row["id"] in {
        "round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}]
    groups = [{"id": row["id"], "parameters": [[row["exponents"]["ios"], row["exponents"]["aos"]]]}
              for row in fixed]
    groups.extend([
        {"id": "preserved_japan_70", "parameters": [row[:2] for row in original["coOptimalParameterExamples"]]},
        {"id": "provider_consensus_2466", "parameters": [row[:2] for row in consensus["recoveredParameters"]]},
    ])
    if original["parameterExamplesTruncated"]:
        raise ValueError("All original co-optimal parameters are required")
    ordinal = load_ordinal()
    results, inputs = [], [panel_path, original_path, consensus_path]
    for store, source_suffix, exponent_index in (("ios", "iphone", 0), ("aos", "google", 1)):
        source_path = f"docs/research/appmagic-store-public-2026-09-11/jp-august-{source_suffix}.json"
        source = read_json(source_path)
        inputs.append(source_path)
        chart = next(row for row in panel["charts"] if row["key"] == f"{store}_jp")
        histogram = rank_histograms({**panel, "charts": [chart]})[:, 0]
        lookup = {app_id: i for i, game in enumerate(panel["games"]) for app_id in game["storeIds"][store]}
        ids = source["tables"][0]["orderedRepresentativeIds"]
        mapped = [{"publishedRank": r, "id": app_id, "index": lookup[app_id],
                   "game": panel["games"][lookup[app_id]]["key"]}
                  for r, app_id in enumerate(ids, 1) if app_id in lookup]
        indices = [row["index"] for row in mapped]
        left, right = np.triu_indices(len(indices), 1)
        histogram = histogram[indices]
        rank = np.arange(1, panel["rankLimit"] + 1, dtype=float)
        exponents = sorted({p[exponent_index] for group in groups for p in group["parameters"]})
        scores = np.array([histogram @ (rank ** -alpha) for alpha in exponents])
        losses = ordinal.pair_losses(scores, left, right).sum(axis=1) / 2
        lookup_losses = dict(zip(exponents, losses))
        comparisons = []
        for group in groups:
            values = [float(lookup_losses[p[exponent_index]]) for p in group["parameters"]]
            comparisons.append({"model": group["id"], "preservedCandidateCount": len(values),
                                "violationRange": [min(values), max(values)],
                                "perCandidateViolations": values})
        conflicts = []
        for a, b in zip(left, right):
            relation = cumulative_dominance(histogram[b], histogram[a])
            if relation["weakDominance"]:
                conflicts.append({"publishedHigher": mapped[a]["game"], "publishedLower": mapped[b]["game"],
                                  **relation})
        results.append({
            "store": store, "sourceUrl": source["tables"][0]["sourceUrl"],
            "mapped": mapped, "unmappedIds": [app_id for app_id in ids if app_id not in lookup],
            "pairCount": len(left), "comparisons": comparisons,
            "curveIndependentConditionalConflicts": conflicts,
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnNewStoreLabels": False,
        "inputs": [input_fingerprint(path) for path in inputs], "results": results,
        "limitations": [
            "New store breakdowns overlap August and the previously inspected provider; they are not future validation.",
            "Within-store order does not identify a cross-store budget mixture or monetary scale.",
            "Every preserved candidate is evaluated; the best new-store result is not selected.",
            "Distinct device scope and incomplete August calendar remain limitations.",
            "Unmapped or incomplete IDs are not guessed.",
        ],
    }
    (ROOT / "reports/rank-models/frozen-japan-store-validation-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{"store": row["store"], "mapped": len(row["mapped"]), "pairs": row["pairCount"],
                      "curveIndependentConflicts": len(row["curveIndependentConditionalConflicts"]),
                      "comparisons": [{k: v for k, v in c.items() if k != "perCandidateViolations"}
                                      for c in row["comparisons"]]} for row in results]))


if __name__ == "__main__":
    main()
