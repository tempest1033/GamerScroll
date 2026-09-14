"""Extract explicitly delimited 4Gamer revenue tables from preserved tool output."""
import argparse
import hashlib
import json
import re
from pathlib import Path


def extract_page(text, url):
    marker = url + " ("
    start = text.index(marker)
    end = text.find("\nhttps://", start + len(marker))
    return text[start:end if end >= 0 else len(text)].strip()


def parse_table(page):
    section = page.split("## スマホゲームの国内収益ランキング\n", 1)[1]
    date = re.match(r"（(\d{4})年(\d+)月(\d+)日〜(\d+)月(\d+)日）", section)
    if not date:
        raise ValueError("Explicit same-year Japanese weekly date range required")
    year, month, day, end_month, end_day = map(int, date.groups())
    rows = []
    for line in section.splitlines():
        if line.startswith("※"):
            break
        cells = [value.strip() for value in line.strip().split("|")[1:-1]]
        if len(cells) != 5 or not cells[0].isdigit():
            continue
        def number(value):
            return None if value == "-" else int(value.removesuffix("％"))
        rows.append({"rank": int(cells[0]), "previousRank": number(cells[1]),
                     "publishedName": cells[2], "downloadGrowthPercent": number(cells[3]),
                     "revenueGrowthPercent": number(cells[4])})
    if [row["rank"] for row in rows] != list(range(1, 51)):
        raise ValueError("Expected exactly the complete published TOP50, without a second table")
    return {"start": f"{year:04}-{month:02}-{day:02}",
            "end": f"{year:04}-{end_month:02}-{end_day:02}"}, rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--url", action="append", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    artifact = Path(args.artifact)
    original = artifact.read_bytes()
    text = original.decode("utf-8")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for url in args.url:
        page = extract_page(text, url)
        period, rows = parse_table(page)
        stem = "japan-week-" + period["start"]
        source_path = output / (stem + ".source.md")
        source_path.write_text(page + "\n", encoding="utf-8")
        data = {
            "schemaVersion": 1, "provider": "Sensor Tower", "publisher": "4Gamer",
            "sourceUrl": url, "geography": "JP", "stores": ["app_store", "google_play"],
            "period": period, "reportingTimezone": "unconfirmed",
            "feeBasis": "unspecified_in_table", "rows": rows,
            "role": "rank_and_relative_growth_reference_not_revenue_amount",
            "retrievedOn": "2026-09-11", "sourceFile": source_path.as_posix(),
            "sourceSha256": hashlib.sha256((page + "\n").encode()).hexdigest(),
            "artifactSha256": hashlib.sha256(original).hexdigest(),
            "limitations": [
                "Provider estimates, not developer-verified transaction data.",
                "TOP50 selection conditions on the current week; absent games are censored, not zero.",
                "Revenue growth and download growth are separate fields.",
                "Growth percentages are rounded and do not identify absolute revenue.",
                "Windows overlapping August are not independent of the August training period."
            ]
        }
        (output / (stem + ".json")).write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        results.append({"period": period, "rows": len(rows)})
    print(json.dumps(results))


if __name__ == "__main__":
    main()
