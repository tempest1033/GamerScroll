"""Cross-period, partly new-game checks under an explicitly assumed first-week window."""
import json
from datetime import datetime, timedelta, timezone
import numpy as np

from simulate import ROOT, read_json
from frozen_models import frozen_models
from temporal_transfer import snapshot_series, integrate_window


SOURCE = {
    "url": "https://www.pocketgamer.biz/pokemon-go-dominates-early-september-revenue-charts-as-honor-of-kings-falls-into-seventh/",
    "provider": "AppMagic", "geography": "WW", "stores": ["app_store", "google_play"],
    "feeBasis": "gross", "periodLabel": "first week of September",
    "periodBoundsExplicitInSource": False, "reportingTimezone": "unconfirmed",
    "assumedWindow": {"start": "2026-09-01", "endExclusive": "2026-09-08"},
    "amountsMillion": {"Pokemon GO": 44.2, "MONOPOLY GO!": 33.6, "Delta Force": 33.5},
    "regionalAmountsMillion": {"Pokemon GO": {"US": 19.3, "JP": 11.0}},
    "ranks": {"Pokemon GO": 1, "MONOPOLY GO!": 2, "Delta Force": 3, "Honor of Kings": 7}
}


def main():
    train = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    panel = read_json("reports/rank-models/september-boundary-observations-2026-09-10.json")
    trained = {game["key"] for game in train["games"]}
    selected = {"round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}
    rows = []
    for model in [model for model in frozen_models(train) if model["id"] in selected]:
        for game in SOURCE["ranks"]:
            i = next(index for index, entry in enumerate(panel["games"]) if entry["key"] == game)
            series = snapshot_series(model, panel, i)
            scenarios = []
            for offset in np.arange(-12, 14.0001, 0.25):
                zone = timezone(timedelta(hours=float(offset)))
                start = datetime.fromisoformat(SOURCE["assumedWindow"]["start"]).replace(tzinfo=zone).timestamp()
                end = datetime.fromisoformat(SOURCE["assumedWindow"]["endExclusive"]).replace(tzinfo=zone).timestamp()
                aggregate = integrate_window(series, start, end)
                scenarios.append({"utcOffsetHours": float(offset),
                                  "status": "conditional_scenario" if aggregate else "insufficient_boundary_history",
                                  **(aggregate or {})})
            valid = [scenario for scenario in scenarios if scenario["status"] == "conditional_scenario"]
            rows.append({
                "model": model["id"], "game": game, "usedForAugustMoneyFit": game in trained,
                "referenceMillion": SOURCE["amountsMillion"].get(game),
                "referenceRank": SOURCE["ranks"][game],
                "validClockScenarios": len(valid),
                "predictionRangeMillion": [min(row["predictionMillion"] for row in valid),
                                          max(row["predictionMillion"] for row in valid)] if valid else None,
                "utcScenario": next(row for row in scenarios if row["utcOffsetHours"] == 0),
                "kstScenario": next(row for row in scenarios if row["utcOffsetHours"] == 9),
                "scenarios": scenarios
            })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "status": "conditional_first_week_transfer",
        "source": SOURCE, "rows": rows,
        "limitations": [
            "September 1-7 is an explicit interpretation of first week, not verified source date bounds.",
            "No game amount or rank from this article is used to fit or select the frozen models.",
            "MONOPOLY GO! and Delta Force were not monetary training games in August.",
            "Insufficient end-boundary history is reported and never extrapolated.",
            "The August average daily market rate is transferred unchanged; actual September budgets are unknown.",
            "Rank comparison is among the four referenced games only, not a reconstruction of the full global chart.",
            "The displayed offset range is not a confidence interval or a choice of the best reporting timezone."
        ]
    }
    target = ROOT / "reports/rank-models/september-weekly-transfer-2026-09-10.json"
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{key: value for key, value in row.items() if key != "scenarios"} for row in rows]), flush=True)


if __name__ == "__main__":
    main()
