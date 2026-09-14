"""Retain all non-dominated archived candidates using new store labels only."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint


def nondominated(values):
    """Keep ties; discard only a point weakly worse on every axis and worse on one."""
    values = np.asarray(values, dtype=float)
    if values.ndim != 2 or not np.all(np.isfinite(values)):
        raise ValueError("A finite two-dimensional loss matrix is required")
    unique = np.unique(values, axis=0)
    keep = [not np.any(np.all(unique <= row, axis=1) & np.any(unique < row, axis=1))
            for row in unique]
    frontier = unique[np.asarray(keep)]
    return np.any(np.all(values[:, None, :] == frontier[None, :, :], axis=2), axis=1)


def main():
    source_path = "reports/rank-models/frozen-japan-store-validation-2026-09-11.json"
    transfer_path = "reports/rank-models/consensus-transfer-2026-09-11.json"
    source, transfer = map(read_json, (source_path, transfer_path))
    losses = np.column_stack([
        next(c["perCandidateViolations"] for c in row["comparisons"]
             if c["model"] == "provider_consensus_2466")
        for row in source["results"]])
    keep = nondominated(losses)
    indices = np.flatnonzero(keep)
    future = np.asarray(transfer["perParameterViolationRanges"])
    if len(transfer["recoveredParameters"]) != len(losses):
        raise ValueError("Archived candidate alignment changed")
    parameters = np.asarray(transfer["recoveredParameters"])
    result = {
        "schemaVersion": 1, "productionEnabled": False,
        "selectedOnNewAugustStoreLabels": True, "selectedOnLaterPeriodLabels": False,
        "inputs": [input_fingerprint(path) for path in (source_path, transfer_path)],
        "originalCandidateCount": len(losses), "retainedCandidateCount": len(indices),
        "retainedOriginalIndices": indices.tolist(),
        "storeAxes": [row["store"] for row in source["results"]],
        "paretoLossVectors": np.unique(losses[keep], axis=0).tolist(),
        "retainedParameterRanges": np.column_stack((parameters[keep].min(axis=0),
                                                   parameters[keep].max(axis=0))).tolist(),
        "laterPairCount": transfer["laterPairCount"], "laterPeriod": transfer["laterPeriod"],
        "laterViolationRangeAcrossAllRetainedCandidatesAndClocks": [
            float(future[keep, 0].min()), float(future[keep, 1].max())],
        "perRetainedLaterViolationRanges": future[keep].tolist(),
        "limitations": [
            "This filters a previously explored finite candidate set; it is not a global optimum search.",
            "Pareto dominance adds no arbitrary weights between iPhone and Google Play losses.",
            "All non-dominated ties are retained; the best later-period candidate is not chosen.",
            "August store labels are training information for this filter, not monetary validation.",
            "Later-week labels were already inspected in the research session; no untouched forecast claim.",
            "No monetary scale, cross-store whole-market share or production model is selected."
        ],
    }
    (ROOT / "reports/rank-models/japan-store-pareto-2026-09-11.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in (
        "retainedOriginalIndices", "perRetainedLaterViolationRanges", "inputs", "limitations")}))


if __name__ == "__main__":
    main()
