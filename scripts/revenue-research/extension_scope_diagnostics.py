"""Reuse frozen predictions for FX scenarios and diagnose complete-chart mass."""
import json
import numpy as np
from simulate import ROOT, read_json, chart_features
from frozen_models import chart_coefficients, input_fingerprint


def main():
    paths = [
        "reports/rank-models/extension-korea-conditional-bounds-2026-09-11.json",
        "docs/research/revenue-extension-2026-09-11/krw-usd-august-fred.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "docs/research/same-month-market-evidence-2026-09-10.json",
    ]
    predictions, fx, panel, markets = map(read_json, paths)
    if fx["unit"] != "KRW_per_USD" or fx["period"] != "2026-08" or fx["value"] <= 0:
        raise ValueError("A positive explicitly oriented August KRW/USD observation is required")
    rows = []
    for previous in predictions["rows"]:
        scenario_krw = previous["predictedObservedSubintervalTwoStoreUSD"] * fx["value"]
        compatibility = previous["sourceFullMonthThreeStoreKRW"] / scenario_krw if scenario_krw > 0 else None
        rows.append({
            **previous, "scenarioKRWPerUSD": fx["value"],
            "scenarioPartialTwoStoreKRW": scenario_krw,
            "maximumCompatibleRetainedFraction": compatibility,
            "conditionalReductionNeededFraction": max(0., 1 - compatibility) if compatibility is not None else None,
            "scopeMatchedAccuracyClaim": False,
        })
    summaries = []
    for model in predictions["models"]:
        own = [row for row in rows if row["model"] == model["id"]]
        fractions = [row["maximumCompatibleRetainedFraction"] for row in own if row["maximumCompatibleRetainedFraction"] is not None]
        summaries.append({
            "model": model["id"], "retainedFractionRange": [min(fractions), max(fractions)],
            "everyEvaluatedScenarioExceedsSourceUnderSameBasis": all(value < 1 for value in fractions),
            "basisActuallyVerified": False,
        })
    currency_report = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False,
        "inputs": [input_fingerprint(path) for path in paths[:2]],
        "window": predictions["window"], "summaries": summaries, "rows": rows,
        "limitations": [
            "The original completed model predictions are reused without rerunning their time integration.",
            "The declared FRED monthly average is not assumed to equal Mobile Index's conversion method.",
            "The retained fraction measures arithmetic compatibility, not an observed store fee or refund rate.",
            "A difference can involve fee, tax, refunds, vendor estimates, family scope or model allocation.",
            "No nominal currency scenario becomes a matched-scope revenue error or training label."
        ],
    }
    (ROOT / "reports/rank-models/extension-korea-fx-scenario-2026-09-11.json").write_text(
        json.dumps(currency_report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    # By linearity this aggregate exposure is the sum of all 200 distinct rank slots,
    # not a fictional game occupying every slot.
    complete_slots = np.ones((1, len(panel["charts"]), panel["rankLimit"]))
    country_references = {row["geography"]: row["amount"] for row in markets["monthlyMarkets"]
                          if row["source"] == "sensor_tower_august"}
    masses = []
    for model in predictions["models"]:
        features = chart_features(panel, model["exponents"], model["normalization"], histograms=complete_slots)[0]
        chart_masses = features * chart_coefficients(model, panel["charts"])
        country_masses = {country: float(sum(value for value, chart in zip(chart_masses, panel["charts"])
                                            if chart["country"] == country)) for country in model["countries"]}
        comparisons = [{
            "country": country, "impliedFullChartMonthlyMillionUSD": amount,
            "publishedWholeMarketMillionUSD": country_references[country],
            "impliedToPublishedRatio": amount / country_references[country]}
            for country, amount in country_masses.items() if country in country_references]
        masses.append({
            "model": model["id"], "normalization": model["normalization"],
            "charts": [{"chart": chart["key"], "country": chart["country"], "store": chart["store"],
                        "impliedMonthlyMillionUSD": float(value)}
                       for chart, value in zip(panel["charts"], chart_masses)],
            "countryMassesMillionUSD": country_masses,
            "fiveMarketCompleteChartMassMillionUSD": float(chart_masses.sum()),
            "sensorTowerGlobalWholeMarketMillionUSD": country_references["WW"],
            "countryComparisons": comparisons,
        })
    mass_report = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": markets["period"], "rows": masses,
        "limitations": [
            "Group coefficients were fitted regression scales, not independently identified market budgets.",
            "This is the implied sum over complete TOP200 chart slots at the preserved monthly scale, not an observed revenue total.",
            "If interpreted as real spending, a country's TOP200 mass cannot exceed its full market under matching scope.",
            "Sensor Tower and AppMagic estimates are distinct products under common ownership; cross-product market comparisons remain conditional.",
            "The published totals are rounded and tax conventions remain unspecified.",
            "No unobserved tail is filled, no new coefficient is fitted and no country scale is clipped to make it pass."
        ],
    }
    (ROOT / "reports/rank-models/extension-complete-chart-mass-2026-09-11.json").write_text(
        json.dumps(mass_report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    tracked = {"round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}
    print(json.dumps({
        "currencyScenario": [row for row in summaries if row["model"] in tracked],
        "completeChartMass": [{"model": row["model"], "countryMassesMillionUSD": row["countryMassesMillionUSD"],
                               "fiveMarketCompleteChartMassMillionUSD": row["fiveMarketCompleteChartMassMillionUSD"],
                               "countryComparisons": row["countryComparisons"]}
                              for row in masses if row["model"] in tracked],
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
