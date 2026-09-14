"""Locate conflicting weekly evidence without turning deletions into fitted models."""
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint
from weekly_partial_bounds import load_lp, build_model


def restrict(lp, model, keep):
    result = lp.LinearModel(model.variables)
    result.constraints = [row for row in model.constraints if keep(row)]
    return result


def feasible(model):
    solution = model.solve(np.zeros(model.variables))
    if solution.status == 3:
        raise RuntimeError("A zero objective cannot be unbounded")
    return bool(solution.success)


def irreducible_groups(lp, model, groups):
    """Deletion filter: an irreducible conflict, not a minimum-cardinality conflict."""
    active = set(groups)
    if feasible(model):
        return []
    for group in groups:
        candidate = active - {group}
        reduced = restrict(lp, model, lambda row: row["game"] is None or row["game"] in candidate)
        if not feasible(reduced):
            active = candidate
    return sorted(active)


def main():
    paths = [
        "reports/rank-models/weekly-growth-2026-09-11.json",
        "reports/rank-models/consensus-japan-2026-09-11.json",
        "reports/rank-models/normalized-august-regional-panel-2026-09-10.json",
    ]
    weekly, consensus, panel = map(read_json, paths)
    hist = np.load((ROOT / paths[0]).with_suffix(".exposure.npz"))["histograms"]
    names = [game["key"] for game in panel["games"]]
    jp = {**panel, "charts": sorted([c for c in panel["charts"] if c["country"] == "JP"],
                                    key=lambda c: c["store"])}
    monthly = rank_histograms(jp)
    lp = load_lp()
    output = []
    for factor, use_monthly in ((1., False), (1.25, False), (1.5, True)):
        model, _ = build_model(lp, hist, weekly["weeks"], factor,
                               monthly if use_monthly else None, consensus["allowedPairs"], names)
        groups = sorted({row["game"] for row in model.constraints if row["game"] is not None})
        removal = []
        for group in groups:
            reduced = restrict(lp, model, lambda row: row["game"] != group)
            removal.append({"game": names[group], "feasibleWithoutWeeklyEvidence": feasible(reduced)})
        conflicts = irreducible_groups(lp, model, groups)
        periods = []
        for w in (2, 3):
            prefixes = tuple(f"{kind}:{w}:" for kind in
                             ("growth_upper", "growth_lower", "minimum_observed_exposure"))
            reduced = restrict(lp, model, lambda row: not row["name"].startswith(prefixes))
            periods.append({"removedPeriod": weekly["weeks"][w]["period"],
                            "feasibleWithoutPeriod": feasible(reduced)})
        row = {
            "growthDeviationFactor": factor, "monthlyConsensus": use_monthly,
            "singleGameRemovals": removal, "singlePeriodRemovals": periods,
            "irreducibleWeeklyGameConflict": [names[i] for i in conflicts],
            "conflictEvidence": [
                {"period": weekly["weeks"][w]["period"], "game": r["game"],
                 "revenueGrowthPercent": r["revenueGrowthPercent"]}
                for w in (2, 3) for r in weekly["weeks"][w]["mappedRows"]
                if r["gameIndex"] in conflicts and r["revenueGrowthPercent"] is not None
            ],
        }
        output.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
    result = {
        "schemaVersion": 1, "productionEnabled": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "scenarios": output,
        "limitations": [
            "A conflict rejects this conditional fixed-budget, stationary monotone-curve system only.",
            "Published vendor growth is not audited developer revenue.",
            "Game removal excludes weekly growth and exposure constraints, not monthly order labels.",
            "The deterministic deletion order can choose one of several irreducible conflicts.",
            "No evidence is removed from the source ledger or from an adopted model.",
            "No later-period label or revenue point is used to choose a curve.",
        ],
    }
    (ROOT / "reports/rank-models/weekly-conflicts-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
