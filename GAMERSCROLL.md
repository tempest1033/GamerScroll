# GamerScroll Project Guide

## Overview
Game industry data crawling and daily report generation site.

| Environment | URL | Repository |
|-------------|-----|------------|
| **PC** | https://gamerscroll.com | [GamerScroll](https://github.com/tempest1033/GamerScroll) |

- Deployment: `docs/` folder via GitHub Pages

---

## Execution Modes

### Normal Mode (Full Crawl)
```bash
node generate-html-report.js
```
- Crawls all sources live
- Saves results to `data-cache.json`
- Saves daily snapshot to `history/{date}.json`
- Duration: ~3-5 min

### Quick Mode (Cache)
```bash
node generate-html-report.js --quick   # or -q
```
- Loads data from `data-cache.json`
- Regenerates HTML only (no crawling)
- Duration: ~5 sec
- **Use case**: HTML template testing, AI insight updates

### Auto Quick Mode (CI)
- GitHub Actions auto-skips crawling if cache is < 25 min old
- Prevents duplicate crawling in 30-min build cycle (3-5 min -> 5 sec)
- Local runs behave normally

### Local Testing
Build output is generated at **root**; **docs/** is for GitHub Pages deployment.

```bash
# 1. Quick build
node generate-html-report.js -q

# 2. Copy to docs (for local testing)
cp index.html docs/index.html

# 3. Start local server
cd docs && npx serve -l 3001
```

| Environment | docs copy |
|-------------|-----------|
| **GitHub Actions** | Automatic (build.yml) |
| **Local** | Manual copy required |

### Daily AI Insight
```bash
node generate-ai-insight.js
```
- Calls Claude API for AI analysis
- Collects game stock data
- Saves to `reports/{date}.json`
- Duration: ~1-2 min
- **Requires**: ANTHROPIC_API_KEY

---

## File Structure

```
/
├── generate-html-report.js    # Main entry point
├── generate-ai-insight.js     # Daily AI insight entry
│
├── data-cache.json            # Crawl cache (git tracked)
├── index.html                 # Local generated HTML
│
├── docs/                      # Deploy folder (gamerscroll.com)
│   ├── index.html             # Deployed HTML
│   ├── styles.css             # Stylesheet
│   ├── CNAME                  # Custom domain
│   └── reports/
│       └── {date}.json        # Daily insight (deploy copy)
│
├── reports/                   # Insight data
│   ├── {date}.json            # Daily AI insight + stocks + rankings
│   └── issue/
│       └── {slug}.json        # Issue reports (blog-style)
│
├── history/                   # Crawl snapshots
│   └── {date}.json            # Daily full crawl data
│
└── src/
    ├── crawlers/              # Crawler modules
    │   ├── index.js           # Crawler exports
    │   ├── rankings.js        # App Store / Play Store rankings
    │   ├── steam.js           # Steam rankings
    │   ├── news.js            # News (Inven, Ruliweb, GameMeca, Dige)
    │   ├── community.js       # Community (DCInside, Arca, Inven, Ruliweb)
    │   ├── youtube.js         # YouTube trending videos
    │   ├── live.js            # Chzzk/SOOP live
    │   ├── upcoming.js        # Upcoming games
    │   ├── metacritic.js      # Metacritic scores
    │   └── stocks.js          # Game stocks (Naver Finance)
    │
    ├── templates/
    │   └── html.js            # HTML template generator
    │
    ├── insights/
    │   ├── daily.js           # Daily insight analysis (delta calc)
    │   ├── ai-insight.js      # Daily AI insight generation
    │
    └── styles.css             # Source stylesheet
```

---

## Data Flow

### generate-html-report.js Flow

```
1. Check mode (--quick flag)
   ├── Quick: load data-cache.json
   └── Normal: run crawlers
       ├── fetchNews()            → news
       ├── fetchCommunityPosts()  → community
       ├── fetchRankings()        → rankings (iOS/Android grossing/free)
       ├── fetchSteamRankings()   → steam
       ├── fetchYouTubeVideos()   → youtube
       ├── fetchChzzkLives()      → chzzk
       ├── fetchUpcomingGames()   → upcoming
       └── fetchMetacriticGames() → metacritic

2. Save cache: data-cache.json
3. Save history: history/{date}.json (once/day)
4. Generate insight
   ├── Load yesterday: history/{yesterday}.json
   ├── Calculate rank changes: generateDailyInsight()
   └── Load AI insight: reports/{date}.json
5. Generate HTML: generateHTML() → index.html
6. Copy file: src/styles.css → styles.css
7. Generate daily report: reports/{date}.html (once/day)
```

### generate-ai-insight.js Flow

```
1. Load data-cache.json (exit if missing)

2. Load yesterday's ranking data
   ├── Try history/{yesterday}.json
   └── Try reports/{yesterday}.json (GitHub Actions fallback)

3. Analyze rank changes: buildRankingChanges()
   ├── up:  5+ rank rise
   ├── down: 5+ rank drop
   └── new: new TOP100 entry

4. Call Claude API: generateAIInsight()
   ├── Today's issues (4)
   ├── Industry issues (2)
   ├── Notable metrics (2)
   ├── Rank change analysis (4)
   ├── User reactions (4)
   ├── Streamer popularity (2)
   └── Stock picks (2) ← stocks array

5. Fetch stock prices: fetchStockPrices()
   ├── Query Naver Finance game/entertainment sector
   ├── Map AI-recommended stock codes
   └── Scrape closing price/change rate

6. Save: reports/{date}.json (KST, overwrites on regeneration)
   ├── ai: full AI insight
   ├── aiGeneratedAt: generation timestamp
   ├── stockMap: {stockName: code}
   └── stockPrices: {code: priceData}
```

---

## Game DB Management (Review Queue)

### Overview
- `games.json`: Game master data
- `review-queue.json`: New game verification queue

### Data Flow

```
Crawl → sync-and-enrich.js
              ↓
         New game → register in games.json + add to pending
              ↓
         Manual review (process-review-queue.js or direct)
              ↓
         Verified → remove from pending
```

### Step 1: Auto Sync (sync-and-enrich.js)
```bash
node scripts/sync-and-enrich.js [date]
```
- Detects new games from history
- Auto-registers in games.json
- Adds all new games to pending

### Step 2: Auto Reprocess (process-review-queue.js)
```bash
node scripts/process-review-queue.js [limit]
```
- Searches opposite platform for pending games
- Auto-matches on exact name match
- Keeps in pending even after auto-match (manual confirmation required)

### Step 3: Manual Review

**Cross-platform verification:**
| Status | Action |
|--------|--------|
| Both matched | Verify auto-match (check for false positives) |
| Single platform | Search opposite platform via web |

**Aliases verification:**
| Check | Example |
|-------|---------|
| Opposite platform name | 매직 레벨 9 <-> 피아노 레벨 9 |
| EN/KR variants | 헌티드 머지 <-> Haunted Merge |
| Space/special char variants | 돼지 키우는 중입니다 <-> 돼지키우는중입니다 |

**Final cleanup:**
- Update games.json (appId + aliases)
- Remove from pending

### games.json Structure
```json
{
  "게임명": {
    "appIds": {
      "ios": "123456789",
      "android": "com.company.game",
      "steam": "12345"
    },
    "aliases": ["english-name", "alt-name"],
    "developer": "Developer",
    "icon": "iconURL",
    "slug": "game-slug",
    "platforms": ["ios", "android"]
  }
}
```

### review-queue.json Structure
```json
{
  "pending": [
    {
      "title": "게임명",
      "appIds": { "ios": "123456789" },
      "status": "single",
      "addedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "approved": [],
  "rejected": []
}
```

---

## Game Stock Card

### Data Structure (reports/{date}.json)

```json
{
  "ai": {
    "stocks": [
      {
        "name": "엔씨소프트",
        "comment": "아이온2 업데이트와 향후 라이브 성과에 관심이에요."
      }
    ]
  },
  "stockMap": {
    "엔씨소프트": "036570",
    "크래프톤": "259960"
  },
  "stockPrices": {
    "036570": {
      "date": "2025.12.03",
      "price": 216000,
      "change": 7000,
      "changePercent": 3.35,
      "high": 218000,
      "low": 210000,
      "volume": 500000
    }
  }
}
```

### Stock Scraping Details (stocks.js)

```javascript
// Naver Finance game/entertainment sector
// URL: https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=263

// Daily price page
// URL: https://finance.naver.com/item/sise_day.naver?code={stockCode}

// Direction detection
// - em.bu_pup: up (red)
// - em.bu_pdn: down (blue)
// - span.tah: change value

// Encoding: EUC-KR → decoded via iconv-lite
```

### HTML Rendering (html.js)

```javascript
// Combines insight.ai.stocks + insight.stockMap + insight.stockPrices
// Maps stockName → code → priceData
// Generates Naver Finance chart image URL
// https://ssl.pstatic.net/imgfinance/chart/item/candle/day/{code}.png
```

---

## Workflows (GitHub Actions)

### build.yml
- Trigger: Every 30 min + manual
- Runner: ubuntu-latest
- Caching: npm + Playwright browsers
- Steps:
  1. `npm ci` (cached)
  2. Install Playwright browsers (cached)
  3. `node generate-html-report.js` - site generation
  4. `node scripts/sync-and-enrich.js` - game DB sync
  5. `node scripts/generate-game-pages.js` - game detail pages
  6. Copy to docs/
  7. Commit & push (GamerScroll)

### ai-insight.yml (Daily)
- Trigger: Every 12 hours (KST 06:00, 18:00) + manual
- Runner: self-hosted (local Mac)
- Steps:
  1. `npm install --production`
  2. `node generate-ai-insight.js`
  3. Copy reports/ -> docs/reports/
  4. Commit & push

### GamerScroll / AI Scroll Build Separation
- GamerScroll and AI Scroll (AIScroll blog) use **separate build workflows**
- Use AI build workflow for AI article deployment (not GamerScroll workflow)
- **Always verify target site/workflow before triggering a build**

---

## X (Twitter) 포스팅

3개 워크플로우로 X에 포스팅:

| 워크플로우 | 파일 | 트리거 | 계정 | 용도 |
|-----------|------|--------|------|------|
| X Daily Post | x-post.yml | 매일 07:00 KST + 수동 | GamerScroll | TOP3 핫이슈 카드 |
| X Article Post | x-article-post.yml | 수동 (slug) | GamerScroll | 한국어 기사 카드 |
| AIScroll Article Post | x-article-post-aiscroll.yml | 수동 (slug) | AIScroll | 영문 기사 카드 |

### 수동 트리거
```bash
# TOP3 데일리
gh workflow run 'X Daily Post'

# 한국어 기사
gh workflow run 'X Article Post' --field slug=<article-slug>

# 영문 기사 (AIScroll)
gh workflow run 'AIScroll Article Post' --field slug=<article-slug>
```

### 카드 템플릿
- TOP3: `src/templates/x-card-template.js` (1200x628, 다크 미니멀)
- 한국어 기사: `src/templates/x-article-card-template.js` (이미지 오버레이)
- 영문 기사: `src/templates/x-article-card-template-en.js` (AIScroll 브랜딩)

### 로컬 테스트
```bash
# 카드 이미지 생성
node generate-x-card.js
node generate-x-article-card.js <slug>
node generate-x-article-card.js <slug> --lang en
```

---

## Troubleshooting

### Stock card not showing
1. Check `reports/{date}.json` for `ai.stocks` and `stockPrices`
2. If missing: `node generate-ai-insight.js`
3. Regenerate HTML: `node generate-html-report.js -q`
4. Copy to docs: `cp index.html docs/index.html`
5. Commit & push

### Git conflicts
```bash
# data-cache.json conflict (prefer remote)
git checkout --theirs data-cache.json

# docs/index.html conflict (prefer local - includes stocks)
cp index.html docs/index.html
git add docs/index.html
```

### Stock price showing 0
- Possible Naver Finance HTML structure change
- Check selectors in stocks.js
- Relevant classes: `span.tah`, `em.bu_pup`, `em.bu_pdn`

---

## Environment Variables (.env)

```
YOUTUBE_API_KEY=...        # YouTube Data API
FIRECRAWL_API_KEY=...      # Firecrawl API (community crawling)
ANTHROPIC_API_KEY=...      # Claude API (AI insight)
```

---

## File Modification Rules

### Source vs Deploy Folder
| Folder | Purpose | Editable |
|--------|---------|----------|
| **src/** | Source code (original) | Yes - edit here |
| **docs/** | GitHub Pages deploy | No - overwritten on build |

**Important**: Always edit files in `src/`. The `docs/` folder is overwritten on build.

### CSS Structure/Rules
- Entry: `src/styles.css` (import order/cascade dependent - do not reorder)
- Modules: `src/styles/*.css` (split by role)
- Dark mode global override: `src/styles/01-dark-mode.css`
- Aggregator files:
  - Home: `src/styles/10-home.css` -> `10-home-core.css`, `10-home-shell.css`, `10-home-pages.css`
  - Home (per-page): `src/styles/10-home-pages.css` -> `10-home-pages-*.css`
  - Report: `src/styles/50-report-base.css` -> `50-report-*.css`
  - Game detail: `src/styles/80-game.css` -> `80-game-*.css`
  - Game DB/Trend: `src/styles/90-games-hub-and-trend.css` -> `90-*.css`

### Naming Conventions
#### Layout Container
- Site-wide width/padding wrapper: `.site-container` (legacy `.container` kept for compatibility)

#### Page Container
Top-level page wrapper classes use `*-container` suffix:
- Home: `home-container`
- General pages (news/community/steam/rankings/upcoming/meta): `page-container`
- Game detail: `game-container`
- Trend hub (feed): `game-container` + `trends-hub-container`
- Game DB: `games-hub-container`
- Insight/report: `insight-container`
- Issue report detail: `issue-container` (added alongside template's `blog-article`)

### Tab Rules
- Base components: `.tab-group` + `.tab-btn`
- Shared tab styles/breakpoints: `src/styles/06-tabs.css`
- Home news/community/video subtabs (home-only): `src/styles/07-home-subtabs.css`
- Per-page overrides: only in that page's module CSS

### Build Commands
```bash
# Normal build (full crawl + HTML generation)
npm run build

# Quick build (cache, HTML only) - for local testing
npm run build -- --quick   # or -q
```

### Edit -> Test Workflow
```bash
# 1. Edit src/ files (e.g., src/styles.css)
# 2. Quick build
npm run build -- --quick
# 3. Local server
cd docs && npx serve -l 3000
```

---

## Issue Report Writing

### Overview
- Blog-style articles on various topics
- Interactive process (topic discussion -> research -> draft -> revise -> publish)
- Path: `reports/issue/{slug}.json`
- URL: `/trend/issue/{slug}/`

### Writing Process
```
1. Topic selection - discuss with user
2. Research - collect data via web search
3. Draft - save JSON (status: draft)
4. Quick build for local preview - drafts visible locally
5. Apply feedback - revise and rebuild
6. Set status -> approved when ready to publish
```

**Important**: After drafting, always share the full text. Showing only JSON makes it hard for the user to review.

### Writing Checklist (Issue Report)
| Item | Check | Description |
|------|:-----:|-------------|
| **Date format** | - | `YYYY-MM-DDTHH:MM`, **rounded to 30-min intervals** (e.g., 01:00, 01:30). 비워두면(`""`) status가 approved일 때 빌드 시 자동 기록 (KST) |
| **Images** | - | Place every 2-3 sections. 3-4 images total. None in intro/conclusion. Check for broken images |
| **Image alt** | - | Required for all images (keyword-rich description) |
| **Body structure** | - | 2-3 paragraphs per section, 2-4 sentences each, separated by `\n\n` |
| **Sources** | - | Minimum 4-5. **Never use Namuwiki** |
| **Related docs** | - | Link via relatedDocs (e.g., `issue:slug`, `hotpick:slug`, `insight:slug`, `ranking:slug`, `wiki:slug`, `tech:cat/slug`). Max 4. Legacy relatedIssues also supported |
| **Related games** | - | Link mentioned game slugs in relatedGames |
| **K-game perspective** | - | Exclude content unrelated to Korea (e.g., frame China shutdowns as impact on K-games) |
| **Thumbnail duplication** | - | Thumbnail and body images must not overlap |
| **Quick build check** | - | Verify image loading and layout |

### JSON Format
```json
{
  "slug": "게임-AI-논란-수상박탈",
  "status": "draft",
  "title": "제목 (임팩트 있게)",
  "date": "2026-01-04T12:00",
  "keywords": "키워드1, 키워드2, 키워드3",
  "summary": "요약 2-3문장 (독자 흥미 유발)",
  "thumbnail": "thumbnailURL",
  "relatedDocs": ["issue:관련-이슈-slug", "hotpick:관련-핫픽-slug"],
  "sources": [{ "name": "출처명", "title": "기사제목", "url": "URL" }],
  "content": [
    { "type": "heading", "value": "키워드로 시작하는 소제목" },
    { "type": "image", "src": "imageURL", "caption": "caption", "alt": "keyword description" },
    { "type": "text", "value": "body paragraph" },
    { "type": "ad" },
    { "type": "heading", "value": "마치며" },
    { "type": "text", "value": "conclusion paragraph" }
  ]
}
```

### Field Rules
| Field | Rule | Example |
|-------|------|---------|
| **slug** | 3-5 words, kebab-case (SEO) | `리니지-클래식-월정액-복귀` |
| **date** | ISO + time (for same-day sorting). 비워두면(`""`) approved 시 빌드에서 현재 시각 자동 기록 (KST, JSON에 write-back) | `2026-01-20T12:00` 또는 `""` |
| **title** | Title only, no tags (~~[이슈 포커스]~~ forbidden) | `AI 썼다고 수상 박탈?…` |
| **keywords** | SEO keywords, comma-separated | `리니지, 엔씨소프트, MMORPG` |
| **heading** | Numbered, last one "마치며: subtitle" (no number). **부제 구분자는 `:` 로 통일** — `—` (em dash) 사용 금지. 예: "마치며: 부제" (O), "마치며 — 부제" (X) | `1. 첫 번째`, `마치며: 핵심 메시지` |
| **relatedGames** | (Optional) Related game slug array; manual overrides auto-match | `["승리의-여신-니케"]` |
| **relatedDocs** | (Optional) Unified related docs array (max 4). Prefix: issue, insight, hotpick, ranking, wiki, tech. Slug-only also works (auto-search) | `["issue:게임-AI-논란", "hotpick:ff7-remake"]` |
| **relatedIssues** | (Optional, legacy) Related issue slug array. Use relatedDocs instead | `["게임-AI-논란-수상박탈"]` |
| **sources** | (Optional) Source array, good for SEO | `[{name, title, url}]` |

### Content Block Types
| Type | Purpose | Details |
|------|---------|---------|
| `text` | Body paragraph | 3-4 paragraphs, 3-5 sentences each, `\n\n` separator |
| `heading` | Subheading (h2) | Section start |
| `image` | Image + caption | src, caption, alt fields |
| `video` | YouTube embed | url, caption fields (16:9 responsive) |
| `ad` | Ad placement | Place 2-3 throughout |
| `quote` | Block quote | Emphasized statement |
| `table` | Table | headers, rows, caption (optional) fields |

### Writing Style Rules
| Item | Rule |
|------|------|
| **Intro** | 2-3 sentences (key summary) |
| **Section count** | 4-7 |
| **Body** | 2-3 paragraphs/section, 2-4 sentences/paragraph |
| **Subheadings** | Use heading for each section |
| **Images** | 1 per section, placed right after heading. **No thumbnail/body duplication**. **Prefer Google Images/News, never Wikipedia** |
| **Image ratio** | **Prefer landscape (16:9)**. Avoid portrait. Prefer gameplay/screenshot/promo images |
| **Image height** | Hero (thumbnail): desktop 280px / mobile 200px. Body images: 800px |
| **Ads** | 2-3 placements within body |
| **Tone** | Blog-style explanatory. Header tone is flexible |
| **Output language** | Korean (한국어) |

### SEO Rules

#### URL/Slug
| Item | Rule | Example |
|------|------|---------|
| **Length** | 3-5 words | `ram-price-surge-2026` |
| **Language** | Lowercase English only (no Korean) | `roguelike-casual-korea` |
| **Separator** | Hyphen (-) | `game-ai` (not `game_ai`) |
| **Dates/numbers** | Avoid (hard to reuse) | Not `2026-01-ram-price` |

#### Title (H1 = title)
- Place **core keyword at the front**
- Under 50 chars recommended
- Bad: `게이머의 악몽이 시작됐다, 램가격 폭등`
- Good: `램가격 폭등이 컴퓨터가격 폭등으로, 게이머의 악몽`

#### Subheading (H2 = heading)
- **Start with keyword**
- Bad: `1. 왜 갑자기 램이 이렇게 비싸졌나?`
- Good: `DDR5 램 가격 폭등, 왜 이렇게 비싸졌나?`
- Good: `1. DDR5 램 가격 폭등 원인` (numbered OK)

#### Keywords
- Mix main + long-tail keywords
- Include year (`2026`)
- 10-15 recommended
- Example: `DDR5 램 가격, 램가격 폭등 2026, 메모리 슈퍼사이클, PC 조립 비용`

#### Summary (= meta description)
- **120-150 chars**
- Include core keywords
- Include click-inducing phrasing

#### First Paragraph (Intro)
- **Include core keyword in first 3 sentences** naturally
- Pattern: problem statement -> key info -> value of this article

#### Body Keyword Placement
- Core keyword: 5-8 natural occurrences across entire article
- At least 1 related keyword per subheading
- Core keyword reappears in final paragraph

#### Internal Links
- Use **relatedDocs** field (max 4, unified format: `issue:slug`, `hotpick:slug`, etc.)
- Legacy **relatedIssues** also supported
- Related games via **relatedGames** field or auto-matching
- In body text, mention by name only (no inline links needed)

#### Image SEO
| Field | Purpose | Rule |
|-------|---------|------|
| **src** | Image URL | Required |
| **caption** | Display caption | Concise |
| **alt** | For search engines | **Required**, keyword-rich description |

#### Article Length
| Item | Recommended |
|------|-------------|
| Total | 2,000-3,000 chars |
| Per section | 2-3 paragraphs, 2-4 sentences each |

#### Line Break Policy
- **Paragraph separation**: `\n\n` (blank line)
- **Within paragraph**: No line breaks, continuous text

### Publication Status
- `status: "draft" | "approved"`
- Initial writing must be `draft`
- Build/hub/sitemap includes **approved only**

### Image Placement Pattern
```
heading → image → text → text → text
heading → image → text → text → ad → text
```

### Build
```bash
npm run build -- -q   # Quick build auto-generates pages
```

---

## Ranking Report Writing

### Overview
- Comparative ranking analysis reports between games
- Interactive process (topic -> data check -> draft -> revise -> publish)
- Path: `reports/ranking/{slug}.json`
- URL: `/trend/ranking/{slug}/`

### Writing Process
```
1. Topic selection - choose games to compare
2. Data check - verify actual rankings from history/{date}.json bestRanks
3. Draft - save JSON (status: draft)
4. Quick build for local preview
5. Apply feedback - revise and rebuild
6. Set status -> approved when ready to publish
```

### JSON Format
```json
{
  "slug": "game-a-vs-game-b-2026",
  "status": "draft",
  "title": "제목 (비교 구도 명확하게)",
  "date": "2026-01-28T21:00",
  "keywords": "게임A, 게임B, 순위 비교, 매출 순위",
  "summary": "요약 2-3문장",
  "thumbnail": "thumbnailURL",
  "relatedDocs": ["issue:관련-이슈-slug"],
  "relatedGames": ["게임A-slug", "게임B-slug"],
  "sources": [],
  "content": [
    { "type": "text", "value": "intro paragraph" },
    { "type": "link", "url": "/games/게임A/", "text": "게임A", "subtext": "실시간 순위 확인하기" },
    { "type": "heading", "value": "1. 매출 순위: 분석 제목" },
    { "type": "chart", "games": ["게임A", "게임B"], "category": "grossing", "market": "ios", "startDate": "2026-01-22", "endDate": "2026-01-28", "title": "iOS 매출 순위 비교" },
    { "type": "text", "value": "analysis content" },
    { "type": "image", "src": "imageURL", "caption": "caption" },
    { "type": "ad" }
  ]
}
```

### Ranking-Specific Content Block Types
| Type | Purpose | Fields |
|------|---------|--------|
| `chart` | Ranking chart | games, category, market, startDate, endDate, title |
| `link` | Game page link | url, text, subtext |

**Chart block fields:**
| Field | Values | Example |
|-------|--------|---------|
| games | Game slug array | `["명일방주-엔드필드", "드래곤소드"]` |
| category | `grossing` / `free` | Revenue / Downloads |
| market | `ios` / `android` | Platform |
| startDate | `YYYY-MM-DD` | Chart start date |
| endDate | `YYYY-MM-DD` | Chart end date |
| title | Chart title | `iOS 매출 순위 비교 (한국)` |

### bestRanks Data Check
Actual ranking data is in `history/{date}.json` under `bestRanks`:

```javascript
// history/2026-01-28.json structure
{
  "bestRanks": {
    "ios_kr_grossing": { "appID": rank },
    "ios_kr_free": { "appID": rank },
    "android_kr_grossing": { "packageName": rank },
    "android_kr_free": { "packageName": rank }
  }
}
```

**Finding app IDs:** Search by game name in `games.json`

### Image Placement Rules
- **Place image right after heading** (before text)
- Caption must match section content
- Example: Global market section -> "게임명 글로벌 동시 출시" (not "오픈월드 환경")

```
heading → image → text → text
```

### Monthly Ranking Report Process

Monthly ranking articles (모바일, 스팀, 서브컬쳐) are produced in 3 steps:

**Step 1: Run analysis scripts**
```bash
# Mobile grossing rankings (iOS + Android, Korea)
node monthly-mobile-analysis.js --month YYYY-MM --country kr
# Output: reports/monthly/mobile-YYYY-MM-kr.json

# Steam CCU rankings
node monthly-steam-analysis.js YYYY-MM
# Output: reports/monthly/steam-YYYY-MM.json

# Steam: exclude non-games (Wallpaper Engine default excluded)
node monthly-steam-analysis.js YYYY-MM --exclude=431960,2676230
```

**Step 2: Filter subculture games**
- `data/subculture-games.json` contains curated subculture game slugs
- Filter mobile analysis results by this list → subculture TOP 10
- Games with `minDays < 15` are excluded by default; add manually if notable (e.g., new launch)

```bash
# Quick verification: filter subculture from mobile results
node -e '
const m=require("./reports/monthly/mobile-YYYY-MM-kr.json");
const s=require("./data/subculture-games.json");
const set=new Set(s.games.map(g=>g.slug));
m.rankings.regular.forEach((g,i)=>{
  if(set.has(g.slug)) console.log((i+1)+"위 | "+g.gameKey+" | "+g.totalPoints+"점");
});
'
```

**Step 3: Write 3 articles (status: draft)**

| Article | Slug Pattern | Source |
|---------|-------------|--------|
| 모바일 전체 TOP 10 | `mobile-{month}-kr` | mobile analysis TOP 10 |
| 스팀 CCU TOP 10 | `steam-{month}` | steam analysis TOP 10 |
| 서브컬쳐 TOP 10 | `subculture-{month}-kr` | mobile analysis filtered by subculture list |

**Output paths:** `reports/ranking/{slug}.json`

**Key fields from analysis:**
- `totalPoints` → ranking-bar score
- `ios.avgRank`, `aos.avgRank` → per-game description
- `ios.minRank`, `aos.minRank` → "최고 N위"
- `totalDays` → 출현 일수

### Monthly Ranking Report Guidelines

For monthly subculture/genre ranking reports:

**1. Title format**
- `{Year}년 {Month}월 {Genre} 게임 매출 순위`
- Example: "2026년 1월 서브컬쳐 게임 매출 순위"

**2. Structure**
```
Intro (text) → ranking chart (ranking-bar) → individual game analysis (10th→1st reverse order)
```
- No "TOP 10 순위" heading; chart directly below intro
- Per game: heading -> ranking-card -> ranking-compare -> text

**3. Ranking Data Verification (Required)**
- Check actual best ranks from `history/{date}.json` `bestRanks`
- Cross-verify with `data/stats/ranking/{month}-kr.json`
- Look up app IDs in `games.json`

```bash
# Check specific game ranking from bestRanks
python3 -c "
import json, os
app_id = 'APP_ID'  # from games.json
for day in range(1, 32):
    f = f'history/2026-01-{day:02d}.json'
    if os.path.exists(f):
        data = json.load(open(f, encoding='utf-8-sig'))
        rank = data.get('bestRanks',{}).get('ios_kr_grossing',{}).get(app_id)
        if rank: print(f'Day {day}: rank {rank}')
"
```

**4. ranking-card block**
```json
{
  "type": "ranking-card",
  "item": {
    "name": "게임명",
    "score": 1234,
    "slug": "game-slug",
    "ios": "최고 3위",
    "android": "최고 5위"
  }
}
```

**5. ranking-compare block** (iOS vs Android chart)
```json
{
  "type": "ranking-compare",
  "title": "게임명 iOS vs Android",
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "items": [
    {"slug": "game-slug", "market": "ios", "label": "iOS"},
    {"slug": "game-slug", "market": "android", "label": "Android"}
  ]
}
```

**6. relatedGames**
- Add all TOP 10 game slugs
- Verify exact slugs from `games.json`

**7. Per-game descriptions**
- Research updates/events for that month using MCP firecrawl
- Include specific info: pickup characters, collabs, anniversary events
- Omit obvious patterns like "rank rose after pickup then dropped"

### Writing Checklist (Ranking Report)
| Item | Check | Description |
|------|:-----:|-------------|
| **bestRanks verified** | - | Verify wording against actual ranking data |
| **Chart dates** | - | startDate/endDate match analysis period |
| **Image captions** | - | Match section topic |
| **Game links** | - | Add link blocks for compared games in intro |
| **Quick build check** | - | Verify chart rendering, image loading |

---

## Game Wiki Writing

### Overview
- Wiki-style articles about game industry knowledge/terminology
- Interactive process (topic -> research -> draft -> revise -> publish)
- Path: `data/wiki/{category}/{slug}.json`
- URL: `/wiki/{category}/{slug}/`
- Categories: `business` / `history` / `knowledge`

> **Tech articles** are in a separate section:
> - Path: `data/tech/{category}/{slug}.json`
> - URL: `/tech/{category}/{slug}/`
> - Category: `normal` (general)

> **AI articles (AIScroll)** use the `ai` category under tech:
> - Path: `data/tech/ai/{slug}.json`
> - AIScroll URL: `/article/{category}/{slug}/`
> - **Required field**: `category` (determines folder)
> - Category values: `general` | `openai` | `google` | `anthropic`
> - **AI 관련 기사는 `reports/issue/`가 아닌 `data/tech/ai/`에 작성한다. AIScroll 빌드가 `data/tech/ai/`만 수집하기 때문.**
>
> | Category | Target |
> |----------|--------|
> | `general` | General AI news, multi-company comparisons, industry trends |
> | `openai` | OpenAI, ChatGPT, GPT series, DALL-E, Sora |
> | `google` | Google, DeepMind, Gemini, Bard, Genie |
> | `anthropic` | Anthropic, Claude, Constitutional AI |
>
> **Source Rules (AI articles — AIScroll + issue reports with AI topics)**
> - **AI 기사의 sources에는 한국 매체를 포함하지 않는다. 영문/글로벌 매체만 사용.**
> - Use WSJ, Bloomberg, Reuters, TechCrunch, The Verge, Tom's Hardware, etc.
> - No Korean domestic media (MS TODAY, AI타임스, 디지털투데이, 뉴스1, etc.)
> - Minimum 2-3 international sources recommended
> - This rule applies to both `data/tech/ai/` articles AND `reports/issue/` articles about AI topics
>
> **English Co-writing (AIScroll, recommended)**
> - Write English version alongside Korean
> - Required English fields: `keywordsEn`, `titleEn`, `summaryEn`, `contentEn`
> - Set `needTranslate: false` when co-writing (skips auto-translation)
> - Saves translation workflow time + better quality
>
> **Translation Fields (AIScroll only)**
> | Field | Value | Description |
> |-------|-------|-------------|
> | `needTranslate` | absent/`true` | Translation needed (default) |
> | `needTranslate` | `false` | Translation complete |
> | `titleEn` | string | English title (auto-generated after translation) |
> | `summaryEn` | string | English summary (auto-generated after translation) |
> | `keywordsEn` | string | English keywords (**must add manually when writing JSON**) |
> | `contentEn` | array | English body (auto-generated after translation) |
>
> Warning: **keywordsEn is NOT auto-translated** - add English keywords manually when writing JSON

> **VibeCoding** uses the `vibecoding` category under tech:
> - Path: `data/tech/vibecoding/{slug}.json`
> - URL: `/tech/vibecoding/{slug}/`
> - **Required field**: `category: "vibecoding"`
>
> **English Co-writing (VibeCoding, recommended)**
> - Required English fields: `keywordsEn`, `titleEn`, `summaryEn`
> - Set `needTranslate: false` when co-writing
>
> **Translation Fields (VibeCoding)**
> | Field | Description |
> |-------|-------------|
> | `category` | `"vibecoding"` (fixed) |
> | `keywordsEn` | English keywords (must add manually) |
> | `titleEn` | English title |
> | `summaryEn` | English summary |
> | `contentEn` | English body (same structure as content) |
> | `needTranslate` | `true` (needs translation) / `false` (done) |

> **Translation Workflow**
> ```
> 1. Add keywordsEn field when writing new article (required)
> 2. Run aibuild.yml → detects articles where needTranslate !== false
> 3. translate-ai-blog.js runs → translates via Claude
> 4. On completion: needTranslate: false + titleEn/summaryEn/contentEn saved
> 5. generate-ai-blog.js runs → generates HTML
> ```

### Writing Process
```
1. Topic selection - discuss with user
2. Research - collect data via web search
3. Draft - save JSON (status: draft)
4. Quick build for local preview - drafts visible locally
5. Apply feedback - revise and rebuild
6. Set status -> approved when ready to publish
```

**Important**: After drafting, always share the full text. Showing only JSON makes it hard for the user to review.

### Writing Checklist (Wiki)
| Item | Check | Description |
|------|:-----:|-------------|
| **Date format** | - | `YYYY-MM-DDTHH:MM`, **rounded to 30-min intervals**. 비워두면(`""`) status가 approved일 때 빌드 시 자동 기록 (KST) |
| **Images** | - | Every 2-3 sections. 3-4 total. None in intro/conclusion. Check for broken images |
| **Image alt** | - | Required for all images (keyword-rich description) |
| **Sources** | - | Minimum 4-5. **Never use Namuwiki** |
| **Related docs** | - | Link via relatedDocs (e.g., `wiki:slug`, `tech:cat/slug`, `issue:slug`) |
| **Related games** | - | Link mentioned game slugs in relatedGames |
| **Thumbnail duplication** | - | Thumbnail and body images must not overlap |
| **Year references** | - | Use "recent trends" instead of "2025 trends" (maintain timeliness) |
| **Quick build check** | - | Verify image loading and layout |

### JSON Format
```json
{
  "slug": "unity-engine",
  "status": "draft",
  "title": "제목 (명확하고 직관적으로)",
  "date": "2026-01-20T12:00",
  "keywords": "키워드1, 키워드2, 키워드3",
  "summary": "요약 2-3문장 (핵심 정의/가치 중심)",
  "thumbnail": "thumbnailURL",
  "sources": [{ "name": "출처명", "title": "문서/기사 제목", "url": "URL" }],
  "content": [
    { "type": "heading", "value": "키워드로 시작하는 소제목" },
    { "type": "image", "src": "imageURL", "caption": "caption", "alt": "keyword description" },
    { "type": "text", "value": "body paragraph" },
    { "type": "quote", "value": "quote" },
    { "type": "heading", "value": "마치며" },
    { "type": "text", "value": "closing paragraph" }
  ]
}
```

### Field Rules
| Field | Rule | Example |
|-------|------|---------|
| **slug** | 3-5 words, kebab-case (SEO) | `unity-engine` |
| **date** | ISO + time (for same-day sorting). 비워두면(`""`) approved 시 빌드에서 현재 시각 자동 기록 (KST, JSON에 write-back) | `2026-01-20T12:00` 또는 `""` |
| **title** | Title only, no tags | `Unity 엔진` |
| **keywords** | SEO keywords, comma-separated | `Unity, 게임 엔진, 크로스플랫폼` |
| **heading** | Start with keyword, last one "마치며: subtitle". **부제 구분자는 `:` 로 통일** — `—` (em dash) 사용 금지 | `Unity 엔진 특징`, `마치며: 핵심 메시지` |
| **category** | Folder name | `business`, `history`, `knowledge` (wiki) / `normal` (tech) |
| **sources** | (Optional) Source array, **no Namuwiki** | `[{name, title, url}]` |
| **relatedDocs** | (Optional, recommended) Unified related docs array | `["wiki:unity-engine", "issue:게임-AI-논란"]` |
| **relatedArticles** | (Optional, legacy) Related wiki slug array | `["unity-engine"]` |
| **relatedIssues** | (Optional, legacy) Related issue slug array | `["게임-AI-논란"]` |
| **relatedGames** | (Optional) Related game slug array | `["리니지-m", "메이플스토리"]` |

### Content Linking Rules (relatedDocs / relatedGames)

| Field | Max | Required |
|-------|-----|----------|
| **relatedGames** | 4 | Optional |
| **relatedDocs** | 4 | Optional (unified format, recommended) |
| **relatedArticles** | 4 | Optional (legacy, wiki/tech) |
| **relatedIssues** | 4 | Optional (legacy, wiki/tech) |

**relatedDocs unified format (recommended):**
```json
"relatedDocs": [
  "wiki:slug",                    // Wiki doc (searches all categories)
  "wiki:category/slug",           // Wiki doc (specific category)
  "tech:category/slug",           // Tech doc
  "issue:slug",                   // Issue report
  "insight:slug",                 // Insight report
  "hotpick:slug",                 // Hotpick report
  "ranking:slug",                 // Ranking report
  "slug-only"                     // Auto-search (issue → insight → hotpick → ranking → wiki → tech)
]
```

**Example:**
```json
"relatedDocs": [
  "wiki:knowledge/chzzk-soop-p2p-grid",
  "tech:ai/moltbook-ai-social-network",
  "issue:pc-bang-decline-arcade-fate",
  "hotpick:ff7-remake-switch2-release",
  "ranking:steam-january-2026"
]
```

**Legacy fallback:**
- If `relatedDocs` is absent, uses `relatedArticles` + `relatedIssues` + `relatedInsights` + `relatedHotpicks` combination
- Existing JSON files work without modification

**Linking scope:**
- All types can link to all types (wiki, tech, issue, insight, hotpick, ranking)
- Slug-only (no prefix) auto-searches all collections

**Linking method:**
- Manual: specify slugs in JSON array (takes priority)
- Auto: auto-links when game names are mentioned in body (max 4)

**OK to leave empty** when no related content exists.

**Finding slugs:**
```bash
# Wiki slugs
ls data/wiki/*/*.json | xargs -I {} basename {} .json

# Tech slugs
ls data/tech/*/*.json | xargs -I {} basename {} .json

# Issue report slugs
ls reports/issue/*.json | xargs -I {} basename {} .json

# Game slug search
grep -l "게임명" data/games.json
```

### Content Block Types
| Type | Purpose | Details |
|------|---------|---------|
| `text` | Body paragraph | 3-4 paragraphs, 3-5 sentences each, `\n\n` separator |
| `heading` | Subheading (h2) | Section start |
| `image` | Image + caption | src, caption, alt fields |
| `video` | YouTube embed | url, caption fields (16:9 responsive) |
| `quote` | Block quote | Emphasized statement |
| `table` | Table | headers, rows, caption (optional) |

**Table block example:**
```json
{
  "type": "table",
  "caption": "PC 플랫폼",
  "headers": ["플랫폼", "기본 수수료", "비고"],
  "rows": [
    ["스팀", "30%", "$10M 초과 25%"],
    ["에픽", "12%", "첫 $1M 0%"]
  ]
}
```

### Writing Style Rules
| Item | Rule |
|------|------|
| **Intro** | 2-3 sentences (core definition) |
| **Section count** | 4-7 |
| **Body** | 2-3 paragraphs/section, 2-4 sentences/paragraph |
| **Subheadings** | Use heading for each section |
| **Images** | Every 2-3 sections. 3-4 total. None in intro/conclusion. **No thumbnail/body duplication. Google Images/News preferred, never Wikipedia** |
| **Image height** | Hero (thumbnail): desktop 280px / mobile 200px. Body images: 800px |
| **Tone** | Explanatory, concise, and direct |
| **Output language** | Korean (한국어) |

### SEO Rules

#### URL/Slug
| Item | Rule | Example |
|------|------|---------|
| **Length** | 3-5 words | `unity-engine` |
| **Language** | Lowercase English preferred, Korean allowed | `게임-엔진-정의` |
| **Separator** | Hyphen (-) | `game-engine` (not `game_engine`) |
| **Dates/numbers** | Avoid | Not `2026-unity-engine` |

#### Title (H1 = title)
- **Core keyword at the front**
- Under 40 chars recommended

#### Subheading (H2 = heading)
- **Start with keyword**

#### Keywords
- Mix main + long-tail keywords
- 8-12 recommended

#### Summary (= meta description)
- **120-150 chars**
- Include core keywords
- Definition + practical value in one line

#### Body Keyword Placement
- Core keyword: 4-6 natural occurrences
- At least 1 related keyword per subheading

#### Image SEO
| Field | Purpose | Rule |
|-------|---------|------|
| **src** | Image URL | Required |
| **caption** | Display caption | Concise |
| **alt** | For search engines | **Required**, keyword-rich description |

#### Article Length
| Item | Recommended |
|------|-------------|
| Total | 2,000-3,000 chars |
| Per section | 2-3 paragraphs, 2-4 sentences each |

### Publication Status
- `status: "draft" | "approved"`
- Initial writing must be `draft`
- Build/hub/sitemap includes **approved only**

### Content Structure Pattern
```
text (intro) → heading → image → text → heading → image → text → ... → heading (마치며) → text
```
- **Intro**: Start with text, no heading (3-4 sentences)
- **Body sections**: heading -> image -> text order
- **Final section**: "마치며" heading -> text (no image needed)

### Build
```bash
npm run build -- -q   # Quick build auto-generates pages
```

### SEO Final Checklist

| Item | Check | Criteria |
|------|:-----:|---------|
| **Slug** | - | 3-5 words, English kebab-case, includes core keyword |
| **Title** | - | Core keyword at front, under 40 chars |
| **Summary** | - | 120-150 chars, core keyword + click trigger |
| **Keywords** | - | 8-12, main + long-tail mix, **diversified variants** |
| **First paragraph** | - | Core keyword naturally in first 3 sentences |
| **Subheadings** | - | Related keywords naturally, last one "마치며" |
| **Body keywords** | - | 4-6 natural occurrences throughout |
| **Image alt** | - | All images have keyword-rich descriptions |
| **Sources** | - | 2+ credible sources |

#### Keyword Diversification Principle
- **No identical keyword repetition**: same keyword in every subheading = keyword stuffing
- **Use variants**: synonyms, abbreviations, related terms of the main keyword
- **Use long-tail**: "롤러코스터 타이쿤" -> "놀이공원 시뮬레이션", "타이쿤 장르", "RCT"

**Example (good keyword composition):**
```
Main: 롤러코스터 타이쿤
Variants: RCT, 놀이공원 시뮬레이션, 타이쿤 게임
Long-tail: 90년대 PC 게임, 1인 개발 전설, 어셈블리어 게임 개발
```

---

## Image Pending Queue

### Overview
- Failed image downloads are added to the pending queue
- Subsequent runs skip URLs in pending (saves time)
- Manually review and resolve later

### Data Structure
- Path: `data/pending-images.json`

```json
{
  "pending": [
    {
      "url": "https://example.com/image.jpg",
      "date": "2025-12-22",
      "type": "ai.issues",
      "failedAt": "2026-01-29T12:00:00.000Z",
      "error": "timeout"
    }
  ]
}
```

### Data Flow
```
Image download fails → add to pending-images.json
              ↓
         Next run → skip if in pending
              ↓
         Manual review (check if URL is alive, find replacement)
              ↓
         Resolved → remove from pending
```

### Manual Resolution
| Situation | Action |
|-----------|--------|
| URL alive | Remove from pending and re-run |
| URL dead | Remove/replace thumbnail in the date's JSON |
| Old date | Delete the entire date's report |

### Related Scripts
- `scripts/download-daily-images.js` - Daily image download
- `scripts/download-images.js` - Wiki/tech/issue image download

---

## Important Notes

1. **Workflow timing**: build (30 min) must run after ai-insight (12 hr) for stock cards to display
2. **Weekends/holidays**: Stock data uses last trading day
3. **Cache dependency**: Quick mode requires data-cache.json
4. **API cost**: AI insight calls Claude API (self-hosted runner)
5. **EUC-KR**: Naver Finance uses EUC-KR encoding

---

## Git Commit Rules

### Source Files (Commit Targets)
| Path | Description |
|------|-------------|
| `data/` | Game DB, wiki, tech, issue JSON |
| `reports/` | AI insight JSON |
| `src/` | Crawlers, templates |
| `scripts/` | Scripts |
| `*.js` | Entry points (generate-*.js, etc.) |
| `GAMERSCROLL.md` | Project guide |
| `package.json` | Dependencies |

### Build Artifacts (Do Not Touch)
| Path | Description |
|------|-------------|
| `docs/` | Built on server |
| `styles.*.css` | Generated on server |
| `.build-cache.json` | Managed by server |

**Rules:**
1. Commit source files only
2. Do not modify/delete build artifacts locally
3. **Rebase before push** (to incorporate server build artifacts)
4. Trigger build after push

---

## Git Commands (WSL)

WSL `/mnt/c/` path access has performance issues. Run Git commands via PowerShell:

```powershell
# 1. Commit sources only
powershell.exe -Command "cd C:\Project\GamerScroll; git add data/ reports/ src/ scripts/ *.js *.md package.json; git commit -m 'message'"

# 2. Rebase (incorporate server artifacts) - required!
powershell.exe -Command "cd C:\Project\GamerScroll; git pull --rebase origin main"

# 3. Push & trigger build
powershell.exe -Command "cd C:\Project\GamerScroll; git push origin main; gh workflow run build.yml"

# Trigger AI insight workflow
powershell.exe -Command "cd C:\Project\GamerScroll; gh workflow run ai-insight.yml"

```

**GitHub Actions**: https://github.com/tempest1033/GamerScroll/actions

---

## Git Operation Rules

1. **Rebase before push**: Always `git pull --rebase` before push. Never push without rebase
2. **Article push**: Commit only JSON content files - exclude unrelated changes
3. **Category migration**: Clean up previous build artifacts when moving content between categories (e.g., issue -> insight)
4. **Unstaged changes**: Stash or resolve unstaged changes before starting Git operations
