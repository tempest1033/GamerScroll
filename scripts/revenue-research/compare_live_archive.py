"""Compare one public store snapshot with surrounding existing archive records."""
import csv
import json
from datetime import datetime
import numpy as np
from scipy.stats import spearmanr
from simulate import ROOT, read_json
from frozen_models import input_fingerprint


def main():
    source_path = "docs/research/appmagic-store-public-2026-09-11/us-iphone-live-september3.json"
    source = read_json(source_path)
    date = source["urlDate"]
    file = f"snapshots/rankings/{date}_ios_us_grossing.csv"
    grouped = {}
    with (ROOT / file).open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            grouped.setdefault(row["time"], {})[row["id"]] = int(row["rank"])
    reference = {app_id: rank for rank, app_id in enumerate(source["orderedIosIds"], 1)}
    # The explicit label is 23:00; do not choose a clock by which one matches best.
    label_time = source["selectedHourLabel"]
    rows = []
    for time, ranks in sorted(grouped.items()):
        common = sorted(set(reference) & ranks.keys())
        a, b = np.array([reference[k] for k in common]), np.array([ranks[k] for k in common])
        rows.append({
            "timeKst": time, "sharedIds": len(common),
            "top100Overlap": sum(ranks.get(k, 201) <= 100 for k in reference),
            "exactPositions": int(np.count_nonzero(a == b)),
            "medianAbsoluteRankDifference": float(np.median(np.abs(a - b))),
            "spearmanSharedIds": float(spearmanr(a, b).statistic),
            "robloxRank": ranks.get("431946152"),
            "hoursFromPublishedLabel": (
                datetime.fromisoformat(f"{date}T{time}") -
                datetime.fromisoformat(f"{date}T{label_time}")).total_seconds() / 3600,
        })
    target = datetime.fromisoformat(f"{date}T{label_time}")
    before = [row for row in rows if row["hoursFromPublishedLabel"] <= 0]
    after = [row for row in rows if row["hoursFromPublishedLabel"] >= 0]
    report = {
        "schemaVersion": 1, "productionEnabled": False,
        "inputs": [input_fingerprint(path) for path in (source_path, file)],
        "publishedLocalLabel": target.isoformat(), "allSameDateComparisons": rows,
        "chronologicalBrackets": {"before": before[-1] if before else None,
                                 "after": after[0] if after else None},
        "limitations": [
            "Chronological brackets are determined from timestamps, never minimum rank error.",
            "Archive writer timestamps are bucketed wall-clock times, not verified upstream update times.",
            "Shared TOP100 order agreement is not monetary validation.",
            "The same upstream Apple source is not an independent revenue measurement.",
            "A missing source TOP100 ID is not assigned rank 101 or zero revenue.",
        ],
    }
    (ROOT / "reports/rank-models/live-archive-comparison-2026-09-11.json").write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(report["chronologicalBrackets"]))


if __name__ == "__main__":
    main()
