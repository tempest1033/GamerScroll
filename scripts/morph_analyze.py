#!/usr/bin/env python3
"""Korean morpheme helper for validate-seo.js.

Protocol: read JSON from stdin, write JSON to stdout.

Input:
    {"texts": ["...", "..."]}

Output:
    {"results": [
        {"nouns": ["surface1", ...], "sentences": ["...", ...], "token_count": N},
        ...
    ]}

`nouns` covers POS tags NNG / NNP / NNB / SL / SH (general / proper / dependent /
foreign / Chinese). `sentences` is Kiwi's sentence splitter. `token_count` is the
total token count (used as the denominator for keyphrase density).
"""
import sys
import json

from kiwipiepy import Kiwi

NOUN_TAGS = {"NNG", "NNP", "NNB", "SL", "SH"}


def analyze(kiwi: Kiwi, text: str) -> dict:
    text = text or ""
    if not text.strip():
        return {"nouns": [], "sentences": [], "token_count": 0}
    tokens = kiwi.tokenize(text)
    nouns = [t.form for t in tokens if t.tag in NOUN_TAGS]
    sentences = [s.text for s in kiwi.split_into_sents(text)]
    return {"nouns": nouns, "sentences": sentences, "token_count": len(tokens)}


def main() -> None:
    raw = sys.stdin.buffer.read().decode("utf-8")
    payload = json.loads(raw) if raw else {}
    texts = payload.get("texts") or []
    if not isinstance(texts, list):
        raise SystemExit("`texts` must be a list of strings")
    kiwi = Kiwi()
    results = [analyze(kiwi, t) for t in texts]
    sys.stdout.buffer.write(json.dumps({"results": results}, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
