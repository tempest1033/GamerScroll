'use strict';

// Meta description fitting: whole sentences only, never a mid-sentence "..." cut. Width counts CJK characters as 2,
// so the ~155-column budget of a Latin snippet is ~77 CJK characters (equivalent visual length).
const MAX_WIDTH = 155;
// A <title>, brand suffix included, in the same columns (about what a SERP shows before cutting).
const MAX_TITLE_WIDTH = 70;
const WIDE = /[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFF60]/;

const width = (text) => { let w = 0; for (const ch of String(text)) w += WIDE.test(ch) ? 2 : 1; return w; };

// Prose text → longest run of leading sentences within the budget. When even the first sentence is over budget the
// caller's short complete `fallback` sentence replaces it. Structured descriptions (game pages) are built from
// sentence arrays by game-description.js trimDescription and fit the budget before they get here, so names such as
// "MONOPOLY GO!" are not re-parsed as prose.
function fitSentences(text, fallback, max = MAX_WIDTH) {
  const s = String(text || '').trim();
  if (width(s) <= max) return s;
  // A Latin ".", "!" or "?" ends a sentence before whitespace + anything but a lowercase Latin letter (a capital, digit,
  // "#", Hangul, kana...) or at the end ("MONOPOLY GO! revenue", "GO!," stay inside a name).
  const sentences = s.match(/(?:[^.!?。！？]|[.!?](?!\s+[^a-z\s]|\s*$))+[.!?。！？]+["'”’)）」』]*\s*/g) || [s];
  if (width(sentences[0].trim()) > max) return fallback || sentences[0].trim();
  let out = '';
  for (const sentence of sentences) {
    if (width((out + sentence).trim()) > max) break;
    out += sentence;
  }
  return out.trim();
}

// A name and its main part (before a subtitle separator).
const forms = (name) => {
  const full = String(name || '');
  return [full, full.split(/\s*[:：|｜【\[(（]|\s+[-–—]\s+/)[0].trim() || full];
};

// The titles that are a name alone, with its label (`labels`, see fitTitle): their pages drop the brand suffix.
const nameAlone = (name, labels = [(n) => n]) => forms(name).flatMap((n) => labels.map((label) => label(n)));

// A title naming `name` within MAX_TITLE_WIDTH: the first of `variants(name)` (longest first) that fits, then the same with the
// name's main part. A name with a label (a regional version's market; `labels`: functions adding it, the full label first,
// then shortened ones) keeps its whole name first: its templates with each label, then the labelled name alone, and only
// then the main part the same way. A name is never cut: when nothing fits, the title is the full name alone (with its full
// label), even where it exceeds the budget.
function fitTitle(name, variants, labels) {
  const [full] = forms(name);
  const tries = forms(name).flatMap((n) => (labels ? [...labels.flatMap((label) => variants(label(n))), ...labels.map((label) => label(n))] : variants(n)));
  return tries.find((s) => width(s) <= MAX_TITLE_WIDTH) || (labels ? labels[0](full) : full);
}

module.exports = { fitSentences, fitTitle, nameAlone, width, MAX_WIDTH, MAX_TITLE_WIDTH };
