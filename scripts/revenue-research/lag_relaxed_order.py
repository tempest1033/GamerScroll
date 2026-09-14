"""Test a wider 0-48h forward-lag union without selecting a favorable lag."""
import json
from datetime import datetime, timedelta, timezone
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import curve_scores
from intraday_order_relaxation import union_histogram, compact_witness
from exact_order_certificate import exact_certificate
from order_feasibility import strict_order_feasibility


def main():
    paths = [
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.json",
        "reports/rank-models/exact-order-certificate-2026-09-11.json",
        "docs/research/provider-lineage-and-lag-audit-2026-09-11.json",
    ]
    old, new, cohort = map(read_json, paths[:3])
    rows = []
    for s, store in enumerate(cohort["cohorts"]):
        kind = ("app_store", "google_play")[s]
        chart = next(row for row in old["charts"] if row["country"] == "JP" and row["store"] == kind)
        last = datetime.fromisoformat(chart["observations"][-1]["at"]).replace(
            tzinfo=timezone(timedelta(hours=9))).timestamp()
        union_end = (datetime.fromisoformat(cohort["period"]["end"]) + timedelta(days=1)).replace(
            tzinfo=timezone(timedelta(hours=-12))).timestamp()
        available_shift = min(48., (last - union_end) / 3600)
        if available_shift < 0:
            raise ValueError("The archive does not cover even the unshifted clock union")
        histogram, stamps = union_histogram(old, new, cohort, s, store, extra_shift_hours=available_shift)
        basis = np.zeros((old["rankLimit"], 2, old["rankLimit"]))
        basis[:, s] = np.eye(old["rankLimit"])
        exponents = {}
        for model in cohort["models"]:
            exponents.setdefault(model["parameters"][s], []).append(model["id"])
        frozen = []
        for exponent, ids in exponents.items():
            model = next(row for row in cohort["models"] if row["id"] == ids[0])
            curve = curve_scores(basis, *model["parameters"], 1 if s == 0 else 0)
            frozen.append({
                "exponent": exponent, "modelIds": ids,
                **compact_witness(strict_order_feasibility(histogram @ curve), stamps),
            })
        counts = np.cumsum(histogram, axis=2).reshape(len(histogram), -1)
        certificate = exact_certificate(counts)
        free = None
        if not certificate["certified"]:
            normalized = (np.cumsum(histogram, axis=2) /
                          np.arange(1, old["rankLimit"] + 1)).reshape(len(histogram), -1)
            free = compact_witness(strict_order_feasibility(normalized), stamps, old["rankLimit"])
        terms = []
        if certificate["certified"]:
            terms = [
                {"higher": store["mapped"][i]["game"], "lower": store["mapped"][i + 1]["game"], "weight": weight}
                for i, weight in enumerate(certificate["integerGapWeights"]) if weight]
        rows.append({
            "storeScope": store["storeScope"], "bracketingObservations": len(stamps),
            "requestedMaximumForwardShiftHours": 48,
            "maximumCoveredForwardShiftHoursAcrossAllClocks": available_shift,
            "uncoveredForwardHoursAtLatestBoundary": 48 - available_shift,
            "fullRequestedLagUnionCovered": available_shift == 48,
            "firstAtKst": stamps[0], "lastAtKst": stamps[-1],
            "frozenCurveResults": frozen, "freeCurveExactCertificate": certificate,
            "certificateTerms": terms, "freeCurveWitnessWhenUncertified": free,
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "lagAdopted": False,
        "inputs": [input_fingerprint(path) for path in paths], "period": cohort["period"],
        "assumedForwardLagRangeHours": [0, 48], "clockRangeUtcOffsetHours": [-12, 14], "rows": rows,
        "limitations": [
            "The 0-48 hour delay is an unverified sensitivity range, not an asserted store characteristic.",
            "The widened union is limited by actual last observations, not favorable results; uncovered requested boundaries remain explicit.",
            "When less than 48h is covered across all clocks, this cannot close the missing late-boundary 48h scenarios.",
            "A certificate on the broad union excludes narrower allocations within this archived-atom model.",
            "A feasible union may combine observations outside any one real reporting window and proves no actual lag or forecast accuracy.",
            "The free-curve scenario allows unrelated common monotone curves at each time atom.",
            "All source-family, fee, truncation, interpolation and unobserved-path qualifications remain.",
            "No coefficient, clock, game-specific correction or dollar estimate is adopted."
        ],
    }
    (ROOT / "reports/rank-models/lag-relaxed-order-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps([{
        "storeScope": row["storeScope"],
        "certificate": row["freeCurveExactCertificate"]["certified"],
        "terms": row["certificateTerms"],
        "frozen": [{"exponent": candidate["exponent"], "status": candidate["status"]}
                   for candidate in row["frozenCurveResults"]],
        "free": None if row["freeCurveWitnessWhenUncertified"] is None else
        row["freeCurveWitnessWhenUncertified"]["status"]} for row in rows], ensure_ascii=False))


if __name__ == "__main__":
    main()
