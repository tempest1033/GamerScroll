"""Fit temporal growth on earlier windows, retaining later-window and game holdouts."""
import argparse
import json
import numpy as np
from simulate import ROOT, read_json
from frozen_models import input_fingerprint
from weekly_growth import curve_scores, evaluate


INPUT = "reports/rank-models/weekly-growth-2026-09-11.json"


def centered_loss(errors):
    return np.mean((errors - errors.mean(axis=-1, keepdims=True)) ** 2, axis=(-2, -1))


def profile(report, histograms, exponent_step=.025, mixture_step=.01):
    weeks = report["weeks"]
    # Complete 7-day windows begin August 6. The earlier partial window is never used.
    train_weeks = [2, 3]
    test_week = 4
    common = set(row["gameIndex"] for row in weeks[train_weeks[0]]["mappedRows"])
    for w in train_weeks:
        common &= {row["gameIndex"] for row in weeks[w]["mappedRows"]
                   if row["revenueGrowthPercent"] is not None and row["revenueGrowthPercent"] > -100}
    indices = sorted(common)
    assert len(indices) >= 3
    names = {row["gameIndex"]: row["game"] for row in weeks[train_weeks[0]]["mappedRows"]}
    targets = np.array([[np.log(1 + next(
        row["revenueGrowthPercent"] for row in weeks[w]["mappedRows"] if row["gameIndex"] == i) / 100)
                         for i in indices] for w in train_weeks])
    exponents = np.linspace(.25, 2.5, round(2.25 / exponent_step) + 1)
    mixtures = np.linspace(0, 1, round(1 / mixture_step) + 1)
    if not np.isclose(exponents[1] - exponents[0], exponent_step) or not np.isclose(
            mixtures[1] - mixtures[0], mixture_step):
        raise ValueError("Grid intervals must be exactly divisible")
    rank = np.arange(1, histograms.shape[-1] + 1, dtype=float)
    curves = rank[None, :] ** -exponents[:, None]
    curves /= curves.sum(axis=1, keepdims=True)
    shapes = np.einsum("wgsr,ar->awgs", histograms, curves)
    exclusions = [None] + indices
    masks = [np.array([j for j, i in enumerate(indices) if i != excluded]) for excluded in exclusions]
    best = [{"loss": float("inf"), "parameters": [], "tiedCandidates": 0} for _ in exclusions]
    for ia, ios in enumerate(exponents):
        for ib, google in enumerate(exponents):
            scores = mixtures[:, None, None] * shapes[ia, :, :, 0][None, :, :] + (
                1 - mixtures[:, None, None]) * shapes[ib, :, :, 1][None, :, :]
            numerator = scores[:, train_weeks][:, :, indices]
            denominator = scores[:, [w - 1 for w in train_weeks]][:, :, indices]
            # Zero modeled exposure cannot define a logarithmic ratio.
            if np.any(numerator <= 0) or np.any(denominator <= 0):
                # Only affected candidates are ineligible; do not insert pseudo-counts.
                eligible = np.all((numerator > 0) & (denominator > 0), axis=(1, 2))
            else:
                eligible = np.ones(len(mixtures), dtype=bool)
            errors = np.full_like(numerator, np.nan)
            errors[eligible] = np.log(numerator[eligible] / denominator[eligible]) - targets
            for state, mask in zip(best, masks):
                losses = np.full(len(mixtures), np.inf)
                losses[eligible] = centered_loss(errors[eligible][:, :, mask])
                minimum = float(losses.min())
                if not np.isfinite(minimum) or minimum > state["loss"] + 1e-14:
                    continue
                positions = np.flatnonzero(np.abs(losses - minimum) <= 1e-14)
                params = [[float(ios), float(google), float(mixtures[p])] for p in positions]
                if minimum < state["loss"] - 1e-14:
                    state.update(loss=minimum, parameters=params, tiedCandidates=len(params))
                else:
                    state["parameters"].extend(params)
                    state["tiedCandidates"] += len(params)
        if ia % 10 == 0:
            print(json.dumps({"iosDone": ia + 1, "iosTotal": len(exponents),
                              "bestTrainingCenteredRmsLog": float(np.sqrt(best[0]["loss"]))}), flush=True)
    folds = []
    exposure = [{"histogram": None if w == 0 else histograms[w]} for w in range(len(weeks))]
    for excluded, state in zip(exclusions, best):
        predictions = []
        for ios, google, mixture in state["parameters"]:
            scores = [curve_scores(hist, ios, google, mixture) for hist in histograms]
            diagnostics = evaluate(scores, weeks, exposure)
            latest = diagnostics[test_week]
            heldout = next((row for row in latest["growth"] if row["game"] == names.get(excluded)), None)
            predictions.append({
                "parameters": [ios, google, mixture], "laterWeekOrder": latest["order"],
                "laterWeekGrowth": latest["growthMetrics"], "heldoutGameLatestGrowth": heldout
            })
        folds.append({
            "excludedGame": names.get(excluded), "trainingGameCount": len(indices) - (excluded is not None),
            "trainingCenteredRmsLogRatio": float(np.sqrt(state["loss"])),
            "cooptimalCandidates": state["tiedCandidates"], "predictions": predictions,
            "boundaryContact": any(ios in (exponents[0], exponents[-1]) or gp in (
                exponents[0], exponents[-1]) or mix in (0, 1) for ios, gp, mix in state["parameters"])
        })
    return {
        "schemaVersion": 1, "productionEnabled": False, "status": "overlapping_period_temporal_growth_research",
        "input": input_fingerprint(INPUT),
        "trainPeriods": [weeks[w]["period"] for w in train_weeks],
        "testPeriod": weeks[test_week]["period"], "games": [names[i] for i in indices],
        "grid": {"exponents": exponents.tolist(), "mixtures": mixtures.tolist(),
                 "candidateCount": len(exponents) ** 2 * len(mixtures)},
        "folds": folds,
        "limitations": [
            "Criterion is centered log growth error, not absolute money error.",
            "Each earlier week's common scale is a nuisance removed using training games only.",
            "Later-week labels are evaluated but never used in candidate selection.",
            "Prior August monthly model exploration already exposed overlapping dates and games.",
            "Only one later window and two training transitions; no independent future accuracy claim.",
            "The current TOP50 and prior mapped TOP25 selections cause survivorship and cohort bias.",
            "Best grid points and game omissions diagnose sensitivity, not confidence intervals.",
            "No measured whole-market store mix can be inferred from the conditional TOP200 mixture."
        ]
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exponent-step", type=float, default=.025)
    parser.add_argument("--mixture-step", type=float, default=.01)
    parser.add_argument("--output", default="reports/rank-models/weekly-growth-profile-2026-09-11.json")
    args = parser.parse_args()
    report = read_json(INPUT)
    arrays = np.load((ROOT / INPUT).with_suffix(".exposure.npz"))
    assert arrays["valid"].tolist() == [False, True, True, True, True]
    result = profile(report, arrays["histograms"], args.exponent_step, args.mixture_step)
    (ROOT / args.output).write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"main": result["folds"][0], "foldCount": len(result["folds"])}), flush=True)


if __name__ == "__main__":
    main()
