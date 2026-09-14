"""Unfit-game day check using a published upper qualifier, not a point target."""
import json
from datetime import datetime, timezone, timedelta
from simulate import ROOT, read_json
from frozen_models import frozen_models, input_fingerprint
from temporal_transfer import snapshot_series, integrate_window


def main():
    paths = [
        "docs/research/expanded-event-evidence-2026-09-11.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/normalized-august-panel-2026-09-10.json",
    ]
    references, panel, training = map(read_json, paths)
    source = references["sources"]["hololive_first_month"]
    reference = next(row for row in source["daily"] if row["date"] == "2026-08-08")
    game = "hololive Dreams"
    if any(row["key"] == game for row in training["games"]):
        raise ValueError("The claimed unfit game appears in the monetary training panel")
    index = next(i for i, row in enumerate(panel["games"]) if row["key"] == game)
    models = [row for row in frozen_models(training) if row["id"] in {
        "round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}]
    summaries, rows = [], []
    for model in models:
        series = snapshot_series(model, panel, index)
        for method in ("linear", "previous", "next"):
            own = []
            for step in range(105):
                offset = -12 + step * .25
                start = datetime.fromisoformat(reference["date"]).replace(
                    tzinfo=timezone(timedelta(hours=offset))).timestamp()
                prediction = integrate_window(series, start, start + 86400, method=method)
                if prediction is None:
                    raise ValueError("A full day requires bracketing history for every modeled chart")
                own.append({
                    "model": model["id"], "method": method, "utcOffsetHours": offset, **prediction,
                    "exceedsPublishedRoundedUpper": prediction["predictionMillion"] > reference["amount"],
                })
            rows.extend(own)
            values = [row["predictionMillion"] for row in own]
            summaries.append({
                "model": model["id"], "method": method,
                "predictionRangeMillion": [min(values), max(values)],
                "clockScenariosAbovePublishedUpper": sum(row["exceedsPublishedRoundedUpper"] for row in own),
                "clockScenarios": len(own),
            })
    output = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnThisGameMoney": False,
        "inputs": [input_fingerprint(path) for path in paths] + [
            input_fingerprint("scripts/revenue-research/temporal_transfer.py")],
        "game": game, "reference": reference, "sourceUrl": source["url"],
        "sourceFeeBasis": source["feeBasis"], "notInMonetaryTrainingCohort": True,
        "summaries": summaries, "rows": rows,
        "limitations": [
            "The source says just shy of $3.8m, not an exact amount for percentage-error scoring.",
            "Gross consumer-spending interpretation follows the wording; a separate fee footnote is absent.",
            "This is a new monetary game label inside August, not untouched new-period validation.",
            "The five-market model remains a proxy calibrated against global amounts; country allocations are not independently validated.",
            "Original August average daily budgets are held fixed; actual August 8 market totals are unknown.",
            "All clocks and reconstruction conventions are preserved; next-value holding is diagnostic lookahead.",
            "The three ordinal-only Pareto candidates have no independently fitted monetary scale and are not assigned dollar predictions."
        ],
    }
    (ROOT / "reports/rank-models/hololive-daily-transfer-2026-09-11.json").write_text(
        json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summaries), flush=True)


if __name__ == "__main__":
    main()
