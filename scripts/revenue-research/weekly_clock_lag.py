"""Propagate reporting-clock and hypothetical store-rank lag uncertainty.

No clock or lag is selected using reference labels. Equivalent windows are
integrated only once. This tests conditional compatibility, not forecast skill.
"""
import argparse
import json
from datetime import datetime, timezone
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint
from weekly_growth import PANEL, weekly_histograms, curve_scores, evaluate
from weekly_partial_bounds import load_lp, build_model


def scenarios():
    return [{"reportingUtcOffsetHours": float(offset / 4), "hypotheticalRankLagHours": lag,
             "effectiveWindowOffsetHours": float(offset / 4 - lag)}
            for lag in (0, 24, 48) for offset in range(-48, 57)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    paths = [PANEL, "reports/rank-models/weekly-growth-2026-09-11.json",
             "reports/rank-models/consensus-japan-2026-09-11.json",
             "reports/rank-models/normalized-august-regional-panel-2026-09-10.json"]
    panel, weekly, consensus, monthly_panel = map(read_json, paths)
    monthly = rank_histograms({
        **monthly_panel,
        "charts": sorted([c for c in monthly_panel["charts"] if c["country"] == "JP"],
                         key=lambda c: c["store"])})
    names = [game["key"] for game in monthly_panel["games"]]
    if names != [game["key"] for game in panel["games"]]:
        raise ValueError("Monthly and weekly game orders must agree")
    models = [row["model"] for row in weekly["results"]]
    specifications = scenarios()
    offsets = sorted({row["effectiveWindowOffsetHours"] for row in specifications})
    target = ROOT / "reports/rank-models/weekly-clock-lag-2026-09-11.json"
    checkpoint = target.with_suffix(".partial.json")
    inputs = [input_fingerprint(path) for path in paths]
    completed = {}
    result = None
    if args.resume:
        old = json.loads(checkpoint.read_text(encoding="utf-8"))
        if old["inputs"] != inputs:
            raise ValueError("Checkpoint input fingerprints changed")
        result = old
        completed = {str(row["effectiveWindowOffsetHours"]): row for row in old["windows"]}
    if "9.0" not in completed:
        preserved = read_json("reports/rank-models/weekly-partial-bounds-2026-09-11.json")
        completed["9.0"] = {
            "effectiveWindowOffsetHours": 9.0, "reusedPriorResults": True,
            "coverage": weekly["coverage"],
            "frozenCandidates": [{"id": row["model"]["id"], "weeks": [
                {key: value for key, value in week.items() if key != "growth"}
                for week in row["weeks"]]} for row in weekly["results"]],
            "conditionalFeasibility": [
                {"growthDeviationFactor": row["allowedMultiplicativeGrowthDeviation"],
                 **{key: row[key] for key in ("monthlyConsensus", "feasibleClosure",
                                             "maximumMinimumObservedExposure", "solverRecoveries")}}
                for row in preserved["scenarios"]
                if (row["allowedMultiplicativeGrowthDeviation"], row["monthlyConsensus"])
                in ((1., False), (1.25, False), (1.5, True))],
        }
    lp = load_lp()
    for offset in offsets:
        if str(offset) in completed:
            continue
        _, exposures = weekly_histograms(panel, weekly["weeks"], 0, window_shift_hours=-offset)
        hist = np.array([row["histogram"] if row["histogram"] is not None else
                         np.zeros((len(names), 2, panel["rankLimit"])) for row in exposures])
        candidates = []
        for model in models:
            scores = [curve_scores(row["histogram"], model["ios"], model["google"], model["mixture"])
                      if row["histogram"] is not None else None for row in exposures]
            metrics = evaluate(scores, weekly["weeks"], exposures)
            candidates.append({"id": model["id"], "weeks": [
                {key: value for key, value in week.items() if key != "growth"} for week in metrics]})
        feasibility = []
        if all(exposures[w]["histogram"] is not None for w in (1, 2, 3)):
            for factor, use_monthly in ((1., False), (1.25, False), (1.5, True)):
                model, _ = build_model(lp, hist, weekly["weeks"], factor,
                                       monthly if use_monthly else None,
                                       consensus["allowedPairs"], names)
                objective = np.zeros(model.variables)
                objective[-1] = -1
                solution = model.solve(objective)
                if solution.status == 3:
                    raise RuntimeError("Unit rank budget cannot yield unbounded exposure")
                feasibility.append({
                    "growthDeviationFactor": factor, "monthlyConsensus": use_monthly,
                    "feasibleClosure": bool(solution.success),
                    "maximumMinimumObservedExposure": float(solution.x[-1]) if solution.success else None,
                    "solverRecoveries": model.solver_recoveries})
        row = {"effectiveWindowOffsetHours": offset,
               "coverage": [row["coverage"] for row in exposures],
               "frozenCandidates": candidates, "conditionalFeasibility": feasibility}
        completed[str(offset)] = row
        result = {
            "schemaVersion": 1, "productionEnabled": False, "status": "partial",
            "inputs": inputs, "windowDefinitions": specifications,
            "windows": list(completed.values()),
            "updatedAtUtc": datetime.now(timezone.utc).isoformat(),
            "limitations": [
                "Lag values are sensitivity scenarios, not verified Apple or Google latency.",
                "Positive lag matches revenue to later observed ranks; it is not actionable future prediction.",
                "Reporting clocks and lags are not selected using money, growth or order labels.",
                "Equivalent integration windows are evaluated once and linked to all matching scenarios.",
                "Weekly references overlap prior August model selection; later-week order was already seen.",
                "A feasible curve only satisfies conditional constraints; it is not an adopted model.",
                "All nonappearance and fixed weekly budget caveats of weekly-growth still apply.",
            ],
        }
        checkpoint.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        print(json.dumps({"completed": len(completed), "total": len(offsets),
                          "offset": offset, "feasibility": feasibility}), flush=True)
    if result is None:
        raise RuntimeError("No completed or resumed window result exists")
    result["status"] = "complete"
    target.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
