# GamersCrawl 프로젝트 가이드

## 프로젝트 개요
게임 업계 데이터 크롤링 및 일일/주간 리포트 생성 사이트
- URL: https://gamerscrawl.com
- GitHub Pages로 배포 (docs/ 폴더)
- Repository: https://github.com/tempest1033/GamersCrawl

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
- `reports/{date}-{AM|PM}.json`에 저장
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
├── docs/                      # GitHub Pages 배포 폴더
│   ├── index.html             # 배포용 HTML
│   ├── styles.css             # 스타일시트
│   ├── CNAME                  # 커스텀 도메인
│   └── reports/
│       ├── {date}-{AM|PM}.json # 일별 인사이트 (배포용 복사본)
│       └── weekly/
│           └── {year}-W{week}.json # 주간 인사이트 (배포용 복사본)
│
├── reports/                   # 인사이트 데이터
│   ├── {date}-{AM|PM}.json    # 일간 AI 인사이트 + 주가 + 순위분석
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
   └── AI 인사이트 로드: reports/{date}-{AM|PM}.json (현재 시간대 우선)

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

6. 저장: reports/{date}-{AM|PM}.json (KST 기준 오전/오후 구분)
   ├── ai: AI 인사이트 전체
   ├── aiGeneratedAt: 생성 시각 (AM/PM 태그 표시용)
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
2. 각 날짜별 일일 리포트 로드 (reports/{date}-PM.json 우선)
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
- 작업:
  1. npm install
  2. Playwright 브라우저 설치
  3. `node generate-html-report.js`
  4. docs/ 폴더로 복사
  5. 커밋 & 푸시

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
1. `reports/{date}-AM.json` 또는 `reports/{date}-PM.json`에 `ai.stocks`, `stockPrices` 확인
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

## 주의사항

1. **워크플로우 타이밍**: build(30분)이 ai-insight(12시간) 이후에 실행되어야 게임주 현황 표시됨
2. **주말/공휴일**: 주가는 마지막 거래일 기준
3. **캐시 의존성**: 퀵 모드는 data-cache.json 필수
4. **API 비용**: AI 인사이트는 Claude API 호출 (self-hosted runner 사용)
5. **EUC-KR**: 네이버 증권은 EUC-KR 인코딩 사용
