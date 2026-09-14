"""Explain already computed coverage effects without recomputing or selecting curves."""
import json
from datetime import datetime
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint


def main():
    paths = [
        "reports/rank-models/extension-global-day-order-2026-09-11.json",
        "reports/rank-models/extension-global-day-coverage-2026-09-11.json",
    ]
    result, coverage = map(read_json, paths)
    day = result["results"][0]
    mapped = day["mappedRows"]
    games = []
    for definition in result["curveDefinitions"]:
        scenarios = [row for row in day["scenarios"] if row["curve"] == definition["id"]]
        for reference in mapped:
            i = reference["gameIndex"]
            ranks, added, partial_ranks = [], [], []
            for scenario in scenarios:
                full, partial = scenario["allMarketIndex"], scenario["fiveMarketIndex"]
                ranks.append(1 + sum(full[other["gameIndex"]] > full[i] for other in mapped))
                partial_ranks.append(1 + sum(partial[other["gameIndex"]] > partial[i] for other in mapped))
                if full[i] > 0:
                    added.append((full[i] - partial[i]) / full[i])
            games.append({
                "curve": definition["id"], "game": result["games"][i]["key"],
                "publishedRank": reference["rank"],
                "fiveMarketSubsetRankRange": [min(partial_ranks), max(partial_ranks)],
                "allMarketSubsetRankRange": [min(ranks), max(ranks)],
                "additionalMarketIndexFractionRange": [min(added), max(added)] if added else None})
    clocks = {}
    for scenario in day["scenarios"]:
        clocks.setdefault(scenario["utcOffsetHours"], scenario)
    gap_distributions = []
    for offset, scenario in clocks.items():
        start = datetime.fromisoformat(scenario["startUtc"]).timestamp()
        end = datetime.fromisoformat(scenario["endUtc"]).timestamp()
        groups = {}
        for chart in result["charts"]:
            times = np.array([
                datetime.fromisoformat(f'{frame["date"]}T{frame["time"]}:00+09:00').timestamp()
                for frame in coverage["frames"]
                if chart["key"] not in frame["missingCharts"] + frame["emptyCharts"]])
            first = max(0, int(np.searchsorted(times, start, side="right")) - 1)
            last = min(len(times) - 1, int(np.searchsorted(times, end)))
            gaps = np.diff(times[first:last + 1])
            gap_seconds = int(gaps.max())
            group = groups.setdefault(gap_seconds, {"maximumGapHours": gap_seconds / 3600,
                                                    "proxyWeightMass": 0., "charts": []})
            group["proxyWeightMass"] += chart["weight"]
            group["charts"].append(chart["key"])
        gap_distributions.append({
            "utcOffsetHours": offset,
            "distribution": [groups[key] for key in sorted(groups)],
            "proxyWeightedMeanMaximumGapHours": sum(
                group["maximumGapHours"] * group["proxyWeightMass"] for group in groups.values())})
    report = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "gameDecomposition": games, "collectionGapDistributions": gap_distributions,
        "limitations": [
            "Ranks are within the same 26 mapped reference games, not the entire global game market.",
            "Additional-market fractions are proxy-index contributions, not observed revenue shares.",
            "A gap is collection spacing, not proof that the store chart remained unchanged.",
            "Gap distributions use exact saved frame availability and no arbitrary severity threshold.",
            "This reuses all frozen scenario scores; no model, clock or game is selected from these labels."
        ]}
    with (ROOT / "reports/rank-models/extension-day-decomposition-2026-09-11.json").open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
    print(json.dumps({
        "round13Examples": [row for row in games if row["curve"] == "frozen_round13_shape_index"
                            and row["game"] in {"Honor of Kings", "Roblox", "Pokemon GO", "Pokémon GO"}],
        "gapDistributions": [{
            "utcOffsetHours": row["utcOffsetHours"],
            "proxyWeightedMeanMaximumGapHours": row["proxyWeightedMeanMaximumGapHours"],
            "groups": [{"maximumGapHours": group["maximumGapHours"],
                        "proxyWeightMass": group["proxyWeightMass"],
                        "charts": len(group["charts"])} for group in row["distribution"]]
        } for row in gap_distributions]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
