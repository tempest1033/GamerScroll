# Manual game classification

Edit `game-classifications.json`. Keys in `games` are exact slugs from `data/games.json`, not display names or store IDs.

- `genres`: editorial overrides for broad gameplay categories. Omit this field to inherit official store genres; an empty array explicitly leaves the game unclassified.
- `tags`: editorial themes or play styles such as `lineage-like`, `subculture`, `idle`, and `hypercasual`.
- Multiple values are allowed. A game can appear in multiple category rankings; do not add category totals together.
- An absent entry is unclassified, not excluded from overall rankings. Never infer genre from the developer or title alone.
- The existing `subculture-games.json` remains the fallback source for that tag. Explicit `tags` in this file overrides the fallback, including an empty array.
- Hypercasual should require evidence of simple short-session gameplay; do not tag every casual/puzzle game as hypercasual.
- Classify regional editions independently unless their identity is confirmed. Do not merge Chinese and global editions for classification.
- Current lists use each store's Korean revenue TOP 200. Monthly lists filter the existing monthly combined ranking without changing its scoring method.
- Rebuild with `node generate-html-report.js --quick` and run `node scripts/generate-game-pages.js` after an edit.

Example:

```json
"some-game-slug": {
  "genres": ["rpg"],
  "tags": ["subculture", "idle"]
}
```

Run `node scripts/test-genres.js` to validate IDs, page behavior, and print current classification coverage. Review unclassified games rather than forcing uncertain assignments.

## Official store survey

`game-genre-survey.json` preserves the full store lookup evidence for all mobile DB games. `node scripts/compile-game-genres.js` derives `game-store-genres.json`, using official category IDs only. The latter records source URLs, store genre differences, unsupported categories, failed lookups, and suggested tags requiring editorial review. Do not edit this generated file; edit `game-classifications.json` for overrides.

Official categories from both stores may coexist; they are store classifications, not a claim of editorial consensus. Adventure, music, educational, and arcade-only listings remain outside the current taxonomy rather than being forced into unrelated genres. Idle and hypercasual metadata creates review suggestions only. Anime imagery does not automatically imply subculture, and MMORPG does not automatically imply lineage-like.

Run the compiler after refreshing the survey, then rebuild. No lookup failure removes a game from the database or overall rankings.

## Editorial tag review

`game-tag-decisions.json` records reviewed confirmations, exclusions, and unresolved boundary cases with reasons and external references. `node scripts/review-game-tags.js` applies these decisions to the editable classification file and writes a per-game, per-tag audit to `game-tag-audit.json`. It preserves broad genre overrides and unrelated tags.

Only exact idle categories corroborated by an explicit idle-game description can add an idle tag without a named decision. An MMORPG label, automatic combat, an anime art style, or a casual category alone never confirms lineage-like, subculture, or hypercasual. Existing subculture classifications include character-centric anime/manga IP games, not only female-character RPGs. A lineage-like tag describes gameplay and monetization conventions; it is not a copyright or infringement finding.

Audit states distinguish `confirmed`, `retained` (previous editorial judgment), `pending`, `excluded`, and `not-flagged`. A `not-flagged` result is not proof of exclusion. Regional IDs remain separate. After editing decisions, run the review script, genre compiler, site build, and genre tests.

The September 9 follow-up review covers the frozen 314 tag/game pairs in `game-tag-resolution-manifest.json`. Grouped editorial decisions are in `game-tag-resolutions-20260909.json`; apply them with `node scripts/apply-tag-resolutions.js`, then run the normal review script. The generated `game-tag-resolution-report.json` records each individual decision and its official-store evidence. `unverified` means reviewed but insufficient evidence or conflicting app identity, not a negative classification. These entries never receive the disputed tag automatically.

Idle is a play-style tag and may overlap strategy, action, or management when automatic/offline progression is part of the game's core loop. A side mode, a developer's other game, an offline-compatible app, or a comparison phrase is insufficient. Subculture distinguishes character-focused narrative/collection and established anime/manga adaptations from generic anime-styled UI, avatar editors, and temporary collaboration skins.

The identity follow-up is recorded separately in `game-tag-resolutions-followup.json` and `game-tag-followup-report.json`. Apply historical rounds in order: `apply-tag-resolutions.js`, then `apply-tag-followup.js`, then `review-game-tags.js`. Do not apply the first round alone over newer judgments. The old `alter-ego` URL remains the yejin lee app; Caramel Column's game uses `alter-ego-caramel-column`. `app-identity-repairs.json` records the app-ID corrections and evidence backup location. For the repaired entries, `disableTitleFallback` prevents same-name or stale-alias history from leaking across apps.
