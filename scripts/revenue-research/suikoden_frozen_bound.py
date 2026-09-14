"""Compare a new eligible store-payment floor with previously frozen round 13."""

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

from frozen_models import input_fingerprint
from temporal_transfer import integrate_window, snapshot_series


ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "bound": "docs/research/revenue-five-hour-2026-09-11/sensor-tower-jp-august-new-bounds.json",
    "frozen": "reports/rank-models/extension-korea-conditional-bounds-2026-09-11.json",
    "panel": "reports/rank-models/expanded-period-observations-2026-09-11.json",
}
OUTPUT = ROOT / "reports/rank-models/suikoden-frozen-lower-bound-2026-09-11.json"


def lower_floor_comparison(prediction_million, floor_million):
    if not math.isfinite(prediction_million) or prediction_million < 0:
        raise ValueError("Prediction must be finite and nonnegative")
    if not math.isfinite(floor_million) or floor_million <= 0:
        raise ValueError("The reported payment floor must be finite and positive")
    deficit = max(0.0, floor_million - prediction_million)
    return {
        "atOrAboveReportedFloor": prediction_million >= floor_million,
        "minimumShortfallMillion": deficit,
        "minimumRelativeShortfallPercent": 100 * deficit / floor_million,
        "exactMonetaryError": None,
    }


def main():
    inputs = {key: json.loads((ROOT / path).read_text(encoding="utf-8"))
              for key, path in SOURCES.items()}
    bound = next(row for row in inputs["bound"]["observations"]
                 if row["id"] == "st_jp_suikoden_star_leap_2026_08_launch_lower_bound")
    if bound["operator"] != ">=" or bound["currency"] != "USD":
        raise ValueError("An eligible USD lower-bound observation is required")
    if inputs["bound"]["source"]["stores"] != ["app_store", "google_play"]:
        raise ValueError("Only the two approved stores are eligible")
    panel = inputs["panel"]
    model = next(row for row in inputs["frozen"]["models"]
                 if row["id"] == "round13_original_frozen")
    matches = [i for i, game in enumerate(panel["games"])
               if bound["app_store_id"] in game["storeIds"]["ios"]]
    if len(matches) != 1:
        raise ValueError("The preserved observation panel must identify exactly one app family")
    index = matches[0]
    if panel["rankScope"] != "game_grossing" or panel["rankLimit"] != 200:
        raise ValueError("Do not replace the frozen model's game-only TOP200 input universe")
    series = snapshot_series(model, panel, index)
    floor = bound["value"] / 1e6
    scenarios = []
    # Clock hypotheses and all three existing reconstruction methods are fixed in advance.
    for offset in (-7, 0, 9):
        clock = timezone(timedelta(hours=offset))
        start = datetime.fromisoformat(bound["period_start"]).replace(tzinfo=clock)
        end = datetime.fromisoformat(bound["period_end"]).replace(tzinfo=clock) + timedelta(days=1)
        for method in ("linear", "previous", "next"):
            result = integrate_window(series, start.timestamp(), end.timestamp(), method=method)
            scenario = {
                "sourceClockOffsetHoursHypothesis": offset,
                "reconstruction": method,
                "startInclusive": start.isoformat(),
                "endExclusive": end.isoformat(),
            }
            if result is None:
                scenario["status"] = "missing_endpoint_coverage_no_extrapolation"
            else:
                japan = result["countryPredictionsMillion"][bound["geography"]]
                scenario.update({
                    "status": "conditional_comparison",
                    **result,
                    "japanPredictionMillion": japan,
                    "comparison": lower_floor_comparison(japan, floor),
                })
            scenarios.append(scenario)
    report = {
        "schemaVersion": 1,
        "productionEnabled": False,
        "refitted": False,
        "modelSelectedUsingThisTarget": False,
        "kind": "held_out_monetary_lower_bound_conditional_proxy_check",
        "inputs": [input_fingerprint(path) for path in SOURCES.values()],
        "bound": bound,
        "frozenModel": model,
        "game": panel["games"][index],
        "reportedFloorMillion": floor,
        "scenarios": scenarios,
        "scopeQualifications": [
            "Compare Japan's component, not the five-country sum, with the article's Japanese-market bound.",
            "The amount's geography follows its article section; the amount sentence does not repeat the country.",
            "Vendor App Store device coverage is not independently reconciled with the archived iPhone chart.",
            "Source clock is unknown. These three clock hypotheses are sensitivity cases, not a confidence interval.",
            "The original model is a partial-market vendor-revenue proxy, not a market-mass-conserving payment model.",
            "Returned-array ranks and between-observation reconstructions retain their existing limitations.",
            "An app absent from a returned chart contributes zero defined chart index, not measured zero revenue.",
            "Do not fill unobserved countries, stores or payment channels with a residual or new multiplier.",
            "The label was not used to fit round 13. AppMagic and Sensor Tower share corporate lineage.",
            "An output at or above a reported floor does not prove accurate revenue estimation.",
        ],
        "adoptionDecision": "No production adoption or new coefficient selection from this diagnostic.",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
                      encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT.relative_to(ROOT)),
        "game": report["game"]["key"],
        "reportedFloorMillion": floor,
        "scenarios": scenarios,
    }, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
