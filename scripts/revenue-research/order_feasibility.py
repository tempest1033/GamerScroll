"""Conditional joint ordinal feasibility over a normalized nonnegative basis."""
import numpy as np
from weekly_partial_bounds import load_lp


def strict_order_feasibility(features, tolerance=1e-8):
    """Rows follow published order; columns are explicitly allowed allocation bases."""
    features = np.asarray(features, dtype=float)
    if features.ndim != 2 or min(features.shape) < 1 or features.shape[0] < 2:
        raise ValueError("At least two ordered games and one allocation basis are required")
    if not np.all(np.isfinite(features)) or np.any(features < 0):
        raise ValueError("Allocation features must be finite and nonnegative")
    differences = features[:-1] - features[1:]
    shift = float(np.max(np.abs(differences)))
    if shift == 0:
        return {
            "status": "identical_features", "maximumCommonMargin": 0.,
            "witnessMinimumMargin": 0., "basisWeights": None, "scores": None,
            "solverRecoveries": [],
        }
    lp = load_lp()
    columns = features.shape[1]
    model = lp.LinearModel(columns + 1)
    model.add(dict.fromkeys(range(columns), 1), 1, "eq", "unit_allocation")
    for pair, delta in enumerate(differences):
        model.add({**lp.sparse(-delta), columns: 1}, shift, "ub", f"adjacent_order:{pair}")
    objective = np.zeros(columns + 1)
    objective[-1] = -1
    solution = model.solve(objective)
    if not solution.success:
        raise RuntimeError(f"Bounded ordinal simplex failed: {solution.message}")
    weights = solution.x[:-1]
    scores = features @ weights
    margin = float(solution.x[-1] - shift)
    witness = float(np.min(scores[:-1] - scores[1:]))
    simplex_residual = float(abs(weights.sum() - 1))
    violation = max(0., float(-weights.min()), simplex_residual, margin - witness)
    if violation > tolerance:
        raise ValueError(f"Ordinal witness violates its allocation constraints: {violation}")
    status = ("strict_order_feasible" if min(margin, witness) > tolerance else
              "weak_order_infeasible_at_solver_tolerance" if margin < -tolerance else
              "strict_order_not_certified_at_solver_tolerance")
    return {
        "status": status, "maximumCommonMargin": margin, "witnessMinimumMargin": witness,
        "basisWeights": weights.tolist(), "scores": scores.tolist(),
        "simplexResidual": simplex_residual, "maximumConstraintViolation": violation,
        "numericalTolerance": tolerance, "solverRecoveries": model.solver_recoveries,
    }
