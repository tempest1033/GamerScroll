/**
 * 믹스독 제품 페이지 문구 (EN/KO). 컨셉: 오픈소스 + 비용 절감. Gemini(gemini-3.1-pro-preview) 윤문 2회, 2026-10-12 갱신 후 Gemini 3.1 Pro 윤문 1회를 거쳤다(사실·근거 없는 표현은 되돌림).
 * 수치·기능은 C:/Project/mixdog/README.md · CHANGELOG.md(Terminal-Bench 2.1 결과, macOS 공증)를 그대로 옮긴다.
 * 기능 패널 [영상 이름, 제목, 한두 문장 설명, 대체 텍스트, 배경 색]. 영상·이미지는 assets/aiscroll-mixdog/.
 * title · sub는 홈 믹스독 판에도 쓴다.
 */

const en = {
  "metaTitle": "Mixdog: Open-Source Agent, 63% Fewer Tokens - AIScroll",
  "description": "Mixdog is a free, open-source coding agent for Windows, macOS, and Linux. On Terminal-Bench 2.1, it matched Codex CLI's success rate with 63% fewer tokens.",
  "keywords": "Mixdog, open-source coding agent, Terminal-Bench 2.1, token cost, AI coding agent",
  "title": [
    "Same results.",
    "63% fewer tokens."
  ],
  "sub": "Mixdog is a free, open-source coding agent. Connect your existing Claude, ChatGPT, Grok, or Muse Code subscription with no extra fees.",
  "win": "Download for Windows",
  "mac": "Download for Mac",
  "linux": "Download for Linux",
  "github": "GitHub",
  "free": "Free",
  "allDownloads": "Available for Windows, macOS, and Linux",
  "costTitle": [
    "Same model, same score.",
    "Less than half the tokens."
  ],
  "costBody": "Tested across all 89 Terminal-Bench 2.1 tasks with 445 trials per agent, both running GPT-5.6 Sol xhigh.",
  "stats": [
    [
      "86.5%",
      "Success rate",
      "Codex CLI 86.1%"
    ],
    [
      "$0.476",
      "Cost per trial",
      "Codex CLI $0.782"
    ],
    [
      "87 of 89",
      "Tasks with fewer tokens",
      ""
    ]
  ],
  "barsLabel": "Total tokens (including cached input)",
  "bars": [
    [
      "Mixdog",
      "156.5M",
      156.5
    ],
    [
      "Codex CLI",
      "421.4M",
      421.4
    ]
  ],
  "costNote": "Scored with the official Harbor verifier using unmodified timeouts and zero retries. Compared to Claude Code on Claude Opus 5, Mixdog cost 19% less and solved 2 more tasks.",
  "costLink": "View method and raw data",
  "howTitle": "How we stop token leaks",
  "how": [
    [
      "67%",
      "Lighter first request",
      "System instructions and tool descriptions include only what the model needs: 4.7k tokens vs. 14.4k for Codex CLI."
    ],
    [
      "33%",
      "Fewer round trips",
      "Selects the right tools upfront and batches independent steps: only 10 requests per trial vs. 16 for Codex CLI."
    ],
    [
      "46%",
      "Filtered output",
      "Tools return only what was requested, and 95% of terminal output is filtered out before reaching the model."
    ],
    [
      "8%",
      "Shorter responses",
      "Reduces filler and repetition in model replies."
    ]
  ],
  "featuresTitle": "Everything in one window",
  "features": [
    [
      "clip-fix",
      "Ask once, get it fixed.",
      "Finds failing tests, fixes the bugs, and reruns the suite. Three bugs fixed in 12 seconds.",
      "Mixdog fixing three bugs and rerunning tests",
      "#c9d3c6"
    ],
    [
      "clip-swarm",
      "From solo to swarm.",
      "A strong model plans the work, while cheaper models search, edit, and review in parallel.",
      "Lead agent dispatching tasks to three parallel workers",
      "#c6ccd6"
    ],
    [
      "clip-parallel",
      "Run tasks side by side.",
      "Split the window and assign different tasks to completely independent sessions.",
      "Two sessions working simultaneously in split panes",
      "#d9cfbf"
    ],
    [
      "clip-terminal",
      "Editor, terminal, Git, and GitHub built in.",
      "Edit code with language server support, preview and edit Markdown, CSV, PDF, and Office files, run tests, commit, and open PRs without leaving the app.",
      "Editor and terminal running a test suite beside the agent",
      "#d5c5ba"
    ],
    [
      "clip-usage",
      "Track every single token.",
      "View tokens and costs by provider and model, plus your quota limits and reset times.",
      "Token usage dashboard showing costs by provider",
      "#cec9d8"
    ]
  ],
  "filmLabel": "Mixdog promo video",
  "moreTitle": "More capabilities",
  "moreGroups": [
    [
      "Works autonomously",
      [
        [
          "Goal execution",
          "Give it a goal and the session works on its own until it's done."
        ],
        [
          "Schedules & webhooks",
          "Trigger tasks on a timer or via a custom URL."
        ],
        [
          "Mobile app",
          "Pair your iPhone or Android phone with a QR code, continue sessions end-to-end encrypted, and get notified when work finishes."
        ],
        [
          "Command line",
          "Use the same agent in your terminal, or run one-shot tasks headlessly with mixdog\u00a0exec."
        ]
      ]
    ],
    [
      "Beyond code",
      [
        [
          "Browser control",
          "Navigate and interact with real, signed-in web pages."
        ],
        [
          "Computer control",
          "Operate native Windows and macOS applications."
        ],
        [
          "Document editing",
          "Create and edit Word, Excel, PowerPoint, and PDF files."
        ],
        [
          "Media studio",
          "Generate and edit images and videos, saving them to a local gallery."
        ]
      ]
    ],
    [
      "Built-in tools",
      [
        [
          "Auto reasoning effort",
          "A small local model picks the right reasoning effort for every message and tool step in about 0.1 s. On by default."
        ],
        [
          "Memory",
          "Remembers important details and searches through past work."
        ],
        [
          "Code Graph & Code Tidy",
          "Queries your code structure, then formats, lints, and fixes it."
        ],
        [
          "Local models",
          "Download and run models completely locally on your GPU."
        ]
      ]
    ]
  ],
  "ossTitle": "Open code. Open benchmark.",
  "ossBody": "Licensed under Apache-2.0. Verdicts, verifier outputs, usage snapshots, and the exact scripts to recompute every number on this page are available in our repository.",
  "ossBench": "View benchmark data",
  "cliLabel": "Command line · Node.js 22.19+ or 24+",
  "faqTitle": "Frequently asked questions",
  "faq": [
    [
      "Is it really free?",
      "Yes. The Mixdog app is free and open source under the Apache-2.0 license. You only pay for model usage directly to the providers, using your own subscriptions or API keys."
    ],
    [
      "Which subscriptions and API keys work?",
      "We support Claude account sign-in and Anthropic API keys, ChatGPT/Codex account sign-in and OpenAI API keys, Google Gemini API keys, Grok account sign-in and xAI API keys, Muse Code (Meta) account sign-in, plus OpenRouter, DeepSeek, and OpenCode Go."
    ],
    [
      "What operating systems are supported?",
      "The desktop app runs on Windows x64, macOS (Apple Silicon and Intel), and Linux (x64 and ARM64, AppImage or .deb, glibc 2.31+). On Intel Macs, auto reasoning effort and semantic memory search aren't available. The command-line version requires Node.js 22.19+ (22.x) or 24+."
    ],
    [
      "How did you measure the 63% savings?",
      "We ran all 89 Terminal-Bench 2.1 tasks five times each (445 trials per agent). Both used the exact same model, reasoning level, unmodified timeouts, and resources. We allowed zero retries and scored them with the official Harbor verifier. All logs and scripts are public."
    ],
    [
      "Can I run models on my local GPU?",
      "Yes. Using the built-in local provider, you can download and run models directly inside the app. Currently, this requires a Windows x64 machine with an NVIDIA GPU."
    ],
    [
      "Why does Windows SmartScreen show a warning?",
      "The Windows installer isn't code-signed yet. Just click 'More info' then 'Run anyway'. The Mac app is fully signed and notarized by Apple, so it opens without warnings."
    ]
  ],
  "endTitle": "Download, sign in, done.",
  "endBody": "Forget complicated config files and YAML. Follow a quick five-step tutorial and you're ready to go.",
  "postsTitle": "Mixdog posts",
  "postsMore": "All Mixdog posts"
};

const ko = {
  "metaTitle": "믹스독: 토큰을 63% 덜 쓰는 오픈소스 코딩 에이전트 - AIScroll",
  "description": "믹스독은 Windows, macOS, Linux를 지원하는 무료 오픈소스 코딩 에이전트입니다. Terminal-Bench 2.1에서 Codex CLI와 동일한 성공률을 기록하며 토큰은 63% 덜 사용했습니다.",
  "keywords": "믹스독, Mixdog, 오픈소스 코딩 에이전트, Terminal-Bench 2.1, 토큰 비용",
  "title": [
    "성능은 그대로,",
    "토큰은 63% 더 적게."
  ],
  "sub": "믹스독은 무료 오픈소스 코딩 에이전트입니다. 별도 결제 없이 기존 Claude, ChatGPT, Grok, Muse Code 구독만 연결하면 됩니다.",
  "win": "Windows용 다운로드",
  "mac": "Mac용 다운로드",
  "linux": "Linux용 다운로드",
  "github": "GitHub",
  "free": "무료",
  "allDownloads": "Windows, macOS, Linux 지원",
  "costTitle": [
    "같은 모델, 같은 점수.",
    "토큰은 절반도 안 씁니다."
  ],
  "costBody": "Terminal-Bench 2.1의 89개 과제를 두 에이전트 모두 GPT-5.6 Sol xhigh 모델로 445회씩 테스트한 결과입니다.",
  "stats": [
    [
      "86.5%",
      "성공률",
      "Codex CLI 86.1%"
    ],
    [
      "$0.476",
      "시도당 비용",
      "Codex CLI $0.782"
    ],
    [
      "87 / 89",
      "토큰을 아낀 과제 수",
      ""
    ]
  ],
  "barsLabel": "전체 토큰(캐시된 입력 포함)",
  "bars": [
    [
      "믹스독",
      "156.5M",
      156.5
    ],
    [
      "Codex CLI",
      "421.4M",
      421.4
    ]
  ],
  "costNote": "제한 시간을 변경하지 않고 재시도 없이 공식 Harbor 검증기로 채점했습니다. Claude Opus 5 환경에서 Claude Code와 비교했을 때는 비용을 19% 아끼면서 과제를 2개 더 해결했습니다.",
  "costLink": "측정 방법과 원본 데이터 보기",
  "howTitle": "토큰이 새는 곳을 막았습니다",
  "how": [
    [
      "67%",
      "가벼워진 첫 요청",
      "모델에 꼭 필요한 시스템 지침과 도구 설명만 전달합니다. Codex CLI의 14.4k 토큰 대비 4.7k 토큰으로 훨씬 가볍습니다."
    ],
    [
      "33%",
      "적어진 요청 횟수",
      "알맞은 도구를 미리 선택하고 독립적인 작업은 묶어서 처리합니다. 시도당 요청 수는 10회로 Codex CLI(16회)보다 적습니다."
    ],
    [
      "46%",
      "꼭 필요한 출력만",
      "도구는 요청받은 내용만 반환하고, 터미널 출력의 95%를 모델에 전달하기 전에 걸러냅니다."
    ],
    [
      "8%",
      "간결한 답변",
      "모델 답변에서 불필요한 군더더기와 반복을 줄였습니다."
    ]
  ],
  "featuresTitle": "모든 작업을 창 하나에서",
  "features": [
    [
      "clip-fix",
      "한 번 요청하면 알아서 수정합니다.",
      "실패한 테스트를 찾아 버그를 고치고 테스트를 다시 실행합니다. 버그 3개를 해결하는 데 12초면 충분합니다.",
      "버그 3개를 고치고 테스트를 다시 실행하는 믹스독 화면",
      "#c9d3c6"
    ],
    [
      "clip-swarm",
      "혼자서도, 팀으로도.",
      "고성능 모델이 계획을 세우면, 저렴한 모델 여럿이 검색과 수정, 리뷰를 병렬로 처리합니다.",
      "리드 에이전트가 작업자 3명에게 작업을 분배하는 화면",
      "#c6ccd6"
    ],
    [
      "clip-parallel",
      "여러 작업을 동시에.",
      "창을 분할해 완전히 독립된 세션마다 서로 다른 작업을 맡깁니다.",
      "화면을 나누어 두 세션이 동시에 작업하는 모습",
      "#d9cfbf"
    ],
    [
      "clip-terminal",
      "에디터, 터미널, Git·GitHub 내장.",
      "언어 서버 기반 코드 편집부터 Markdown·CSV·PDF·Office 파일 미리보기와 편집, 테스트 실행, 커밋, PR 생성까지 앱 안에서 모두 해결합니다.",
      "에이전트 옆 터미널에서 테스트를 실행하는 화면",
      "#d5c5ba"
    ],
    [
      "clip-usage",
      "토큰 사용량을 투명하게 추적합니다.",
      "제공사와 모델별 토큰 사용량과 비용, 구독 한도, 초기화 시점을 한눈에 보여줍니다.",
      "제공사별 토큰과 비용을 보여주는 사용량 대시보드",
      "#cec9d8"
    ]
  ],
  "filmLabel": "믹스독 소개 영상",
  "moreTitle": "더 많은 기능",
  "moreGroups": [
    [
      "자율 작업",
      [
        [
          "목표 실행",
          "목표만 주면 세션이 알아서 끝까지 작업합니다."
        ],
        [
          "예약과 웹훅",
          "정해진 시간이나 특정 URL 호출 시 작업을 자동으로 시작합니다."
        ],
        [
          "모바일 앱",
          "QR 코드로 iPhone 또는 Android 폰을 연결해 종단간 암호화로 작업을 이어가고, 완료 알림을 받습니다."
        ],
        [
          "명령줄",
          "터미널에서도 동일한 에이전트를 사용하고, mixdog\u00a0exec로 대화 없이 단일 작업을 바로 실행합니다."
        ]
      ]
    ],
    [
      "코드 밖에서도",
      [
        [
          "브라우저 제어",
          "로그인된 실제 웹페이지를 직접 탐색하고 조작합니다."
        ],
        [
          "컴퓨터 제어",
          "Windows와 macOS 네이티브 앱을 직접 제어합니다."
        ],
        [
          "문서 작업",
          "Word, Excel, PowerPoint, PDF 문서를 생성하고 편집합니다."
        ],
        [
          "미디어 스튜디오",
          "이미지와 영상을 만들고 편집해 로컬 갤러리에 저장합니다."
        ]
      ]
    ],
    [
      "기본 탑재 도구",
      [
        [
          "자동 추론 강도",
          "작은 로컬 모델이 메시지와 도구 단계마다 적절한 추론 강도를 약 0.1초 만에 결정합니다. 기본으로 켜져 있습니다."
        ],
        [
          "기억",
          "중요한 정보를 기억하고 이전 작업 기록을 검색해 활용합니다."
        ],
        [
          "코드 그래프와 Code Tidy",
          "코드 구조를 파악하고 포맷팅, 린트, 오류 수정까지 자동으로 처리합니다."
        ],
        [
          "로컬 모델",
          "내 GPU에 모델을 다운로드해 완전히 로컬 환경에서 실행합니다."
        ]
      ]
    ]
  ],
  "ossTitle": "코드도, 벤치마크도 투명하게.",
  "ossBody": "Apache-2.0 라이선스를 따릅니다. 채점 결과, 검증기 출력, 사용량 기록은 물론 이 페이지의 숫자를 다시 계산해 볼 수 있는 스크립트까지 모두 저장소에 공개되어 있습니다.",
  "ossBench": "벤치마크 데이터 보기",
  "cliLabel": "명령줄 · Node.js 22.19 이상 또는 24 이상",
  "faqTitle": "자주 묻는 질문",
  "faq": [
    [
      "정말 무료인가요?",
      "네. 믹스독 앱은 Apache-2.0 라이선스로 배포되는 무료 오픈소스입니다. 연결해 둔 본인의 구독 계정이나 API 키를 통해 각 모델 제공사에 발생하는 사용료만 직접 결제하시면 됩니다."
    ],
    [
      "어떤 구독과 API 키를 쓸 수 있나요?",
      "Claude 계정 로그인과 Anthropic API 키, ChatGPT/Codex 계정 로그인과 OpenAI API 키, Google Gemini API 키, Grok 계정 로그인과 xAI API 키, Muse Code(Meta) 계정 로그인을 비롯해 OpenRouter, DeepSeek, OpenCode Go를 지원합니다."
    ],
    [
      "어떤 운영체제에서 쓸 수 있나요?",
      "데스크톱 앱은 Windows x64, macOS(Apple Silicon 및 Intel), Linux(x64 및 ARM64, AppImage 또는 .deb, glibc 2.31 이상)에서 실행할 수 있습니다. Intel Mac에서는 자동 추론 강도와 의미 기반 기억 검색을 지원하지 않습니다. 명령줄 버전은 Node.js 22.19 이상(22.x) 또는 24 이상이 필요합니다."
    ],
    [
      "63% 절감은 어떻게 계산했나요?",
      "Terminal-Bench 2.1의 89개 과제를 각 5회씩(에이전트당 총 445회) 실행한 결과입니다. 동일한 모델과 추론 강도, 기본 제한 시간과 자원을 사용했고 재시도 없이 공식 Harbor 검증기로 채점했습니다. 모든 실행 기록과 스크립트는 투명하게 공개되어 있습니다."
    ],
    [
      "내 GPU로 모델을 돌릴 수 있나요?",
      "네. 내장된 로컬 제공자를 통해 앱 안에서 모델을 직접 다운로드하고 실행할 수 있습니다. 현재는 NVIDIA GPU가 탑재된 Windows x64 환경을 지원합니다."
    ],
    [
      "Windows에서 SmartScreen 경고가 뜹니다.",
      "Windows 설치 파일이 아직 코드 서명을 받지 않아 생기는 현상입니다. '추가 정보'를 누른 뒤 '실행'을 선택하시면 됩니다. Mac 앱은 Apple의 서명과 공증을 모두 마쳤으므로 경고 없이 바로 열립니다."
    ]
  ],
  "endTitle": "다운로드하고 로그인하면 끝.",
  "endBody": "복잡한 설정 파일이나 YAML은 필요 없습니다. 5단계의 짧은 튜토리얼만 따라 하면 바로 시작할 수 있습니다.",
  "postsTitle": "믹스독 글",
  "postsMore": "믹스독 글 모아 보기"
};

module.exports = { en, ko };
