"""Verify only new extension artifacts and changed accounting contracts."""
import json
from datetime import datetime, timezone
import numpy as np
from simulate import ROOT, read_json
from verify_expanded import resolve_fingerprint


def main():
    passed, failures, hashes = [], [], {}
    versions = [
        "reports/rank-models/implementation-source-versions-2026-09-11.json",
        "docs/research/revenue-extension-2026-09-11/source-versions.json"]
    archives = {(row["logicalPath"], row["sha256"]): row["archivePath"]
                for path in versions for row in read_json(path)["versions"]}

    def check(name, fn):
        try:
            fn()
            passed.append(name)
        except Exception as error:
            failures.append({"name": name, "error": str(error)})

    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def visit(value):
        if isinstance(value, dict):
            if "path" in value and "sha256" in value:
                resolve_fingerprint(value, ROOT, archives, hashes)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    report_names = [
        "korea-additional-observations", "extension-korea-conditional-bounds",
        "extension-korea-fx-scenario", "extension-complete-chart-mass",
        "extension-fixed-shape-accounting", "extension-regional-residuals",
        "extension-global-day-coverage", "extension-global-day-order", "extension-day-decomposition",
        "extension-unmapped-order"]
    reports = {}
    for name in report_names:
        path = f"reports/rank-models/{name}-2026-09-11.json"

        def parents(path=path, name=name):
            report = read_json(path)
            reports[name] = report
            require(report["productionEnabled"] is False, "Production guard changed")
            visit(report)
        check(f"new report parents and research guard: {name}", parents)

    def fixed_shapes():
        report = reports["extension-fixed-shape-accounting"]
        rows = report["rows"]
        require(len(rows) == 24 and len({
            (row["shapeIndex"], row["countryCaps"], row["regionalAnchorScope"]) for row in rows}) == 24,
            "Missing or repeated fixed-shape scenario")
        require(report["operationalParametersAdopted"] is False, "Witness must not be adopted")
    check("complete fixed-shape scenario accounting", fixed_shapes)

    def regional_nesting():
        rows = reports["extension-regional-residuals"]["rows"]
        markets = read_json("docs/research/same-month-market-evidence-2026-09-10.json")["monthlyMarkets"]
        require(len(rows) == 6, "Incomplete regional-residual scenarios")
        for row in rows:
            witness = row["minimumGlobalUnobservedWitness"]
            accounted = witness["top200ChartBudgetSumMillion"] + witness["globalUnobservedGameSumMillion"]
            require(abs(accounted - witness["accountedWorldMillionExcludingNestedRegionalDoubleCount"]) < 1e-5,
                    "Nested regional amount was counted again")
            require(accounted <= row["worldBudgetMillion"] + 1e-4, "World budget exceeded")
            for game in witness["gameAmounts"]:
                require(-1e-5 <= game["nestedRegionalUnobservedMillion"] <= game["globalUnobservedMillion"] + 1e-4,
                        "Regional amount is not a subset of global missing revenue")
            if row["countryCaps"]:
                caps = {market["geography"]: market["amount"] for market in markets
                        if market["source"] == row["worldBudgetSource"]}
                for region in witness["regions"]:
                    if region["country"] in caps:
                        used = region["observedChartBudgetsMillion"] + region["nestedRegionalUnobservedMillion"]
                        require(used <= caps[region["country"]] + 1e-4, "Country budget exceeded")
            for region in row["regionalRanges"]:
                low, high = region["unobservedInsideRegionRangeMillion"]
                require(-1e-5 <= low <= high + 1e-4 and high <= region["referenceMillion"] + 1e-4,
                        "Invalid regional feasible interval")
    check("regional witnesses conserve mass without double counting", regional_nesting)

    def frozen_daily_contract():
        plan = read_json("docs/research/revenue-extension-2026-09-11/new-period-coverage-plan.json")
        labels = read_json("docs/research/revenue-extension-2026-09-11/appmagic-september-daily-orders.json")
        report = reports["extension-global-day-order"]
        require(report["games"] == read_json(plan["identityPanel"])["games"], "Frozen identities changed")
        require(report["curveDefinitions"] == plan["curves"], "Shapes changed after labels")
        require(not report["outputIsRevenue"] and not report["newModelAdopted"] and not report["refitted"],
                "Ordinal diagnostic incorrectly promoted")
        require(len(report["charts"]) == 254 and len(report["games"]) == 42, "Wrong archive or identity scope")
        for source in labels["days"]:
            require([row["rank"] for row in source["rows"]] == list(range(1, 31)), "Incomplete source order")
            require(source["periodStart"] == source["periodEnd"] == source["date"], "Period mismatch")
        first, second = report["results"]
        require(len(first["scenarios"]) == 72 and not second["scenarios"],
                "Missing September 8 scenario or fabricated September 9 score")
        require(second["status"] == "unscored_no_full_day_coverage", "Coverage failure hidden")
        expected = {(curve["id"], offset, method) for curve in plan["curves"]
                    for offset in plan["observedEligibility"]["september8EligibleOffsets"]
                    for method in plan["reconstructionScenarios"]}
        require({(s["curve"], s["utcOffsetHours"], s["reconstruction"]) for s in first["scenarios"]} == expected,
                "Clock or reconstruction selection changed")
        for scenario in first["scenarios"]:
            n = len(first["mappedRows"])
            for key in ("fiveMarketOrder", "allMarketOrder"):
                require(scenario[key]["games"] == n and scenario[key]["pairs"] == n * (n - 1) // 2,
                        "Coverage comparison uses different cohorts")
            partial, full = map(np.array, (scenario["fiveMarketIndex"], scenario["allMarketIndex"]))
            require(np.all(np.isfinite(full)) and np.all(partial >= 0) and np.all(full >= partial - 1e-10),
                    "Nonfinite, negative or renormalized partial-scope indices")
            require(full.sum() <= 100 + 1e-8, "Overlapping identity mass exceeds normalized chart budget")
    check("frozen daily scope, complete paired scenarios and no extrapolated day", frozen_daily_contract)

    def gap_partition():
        report = reports["extension-day-decomposition"]
        require(len(report["collectionGapDistributions"]) == 8, "Clock coverage decomposition incomplete")
        for scenario in report["collectionGapDistributions"]:
            groups = scenario["distribution"]
            keys = [key for row in groups for key in row["charts"]]
            require(len(keys) == len(set(keys)) == 254, "Chart gap groups are not a partition")
            require(abs(sum(row["proxyWeightMass"] for row in groups) - 1) < 1e-9,
                    "Gap distribution lost preserved proxy mass")
    check("gap decomposition covers all charts exactly once", gap_partition)

    def ordinal_completion():
        report = reports["extension-unmapped-order"]
        require(len(report["rows"]) == 144, "Missing view or scenario completion bounds")
        for row in report["rows"]:
            require(row["knownGames"] == 26 and row["missingGames"] == 4,
                    "Unmapped identities were silently added")
            require(row["knownPairs"] == 325 and row["fullPairs"] == 435, "Wrong pair coverage")
            low, high = row["fullViolationRange"]
            require(row["knownViolationCount"] <= low <= high <= 435, "Invalid completion range")
    check("unmapped-game uncertainty remains separate from paired accuracy", ordinal_completion)

    def manual_reference_guards():
        for name in ("mobileindex-product-scope", "appmagic-clock-scope-audit",
                     "heartopia-new-monetary-references"):
            data = read_json(f"docs/research/revenue-extension-2026-09-11/{name}.json")
            require(data["productionEnabled"] is False, "Reference audit enables production")
            if "automaticModelUse" in data:
                require(data["automaticModelUse"] is False, "Unmatched reference enables model ingestion")
    check("new provider and monetary audits remain research-only", manual_reference_guards)

    output = {
        "schemaVersion": 1, "productionEnabled": False,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "passed": passed, "failures": failures, "repeatedPriorModelSearches": False,
        "verifiedVersions": [{"path": path, "sha256": digest} for path, digest in sorted(hashes.items())]}
    with (ROOT / "reports/rank-models/extension-integrity-2026-09-11.json").open("x", encoding="utf-8") as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
    print(json.dumps({"passed": len(passed), "failures": failures}), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
