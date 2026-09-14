"""Isolate the earlier provider comparison's iPhone-only device limitation."""
import json
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from earlier_provider_consistency import compare_unanimous_order


def main():
    paths = [
        "docs/research/appmagic-store-public-2026-09-11/jp-earlier-all-ios.json",
        "docs/research/appmagic-store-public-2026-09-11/jp-earlier-months.json",
        "docs/research/japan-earlier-monthly-orders-2026-09-11.json",
        "reports/rank-models/earlier-provider-consistency-2026-09-11.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
    ]
    combined, previous_sources, sensor, previous, original, novel = map(read_json, paths)
    games = original["games"] + novel["games"]
    lookup = {store: {app_id: game["key"] for game in games for app_id in game["storeIds"][store]}
              for store in ("ios", "aos")}
    rows = []
    for month in sensor["months"]:
        all_ios = next(table for table in combined["tables"] if table["period"] == month["period"])
        google = next(table for table in previous_sources["tables"]
                      if table["period"] == month["period"] and table["storeScope"] == "google_play")
        if all_ios["storeScope"] != "app_store_iphone_and_ipad":
            raise ValueError("The added reference must explicitly combine iPhone and iPad")
        mapped, unresolved = [], []
        for source, identity in ((all_ios, "ios"), (google, "aos")):
            ids = source["orderedRepresentativeIds"]
            if len(ids) != len(set(ids)):
                raise ValueError("Duplicate representative IDs")
            ranks = {lookup[identity][app_id]: rank for rank, app_id in enumerate(ids, 1)
                     if app_id in lookup[identity]}
            if len(ranks) != sum(app_id in lookup[identity] for app_id in ids):
                raise ValueError("Multiple source representatives resolve to one game")
            mapped.append(ranks)
            unresolved.append({"storeScope": source["storeScope"],
                               "ids": [app_id for app_id in ids if app_id not in lookup[identity]]})
        before = next(row for row in previous["results"] if row["period"] == month["period"])
        retained = compare_unanimous_order(before["commonGames"], mapped)
        expanded = compare_unanimous_order([row["game"] for row in month["rows"]], mapped)
        rows.append({
            "period": month["period"], "storeOrder": ["app_store_iphone_and_ipad", "google_play"],
            "previousCohort": {
                "games": before["commonGames"], "pairCount": before["pairCount"],
                "conflictsReused": before["conditionalProviderOrderConflicts"]},
            "samePreviouslyComparedGames": retained, "allNowComparableGames": expanded,
            "unmappedRepresentatives": unresolved,
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "localModelEvaluated": False,
        "inputs": [input_fingerprint(path) for path in paths], "results": rows,
        "limitations": [
            "Only the iOS device reference is changed; the prior Google Play and Sensor Tower tables are reused.",
            "The previously compared cohort and newly comparable games are reported separately.",
            "Residual differences cannot be explained solely by using an iPhone-only instead of the displayed iPhone+iPad order.",
            "Fee definitions, regional product families, later estimate revisions and the article's exact device semantics remain unresolved.",
            "This does not identify which product's estimate is accurate or validate our model in an unobserved period.",
            "No earlier successful model or verification run is replayed."
        ],
    }
    (ROOT / "reports/rank-models/earlier-device-scope-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{
        "period": row["period"],
        "priorConflicts": len(row["previousCohort"]["conflictsReused"]),
        "sameCohortConflicts": row["samePreviouslyComparedGames"]["conditionalProviderOrderConflicts"],
        "expandedGames": len(row["allNowComparableGames"]["commonGames"]),
        "expandedConflicts": row["allNowComparableGames"]["conditionalProviderOrderConflicts"],
    } for row in rows], ensure_ascii=False))


if __name__ == "__main__":
    main()
