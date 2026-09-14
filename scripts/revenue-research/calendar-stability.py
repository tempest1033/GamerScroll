"""Exhaustive missing-observation-date sensitivity with bounded-memory profiling."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path

from simulate import ROOT, read_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--block-lengths", type=int, nargs="+", default=[1, 3])
    parser.add_argument("--exponent-step", type=float, default=0.01)
    parser.add_argument("--mixture-step", type=float, default=0.005)
    parser.add_argument("--aggregation", choices=["equal_day_snapshot", "elapsed_day_linear", "elapsed_day_previous"],
                        default="equal_day_snapshot")
    parser.add_argument("--output", default="reports/rank-models/japan-calendar-stability-2026-09-10.json")
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("ordinal_profile", Path(__file__).with_name("ordinal-profile.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    panel = read_json("reports/rank-models/normalized-august-regional-panel-2026-09-10.json")
    date_sets = [set(row["at"][:10] for row in chart["observations"])
                 for chart in panel["charts"] if chart["country"] == "JP"]
    dates = sorted(set.intersection(*date_sets))
    cases = []
    for length in args.block_lengths:
        if length < 1 or length >= len(dates):
            raise ValueError("A missing-date block must leave observed dates")
        for start in range(len(dates) - length + 1):
            block = dates[start:start + length]
            if (datetime.fromisoformat(block[-1]) - datetime.fromisoformat(block[0])).days != length - 1:
                continue
            cases.append(block)
    output = {
        "schemaVersion": 1, "productionEnabled": False, "status": "running",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "JP, August observed dates; monthly reference ranking remains fixed",
        "aggregation": args.aggregation,
        "grid": {"exponentStep": args.exponent_step, "mixtureStep": args.mixture_step},
        "plannedCases": len(cases), "completedCases": 0, "results": [],
        "interpretation": "Data-outage sensitivity, not out-of-time forecast validation or a confidence interval.",
        "limitations": [
            "Published full-month rank labels are unchanged when observations are removed.",
            "Remaining observed dates are reweighted equally; missing days are not reconstructed.",
            "Every declared one-day and contiguous three-day outage is evaluated; no favorable case is selected.",
            "Parameter-set envelopes reflect this numerical grid and cannot establish next-month stability."
        ]
    }
    destination = ROOT / args.output
    temporary = destination.with_suffix(destination.suffix + ".working")

    def checkpoint():
        temporary.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        temporary.replace(destination)

    checkpoint()
    for omitted in cases:
        result = module.profile(panel, args.exponent_step, args.mixture_step, omitted, progress=False,
                                aggregation=args.aggregation)
        output["results"].append({key: result[key] for key in [
            "excludedObservationDates", "minimumPairViolations", "comparedPairs", "coOptimalSet",
            "coOptimalParameterExamples", "parameterExamplesTruncated", "folds", "unusedMoneyConsistency"
        ]})
        output["completedCases"] += 1
        checkpoint()
        print(json.dumps({"completed": output["completedCases"], "planned": output["plannedCases"],
                          "omitted": omitted, "pairViolations": result["minimumPairViolations"],
                          "parameterSet": result["coOptimalSet"]}), flush=True)
    output["status"] = "completed"
    output["completedAt"] = datetime.now(timezone.utc).isoformat()
    checkpoint()
    print(json.dumps({"output": args.output, "completedCases": len(cases)}), flush=True)


if __name__ == "__main__":
    main()
