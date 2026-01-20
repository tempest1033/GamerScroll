# GamersCrawl 프로젝트 가이드

## 프로젝트 개요
게임 업계 데이터 크롤링 및 일일/주간 리포트 생성 사이트

| 환경 | URL | Repository |
|------|-----|------------|
| **PC** | https://gamerscrawl.com | [GamersCrawl](https://github.com/tempest1033/GamersCrawl) |
| **Mobile** | https://m.gamerscrawl.com | [GamersCrawl-Mobile](https://github.com/tempest1033/GamersCrawl-Mobile) |

- PC 버전: `docs/` 폴더 → GitHub Pages
- Mobile 버전: `docs-mobile/` 폴더 → GamersCrawl-Mobile 저장소로 자동 배포
- PC 접속 시 모바일 UA 감지 → `m.gamerscrawl.com`으로 자동 리다이렉트

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

### 모바일 버전 빌드
```bash
node build-mobile.js
```
- `docs/` 폴더를 `docs-mobile/`로 복사
- URL 변환: `gamerscrawl.com` → `m.gamerscrawl.com`
- PC 전용 광고/사이드바 제거
- CNAME 설정: `m.gamerscrawl.com`
- sitemap.xml URL 변환
- **GitHub Actions에서 자동 실행됨** (수동 실행 불필요)

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
├── build-mobile.js            # 모바일 버전 빌드 스크립트
│
├── data-cache.json            # 크롤링 캐시 (git tracked)
├── index.html                 # 로컬 생성 HTML
│
├── docs/                      # PC 버전 배포 폴더 (gamerscrawl.com)
│   ├── index.html             # 배포용 HTML
│   ├── styles.css             # 스타일시트
│   ├── CNAME                  # 커스텀 도메인
│   └── reports/
│       ├── {date}.json        # 일별 인사이트 (배포용 복사본)
│       └── weekly/
│           └── {year}-W{week}.json # 주간 인사이트 (배포용 복사본)
│
├── docs-mobile/               # 모바일 버전 배포 폴더 (m.gamerscrawl.com)
│                              # → GamersCrawl-Mobile 저장소로 자동 배포
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
  3. `node generate-html-report.js` - PC 버전 생성
  4. `node scripts/sync-and-enrich.js` - 게임 DB 동기화
  5. `node scripts/generate-game-pages.js` - 게임 상세 페이지 생성
  6. docs/ 폴더로 복사
  7. `node build-mobile.js` - 모바일 버전 생성
  8. 커밋 & 푸시 (GamersCrawl)
  9. GamersCrawl-Mobile 저장소로 배포 (peaceiris/actions-gh-pages)

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
3. 초안 작성 - JSON 형식으로 작성
4. 전문 공유 - 글 전체를 텍스트로 보여주기 (사용자가 확인할 수 있도록)
5. 피드백 반영 - 사용자 의견 수정
6. 최종 저장 - reports/issue/{slug}.json
7. 승인 시 status를 approved로 변경
```

**중요**: 초안 작성 후 반드시 글 전문을 텍스트로 공유해야 함. JSON만 보여주면 사용자가 내용 확인이 어려움.

### JSON 형식
```json
{
  "slug": "게임-AI-논란-정리",
  "status": "draft",
  "title": "제목 (임팩트 있게)",
  "date": "2026-01-04",
  "thumbnail": "대표 이미지 URL",
  "keywords": "키워드1, 키워드2, 키워드3",
  "summary": "요약 2-3문장 (독자 흥미 유발)",
  "content": [
    { "type": "heading", "value": "1. 첫 번째 섹션" },
    { "type": "image", "src": "이미지URL", "caption": "설명" },
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
| **slug** | 한글 케밥케이스 (띄어쓰기 → 하이픈) | `리니지-클래식-월-29700원의-귀환` |
| **title** | 태그 없이 제목만 (~~[이슈 포커스]~~ 등 금지) | `AI 썼다고 수상 박탈?…` |
| **keywords** | SEO용 키워드, 쉼표로 구분 | `리니지, 엔씨소프트, MMORPG` |
| **heading** | 번호 포함, 단 마지막은 "마치며" (번호 없이) | `1. 첫 번째`, `2. 두 번째`, `마치며` |
| **relatedGames** | (선택) 관련 게임 slug 배열, 수동 지정 시 자동 매칭 무시 | `["승리의-여신-니케", "카오스-제로-나이트메어"]` |
| **sources** | (선택) 정보 출처 배열, SEO에 유리 | `[{name, title, url}]` |

### content 블록 타입
| 타입 | 용도 | 예시 |
|------|------|------|
| `text` | 본문 문단 | 4-5문장, `\n\n`으로 문단 구분 |
| `heading` | 소제목 (h2) | 섹션 시작점 |
| `image` | 이미지 + 캡션 | src, caption 필드 |
| `video` | 유튜브 임베드 | url, caption 필드 (16:9 반응형) |
| `ad` | 광고 삽입 위치 | 2-3개 배치 |
| `quote` | 인용문 | 강조할 문장 |

### 글 스타일 규칙
| 항목 | 규칙 |
|------|------|
| **서론** | 3-4문장 (핵심 요약 중심) |
| **섹션 수** | 5-8개 (단락 기준) |
| **본문** | 섹션당 4-5문장 |
| **소제목** | 섹션마다 heading 사용 |
| **이미지** | 섹션마다 1개, 소제목(heading) 바로 다음에 배치 |
| **광고** | 본문 중간에 2-3개 배치 |
| **문체** | 블로그형 설명체, 헤더 톤은 자유 |

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

### 초안 미리보기
이미지 다운로드 없이 빠르게 초안을 확인할 수 있는 스크립트:

```bash
# 최신 draft 미리보기
node scripts/preview-issue.js

# 특정 slug 미리보기
node scripts/preview-issue.js [slug]

# draft 목록 보기
node scripts/preview-issue.js --list
```

- **출력 위치**: `docs/preview/issue-preview.html`
- **특징**: 외부 이미지를 wsrv.nl 프록시로 바로 렌더링 (다운로드 불필요)
- **용도**: 본격 빌드 전 레이아웃/내용 빠른 확인

---

## PC/모바일 분리 구조

### 배포 구조
| 환경 | 도메인 | 저장소 | 배포 폴더 |
|------|--------|--------|----------|
| PC | gamerscrawl.com | GamersCrawl | `docs/` |
| Mobile | m.gamerscrawl.com | GamersCrawl-Mobile | `docs-mobile/` |

### UA 감지 리다이렉트
PC 버전(`gamerscrawl.com`)에서 모바일 UA 감지 시 자동 리다이렉트:
```javascript
// src/templates/components/head.js
if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
  location.replace('https://m.gamerscrawl.com' + location.pathname);
}
```

### 광고 분리
- PC 버전: PC 전용 광고만 표시 (사이드바, 직사각형 등)
- Mobile 버전: 모바일 전용 광고만 표시 (상단/중간 배너)
- `build-mobile.js`가 PC 광고 컨테이너 자동 제거

### DNS 설정 (Squarespace)
| 타입 | 호스트 | 데이터 |
|------|--------|--------|
| CNAME | m | tempest1033.github.io |

### GitHub Secrets
| 키 | 용도 |
|----|------|
| `GH_PAT` | GamersCrawl-Mobile 저장소 배포용 Personal Access Token |

---

## 주의사항

1. **워크플로우 타이밍**: build(30분)이 ai-insight(12시간) 이후에 실행되어야 게임주 현황 표시됨
2. **주말/공휴일**: 주가는 마지막 거래일 기준
3. **캐시 의존성**: 퀵 모드는 data-cache.json 필수
4. **API 비용**: AI 인사이트는 Claude API 호출 (self-hosted runner 사용)
5. **EUC-KR**: 네이버 증권은 EUC-KR 인코딩 사용

---

## Git 명령 (WSL 환경)

WSL에서 `/mnt/c/` 경로 접근 시 성능 저하 발생. Git 명령은 PowerShell로 실행:

```powershell
# 커밋 & 푸시
powershell.exe -Command "cd C:\Project\GamersCrawl; git add -A; git commit -m '메시지'; git push origin main"

# 빌드 워크플로우 트리거
powershell.exe -Command "cd C:\Project\GamersCrawl; gh workflow run build.yml"

# AI 인사이트 워크플로우 트리거
powershell.exe -Command "cd C:\Project\GamersCrawl; gh workflow run ai-insight.yml"

# 주간 인사이트 워크플로우 트리거
powershell.exe -Command "cd C:\Project\GamersCrawl; gh workflow run weekly-insight.yml"
```

**GitHub Actions**: https://github.com/tempest1033/GamersCrawl/actions
