"""New-period country order using frozen models and explicit reporting-clock scenarios."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import frozen_models, chart_coefficients, input_fingerprint
from weekly_growth import weekly_histograms, curve_scores, order_metrics


REFERENCE = "docs/research/appmagic-weekly-2026-09-11/week-2026-08-31.json"
PANEL = "reports/rank-models/expanded-period-observations-2026-09-11.json"


def main():
    reference = read_json(REFERENCE)
    panel = read_json(PANEL)
    train = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    models = [model for model in frozen_models(train) if model["id"] in {
        "round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}]
    coefficients = {model["id"]: chart_coefficients(model, panel["charts"]) for model in models}
    lookup = {}
    for i, game in enumerate(panel["games"]):
        for store, ids in game["storeIds"].items():
            for app_id in ids:
                if f"{store}:{app_id}" in lookup:
                    raise ValueError("Ambiguous existing panel app identity")
                lookup[f"{store}:{app_id}"] = i
    japan_path = "reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json"
    japan = read_json(japan_path)
    assert not japan["parameterExamplesTruncated"]
    result = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False,
        "inputs": [input_fingerprint(path) for path in (REFERENCE, PANEL, japan_path)],
        "period": reference["period"], "countries": [],
        "clockGrid": {"start": -12, "end": 14, "stepHours": .25},
        "limitations": [
            "Period is August 31-September 6, not the September 1-7 monetary article.",
            "The period contains one August training date and six September dates.",
            "Public country revenue values are locked; only rendered order is used.",
            "Results cover the existing mapped cohort within preserved TOP40 references.",
            "Clock ranges are sensitivity scenarios, not confidence intervals.",
            "TOP200 nonappearance is not measured zero revenue; identity and coverage limitations remain.",
            "Every original model and all 70 Japanese ordinal candidates stay frozen."
        ]
    }
    caches = {}
    for country_ref in reference["countries"]:
        country = country_ref["geography"]
        mapped = [{"rank": rank, "index": lookup[key], "game": panel["games"][lookup[key]]["key"]}
                  for rank, key in enumerate(country_ref["orderedIds"], 1) if key in lookup]
        if len({row["index"] for row in mapped}) != len(mapped):
            raise ValueError("Reference duplicates a modeled product family")
        rows = []
        histograms = []
        for offset in np.arange(-12, 14.0001, .25):
            charts, exposure = weekly_histograms(panel, [reference], float(offset), country=country)
            hist = exposure[0]["histogram"]
            if hist is None:
                raise ValueError(f"Missing boundary history for {country} {offset}")
            histograms.append(hist)
            indices = [next(i for i, original in enumerate(panel["charts"]) if original["key"] == chart["key"])
                       for chart in charts]
            predictions = []
            ranks = np.arange(1, panel["rankLimit"] + 1, dtype=float)
            for model in models:
                values = np.zeros(len(panel["games"]))
                for k, chart in enumerate(charts):
                    key = "cn" if country == "CN" else "ios" if chart["store"] == "app_store" else "aos"
                    curve = ranks ** -model["exponents"][key]
                    if model["normalization"] == "top200_conditional":
                        curve /= curve.sum()
                    values += hist[:, k] @ curve * chart["annualMarketProxyUsd"] * coefficients[model["id"]][indices[k]]
                predictions.append((model["id"], values))
            if country == "JP":
                predictions.extend((f"japan_august_cooptimal_{i}", curve_scores(hist, *parameters))
                                   for i, parameters in enumerate(japan["coOptimalParameterExamples"]))
            for model_id, values in predictions:
                rows.append({
                    "model": model_id, "utcOffsetHours": float(offset),
                    "order": order_metrics(values[[row["index"] for row in mapped]],
                                           np.array([row["rank"] for row in mapped])),
                    "modeledOrder": [row["game"] for row in sorted(mapped, key=lambda row: -values[row["index"]])]
                })
            if len(histograms) % 20 == 0:
                print(json.dumps({"country": country, "clockScenariosDone": len(histograms)}), flush=True)
        caches[country] = np.array(histograms)
        model_ids = list(dict.fromkeys(row["model"] for row in rows))
        summaries = []
        for model_id in model_ids:
            own = [row for row in rows if row["model"] == model_id]
            summaries.append({
                "model": model_id,
                "violationRange": [min(row["order"]["violations"] for row in own),
                                   max(row["order"]["violations"] for row in own)],
                "utc": next(row["order"] for row in own if row["utcOffsetHours"] == 0),
                "kst": next(row["order"] for row in own if row["utcOffsetHours"] == 9)
            })
        result["countries"].append({
            "geography": country, "sourceUrl": country_ref["sourceUrl"], "mapped": mapped,
            "unmappedIds": [key for key in country_ref["orderedIds"] if key not in lookup],
            "summaries": summaries, "scenarios": rows
        })
    target = ROOT / "reports/rank-models/public-weekly-order-2026-09-11.json"
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    np.savez_compressed(target.with_suffix(".exposure.npz"), **caches)
    print(json.dumps([{"country": row["geography"], "mapped": len(row["mapped"]),
                      "models": row["summaries"][:3]} for row in result["countries"]]), flush=True)


if __name__ == "__main__":
    main()
