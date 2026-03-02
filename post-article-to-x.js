/**
 * X(Twitter) 개별 기사 포스팅 스크립트
 * CLI: node post-article-to-x.js <slug> [--lang en]
 *
 * 필요한 환경변수:
 * - ko: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
 * - en: AISCROLL_API_KEY, AISCROLL_API_SECRET, AISCROLL_ACCESS_TOKEN, AISCROLL_ACCESS_SECRET
 */

const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');

// CLI args 파싱
const args = process.argv.slice(2);
const langIdx = args.indexOf('--lang');
const lang = langIdx !== -1 ? args[langIdx + 1] : 'ko';
const slug = args.find(a => !a.startsWith('--') && a !== lang);

const IMAGE_PATH = lang === 'en' ? './docs/images/x-card-article-en.png' : './docs/images/x-card-article.png';
const META_FILE = lang === 'en' ? './x-post-article-en-meta.json' : './x-post-article-meta.json';

// 기사 JSON 탐색 경로 (우선순위 순)
const SEARCH_DIRS = [
  { dir: './reports/issue', type: 'issue' },
  { dir: './reports/ranking', type: 'ranking' },
  { dir: './data/wiki', type: 'wiki', nested: true },
  { dir: './data/tech', type: 'tech', nested: true }
];

function findArticleBySlug(slug) {
  for (const { dir, type, nested } of SEARCH_DIRS) {
    if (!fs.existsSync(dir)) continue;

    if (nested) {
      const subDirs = fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const sub of subDirs) {
        const filePath = path.join(dir, sub, `${slug}.json`);
        if (fs.existsSync(filePath)) {
          return { path: filePath, type, category: sub };
        }
      }
    } else {
      const filePath = path.join(dir, `${slug}.json`);
      if (fs.existsSync(filePath)) {
        return { path: filePath, type };
      }
    }
  }
  return null;
}

function buildArticleUrl(found, slug) {
  if (lang === 'en') {
    const base = 'https://aiscroll.com';
    switch (found.type) {
      case 'issue':
        return `${base}/trend/issue/${slug}/`;
      case 'ranking':
        return `${base}/trend/ranking/${slug}/`;
      case 'wiki':
        return `${base}/wiki/${found.category}/${slug}/`;
      case 'tech':
        return `${base}/tech/${found.category}/${slug}/`;
      default:
        return `${base}/`;
    }
  }
  const base = 'https://gamerscroll.com';
  switch (found.type) {
    case 'issue':
      return `${base}/trend/issue/${slug}/`;
    case 'ranking':
      return `${base}/trend/ranking/${slug}/`;
    case 'wiki':
      return `${base}/wiki/${found.category}/${slug}/`;
    case 'tech':
      return `${base}/tech/${found.category}/${slug}/`;
    default:
      return `${base}/`;
  }
}

function extractHashtags(keywords, maxCount = 3) {
  if (!keywords) return '';
  const tags = keywords.split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0 && k.length <= 20)
    .slice(0, maxCount)
    .map(k => `#${k.replace(/\s+/g, '')}`);
  return tags.join(' ');
}

async function postArticleToX(slug) {
  if (!slug) {
    console.error('사용법: node post-article-to-x.js <slug> [--lang en]');
    process.exit(1);
  }

  console.log(`기사 X 포스팅 시작: ${slug} (lang: ${lang})`);

  // 환경변수 확인
  const envPrefix = lang === 'en' ? 'AISCROLL' : 'X';
  const API_KEY = process.env[`${envPrefix}_API_KEY`];
  const API_SECRET = process.env[`${envPrefix}_API_SECRET`];
  const ACCESS_TOKEN = process.env[`${envPrefix}_ACCESS_TOKEN`];
  const ACCESS_SECRET = process.env[`${envPrefix}_ACCESS_SECRET`];

  if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
    console.error(`X API 환경변수가 설정되지 않았습니다.`);
    console.log(`필요한 환경변수: ${envPrefix}_API_KEY, ${envPrefix}_API_SECRET, ${envPrefix}_ACCESS_TOKEN, ${envPrefix}_ACCESS_SECRET`);
    process.exit(1);
  }

  // 기사 JSON 찾기
  const found = findArticleBySlug(slug);
  if (!found) {
    console.error(`기사를 찾을 수 없습니다: ${slug}`);
    process.exit(1);
  }

  console.log(`기사 파일: ${found.path}`);
  const article = JSON.parse(fs.readFileSync(found.path, 'utf8'));

  const articleUrl = buildArticleUrl(found, slug);

  // 트윗 텍스트 생성
  let tweetText;

  if (lang === 'en') {
    const title = article.titleEn || article.title;
    const summary = article.summaryEn || article.summary || '';
    const summaryText = summary.length > 100 ? summary.substring(0, 100) + '...' : summary;

    tweetText = `${title}\n\n${summaryText}\n\n${articleUrl}\n\n#gaming #gamingnews`;
  } else {
    const summaryText = article.summary && article.summary.length > 100
      ? article.summary.substring(0, 100) + '...'
      : (article.summary || '');

    const hashtags = extractHashtags(article.keywords, 3);
    const baseHashtags = '#게임 #게임뉴스';
    const allHashtags = hashtags ? `${baseHashtags} ${hashtags}` : baseHashtags;

    tweetText = `게이머스크롤 데일리 포커스\n\n${article.title}\n\n${summaryText}\n\n${articleUrl}\n\n${allHashtags}`;
  }

  console.log('트윗 내용:');
  console.log(tweetText);
  console.log(`글자 수: ${tweetText.length}`);

  // Twitter 클라이언트 초기화
  const client = new TwitterApi({
    appKey: API_KEY,
    appSecret: API_SECRET,
    accessToken: ACCESS_TOKEN,
    accessSecret: ACCESS_SECRET,
  });

  try {
    let tweet;

    if (fs.existsSync(IMAGE_PATH)) {
      try {
        console.log('이미지 업로드 시도 중...');
        const mediaId = await client.v1.uploadMedia(IMAGE_PATH);

        console.log('이미지와 함께 트윗 게시 중...');
        tweet = await client.v2.tweet({
          text: tweetText,
          media: {
            media_ids: [mediaId]
          }
        });
      } catch (mediaError) {
        console.log('이미지 업로드 실패 (Free 티어 제한), 텍스트만 게시합니다.');
        tweet = await client.v2.tweet({
          text: tweetText
        });
      }
    } else {
      console.log('카드 이미지 없음, 텍스트만 트윗 게시 중...');
      tweet = await client.v2.tweet({
        text: tweetText
      });
    }

    console.log('X 포스팅 완료!');
    console.log(`https://twitter.com/i/status/${tweet.data.id}`);

    // 메타 파일 저장
    const meta = {
      slug,
      lang,
      tweetId: tweet.data.id,
      postedAt: new Date().toISOString(),
      url: `https://twitter.com/i/status/${tweet.data.id}`
    };
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');

    return tweet.data;
  } catch (error) {
    console.error('X 포스팅 실패:', error.message);
    if (error.data) {
      console.error('상세 에러:', JSON.stringify(error.data, null, 2));
    }
    throw error;
  }
}

if (require.main === module) {
  postArticleToX(slug).catch(err => {
    console.error('포스팅 실패:', err);
    process.exit(1);
  });
}

module.exports = { postArticleToX };
