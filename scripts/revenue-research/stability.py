"""Exhaustive held-out-group and nested-selection diagnostics on exposed data."""
from __future__ import annotations

import argparse
from itertools import combinations
import json
from pathlib import Path

import numpy as np

from simulate import ROOT, read_json, chart_features, group_features, fit_positive


def prepare(panel, registry):
    prepared = {}
    for candidate in registry["candidates"]:
        if candidate["objective"] != "log":
            continue
        chart_matrix = chart_features(panel, registry["curves"][candidate["curve"]]["exponents"],
                                      candidate["normalization"])
        matrix, groups, _ = group_features(chart_matrix, panel["charts"], candidate["groups"])
        prepared[candidate["id"]] = (candidate, matrix, groups)
    return prepared


def stability(panel, registry, sizes):
    y = np.array([game["reference"]["amount"] for game in panel["games"]])
    all_indices = list(range(len(y)))
    prepared = prepare(panel, registry)
    cache = {}

    def fitted(candidate_id, train):
        key = (candidate_id, tuple(train))
        if key not in cache:
            config, matrix, _ = prepared[candidate_id]
            cache[key] = fit_positive(matrix, y, train, config["objective"])
        return cache[key]

    # Populate all single omissions for inner selection once.
    direct = {}
    for candidate_id in prepared:
        direct[candidate_id] = [fitted(candidate_id, [j for j in all_indices if j != i])
                                ["predictions"][i] for i in all_indices]
    nested = []
    for heldout in all_indices:
        train = [i for i in all_indices if i != heldout]
        scores = []
        for candidate_id in prepared:
            errors = []
            for inner in train:
                fit = fitted(candidate_id, [i for i in train if i != inner])
                errors.append(float(np.log(fit["predictions"][inner] / y[inner]) ** 2))
            scores.append({"candidate": candidate_id, "meanSquaredLogError": float(np.mean(errors))})
        scores.sort(key=lambda item: (item["meanSquaredLogError"], item["candidate"]))
        selected = scores[0]["candidate"]
        fit = fitted(selected, train)
        nested.append({"heldoutIndex": heldout, "trainingIndices": train,
                       "selected": selected, "prediction": fit["predictions"][heldout],
                       "innerScores": scores})
    groups_report = {}
    for size in sizes:
        if size < 2 or size >= len(y) - 1:
            raise ValueError("Unsupported held-out group size")
        groups_report[str(size)] = {}
        for candidate_id in prepared:
            cases = []
            for heldout in combinations(all_indices, size):
                train = [i for i in all_indices if i not in heldout]
                fit = fitted(candidate_id, train)
                cases.append({"heldoutIndices": list(heldout),
                              "predictions": [fit["predictions"][i] for i in heldout],
                              "coefficients": fit["coefficients"],
                              "diagnostics": fit["diagnostics"]})
            groups_report[str(size)][candidate_id] = cases
            print(json.dumps({"heldoutSize": size, "candidate": candidate_id,
                              "cases": len(cases)}), flush=True)
    return {"status": "exhaustive_reused_sample_stability", "productionEnabled": False,
            "names": [game["key"] for game in panel["games"]], "targetsMillion": y.tolist(),
            "registry": registry, "singleOmissionPredictions": direct,
            "nestedSelection": nested, "groupOmissions": groups_report,
            "uniqueFits": len(cache),
            "limitations": ["Folds and omission groups overlap; not independent samples.",
                            "Shape priors were already exposed to this month's labels.",
                            "Nested selection does not undo previous human-guided search.",
                            "Omission ranges are sensitivity ranges, not predictive confidence intervals."]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sizes", nargs="+", type=int, default=[2, 3])
    parser.add_argument("--registry", default="scripts/revenue-research/grouping-candidates.json")
    parser.add_argument("--output", default="reports/rank-models/normalized-stability-2026-09-10.json")
    args = parser.parse_args()
    report = stability(read_json("reports/rank-models/normalized-august-panel-2026-09-10.json"),
                       read_json(args.registry), args.sizes)
    (ROOT / args.output).write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": args.output, "uniqueFits": report["uniqueFits"]}), flush=True)
