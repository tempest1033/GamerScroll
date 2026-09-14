"""Unused holiday-money consistency of every retained ordinal grid optimum."""
import json
from simulate import ROOT, read_json, rank_histograms, chart_features
import numpy as np


def main():
    original = read_json("reports/rank-models/normalized-august-regional-panel-2026-09-10.json")
    profile = read_json("reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json")
    evidence = read_json("docs/research/same-month-market-evidence-2026-09-10.json")
    source_id = "sensor_tower_japan_holiday"
    source = evidence["sources"][source_id]
    reference = next(row for row in evidence["subperiodAmounts"]
                     if row["source"] == source_id and row.get("game") == "Fate/Grand Order")
    period = source["period"]
    if profile["parameterExamplesTruncated"]:
        raise ValueError("Money envelopes require the complete co-optimal set, not truncated examples")
    parameters = profile["coOptimalParameterExamples"]
    if len(parameters) != profile["coOptimalSet"]["size"]:
        raise ValueError("Incomplete co-optimal parameter set")
    panel = {**original, "charts": [
        {**chart, "observations": [row for row in chart["observations"]
                                  if period["start"] <= row["at"][:10] <= period["end"]]}
        for chart in original["charts"] if chart["country"] == "JP"
    ]}
    index = next(i for i, game in enumerate(panel["games"]) if game["key"] == "Fate/Grand Order")
    histogram = rank_histograms(panel)
    annual = np.array([chart["annualMarketProxyUsd"] / 1e9 for chart in panel["charts"]])
    budgets = {row["stores"][0]: row["amount"] for row in evidence["subperiodAmounts"]
               if row["source"] == source_id and row["metric"] == "market_total" and len(row["stores"]) == 1}
    rows = []
    for ios, google_play, mixture in parameters:
        shares = chart_features(panel, {"ios": ios, "aos": google_play, "cn": ios},
                                "top200_conditional", histograms=histogram)[index] / annual
        contributions = {chart["store"]: float(shares[k] * budgets[chart["store"]])
                         for k, chart in enumerate(panel["charts"])}
        upper = sum(contributions.values())
        rows.append({"iosExponent": ios, "googlePlayExponent": google_play,
                     "monthlyIosTop200Mixture": mixture,
                     "fullStoreBudgetUpperMillion": upper, "storeUpperMillion": contributions,
                     "minimumCommonTop200CaptureToExceedReference": reference["amount"] / upper})
    result = {
        "schemaVersion": 1, "productionEnabled": False, "status": "unused_money_consistency_scenario",
        "game": "Fate/Grand Order", "geography": "JP",
        "period": period, "source": source["url"],
        "reference": {"qualifier": reference["qualifier"], "amountMillion": reference["amount"],
                      "feeBasis": source["feeBasis"], "provider": source["provider"]},
        "storeBudgetMillion": budgets, "parameterCount": len(rows),
        "observedDaysByStore": {chart["store"]: len({row["at"][:10] for row in chart["observations"]})
                               for chart in panel["charts"]},
        "fullStoreBudgetUpperRangeMillion": [
            min(row["fullStoreBudgetUpperMillion"] for row in rows),
            max(row["fullStoreBudgetUpperMillion"] for row in rows)],
        "parametersUnableToReachReferenceLowerBound": sum(
            row["fullStoreBudgetUpperMillion"] <= reference["amount"] for row in rows),
        "rows": rows,
        "limitations": [
            "No money value is used to select or discard the ordinal candidates.",
            "This reuses August observations and is not an independent-period validation.",
            "The month-level ordinal curves are assumed unchanged during the holiday.",
            "Each store budget is fully allocated to TOP200, so these are upper-budget scenarios, not revenue estimates.",
            "Equal budget per observed date is assumed; these are not unconditional upper bounds when daily spending varies.",
            "The monthly fitted mixture is not reused as a measured holiday store split; published store budgets replace it.",
            "Archived dates are KST buckets; the article reporting timezone is unconfirmed.",
            "The greater-than qualifier is a lower bound, not an exact amount for percentage-error scoring.",
            "Matching a lower bound proves compatibility only, not model accuracy."
        ]
    }
    destination = ROOT / "reports/rank-models/japan-holiday-money-2026-09-10.json"
    destination.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "rows"}), flush=True)


if __name__ == "__main__":
    main()
