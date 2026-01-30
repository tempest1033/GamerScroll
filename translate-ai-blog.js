#!/usr/bin/env node
/**
 * AIScroll 번역 스크립트
 *
 * data/tech/ai/*.json의 한국어 콘텐츠를 영어로 번역
 * 결과는 각 JSON 파일에 titleEn, summaryEn, contentEn 필드로 저장
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const DATA_DIR = path.join(__dirname, 'data');
const REPORTS_DIR = path.join(__dirname, 'reports');

// 추가로 가져올 기사 목록
const EXTRA_ARTICLES = {
  issue: [
    'gpt-5-3-garlic-update-rumor',
    'chatgpt-vs-gemini-comparison-2026'
  ],
  wiki: []
};

// 기사 전체를 한 번에 번역 (기사당 에이전트 1개)
async function translateArticle(article, slug) {
  const toTranslate = {
    title: article.title,
    summary: article.summary,
    content: article.content
  };

  const prompt = `CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no explanation, no text before or after.

Translate Korean to English. Output structure:
{"title":"...","summary":"...","content":[...]}

Rules:
- Translate title, summary, all content blocks
- For content: translate "value" for text/heading/subheading/quote
- For tables: translate headers, caption, rows
- Keep HTML tags intact
- Professional tech blog tone

INPUT:
${JSON.stringify(toTranslate, null, 2)}`;

  // 고유한 임시파일명 (slug 사용)
  const tmpFile = path.join(os.tmpdir(), `translate-${slug}-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, prompt, 'utf8');

  try {
    const result = execSync(`cat "${tmpFile}" | claude -p - --model sonnet`, {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 600000 // 10분
    });

    // 임시파일 삭제 (존재할 때만)
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

    // JSON 파싱 (```json ... ``` 래핑 제거)
    let jsonStr = result.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }

    const translated = JSON.parse(jsonStr);
    return {
      titleEn: translated.title,
      summaryEn: translated.summary,
      contentEn: translated.content
    };
  } catch (error) {
    console.error('번역 실패:', error.message);
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    return null;
  }
}

// 번역 확인 및 실행
async function ensureTranslation(article, filePath) {
  // needTranslate 필드로 체크 (false면 스킵, 없거나 true면 번역 필요)
  if (article.needTranslate === false) {
    return false;
  }

  const slug = article.slug || path.basename(filePath, '.json');
  console.log(`   번역 중: ${article.title.substring(0, 30)}...`);

  const translated = await translateArticle(article, slug);
  if (!translated) {
    console.log(`   실패: ${path.basename(filePath)}`);
    return false;
  }

  // 번역 결과 병합
  article.titleEn = translated.titleEn;
  article.summaryEn = translated.summaryEn;
  article.contentEn = translated.contentEn;
  article.needTranslate = false; // 번역 완료

  // 파일 저장
  fs.writeFileSync(filePath, JSON.stringify(article, null, 2), 'utf8');
  console.log(`   저장됨: ${path.basename(filePath)}`);

  return true;
}

// 기사 로드
function loadArticles() {
  const articles = [];

  // 1. data/tech/ai/*.json 로드
  const aiDir = path.join(DATA_DIR, 'tech', 'ai');
  if (fs.existsSync(aiDir)) {
    const files = fs.readdirSync(aiDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(aiDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      articles.push({ data, filePath, source: 'tech/ai' });
    }
  }

  // 2. reports/issue/*.json 에서 EXTRA_ARTICLES.issue에 해당하는 것만
  const issueDir = path.join(REPORTS_DIR, 'issue');
  if (fs.existsSync(issueDir)) {
    for (const slug of EXTRA_ARTICLES.issue) {
      const filePath = path.join(issueDir, `${slug}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        articles.push({ data, filePath, source: 'issue' });
      }
    }
  }

  return articles;
}

async function main() {
  console.log('=== AIScroll 번역 시작 ===\n');

  const articles = loadArticles();
  console.log(`${articles.length}개 기사 로드됨\n`);

  // 모든 기사 병렬 번역
  const results = await Promise.all(
    articles.map(({ data, filePath, source }) => ensureTranslation(data, filePath))
  );

  const translatedCount = results.filter(Boolean).length;

  console.log(`\n번역 완료: ${translatedCount}개 기사 업데이트됨`);
  console.log('=== AIScroll 번역 완료 ===');
}

main().catch(console.error);
