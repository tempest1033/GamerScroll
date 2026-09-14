"""Hyperparameter-free convex loss comparators; reuse prior log-loss fits."""
import json
import numpy as np
from scipy.optimize import linprog, nnls

from simulate import ROOT, read_json, chart_features, group_features, rank_histograms


def fit_convex(matrix, targets, train, objective):
    train = np.array(train, dtype=int)
    scaled = matrix[train] / targets[train, None]
    if objective == "relative_least_squares":
        coefficients, residual = nnls(scaled, np.ones(len(train)), maxiter=1000)
        diagnostics = {"solver": "scipy.optimize.nnls", "objective": objective,
                       "success": True, "relativeResidualNorm": float(residual)}
    elif objective == "minimax_relative":
        columns = scaled.shape[1]
        a = np.vstack((np.column_stack((scaled, -np.ones(len(train)))),
                       np.column_stack((-scaled, -np.ones(len(train))))))
        b = np.concatenate((np.ones(len(train)), -np.ones(len(train))))
        cost = np.zeros(columns + 1)
        cost[-1] = 1
        solution = linprog(cost, A_ub=a, b_ub=b, bounds=(0, None), method="highs")
        if not solution.success:
            raise RuntimeError(f"Minimax fit failed: {solution.message}")
        coefficients = solution.x[:-1]
        diagnostics = {"solver": "scipy.optimize.linprog:highs", "objective": objective,
                       "success": True, "minimumWorstTrainingRelativeError": float(solution.fun)}
    else:
        raise ValueError("Unknown convex objective")
    predictions = matrix @ coefficients
    if not np.all(np.isfinite(predictions)) or np.any(predictions <= 0):
        raise ValueError("Convex comparator produced an unestimable nonpositive prediction")
    return {"predictions": predictions.tolist(), "coefficients": coefficients.tolist(),
            "trainingIndices": train.tolist(), "diagnostics": diagnostics}


def main():
    panel = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    previous = read_json("reports/rank-models/normalized-grouping-simulation-2026-09-10.json")
    previous_omissions = read_json("reports/rank-models/normalized-stability-2026-09-10.json")
    base_ids = ("normalized_four_groups", "normalized_five_groups")
    bases = [row for row in previous["results"] if row["config"]["id"] in base_ids]
    y = np.array(previous["targetsMillion"])
    indices = list(range(len(y)))
    histogram = rank_histograms(panel)
    cache, matrices, configs, groups = {}, {}, {}, {}
    for base in bases:
        config = base["config"]
        base_id = config["id"]
        feature = chart_features(panel, previous["registry"]["curves"][config["curve"]]["exponents"],
                                 config["normalization"], histograms=histogram)
        matrix, group_names, _ = group_features(feature, panel["charts"], config["groups"])
        configs[base_id] = config
        matrices[base_id], groups[base_id] = matrix, group_names
        cache[(base_id, tuple(indices))] = base["fitted"]
        for fold in base["folds"]:
            train = tuple(fold["trainingIndices"])
            cache[(base_id, train)] = {"coefficients": fold["coefficients"],
                                      "predictions": (matrix @ np.array(fold["coefficients"])).tolist(),
                                      "trainingIndices": list(train), "diagnostics": fold["diagnostics"]}
        for fold in previous_omissions["groupOmissions"]["2"][base_id]:
            train = tuple(i for i in indices if i not in fold["heldoutIndices"])
            cache[(base_id, train)] = {"coefficients": fold["coefficients"],
                                      "predictions": (matrix @ np.array(fold["coefficients"])).tolist(),
                                      "trainingIndices": list(train), "diagnostics": fold["diagnostics"]}
        for objective in ("relative_least_squares", "minimax_relative"):
            candidate_id = f"{base_id}:{objective}"
            configs[candidate_id] = {**config, "id": candidate_id, "objective": objective}
            matrices[candidate_id], groups[candidate_id] = matrix, group_names

    def fitted(candidate_id, train):
        key = (candidate_id, tuple(train))
        if key not in cache:
            cache[key] = fit_convex(matrices[candidate_id], y, train, configs[candidate_id]["objective"])
        return cache[key]

    results = []
    for candidate_id, config in configs.items():
        full = fitted(candidate_id, indices)
        folds = []
        for heldout in indices:
            train = [i for i in indices if i != heldout]
            fit = fitted(candidate_id, train)
            folds.append({"heldoutIndex": heldout, "prediction": fit["predictions"][heldout],
                          "trainingIndices": train, "coefficients": fit["coefficients"],
                          "diagnostics": fit["diagnostics"]})
        # Same schema as standard simulation reports; regional checks are not new labels here.
        results.append({"config": config, "groupNames": groups[candidate_id], "fitted": full,
                        "folds": folds, "regionalConsistency": []})
    nested = []
    for heldout in indices:
        train = [i for i in indices if i != heldout]
        scores = []
        for candidate_id in configs:
            errors = []
            for inner in train:
                fit = fitted(candidate_id, [i for i in train if i != inner])
                errors.append(np.log(fit["predictions"][inner] / y[inner]) ** 2)
            scores.append({"candidate": candidate_id, "meanSquaredLogError": float(np.mean(errors))})
        scores.sort(key=lambda row: (row["meanSquaredLogError"], row["candidate"]))
        selected = scores[0]["candidate"]
        nested.append({"heldoutIndex": heldout, "trainingIndices": train, "selected": selected,
                       "prediction": fitted(selected, train)["predictions"][heldout], "innerScores": scores})
    result = {
        "schemaVersion": 1, "productionEnabled": False, "status": "convex_loss_diagnostic",
        "names": previous["names"], "targetsMillion": y.tolist(),
        "registry": {"primaryMetric": "rmsLogError",
                     "purpose": "Relative least squares and minimax relative loss, no Huber threshold or ridge coefficient.",
                     "candidates": list(configs.values())},
        "results": results, "nestedSelection": nested,
        "inputs": previous["inputs"], "runtime": previous["runtime"],
        "limitations": [
            "Fixed curve shapes were previously selected using the same August labels.",
            "Log-loss fits for identical training sets are reused, not rerun.",
            "Minimax solutions need not uniquely identify individual market coefficients.",
            "Alternative loss functions do not repair geographic coverage or validate market budgets.",
            "No new objective is automatically adopted because its retrospective error is lower."
        ]
    }
    target = ROOT / "reports/rank-models/convex-objective-simulation-2026-09-10.json"
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(target), "candidates": len(results), "cachedFits": len(cache)}), flush=True)


if __name__ == "__main__":
    main()
