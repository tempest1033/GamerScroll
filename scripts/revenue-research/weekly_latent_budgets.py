"""Can unknown daily store budgets explain the complete frozen weekly order?

Allocation solutions are mathematical witnesses, never measured or imputed money.
"""
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import curve_scores
from temporal_transfer import interval_average
from order_feasibility import strict_order_feasibility


def main():
    paths = [
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.json",
    ]
    old, new, cohort = map(read_json, paths)
    games = old["games"] + new["games"]
    start = datetime.fromisoformat(cohort["period"]["start"])
    end = datetime.fromisoformat(cohort["period"]["end"])
    dates = [(start + timedelta(days=i)).date().isoformat() for i in range((end - start).days + 1)]
    kst = timezone(timedelta(hours=9))
    bounds = (
        start.replace(tzinfo=timezone(timedelta(hours=14))).timestamp(),
        (end + timedelta(days=1)).replace(tzinfo=timezone(timedelta(hours=-12))).timestamp())
    rows, pointwise, series_by_store, daily_caches = [], [], [], {}
    for s, store in enumerate(cohort["cohorts"]):
        kind = ("app_store", "google_play")[s]
        original = next(chart for chart in old["charts"] if chart["country"] == "JP" and chart["store"] == kind)
        novel = next(chart for chart in new["charts"] if chart["country"] == "JP" and chart["store"] == kind)
        if [row["at"] for row in original["observations"]] != [row["at"] for row in novel["observations"]]:
            raise ValueError("Expanded and original chart observation clocks differ")
        full_times = np.array([datetime.fromisoformat(row["at"]).replace(tzinfo=kst).timestamp()
                               for row in original["observations"]])
        left = max(0, np.searchsorted(full_times, bounds[0], side="right") - 1)
        right = min(len(full_times), np.searchsorted(full_times, bounds[1]) + 1)
        times = full_times[left:right]
        ranks = [first["gameRanks"] + second["gameRanks"] for first, second in zip(
            original["observations"][left:right], novel["observations"][left:right])]
        mapped = store["mapped"]
        mapped_indices = [row["index"] for row in mapped]
        perfect = np.zeros((old["rankLimit"], 2, old["rankLimit"]))
        perfect[:, s] = np.eye(old["rankLimit"])
        signals = {}
        for model in cohort["models"]:
            exponent = model["parameters"][s]
            if exponent in signals:
                continue
            weights = curve_scores(perfect, *(model["parameters"]), 1 if s == 0 else 0)
            signals[exponent] = np.array([
                [sum(weights[rank - 1] for rank in snapshot[index]) for snapshot in ranks]
                for index in mapped_indices])
        series_by_store.append((times, signals))
        for p, first in enumerate(mapped):
            for second in mapped[p + 1:]:
                # A per-observation CDF comparison also covers each convex reconstruction.
                opportunities = 0
                for snapshot in ranks:
                    diff = np.zeros(old["rankLimit"])
                    for rank in snapshot[first["index"]]:
                        diff[rank - 1] += 1
                    for rank in snapshot[second["index"]]:
                        diff[rank - 1] -= 1
                    opportunities += int(np.any(np.cumsum(diff) > 0))
                if opportunities == 0:
                    pointwise.append({
                        "storeScope": store["storeScope"], "publishedHigher": first["game"],
                        "publishedLower": second["game"],
                        "bracketingObservations": len(ranks),
                        "interpretation": "No allowed cutoff at any bracketing snapshot favors the published higher game.",
                    })
    for method in ("linear", "previous", "next"):
        for clock in range(105):
            offset = -12 + clock * .25
            tz = timezone(timedelta(hours=offset))
            windows = [(datetime.fromisoformat(date).replace(tzinfo=tz).timestamp(),
                        (datetime.fromisoformat(date) + timedelta(days=1)).replace(tzinfo=tz).timestamp())
                       for date in dates]
            for s, store in enumerate(cohort["cohorts"]):
                times, signals = series_by_store[s]
                for exponent, values in signals.items():
                    daily = np.empty((len(values), len(dates)))
                    maximum_gap = 0.
                    for g, value in enumerate(values):
                        for d, (a, b) in enumerate(windows):
                            interval = interval_average(times, value, a, b, method=method)
                            if interval is None:
                                raise ValueError("Daily allocation window lacks bracketing observations")
                            daily[g, d] = interval["mean"]
                            maximum_gap = max(maximum_gap, interval["maxBracketingGapHours"])
                    cache_key = f"{s}:{exponent}:{method}"
                    daily_caches.setdefault(cache_key, []).append(daily)
                    result = strict_order_feasibility(daily)
                    rows.append({
                        "storeScope": store["storeScope"], "method": method,
                        "utcOffsetHours": offset, "frozenExponent": exponent,
                        "modelIds": [model["id"] for model in cohort["models"]
                                     if model["parameters"][s] == exponent],
                        "maxBracketingGapHours": maximum_gap, **result,
                    })
            if (clock + 1) % 35 == 0:
                print(json.dumps({"method": method, "completedClocks": clock + 1}), flush=True)
    summaries = []
    for s, store in enumerate(cohort["cohorts"]):
        for exponent in series_by_store[s][1]:
            own = [row for row in rows if row["storeScope"] == store["storeScope"]
                   and row["frozenExponent"] == exponent]
            summaries.append({
                "storeScope": store["storeScope"], "frozenExponent": exponent,
                "modelIds": own[0]["modelIds"], "scenarios": len(own),
                "statusCounts": dict(Counter(row["status"] for row in own)),
                "maximumMarginRange": [min(row["maximumCommonMargin"] for row in own),
                                       max(row["maximumCommonMargin"] for row in own)],
            })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "coefficientsChanged": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": cohort["period"], "dates": dates, "summaries": summaries, "rows": rows,
        "pointwiseConflictsAcrossEntireClockUnion": pointwise,
        "limitations": [
            "Fixed archived exponents are tested, not reselected; equal exponents share one calculation.",
            "The daily unit simplex lets TOP200 store budgets vary freely; weights are not observed market spending.",
            "Within each day, the time-integrated rank score is still used; intraday spending remains unidentified.",
            "Strict feasibility is a conditional existence result, not a good monetary estimate.",
            "Negative maximum margins mean even weak full ordering fails at solver tolerance for this fixed curve.",
            "Near-zero margins are unresolved at numerical tolerance and are not exact impossibility certificates.",
            "Pointwise conflicts cover all bracketing snapshots of the full clock union and convex reconstruction conventions.",
            "Such pointwise conflicts exclude positive order under any nonnegative time allocation and monotone curve in this archive model.",
            "Unobserved rank changes, TOP200 truncation, game-family scope and vendor estimates remain unverified."
        ],
    }
    target = ROOT / "reports/rank-models/weekly-latent-budgets-2026-09-11.json"
    np.savez_compressed(target.with_suffix(".daily-signals.npz"),
                        **{key: np.array(value) for key, value in daily_caches.items()})
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"summaries": summaries, "pointwiseConflicts": pointwise}, ensure_ascii=False))


if __name__ == "__main__":
    main()
