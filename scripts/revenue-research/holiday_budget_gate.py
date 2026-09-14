"""Unused monetary-capacity checks for the three frozen ordinal candidates."""
import json
import numpy as np
from simulate import ROOT, read_json, rank_histograms
from frozen_models import input_fingerprint
from weekly_growth import curve_scores


def common_budget_ceiling(budgets, mixture):
    budgets = np.asarray(budgets, dtype=float)
    if budgets.shape != (2,) or not np.all(np.isfinite(budgets)) or np.any(budgets < 0):
        raise ValueError("Two finite nonnegative store budgets are required")
    if not 0 <= mixture <= 1:
        raise ValueError("A mixture must be between zero and one")
    shares = np.array([mixture, 1 - mixture])
    return float(min(budgets.sum(), np.min(budgets[shares > 0] / shares[shares > 0])))


def main():
    paths = [
        "docs/research/same-month-market-evidence-2026-09-10.json",
        "reports/rank-models/japan-store-pareto-2026-09-11.json",
        "reports/rank-models/consensus-transfer-2026-09-11.json",
        "reports/rank-models/normalized-august-regional-panel-2026-09-10.json",
    ]
    evidence, pareto, consensus, panel = map(read_json, paths)
    sid = "sensor_tower_japan_holiday"
    source = evidence["sources"][sid]
    period = source["period"]
    reference = next(row for row in evidence["subperiodAmounts"]
                     if row["source"] == sid and row.get("game") == "Fate/Grand Order")
    budgets = np.array([next(row["amount"] for row in evidence["subperiodAmounts"]
                            if row["source"] == sid and row["metric"] == "market_total"
                            and row["stores"] == [store])
                        for store in ("app_store", "google_play")])
    holiday = {**panel, "charts": sorted([
        {**chart, "observations": [row for row in chart["observations"]
                                  if period["start"] <= row["at"][:10] <= period["end"]]}
        for chart in panel["charts"] if chart["country"] == "JP"], key=lambda c: c["store"])}
    index = next(i for i, game in enumerate(panel["games"]) if game["key"] == "Fate/Grand Order")
    hist = rank_histograms(holiday)[index:index + 1]
    observed_counts = [max(len(row["gameRanks"][index]) for row in chart["observations"])
                       for chart in holiday["charts"]]
    identity_counts = [len(panel["games"][index]["storeIds"][store]) for store in ("ios", "aos")]
    scenarios = [
        ("single_listed_product_per_store", [1, 1]),
        ("all_known_family_ids_allowed_in_Japan", identity_counts),
    ]
    rows = []
    for candidate in pareto["retainedOriginalIndices"]:
        parameters = consensus["recoveredParameters"][candidate]
        ios, google, mixture = parameters
        ceiling = common_budget_ceiling(budgets, mixture)
        equal_day_upper = float(budgets.sum() * curve_scores(
            hist, ios, google, budgets[0] / budgets.sum())[0])
        capacities = []
        for name, counts in scenarios:
            perfect = np.zeros((1, 2, panel["rankLimit"]))
            for store, count in enumerate(counts):
                perfect[0, store, :count] = 1
            independent = float(budgets.sum() * curve_scores(
                perfect, ios, google, budgets[0] / budgets.sum())[0])
            coupled = float(ceiling * curve_scores(perfect, *parameters)[0])
            capacities.append({
                "scenario": name, "listingCapacityByStore": counts,
                "independentStorePeakUpperMillion": independent,
                "fixedMonthlyMixturePeakUpperMillion": coupled,
                "independentStoreCapacityBelowReference": independent <= reference["amount"],
                "fixedMixtureCapacityBelowReference": coupled <= reference["amount"],
            })
        rows.append({
            "candidateIndex": candidate, "parameters": parameters,
            "jointTop200BudgetCeilingWithFixedMixtureMillion": ceiling,
            "minimumWholeBudgetOutsideModeledTop200WithFixedMixture": 1 - ceiling / budgets.sum(),
            "observedEqualDayStoreBudgetUpperMillion": equal_day_upper,
            "capacityScenarios": capacities,
        })
    output = {
        "schemaVersion": 1, "productionEnabled": False, "candidatesSelectedUsingThisMoney": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": period, "sourceUrl": source["url"], "sourceProvider": source["provider"],
        "feeBasis": source["feeBasis"], "storeBudgetsMillion": budgets.tolist(),
        "referenceLowerMillion": reference["amount"], "referenceQualifier": reference["qualifier"],
        "observedMaximumListingsByStore": observed_counts,
        "knownGlobalIdentityCountsByStore": identity_counts,
        "rows": rows,
        "limitations": [
            "Sensor Tower budgets and lower bound are cross-provider checks on AppMagic-rank-selected candidates.",
            "All amounts are vendor estimates; source uncertainty is not converted into a confidence interval.",
            "The curves are assumed stationary from the full August period into the nine-day holiday.",
            "Peak upper capacities do not require equal daily budgets or favorable actual rank histories.",
            "A single local listed product is a stated scope assumption; observed cardinality does not prove every vendor family member.",
            "The all-known-ID scenario is deliberately loose and does not assert every global version was offered in Japan.",
            "The fixed-mixture scenario tests extending the fitted monthly mixture into the holiday; it is not a measured holiday split.",
            "The observed-average scenario additionally assumes equal daily store spending and KST archived dates.",
            "No candidate is chosen, no missing-period amount is imputed, and no production weight changes."
        ],
    }
    (ROOT / "reports/rank-models/pareto-holiday-budget-gate-2026-09-11.json").write_text(
        json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"observedListings": observed_counts, "identityCounts": identity_counts, "rows": rows}))


if __name__ == "__main__":
    main()
