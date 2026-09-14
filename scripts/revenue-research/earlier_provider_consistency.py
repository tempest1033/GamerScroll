"""Earlier-period provider order consistency without inventing local rank history."""
import json
from simulate import ROOT, read_json
from frozen_models import input_fingerprint


def compare_unanimous_order(published_order, store_ranks):
    common = [game for game in published_order if all(game in ranks for ranks in store_ranks)]
    conflicts, agreements, mixed = [], 0, 0
    for i, first in enumerate(common):
        for second in common[i + 1:]:
            positions = [[ranks[first], ranks[second]] for ranks in store_ranks]
            if all(a > b for a, b in positions):
                conflicts.append({"publishedHigher": first, "publishedLower": second,
                                  "storeRankPairs": positions})
            elif all(a < b for a, b in positions):
                agreements += 1
            else:
                mixed += 1
    return {"commonGames": common, "pairCount": len(common) * (len(common) - 1) // 2,
            "unanimousAgreements": agreements, "storeDisagreementsUnresolved": mixed,
            "conditionalProviderOrderConflicts": conflicts}


def main():
    paths = [
        "docs/research/appmagic-store-public-2026-09-11/jp-earlier-months.json",
        "docs/research/japan-earlier-monthly-orders-2026-09-11.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
        "docs/research/provider-lineage-and-lag-audit-2026-09-11.json",
    ]
    appmagic, sensor, original, novel = map(read_json, paths[:4])
    games = original["games"] + novel["games"]
    results = []
    for month in sensor["months"]:
        ranks, missing = [], []
        for scope, key in (("app_store_iphone", "ios"), ("google_play", "aos")):
            source = next(table for table in appmagic["tables"]
                          if table["storeScope"] == scope and table["period"] == month["period"])
            lookup = {}
            for game in games:
                for app_id in game["storeIds"][key]:
                    if app_id in lookup and lookup[app_id] != game["key"]:
                        raise ValueError("Provider identity lookup is ambiguous")
                    lookup[app_id] = game["key"]
            mapped = {}
            unmatched = []
            for rank, app_id in enumerate(source["orderedRepresentativeIds"], 1):
                if app_id not in lookup:
                    unmatched.append(app_id)
                else:
                    if lookup[app_id] in mapped:
                        raise ValueError("A provider table duplicates a modeled game family")
                    mapped[lookup[app_id]] = rank
            ranks.append(mapped)
            missing.append({"storeScope": scope, "unmappedIds": unmatched})
        result = compare_unanimous_order([row["game"] for row in month["rows"]], ranks)
        results.append({"period": month["period"], "storeOrder": ["app_store_iphone", "google_play"],
                        "mappingLimitations": missing, **result})
    output = {
        "schemaVersion": 1, "productionEnabled": False, "localModelEvaluated": False,
        "inputs": [input_fingerprint(path) for path in paths], "results": results,
        "limitations": [
            "This compares two products' published order evidence; it does not evaluate our model on missing historical rank observations.",
            "Only games linked in both preserved TOP30 store tables and the combined TOP25 table are compared.",
            "Games outside a list or with unmatched representative IDs are omitted, not assigned artificial ranks or zero revenue.",
            "If device, fee, family and estimation scope were equal, two stores unanimously ordering B above A would contradict a combined A-above-B order.",
            "Those scope equivalences are not fully established; iPhone-only versus possible iPad inclusion and vendor vintage are material limitations.",
            "Different product estimates under common ownership are not independent truth labels.",
            "No provider is selected as correct, no new coefficient is fitted and no revenue amount is synthesized."
        ],
    }
    (ROOT / "reports/rank-models/earlier-provider-consistency-2026-09-11.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
