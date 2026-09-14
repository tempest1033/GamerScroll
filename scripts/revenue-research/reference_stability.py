"""Sensitivity to losing one or two new store references, not a fresh cross-validation claim."""
import itertools
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint
from consensus_japan import load_ordinal
from store_pareto import nondominated


def losses_without_games(matrices, omitted):
    return np.column_stack([
        matrix[:, [a not in omitted and b not in omitted for a, b in pairs]].sum(axis=1) / 2
        for matrix, pairs in matrices])


def main():
    paths = [
        "reports/rank-models/frozen-japan-store-validation-2026-09-11.json",
        "reports/rank-models/consensus-transfer-2026-09-11.json",
        "reports/rank-models/japan-store-pareto-2026-09-11.json",
        "reports/rank-models/normalized-august-regional-panel-2026-09-10.json",
    ]
    validation, transfer, baseline, panel = map(read_json, paths)
    parameters = np.asarray(transfer["recoveredParameters"])
    future = np.asarray(transfer["perParameterViolationRanges"])
    baseline_set = set(baseline["retainedOriginalIndices"])
    ordinal = load_ordinal()
    matrices = []
    games = sorted({row["game"] for result in validation["results"] for row in result["mapped"]})
    for s, store in enumerate(("ios", "aos")):
        reference = next(row for row in validation["results"] if row["store"] == store)
        chart = next(row for row in panel["charts"] if row["key"] == f"{store}_jp")
        hist = rank_histograms({**panel, "charts": [chart]})[:, 0]
        indices = [row["index"] for row in reference["mapped"]]
        names = [row["game"] for row in reference["mapped"]]
        left, right = np.triu_indices(len(indices), 1)
        alpha, inverse = np.unique(parameters[:, s], return_inverse=True)
        rank = np.arange(1, panel["rankLimit"] + 1, dtype=float)
        scores = np.array([hist[indices] @ rank ** -value for value in alpha])
        losses = ordinal.pair_losses(scores, left, right)[inverse]
        matrices.append((losses, [(names[a], names[b]) for a, b in zip(left, right)]))
    results = []
    for size in (1, 2):
        for omitted in itertools.combinations(games, size):
            losses = losses_without_games(matrices, omitted)
            keep = np.flatnonzero(nondominated(losses))
            result = {
                "omittedStoreReferenceGames": list(omitted),
                "retainedCount": len(keep),
                "retainedOriginalIndices": keep.tolist(),
                "sameSetAsFullReferences": set(keep) == baseline_set,
                "retainsAllOriginalThree": baseline_set.issubset(set(keep)),
                "retainsAnyOriginalThree": bool(baseline_set.intersection(set(keep))),
                "parameterRanges": np.column_stack((parameters[keep].min(axis=0),
                                                    parameters[keep].max(axis=0))).tolist(),
                "laterAggregateViolationRange": [float(future[keep, 0].min()), float(future[keep, 1].max())],
            }
            results.append(result)
    summaries = []
    for size in (1, 2):
        rows = [row for row in results if len(row["omittedStoreReferenceGames"]) == size]
        summaries.append({
            "omittedGames": size, "cases": len(rows),
            "sameSetCases": sum(row["sameSetAsFullReferences"] for row in rows),
            "retainsAllOriginalThreeCases": sum(row["retainsAllOriginalThree"] for row in rows),
            "retainsNoneOfOriginalThreeCases": sum(not row["retainsAnyOriginalThree"] for row in rows),
            "retainedCountRange": [min(row["retainedCount"] for row in rows),
                                   max(row["retainedCount"] for row in rows)],
            "laterAggregateViolationEnvelope": [min(row["laterAggregateViolationRange"][0] for row in rows),
                                                max(row["laterAggregateViolationRange"][1] for row in rows)],
        })
    output = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnLaterLabels": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "existingCandidateCount": len(parameters), "newStoreReferenceGames": games,
        "baselineCandidateIndices": sorted(baseline_set), "summaries": summaries, "cases": results,
        "limitations": [
            "Only the newly acquired store-reference pair constraints are omitted.",
            "The original aggregate-month candidate pool still used these games; this is not independent held-out accuracy.",
            "Every retained tie and store tradeoff remains; later-week scores do not choose candidates.",
            "Missing evidence is simulated, not an assertion that any published label is wrong.",
            "The fixed prior grid and incomplete August observation calendar remain limitations.",
        ],
    }
    (ROOT / "reports/rank-models/store-reference-stability-2026-09-11.json").write_text(
        json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summaries))


if __name__ == "__main__":
    main()
