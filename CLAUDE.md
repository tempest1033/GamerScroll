# GamersCrawl 프로젝트

프로젝트 문서는 [GAMERSCRAWL.md](./GAMERSCRAWL.md)를 참조하세요.

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
