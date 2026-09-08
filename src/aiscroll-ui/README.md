# AIScroll presentation isolation

AIScroll owns `src/aiscroll-ui`, `src/aiscroll-styles`,
`src/aiscroll-build`, and `src/templates/ai-blog`.
The first three directories were seeded byte-for-byte from `ae58a6a3d`
(the AIScroll build before the GamerScroll redesign).

Do not import GamerScroll's `src/templates/layout`, template helpers,
`src/styles`, or `src/build` into the AIScroll build.
Changes to those GamerScroll directories must not invalidate the AI cache
or trigger its deployment workflow.

This is presentation/build isolation within one repository, not a separate
repository. Article data, source images, dependencies, and Cloudflare
`functions/` remain shared. Changes to shared content or infrastructure
still require checking both sites.

Build AIScroll with `npm run build:aiscroll`. Build GamerScroll with
`npm run build:gamerscroll` (and its game-page generator).
`npm run build` deliberately builds both sites. Deployment branches remain
`deploy-aiscroll` and `deploy-gamerscroll`; no deployment is performed by
the local isolation work.
