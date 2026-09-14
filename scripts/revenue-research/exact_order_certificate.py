"""Exact nonpositive weighted-gap certificates for unresolved integer rank atoms."""
import json
from fractions import Fraction
from functools import reduce
from math import gcd, lcm
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_partial_bounds import load_lp
from intraday_order_relaxation import union_histogram


def exact_certificate(cumulative_counts):
    counts = np.asarray(cumulative_counts)
    if counts.ndim != 2 or counts.shape[0] < 2 or not counts.shape[1]:
        raise ValueError("Integer cumulative counts for at least two ordered games are required")
    if not np.all(np.isfinite(counts)) or np.any(counts < 0) or not np.all(counts == np.floor(counts)):
        raise ValueError("Exact certificates require nonnegative integer observation counts")
    differences = np.asarray(counts[:-1] - counts[1:], dtype=np.int64)
    unique = np.unique(differences.T, axis=0)
    lp = load_lp()
    model = lp.LinearModel(len(differences))
    model.add(dict.fromkeys(range(model.variables), 1), 1, "eq", "positive_gap_combination")
    for i, row in enumerate(unique):
        model.add(lp.sparse(row), 0, "ub", f"atom:{i}")
    solution = model.solve(np.zeros(model.variables))
    result = {
        "certified": False, "distinctAtomConstraints": len(unique),
        "solverFeasible": bool(solution.success), "solverRecoveries": model.solver_recoveries,
        "integerGapWeights": None,
    }
    if not solution.success:
        return {**result, "reason": "No nonnegative unit gap combination found by the solver."}
    rational = [Fraction(float(value)).limit_denominator(1_000_000) for value in solution.x]
    denominator = lcm(*(value.denominator for value in rational))
    integers = [value.numerator * (denominator // value.denominator) for value in rational]
    divisor = reduce(gcd, integers)
    if divisor:
        integers = [value // divisor for value in integers]
    # Python integers keep verification exact, including any large common denominator.
    combined = np.asarray(integers, dtype=object) @ differences.astype(object)
    certified = min(integers) >= 0 and sum(integers) > 0 and all(value <= 0 for value in combined)
    return {
        **result, "certified": bool(certified),
        "integerGapWeights": integers if certified else None,
        "exactMinimumWeightedCumulativeGap": int(min(combined)),
        "exactMaximumWeightedCumulativeGap": int(max(combined)),
        "reason": "Exact integer inequalities verified." if certified else
                  "Rational reconstruction did not verify; no exact claim is made.",
    }


def main():
    paths = [
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/new-store-cohort-observations-2026-09-11.json",
        "reports/rank-models/expanded-japan-store-validation-2026-09-11.json",
        "reports/rank-models/intraday-order-relaxation-2026-09-11.json",
    ]
    old, new, cohort, relaxed = map(read_json, paths)
    rows = []
    for row in relaxed["rows"]:
        if row["curveScope"] != "arbitrary_monotone_curve_at_each_atom" or row["status"] != \
                "strict_order_not_certified_at_solver_tolerance":
            continue
        s, store = next((i, value) for i, value in enumerate(cohort["cohorts"])
                        if value["storeScope"] == row["storeScope"])
        histogram, stamps = union_histogram(old, new, cohort, s, store)
        counts = np.cumsum(histogram, axis=2).reshape(len(histogram), -1)
        certificate = exact_certificate(counts)
        terms = []
        if certificate["certified"]:
            for i, coefficient in enumerate(certificate["integerGapWeights"]):
                if coefficient:
                    terms.append({
                        "publishedHigher": store["mapped"][i]["game"],
                        "publishedLower": store["mapped"][i + 1]["game"],
                        "integerWeight": coefficient,
                    })
        rows.append({
            "storeScope": store["storeScope"], "observationAtoms": len(stamps),
            "rankCutoffs": old["rankLimit"], "positivePublishedGapTerms": terms, **certificate,
        })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "parametersAdopted": False,
        "inputs": [input_fingerprint(path) for path in paths], "period": cohort["period"], "rows": rows,
        "limitations": [
            "Exactness applies to the integer archived rank atoms and the explicit convex reconstruction model, not true unobserved revenue.",
            "Positive weights on published adjacent gaps would imply a positive sum for a strictly ordered table.",
            "The certificate proves this weighted sum is nonpositive at every recorded time and rank cutoff.",
            "Dividing each cutoff column by its positive normalization preserves the certified sign.",
            "Thus nonnegative time allocations and even time-varying common monotone curves cannot produce every published strict inequality in this relaxed archive scope.",
            "This does not prove that the provider or store data is erroneous; scope, lag, product families, truncation and unobserved paths can differ.",
            "Only cases left numerically unresolved by the earlier relaxation are targeted.",
            "No game or pair is removed to improve an operational model."
        ],
    }
    (ROOT / "reports/rank-models/exact-order-certificate-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
