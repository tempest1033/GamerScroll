"""Frozen August models versus explicit September daily revenue observations.

The source's reporting-day timezone is unresolved, so offsets are reported as
sensitivity scenarios, never selected by closeness to the reference amounts.
"""
import json
from datetime import datetime, timedelta, timezone
import numpy as np

from simulate import ROOT, read_json
from frozen_models import frozen_models
from temporal_transfer import interval_average, snapshot_series, integrate_window


SOURCE = {
    "url": "https://www.pocketgamer.biz/pokemon-go-dominates-early-september-revenue-charts-as-honor-of-kings-falls-into-seventh/",
    "provider": "AppMagic", "game": "Pokemon GO", "geography": "WW",
    "stores": ["app_store", "google_play"], "metric": "player_spending",
    "feeBasis": "gross", "reportingTimezone": "unconfirmed",
    "observations": [
        {"date": "2026-09-04", "amountMillion": 6.1},
        {"date": "2026-09-05", "amountMillion": 10.1},
        {"date": "2026-09-06", "amountMillion": 9.6}
    ]
}


def main():
    train = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    panel = read_json("reports/rank-models/september-boundary-observations-2026-09-10.json")
    game_index = next(i for i, game in enumerate(panel["games"]) if game["key"] == SOURCE["game"])
    selected_ids = {"round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}
    models = [model for model in frozen_models(train) if model["id"] in selected_ids]
    rows = []
    for model in models:
        series = snapshot_series(model, panel, game_index)
        for observation in SOURCE["observations"]:
            scenarios = []
            for offset in np.arange(-12, 14.0001, 0.25):
                day_timezone = timezone(timedelta(hours=float(offset)))
                start = datetime.fromisoformat(observation["date"]).replace(tzinfo=day_timezone).timestamp()
                end = start + 86400
                aggregate = integrate_window(series, start, end)
                if aggregate is None:
                    scenarios.append({"utcOffsetHours": float(offset), "status": "insufficient_boundary_history"})
                    continue
                prediction = aggregate["predictionMillion"]
                scenarios.append({
                    "utcOffsetHours": float(offset), "status": "conditional_interpolated_scenario",
                    "predictionMillion": prediction,
                    "errorPercent": (prediction / observation["amountMillion"] - 1) * 100,
                    "minInsideBuckets": aggregate["minInsideBuckets"],
                    "maxBracketingGapHours": aggregate["maxBracketingGapHours"]
                })
            valid = [scenario for scenario in scenarios if "predictionMillion" in scenario]
            rows.append({
                "model": model["id"], **observation, "scenarios": scenarios,
                "predictionRangeMillion": [min(item["predictionMillion"] for item in valid),
                                          max(item["predictionMillion"] for item in valid)] if valid else None,
                "utcScenario": next(item for item in scenarios if item["utcOffsetHours"] == 0),
                "kstScenario": next(item for item in scenarios if item["utcOffsetHours"] == 9)
            })
    output = {
        "schemaVersion": 1, "productionEnabled": False, "status": "frozen_cross_period_boundary_sensitivity",
        "source": SOURCE, "trainingPeriod": train["period"], "rows": rows,
        "assumptions": [
            "No September amount is used to fit or select these frozen models.",
            "Daily scaling holds the August per-calendar-day revenue proxy constant; no September market budget or event multiplier is fitted.",
            "Linear interpolation is limited to observations bracketing a window; no extrapolation is performed.",
            "UTC offsets from -12 to +14 in quarter-hour steps are sensitivity cases, not an inferred provider timezone.",
            "Provider data-processing time (e.g. CET) does not establish the reporting-day boundary.",
            "Absent chart contributions remain incomplete signals, not verified zero revenue.",
            "These three days of one game do not validate monthly global accuracy."
        ]
    }
    target = ROOT / "reports/rank-models/september-daily-transfer-2026-09-10.json"
    target.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{key: value for key, value in row.items() if key != "scenarios"} for row in rows]), flush=True)


if __name__ == "__main__":
    main()
