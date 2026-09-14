"""Ordinal completion bounds; missing identities remain unscored and unfitted."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint


def additional_inversion_bounds(values, known_ranks, missing_ranks):
    """Extrema over free missing-game placements; preserve each observed tie block."""
    values, known_ranks = np.asarray(values), np.asarray(known_ranks)
    missing_ranks = np.asarray(missing_ranks)
    if len(values) != len(known_ranks) or not np.all(np.isfinite(values)):
        raise ValueError("Known scores and reference ranks must be matched and finite")
    all_ranks = list(known_ranks) + list(missing_ranks)
    if len(set(all_ranks)) != len(all_ranks):
        raise ValueError("Reference ranks must be unique")
    m = len(missing_ranks)
    if m > 12:
        raise ValueError("Exact ordinal completion is bounded to twelve missing games")
    groups = []
    for value in sorted(set(values), reverse=True):
        groups.append(known_ranks[values == value])
    minimum = np.full((len(groups) + 1, 1 << m), np.inf)
    maximum = np.full_like(minimum, -np.inf)
    minimum[0, 0] = maximum[0, 0] = 0
    prefix = []
    for i in range(len(groups) + 1):
        for mask in range(1 << m):
            if not np.isfinite(minimum[i, mask]):
                continue
            placed = [missing_ranks[j] for j in range(m) if mask & (1 << j)]
            transitions = []
            if i < len(groups):
                cost = sum(previous > rank for previous in placed for rank in groups[i])
                transitions.append((i + 1, mask, cost))
            for j, rank in enumerate(missing_ranks):
                if not mask & (1 << j):
                    cost = sum(previous > rank for previous in prefix + placed)
                    transitions.append((i, mask | (1 << j), cost))
            for next_i, next_mask, cost in transitions:
                minimum[next_i, next_mask] = min(minimum[next_i, next_mask], minimum[i, mask] + cost)
                maximum[next_i, next_mask] = max(maximum[next_i, next_mask], maximum[i, mask] + cost)
        if i < len(groups):
            prefix += groups[i].tolist()
    return {"minimum": int(minimum[-1, -1]), "maximum": int(maximum[-1, -1])}


def main():
    path = "reports/rank-models/extension-global-day-order-2026-09-11.json"
    previous = read_json(path)
    day = previous["results"][0]
    indices = [row["gameIndex"] for row in day["mappedRows"]]
    ranks = [row["rank"] for row in day["mappedRows"]]
    missing = [row["rank"] for row in day["unmappedRows"]]
    rows = []
    for scenario in day["scenarios"]:
        for view in ("fiveMarket", "allMarket"):
            values = [scenario[view + "Index"][i] for i in indices]
            additional = additional_inversion_bounds(values, ranks, missing)
            fixed = scenario[view + "Order"]["violations"]
            rows.append({
                "curve": scenario["curve"], "utcOffsetHours": scenario["utcOffsetHours"],
                "reconstruction": scenario["reconstruction"], "view": view,
                "knownGames": len(indices), "missingGames": len(missing),
                "knownPairs": len(indices) * (len(indices) - 1) // 2,
                "fullPairs": (len(indices) + len(missing)) * (len(indices) + len(missing) - 1) // 2,
                "knownViolationCount": fixed, "additionalInversionRange": additional,
                "fullViolationRange": [fixed + additional["minimum"], fixed + additional["maximum"]]})
    summaries = []
    for definition in previous["curveDefinitions"]:
        for view in ("fiveMarket", "allMarket"):
            selected = [row for row in rows if row["curve"] == definition["id"] and row["view"] == view]
            summaries.append({
                "curve": definition["id"], "view": view,
                "bestCompletionRangeAcrossScenarios": [
                    min(row["fullViolationRange"][0] for row in selected),
                    max(row["fullViolationRange"][0] for row in selected)],
                "worstCompletionRangeAcrossScenarios": [
                    min(row["fullViolationRange"][1] for row in selected),
                    max(row["fullViolationRange"][1] for row in selected)]})
    report = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False,
        "input": input_fingerprint(path),
        "implementation": input_fingerprint("scripts/revenue-research/extension_unmapped_order.py"),
        "date": day["date"], "unmappedRows": day["unmappedRows"], "rows": rows, "summaries": summaries,
        "limitations": [
            "These are exact ordinal-completion extrema conditional on the saved known-game ordering, not confidence intervals.",
            "Unmapped games receive no invented numerical predictions, market weights or corrected identities.",
            "Missing games may take arbitrary ordinal positions; observed tie blocks stay intact.",
            "The completion problem imposes no additional game-family, market-budget or cross-view score constraints.",
            "Bounds for the two views are separate; they do not prove a feasible paired improvement or deterioration.",
            "The valid 26-game comparison is retained, but it is not silently reported as TOP30 accuracy."
        ]}
    with (ROOT / "reports/rank-models/extension-unmapped-order-2026-09-11.json").open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
    print(json.dumps(summaries), flush=True)


if __name__ == "__main__":
    main()
