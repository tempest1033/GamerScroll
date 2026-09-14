"""Recover the omitted consensus parameter set and propagate it without selecting on later labels."""
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint
from consensus_japan import load_ordinal
from weekly_growth import curve_scores


def main():
    source_path = "reports/rank-models/consensus-japan-2026-09-11.json"
    temporal_path = "reports/rank-models/public-weekly-order-2026-09-11.json"
    profile = read_json(source_path)
    temporal = read_json(temporal_path)
    panel = read_json("reports/rank-models/normalized-august-regional-panel-2026-09-10.json")
    jp = {**panel, "charts": sorted([c for c in panel["charts"] if c["country"] == "JP"],
                                   key=lambda c: c["store"])}
    histogram = rank_histograms(jp)
    indices = [next(i for i, game in enumerate(panel["games"]) if game["key"] == name)
               for name in profile["names"]]
    name_index = {name: i for i, name in enumerate(profile["names"])}
    left = np.array([name_index[a] for a, _ in profile["allowedPairs"]])
    right = np.array([name_index[b] for _, b in profile["allowedPairs"]])
    ordinal = load_ordinal()
    bounds = profile["coOptimalSet"]
    def subset(values, limits):
        return np.array([v for v in values if limits[0] - 1e-12 <= v <= limits[1] + 1e-12])
    ios_values = subset(profile["grid"]["exponents"], bounds["iosExponentRange"])
    google_values = subset(profile["grid"]["exponents"], bounds["googlePlayExponentRange"])
    mixtures = subset(profile["grid"]["iosTop200BudgetMixtures"], bounds["iosTop200BudgetMixtureRange"])
    parameters = []
    for ios in ios_values:
        for google in google_values:
            scores = np.array([curve_scores(histogram, ios, google, mix)[indices] for mix in mixtures])
            losses = ordinal.pair_losses(scores, left, right).sum(axis=1) / 2
            parameters.extend([[float(ios), float(google), float(mix)]
                               for mix, loss in zip(mixtures, losses) if loss == profile["minimumPairViolations"]])
    if len(parameters) != bounds["size"]:
        raise ValueError("Recovered parameter count differs from the preserved profile")
    future = next(row for row in temporal["countries"] if row["geography"] == "JP")
    future_indices = [row["index"] for row in future["mapped"]]
    future_left, future_right = np.triu_indices(len(future_indices), 1)
    arrays = np.load((ROOT / temporal_path).with_suffix(".exposure.npz"))
    clocks = arrays["JP"]
    scenarios = []
    parameter_min = np.full(len(parameters), np.inf)
    parameter_max = np.full(len(parameters), -np.inf)
    for i, hist in enumerate(clocks):
        scores = np.array([curve_scores(hist, *parameter)[future_indices] for parameter in parameters])
        losses = ordinal.pair_losses(scores, future_left, future_right).sum(axis=1) / 2
        parameter_min = np.minimum(parameter_min, losses)
        parameter_max = np.maximum(parameter_max, losses)
        scenarios.append({"utcOffsetHours": float(-12 + .25 * i),
                          "violationRange": [float(losses.min()), float(losses.max())]})
    result = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnLaterLabels": False,
        "inputs": [input_fingerprint(source_path), input_fingerprint(temporal_path)],
        "recoveredParameters": parameters, "count": len(parameters),
        "laterPeriod": temporal["period"], "laterPairCount": len(future_left),
        "clockScenarios": scenarios,
        "perParameterViolationRanges": np.column_stack((parameter_min, parameter_max)).tolist(),
        "overallViolationRange": [float(parameter_min.min()), float(parameter_max.max())],
        "limitations": [
            "Recovering all archived co-optima is not another model selection round.",
            "Only the known co-optimal envelope is enumerated; the original global minimum is not refit.",
            "Provider-consensus constraints are weaker; reduced training violations do not imply improved prediction.",
            "Ranges include all recovered parameter choices, without picking the best later-week score.",
            "No monetary values, confidence levels or whole-store shares are inferred."
        ]
    }
    (ROOT / "reports/rank-models/consensus-transfer-2026-09-11.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(parameters), "laterPairCount": len(future_left),
                      "overallViolationRange": result["overallViolationRange"]}), flush=True)


if __name__ == "__main__":
    main()
