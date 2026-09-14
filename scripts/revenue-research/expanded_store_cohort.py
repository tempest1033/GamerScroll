"""Broader frozen rank validation, reusing every previously evaluated old-old pair."""
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import weekly_histograms
from consensus_japan import load_ordinal


def main():
    paths = [
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
        "docs/research/appmagic-store-public-2026-09-11/jp-week-august31.json",
        "reports/rank-models/weekly-growth-2026-09-11.json",
        "reports/rank-models/japan-store-pareto-2026-09-11.json",
        "reports/rank-models/consensus-transfer-2026-09-11.json",
        "reports/rank-models/japan-weekly-store-transfer-2026-09-11.json",
        "reports/rank-models/weekly-reconstruction-2026-09-11.json",
    ]
    old, new, reference, original, pareto, consensus, linear, reconstructed = map(read_json, paths)
    require_old = len(old["games"])
    if set(game["key"] for game in old["games"]) & set(game["key"] for game in new["games"]):
        raise ValueError("New cohort overlaps an existing game identity")
    if not new["observationOnly"] or any(game["reference"] is not None for game in new["games"]):
        raise ValueError("Novel rank cohort must not contain monetary training labels")
    games = old["games"] + new["games"]
    prior = next(row["model"] for row in original["results"] if row["model"]["id"] == "round13_original_frozen")
    models = [{"id": prior["id"], "parameters": [prior["ios"], prior["google"]]}]
    models.extend({"id": f"store_pareto_archived_{i}", "parameters": consensus["recoveredParameters"][i][:2]}
                  for i in pareto["retainedOriginalIndices"])
    linear_cache_path = "reports/rank-models/public-weekly-order-2026-09-11.exposure.npz"
    reconstruction_cache_path = "reports/rank-models/weekly-reconstruction-2026-09-11.exposure.npz"
    linear_cache = np.load(ROOT / linear_cache_path)["JP"]
    alternate_cache = np.load(ROOT / reconstruction_cache_path)
    cached = {"linear": linear_cache, **{key: alternate_cache[key] for key in ("previous", "next")}}
    old_losses = {}
    for store in linear["results"]:
        for row in store["clockScenarios"]:
            old_losses[("linear", row["utcOffsetHours"], row["model"], store["storeScope"])] = row["violations"]
    for row in reconstructed["rows"]:
        for store in row["stores"]:
            old_losses[(row["method"], row["utcOffsetHours"], row["model"], store["scope"])] = store["order"]["violations"]
    cohorts = []
    for store_index, identity_store in enumerate(("ios", "aos")):
        scope = ("app_store_iphone", "google_play")[store_index]
        source = next(table for table in reference["tables"] if table["storeScope"] == scope)
        lookup = {}
        for i, game in enumerate(games):
            for app_id in game["storeIds"][identity_store]:
                if app_id in lookup:
                    raise ValueError("Ambiguous expanded app ID")
                lookup[app_id] = i
        mapped = [{"publishedRank": rank, "id": app_id, "index": lookup[app_id],
                   "game": games[lookup[app_id]]["key"], "newlyModeled": lookup[app_id] >= require_old}
                  for rank, app_id in enumerate(source["orderedRepresentativeIds"], 1) if app_id in lookup]
        if len({row["index"] for row in mapped}) != len(mapped):
            raise ValueError("Provider list duplicates a modeled family")
        preserved = next(row for row in linear["results"] if row["storeScope"] == scope)
        if {row["id"] for row in mapped if not row["newlyModeled"]} != {row["id"] for row in preserved["mapped"]}:
            raise ValueError("Previously verified old-old cohort changed")
        cohorts.append({"storeScope": scope, "mapped": mapped,
                        "unmappedIds": [app_id for app_id in source["orderedRepresentativeIds"] if app_id not in lookup]})
    rank = np.arange(1, old["rankLimit"] + 1, dtype=float)
    ordinal = load_ordinal()
    rows, novel_caches = [], {}
    for method in ("linear", "previous", "next"):
        novel_exposure = []
        for clock_index in range(105):
            offset = -12 + clock_index * .25
            _, exposure = weekly_histograms(new, [reference], offset, reconstruction=method)
            novel = exposure[0]["histogram"]
            if novel is None:
                raise ValueError("Novel cohort has no complete boundary coverage")
            novel_exposure.append(novel)
            old_histogram = cached[method][clock_index]
            if old_histogram.shape[0] != require_old:
                raise ValueError("Old exposure identity order changed")
            hist = np.concatenate((old_histogram, novel), axis=0)
            for s, cohort in enumerate(cohorts):
                mapped = cohort["mapped"]
                indices = np.array([row["index"] for row in mapped])
                left, right = np.triu_indices(len(mapped), 1)
                fresh = (indices[left] >= require_old) | (indices[right] >= require_old)
                left, right = left[fresh], right[fresh]
                both_new = (indices[left] >= require_old) & (indices[right] >= require_old)
                scores = np.array([hist[indices, s] @ rank ** -model["parameters"][s] for model in models])
                novel_losses = ordinal.pair_losses(scores, left, right) / 2
                for m, model in enumerate(models):
                    prior_loss = old_losses[(method, offset, model["id"], cohort["storeScope"])]
                    rows.append({
                        "method": method, "utcOffsetHours": offset, "model": model["id"],
                        "storeScope": cohort["storeScope"], "oldOldViolationsReused": prior_loss,
                        "newNewViolations": float(novel_losses[m, both_new].sum()),
                        "oldNewViolations": float(novel_losses[m, ~both_new].sum()),
                        "fullViolations": float(prior_loss + novel_losses[m].sum()),
                        "fullPairCount": len(mapped) * (len(mapped) - 1) // 2,
                        "newlyEvaluatedPairs": len(left),
                    })
            if (clock_index + 1) % 35 == 0:
                print(json.dumps({"method": method, "novelClocksDone": clock_index + 1}), flush=True)
        novel_caches[method] = np.array(novel_exposure)
    summaries = []
    for cohort in cohorts:
        for model in models:
            own = [row for row in rows if row["storeScope"] == cohort["storeScope"] and row["model"] == model["id"]]
            summaries.append({
                "storeScope": cohort["storeScope"], "model": model["id"],
                "fullGames": len(cohort["mapped"]), "newGames": sum(row["newlyModeled"] for row in cohort["mapped"]),
                "fullPairCount": own[0]["fullPairCount"], "newlyEvaluatedPairs": own[0]["newlyEvaluatedPairs"],
                "fullViolationRange": [min(row["fullViolations"] for row in own), max(row["fullViolations"] for row in own)],
                "newPairViolationRange": [min(row["newNewViolations"] + row["oldNewViolations"] for row in own),
                                          max(row["newNewViolations"] + row["oldNewViolations"] for row in own)],
            })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "selectedOnExpandedCohort": False,
        "inputs": [input_fingerprint(path) for path in paths + [
            linear_cache_path, reconstruction_cache_path, "docs/research/new-store-cohort-identities-2026-09-11.json"]],
        "period": reference["period"], "cohorts": cohorts, "models": models,
        "summaries": summaries, "rows": rows,
        "limitations": [
            "Candidates stay fixed; no coefficient, clock or cohort member is selected for a better result.",
            "Only new-game and old-new pairs are evaluated; old-old violations and exposures are reused.",
            "The expanded cohort was previously unmodeled, not wholly unseen: its public labels were already visible.",
            "Japanese/global Dokkan edition aggregation remains provisional.",
            "The malformed com.square_ provider ID stays unmapped rather than silently repaired.",
            "The cohort expansion supports rank diagnostics only, not new global monetary estimates."
        ],
    }
    target = ROOT / "reports/rank-models/expanded-japan-store-validation-2026-09-11.json"
    np.savez_compressed(target.with_suffix(".novel-exposure.npz"), **novel_caches)
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(summaries), flush=True)


if __name__ == "__main__":
    main()
