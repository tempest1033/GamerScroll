"""Detect order conflicts shared by every nonnegative non-increasing rank curve."""
import argparse
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint


def cumulative_dominance(first, second, tolerance=1e-12):
    """Whether first's archived exposure weakly dominates second at every cutoff."""
    differences = np.cumsum(np.asarray(first) - np.asarray(second))
    return {
        "weakDominance": bool(np.all(differences >= -tolerance)),
        "strictAtSomeCutoff": bool(np.any(differences > tolerance)),
        "minimumCumulativeDifference": float(differences.min()),
        "maximumCumulativeDifference": float(differences.max()),
        "strictCutoffCount": int(np.count_nonzero(differences > tolerance)),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="docs/research/appmagic-store-public-2026-09-11/us-august.json")
    parser.add_argument("--chart", default="ios_us")
    parser.add_argument("--identity-store", choices=("ios", "aos"), default="ios")
    parser.add_argument("--output", default="reports/rank-models/store-order-dominance-2026-09-11.json")
    args = parser.parse_args()
    panel_path = "reports/rank-models/normalized-august-regional-panel-2026-09-10.json"
    source_path = args.source
    panel, source = map(read_json, (panel_path, source_path))
    chart = next(chart for chart in panel["charts"] if chart["key"] == args.chart)
    if chart["country"] != source["geography"]:
        raise ValueError("Country scope mismatch")
    if any(panel["period"][key] != source["period"][key] for key in ("start", "end")):
        raise ValueError("Period scope mismatch")
    expected = {"ios": "app_store", "aos": "google_play"}[args.identity_store]
    if chart["store"] != expected:
        raise ValueError("Identity store and chart store disagree")
    histogram = rank_histograms({**panel, "charts": [chart]})[:, 0]
    lookup = {app_id: i for i, game in enumerate(panel["games"]) for app_id in game["storeIds"][args.identity_store]}
    reports = []
    for table in source["tables"]:
        source_store = {
            "app_store_iphone": "app_store", "app_store_iphone_and_ipad": "app_store",
            "google_play": "google_play"}[table["storeScope"]]
        if source_store != expected:
            raise ValueError("Reference and chart store disagree")
        mapped = [{"rank": rank, "index": lookup[app_id], "id": app_id,
                   "game": panel["games"][lookup[app_id]]["key"]}
                  for rank, app_id in enumerate(table.get("orderedRepresentativeIds",
                                                        table.get("orderedRepresentativeIosIds", [])), 1)
                  if app_id in lookup]
        contradictions = []
        for p, first in enumerate(mapped):
            for second in mapped[p + 1:]:
                dominance = cumulative_dominance(histogram[second["index"]], histogram[first["index"]])
                if dominance["weakDominance"]:
                    contradictions.append({
                        "publishedHigher": first["game"], "publishedLower": second["game"],
                        "publishedRanks": [first["rank"], second["rank"]],
                        "archiveLowerGameDominates": dominance,
                    })
        reports.append({
            "sourceUrl": table["sourceUrl"], "storeScope": table["storeScope"],
            "mapped": mapped, "conditionalOrderConflicts": contradictions,
            "conflictCount": len(contradictions),
            "pairCount": len(mapped) * (len(mapped) - 1) // 2,
        })
    roblox = next(i for i, game in enumerate(panel["games"]) if game["key"] == "Roblox")
    row = histogram[roblox]
    nonzero = np.flatnonzero(row)
    result = {
        "schemaVersion": 1, "productionEnabled": False,
        "inputs": [input_fingerprint(path) for path in (panel_path, source_path)],
        "chart": chart["key"], "observationWeighting": "equal_observed_day_equal_snapshot",
        "robloxExposure": {
            "observedDayMeanTop200Presence": float(row.sum()),
            "observedRankRange": [int(nonzero.min() + 1), int(nonzero.max() + 1)] if len(nonzero) else None,
        },
        "tables": reports,
        "limitations": [
            "Cumulative dominance implies no nonnegative non-increasing stationary rank curve can reverse this pair on this exposure panel.",
            "Weak dominance may permit ties; this does not force a strict reverse ranking for every curve.",
            "This is not a proof that vendor estimates or store charts are incorrect.",
            "Missing August 1, device scope, intra-period spending variation and vendor families remain unresolved.",
            "No market multiplier, power-law exponent or monetary target enters this diagnostic.",
        ],
    }
    (ROOT / args.output).write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"roblox": result["robloxExposure"], "tables": [
        {"scope": row["storeScope"], "pairs": row["pairCount"], "conflicts": row["conflictCount"],
         "robloxConflicts": [pair["publishedLower"] for pair in row["conditionalOrderConflicts"]
                            if pair["publishedHigher"] == "Roblox"]} for row in reports]}))


if __name__ == "__main__":
    main()
