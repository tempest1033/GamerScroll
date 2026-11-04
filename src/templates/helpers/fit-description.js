'use strict';

// Meta description fitting: whole sentences only, never a mid-sentence "..." cut. Width counts CJK characters as 2,
// so the ~155-column budget of a Latin snippet is ~77 CJK characters (equivalent visual length).
const MAX_WIDTH = 155;
const WIDE = /[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFF60]/;

const width = (text) => { let w = 0; for (const ch of String(text)) w += WIDE.test(ch) ? 2 : 1; return w; };

// Prose text → longest run of leading sentences within the budget. When even the first sentence is over budget the
// caller's short complete `fallback` sentence replaces it. Structured descriptions (game pages) are built from
// sentence arrays by game-description.js trimDescription and fit the budget before they get here, so names such as
// "MONOPOLY GO!" are not re-parsed as prose.
function fitSentences(text, fallback, max = MAX_WIDTH) {
  const s = String(text || '').trim();
  if (width(s) <= max) return s;
  // A Latin ".", "!" or "?" ends a sentence only before whitespace + a capital/digit/end ("MONOPOLY GO! revenue", "GO!," stay inside a name).
  const sentences = s.match(/(?:[^.!?。！？]|[.!?](?!\s+[A-Z0-9"'“]|\s*$))+[.!?。！？]+["'”’)）」』]*\s*/g) || [s];
  if (width(sentences[0].trim()) > max) return fallback || sentences[0].trim();
  let out = '';
  for (const sentence of sentences) {
    if (width(out + sentence) > max) break;
    out += sentence;
  }
  return out.trim();
}

module.exports = { fitSentences, width, MAX_WIDTH };
