/**
 * X(Twitter) 자동 포스팅 스크립트
 * 생성된 이미지와 함께 트윗 게시
 *
 * 필요한 환경변수:
 * - X_API_KEY: API Key
 * - X_API_SECRET: API Key Secret
 * - X_ACCESS_TOKEN: Access Token
 * - X_ACCESS_SECRET: Access Token Secret
 */

const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');

const IMAGE_PATH = './docs/images/x-card-daily.png';
const REPORTS_DIR = './docs/reports';

const POST_META_PATH = './docs/images/x-post-meta.json';

async function postToX() {
  console.log('🐦 X 포스팅 시작...');

  // 환경변수 확인
  const {
    X_API_KEY,
    X_API_SECRET,
    X_ACCESS_TOKEN,
    X_ACCESS_SECRET
  } = process.env;

  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    console.error('❌ X API 환경변수가 설정되지 않았습니다.');
    console.log('필요한 환경변수: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET');
    process.exit(1);
  }

  // 이미지 파일 확인
  if (!fs.existsSync(IMAGE_PATH)) {
    console.error('❌ X 카드 이미지가 없습니다. generate-x-card.js를 먼저 실행하세요.');
    process.exit(1);
  }

  // 최신 인사이트 파일 찾기 (KST 기준)
  const getKSTDate = (offset = 0) => {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000) + (offset * 86400000));
    return kst.toISOString().split('T')[0];
  };
  const today = getKSTDate();
  const yesterday = getKSTDate(-1);
  const candidates = [
    `${REPORTS_DIR}/${today}.json`,
    `${REPORTS_DIR}/${yesterday}.json`
  ];

  let insightPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      insightPath = p;
      break;
    }
  }

  if (!insightPath) {
    console.error('❌ 인사이트 리포트 파일이 없습니다.');
    process.exit(1);
  }

  console.log(`📄 리포트 파일: ${insightPath}`);
  const reportData = JSON.parse(fs.readFileSync(insightPath, 'utf8'));
  const insight = {
    date: reportData.date,
    issues: reportData.ai?.issues || []
  };

  // 이미 같은 날짜에 포스팅했는지 확인
  if (fs.existsSync(POST_META_PATH)) {
    const postMeta = JSON.parse(fs.readFileSync(POST_META_PATH, 'utf8'));
    if (postMeta.date === insight.date) {
      console.log('⏭️ 오늘 이미 X에 포스팅했습니다. 스킵.');
      return null;
    }
  }

  // 트윗 텍스트 생성
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const tweetText = `${formatDate(insight.date)} 데일리 핫이슈 TOP3

${insight.issues.slice(0, 3).map((issue, i) =>
  `${i + 1}. ${issue.title}`
).join('\n')}

자세한 내용은 👇
https://gamerscrawl.com

#게임 #게임뉴스 #모바일게임 #게이머스크롤`;

  // Twitter 클라이언트 초기화
  const client = new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  });

  try {
    let tweet;

    // 이미지 업로드 시도 (Free 티어에서는 실패할 수 있음)
    if (fs.existsSync(IMAGE_PATH)) {
      try {
        console.log('📤 이미지 업로드 시도 중...');
        const mediaId = await client.v1.uploadMedia(IMAGE_PATH);

        console.log('📝 이미지와 함께 트윗 게시 중...');
        tweet = await client.v2.tweet({
          text: tweetText,
          media: {
            media_ids: [mediaId]
          }
        });
      } catch (mediaError) {
        console.log('⚠️ 이미지 업로드 실패 (Free 티어 제한), 텍스트만 게시합니다.');
        console.log('📝 텍스트만 트윗 게시 중...');
        tweet = await client.v2.tweet({
          text: tweetText
        });
      }
    } else {
      console.log('📝 텍스트만 트윗 게시 중...');
      tweet = await client.v2.tweet({
        text: tweetText
      });
    }

    // 포스팅 메타 저장 (중복 방지)
    fs.writeFileSync(POST_META_PATH, JSON.stringify({
      date: insight.date,
      tweetId: tweet.data.id,
      postedAt: new Date().toISOString()
    }), 'utf8');

    console.log('✅ X 포스팅 완료!');
    console.log(`🔗 https://twitter.com/i/status/${tweet.data.id}`);

    return tweet.data;
  } catch (error) {
    console.error('❌ X 포스팅 실패:', error.message);
    if (error.data) {
      console.error('상세 에러:', JSON.stringify(error.data, null, 2));
    }
    throw error;
  }
}

// 직접 실행 시
if (require.main === module) {
  postToX().catch(err => {
    console.error('포스팅 실패:', err);
    process.exit(1);
  });
}

module.exports = { postToX };
