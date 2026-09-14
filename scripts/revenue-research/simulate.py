"""Reproducible experimental fitting with standard SciPy solvers.

Produces predictions and diagnostics; shared JS metrics own final evaluation.
No production model, ledger, or archived ranking is modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import platform
import sys

import numpy as np
import scipy
from scipy.optimize import least_squares, nnls
from scipy.special import logsumexp

ROOT = Path(__file__).resolve().parents[2]


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8-sig"))


def snapshot_weights(observations, aggregation):
    if aggregation == "equal_day_snapshot":
        return np.full(len(observations), 1 / len(observations))
    minutes = np.array([int(row["at"][11:13]) * 60 + int(row["at"][14:16]) for row in observations])
    intervals = np.diff(minutes)
    if len(intervals) == 0 or np.any(intervals <= 0):
        raise ValueError("Elapsed-time aggregation needs at least two strictly ordered observations per day")
    weights = np.zeros(len(observations))
    if aggregation == "elapsed_day_linear":
        weights[:-1] += intervals / 2
        weights[1:] += intervals / 2
    elif aggregation == "elapsed_day_previous":
        weights[:-1] += intervals
    else:
        raise ValueError(f"Unknown aggregation: {aggregation}")
    return weights / intervals.sum()


def rank_histograms(panel, aggregation="equal_day_snapshot", date_start=None, date_end=None):
    """Unweighted market exposure; absent observations do not become revenue values."""
    result = np.zeros((len(panel["games"]), len(panel["charts"]), panel["rankLimit"]))
    for k, chart in enumerate(panel["charts"]):
        days = {}
        for observation in chart["observations"]:
            if date_start and observation["at"][:10] < date_start:
                continue
            if date_end and observation["at"][:10] > date_end:
                continue
            days.setdefault(observation["at"][:10], []).append(observation)
        if not days:
            raise ValueError(f"No observations for {chart['key']} in requested date interval")
        for observations in days.values():
            time_weights = snapshot_weights(observations, aggregation)
            for observation, time_weight in zip(observations, time_weights):
                weight = time_weight / len(days)
                for i, ranks in enumerate(observation["gameRanks"]):
                    for rank in ranks:
                        result[i, k, rank - 1] += weight
    return result


def chart_features(panel, exponents, normalization, aggregation="equal_day_snapshot",
                   date_start=None, date_end=None, histograms=None):
    """Apply a declared curve to exposures, keeping market budgets separate."""
    if any(not np.isfinite(exponents[key]) or exponents[key] < 0 for key in ("ios", "aos", "cn")):
        raise ValueError("Rank exponents must be finite and nonnegative")
    histograms = rank_histograms(panel, aggregation, date_start, date_end) if histograms is None else histograms
    rank_values = np.arange(1, panel["rankLimit"] + 1, dtype=float)
    curves = []
    for chart in panel["charts"]:
        curve_key = "cn" if chart["country"] == "CN" else (
            "aos" if chart["store"] == "google_play" else "ios")
        values = rank_values ** -exponents[curve_key]
        if normalization == "top200_conditional":
            values /= values.sum()
        elif normalization != "raw":
            raise ValueError(f"Unknown normalization: {normalization}")
        curves.append(values * chart["annualMarketProxyUsd"] / 1e9)
    return np.einsum("gcr,cr->gc", histograms, np.array(curves))


def group_features(chart_matrix, charts, grouping):
    if grouping == "one":
        names = ["all"]
        membership = np.zeros(len(charts), dtype=int)
    elif grouping == "cn_jp_rest":
        names = ["CN", "JP", "rest"]
        membership = np.array([names.index(chart["country"]) if chart["country"] in names[:2]
                               else 2 for chart in charts])
    elif grouping in ("cn_jp_rest_stores", "country_store_groups"):
        labels = []
        for chart in charts:
            if chart["country"] == "CN":
                labels.append("CN")
            elif chart["country"] == "JP" and grouping == "cn_jp_rest_stores":
                labels.append("JP")
            else:
                region = "JP" if chart["country"] == "JP" else "rest"
                labels.append(f"{region}:{chart['store']}")
        names = sorted(set(labels))
        membership = np.array([names.index(label) for label in labels])
    else:
        raise ValueError(f"Unknown grouping: {grouping}")
    grouped = np.column_stack([chart_matrix[:, membership == i].sum(axis=1)
                               for i in range(len(names))])
    return grouped, names, membership


def fit_positive(matrix, targets, train, objective):
    """All labels and normalization statistics are restricted to train."""
    train = np.asarray(train, dtype=int)
    if len(set(train.tolist())) != len(train) or len(train) < 2:
        raise ValueError("Training indices must be unique and nontrivial")
    a, y = matrix[train], targets[train]
    if not np.all(np.isfinite(a)) or np.any(a < 0) or np.any(a.sum(axis=1) <= 0):
        raise ValueError("Training features must be finite, nonnegative, and nonempty")
    if not np.all(np.isfinite(y)) or np.any(y <= 0):
        raise ValueError("Training labels must be finite and positive")
    norms = np.sqrt(np.mean(a ** 2, axis=0))
    active = norms > 0
    if not np.all(active):
        raise ValueError("A regional coefficient is unidentified in this training fold")
    scaled = a / norms
    if objective == "dollar":
        coefficients, residual_norm = nnls(scaled, y, maxiter=1000)
        coefficients = coefficients / norms
        predictions = matrix @ coefficients
        diagnostics = {"solver": "scipy.optimize.nnls", "success": True,
                       "trainingResidualNorm": float(residual_norm),
                       "zeroCoefficients": int(np.count_nonzero(coefficients == 0))}
    elif objective == "log":
        log_a = np.full(scaled.shape, -np.inf)
        np.log(scaled, out=log_a, where=scaled > 0)
        log_y = np.log(y)

        def residual(beta):
            return logsumexp(log_a + beta, axis=1) - log_y

        def jacobian(beta):
            terms = log_a + beta
            return np.exp(terms - logsumexp(terms, axis=1)[:, None])

        # Label-derived starts are training-only: common scale and positive NNLS.
        common = float(np.mean(log_y - np.log(scaled.sum(axis=1))))
        starts = [np.full(scaled.shape[1], common)]
        linear, _ = nnls(scaled, y, maxiter=1000)
        if np.all(linear > 0):
            starts.append(np.log(linear))
        solutions = [least_squares(residual, start, jac=jacobian, method="trf",
                                   x_scale="jac", ftol=1e-10, xtol=1e-10, gtol=1e-10,
                                   max_nfev=2000) for start in starts]
        if any(not solution.success for solution in solutions):
            raise RuntimeError("Log least-squares did not converge for all required starts")
        solution = min(solutions, key=lambda item: item.cost)
        coefficients = np.exp(solution.x) / norms
        predictions = matrix @ coefficients
        singular = np.linalg.svd(solution.jac, compute_uv=False)
        diagnostics = {"solver": "scipy.optimize.least_squares", "success": True,
                       "termination": int(solution.status), "message": solution.message,
                       "evaluations": int(solution.nfev), "optimality": float(solution.optimality),
                       "startCosts": [float(s.cost) for s in solutions],
                       "jacobianSingularValues": singular.tolist(),
                       "jacobianCondition": float(singular[0] / singular[-1])
                       if singular[-1] > 0 else None}
    else:
        raise ValueError(f"Unknown objective: {objective}")
    if not np.all(np.isfinite(predictions)) or np.any(predictions <= 0):
        raise ValueError("Prediction is not finite and positive")
    return {"predictions": predictions.tolist(), "coefficients": coefficients.tolist(),
            "trainingIndices": train.tolist(), "diagnostics": diagnostics}


def run(panel, registry):
    if panel.get("observationOnly") or any(
        not game.get("reference")
        or game["reference"]["period"]["start"] != panel["period"]["start"]
        or game["reference"]["period"]["end"] != panel["period"]["end"]
        for game in panel["games"]
    ):
        raise ValueError("Fitting requires monetary labels aligned to the panel period; identity-only panels are prediction inputs.")
    targets = np.array([game["reference"]["amount"] for game in panel["games"]])
    indices = list(range(len(targets)))
    feature_cache = {}
    histograms = rank_histograms(panel, registry.get("aggregation", "equal_day_snapshot"))
    results = []
    for candidate in registry["candidates"]:
        key = (candidate["curve"], candidate["normalization"])
        if key not in feature_cache:
            feature_cache[key] = chart_features(
                panel, registry["curves"][candidate["curve"]]["exponents"], candidate["normalization"],
                registry.get("aggregation", "equal_day_snapshot"), histograms=histograms)
        chart_matrix = feature_cache[key]
        matrix, groups, membership = group_features(chart_matrix, panel["charts"], candidate["groups"])
        fitted = fit_positive(matrix, targets, indices, candidate["objective"])
        folds = []
        for heldout in indices:
            training = [index for index in indices if index != heldout]
            fold = fit_positive(matrix, targets, training, candidate["objective"])
            folds.append({"heldoutIndex": heldout, "prediction": fold["predictions"][heldout],
                          "coefficients": fold["coefficients"], "diagnostics": fold["diagnostics"],
                          "trainingIndices": training})
        coefficients = np.asarray(fitted["coefficients"])
        regional = []
        for anchor in panel["regionalAnchors"]:
            i = next(index for index, game in enumerate(panel["games"]) if game["key"] == anchor["game_key"])
            matching = [k for k, chart in enumerate(panel["charts"])
                        if chart["country"] == anchor["geography"] and chart["store"] in anchor["stores"]]
            prediction = sum(chart_matrix[i, k] * coefficients[membership[k]] for k in matching)
            regional.append({"anchorId": anchor["id"], "game": anchor["game_key"],
                             "geography": anchor["geography"], "reference": anchor["amount_usd_m"],
                             "prediction": float(prediction),
                             "interpretation": "scope-limited consistency check; not independent validation"})
        results.append({"config": candidate, "groupNames": groups, "fitted": fitted,
                        "folds": folds, "regionalConsistency": regional})
        print(json.dumps({"candidate": candidate["id"], "completedFolds": len(folds)}), flush=True)
    return {"schemaVersion": 1, "status": "same_sample_diagnostic", "productionEnabled": False,
            "runtime": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__},
            "names": [game["key"] for game in panel["games"]], "targetsMillion": targets.tolist(),
            "aggregation": registry.get("aggregation", "equal_day_snapshot"),
            "absentGameMeaning": "No observed contribution, not zero revenue.",
            "registry": registry, "results": results}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--panel", default="reports/rank-models/normalized-august-panel-2026-09-10.json")
    parser.add_argument("--registry", default="scripts/revenue-research/candidates.json")
    parser.add_argument("--output", default="reports/rank-models/normalized-simulation-2026-09-10.json")
    args = parser.parse_args()
    report = run(read_json(args.panel), read_json(args.registry))
    report["inputs"] = [{"path": relative, "sha256": hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()}
                        for relative in [args.panel, args.registry]]
    output = ROOT / args.output
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "candidates": len(report["results"])}), flush=True)


if __name__ == "__main__":
    main()
