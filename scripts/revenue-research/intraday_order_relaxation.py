"""A deliberately loose intraday allocation test, not a new revenue estimator."""
import json
from datetime import datetime, timedelta, timezone
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import curve_scores
from order_feasibility import strict_order_feasibility


def compact_witness(result, timestamps, cutoffs=None):
    weights = result.pop("basisWeights")
    if weights is not None:
        active = np.flatnonzero(np.asarray(weights) > 0)
        result["latentAllocationAtoms"] = [
            {"atKst": timestamps[int(i) if cutoffs is None else int(i) // cutoffs],
             "cutoff": None if cutoffs is None else int(i) % cutoffs + 1,
             "weight": weights[int(i)]}
            for i in active]
    return result


def union_histogram(old, new, cohort, s, store, extra_shift_hours=0):
    """Preserve raw integer rank atoms spanning every previously specified clock."""
    start = datetime.fromisoformat(cohort["period"]["start"])
    end = datetime.fromisoformat(cohort["period"]["end"]) + timedelta(days=1)
    lower = start.replace(tzinfo=timezone(timedelta(hours=14))).timestamp()
    if not np.isfinite(extra_shift_hours) or extra_shift_hours < 0:
        raise ValueError("The relaxation's additional forward shift must be finite and nonnegative")
    upper = end.replace(tzinfo=timezone(timedelta(hours=-12))).timestamp() + extra_shift_hours * 3600
    kind = ("app_store", "google_play")[s]
    first = next(chart for chart in old["charts"] if chart["country"] == "JP" and chart["store"] == kind)
    second = next(chart for chart in new["charts"] if chart["country"] == "JP" and chart["store"] == kind)
    if [row["at"] for row in first["observations"]] != [row["at"] for row in second["observations"]]:
        raise ValueError("Original and expanded intraday clocks disagree")
    times = np.array([datetime.fromisoformat(row["at"]).replace(
        tzinfo=timezone(timedelta(hours=9))).timestamp() for row in first["observations"]])
    if len(times) < 2 or lower < times[0] or upper > times[-1] or np.any(np.diff(times) <= 0):
        raise ValueError("The entire clock/shift union must have ordered boundary observations")
    left = max(0, int(np.searchsorted(times, lower, side="right")) - 1)
    right = min(len(times), int(np.searchsorted(times, upper)) + 1)
    stamps = [row["at"] for row in first["observations"][left:right]]
    hist = np.zeros((len(store["mapped"]), right - left, old["rankLimit"]))
    for t, (a, b) in enumerate(zip(first["observations"][left:right], second["observations"][left:right])):
        ranks = a["gameRanks"] + b["gameRanks"]
        for g, game in enumerate(store["mapped"]):
            for rank in ranks[game["index"]]:
                hist[g, t, rank - 1] += 1
    return hist, stamps


def main():
    paths = [
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.json",
        "reports/rank-models/weekly-latent-budgets-2026-09-11.json",
    ]
    old, new, cohort, daily = map(read_json, paths)
    rows = []
    for s, store in enumerate(cohort["cohorts"]):
        hist, stamps = union_histogram(old, new, cohort, s, store)
        basis = np.zeros((old["rankLimit"], 2, old["rankLimit"]))
        basis[:, s] = np.eye(old["rankLimit"])
        distinct = {}
        for model in cohort["models"]:
            exponent = model["parameters"][s]
            if exponent in distinct:
                distinct[exponent].append(model["id"])
            else:
                distinct[exponent] = [model["id"]]
        for exponent, ids in distinct.items():
            representative = next(model for model in cohort["models"] if model["id"] == ids[0])
            weights = curve_scores(basis, *representative["parameters"], 1 if s == 0 else 0)
            result = strict_order_feasibility(hist @ weights)
            rows.append({
                "storeScope": store["storeScope"], "curveScope": "frozen_stationary",
                "frozenExponent": exponent, "modelIds": ids,
                "observationAtoms": len(stamps), "orderedGames": [game["game"] for game in store["mapped"]],
                **compact_witness(result, stamps),
            })
        free_features = (np.cumsum(hist, axis=2) / np.arange(1, old["rankLimit"] + 1)).reshape(len(hist), -1)
        result = strict_order_feasibility(free_features)
        rows.append({
            "storeScope": store["storeScope"], "curveScope": "arbitrary_monotone_curve_at_each_atom",
            "observationAtoms": len(stamps), "allowedTimeCutoffAtoms": free_features.shape[1],
            "orderedGames": [game["game"] for game in store["mapped"]],
            **compact_witness(result, stamps, old["rankLimit"]),
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "parametersAdopted": False,
        "inputs": [input_fingerprint(path) for path in paths],
        "period": cohort["period"], "windowScope": "union_of_all_105_clocks_plus_bracketing_snapshots",
        "rows": rows,
        "limitations": [
            "This union is broader than any actual seven-day reporting period; favorable atomic allocations are a relaxation only.",
            "Arbitrary intraday weights need not correspond to feasible continuous spending or measured daily store totals.",
            "The free-curve case even allows the monotone rank curve to vary by atom, rather than remain stationary.",
            "A feasible relaxed order does not establish that a fixed-curve model or any actual clock is valid.",
            "Numerically infeasible relaxed order would rule out the corresponding narrower model at solver tolerance only.",
            "Positive witnesses are constructed using all published order labels and are not held-out predictions.",
            "No money is assigned and no fitted curve, spending path or clock is adopted.",
            "Game family, vendor estimation, TOP200 truncation and unobserved rank paths remain conditional."
        ],
    }
    (ROOT / "reports/rank-models/intraday-order-relaxation-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{
        key: row[key] for key in ("storeScope", "curveScope", "status", "maximumCommonMargin")}
        for row in rows]))


if __name__ == "__main__":
    main()
