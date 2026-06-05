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
foreign / Chinese). `sentences` uses Kiwi's sentence splitter for Korean-dominant
text and a decimal-safe regex splitter for English-dominant text (Kiwi collapses
English into a single span, which breaks the sentence-length check). `token_count`
is the total token count (used as the denominator for keyphrase density).
"""
import re
import sys
import json

from kiwipiepy import Kiwi

NOUN_TAGS = {"NNG", "NNP", "NNB", "SL", "SH"}

_HANGUL_RE = re.compile(r"[가-힣]")
# Sentence terminator followed by whitespace. Decimal points ("2.5", "63.2") are
# safe: the dot is followed by a digit, never whitespace, so it never splits.
_EN_SENT_RE = re.compile(r"(?<=[.!?])\s+(?=\S)")


def split_sentences(kiwi: Kiwi, text: str) -> list:
    letters = sum(1 for c in text if c.isalpha())
    hangul = len(_HANGUL_RE.findall(text))
    # English-dominant text: Kiwi's Korean splitter returns one giant span, so a
    # 4,000-char English body reads as a single 120+ char "sentence". Fall back to
    # a regex splitter so the length check stays meaningful.
    if letters and hangul / letters < 0.3:
        parts = [s.strip() for s in _EN_SENT_RE.split(text) if s.strip()]
        return parts or [text]
    return [s.text for s in kiwi.split_into_sents(text)]


def analyze(kiwi: Kiwi, text: str) -> dict:
    text = text or ""
    if not text.strip():
        return {"nouns": [], "sentences": [], "token_count": 0}
    tokens = kiwi.tokenize(text)
    nouns = [t.form for t in tokens if t.tag in NOUN_TAGS]
    sentences = split_sentences(kiwi, text)
    return {"nouns": nouns, "sentences": sentences, "token_count": len(tokens)}


def main() -> None:
    raw = sys.stdin.buffer.read().decode("utf-8")
    payload = json.loads(raw) if raw else {}
    texts = payload.get("texts") or []
    if not isinstance(texts, list):
        raise SystemExit("`texts` must be a list of strings")
    kiwi = Kiwi(num_workers=1)
    results = [analyze(kiwi, t) for t in texts]
    sys.stdout.buffer.write(json.dumps({"results": results}, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
