'use strict';

// Meta description fitting: whole sentences only, never a mid-sentence "..." cut. Width counts CJK characters as 2,
// so the ~155-column budget of a Latin snippet is ~77 CJK characters (equivalent visual length).
const MAX_WIDTH = 155;
const WIDE = /[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFF60]/;

const width = (text) => { let w = 0; for (const ch of String(text)) w += WIDE.test(ch) ? 2 : 1; return w; };

// Longest run of leading sentences within the budget; a first sentence that is itself too long stays whole.
function fitSentences(text, max = MAX_WIDTH) {
  const s = String(text || '').trim();
  if (width(s) <= max) return s;
  // "!" or "?" glued to the next character ("MONOPOLY GO!,") is part of a name, not a sentence end.
  const sentences = s.match(/(?:[^.!?。！？]|[.!?](?=[^\s.!?。！？]))+[.!?。！？]+["'”’)）」』]*\s*/g) || [s];
  let out = '';
  for (const sentence of sentences) {
    if (out && width(out + sentence) > max) break;
    out += sentence;
  }
  return out.trim();
}

module.exports = { fitSentences, width, MAX_WIDTH };
