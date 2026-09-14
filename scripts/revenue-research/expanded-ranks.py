"""Freeze existing fits and predict newly transcribed rank-only targets."""
import json
import argparse
from simulate import ROOT, read_json, rank_histograms
from frozen_models import frozen_models, predict_panel


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--panel", default="reports/rank-models/normalized-august-expanded-panel-2026-09-10.json")
    parser.add_argument("--output", default="reports/rank-models/expanded-rank-predictions-2026-09-10.json")
    args = parser.parse_args()
    panel = read_json(args.panel)
    training_panel = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    histograms = rank_histograms(panel)
    predictions = [predict_panel(model, panel, histograms) for model in frozen_models(training_panel)]
    output = {"schemaVersion": 1, "status": "new_rank_targets_frozen_models_provisional_identity",
              "productionEnabled": False, "rankSource": panel["rankReference"],
              "games": [{"key": game["key"], "usedForMoneyFit": game["reference"] is not None,
                         "rankReference": game.get("rankReference"),
                         "regionalRankReferences": game.get("regionalRankReferences", []),
                         "identityStatus": game["identityStatus"]} for game in panel["games"]],
              "results": predictions,
              "zeroSignalMeaning": "No observed contribution in five-market archive; not a revenue estimate of zero."}
    output["panelSource"] = args.panel
    target = ROOT / args.output
    target.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(target), "models": len(predictions),
                      "newRankOnlyGames": sum(game["reference"] is None for game in panel["games"])}))


if __name__ == "__main__":
    main()
