"""Do not force agreement with one provider when two public monthly orders conflict."""
import argparse
import importlib.util
import json
from simulate import ROOT, read_json
from frozen_models import input_fingerprint


def consensus_pairs(panel, secondary):
    lookup = {(store, app_id): game["key"] for game in panel["games"]
              for store, ids in game["storeIds"].items() for app_id in ids}
    secondary_ranks = {}
    for row in secondary["rows"]:
        name = lookup.get((row["providerStore"], row["providerId"]))
        if name is not None:
            if name in secondary_ranks:
                raise ValueError("Duplicate secondary product family")
            secondary_ranks[name] = row["rank"]
    primary = []
    for game in panel["games"]:
        ref = next((row for row in game.get("regionalRankReferences", [])
                    if row["geography"] == "JP"), None)
        if ref and game["key"] in secondary_ranks:
            primary.append((ref["rank"], game["key"]))
    primary.sort()
    agreed, disputed = [], []
    for i, (_, first) in enumerate(primary):
        for _, second in primary[i + 1:]:
            (agreed if secondary_ranks[first] < secondary_ranks[second] else disputed).append([first, second])
    return {"commonGames": [row[1] for row in primary], "agreedPairs": agreed,
            "disputedPairs": disputed, "secondaryRanks": secondary_ranks}


def load_ordinal():
    spec = importlib.util.spec_from_file_location("ordinal_profile", ROOT / "scripts/revenue-research/ordinal-profile.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exponent-step", type=float, default=.01)
    parser.add_argument("--mixture-step", type=float, default=.005)
    args = parser.parse_args()
    panel_path = "reports/rank-models/normalized-august-regional-panel-2026-09-10.json"
    secondary_path = "docs/research/appmagic-public-2026-09-11/august-jp.json"
    panel, secondary = read_json(panel_path), read_json(secondary_path)
    assert secondary["geography"] == "JP"
    assert all(secondary["period"][key] == panel["period"][key] for key in ("start", "end"))
    agreement = consensus_pairs(panel, secondary)
    module = load_ordinal()
    result = module.profile(panel, exponent_step=args.exponent_step, mixture_step=args.mixture_step,
                            allowed_pairs=agreement["agreedPairs"])
    result["providerAgreement"] = agreement
    result["secondaryInput"] = input_fingerprint(secondary_path)
    result["limitations"].extend([
        "Consensus is provider agreement, not verified transaction truth or statistical independence.",
        "Disputed pairs are omitted, not forced into a tie, averaged, or silently assigned a winner.",
        "This deliberately reduces constraints; lower violations do not alone mean higher accuracy.",
        "Money diagnostics remain unused and mix providers exactly as in the original experiment."
    ])
    (ROOT / "reports/rank-models/consensus-japan-2026-09-11.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"commonGames": len(agreement["commonGames"]),
                      "agreedPairs": len(agreement["agreedPairs"]), "disputedPairs": len(agreement["disputedPairs"]),
                      "minimumViolations": result["minimumPairViolations"],
                      "coOptimalSet": result["coOptimalSet"]}), flush=True)


if __name__ == "__main__":
    main()
