"""Conditional stationary-curve feasibility and later-order outer bounds.

No power law, game-specific multipliers, positive pseudo-counts or fitted market
growth factors are imposed. The fixed weekly budget is an explicit scenario,
not a claim about Japanese holiday spending.
"""
import argparse
import importlib.util
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint


def load_lp():
    spec = importlib.util.spec_from_file_location("partial_bounds", ROOT / "scripts/revenue-research/partial-bounds.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_model(lp, histograms, weeks, growth_factor, monthly=None, pairs=(), names=()):
    rank_limit = histograms.shape[-1]
    coefficients = 2 * rank_limit
    model = lp.LinearModel(coefficients + 1)
    lp.monotonicity(model, 2, rank_limit)
    model.add(dict.fromkeys(range(coefficients), 1), 1, "eq", "joint_top200_budget_mass")
    baseline_vectors = []
    for w in (2, 3):
        for row in weeks[w]["mappedRows"]:
            growth = row["revenueGrowthPercent"]
            if growth is None or growth <= -100:
                continue
            i = row["gameIndex"]
            current, previous = histograms[w, i].reshape(-1), histograms[w - 1, i].reshape(-1)
            lower, upper = 1 + (growth - .5) / 100, 1 + (growth + .5) / 100
            # Half a percentage point is a stated rounding scenario, not a vendor accuracy bound.
            model.add(lp.sparse(current - upper * growth_factor * previous), 0, "ub",
                      f"growth_upper:{w}:{i}", game=i)
            model.add(lp.sparse(-current + lower / growth_factor * previous), 0, "ub",
                      f"growth_lower:{w}:{i}", game=i)
            positive = lp.sparse(-previous)
            positive[coefficients] = 1
            model.add(positive, 0, "ub", f"minimum_observed_exposure:{w}:{i}", game=i)
            baseline_vectors.append(previous)
    if monthly is not None:
        lookup = {name: i for i, name in enumerate(names)}
        for first, second in pairs:
            model.add(lp.sparse(monthly[lookup[second]].reshape(-1) - monthly[lookup[first]].reshape(-1)),
                      0, "ub", f"monthly_consensus:{first}:{second}")
    return model, baseline_vectors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume-summary")
    args = parser.parse_args()
    report_path = "reports/rank-models/weekly-growth-2026-09-11.json"
    temporal_path = "reports/rank-models/public-weekly-order-2026-09-11.json"
    consensus_path = "reports/rank-models/consensus-japan-2026-09-11.json"
    report, temporal, consensus = map(read_json, (report_path, temporal_path, consensus_path))
    arrays = np.load((ROOT / report_path).with_suffix(".exposure.npz"))
    hist = arrays["histograms"]
    later = np.load((ROOT / temporal_path).with_suffix(".exposure.npz"))["JP"]
    # UTC is retained as a declared comparison clock, not selected for its score.
    future_hist = later[48]
    panel = read_json("reports/rank-models/normalized-august-regional-panel-2026-09-10.json")
    jp_panel = {**panel, "charts": sorted([c for c in panel["charts"] if c["country"] == "JP"],
                                         key=lambda c: c["store"])}
    monthly = rank_histograms(jp_panel)
    names = [game["key"] for game in panel["games"]]
    future = next(row for row in temporal["countries"] if row["geography"] == "JP")
    lp = load_lp()
    scenarios = read_json(args.resume_summary)["scenarios"] if args.resume_summary else []
    checkpoint = ROOT / "reports/rank-models/weekly-partial-bounds-2026-09-11.partial.json"
    for use_consensus in (False, True):
        for factor in (1., 1.1, 1.25, 1.5):
            if any(row["monthlyConsensus"] == use_consensus
                   and row["allowedMultiplicativeGrowthDeviation"] == factor for row in scenarios):
                continue
            model, baseline = build_model(
                lp, hist, report["weeks"], factor, monthly if use_consensus else None,
                consensus["allowedPairs"], names)
            objective = np.zeros(model.variables)
            objective[-1] = -1
            solution = model.solve(objective)
            row = {
                "monthlyConsensus": use_consensus, "allowedMultiplicativeGrowthDeviation": factor,
                "feasibleClosure": bool(solution.success), "solverMessage": solution.message,
                "maximumMinimumObservedExposure": float(solution.x[-1]) if solution.success else None,
                "positiveExposureCertificate": bool(solution.success and solution.x[-1] > 1e-7),
                "laterPairBounds": []
            }
            if solution.success:
                for a, first in enumerate(future["mapped"]):
                    for second in future["mapped"][a + 1:]:
                        vector = np.zeros(model.variables)
                        vector[:-1] = (future_hist[first["index"]] - future_hist[second["index"]]).reshape(-1)
                        bounds = lp.interval(model, vector)
                        if bounds["status"] != "bounded":
                            raise RuntimeError("A unit-mass feasible rank model must yield bounded score differences")
                        lo, hi = bounds["lower"], bounds["upper"]
                        classification = "guaranteed_published_order" if lo > 1e-7 else (
                            "guaranteed_reverse_order" if hi < -1e-7 else "unresolved_or_tie")
                        row["laterPairBounds"].append({
                            "first": first["game"], "second": second["game"],
                            "differenceRange": [lo, hi], "classification": classification
                        })
                row["classificationCounts"] = {
                    key: sum(pair["classification"] == key for pair in row["laterPairBounds"])
                    for key in ("guaranteed_published_order", "guaranteed_reverse_order", "unresolved_or_tie")
                }
            row["solverRecoveries"] = model.solver_recoveries
            scenarios.append(row)
            checkpoint.write_text(json.dumps({
                "schemaVersion": 1, "productionEnabled": False, "status": "partial",
                "scenarios": scenarios
            }, indent=2, allow_nan=False) + "\n", encoding="utf-8")
            print(json.dumps({k: v for k, v in row.items() if k != "laterPairBounds"}), flush=True)
    result = {
        "schemaVersion": 1, "productionEnabled": False, "inputs": [
            input_fingerprint(path) for path in (report_path, temporal_path, consensus_path)],
        "scenarios": scenarios, "laterPeriod": temporal["period"], "reportingUtcOffsetScenario": 0,
        "limitations": [
            "Assumes a stationary rank curve and constant joint weekly TOP200 budget.",
            "Japanese holiday market variation is not known and could invalidate that scenario.",
            "Rounding intervals assume nearest integer percentage points; provider rounding is not verified.",
            "Positive-exposure certificate uses 1e-7 numerical resolution, not a revenue floor.",
            "Pair bounds are outer bounds over the nonnegative feasible closure, allowing vanishing exposures.",
            "Unresolved pairs need not be jointly reversible; counts are not a distribution over rankings.",
            "No later-week rank or money label constrains the LP.",
            "These are mathematical identification bounds, not confidence intervals or empirical forecast accuracy."
        ]
    }
    (ROOT / "reports/rank-models/weekly-partial-bounds-2026-09-11.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
