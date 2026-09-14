"""Evaluate fixed two-store index implications without fitting monetary labels."""

import calendar
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/research/revenue-five-hour-2026-09-11"
OUTPUT = ROOT / "reports/rank-models/fgo-monthly-growth-bounds-2026-09-11.json"


def monthly_index_bounds(ranks, exponent, rank_limit=200):
    if not ranks or not math.isfinite(exponent) or exponent <= 0:
        raise ValueError("A nonempty calendar and positive finite exponent are required")
    if not isinstance(rank_limit, int) or isinstance(rank_limit, bool) or rank_limit < 1:
        raise ValueError("The rank limit must be a positive integer")
    known_sum = 0.0
    unknown = outside = 0
    for rank in ranks:
        if rank is None:
            unknown += 1
        elif not isinstance(rank, int) or isinstance(rank, bool) or rank < 1:
            raise ValueError("An observed rank must be a positive integer or None")
        elif rank > rank_limit:
            outside += 1
        else:
            known_sum += rank ** -exponent
    return {
        "lower": known_sum / len(ranks),
        "upper": (known_sum + unknown) / len(ranks),
        "calendarDays": len(ranks),
        "unknownDays": unknown,
        "observedBeyondLimitDays": outside,
    }


def growth_interval(baseline, comparison):
    if baseline["lower"] <= 0:
        raise ValueError("Baseline index must have a strictly positive lower bound")
    return {
        "lower": comparison["lower"] / baseline["upper"],
        "upper": comparison["upper"] / baseline["lower"],
    }


def lower_bound_mixture(ios, google, threshold):
    """Bound July's Google contribution using a one-sided August/July ratio."""
    values = [ios["lower"], ios["upper"], google["lower"], google["upper"], threshold]
    if not all(math.isfinite(value) and value >= 0 for value in values):
        raise ValueError("Growth bounds and threshold must be finite and nonnegative")
    if ios["lower"] > ios["upper"] or google["lower"] > google["upper"]:
        raise ValueError("Growth interval endpoints are reversed")
    a, b = ios["upper"], google["upper"]
    if max(a, b) < threshold:
        allowed = None
    elif min(a, b) >= threshold:
        allowed = [0.0, 1.0]
    elif b > a:
        allowed = [(threshold - a) / (b - a), 1.0]
    else:
        allowed = [0.0, (a - threshold) / (a - b)]
    return {
        "combinedGrowthEnvelope": {
            "lower": min(ios["lower"], google["lower"]),
            "upper": max(a, b),
        },
        "baselineGoogleContributionIntervalNotRuledOut": allowed,
        "incompatibleWithReportedLowerThreshold": allowed is None,
        "allAppStoreContributionRuledOut": a < threshold,
        "allGooglePlayContributionRuledOut": b < threshold,
    }


def calendar_ranks(rows, month, rank_column):
    year, number = map(int, month.split("-"))
    days = calendar.monthrange(year, number)[1]
    by_day = {}
    for row in rows:
        day = int(str(row[0]).removesuffix("日"))
        if not 1 <= day <= days or day in by_day:
            raise ValueError("Duplicate or out-of-calendar day")
        value = row[rank_column]
        by_day[day] = None if value == "" or value is None else int(value)
    if set(by_day) != set(range(1, days + 1)):
        raise ValueError("Preserve every calendar day explicitly, including unknown ranks")
    return [by_day[day] for day in range(1, days + 1)]


def load(name):
    return json.loads((EVIDENCE / name).read_text(encoding="utf-8"))


def main():
    plan = load("fgo-monthly-growth-diagnostic-plan.json")
    ios = load("game-i-fgo-ios-june-july.json")
    google = load("game-i-fgo-google-play-june-july.json")
    august = load("game-i-fgo-august.json")
    baseline = {
        "app_store": calendar_ranks(ios["raw_rows"], "2026-07", 4),
        "google_play": calendar_ranks(next(
            row["rows"] for row in google["series"]
            if row["period_start"] == "2026-07-01"), "2026-07", 1),
    }
    comparison = {}
    for series in august["series"]:
        if series["columns"] != ["day", "inferred_current", "observed_current"]:
            raise ValueError("Unexpected source-column contract")
        if series["store"] in comparison:
            raise ValueError("Duplicate store series")
        comparison[series["store"]] = calendar_ranks(series["rows"], "2026-08", 2)
    if set(comparison) != set(baseline):
        raise ValueError("Both and only the two eligible store series are required")
    target = plan["comparison"]["primary_source_growth"]
    if target["comparison_operator"] != ">=":
        raise ValueError("This diagnostic accepts a reported lower threshold only")
    results = []
    for model in plan["fixed_comparators"]:
        indices, growth = {}, {}
        for store in baseline:
            exponent = model[f"{store}_exponent"]
            before = monthly_index_bounds(baseline[store], exponent)
            after = monthly_index_bounds(comparison[store], exponent)
            indices[store] = {"baseline": before, "comparison": after}
            growth[store] = growth_interval(before, after)
        results.append({
            "id": model["id"],
            "exponents": {store: model[f"{store}_exponent"] for store in baseline},
            "monthlyIndexBounds": indices,
            "storeGrowthIntervals": growth,
            **lower_bound_mixture(
                growth["app_store"], growth["google_play"], target["payment_ratio_threshold"]),
        })
    report = {
        "schemaVersion": 1,
        "productionEnabled": False,
        "refitted": False,
        "newModelSelected": False,
        "kind": "conditional_fixed_index_lower_bound_diagnostic",
        "game": plan["game"],
        "geography": "JP",
        "baselineMonth": "2026-07",
        "comparisonMonth": "2026-08",
        "rankUniverse": "provider_overall_apps_not_project_game_only",
        "sourceGrowthThreshold": target,
        "results": results,
        "limitations": plan["required_caveats"],
        "interpretation": [
            "Contribution is a game's July payment mixture, not the market's store share.",
            "The threshold has no upper endpoint. Do not replace it by equality to 4.4 or 4.42.",
            "Missing-day endpoints are possibilities, never recovered observations.",
            "This does not replay round 13, establish monetary accuracy or identify store coefficients.",
        ],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
                      encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT.relative_to(ROOT)), "results": results},
                     ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
