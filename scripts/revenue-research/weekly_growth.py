"""Country-aligned weekly order and relative-growth diagnostics, without money fitting."""
import argparse
import json
from datetime import datetime, timedelta, timezone
import numpy as np
from scipy.stats import kendalltau
from simulate import ROOT, read_json
from temporal_transfer import interval_average
from frozen_models import frozen_models, chart_coefficients, input_fingerprint


PANEL = "reports/rank-models/expanded-period-observations-2026-09-11.json"
ALIASES = {
    "Pokémon GO": "Pokemon GO", "Pokémon Trading Card Game Pocket": "Pokemon TCG Pocket",
    "ホワイトアウト・サバイバル": "Whiteout Survival",
    "ゴシップハーバー：マージ＆ストーリー": "Gossip Harbor",
    "ラストウォー：サバイバル": "Last War:Survival", "ロイヤルマッチ": "Royal Match",
    "トゥーンブラスト": "Toon Blast", "キングショット": "Kingshot",
    "パズル＆サバイバル": "Puzzles & Survival",
    "幻想水滸伝 STAR LEAP（8月7日リリース）": "Suikoden STAR LEAP",
}


def references(panel):
    monthly = read_json("docs/research/august-japan-top25-2026-09-10.json")
    aliases = {row.get("publishedName", row["game"]): row["game"] for row in monthly["rows"]}
    aliases.update(ALIASES)
    game_indices = {game["key"]: i for i, game in enumerate(panel["games"])}
    weeks = []
    for file in sorted((ROOT / "docs/research/weekly-references-2026-09-11").glob("japan-week-*.json")):
        data = json.loads(file.read_text(encoding="utf-8"))
        mapped, missing = [], []
        for row in data["rows"]:
            name = aliases.get(row["publishedName"], row["publishedName"])
            if name in game_indices:
                mapped.append({**row, "game": name, "gameIndex": game_indices[name]})
            else:
                missing.append(row["publishedName"])
        weeks.append({**data, "mappedRows": mapped, "unmappedNames": missing,
                      "input": input_fingerprint(file.relative_to(ROOT).as_posix())})
    return weeks


def weekly_histograms(panel, weeks, offset, country="JP", window_shift_hours=0, reconstruction="linear"):
    """Integrate indicator curves; absent listings remain zero modeled TOP200 contribution."""
    jp = [chart for chart in panel["charts"] if chart["country"] == country]
    assert {chart["store"] for chart in jp} == (
        {"app_store"} if country == "CN" else {"app_store", "google_play"})
    jp.sort(key=lambda chart: chart["store"])
    result = []
    for week in weeks:
        start = datetime.fromisoformat(week["period"]["start"]).replace(
            tzinfo=timezone(timedelta(hours=offset))).timestamp() + window_shift_hours * 3600
        end = (datetime.fromisoformat(week["period"]["end"]) + timedelta(days=1)).replace(
            tzinfo=timezone(timedelta(hours=offset))).timestamp() + window_shift_hours * 3600
        hist = np.zeros((len(panel["games"]), len(jp), panel["rankLimit"]))
        coverage = []
        for k, chart in enumerate(jp):
            times = np.array([datetime.fromisoformat(row["at"]).replace(
                tzinfo=timezone(timedelta(hours=9))).timestamp() for row in chart["observations"]])
            check = interval_average(times, np.ones(len(times)), start, end, method=reconstruction)
            coverage.append({"chart": chart["key"], "integration": check})
            if check is None:
                break
            for game in range(len(panel["games"])):
                present = {rank for row in chart["observations"] for rank in row["gameRanks"][game]}
                for rank in present:
                    counts = np.array([row["gameRanks"][game].count(rank) for row in chart["observations"]])
                    hist[game, k, rank - 1] = interval_average(
                        times, counts, start, end, method=reconstruction)["mean"]
        complete = len(coverage) == len(jp) and all(row["integration"] is not None for row in coverage)
        result.append({"histogram": hist if complete else None, "coverage": coverage})
    return jp, result


def curve_scores(histogram, ios, google, mixture):
    ranks = np.arange(1, histogram.shape[-1] + 1, dtype=float)
    a, b = ranks ** -ios, ranks ** -google
    return mixture * (histogram[:, 0] @ (a / a.sum())) + (
        1 - mixture) * (histogram[:, 1] @ (b / b.sum()))


def order_metrics(values, ranks):
    n = len(values)
    left, right = np.triu_indices(n, 1)
    delta = (values[left] - values[right]) * (ranks[right] - ranks[left])
    violations = float(np.count_nonzero(delta < 0) + .5 * np.count_nonzero(delta == 0))
    tau = float(kendalltau(-np.asarray(values), ranks).statistic) if n > 1 else float("nan")
    return {"games": n, "pairs": len(left), "violations": violations,
            "kendallTauB": tau if np.isfinite(tau) else None}


def evaluate(scores, weeks, exposure):
    rows = []
    for w, week in enumerate(weeks):
        if exposure[w]["histogram"] is None:
            rows.append({"period": week["period"], "status": "insufficient_boundary_history"})
            continue
        mapped = week["mappedRows"]
        indices = [row["gameIndex"] for row in mapped]
        growth = []
        if w and exposure[w - 1]["histogram"] is not None:
            for row in mapped:
                if row["revenueGrowthPercent"] is None:
                    continue
                i = row["gameIndex"]
                if scores[w - 1][i] <= 0 or scores[w][i] <= 0:
                    continue
                reference = 1 + row["revenueGrowthPercent"] / 100
                if reference <= 0:
                    continue
                ratio = float(scores[w][i] / scores[w - 1][i])
                growth.append({"game": row["game"], "referenceRatio": reference,
                               "predictedRatio": ratio, "logRatioError": float(np.log(ratio / reference))})
        logs = np.array([row["logRatioError"] for row in growth])
        rows.append({
            "period": week["period"], "status": "conditional_reporting_timezone",
            "order": order_metrics(scores[w][indices], np.array([row["rank"] for row in mapped])),
            "growth": growth,
            "growthMetrics": {
                "games": len(growth), "rmsLogRatio": float(np.sqrt(np.mean(logs ** 2))) if len(logs) else None,
                "centeredRmsLogRatio": float(np.std(logs)) if len(logs) else None,
                "commonLogScaleMismatch": float(np.mean(logs)) if len(logs) else None,
                "directionAgreement": float(np.mean([
                    np.sign(row["predictedRatio"] - 1) == np.sign(row["referenceRatio"] - 1)
                    for row in growth])) if growth else None
            }
        })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offset", type=float, default=9)
    parser.add_argument("--output", default="reports/rank-models/weekly-growth-2026-09-11.json")
    args = parser.parse_args()
    panel = read_json(PANEL)
    weeks = references(panel)
    charts, exposure = weekly_histograms(panel, weeks, args.offset)
    training = read_json("reports/rank-models/normalized-august-panel-2026-09-10.json")
    monthly_path = "reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json"
    monthly = read_json(monthly_path)
    models = []
    selected = {"round13_original_frozen", "normalized_four_groups", "normalized_five_groups"}
    for model in [model for model in frozen_models(training) if model["id"] in selected]:
        # Resolve coefficients against the full contract before taking Japanese charts.
        coefficients = chart_coefficients(model, panel["charts"])
        indexes = [next(i for i, c in enumerate(panel["charts"]) if c["key"] == chart["key"])
                   for chart in charts]
        budgets = np.array([charts[k]["annualMarketProxyUsd"] * coefficients[indexes[k]] for k in range(2)])
        rank = np.arange(1, panel["rankLimit"] + 1, dtype=float)
        if model["normalization"] == "raw":
            budgets *= [np.sum(rank ** -model["exponents"][key]) for key in ("ios", "aos")]
        models.append({"id": model["id"], "ios": model["exponents"]["ios"],
                       "google": model["exponents"]["aos"], "mixture": float(budgets[0] / budgets.sum()),
                       "source": model["source"]})
    # Keep all preserved co-optimal examples; never select using these weekly labels.
    assert not monthly["parameterExamplesTruncated"], "Full co-optimal set required"
    for i, (ios, gp, mix) in enumerate(monthly["coOptimalParameterExamples"]):
        models.append({"id": f"japan_august_cooptimal_{i}", "ios": ios, "google": gp, "mixture": mix,
                       "source": input_fingerprint(monthly_path)})
    results = []
    for model in models:
        scores = [curve_scores(row["histogram"], model["ios"], model["google"], model["mixture"])
                  if row["histogram"] is not None else None for row in exposure]
        results.append({"model": model, "weeks": evaluate(scores, weeks, exposure)})
    target = ROOT / args.output
    np.savez_compressed(target.with_suffix(".exposure.npz"),
                        histograms=np.array([row["histogram"] if row["histogram"] is not None
                                             else np.zeros((len(panel["games"]), 2, panel["rankLimit"]))
                                             for row in exposure]),
                        valid=np.array([row["histogram"] is not None for row in exposure]))
    result = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False,
        "reportingUtcOffsetScenario": args.offset, "inputs": [input_fingerprint(PANEL)],
        "weeks": [{k: v for k, v in week.items() if k != "rows"} for week in weeks],
        "coverage": [row["coverage"] for row in exposure], "results": results,
        "limitations": [
            "Weekly labels are new references but substantially overlap August model selection.",
            "Mapped cohort inherits prior monthly TOP25 selection; it is not the full TOP50.",
            "Order is evaluated within mapped games, not against unmodeled games.",
            "Missing July and boundary observations are excluded without rescaling partial weeks.",
            "Growth assumes constant total weekly market budget; centered error removes only a shared scale.",
            "Centering is diagnostic and not an estimated budget or a model improvement.",
            "No absolute revenue is inferred from growth percentages.",
            "Nonappearance represents no modeled TOP200 contribution, not zero actual revenue."
        ]
    }
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"models": len(models), "results": [
        {"id": row["model"]["id"], "weeks": [{k: v for k, v in week.items() if k != "growth"}
                                            for week in row["weeks"]]}
        for row in results[:3]]}, indent=2))


if __name__ == "__main__":
    main()
