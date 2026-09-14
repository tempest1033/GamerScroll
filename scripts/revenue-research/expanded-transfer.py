"""Evaluate preserved regional predictions and a new game's daily event response."""
import json
from datetime import datetime, timedelta, timezone
import numpy as np
from simulate import ROOT, read_json
from frozen_models import frozen_models, input_fingerprint
from temporal_transfer import snapshot_series, integrate_window


def main():
    prior_path = "reports/rank-models/september-weekly-transfer-2026-09-10.json"
    prior = read_json(prior_path)
    regional = []
    for row in prior["rows"]:
        if row["game"] != "Pokemon GO":
            continue
        for country, reference in prior["source"]["regionalAmountsMillion"]["Pokemon GO"].items():
            valid = [scenario for scenario in row["scenarios"]
                     if scenario["status"] == "conditional_scenario"]
            values = [scenario["countryPredictionsMillion"][country] for scenario in valid]
            regional.append({
                "model": row["model"], "game": row["game"], "country": country,
                "referenceMillion": reference, "predictionRangeMillion": [min(values), max(values)],
                "relativeErrorRange": [min(values) / reference - 1, max(values) / reference - 1],
                "utcPredictionMillion": row["utcScenario"]["countryPredictionsMillion"][country],
                "status": "conditional_first_week_boundaries", "refitted": False
            })
    train = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    panel_path = "reports/rank-models/september-boundary-observations-2026-09-10.json"
    panel = read_json(panel_path)
    index = next(i for i, game in enumerate(panel["games"]) if game["key"] == "Delta Force")
    selected = {"round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}
    daily = []
    for model in [model for model in frozen_models(train) if model["id"] in selected]:
        series = snapshot_series(model, panel, index)
        for date, reference, qualifier in [("2026-09-04", 10.0, "rounded"),
                                           ("2026-09-05", 10.1, "nearly"),
                                           ("2026-09-06", 5.8, "rounded")]:
            scenarios = []
            for offset in np.arange(-12, 14.0001, .25):
                zone = timezone(timedelta(hours=float(offset)))
                start = datetime.fromisoformat(date).replace(tzinfo=zone).timestamp()
                result = integrate_window(series, start, start + 86400)
                scenarios.append({"utcOffsetHours": float(offset),
                                  "status": "conditional" if result else "insufficient_boundary_history",
                                  **(result or {})})
            valid = [row for row in scenarios if row["status"] == "conditional"]
            values = [row["predictionMillion"] for row in valid]
            daily.append({
                "model": model["id"], "modelSource": model["source"], "game": "Delta Force",
                "date": date, "referenceMillion": reference, "qualifier": qualifier,
                "predictionRangeMillion": [min(values), max(values)] if values else None,
                "utcScenario": next(row for row in scenarios if row["utcOffsetHours"] == 0),
                "scenarios": scenarios, "refitted": False, "usedForAugustMoneyFit": False
            })
    result = {
        "schemaVersion": 1, "productionEnabled": False,
        "inputs": [input_fingerprint(prior_path), input_fingerprint(panel_path)],
        "regionalRows": regional, "dailyRows": daily,
        "dailySource": {
            "url": "https://www.pocketgamer.biz/delta-force-surpasses-10m-in-daily-player-spending-for-the-first-time/",
            "provider": "AppMagic", "publishedOn": "2026-09-07",
            "geography": "WW", "stores": ["app_store", "google_play"], "feeBasis": "gross",
            "reportingTimezone": "unconfirmed",
            "september5Constraints": {"chinaShareGreaterThan": .99, "usSpendLessThanMillion": .009},
            "conflicts": [
                "Subtitle says September 5 was first in revenue; body says September 4 first, September 5 second.",
                "Lifetime $112.5m contradicts September 2025 $303.5m article; lifetime amount excluded."
            ]
        },
        "limitations": [
            "Frozen coefficients; no best timezone or new coefficient selected.",
            "Regional labels overlap their global total and are not independent samples.",
            "Old first-week article was already inspected; this is a new breakdown, not untouched evidence.",
            "Only five observed countries contribute; global missing revenue is not estimated independently.",
            "Daily market budgets are August averages, not measured September market spending.",
            "Delta Force point comparisons are conditional on the internally inconsistent source being correct.",
            "Ranges express scenario sensitivity, not statistical confidence intervals."
        ]
    }
    target = ROOT / "reports/rank-models/expanded-transfer-2026-09-11.json"
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"regional": regional, "daily": [
        {k: v for k, v in row.items() if k not in ("scenarios", "modelSource")}
        for row in daily]}, indent=2))


if __name__ == "__main__":
    main()
