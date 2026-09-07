'use strict';

// Shared numeric SEO thresholds for validate-seo.js (rendered HTML) and
// audit-content.js (source JSON). Yoast sourcing comments stay in validate-seo.js.

module.exports = {
  DENSITY_MIN: 0.005,
  /** Post-build gate in validate-seo.js */
  DENSITY_MAX_VALIDATE: 0.030,
  /** Pre-publish linter in audit-content.js */
  DENSITY_MAX_AUDIT: 0.035,
  READ_SENTENCE_CHARS_MAX: 120,
  READ_SENTENCE_WORDS_MAX: 45,
  READ_PARAGRAPH_SENTENCES_MAX: 7,
  SUMMARY_CHARS_MAX: 160,
  /** Minimum sources per article; no upper cap — identical counts across articles read as templated */
  SOURCES_MIN: 3,
};