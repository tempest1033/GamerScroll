"""Essential integrity of the expanded cycle, without rerunning prior model searches."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from simulate import ROOT, read_json


def resolve_fingerprint(value, root, archives, hashes):
    logical = value["path"]
    expected = value["sha256"]
    if logical not in hashes:
        hashes[logical] = hashlib.sha256((root / logical).read_bytes()).hexdigest()
    if hashes[logical] == expected:
        return logical
    archive = archives.get((logical, expected))
    if archive is not None:
        if archive not in hashes:
            hashes[archive] = hashlib.sha256((root / archive).read_bytes()).hexdigest()
        if hashes[archive] == expected:
            return archive
    raise ValueError(f"Stale or unavailable parent version: {logical}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--output", default="reports/rank-models/expanded-research-integrity-2026-09-11.json")
    args = parser.parse_args()
    passed, failures, hashes = [], [], {}
    versions = read_json("reports/rank-models/implementation-source-versions-2026-09-11.json")["versions"]
    archives = {(row["logicalPath"], row["sha256"]): row["archivePath"] for row in versions}

    def check(name, fn):
        if args.only and name not in args.only:
            return
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

    def report_integrity(file):
        data = read_json(file.relative_to(ROOT).as_posix())
        require(data.get("productionEnabled") is False, "Research report must not enable production")
        visit(data)

    for file in sorted((ROOT / "reports/rank-models").glob("*2026-09-11.json")):
        if file.name == "expanded-research-integrity-2026-09-11.json":
            continue
        check(f"report parents and non-production: {file.name}", lambda file=file: report_integrity(file))

    def clock_integrity():
        data = read_json("reports/rank-models/weekly-clock-lag-2026-09-11.json")
        definitions = {row["effectiveWindowOffsetHours"] for row in data["windowDefinitions"]}
        actual = [row["effectiveWindowOffsetHours"] for row in data["windows"]]
        require(data["status"] == "complete", "Clock/lag report incomplete")
        require(len(actual) == len(set(actual)) and set(actual) == definitions, "Missing/duplicate windows")
        for window in data["windows"]:
            require(len(window["conditionalFeasibility"]) == 3, "Incomplete conditional feasibility scenarios")
            require(len({row["id"] for row in window["frozenCandidates"]}) ==
                    len(window["frozenCandidates"]), "Duplicate frozen candidates")
    check("complete unique clock/lag windows", clock_integrity)

    def source_integrity():
        for file in (ROOT / "docs/research/appmagic-store-public-2026-09-11").glob("*.json"):
            data = read_json(file.relative_to(ROOT).as_posix())
            require(data["productionEnabled"] is False, "Source must remain non-production")
            for table in data.get("tables", []):
                ids = table.get("orderedRepresentativeIds", table.get("orderedRepresentativeIosIds"))
                require(ids and len(ids) == len(set(ids)), f"Missing/duplicate source IDs: {file.name}")
                require(data["amountsAvailable"] is False, "Order-only source must not claim money")
            if "orderedIosIds" in data:
                ids = data["orderedIosIds"]
                require(len(ids) == len(set(ids)) == data["preservedRows"], "Live source count mismatch")
                require(("431946152" in ids) == data["robloxPresentInTop100"], "Live membership mismatch")
    check("store-reference order, scope and declared public coverage", source_integrity)

    def identity_only():
        panel = read_json("reports/rank-models/expanded-period-observations-2026-09-11.json")
        require(panel["observationOnly"] and panel["source"] is None, "Expanded panel reused a money source")
        require(all(game["reference"] is None for game in panel["games"]), "Old money labels leaked")
        require(not panel["regionalAnchors"], "Old regional money labels leaked")
    check("expanded observations contain no copied August monetary labels", identity_only)

    def pareto_integrity():
        report = read_json("reports/rank-models/japan-store-pareto-2026-09-11.json")
        original = read_json("reports/rank-models/consensus-transfer-2026-09-11.json")
        indices = report["retainedOriginalIndices"]
        require(len(indices) == len(set(indices)) == report["retainedCandidateCount"], "Candidate count mismatch")
        require(all(0 <= i < original["count"] for i in indices), "Candidate index outside preserved archive")
        require(report["selectedOnLaterPeriodLabels"] is False, "Later-period selection not allowed")
        require(report["perRetainedLaterViolationRanges"] ==
                [original["perParameterViolationRanges"][i] for i in indices], "Wrong transfer alignment")
    check("Pareto candidates remain aligned with frozen transfer evidence", pareto_integrity)

    def api_integrity():
        report = read_json("reports/rank-models/ios-source-audit-2026-09-11.json")
        for country in report["countries"]:
            rows = country["positions"]
            require(len(rows) == country["upstreamRows"], "Upstream row count mismatch")
            require(len({row["id"] for row in rows}) == len(rows), "Duplicate upstream ID")
            present = [row for row in rows if row["metadata"] is not None]
            require([row["legacyReturnedArrayRank"] for row in present] ==
                    list(range(1, len(present) + 1)), "Legacy compaction diagnostic inconsistent")
    check("current source audit preserves ID positions and metadata omissions separately", api_integrity)

    def excluded_money_scopes():
        quarterly = read_json("docs/research/roblox-quarterly-scope-reference-2026-09-11.json")
        undated = read_json("docs/research/applion-undated-weekly-reference-2026-09-11.json")
        require(quarterly["source"]["metric"] == "recognized_revenue", "Quarterly revenue mislabeled as spending")
        require(undated["source"]["periodStart"] is None and undated["source"]["periodEnd"] is None,
                "Unknown APPLION accounting period invented")
        require(undated["source"]["eligibility"] == "reference_only_excluded_from_fitting_and_accuracy_checks",
                "Undated reference used as a calibration anchor")
    check("quarterly recognized revenue and undated estimates remain excluded from monthly money fitting",
          excluded_money_scopes)

    def expanded_pair_integrity():
        report = read_json("reports/rank-models/expanded-japan-store-validation-2026-09-11.json")
        panel = read_json("reports/rank-models/new-store-cohort-observations-2026-09-11.json")
        require(panel["observationOnly"] and not panel["regionalAnchors"] and
                all(game["reference"] is None for game in panel["games"]), "Novel rank cohort gained money labels")
        expected = {(method, -12 + clock * .25, model["id"], store["storeScope"])
                    for method in ("linear", "previous", "next") for clock in range(105)
                    for model in report["models"] for store in report["cohorts"]}
        actual = [(row["method"], row["utcOffsetHours"], row["model"], row["storeScope"])
                  for row in report["rows"]]
        require(len(actual) == len(set(actual)) and set(actual) == expected, "Incomplete expanded scenarios")
        for row in report["rows"]:
            require(row["fullViolations"] == row["oldOldViolationsReused"] +
                    row["newNewViolations"] + row["oldNewViolations"], "Expanded pair partition mismatch")
    check("expanded cohort complete scenarios and disjoint pair accounting", expanded_pair_integrity)

    def corrected_link_integrity():
        report = read_json("reports/rank-models/resolved-link-delta-2026-09-11.json")
        previous = read_json("reports/rank-models/expanded-japan-store-validation-2026-09-11.json")
        source = read_json("docs/research/appmagic-weekly-id-correction-2026-09-11.json")
        old_rows = {(row["method"], row["utcOffsetHours"], row["model"]): row for row in previous["rows"]
                    if row["storeScope"] == report["storeScope"]}
        require(source["fullDomHref"].endswith("/" + source["resolvedId"]), "Corrected ID does not match full href")
        require(len(report["rows"]) == len(old_rows), "Missing corrected-link scenarios")
        require(report["fullPairs"] == report["priorPairsReused"] + report["newPairsEvaluated"],
                "Corrected pair counts overlap or omit pairs")
        keys = set()
        for row in report["rows"]:
            key = (row["method"], row["utcOffsetHours"], row["model"])
            require(key not in keys, "Duplicate corrected-link scenario")
            keys.add(key)
            require(row["priorViolationsReused"] == old_rows[key]["fullViolations"],
                    "Previously evaluated pair results changed")
            require(row["fullViolations"] == row["priorViolationsReused"] + row["newPairViolations"],
                    "Corrected pair total does not preserve the prior result")
    check("full-link correction adds only previously missing comparisons", corrected_link_integrity)

    def latent_scenario_integrity():
        report = read_json("reports/rank-models/weekly-latent-budgets-2026-09-11.json")
        keys = [(row["storeScope"], row["frozenExponent"], row["method"], row["utcOffsetHours"])
                for row in report["rows"]]
        expected = {(summary["storeScope"], summary["frozenExponent"], method, -12 + clock * .25)
                    for summary in report["summaries"] for method in ("linear", "previous", "next")
                    for clock in range(105)}
        require(len(keys) == len(set(keys)) and set(keys) == expected, "Latent budget coverage is incomplete")
        require(not report["coefficientsChanged"], "Latent budget test changed frozen curves")
        lag = read_json("reports/rank-models/lag-relaxed-order-2026-09-11.json")
        require(lag["lagAdopted"] is False, "An unverified lag was adopted")
        for row in lag["rows"]:
            covered, requested = row["maximumCoveredForwardShiftHoursAcrossAllClocks"], row["requestedMaximumForwardShiftHours"]
            require(row["fullRequestedLagUnionCovered"] == (covered == requested), "Missing boundaries masked")
            require(row["uncoveredForwardHoursAtLatestBoundary"] == requested - covered, "Wrong missing interval")
    check("latent budget scenarios and uncovered lag boundaries stay explicit", latent_scenario_integrity)

    def new_reference_scopes():
        earlier = read_json("docs/research/appmagic-store-public-2026-09-11/jp-earlier-months.json")
        require(earlier["amountsAvailable"] is False and
                earlier["eligibility"] == "reference_only_no_matched_local_rank_history",
                "Earlier months were mislabeled as matched money validation")
        for table in earlier["tables"]:
            ids = table["orderedRepresentativeIds"]
            require(len(ids) == len(set(ids)) == earlier["preservedRowsPerTable"], "Earlier table coverage mismatch")
        monthly = read_json("docs/research/japan-earlier-monthly-orders-2026-09-11.json")
        require(monthly["amountsAvailable"] is False, "Growth rates became absolute revenue amounts")
        for month in monthly["months"]:
            require([row["rank"] for row in month["rows"]] == list(range(1, 26)),
                    "Monthly image transcription has missing or duplicate positions")
            require(len({row["game"] for row in month["rows"]}) == 25, "Duplicate monthly game identity")
        fgo = read_json("docs/research/gacharevenue-fgo-scope-audit-2026-09-11.json")
        require(fgo["eligibility"] == "reference_only_scope_audit" and fgo["displayConversionRate"] is None,
                "Unknown version/currency scope silently converted")
        require(fgo["displayedAmountsKRW"]["CN"]["android"] is None, "Synthetic China Android labeled as observed")
        lineage = read_json("docs/research/provider-lineage-and-lag-audit-2026-09-11.json")
        require(lineage["corporateLineage"]["methodologyInterview"]["asOfSeptemberMethodologyIndependenceVerified"] is False,
                "Corporate independence inferred from distinct brand names")
        require(lineage["appmagicMetricTiming"]["operationalLagAdopted"] is False,
                "Search-only timing claim became a model assumption")
    check("new earlier-month, version, currency and provider scopes remain separate", new_reference_scopes)

    receipt = {"schemaVersion": 1, "productionEnabled": False,
               "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
               "passed": passed, "failures": failures, "distinctParentHashesChecked": len(hashes)}
    (ROOT / args.output).write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    raise SystemExit(bool(failures))


if __name__ == "__main__":
    main()
