"""Profile partially identified Japanese rank curves without choosing an arbitrary winner.

Published rank order is supervision, not absolute revenue. All co-optimal grid
points remain in the identified set. Leave-one-game-out removes every pair
containing that game before selecting the co-optimal parameter set.
"""
import json
import argparse
import numpy as np
from simulate import ROOT, read_json, chart_features, rank_histograms


def pair_losses(scores, left, right):
    """Twice pair discordance, with a tied prediction counting half a violation."""
    differences = scores[:, left] - scores[:, right]
    return np.where(differences < 0, 2, np.where(differences == 0, 1, 0)).astype(np.int16)


def profile(original, exponent_step=0.05, mixture_step=0.02, excluded_dates=(), progress=True,
            exponent_bounds=(0.25, 2.5), aggregation="equal_day_snapshot", allowed_pairs=None):
    if exponent_step <= 0 or mixture_step <= 0:
        raise ValueError("Grid steps must be positive")
    panel = {**original, "charts": [{**chart, "observations": [
        row for row in chart["observations"] if row["at"][:10] not in excluded_dates]}
        for chart in original["charts"] if chart["country"] == "JP"]}
    refs = []
    for i, game in enumerate(panel["games"]):
        rank = next((row for row in game.get("regionalRankReferences", [])
                     if row["geography"] == "JP"), None)
        if rank:
            refs.append((rank["rank"], i, game["key"]))
    refs.sort()
    game_indices = [row[1] for row in refs]
    names = [row[2] for row in refs]
    n = len(names)
    lower, upper = exponent_bounds
    if not 0 <= lower < upper:
        raise ValueError("Exponent bounds must be nonnegative and increasing")
    exponent_width = upper - lower
    exponent_intervals = round(exponent_width / exponent_step)
    mixture_intervals = round(1 / mixture_step)
    if not np.isclose(exponent_intervals * exponent_step, exponent_width) or not np.isclose(mixture_intervals * mixture_step, 1):
        raise ValueError("Step must exactly divide the declared grid interval")
    exponents = np.linspace(lower, upper, exponent_intervals + 1)
    mixtures = np.linspace(0, 1, mixture_intervals + 1)
    rank_vector = np.arange(1, panel["rankLimit"] + 1, dtype=float)
    z = np.array([np.sum(rank_vector ** -exponent) for exponent in exponents])
    ios_k = next(k for k, chart in enumerate(panel["charts"]) if chart["store"] == "app_store")
    gp_k = next(k for k, chart in enumerate(panel["charts"]) if chart["store"] == "google_play")
    shapes = []
    histograms = rank_histograms(panel, aggregation)
    for exponent in exponents:
        matrix = chart_features(panel, {"ios": exponent, "aos": exponent, "cn": exponent},
                                "top200_conditional", histograms=histograms)
        shapes.append(matrix[game_indices] / np.array([chart["annualMarketProxyUsd"] / 1e9
                                                       for chart in panel["charts"]]))
    shapes = np.array(shapes)
    left, right = np.triu_indices(n, 1)
    if allowed_pairs is not None:
        requested = {tuple(pair) for pair in allowed_pairs}
        available = {(names[a], names[b]) for a, b in zip(left, right)}
        if not requested or not requested <= available:
            raise ValueError("Allowed pairs must be nonempty and follow the primary reference order")
        keep = np.array([(names[a], names[b]) in requested for a, b in zip(left, right)])
        left, right = left[keep], right[keep]
    incidence = np.zeros((len(left), n), dtype=np.int16)
    incidence[np.arange(len(left)), left] = 1
    incidence[np.arange(len(left)), right] = 1
    best_global = None
    best_folds = [None for _ in names]
    fgo_index = names.index("Fate/Grand Order")

    def accumulate(state, batch_loss, parameters, amount_scores, upper_scores, heldout_loss=None):
        minimum = int(batch_loss.min())
        if state is not None and minimum > state["loss"]:
            return state
        if state is None or minimum < state["loss"]:
            state = {"loss": minimum, "size": 0, "minimum": np.full(3, np.inf),
                     "maximum": np.full(3, -np.inf), "examples": [],
                     "amountMin": np.inf, "amountMax": -np.inf,
                     "upperMin": np.inf, "upperMax": -np.inf,
                     "heldoutMin": np.inf, "heldoutMax": -np.inf}
        mask = batch_loss == minimum
        selected = parameters[mask]
        state["size"] += len(selected)
        state["minimum"] = np.minimum(state["minimum"], selected.min(axis=0))
        state["maximum"] = np.maximum(state["maximum"], selected.max(axis=0))
        state["examples"].extend(selected[:max(0, 100 - len(state["examples"]))].tolist())
        state["amountMin"] = min(state["amountMin"], float(amount_scores[mask].min()))
        state["amountMax"] = max(state["amountMax"], float(amount_scores[mask].max()))
        state["upperMin"] = min(state["upperMin"], float(upper_scores[mask].min()))
        state["upperMax"] = max(state["upperMax"], float(upper_scores[mask].max()))
        if heldout_loss is not None:
            state["heldoutMin"] = min(state["heldoutMin"], float(heldout_loss[mask].min() / 2))
            state["heldoutMax"] = max(state["heldoutMax"], float(heldout_loss[mask].max() / 2))
        return state

    for ia, a in enumerate(exponents):
        for ib, b in enumerate(exponents):
            scores = (mixtures[:, None] * shapes[ia, :, ios_k][None, :]
                      + (1 - mixtures[:, None]) * shapes[ib, :, gp_k][None, :])
            pair_loss = pair_losses(scores, left, right)
            parameters = np.column_stack((np.full(len(mixtures), a), np.full(len(mixtures), b), mixtures))
            losses = pair_loss.sum(axis=1)
            heldout_pair_losses = pair_loss @ incidence
            holiday_upper = np.full(len(mixtures), 160 / z[ia] + 80 / z[ib])
            best_global = accumulate(best_global, losses, parameters, scores[:, fgo_index], holiday_upper)
            for i in range(n):
                best_folds[i] = accumulate(best_folds[i], losses - heldout_pair_losses[:, i],
                                          parameters, scores[:, fgo_index], holiday_upper,
                                          heldout_pair_losses[:, i])
        if progress and ia % 10 == 0:
            print(json.dumps({"completedIosExponents": ia + 1, "totalIosExponents": len(exponents),
                              "bestPairViolationsSoFar": best_global["loss"] / 2}), flush=True)

    def parameter_set(state):
        low, high = state["minimum"], state["maximum"]
        return {"size": state["size"], "iosExponentRange": [float(low[0]), float(high[0])],
                "googlePlayExponentRange": [float(low[1]), float(high[1])],
                "iosTop200BudgetMixtureRange": [float(low[2]), float(high[2])],
                "touchesExponentBoundary": bool(np.any(low[:2] == exponents[0])
                                                or np.any(high[:2] == exponents[-1])),
                "touchesMixtureBoundary": bool(low[2] == 0 or high[2] == 1)}

    folds = []
    for i, name in enumerate(names):
        state = best_folds[i]
        heldout_count = int(incidence[:, i].sum())
        folds.append({"game": name, "trainingPairCount": len(left) - heldout_count,
                      "minimumTrainingPairViolations": float(state["loss"] / 2),
                      "coOptimalSet": parameter_set(state),
                      "heldoutPairCount": heldout_count,
                      "heldoutViolationRange": [state["heldoutMin"], state["heldoutMax"]]})
    monthly_market = next(row["amount"] for row in read_json("docs/research/same-month-market-evidence-2026-09-10.json")
                          ["monthlyMarkets"] if row["source"] == "sensor_tower_august" and row["geography"] == "JP")
    upper = np.array([best_global["amountMin"], best_global["amountMax"]]) * monthly_market
    result = {
        "schemaVersion": 1, "status": "ordinal_partial_identification_grid", "productionEnabled": False,
        "excludedObservationDates": list(excluded_dates),
        "aggregation": aggregation,
        "period": panel["period"], "geography": "JP", "names": names,
        "rankSource": next(reference for reference in original["additionalRankReferences"]
                           if reference["geography"] == "JP"),
        "grid": {"exponents": exponents.tolist(), "iosTop200BudgetMixtures": mixtures.tolist(),
                 "candidateCount": len(exponents) ** 2 * len(mixtures), "basis": "Numerical sensitivity grid, not empirical coefficient bounds."},
        "minimumPairViolations": float(best_global["loss"] / 2), "comparedPairs": len(left),
        "comparisonPairPolicy": "all_primary_pairs" if allowed_pairs is None else "explicit_allowed_pairs",
        "allowedPairs": allowed_pairs,
        "coOptimalSet": parameter_set(best_global),
        "coOptimalParameterExamples": best_global["examples"],
        "parameterExamplesTruncated": best_global["size"] > len(best_global["examples"]),
        "folds": folds,
        "unusedMoneyConsistency": {
            "fgoJapanAppMagicReferenceMillion": 54,
            "sensorTowerJapanMarketMillion": monthly_market,
            "fullMarketAllocatedToTop200FgoRangeMillion": [float(upper.min()), float(upper.max())],
            "requiredTop200CaptureFor54Range": [float((54 / upper).min()), float((54 / upper).max())],
            "holidayFgoGreaterThan18": {
                "source": "https://sensortower.com/ja/blog/2026-summer-holiday-mobile-games-JP",
                "theoreticalSingleListingRankOneUpperRangeMillion": [best_global["upperMin"], best_global["upperMax"]],
                "allCoOptimalParametersCanReach18AtRankOne": bool(best_global["upperMin"] > 18)
            }
        },
        "limitations": [
            "No arbitrary representative is selected from tied parameter sets.",
            "Grid optima are not continuous-space optima; boundary contact requires wider sensitivity analysis.",
            "Rank-supervised folds share data and are not independent.",
            "Country-level TOP200 budget mixture is not an identified whole-store market share.",
            "A whole-market-to-TOP200 amount is an upper-budget scenario, not a measured game revenue.",
            "The 54m FGO check mixes providers and is not used to choose the curves.",
            "The holiday upper bound assumes one listing per store and the same curve in that subperiod, allows rank 1 throughout, and does not claim the game actually held rank 1."
        ]
    }
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exponent-step", type=float, default=0.05)
    parser.add_argument("--mixture-step", type=float, default=0.02)
    parser.add_argument("--exponent-bounds", type=float, nargs=2, default=[0.25, 2.5])
    parser.add_argument("--aggregation", choices=["equal_day_snapshot", "elapsed_day_linear", "elapsed_day_previous"],
                        default="equal_day_snapshot")
    parser.add_argument("--omit-date", action="append", default=[])
    parser.add_argument("--output", default="reports/rank-models/japan-ordinal-profile-2026-09-10.json")
    args = parser.parse_args()
    original = read_json("reports/rank-models/normalized-august-regional-panel-2026-09-10.json")
    result = profile(original, args.exponent_step, args.mixture_step, args.omit_date,
                     exponent_bounds=args.exponent_bounds, aggregation=args.aggregation)
    target = ROOT / args.output
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in ["grid", "minimumPairViolations", "comparedPairs",
                                                 "coOptimalSet", "unusedMoneyConsistency"]}), flush=True)


if __name__ == "__main__":
    main()
