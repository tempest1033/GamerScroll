'use strict';

// Script checks for per-edition game names (rank/stats.js displayName).
const HANGUL = /[\uAC00-\uD7A3]/;
const KANA = /[\u3040-\u30FF]/;
const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7A3]/;
// Characters that exist only in Simplified Chinese (never a Traditional form), generated from OpenCC by scripts/gen-simplified-only.js.
// A name shared by TW and CN (e.g. 原神, 泛舟) has none of them, so it is never mistaken for Simplified.
const SIMPLIFIED_ONLY = new RegExp('[' + require('./simplified-only') + ']', 'u');

// Whether a store name belongs in an edition: Hangul only in ko, kana only in ja, no CJK in en, no Simplified-only characters in zh-tw.
const fitsEdition = (name, code) => {
  if (HANGUL.test(name) && code !== 'ko') return false;
  if (KANA.test(name) && code !== 'ja') return false;
  if (code === 'en' && CJK.test(name)) return false;
  return !(code === 'zh-tw' && SIMPLIFIED_ONLY.test(name));
};

module.exports = { HANGUL, KANA, CJK, fitsEdition };
