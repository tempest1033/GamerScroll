"""Evaluate frozen models under two additional integration conventions, never select on them."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import weekly_histograms, curve_scores, order_metrics


def main():
    paths = [
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "docs/research/appmagic-store-public-2026-09-11/jp-week-august31.json",
        "reports/rank-models/public-weekly-order-2026-09-11.json",
        "reports/rank-models/weekly-growth-2026-09-11.json",
        "reports/rank-models/japan-store-pareto-2026-09-11.json",
        "reports/rank-models/consensus-transfer-2026-09-11.json",
        "reports/rank-models/japan-weekly-store-transfer-2026-09-11.json",
    ]
    panel, reference, aggregate, original, pareto, consensus, preserved = map(read_json, paths)
    if reference["period"] != aggregate["period"] or reference["period"] != preserved["period"]:
        raise ValueError("Reporting periods must agree")
    prior = next(row["model"] for row in original["results"] if row["model"]["id"] == "round13_original_frozen")
    models = [{"id": prior["id"], "parameters": [prior["ios"], prior["google"], prior["mixture"]]}]
    models.extend({"id": f"store_pareto_archived_{i}", "parameters": consensus["recoveredParameters"][i]}
                  for i in pareto["retainedOriginalIndices"])
    country_reference = next(row for row in aggregate["countries"] if row["geography"] == "JP")["mapped"]
    aggregate_indices = [row["index"] for row in country_reference]
    aggregate_ranks = np.array([row["rank"] for row in country_reference])
    store_references = preserved["results"]
    rows, caches = [], {}
    ranks = np.arange(1, panel["rankLimit"] + 1, dtype=float)
    for method in ("previous", "next"):
        exposures = []
        for step in range(105):
            offset = -12 + step * .25
            _, windows = weekly_histograms(panel, [reference], offset, reconstruction=method)
            hist = windows[0]["histogram"]
            if hist is None:
                raise ValueError("No boundary extrapolation is permitted")
            exposures.append(hist)
            for model in models:
                params = model["parameters"]
                stores = []
                for s, store_reference in enumerate(store_references):
                    indices = [row["index"] for row in store_reference["mapped"]]
                    expected = np.array([row["publishedRank"] for row in store_reference["mapped"]])
                    score = hist[:, s] @ ranks ** -params[s]
                    stores.append({"scope": store_reference["storeScope"],
                                   "order": order_metrics(score[indices], expected)})
                combined = curve_scores(hist, *params)
                rows.append({
                    "method": method, "utcOffsetHours": offset, "model": model["id"], "stores": stores,
                    "aggregateOrder": order_metrics(combined[aggregate_indices], aggregate_ranks),
                    "coverage": windows[0]["coverage"],
                })
            if (step + 1) % 20 == 0:
                print(json.dumps({"method": method, "clocksDone": step + 1}), flush=True)
        caches[method] = np.array(exposures)
    summaries = []
    for method in ("previous", "next"):
        for model in models:
            own = [row for row in rows if row["method"] == method and row["model"] == model["id"]]
            summaries.append({
                "method": method, "model": model["id"],
                "aggregateViolationRange": [
                    min(row["aggregateOrder"]["violations"] for row in own),
                    max(row["aggregateOrder"]["violations"] for row in own)],
                "storeViolationRanges": [
                    {"scope": store["storeScope"], "range": [
                        min(row["stores"][s]["order"]["violations"] for row in own),
                        max(row["stores"][s]["order"]["violations"] for row in own)]}
                    for s, store in enumerate(store_references)],
            })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnTheseScenarios": False,
        "inputs": [input_fingerprint(path) for path in paths] + [
            input_fingerprint(f"scripts/revenue-research/{name}") for name in
            ("temporal_transfer.py", "weekly_growth.py")],
        "period": reference["period"], "models": models, "summaries": summaries, "rows": rows,
        "linearResultsPreservedAt": paths[2:3] + paths[6:7],
        "limitations": [
            "Previous and next hold conventions are sensitivity scenarios, not observed revenue paths or guaranteed bounds.",
            "Next-value holding uses a future observation and is never treated as an executable forecast.",
            "Missing interior intervals are not measured; maximum bracketing gaps remain explicit.",
            "No boundary extrapolation, coefficient refitting or favorable-clock selection is performed.",
            "Known linear diagnostics are reused rather than recomputed.",
            "Order changes are not evidence of monetary accuracy."
        ],
    }
    target = ROOT / "reports/rank-models/weekly-reconstruction-2026-09-11.json"
    np.savez_compressed(target.with_suffix(".exposure.npz"), **caches)
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summaries), flush=True)


if __name__ == "__main__":
    main()
