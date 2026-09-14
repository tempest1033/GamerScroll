"""Separate same-product store-order coherence from cross-product disagreement."""
import json
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from earlier_provider_consistency import compare_unanimous_order


def main():
    paths = [
        "docs/research/appmagic-store-public-2026-09-11/jp-earlier-all-stores.json",
        "docs/research/appmagic-store-public-2026-09-11/jp-earlier-all-ios.json",
        "docs/research/appmagic-store-public-2026-09-11/jp-earlier-months.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
    ]
    combined, ios, mixed, original, novel = map(read_json, paths)
    games = original["games"] + novel["games"]
    lookup = {store: {app_id: game["key"] for game in games for app_id in game["storeIds"][store]}
              for store in ("ios", "aos")}
    all_ids = {**lookup["ios"], **lookup["aos"]}
    rows = []
    for source in combined["tables"]:
        ranks = []
        for dataset, scope, key in (
                (ios, "app_store_iphone_and_ipad", "ios"), (mixed, "google_play", "aos")):
            table = next(row for row in dataset["tables"] if row["period"] == source["period"]
                         and row["storeScope"] == scope)
            ranks.append({lookup[key][app_id]: rank for rank, app_id in enumerate(table["orderedRepresentativeIds"], 1)
                          if app_id in lookup[key]})
        ordered = [all_ids[app_id] for app_id in source["orderedRepresentativeIds"] if app_id in all_ids]
        if len(ordered) != len(set(ordered)):
            raise ValueError("The combined reference repeats a modeled family")
        rows.append({
            "period": source["period"], "storeOrder": ["app_store_iphone_and_ipad", "google_play"],
            "unmappedCombinedIds": [app_id for app_id in source["orderedRepresentativeIds"] if app_id not in all_ids],
            **compare_unanimous_order(ordered, ranks),
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "localModelEvaluated": False,
        "inputs": [input_fingerprint(path) for path in paths], "results": rows,
        "limitations": [
            "This examines one product's all-stores order against its displayed iPhone+iPad and Google Play orders.",
            "Only identities present in all required preserved views participate; missing games remain unranked.",
            "Absence of a unanimous-order conflict is a necessary coherence condition, not a proof of additive amounts or accuracy.",
            "Cross-product, fee, family and historical-vintage limitations are not removed.",
            "No previously passed model simulation or behavior test is repeated."
        ],
    }
    (ROOT / "reports/rank-models/earlier-internal-consistency-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{"period": row["period"], "games": len(row["commonGames"]),
                      "pairs": row["pairCount"], "conflicts": row["conditionalProviderOrderConflicts"]}
                     for row in rows], ensure_ascii=False))


if __name__ == "__main__":
    main()
