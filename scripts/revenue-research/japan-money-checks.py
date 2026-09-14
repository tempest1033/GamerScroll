"""Unused monetary checks for the Japan-only ordinal parameter set."""
import json
from datetime import datetime, timedelta, timezone
import numpy as np

from simulate import ROOT, read_json
from temporal_transfer import snapshot_series, integrate_window


def japan_budget_model(panel, parameters, budgets, period):
    if any(chart["country"] != "JP" for chart in panel["charts"]):
        raise ValueError("Japan profile cannot be transferred to other countries implicitly")
    charts = {chart["store"]: chart for chart in panel["charts"]}
    if set(charts) != {"app_store", "google_play"} or set(budgets) != set(charts):
        raise ValueError("Both Japanese stores and explicit budgets are required")
    a, b, _ = parameters
    groups = ["JP:app_store", "JP:google_play"]
    return {
        "id": "japan_ordinal_conditional_budget",
        "exponents": {"ios": a, "aos": b, "cn": 1},
        "normalization": "top200_conditional", "grouping": "country_store_groups",
        "groupNames": groups,
        "coefficients": [budgets[store] / (charts[store]["annualMarketProxyUsd"] / 1e9)
                         for store in ("app_store", "google_play")],
        "countries": ["JP"], "trainingPeriod": period, "productionEnabled": False,
        "kind": "conditional_full_market_to_top200_budget_scenario"
    }


def monetary_cases(panel, parameters, budgets_for, period, game, start_date, end_date, reference, qualifier):
    i = next(index for index, entry in enumerate(panel["games"]) if entry["key"] == game)
    cases = []
    for parameter in parameters:
        model = japan_budget_model(panel, parameter, budgets_for(parameter), period)
        series = snapshot_series(model, panel, i)
        for offset in np.arange(-12, 14.0001, .25):
            zone = timezone(timedelta(hours=float(offset)))
            start = datetime.fromisoformat(start_date).replace(tzinfo=zone).timestamp()
            end = datetime.fromisoformat(end_date).replace(tzinfo=zone).timestamp()
            aggregate = integrate_window(series, start, end)
            cases.append({"parameters": parameter, "utcOffsetHours": float(offset),
                          "status": "conditional_scenario" if aggregate else "insufficient_boundary_history",
                          **(aggregate or {})})
    valid = [row for row in cases if "predictionMillion" in row]
    utc = [row for row in valid if row["utcOffsetHours"] == 0]
    return {
        "game": game, "referenceMillion": reference, "qualifier": qualifier,
        "dateWindow": {"start": start_date, "endExclusive": end_date},
        "parameterCount": len(parameters), "validCases": len(valid), "totalCases": len(cases),
        "predictionRangeMillion": [min(row["predictionMillion"] for row in valid),
                                  max(row["predictionMillion"] for row in valid)],
        "utcParameterRangeMillion": [min(row["predictionMillion"] for row in utc),
                                    max(row["predictionMillion"] for row in utc)] if utc else None,
        "upperBudgetScenariosBelowReference": sum(row["predictionMillion"] <= reference for row in valid),
        "cases": cases
    }


def main():
    profile = read_json("reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json")
    if profile["parameterExamplesTruncated"]:
        raise ValueError("Full co-optimal parameter set is needed for envelope calculations")
    parameters = profile["coOptimalParameterExamples"]
    markets = read_json("docs/research/same-month-market-evidence-2026-09-10.json")
    august = read_json("reports/rank-models/normalized-august-regional-panel-2026-09-10.json")
    september = read_json("reports/rank-models/september-boundary-observations-2026-09-10.json")
    august = {**august, "charts": [chart for chart in august["charts"] if chart["country"] == "JP"]}
    september = {**september, "charts": [chart for chart in september["charts"] if chart["country"] == "JP"]}
    weekly = read_json("reports/rank-models/september-weekly-transfer-2026-09-10.json")["source"]
    market = next(row for row in markets["monthlyMarkets"]
                  if row["source"] == "sensor_tower_august" and row["geography"] == "JP")
    pokemon = monetary_cases(
        september, parameters,
        lambda p: {"app_store": market["amount"] * p[2], "google_play": market["amount"] * (1 - p[2])},
        august["period"], "Pokemon GO", weekly["assumedWindow"]["start"],
        weekly["assumedWindow"]["endExclusive"], weekly["regionalAmountsMillion"]["Pokemon GO"]["JP"], None)
    holiday = markets["sources"]["sensor_tower_japan_holiday"]
    store_amounts = {row["stores"][0]: row["amount"] for row in markets["subperiodAmounts"]
                     if row["source"] == "sensor_tower_japan_holiday"
                     and row["metric"] == "market_total" and len(row["stores"]) == 1}
    fgo_reference = next(row for row in markets["subperiodAmounts"]
                         if row.get("game") == "Fate/Grand Order")
    start = datetime.fromisoformat(holiday["period"]["start"])
    end = datetime.fromisoformat(holiday["period"]["end"]) + timedelta(days=1)
    days = (end - start).days
    fgo = monetary_cases(
        august, parameters, lambda _: store_amounts,
        {**holiday["period"], "calendarDays": days}, "Fate/Grand Order",
        start.date().isoformat(), end.date().isoformat(), fgo_reference["amount"], fgo_reference["qualifier"])
    output = {
        "schemaVersion": 1, "productionEnabled": False, "status": "japan_unused_money_conditional_checks",
        "profileSource": "reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json",
        "septemberPokemonJapan": pokemon, "augustHolidayFgoJapan": fgo,
        "limitations": [
            "No reference game amount in this report selects or fits the ordinal parameter set.",
            "Every co-optimal grid point is retained; no favorable point or timezone is chosen.",
            "Allocating all store/country spending to TOP200 is an upper-budget scenario; actual TOP200 capture is unknown.",
            "September holds the August mean daily budget and monthly TOP200 store mixture fixed, which is a transfer assumption.",
            "The first-week source does not state exact date bounds or a reporting timezone.",
            "The holiday uses the explicitly reported $160m App Store and $80m Google Play budgets, not the fitted monthly mixture.",
            "The holiday reference is a lower bound, not an exact target or a usable percentage error.",
            "September market budgets and game amount come from different providers; holiday amounts use Sensor Tower consistently."
        ]
    }
    destination = ROOT / "reports/rank-models/japan-money-checks-2026-09-10.json"
    destination.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({key: {k: v for k, v in value.items() if k != "cases"}
                      for key, value in output.items() if key in ("septemberPokemonJapan", "augustHolidayFgoJapan")}), flush=True)


if __name__ == "__main__":
    main()
