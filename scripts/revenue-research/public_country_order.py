"""Compare new public country-level vendor order with unchanged August models."""
import argparse
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import frozen_models, predict_panel, input_fingerprint
from weekly_growth import order_metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--countries", nargs="+")
    parser.add_argument("--output", default="reports/rank-models/public-country-order-2026-09-11.json")
    args = parser.parse_args()
    panel_path = "reports/rank-models/normalized-august-regional-panel-2026-09-10.json"
    panel = read_json(panel_path)
    training = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    models = [model for model in frozen_models(training) if model["id"] in {
        "round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}]
    predictions = {model["id"]: predict_panel(model, panel) for model in models}
    lookup = {}
    for i, game in enumerate(panel["games"]):
        for store, ids in game["storeIds"].items():
            for app_id in ids:
                key = (store, app_id)
                if key in lookup:
                    raise ValueError("Ambiguous existing panel identity")
                lookup[key] = i
    results = []
    for file in sorted((ROOT / "docs/research/appmagic-public-2026-09-11").glob("*.json")):
        reference = json.loads(file.read_text(encoding="utf-8"))
        if args.countries and reference["geography"] not in args.countries:
            continue
        if (reference["period"]["start"], reference["period"]["end"]) != (
                panel["period"]["start"], panel["period"]["end"]):
            raise ValueError("Country order reference and panel dates must match")
        mapped, missing = [], []
        for row in reference["rows"]:
            index = lookup.get((row["providerStore"], row["providerId"]))
            if index is None:
                missing.append(row)
            else:
                mapped.append({**row, "index": index, "game": panel["games"][index]["key"]})
        if len({row["index"] for row in mapped}) != len(mapped):
            raise ValueError("A provider reference duplicates an existing product family")
        comparisons = []
        for model in models:
            values = predictions[model["id"]]["countryPredictions"][reference["geography"]]
            comparisons.append({
                "model": model["id"], "modelSource": model["source"], "refitted": False,
                "order": order_metrics(np.array([values[row["index"]] for row in mapped]),
                                       np.array([row["rank"] for row in mapped])),
                "games": [{
                    "game": row["game"], "publishedRank": row["rank"],
                    "modelCountryContributionMillion": values[row["index"]],
                    "subsetModelRank": 1 + sum(values[other["index"]] > values[row["index"]] for other in mapped)
                } for row in mapped]
            })
        results.append({
            "reference": input_fingerprint(file.relative_to(ROOT).as_posix()),
            "sourceUrl": reference["sourceUrl"], "geography": reference["geography"],
            "publishedRows": reference["publishedRows"], "preservedRows": len(reference["rows"]),
            "mappedGames": len(mapped), "unmappedRows": missing, "comparisons": comparisons
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "input": input_fingerprint(panel_path),
        "results": results,
        "limitations": [
            "Vendor order only; country contribution values are model diagnostics, not measured country revenue.",
            "Representative app ID matching does not fully verify vendor product-family aggregation.",
            "Cohort is restricted to preserved public rows already mapped in the existing panel.",
            "The August observation panel lacks August 1 and is not a complete calendar month.",
            "Same-period, partly same-provider reference, not untouched future validation.",
            "No model parameter is selected or changed using these order references."
        ]
    }
    (ROOT / args.output).write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{"geography": row["geography"], "mapped": row["mappedGames"],
                      "models": [{"model": c["model"], "order": c["order"]} for c in row["comparisons"]]}
                     for row in results], indent=2))


if __name__ == "__main__":
    main()
