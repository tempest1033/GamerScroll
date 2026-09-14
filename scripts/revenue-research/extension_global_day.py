"""Frozen, ordinal-only five-versus-all-market coverage diagnostic."""
import json
import subprocess
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import numpy as np
from scipy.stats import spearmanr
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from temporal_transfer import interval_average
from weekly_growth import order_metrics

PLAN = "docs/research/revenue-extension-2026-09-11/new-period-coverage-plan.json"
LABELS = "docs/research/revenue-extension-2026-09-11/appmagic-september-daily-orders.json"
OUTPUT = "reports/rank-models/extension-global-day-order-2026-09-11.json"


def identity_lookup(games):
    lookup = {}
    for i, game in enumerate(games):
        for store, ids in game["storeIds"].items():
            for app_id in ids:
                key = (store, app_id)
                if key in lookup:
                    raise ValueError(f"Ambiguous frozen identity: {key}")
                lookup[key] = i
    return lookup


def map_reference(rows, lookup):
    mapped, missing = [], []
    for row in rows:
        url = urlparse(row["href"])
        parts = url.path.strip("/").split("/")
        if url.netloc != "appmagic.rocks" or len(parts) != 3:
            raise ValueError("Expected an exact AppMagic representative app href")
        store = {"iphone": "ios", "google-play": "aos"}[parts[0]]
        index = lookup.get((store, parts[-1]))
        (missing if index is None else mapped).append(
            {**row, "store": store, "appId": parts[-1], "gameIndex": index})
    if len({row["gameIndex"] for row in mapped}) != len(mapped):
        raise ValueError("Reference repeats one frozen product family")
    return mapped, missing


def build_charts(days, market, games):
    lookup = identity_lookup(games)
    charts = []
    for country in market["countries"]:
        for proxy_store, store in (("ios", "ios"), ("android", "aos")):
            weight = country["storeWeights"][proxy_store]
            if weight == 0:
                continue
            if not np.isfinite(weight) or weight < 0:
                raise ValueError("Invalid preserved store weight")
            key = f'{store}_{country["country"].lower()}_grossing'
            observations = []
            for day in days:
                source = day["lists"].get(key)
                if source is None:
                    continue
                if len(source["times"]) != len(source["ranks"]):
                    raise ValueError("Mismatched archive observations")
                for at, positions in zip(source["times"], source["ranks"]):
                    if not positions:
                        continue  # An empty response is not an observed zero game rank.
                    ranks = [[] for _ in games]
                    if len(set(positions)) != len(positions):
                        raise ValueError("A chart repeats an app identity")
                    for rank, app_index in enumerate(positions[:200], 1):
                        if not isinstance(app_index, int) or not 0 <= app_index < len(day["ids"]):
                            raise ValueError("Invalid archive app dictionary index")
                        game_index = lookup.get((store, day["ids"][app_index]))
                        if game_index is not None:
                            ranks[game_index].append(rank)
                    observations.append({
                        "at": f'{day["date"]}T{at}:00+09:00',
                        "time": datetime.fromisoformat(f'{day["date"]}T{at}:00+09:00').timestamp(),
                        "returnedRows": len(positions), "gameRanks": ranks})
            observations.sort(key=lambda row: row["time"])
            times = np.array([row["time"] for row in observations])
            if len(times) < 2 or np.any(np.diff(times) <= 0):
                raise ValueError(f"Insufficient or duplicate chart times: {key}")
            charts.append({"key": key, "country": country["country"], "store": store,
                           "weight": weight, "observations": observations, "times": times})
    if not np.isclose(sum(chart["weight"] for chart in charts), 1., atol=1e-10, rtol=0):
        raise ValueError("Full-scope store weights must retain a common unit denominator")
    return charts


def curve_levels(chart, definition, game_count):
    exponent = definition["exponents"]["cn" if chart["country"] == "CN" else chart["store"]]
    curve = np.arange(1, 201, dtype=float) ** -exponent
    curve /= curve.sum()
    values = np.zeros((len(chart["observations"]), game_count))
    for t, observation in enumerate(chart["observations"]):
        for game, ranks in enumerate(observation["gameRanks"]):
            values[t, game] = sum(curve[rank - 1] for rank in ranks)
    return values * chart["weight"] * 100


def integration_weights(times, start, end, method):
    coverage = interval_average(times, np.ones(len(times)), start, end, method=method)
    if coverage is None:
        return None
    basis = np.eye(len(times))
    weights = np.array([interval_average(times, basis[:, i], start, end, method=method)["mean"]
                        for i in range(len(times))])
    return weights, coverage


def paired_order(values, reference):
    selected = np.array([values[row["gameIndex"]] for row in reference])
    ranks = np.array([row["rank"] for row in reference])
    metrics = order_metrics(selected, ranks)
    left, right = np.triu_indices(len(selected), 1)
    ties = int(np.count_nonzero(selected[left] == selected[right]))
    spearman = float(spearmanr(-selected, ranks).statistic) if len(selected) > 1 else float("nan")
    return {**metrics, "tiedPairs": ties, "inversions": metrics["violations"] - ties / 2,
            "spearman": spearman if np.isfinite(spearman) else None}


def main():
    plan, labels = read_json(PLAN), read_json(LABELS)
    panel, market = read_json(plan["identityPanel"]), read_json(plan["marketProxyModel"])
    coverage = read_json(plan["observedEligibility"]["source"])
    if len(panel["games"]) != 42 or labels["metricType"] != "vendor_estimated_revenue_order":
        raise ValueError("The frozen cohort and ordinal target contract must be preserved")
    decoder = 'const s=require("./scripts/lib/global-rankings"); console.log(JSON.stringify(JSON.parse(process.argv[1]).map(d=>s.readDay(d))));'
    raw = subprocess.run(["node", "-e", decoder, json.dumps(plan["dates"])],
                         cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True)
    days = json.loads(raw.stdout)
    if any(day is None or day["v"] != 1 for day in days):
        raise ValueError("The diagnostic requires the preserved v1 day archives")
    charts = build_charts(days, market, panel["games"])
    lookup = identity_lookup(panel["games"])
    levels = {curve["id"]: [curve_levels(chart, curve, len(panel["games"])) for chart in charts]
              for curve in plan["curves"]}
    five = set(plan["coverageViews"][0]["countries"])
    results = []
    for day in labels["days"]:
        mapped, missing = map_reference(day["rows"], lookup)
        offsets = coverage["eligibleWholeDayUtcOffsets"][day["date"]]
        scenarios = []
        for offset in offsets:
            start = datetime.fromisoformat(day["date"]).replace(
                tzinfo=timezone(timedelta(hours=offset))).timestamp()
            end = start + 86400
            for method in plan["reconstructionScenarios"]:
                integrated = [integration_weights(chart["times"], start, end, method) for chart in charts]
                if any(item is None for item in integrated):
                    raise ValueError("An eligible window unexpectedly lacks bracketing observations")
                for curve in plan["curves"]:
                    contributions = np.array([item[0] @ values
                                              for item, values in zip(integrated, levels[curve["id"]])])
                    all_values = contributions.sum(axis=0)
                    partial_values = contributions[[i for i, c in enumerate(charts)
                                                     if c["country"] in five]].sum(axis=0)
                    scenarios.append({
                        "curve": curve["id"], "utcOffsetHours": offset, "reconstruction": method,
                        "startUtc": datetime.fromtimestamp(start, timezone.utc).isoformat(),
                        "endUtc": datetime.fromtimestamp(end, timezone.utc).isoformat(),
                        "maxBracketingGapHours": max(item[1]["maxBracketingGapHours"] for item in integrated),
                        "minimumInsideBuckets": min(item[1]["insideBuckets"] for item in integrated),
                        "fiveMarketOrder": paired_order(partial_values, mapped),
                        "allMarketOrder": paired_order(all_values, mapped),
                        "fiveMarketIndex": partial_values.tolist(), "allMarketIndex": all_values.tolist()})
        results.append({"date": day["date"], "sourceUrl": day["sourceUrl"],
                        "status": "conditional_clock_scenarios" if offsets else "unscored_no_full_day_coverage",
                        "mappedRows": mapped, "unmappedRows": missing, "scenarios": scenarios})
    parents = [PLAN, LABELS, plan["identityPanel"], plan["marketProxyModel"],
               plan["observedEligibility"]["source"], "scripts/revenue-research/extension_global_day.py",
               "scripts/revenue-research/temporal_transfer.py", "scripts/revenue-research/weekly_growth.py",
               "scripts/lib/global-rankings.js", "scripts/lib/snapshot-archive.js"]
    parents += [f"snapshots/global/{date}.json.br" for date in plan["dates"]]
    summaries = []
    for day in results:
        for curve in plan["curves"]:
            rows = [row for row in day["scenarios"] if row["curve"] == curve["id"]]
            if not rows:
                continue
            differences = [row["allMarketOrder"]["violations"] - row["fiveMarketOrder"]["violations"]
                           for row in rows]
            summaries.append({
                "date": day["date"], "curve": curve["id"], "scenarios": len(rows),
                "games": len(day["mappedRows"]), "pairs": rows[0]["allMarketOrder"]["pairs"],
                "fiveMarketViolationsRange": [min(row["fiveMarketOrder"]["violations"] for row in rows),
                                               max(row["fiveMarketOrder"]["violations"] for row in rows)],
                "allMarketViolationsRange": [min(row["allMarketOrder"]["violations"] for row in rows),
                                              max(row["allMarketOrder"]["violations"] for row in rows)],
                "pairedViolationDifferenceRange": [min(differences), max(differences)],
                "improvedScenarios": sum(value < 0 for value in differences),
                "unchangedScenarios": sum(value == 0 for value in differences),
                "worsenedScenarios": sum(value > 0 for value in differences)})
    result = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False, "outputIsRevenue": False,
        "newModelAdopted": False, "inputs": [input_fingerprint(path) for path in parents],
        "games": panel["games"], "curveDefinitions": plan["curves"],
        "weightMass": {"all": sum(c["weight"] for c in charts),
                       "five": sum(c["weight"] for c in charts if c["country"] in five)},
        "charts": [{"key": c["key"], "weight": c["weight"], "observations": len(c["times"]),
                    "firstAt": c["observations"][0]["at"], "lastAt": c["observations"][-1]["at"],
                    "returnedRowRange": [min(o["returnedRows"] for o in c["observations"]),
                                         max(o["returnedRows"] for o in c["observations"])]} for c in charts],
        "results": results, "summaries": summaries,
        "limitations": [
            "This transfers frozen shapes, not round-13 fitted money coefficients.",
            "128 proxy-weighted markets are not verified worldwide spending or complete product-family coverage.",
            "The provider reporting clock is unknown; none of the eight supported clocks is selected by performance.",
            "Missing collection intervals are bridged only by the explicitly named reconstruction scenarios; gaps are reported.",
            "A nonempty short source chart is preserved as returned; outside-chart absence is zero modeled contribution, not zero revenue.",
            "Historical device scope, vendor family aggregation, fees and tax conventions remain unresolved.",
            "Unmapped rows are listed, not fitted or silently added to the frozen 42-game cohort.",
            "September 9 is retained as reference only and has no fabricated full-day score.",
            "Daily vendor labels were read after the plan, but familiar games, provider lineage and previous label exposure remain dependent.",
            "Order-only diagnostic: no monetary accuracy claim, curve selection, deployment or publication."
        ]}
    with (ROOT / OUTPUT).open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
    print(json.dumps({"summaries": summaries,
                      "maxGapHours": max(s["maxBracketingGapHours"] for d in results for s in d["scenarios"]),
                      "unmapped": {d["date"]: [r["title"] for r in d["unmappedRows"]] for d in results}},
                     ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
