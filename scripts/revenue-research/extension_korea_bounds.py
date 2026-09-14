"""Conditional Korean superset-spending diagnostics, without inventing FX or fees."""
import json
from datetime import datetime, timedelta, timezone
from simulate import ROOT, read_json
from frozen_models import frozen_models, input_fingerprint
from temporal_transfer import snapshot_series, integrate_window


def main():
    paths = [
        "reports/rank-models/normalized-august-regional-panel-2026-09-10.json",
        "reports/rank-models/expanded-period-observations-2026-09-11.json",
        "reports/rank-models/korea-additional-observations-2026-09-11.json",
        "docs/research/major-market-revenue-anchors-2026-09-10.json",
        "docs/research/revenue-extension-2026-09-11/korea-additional-identities.json",
    ]
    training, original, additional, anchors = map(read_json, paths[:4])
    reference = next(row for row in anchors["amount_groups"] if row["id"] == "korea_august_top10")
    if not original["observationOnly"] or not additional["observationOnly"]:
        raise ValueError("Evaluation panels must remain observation-only")
    if reference["country"] != "KR" or set(reference["stores"]) != {"ios", "android", "one_store"}:
        raise ValueError("The reference must explicitly be the Korean three-store superset")
    if reference["currency"] != "KRW":
        raise ValueError("This diagnostic preserves the source's Korean won amounts")
    kst = timezone(timedelta(hours=9))
    chart_starts, chart_ends = [], []
    for panel in (original, additional):
        charts = [chart for chart in panel["charts"] if chart["country"] == "KR"]
        if {chart["store"] for chart in charts} != {"app_store", "google_play"}:
            raise ValueError("Both modeled Korean stores are required")
        for chart in charts:
            chart_starts.append(datetime.fromisoformat(chart["observations"][0]["at"]).replace(tzinfo=kst).timestamp())
            chart_ends.append(datetime.fromisoformat(chart["observations"][-1]["at"]).replace(tzinfo=kst).timestamp())
    # This fixed intersection is inside August under every previously considered clock.
    latest_month_start = datetime.fromisoformat(reference["period"]["start"]).replace(
        tzinfo=timezone(timedelta(hours=-12))).timestamp()
    earliest_month_end = (datetime.fromisoformat(reference["period"]["end"]) + timedelta(days=1)).replace(
        tzinfo=timezone(timedelta(hours=14))).timestamp()
    start, end = max(latest_month_start, *chart_starts), min(earliest_month_end, *chart_ends)
    if end <= start:
        raise ValueError("There is no fully bracketed common monthly subinterval")
    aliases = {
        "SOL": ["SOL: enchant"],
        "WOS": ["Whiteout Survival"],
        "메이플 키우기": ["MapleStory Idle"],
        "킹샷": ["Kingshot"],
        "리니지M": ["Lineage M adult listing", "Lineage M 12+ listing"],
        "쿠키런 키우기": ["CookieRun: Crumble"],
        "가십하버": ["Gossip Harbor"],
        "젠레스 존 제로": ["Zenless Zone Zero"],
        "열혈강호": ["Yulgang: Next"],
        "승리의 여신": ["Goddess of Victory: NIKKE"],
    }
    entities = {key for values in aliases.values() for key in values}
    located = {}
    for panel in (original, additional):
        for i, game in enumerate(panel["games"]):
            if game["key"] in entities:
                if game["key"] in located:
                    raise ValueError("An evaluation entity exists in both panels")
                located[game["key"]] = (panel, i)
    if set(located) != entities:
        raise ValueError(f"Missing observation identities: {entities - set(located)}")
    # Load archived coefficients; the existing loader recovers round 13's stored scale,
    # without fitting targets. Preserve the materialized models for subsequent diagnostics.
    models = frozen_models(training)
    rows, entity_rows = [], []
    for model in models:
        predictions = {}
        for key, (panel, i) in located.items():
            series = [row for row in snapshot_series(model, panel, i) if row["country"] == "KR"]
            for method in ("linear", "previous", "next"):
                result = integrate_window(series, start, end, method=method)
                if result is None:
                    raise ValueError("The Korean subinterval is not fully bracketed")
                predictions[(key, method)] = result["predictionMillion"]
                entity_rows.append({
                    "model": model["id"], "entity": key, "method": method,
                    "koreanSubintervalPredictionMillionUSD": result["predictionMillion"],
                    "integration": result,
                })
        for rank, name, amount in reference["rows"]:
            keys = aliases[name]
            scenarios = [("listed_entities_combined", keys)]
            if len(keys) > 1:
                scenarios.append(("adult_listing_only_scope_sensitivity", keys[:1]))
            for scope, included in scenarios:
                for method in ("linear", "previous", "next"):
                    prediction = sum(predictions[(key, method)] for key in included)
                    source_krw = amount * reference["unit_multiplier"]
                    rows.append({
                        "model": model["id"], "publishedRank": rank, "publishedName": name,
                        "entities": included, "familyScopeScenario": scope, "method": method,
                        "sourceFullMonthThreeStoreKRW": source_krw,
                        "predictedObservedSubintervalTwoStoreUSD": prediction * 1_000_000,
                        "breakEvenKRWPerUSD": source_krw / (prediction * 1_000_000) if prediction > 0 else None,
                        "evaluatedAsAccuracy": False, "comparisonEligibility": "conditional_only_fee_refund_family_unconfirmed",
                    })
    summaries = []
    for model in models:
        for rank, name, _ in reference["rows"]:
            own = [row for row in rows if row["model"] == model["id"] and row["publishedName"] == name]
            values = [row["breakEvenKRWPerUSD"] for row in own if row["breakEvenKRWPerUSD"] is not None]
            summaries.append({
                "model": model["id"], "publishedName": name, "publishedRank": rank,
                "koreanPartialPredictionRangeMillionUSD": [
                    min(row["predictedObservedSubintervalTwoStoreUSD"] for row in own) / 1_000_000,
                    max(row["predictedObservedSubintervalTwoStoreUSD"] for row in own) / 1_000_000],
                "breakEvenKRWPerUSDRange": [min(values), max(values)] if values else None,
            })
    result = {
        "schemaVersion": 1, "productionEnabled": False, "refitted": False,
        "inputs": [input_fingerprint(path) for path in paths] + [model["source"] for model in models],
        "models": models, "referenceGroup": reference, "originalReferenceEligibilityUnchanged": True,
        "window": {
            "startUtc": datetime.fromtimestamp(start, timezone.utc).isoformat(),
            "endUtcExclusive": datetime.fromtimestamp(end, timezone.utc).isoformat(),
            "days": (end - start) / 86400,
            "policy": "Largest common observed interval wholly inside the monthly reference for every UTC offset from -12 through +14.",
        },
        "actualFXUsed": None, "summaries": summaries, "rows": rows, "entityRows": entity_rows,
        "interpretation": "If fee, refund, family and currency conventions are compatible, a KRW/USD conversion above the reported break-even level makes this modeled two-store subinterval exceed the published three-store full-month estimate.",
        "limitations": [
            "Mobile Index's fee and refund conventions remain unconfirmed; these are conditional diagnostics, not validated upper bounds on gross spending.",
            "The source is a vendor estimate rather than verified developer revenue.",
            "Only Korean contributions are compared; incomplete non-Korean product variants are not assigned global revenue.",
            "The three-store amount is never treated as an exact two-store training target.",
            "The observation interval excludes unavailable boundaries and is not extrapolated to a complete August.",
            "The fixed model's average daily scale is retained; actual day-specific market spending is unknown.",
            "The adult-only and combined Lineage M cases do not establish Mobile Index's product-family definition.",
            "No assumed exchange rate, universal fee factor, model selection or new calibration coefficient is introduced."
        ],
    }
    (ROOT / "reports/rank-models/extension-korea-conditional-bounds-2026-09-11.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"window": result["window"], "summaries": summaries}, ensure_ascii=False))


if __name__ == "__main__":
    main()
