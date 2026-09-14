"""Shared frozen-model interval integration; no extrapolation or clock selection."""
from datetime import datetime, timedelta, timezone
import numpy as np
from frozen_models import chart_coefficients


def interval_average(times, values, start, end, method="linear"):
    if method not in ("linear", "previous", "next"):
        raise ValueError("Unknown between-observation reconstruction method")
    if not np.isfinite(start) or not np.isfinite(end) or end <= start:
        raise ValueError("Integration interval must have finite increasing boundaries")
    if len(times) < 2 or len(times) != len(values):
        raise ValueError("Integration requires at least two matched observations")
    if not np.all(np.isfinite(times)) or not np.all(np.isfinite(values)) or np.any(np.diff(times) <= 0):
        raise ValueError("Integration observations must be finite and strictly ordered")
    if start < times[0] or end > times[-1]:
        return None
    inside = (times > start) & (times < end)
    points = np.concatenate(([start], times[inside], [end]))
    if method == "linear":
        levels = np.interp(points, times, values)
        integral = np.trapezoid(levels, points)
    else:
        midpoints = (points[:-1] + points[1:]) / 2
        indices = np.searchsorted(times, midpoints, side="right")
        if method == "previous":
            indices -= 1
        integral = np.asarray(values)[indices] @ np.diff(points)
    first = max(0, int(np.searchsorted(times, start, side="right")) - 1)
    last = min(len(times) - 1, int(np.searchsorted(times, end)))
    gaps = np.diff(times[first:last + 1])
    return {
        "mean": float(integral / (end - start)),
        "insideBuckets": int(np.count_nonzero(inside)),
        "maxBracketingGapHours": float(gaps.max() / 3600) if len(gaps) else 0.0
    }


def snapshot_series(model, panel, game_index):
    coefficients = chart_coefficients(model, panel["charts"])
    kst = timezone(timedelta(hours=9))
    series = []
    for k, chart in enumerate(panel["charts"]):
        key = "cn" if chart["country"] == "CN" else (
            "aos" if chart["store"] == "google_play" else "ios")
        curve = np.arange(1, panel["rankLimit"] + 1, dtype=float) ** -model["exponents"][key]
        if model["normalization"] == "top200_conditional":
            curve /= curve.sum()
        elif model["normalization"] != "raw":
            raise ValueError("Unknown frozen curve normalization")
        times = np.array([datetime.fromisoformat(row["at"]).replace(tzinfo=kst).timestamp()
                          for row in chart["observations"]])
        if np.any(np.diff(times) <= 0):
            raise ValueError("Archived time buckets must be strictly increasing")
        values = np.array([sum(curve[rank - 1] for rank in row["gameRanks"][game_index])
                           for row in chart["observations"]], dtype=float)
        values *= chart["annualMarketProxyUsd"] / 1e9 * coefficients[k] / model["trainingPeriod"]["calendarDays"]
        series.append({"key": chart["key"], "country": chart["country"], "times": times, "values": values})
    return series


def integrate_window(series, start, end, method="linear"):
    charts = [{**chart, "integral": interval_average(chart["times"], chart["values"], start, end, method=method)}
              for chart in series]
    if any(chart["integral"] is None for chart in charts):
        return None
    days = (end - start) / 86400
    countries = {}
    for chart in charts:
        countries[chart["country"]] = countries.get(chart["country"], 0) + chart["integral"]["mean"] * days
    return {"predictionMillion": sum(countries.values()), "countryPredictionsMillion": countries,
            "minInsideBuckets": min(chart["integral"]["insideBuckets"] for chart in charts),
            "maxBracketingGapHours": max(chart["integral"]["maxBracketingGapHours"] for chart in charts)}
