# GamersCrawl 프로젝트

프로젝트 문서는 [GAMERSCRAWL.md](./GAMERSCRAWL.md)를 참조하세요.

---

## ⚠️ 디렉토리 구조 (중요)

```
GamersCrawl/
├── reports/           ← 소스 (여기를 수정!)
│   ├── 2026-01-04.json
│   └── weekly/
├── docs/              ← 빌드 출력물 (수정 금지)
│   ├── reports/       ← 빌드 시 자동 복사됨
│   ├── trend/
│   └── index.html
└── data-cache.json    ← 크롤링 캐시
```

### 파일 수정 규칙
| 작업 | 수정할 경로 | 잘못된 경로 |
|------|-------------|-------------|
| JSON 리포트 수정 | `./reports/*.json` | ~~`./docs/reports/`~~ |
| 주간 리포트 수정 | `./reports/weekly/*.json` | ~~`./docs/reports/weekly/`~~ |
| HTML 템플릿 수정 | `./src/templates/` | - |

**절대 `docs/` 폴더 직접 수정 금지** - 빌드 시 덮어씌워짐

---

## 빌드 명령어

```bash
# 퀵 빌드 (캐시 사용, HTML만 재생성) - 약 5초
npm run build -- --quick
npm run build -- -q

# 일반 빌드 (전체 크롤링) - 약 3-5분
npm run build
```

## 로컬 테스트

```bash
# 1. 퀵 빌드
npm run build -- -q

# 2. docs 복사
cp index.html docs/index.html

# 3. 로컬 서버
cd docs && npx serve -l 3001
```
