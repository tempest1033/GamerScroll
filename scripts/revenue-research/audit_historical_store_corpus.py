"""Inspect archival chart inputs without inventing ranks or market scope."""

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "docs/research/revenue-five-hour-2026-09-11/sources"
SPECS = (
    {
        "filename": "osf-google-play-grossing-games-2013-2019.csv",
        "expected_width": 7,
        "chart_label": "Top Grossing Games",
        "header_policy": "The seven-column header matches the inspected row layout.",
    },
    {
        "filename": "osf-itunes-charts-2010-2019.csv",
        "expected_width": 10,
        "chart_label": "iTunes Charts",
        "header_policy": (
            "The raw header has twelve fields, including two leading constants; "
            "inspected records have ten fields. Positions below describe raw "
            "records for diagnostics, not a silent header repair."
        ),
    },
)


def analyze_rows(rows, expected_width):
    """Report observed fields, missingness and capture coverage from raw rows."""
    iterator = iter(rows)
    header = next(iterator)
    totals = Counter()
    widths = Counter()
    rejected_examples = []
    noninteger_rank_examples = Counter()
    snapshots = defaultdict(lambda: {"rows": 0, "ranks": [], "app_ids": set()})
    months = defaultdict(Counter)
    app_counts = Counter()
    labels = Counter()
    for row in iterator:
        if not row or not any(row):
            totals["blank_rows"] += 1
            continue
        totals["nonblank_rows"] += 1
        widths[len(row)] += 1
        if len(row) != expected_width:
            totals["wrong_width_rows"] += 1
            if len(rejected_examples) < 5:
                rejected_examples.append(row)
            continue
        totals["expected_width_rows"] += 1
        labels[(row[0], row[1])] += 1
        raw_capture, raw_rank, app_id = row[2], row[3], row[6]
        try:
            if len(raw_capture) != 14 or not raw_capture.isascii():
                raise ValueError("Not a canonical Wayback timestamp")
            captured_at = datetime.strptime(raw_capture, "%Y%m%d%H%M%S").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            totals["invalid_capture_rows"] += 1
            continue
        month = captured_at.strftime("%Y-%m")
        months[month]["rows"] += 1
        observation = snapshots[captured_at]
        observation["rows"] += 1
        if app_id:
            observation["app_ids"].add(app_id)
            app_counts[app_id] += 1
        else:
            totals["missing_app_id_rows"] += 1
        if not raw_rank:
            totals["missing_explicit_rank_rows"] += 1
            months[month]["missing_explicit_rank_rows"] += 1
        elif raw_rank.isascii() and raw_rank.isdigit() and int(raw_rank) > 0:
            rank = int(raw_rank)
            observation["ranks"].append(rank)
            totals["positive_integer_rank_rows"] += 1
            months[month]["positive_integer_rank_rows"] += 1
        else:
            totals["noninteger_rank_rows"] += 1
            noninteger_rank_examples[raw_rank] += 1

    ordered = sorted(snapshots)
    lengths = Counter()
    capture_status = Counter()
    for captured_at, observation in snapshots.items():
        ranks = observation["ranks"]
        size = observation["rows"]
        lengths[size] += 1
        month = captured_at.strftime("%Y-%m")
        months[month]["captures"] += 1
        if len(ranks) != size:
            capture_status["captures_with_missing_or_invalid_ranks"] += 1
        if len(set(ranks)) != len(ranks):
            capture_status["captures_with_duplicate_explicit_ranks"] += 1
        if len(observation["app_ids"]) != size:
            capture_status["captures_with_missing_or_duplicate_app_ids"] += 1
        if (
            len(ranks) == size
            and len(observation["app_ids"]) == size
            and sorted(ranks) == list(range(1, size + 1))
        ):
            capture_status["captures_with_explicit_contiguous_rank_sequence"] += 1
            months[month]["captures_with_explicit_contiguous_rank_sequence"] += 1
    for month in months:
        months[month]["distinct_capture_dates"] = len(
            {date.date() for date in ordered if date.strftime("%Y-%m") == month}
        )
    gaps = [
        (right - left).total_seconds() / 3600
        for left, right in zip(ordered, ordered[1:])
    ]
    return {
        "raw_header": header,
        "raw_header_width": len(header),
        "observed_record_widths": dict(sorted(widths.items())),
        "counts": dict(totals),
        "capture_counts": dict(capture_status),
        "capture_count": len(ordered),
        "distinct_capture_dates": len({date.date() for date in ordered}),
        "first_capture_utc": ordered[0].isoformat() if ordered else None,
        "last_capture_utc": ordered[-1].isoformat() if ordered else None,
        "largest_capture_gap_hours": max(gaps) if gaps else None,
        "capture_row_count_distribution": dict(sorted(lengths.items())),
        "store_and_chart_labels": [
            {"store": label[0], "chart": label[1], "rows": count}
            for label, count in sorted(labels.items())
        ],
        "unique_app_ids": len(app_counts),
        "most_frequently_observed_app_ids": app_counts.most_common(10),
        "months": {key: dict(months[key]) for key in sorted(months)},
        "wrong_width_examples": rejected_examples,
        "noninteger_rank_examples": noninteger_rank_examples.most_common(10),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "reports/rank-models/five-hour-historical-corpus-audit-2026-09-11.json",
    )
    args = parser.parse_args()
    manifest = json.loads(
        (args.source_root / "osf-download-manifest.json").read_text(encoding="utf-8")
    )
    receipts = {Path(item["path"]).name: item for item in manifest if "path" in item}
    results = []
    for spec in SPECS:
        path = args.source_root / spec["filename"]
        with path.open(encoding="utf-8-sig", newline="") as source:
            result = analyze_rows(csv.reader(source, delimiter=";"), spec["expected_width"])
        results.append(
            {
                **spec,
                "source_url": receipts[spec["filename"]]["url"],
                "source_sha256_from_download_receipt": receipts[spec["filename"]]["sha256"],
                "diagnostic": result,
                "market_scope_confirmed": False,
                "scoring_eligible": False,
            }
        )
    report = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "production_enabled": False,
        "source_project": "https://osf.io/t29g8/",
        "attribution": [
            "Fernando van der Vlist",
            "Anne Helmond",
            "Esther Weltevrede",
        ],
        "license": "CC-BY-4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "transform": "Diagnostic counts derived from unmodified source CSVs.",
        "semantics": [
            "Missing ranks remain missing; file row order is not a recovered ranking.",
            "Capture timestamps are archival observations, not vendor revenue-day boundaries.",
            "Contiguous observed positions do not establish coverage of an entire market.",
            "iTunes Charts is not automatically a grossing chart.",
            "No country has been assigned from app-listing locale or archive-server location.",
        ],
        "datasets": results,
    }
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write("\n")
    for result in results:
        diagnostic = result["diagnostic"]
        print(result["filename"])
        print(json.dumps({
            "counts": diagnostic["counts"],
            "record_widths": diagnostic["observed_record_widths"],
            "captures": diagnostic["capture_count"],
            "first": diagnostic["first_capture_utc"],
            "last": diagnostic["last_capture_utc"],
            "capture_counts": diagnostic["capture_counts"],
        }, ensure_ascii=False))
    print(args.output)


if __name__ == "__main__":
    main()
