"""One owner for exporting previously fitted research-model contracts."""
import hashlib
import numpy as np
from simulate import ROOT, read_json, chart_features, group_features, rank_histograms


def input_fingerprint(relative):
    return {"path": relative, "sha256": hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()}


def frozen_models(training_panel):
    models = []
    for name in ("normalized-simulation", "normalized-grouping-simulation"):
        relative = f"reports/rank-models/{name}-2026-09-10.json"
        report = read_json(relative)
        for result in report["results"]:
            config = result["config"]
            models.append({
                "id": config["id"],
                "exponents": report["registry"]["curves"][config["curve"]]["exponents"],
                "normalization": config["normalization"], "grouping": config["groups"],
                "groupNames": result["groupNames"], "coefficients": result["fitted"]["coefficients"],
                "trainingPeriod": training_panel["period"], "source": input_fingerprint(relative),
                "productionEnabled": False, "kind": "partial_market_vendor_revenue_proxy",
                "countries": sorted({chart["country"] for chart in training_panel["charts"]})
            })
    relative = "reports/rank-models/august-five-rounds-v3-2026-09-10.json"
    baseline = next(row for row in read_json(relative)["rounds"] if row["round"] == 13)
    alpha = baseline["fitted"]["alpha"]
    shape = baseline["selected"]["shape"]
    exponents = {"ios": alpha, "aos": alpha * shape["androidExponentRatio"],
                 "cn": alpha * shape["chinaExponentRatio"]}
    matrix = chart_features(training_panel, exponents, "raw")
    multipliers = np.array([baseline["fitted"]["multipliers"].get(chart["country"].lower(), 1.0)
                            for chart in training_panel["charts"]])
    first = next(i for i, game in enumerate(training_panel["games"]) if game["key"] == "Honor of Kings")
    scale = baseline["fitted"]["predictions"][0] / (matrix[first] @ multipliers)
    models.insert(0, {
        "id": "round13_original_frozen", "exponents": exponents, "normalization": "raw",
        "grouping": "cn_jp_rest", "groupNames": ["CN", "JP", "rest"],
        "coefficients": [scale * baseline["fitted"]["multipliers"]["cn"],
                         scale * baseline["fitted"]["multipliers"]["jp"], scale],
        "trainingPeriod": training_panel["period"], "source": input_fingerprint(relative),
        "productionEnabled": False, "kind": "partial_market_vendor_revenue_proxy",
        "countries": sorted({chart["country"] for chart in training_panel["charts"]}),
        "scaleRecoveredFrom": "archived fitted prediction; no new monetary labels"
    })
    return models


def chart_coefficients(model, charts):
    if any(chart["country"] not in model["countries"] for chart in charts):
        raise ValueError("Prediction scope contains a country outside the frozen training contract")
    _, groups, membership = group_features(np.zeros((1, len(charts))), charts, model["grouping"])
    if groups != model["groupNames"]:
        raise ValueError("Prediction panel does not preserve the frozen model's regional group contract")
    return np.array(model["coefficients"])[membership]


def predict_panel(model, panel, histograms=None):
    histograms = rank_histograms(panel) if histograms is None else histograms
    features = chart_features(panel, model["exponents"], model["normalization"], histograms=histograms)
    contributions = features * chart_coefficients(model, panel["charts"])
    countries = sorted({chart["country"] for chart in panel["charts"]})
    return {
        "id": model["id"], "predictions": contributions.sum(axis=1).tolist(),
        "countryPredictions": {country: contributions[:, [k for k, chart in enumerate(panel["charts"])
                                                          if chart["country"] == country]].sum(axis=1).tolist()
                               for country in countries},
        "modelSource": model["source"], "refitted": False
    }
