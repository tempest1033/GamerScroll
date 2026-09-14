"""Evaluate predeclared sampling policies, not calendar-event revenue multipliers."""
import json
from copy import deepcopy
from simulate import ROOT, read_json, run


def main():
    panel = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    registry = read_json("scripts/revenue-research/grouping-candidates.json")
    registry["candidates"] = [candidate for candidate in registry["candidates"]
                              if candidate["id"] in ("normalized_four_groups", "normalized_five_groups")]
    reports = []
    for aggregation in ("elapsed_day_linear", "elapsed_day_previous"):
        experiment = deepcopy(registry)
        experiment["aggregation"] = aggregation
        experiment["purpose"] = "Sampling-policy sensitivity; no monthly/event multiplier is fitted."
        report = run(panel, experiment)
        reports.append(report)
    coverage = []
    for chart in panel["charts"]:
        days = {}
        for observation in chart["observations"]:
            days.setdefault(observation["at"][:10], []).append(observation["at"][11:16])
        coverage.append({"chart": chart["key"], "days": [
            {"date": date, "firstBucket": times[0], "lastBucket": times[-1], "observations": len(times)}
            for date, times in days.items()]})
    output = {"schemaVersion": 1, "productionEnabled": False, "status": "sampling_policy_sensitivity",
              "experiments": reports, "coverage": coverage,
              "limitations": [
                  "Elapsed averages cover first-to-last observation within each observed date only.",
                  "Equal weighting of observed dates does not restore missing August 1.",
                  "Linear interpolation is an assumption about chart-score evolution, not a measured revenue trajectory.",
                  "Previous-value integration is a comparator, not a claim that the store held its rank unchanged.",
                  "Thirty-minute timestamp buckets are not precise fetch or store-update times."
              ]}
    target = ROOT / "reports/rank-models/temporal-sampling-2026-09-10.json"
    target.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(target)}))


if __name__ == "__main__":
    main()
