# GamerScroll 프로젝트 가이드

## 프로젝트 개요
게임 업계 데이터 크롤링 및 일일/주간 리포트 생성 사이트

| 환경 | URL | Repository |
|------|-----|------------|
| **PC** | https://gamerscroll.com | [GamerScroll](https://github.com/tempest1033/GamerScroll) |

- 배포: `docs/` 폴더 → GitHub Pages

---

## 실행 모드

### 일반 모드 (전체 크롤링)
```bash
node generate-html-report.js
```
- 모든 소스에서 실시간 크롤링
- `data-cache.json`에 결과 저장
- `history/{date}.json`에 일별 스냅샷 저장
- 소요 시간: 약 3-5분

### 퀵 모드 (캐시 사용)
```bash
node generate-html-report.js --quick
node generate-html-report.js -q
```
- `data-cache.json`에서 데이터 로드
- 크롤링 없이 HTML만 재생성
- 소요 시간: 약 5초
- **용도**: HTML 템플릿 수정 테스트, AI 인사이트 반영 등

### 자동 퀵 모드 (CI 환경)
- GitHub Actions에서 캐시가 25분 이내면 자동으로 크롤링 스킵
- 30분 주기 빌드에서 중복 크롤링 방지
- 빌드 시간 대폭 단축 (3-5분 → 5초)
- 로컬에서는 기존대로 동작 (개발자가 원할 때 크롤링)

### 로컬 테스트
빌드 결과물은 **루트**에 생성되고, **docs/** 폴더는 GitHub Pages 배포용.

```bash
# 1. 빌드 (퀵 모드)
node generate-html-report.js -q

# 2. docs 폴더로 복사 (로컬 테스트용)
cp index.html docs/index.html

# 3. 로컬 서버 실행
cd docs && npx serve -l 3001
```

| 환경 | docs 복사 |
|------|----------|
| **GitHub Actions** | ✅ 자동 (build.yml) |
| **로컬 테스트** | ❌ 수동 복사 필요 |

### AI 인사이트 생성 (일간)
```bash
node generate-ai-insight.js
```
- Claude API 호출하여 AI 분석 생성
- 게임주 주가 데이터 수집
- `reports/{date}.json`에 저장
- 소요 시간: 약 1-2분
- **주의**: ANTHROPIC_API_KEY 필요

### 주간 인사이트 생성
```bash
node generate-weekly-insight.js          # 지난주 리포트 생성
node generate-weekly-insight.js --force  # 강제 재생성
```
- 지난 주 일일 리포트를 기반으로 주간 요약 생성
- Codex CLI 호출하여 AI 분석 생성
- `reports/weekly/{year}-W{week}.json`에 저장
- 소요 시간: 약 5-10분
- **실행 시점**: 매주 월요일 0시 (KST)
- **주의**: 지난 주 일일 리포트가 있어야 함

---

## 파일 구조

```
/
├── generate-html-report.js    # 메인 진입점
├── generate-ai-insight.js     # 일간 AI 인사이트 진입점
├── generate-weekly-insight.js # 주간 AI 인사이트 진입점
│
├── data-cache.json            # 크롤링 캐시 (git tracked)
├── index.html                 # 로컬 생성 HTML
│
├── docs/                      # 배포 폴더 (gamerscroll.com)
│   ├── index.html             # 배포용 HTML
│   ├── styles.css             # 스타일시트
│   ├── CNAME                  # 커스텀 도메인
│   └── reports/
│       ├── {date}.json        # 일별 인사이트 (배포용 복사본)
│       └── weekly/
│           └── {year}-W{week}.json # 주간 인사이트 (배포용 복사본)
│
├── reports/                   # 인사이트 데이터
│   ├── {date}.json            # 일간 AI 인사이트 + 주가 + 순위분석
│   ├── issue/
│   │   └── {slug}.json        # 이슈 리포트 (블로그형)
│   └── weekly/
│       └── {year}-W{week}.json # 주간 AI 인사이트
│
├── history/                   # 크롤링 스냅샷
│   └── {date}.json            # 일별 전체 크롤링 데이터
│
└── src/
    ├── crawlers/              # 크롤러 모듈
    │   ├── index.js           # 크롤러 export
    │   ├── rankings.js        # 앱스토어/플레이스토어 순위
    │   ├── steam.js           # 스팀 순위
    │   ├── news.js            # 뉴스 (인벤, 루리웹, 게임메카, 디게)
    │   ├── community.js       # 커뮤니티 (디시, 아카, 인벤, 루리웹)
    │   ├── youtube.js         # 유튜브 인기 영상
    │   ├── live.js            # 치지직/숲 라이브
    │   ├── upcoming.js        # 출시 예정 게임
    │   ├── metacritic.js      # 메타크리틱 평점
    │   └── stocks.js          # 게임주 주가 (네이버 증권)
    │
    ├── templates/
    │   └── html.js            # HTML 템플릿 생성
    │
    ├── insights/
    │   ├── daily.js           # 일일 인사이트 분석 (변동 계산)
    │   ├── ai-insight.js      # 일간 AI 인사이트 생성
    │   └── weekly-ai-insight.js # 주간 AI 인사이트 생성
    │
    └── styles.css             # 스타일시트 원본
```

---

## 데이터 흐름

### generate-html-report.js 실행 흐름

```
1. 모드 확인 (--quick 플래그)
   ├── 퀵 모드: data-cache.json 로드
   └── 일반 모드: 크롤링 실행
       ├── fetchNews()         → news
       ├── fetchCommunityPosts() → community
       ├── fetchRankings()     → rankings (iOS/Android 매출/인기)
       ├── fetchSteamRankings() → steam
       ├── fetchYouTubeVideos() → youtube
       ├── fetchChzzkLives()   → chzzk
       ├── fetchUpcomingGames() → upcoming
       └── fetchMetacriticGames() → metacritic

2. 캐시 저장: data-cache.json

3. 히스토리 저장: history/{date}.json (하루 1회)

4. 인사이트 생성
   ├── 어제 데이터 로드: history/{yesterday}.json
   ├── 순위 변동 계산: generateDailyInsight()
   └── AI 인사이트 로드: reports/{date}.json

5. HTML 생성: generateHTML() → index.html

6. 파일 복사: src/styles.css → styles.css

7. 데일리 리포트 생성: reports/{date}.html (하루 1회)
```

### generate-ai-insight.js 실행 흐름

```
1. data-cache.json 로드 (없으면 종료)

2. 어제 순위 데이터 로드
   ├── history/{yesterday}.json 시도
   └── reports/{yesterday}.json 시도 (GitHub Actions용)

3. 순위 변동 분석: buildRankingChanges()
   ├── up: 5단계 이상 상승
   ├── down: 5단계 이상 하락
   └── new: TOP100 신규 진입

4. Claude API 호출: generateAIInsight()
   ├── 오늘의 이슈 (4개)
   ├── 업계 이슈 (2개)
   ├── 주목할만한 지표 (2개)
   ├── 순위 변동 분석 (4개)
   ├── 유저 반응 (4개)
   ├── 스트리머 인기 (2개)
   └── 게임주 추천 (2개) ← stocks 배열

5. 게임주 주가 수집: fetchStockPrices()
   ├── 네이버 증권 게임엔터테인먼트 업종 조회
   ├── AI가 추천한 종목 코드 매핑
   └── 전일 종가/등락률 스크래핑

6. 저장: reports/{date}.json (KST 기준, 재생성 시 덮어씀)
   ├── ai: AI 인사이트 전체
   ├── aiGeneratedAt: 생성 시각
   ├── stockMap: {종목명: 코드} 맵
   └── stockPrices: {코드: 주가데이터} 맵
```

---

## 게임 DB 관리 (리뷰 큐)

### 개요
- `games.json`: 게임 마스터 데이터
- `review-queue.json`: 신규 게임 검증 대기열

### 데이터 흐름

```
크롤링 → sync-and-enrich.js
              ↓
         신규 게임 → games.json 등록 + pending 추가
              ↓
         수동 검증 (process-review-queue.js 또는 직접)
              ↓
         검증 완료 → pending에서 제거
```

### 1단계: 자동 동기화 (sync-and-enrich.js)
```bash
node scripts/sync-and-enrich.js [날짜]
```
- 히스토리에서 신규 게임 감지
- games.json에 자동 등록
- 모든 신규 게임을 pending에 추가

### 2단계: 자동 재처리 (process-review-queue.js)
```bash
node scripts/process-review-queue.js [limit]
```
- pending 게임들 반대 플랫폼 재검색
- 이름 완전 일치 시 자동 매칭
- 자동 매칭돼도 pending 유지 (수동 확인 후 제거)

### 3단계: 수동 검증

**반대 플랫폼 검증:**
| 상태 | 작업 |
|------|------|
| 양쪽 매칭됨 | 자동 매칭 확인 (오매칭 체크) |
| 단일 플랫폼 | 인터넷 검색으로 반대 플랫폼 찾기 |

**aliases 검증:**
| 체크 항목 | 예시 |
|----------|------|
| 반대 플랫폼 이름 | 매직 레벨 9 ↔ 피아노 레벨 9 |
| 영문/한글 변형 | 헌티드 머지 ↔ Haunted Merge |
| 공백/특수문자 변형 | 돼지 키우는 중입니다 ↔ 돼지키우는중입니다 |

**최종 정리:**
- games.json 업데이트 (appId + aliases)
- pending에서 제거

### games.json 구조
```json
{
  "게임명": {
    "appIds": {
      "ios": "123456789",
      "android": "com.company.game",
      "steam": "12345"
    },
    "aliases": ["영문명", "다른이름"],
    "developer": "개발사",
    "icon": "아이콘URL",
    "slug": "game-slug",
    "platforms": ["ios", "android"]
  }
}
```

### review-queue.json 구조
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

## 게임주 현황 카드

### 데이터 구조 (reports/{date}.json)

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

### 주가 스크래핑 상세 (stocks.js)

```javascript
// 네이버 증권 게임엔터테인먼트 업종
// URL: https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=263

// 일별 시세 페이지
// URL: https://finance.naver.com/item/sise_day.naver?code={종목코드}

// 등락 방향 판별
// - em.bu_pup: 상승 (빨간색)
// - em.bu_pdn: 하락 (파란색)
// - span.tah: 변동 수치

// 인코딩: EUC-KR → iconv-lite로 디코딩
```

### HTML 렌더링 (html.js)

```javascript
// insight.ai.stocks + insight.stockMap + insight.stockPrices 조합
// 종목명 → 코드 → 주가데이터 매핑
// 네이버 증권 차트 이미지 URL 생성
// https://ssl.pstatic.net/imgfinance/chart/item/candle/day/{코드}.png
```

---

## 주간 인사이트

### 데이터 구조 (reports/weekly/{year}-W{week}.json)

```json
{
  "weekInfo": {
    "startDate": "2025-11-25",
    "endDate": "2025-12-01",
    "weekNumber": 48,
    "dates": ["2025-11-25", "2025-11-26", ...]
  },
  "generatedAt": "2025-12-02T00:00:00.000Z",
  "dailyReportCount": 7,
  "ai": {
    "date": "2025-11-25 ~ 2025-12-01",
    "weekNumber": 48,
    "issues": [
      { "tag": "모바일", "title": "금주 핫이슈 제목", "desc": "설명 100자" }
    ],
    "industryIssues": [
      { "tag": "넥슨", "title": "업계 이슈 제목", "desc": "업계 동향 설명" }
    ],
    "metrics": [
      { "tag": "매출", "title": "주간 지표 제목", "desc": "지표 설명" }
    ],
    "rankings": [
      { "tag": "급상승", "title": "게임명", "desc": "순위 변동 이유" }
    ],
    "community": [
      { "tag": "게임명", "title": "커뮤니티 핫토픽", "desc": "반응 요약" }
    ],
    "streaming": [
      { "tag": "유튜브", "title": "스트리밍 트렌드", "desc": "트렌드 설명" }
    ],
    "stocks": [
      { "name": "259960-크래프톤", "comment": "주간 주목 이유" }
    ]
  }
}
```

### 생성 흐름

```
1. 지난 주 월~일 날짜 계산
2. 각 날짜별 일일 리포트 로드 (reports/{date}.json)
3. 일일 리포트 데이터 요약
4. Codex CLI 호출 (gpt-5.1)
5. 주간 인사이트 JSON 생성 (일간과 동일한 구조)
6. reports/weekly/{year}-W{week}.json 저장
7. docs/reports/weekly/ 복사
```

---

## 워크플로우 (GitHub Actions)

### build.yml
- 트리거: 30분마다 + 수동
- 러너: ubuntu-latest
- 캐싱: npm + Playwright 브라우저
- 작업:
  1. `npm ci` (캐시 활용)
  2. Playwright 브라우저 설치 (캐시 활용)
  3. `node generate-html-report.js` - 사이트 생성
  4. `node scripts/sync-and-enrich.js` - 게임 DB 동기화
  5. `node scripts/generate-game-pages.js` - 게임 상세 페이지 생성
  6. docs/ 폴더로 복사
  7. 커밋 & 푸시 (GamerScroll)

### ai-insight.yml (일간)
- 트리거: 12시간마다 (KST 06:00, 18:00) + 수동
- 러너: self-hosted (로컬 맥)
- 작업:
  1. npm install --production
  2. `node generate-ai-insight.js`
  3. reports/ → docs/reports/ 복사
  4. 커밋 & 푸시

### weekly-insight.yml (주간)
- 트리거: 매주 월요일 03시 (KST) + 수동
- 러너: self-hosted (로컬 맥)
- 작업:
  1. npm install --production
  2. `node generate-weekly-insight.js`
  3. reports/weekly/ → docs/reports/weekly/ 복사
  4. 커밋 & 푸시
- **주의**: 지난 주 일일 리포트가 있어야 함

---

## 문제 해결

### 게임주 현황이 안 보일 때
1. `reports/{date}.json`에 `ai.stocks`, `stockPrices` 확인
2. 없으면: `node generate-ai-insight.js`
3. HTML 재생성: `node generate-html-report.js -q`
4. docs 복사: `cp index.html docs/index.html`
5. 커밋 & 푸시

### Git 충돌 해결
```bash
# data-cache.json 충돌 시 (리모트 우선)
git checkout --theirs data-cache.json

# docs/index.html 충돌 시 (로컬 우선 - 게임주 포함)
cp index.html docs/index.html
git add docs/index.html
```

### 주가가 0원으로 표시될 때
- 네이버 증권 HTML 구조 변경 가능성
- stocks.js의 셀렉터 확인 필요
- `span.tah`, `em.bu_pup`, `em.bu_pdn` 클래스

---

## 환경 변수 (.env)

```
YOUTUBE_API_KEY=...        # YouTube Data API
FIRECRAWL_API_KEY=...      # Firecrawl API (커뮤니티 크롤링)
ANTHROPIC_API_KEY=...      # Claude API (AI 인사이트)
```

---

## 파일 수정 규칙

### 소스 vs 배포 폴더
| 폴더 | 용도 | 수정 |
|------|------|------|
| **src/** | 소스 코드 (원본) | ✅ 여기서 수정 |
| **docs/** | GitHub Pages 배포용 | ❌ 빌드 시 덮어씌워짐 |

**중요**: CSS, 템플릿 등 수정 시 반드시 `src/` 폴더의 파일을 수정해야 합니다. `docs/` 폴더는 빌드 시 자동으로 덮어씌워집니다.

### CSS 구조/규칙 (현행)
- 엔트리: `src/styles.css` (import 순서/캐스케이드 의존 — 순서 변경 금지)
- 모듈: `src/styles/*.css` (역할별로 파일 분리)
- 다크모드 전역 오버라이드: `src/styles/01-dark-mode.css`
- 집합(aggregator) 파일
  - 홈: `src/styles/10-home.css` → `10-home-core.css`, `10-home-shell.css`, `10-home-pages.css`
  - 홈(페이지별): `src/styles/10-home-pages.css` → `10-home-pages-*.css`
  - 리포트: `src/styles/50-report-base.css` → `50-report-*.css`
  - 게임 상세: `src/styles/80-game.css` → `80-game-*.css`
  - 게임 DB/트렌드: `src/styles/90-games-hub-and-trend.css` → `90-*.css`

### 네이밍 규칙 (현행)
#### 레이아웃 컨테이너
- 사이트 전체 폭/패딩 래퍼: `.site-container` (레거시 `.container`는 호환용으로 유지)

#### 페이지 컨테이너
페이지 최상위 래퍼 클래스는 `*-container` 접미사로 통일합니다.
- 홈: `home-container`
- 일반 페이지(뉴스/커뮤니티/스팀/순위/출시/메타): `page-container`
- 게임 상세: `game-container`
- 트렌드 허브(피드): `game-container` + `trends-hub-container`
- 게임 DB: `games-hub-container`
- 인사이트/리포트: `insight-container`
- 이슈 리포트 상세: `issue-container` (템플릿의 `blog-article`에 함께 부여)

### 탭 규칙 (현행)
- 기본 구성요소는 `.tab-group` + `.tab-btn` 입니다.
- 공통 탭 스타일/브레이크포인트는 `src/styles/06-tabs.css`에서 관리합니다.
- 홈 뉴스/커뮤니티/영상 서브탭(홈 전용)은 `src/styles/07-home-subtabs.css`에서 관리합니다.
- 페이지별 오버라이드는 해당 페이지 모듈 CSS에서만 추가합니다.

### 빌드 명령어
```bash
# 일반 빌드 (전체 크롤링 + HTML 생성)
npm run build

# 퀵 빌드 (캐시 사용, HTML만 재생성) - 로컬 테스트용
npm run build -- --quick
npm run build -- -q
```

### 수정 → 테스트 워크플로우
```bash
# 1. src/ 파일 수정 (예: src/styles.css)

# 2. 퀵 빌드 (캐시 사용, 빠름)
npm run build -- --quick

# 3. 로컬 서버로 확인
cd docs && npx serve -l 3000
```

---

## 이슈 리포트 작성 (Issue)

### 개요
- 다양한 주제에 대한 블로그형 이슈 글
- 대화형으로 작성 (주제 논의 → 자료 조사 → 초안 → 수정 → 완성)
- 저장 경로: `reports/issue/{slug}.json`
- URL: `/trend/issue/{slug}/`

### 작성 프로세스
```
1. 주제 선정 - 사용자와 논의
2. 자료 조사 - 웹 검색으로 데이터 수집
3. 초안 작성 - JSON 저장 (draft 상태)
4. 퀵빌드로 로컬 확인 - draft도 로컬에서 보임
5. 피드백 반영 - 수정 후 퀵빌드 반복
6. 올릴 때 status → approved로 변경
```

**중요**: 초안 작성 후 반드시 글 전문을 텍스트로 공유해야 함. JSON만 보여주면 사용자가 내용 확인이 어려움.

### 작성 체크리스트 (이슈 리포트)
| 항목 | 체크 | 설명 |
|------|:----:|------|
| **날짜 형식** | ☐ | `YYYY-MM-DDTHH:MM` 형식 필수 (예: `2026-01-21T12:00`), 시간 누락 금지 |
| **이미지** | ☐ | 서론/마치며 제외 모든 섹션에 1개씩, 깨진 이미지 없는지 확인 |
| **이미지 alt** | ☐ | 모든 이미지에 alt 텍스트 필수 (키워드 포함 설명) |
| **본문 구조** | ☐ | 섹션당 2-3단락, 단락당 2-4문장, `\n\n`으로 구분 |
| **출처** | ☐ | 최소 4-5개 이상, **나무위키 절대 제외** |
| **관련 이슈** | ☐ | relatedIssues에 관련 이슈 slug 연결 (최대 4개) |
| **관련 게임** | ☐ | relatedGames에 언급된 게임 slug 연결 |
| **K게임 관점** | ☐ | 한국과 무관한 내용 배제 (예: 중국 업체 폐업 → K게임 영향으로) |
| **썸네일 중복** | ☐ | 썸네일과 본문 이미지 중복 금지 |
| **퀵빌드 확인** | ☐ | 이미지 로드, 레이아웃 확인 |

### JSON 형식
```json
{
  "slug": "게임-AI-논란-수상박탈",
  "status": "draft",
  "title": "제목 (임팩트 있게)",
  "date": "2026-01-04T12:00",
  "keywords": "키워드1, 키워드2, 키워드3",
  "summary": "요약 2-3문장 (독자 흥미 유발)",
  "thumbnail": "대표 이미지 URL",
  "relatedIssues": ["관련-이슈-slug-1", "관련-이슈-slug-2"],
  "sources": [{ "name": "출처명", "title": "기사제목", "url": "URL" }],
  "content": [
    { "type": "heading", "value": "키워드로 시작하는 소제목" },
    { "type": "image", "src": "이미지URL", "caption": "캡션", "alt": "키워드 포함 설명" },
    { "type": "text", "value": "본문 문단" },
    { "type": "ad" },
    { "type": "heading", "value": "마치며" },
    { "type": "text", "value": "결론 문단" }
  ]
}
```

### 필드 규칙
| 필드 | 규칙 | 예시 |
|------|------|------|
| **slug** | 3-5단어, 케밥케이스 (SEO 최적화) | `리니지-클래식-월정액-복귀` |
| **date** | ISO 형식 + 시간 (같은 날 정렬용) | `2026-01-20T12:00` |
| **title** | 태그 없이 제목만 (~~[이슈 포커스]~~ 등 금지) | `AI 썼다고 수상 박탈?…` |
| **keywords** | SEO용 키워드, 쉼표로 구분 | `리니지, 엔씨소프트, MMORPG` |
| **heading** | 번호 포함, 마지막은 "마치며: 부제" 형식 (번호 없이) | `1. 첫 번째`, `2. 두 번째`, `마치며: 핵심 메시지` |
| **relatedGames** | (선택) 관련 게임 slug 배열, 수동 지정 시 자동 매칭 무시 | `["승리의-여신-니케", "카오스-제로-나이트메어"]` |
| **relatedIssues** | (선택) 관련 이슈 리포트 slug 배열 (최대 4개, PC 4열/모바일 2열 그리드) | `["게임-AI-논란-수상박탈"]` |
| **sources** | (선택) 정보 출처 배열, SEO에 유리 | `[{name, title, url}]` |

### content 블록 타입
| 타입 | 용도 | 예시 |
|------|------|------|
| `text` | 본문 문단 | 3-4단락, 단락당 3-5문장, `\n\n`으로 문단 구분 |
| `heading` | 소제목 (h2) | 섹션 시작점 |
| `image` | 이미지 + 캡션 | src, caption 필드 |
| `video` | 유튜브 임베드 | url, caption 필드 (16:9 반응형) |
| `ad` | 광고 삽입 위치 | 2-3개 배치 |
| `quote` | 인용문 | 강조할 문장 |
| `table` | 표 | headers, rows, caption(선택) 필드 |

### 글 스타일 규칙
| 항목 | 규칙 |
|------|------|
| **서론** | 2-3문장 (핵심 요약 중심) |
| **섹션 수** | 5-10개 |
| **본문** | 섹션당 2-3단락, 단락당 2-4문장 |
| **소제목** | 섹션마다 heading 사용 |
| **이미지** | 섹션마다 1개, 소제목(heading) 바로 다음에 배치, **썸네일과 본문 이미지 중복 금지**, **구글 이미지/뉴스 최우선, Wikipedia 금지** |
| **이미지 비율** | **가로형(16:9) 우선 사용**, 세로형(박스아트 등) 지양, 게임플레이/스크린샷/프로모션 이미지 선호 |
| **이미지 높이** | 히어로(썸네일): 데스크탑 280px / 모바일 200px, 본문 이미지: 800px |
| **광고** | 본문 중간에 2-3개 배치 |
| **문체** | 블로그형 설명체, 헤더 톤은 자유 |

### SEO 최적화 규칙

#### URL/Slug
| 항목 | 규칙 | 예시 |
|------|------|------|
| **길이** | 3-5개 단어 이내 | `ram-price-surge-2026` |
| **언어** | 영문 소문자만 (한글 불가) | `roguelike-casual-korea` |
| **구분자** | 하이픈(-) 사용 | ✅ `game-ai` ❌ `game_ai` |
| **날짜/숫자** | 가급적 제외 (재활용 어려움) | ❌ `2026-01-ram-price` |

#### 제목 (H1 = title)
- **핵심 키워드를 앞부분에** 배치
- 50자 이내 권장
- ❌ `게이머의 악몽이 시작됐다, 램가격 폭등`
- ✅ `램가격 폭등이 컴퓨터가격 폭등으로, 게이머의 악몽`

#### 소제목 (H2 = heading)
- **키워드로 시작**, 번호는 선택
- ❌ `1. 왜 갑자기 램이 이렇게 비싸졌나?`
- ✅ `DDR5 램 가격 폭등, 왜 이렇게 비싸졌나?`
- ✅ `1. DDR5 램 가격 폭등 원인` (번호 포함도 OK)

#### 키워드 (keywords)
- 메인 키워드 + 롱테일 키워드 혼합
- 연도 포함 (`2026`)
- 10-15개 권장
- 예: `DDR5 램 가격, 램가격 폭등 2026, 메모리 슈퍼사이클, PC 조립 비용`

#### 요약 (summary = 메타 디스크립션)
- **120-150자** 이내
- 핵심 키워드 포함
- 클릭 유도 문구 포함

#### 첫 문단 (서론)
- **첫 3문장에 핵심 키워드** 자연스럽게 포함
- 문제 제기 → 핵심 정보 → 이 글의 가치

#### 본문 키워드 배치
- 핵심 키워드: 전체 글에서 5-8회 자연스럽게 등장
- 소제목마다 관련 키워드 1개 이상
- 마지막 문단에 핵심 키워드 재등장

#### 내부 링크 (필수)
- **relatedIssues 필드** 사용 (최대 4개)
- 관련 게임은 **relatedGames 필드** 또는 자동 매칭
- 본문에서는 텍스트로 언급만 (인라인 링크 불필요)

#### 이미지 SEO
| 필드 | 용도 | 규칙 |
|------|------|------|
| **src** | 이미지 URL | 필수 |
| **caption** | 화면 표시 캡션 | 간결하게 |
| **alt** | 검색엔진용 | **필수**, 키워드 포함 설명 |

#### 글 분량
| 항목 | 권장 |
|------|------|
| 전체 | 2,500~3,500자 |
| 섹션당 | 3-4단락, 단락당 3-5문장 |

#### 줄바꿈 정책
- **단락 구분**: `\n\n` (빈 줄)로 단락 구분
- **단락 내 문장**: 줄바꿈 없이 이어서 작성

### 공개 상태
- `status: "draft" | "approved"`
- 초기 작성은 반드시 `draft`
- 빌드/허브/사이트맵에는 **approved만** 반영

### 이미지 배치 패턴
```
heading → image → text → text → text
heading → image → text → text → ad → text
```

### 작성 요청 예시
```
"방치형 게임 시장 이슈 리포트 써줘"
"메이플 키우기 성공 요인 이슈 리포트 작성해줘"
"2026년 모바일 게임 트렌드 이슈 리포트 작성해줘"
```

### 빌드
```bash
npm run build -- -q   # 퀵 빌드 시 자동으로 페이지 생성
```

---

## 랭킹 리포트 작성 (Ranking)

### 개요
- 게임 간 순위 비교 분석 리포트
- 대화형으로 작성 (주제 논의 → 데이터 확인 → 초안 → 수정 → 완성)
- 저장 경로: `reports/ranking/{slug}.json`
- URL: `/trend/ranking/{slug}/`

### 작성 프로세스
```
1. 주제 선정 - 비교할 게임 선정
2. 데이터 확인 - history/{date}.json의 bestRanks로 실제 순위 확인
3. 초안 작성 - JSON 저장 (draft 상태)
4. 퀵빌드로 로컬 확인 - draft도 로컬에서 보임
5. 피드백 반영 - 수정 후 퀵빌드 반복
6. 올릴 때 status → approved로 변경
```

### JSON 형식
```json
{
  "slug": "game-a-vs-game-b-2026",
  "status": "draft",
  "title": "제목 (비교 구도 명확하게)",
  "date": "2026-01-28T21:00",
  "keywords": "게임A, 게임B, 순위 비교, 매출 순위",
  "summary": "요약 2-3문장",
  "thumbnail": "대표 이미지 URL",
  "relatedIssues": ["관련-이슈-slug"],
  "relatedGames": ["게임A-slug", "게임B-slug"],
  "sources": [],
  "content": [
    { "type": "text", "value": "서론 문단" },
    { "type": "link", "url": "/games/게임A/", "text": "게임A", "subtext": "실시간 순위 확인하기" },
    { "type": "heading", "value": "1. 매출 순위: 분석 제목" },
    { "type": "chart", "games": ["게임A", "게임B"], "category": "grossing", "market": "ios", "startDate": "2026-01-22", "endDate": "2026-01-28", "title": "iOS 매출 순위 비교" },
    { "type": "text", "value": "분석 내용" },
    { "type": "image", "src": "이미지URL", "caption": "캡션" },
    { "type": "ad" }
  ]
}
```

### content 블록 타입 (랭킹 전용)
| 타입 | 용도 | 필드 |
|------|------|------|
| `chart` | 순위 차트 | games, category, market, startDate, endDate, title |
| `link` | 게임 페이지 링크 | url, text, subtext |

**chart 블록 필드:**
| 필드 | 값 | 예시 |
|------|-----|------|
| games | 게임 slug 배열 | `["명일방주-엔드필드", "드래곤소드"]` |
| category | `grossing` / `free` | 매출 / 인기(다운로드) |
| market | `ios` / `android` | 플랫폼 |
| startDate | `YYYY-MM-DD` | 차트 시작일 |
| endDate | `YYYY-MM-DD` | 차트 종료일 |
| title | 차트 제목 | `iOS 매출 순위 비교 (한국)` |

### bestRanks 데이터 확인
실제 순위 데이터는 `history/{date}.json`의 `bestRanks`에서 확인:

```javascript
// history/2026-01-28.json 구조
{
  "bestRanks": {
    "ios_kr_grossing": { "앱ID": 순위 },
    "ios_kr_free": { "앱ID": 순위 },
    "android_kr_grossing": { "패키지명": 순위 },
    "android_kr_free": { "패키지명": 순위 }
  }
}
```

**앱 ID 찾기:** `games.json`에서 게임명으로 검색

### 이미지 배치 규칙
- **heading 바로 아래에 이미지 배치** (텍스트 위)
- 캡션은 해당 섹션 내용과 일치해야 함
- 예: 글로벌 시장 섹션 → "글로벌 동시 출시된 게임명" (❌ "오픈월드 환경")

```
heading → image → text → text
```

### 작성 체크리스트 (랭킹 리포트)
| 항목 | 체크 | 설명 |
|------|:----:|------|
| **bestRanks 확인** | ☐ | 실제 순위 데이터로 워딩 검증 |
| **chart 날짜** | ☐ | startDate/endDate가 분석 기간과 일치 |
| **이미지 캡션** | ☐ | 섹션 주제와 일치하는지 확인 |
| **게임 링크** | ☐ | 서론에 비교 대상 게임 link 블록 추가 |
| **퀵빌드 확인** | ☐ | 차트 렌더링, 이미지 로드 확인 |

---

## 게임 위키 작성 (Wiki)

### 개요
- 게임 업계 지식/용어를 정리하는 위키형 글
- 대화형으로 작성 (주제 논의 → 자료 조사 → 초안 → 수정 → 완성)
- 저장 경로: `data/wiki/{category}/{slug}.json`
- URL: `/wiki/{category}/{slug}/`
- 카테고리: `business` / `history` / `knowledge`

> **테크 문서**는 별도 섹션으로 분리됨
> - 저장 경로: `data/tech/{category}/{slug}.json`
> - URL: `/tech/{category}/{slug}/`
> - 카테고리: `normal` (일반)

### 작성 프로세스
```
1. 주제 선정 - 사용자와 논의
2. 자료 조사 - 웹 검색으로 데이터 수집
3. 초안 작성 - JSON 저장 (draft 상태)
4. 퀵빌드로 로컬 확인 - draft도 로컬에서 보임
5. 피드백 반영 - 수정 후 퀵빌드 반복
6. 올릴 때 status → approved로 변경
```

**중요**: 초안 작성 후 반드시 글 전문을 텍스트로 공유해야 함. JSON만 보여주면 사용자가 내용 확인이 어려움.

### 작성 체크리스트 (위키)
| 항목 | 체크 | 설명 |
|------|:----:|------|
| **날짜 형식** | ☐ | `YYYY-MM-DDTHH:MM` 형식 필수 (예: `2026-01-21T12:00`), 시간 누락 금지 |
| **이미지** | ☐ | 서론/마치며 제외 모든 섹션에 1개씩, 깨진 이미지 없는지 확인 |
| **이미지 alt** | ☐ | 모든 이미지에 alt 텍스트 필수 (키워드 포함 설명) |
| **출처** | ☐ | 최소 4-5개 이상, **나무위키 절대 제외** |
| **관련 문서** | ☐ | relatedDocs에 관련 문서 연결 (예: `wiki:slug`, `tech:cat/slug`, `issue:slug`) |
| **관련 게임** | ☐ | relatedGames에 본문에서 언급된 게임 slug 연결 |
| **썸네일 중복** | ☐ | 썸네일과 본문 이미지 중복 금지 |
| **연도 표현** | ☐ | "2025년 트렌드" 대신 "최근 트렌드" 사용 (시의성 유지) |
| **퀵빌드 확인** | ☐ | 이미지 로드, 레이아웃 확인 |

### JSON 형식
```json
{
  "slug": "unity-engine",
  "status": "draft",
  "title": "제목 (명확하고 직관적으로)",
  "date": "2026-01-20T12:00",
  "keywords": "키워드1, 키워드2, 키워드3",
  "summary": "요약 2-3문장 (핵심 정의/가치 중심)",
  "thumbnail": "대표 이미지 URL",
  "sources": [{ "name": "출처명", "title": "문서/기사 제목", "url": "URL" }],
  "content": [
    { "type": "heading", "value": "키워드로 시작하는 소제목" },
    { "type": "image", "src": "이미지URL", "caption": "캡션", "alt": "키워드 포함 설명" },
    { "type": "text", "value": "본문 문단" },
    { "type": "quote", "value": "인용문" },
    { "type": "heading", "value": "마치며" },
    { "type": "text", "value": "정리 문단" }
  ]
}
```

### 필드 규칙
| 필드 | 규칙 | 예시 |
|------|------|------|
| **slug** | 3-5단어, 케밥케이스 (SEO 최적화) | `unity-engine` |
| **date** | ISO 형식 + 시간 (같은 날 정렬용) | `2026-01-20T12:00` |
| **title** | 태그 없이 제목만 | `Unity 엔진` |
| **keywords** | SEO용 키워드, 쉼표로 구분 | `Unity, 게임 엔진, 크로스플랫폼` |
| **heading** | 키워드로 시작, 마지막은 "마치며: 부제" 형식 | `Unity 엔진 특징`, `마치며: 핵심 메시지` |
| **category** | 폴더명으로 구분 | `business`, `history`, `knowledge` (위키) / `normal` (테크) |
| **sources** | (선택) 정보 출처 배열, **나무위키 제외** | `[{name, title, url}]` |
| **relatedDocs** | (선택, 권장) 통합 관련 문서 배열 | `["wiki:unity-engine", "issue:게임-AI-논란"]` |
| **relatedArticles** | (선택, 레거시) 관련 위키 slug 배열 | `["unity-engine"]` |
| **relatedIssues** | (선택, 레거시) 관련 이슈 slug 배열 | `["게임-AI-논란"]` |
| **relatedGames** | (선택) 관련 게임 slug 배열 | `["리니지-m", "메이플스토리"]` |

### 콘텐츠 연결 규칙 (relatedDocs / relatedGames)

| 필드 | 최대 개수 | 필수 여부 |
|------|----------|----------|
| **relatedGames** | 4개 | 선택 (없으면 비워도 됨) |
| **relatedDocs** | 4개 | 선택 (통합 형식, 권장) |
| **relatedArticles** | 4개 | 선택 (레거시, 위키/테크용) |
| **relatedIssues** | 4개 | 선택 (레거시, 위키/테크용) |

**relatedDocs 통합 형식 (권장):**
```json
"relatedDocs": [
  "wiki:slug",                    // 위키 문서 (전체 검색)
  "wiki:category/slug",           // 위키 문서 (카테고리 지정)
  "tech:category/slug",           // 테크 문서
  "issue:slug"                    // 이슈 리포트
]
```

**예시:**
```json
"relatedDocs": [
  "wiki:knowledge/chzzk-soop-p2p-grid",
  "tech:ai/moltbook-ai-social-network",
  "issue:pc-bang-decline-arcade-fate"
]
```

**레거시 폴백:**
- `relatedDocs`가 없으면 `relatedArticles` + `relatedIssues` 조합 사용
- 기존 JSON 파일은 수정 없이 동작

**연결 범위:**
- 위키 ↔ 위키/테크/이슈
- 테크 ↔ 위키/테크/이슈
- 이슈 리포트: `relatedWiki`, `relatedIssues` 사용 (기존 형식 유지)

**연결 방식:**
- 수동 지정: JSON의 slug 배열로 직접 지정 (우선)
- 자동 감지: 본문에서 게임명 언급 시 자동 연결 (최대 4개)

**비워도 되는 경우:**
- 관련 콘텐츠가 없을 때
- 무리하게 연결할 필요 없음

**slug 찾기:**
```bash
# 위키 slug 목록
ls data/wiki/*/*.json | xargs -I {} basename {} .json

# 테크 slug 목록
ls data/tech/*/*.json | xargs -I {} basename {} .json

# 이슈 리포트 slug 목록
ls reports/issue/*.json | xargs -I {} basename {} .json

# 게임 slug 검색
grep -l "게임명" data/games.json
```

### content 블록 타입
| 타입 | 용도 | 예시 |
|------|------|------|
| `text` | 본문 문단 | 3-4단락, 단락당 3-5문장, `\n\n`으로 문단 구분 |
| `heading` | 소제목 (h2) | 섹션 시작점 |
| `image` | 이미지 + 캡션 | src, caption 필드 |
| `video` | 유튜브 임베드 | url, caption 필드 (16:9 반응형) |
| `quote` | 인용문 | 강조할 문장 |
| `table` | 표 | headers, rows, caption(선택) 필드 |

**table 블록 예시:**
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

### 글 스타일 규칙
| 항목 | 규칙 |
|------|------|
| **서론** | 2-3문장 (핵심 정의 중심) |
| **섹션 수** | 5-10개 |
| **본문** | 섹션당 2-3단락, 단락당 2-4문장 |
| **소제목** | 섹션마다 heading 사용 |
| **이미지** | 서론/마치며 제외 모든 섹션에 1개씩, **썸네일과 본문 이미지 중복 금지**, **구글 이미지/뉴스 최우선, Wikipedia 금지** |
| **이미지 높이** | 히어로(썸네일): 데스크탑 280px / 모바일 200px, 본문 이미지: 800px |
| **문체** | 설명형, 간결하고 직관적으로 |

### SEO 최적화 규칙

#### URL/Slug
| 항목 | 규칙 | 예시 |
|------|------|------|
| **길이** | 3-5개 단어 이내 | `unity-engine` |
| **언어** | 영문 소문자 권장, 한글도 허용 | `게임-엔진-정의` |
| **구분자** | 하이픈(-) 사용 | ✅ `game-engine` ❌ `game_engine` |
| **날짜/숫자** | 가급적 제외 | ❌ `2026-unity-engine` |

#### 제목 (H1 = title)
- **핵심 키워드를 앞부분에** 배치
- 40자 이내 권장
- ✅ `Unity 엔진, 모바일 시장을 장악한 이유`

#### 소제목 (H2 = heading)
- **키워드로 시작**
- ✅ `Unity 엔진 주요 특징`
- ✅ `Unity 엔진 라이선스 정책`

#### 키워드 (keywords)
- 핵심 키워드 + 롱테일 키워드 혼합
- 8-12개 권장
- 예: `Unity, 게임 엔진, 크로스플랫폼, 모바일 개발, 에셋 스토어`

#### 요약 (summary = 메타 디스크립션)
- **120-150자** 이내
- 핵심 키워드 포함
- 정의 + 실무적 가치 한 줄 요약

#### 본문 키워드 배치
- 핵심 키워드: 전체 글에서 4-6회 자연스럽게 등장
- 소제목마다 관련 키워드 1개 이상

#### 이미지 SEO
| 필드 | 용도 | 규칙 |
|------|------|------|
| **src** | 이미지 URL | 필수 |
| **caption** | 화면 표시 캡션 | 간결하게 |
| **alt** | 검색엔진용 | **필수**, 키워드 포함 설명 |

#### 글 분량
| 항목 | 권장 |
|------|------|
| 전체 | 2,500~3,500자 |
| 섹션당 | 3-4단락, 단락당 3-5문장 |

### 공개 상태
- `status: "draft" | "approved"`
- 초기 작성은 반드시 `draft`
- 빌드/허브/사이트맵에는 **approved만** 반영

### content 구조 패턴
```
text (서론) → heading → image → text → heading → image → text → ... → heading (마치며) → text
```
- **서론**: heading 없이 text로 시작 (3-4문장)
- **본문 섹션**: heading → image → text 순서
- **마지막 섹션**: "마치며" heading → text (이미지 불필요)

### 작성 요청 예시
```
"Unity 엔진 위키 작성해줘"
"ARPU 위키 항목 작성해줘"
"게임 엔진 종류 비교 위키 작성해줘"
```

### 빌드
```bash
npm run build -- -q   # 퀵 빌드 시 자동으로 페이지 생성
```

### SEO 최종 체크리스트
작성 완료 후 아래 항목을 점검:

| 항목 | 체크 | 기준 |
|------|:----:|------|
| **Slug** | ☐ | 3-5단어, 영문 케밥케이스, 핵심 키워드 포함 |
| **제목** | ☐ | 핵심 키워드 앞부분에, 40자 이내 |
| **요약** | ☐ | 120-150자, 핵심 키워드 + 클릭 유도 |
| **키워드** | ☐ | 8-12개, 메인 + 롱테일 혼합, **변형 다양화** |
| **첫 문단** | ☐ | 첫 3문장에 핵심 키워드 자연스럽게 포함 |
| **소제목** | ☐ | 관련 키워드 자연스럽게, 마지막은 "마치며" |
| **본문 키워드** | ☐ | 전체 4-6회 자연스럽게 등장 |
| **이미지 alt** | ☐ | 모든 이미지에 키워드 포함 설명 |
| **출처** | ☐ | 신뢰할 수 있는 출처 2개 이상 |

#### 키워드 다양화 원칙
- **동일 키워드 반복 금지**: 소제목마다 같은 키워드 나열은 키워드 스터핑으로 간주
- **변형 사용**: 메인 키워드의 유의어, 약어, 관련어로 자연스럽게 분산
- **롱테일 활용**: "롤러코스터 타이쿤" → "놀이공원 시뮬레이션", "타이쿤 장르", "RCT"

**예시 (좋은 키워드 구성):**
```
메인: 롤러코스터 타이쿤
변형: RCT, 놀이공원 시뮬레이션, 타이쿤 게임
롱테일: 90년대 PC 게임, 1인 개발 전설, 어셈블리어 게임 개발
```

---

## 이미지 펜딩 큐

### 개요
- 이미지 다운로드 실패 시 펜딩 큐에 추가
- 다음 실행부터 펜딩에 있는 URL은 스킵 (시간 절약)
- 나중에 수동으로 확인 후 처리

### 데이터 구조
- 저장 경로: `data/pending-images.json`

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

### 데이터 흐름

```
이미지 다운로드 실패 → pending-images.json에 추가
              ↓
         다음 실행 시 → pending에 있으면 스킵
              ↓
         수동 확인 (URL 살아났는지, 대체 이미지 등)
              ↓
         해결되면 → pending에서 제거
```

### 수동 처리 방법
| 상황 | 작업 |
|------|------|
| URL 살아남 | pending에서 제거 후 재실행 |
| URL 죽음 | 해당 날짜 JSON에서 썸네일 제거 또는 대체 |
| 오래된 날짜 | 해당 날짜 리포트 자체 삭제 |

### 관련 스크립트
- `scripts/download-daily-images.js` - 데일리 이미지 다운로드
- `scripts/download-images.js` - 위키/테크/이슈 이미지 다운로드

---

## 주의사항

1. **워크플로우 타이밍**: build(30분)이 ai-insight(12시간) 이후에 실행되어야 게임주 현황 표시됨
2. **주말/공휴일**: 주가는 마지막 거래일 기준
3. **캐시 의존성**: 퀵 모드는 data-cache.json 필수
4. **API 비용**: AI 인사이트는 Claude API 호출 (self-hosted runner 사용)
5. **EUC-KR**: 네이버 증권은 EUC-KR 인코딩 사용

---

## Git 커밋 규칙

### 소스 파일 (커밋 대상)
| 경로 | 설명 |
|------|------|
| `data/` | 게임DB, 위키, 테크, 이슈 JSON |
| `reports/` | AI 인사이트 JSON |
| `src/` | 크롤러, 템플릿 |
| `scripts/` | 스크립트 |
| `*.js` | 진입점 (generate-*.js 등) |
| `GAMERSCROLL.md` | 프로젝트 가이드 |
| `package.json` | 의존성 |

### 빌드 산출물 (건드리지 않기)
| 경로 | 설명 |
|------|------|
| `docs/` | 서버에서 빌드 |
| `styles.*.css` | 서버에서 생성 |
| `.build-cache.json` | 서버에서 관리 |

**규칙:**
1. 소스 파일만 커밋
2. 빌드 산출물은 로컬에서 수정/삭제하지 않기
3. **푸시 전 리베이스 필수** (서버 빌드 산출물 반영)
4. 푸시 후 빌드 트리거

---

## Git 명령 (WSL 환경)

WSL에서 `/mnt/c/` 경로 접근 시 성능 저하 발생. Git 명령은 PowerShell로 실행:

```powershell
# 1. 소스만 커밋
powershell.exe -Command "cd C:\Project\GamerScroll; git add data/ reports/ src/ scripts/ *.js *.md package.json; git commit -m '메시지'"

# 2. 리베이스 (서버 산출물 반영) - 필수!
powershell.exe -Command "cd C:\Project\GamerScroll; git pull --rebase origin main"

# 3. 푸시 & 빌드 트리거
powershell.exe -Command "cd C:\Project\GamerScroll; git push origin main; gh workflow run build.yml"

# AI 인사이트 워크플로우 트리거
powershell.exe -Command "cd C:\Project\GamerScroll; gh workflow run ai-insight.yml"

# 주간 인사이트 워크플로우 트리거
powershell.exe -Command "cd C:\Project\GamerScroll; gh workflow run weekly-insight.yml"
```

**GitHub Actions**: https://github.com/tempest1033/GamerScroll/actions
