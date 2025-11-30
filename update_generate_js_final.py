import os

js_path = 'GamersCrawl/generate-html-report.js'

new_full_css_content_str = """
    /* 폰트 로딩 전 화면 숨김 - FOUT 완전 방지 */
    html {
      visibility: hidden;
    }
    html.fonts-loaded {
      visibility: visible;
    }
    :root {
      --primary: #4f46e5; /* Indigo 600 */
      --primary-light: #6366f1; /* Indigo 500 */
      --primary-dark: #4338ca; /* Indigo 700 */
      --accent: #f97316;
      --bg: #f8fafc; /* Slate 50 */
      --card: #ffffff;
      --border: #e2e8f0; /* Slate 200 */
      --text: #0f172a; /* Slate 900 */
      --text-secondary: #64748b; /* Slate 500 */
      --text-muted: #94a3b8; /* Slate 400 */
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
      --radius: 16px;
    }

    /* Twemoji 이모지 크기 제어 */
    img.emoji {
      height: 1em;
      width: 1em;
      margin: 0 .05em 0 .1em;
      vertical-align: -0.1em;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow-y: scroll;
    }

    /* Header */
    .header {
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 24px 0;
      position: relative;
      z-index: 101;
    }

    .header-inner {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }

    .header-date {
      position: absolute;
      right: 24px;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: rgba(255,255,255,0.5);
      padding: 6px 12px;
      border-radius: 20px;
      border: 1px solid var(--border);
    }

    .header-title {
      font-size: 2.2rem;
      font-weight: 800;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .logo-svg {
      height: 42px;
      width: auto;
      filter: drop-shadow(0 4px 6px rgba(99, 102, 241, 0.25));
      transition: transform 0.3s ease;
    }
    
    .logo-svg:hover {
        transform: scale(1.02);
    }

    .logo-badge {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -1px;
    }

    .logo-text {
      display: flex;
      align-items: center;
    }

    .header-title .logo-game {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-title .logo-crawler {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-subtitle {
      display: none;
    }

    /* Navigation */
    .nav {
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: var(--shadow-sm);
    }

    .nav-inner {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      justify-content: center;
      gap: 8px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .nav-inner::-webkit-scrollbar {
      display: none;
    }

    .nav-item {
      padding: 12px 20px;
      font-size: 15px;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      flex-shrink: 0;
      border-radius: 8px;
      margin: 6px 0;
      border-bottom: none;
    }

    .nav-item:hover {
      color: var(--text);
      background: #f1f5f9;
    }

    .nav-item.active {
      color: var(--primary);
      background: #eef2ff;
      border-bottom: none;
    }

    .nav-item svg {
      width: 20px;
      height: 20px;
      opacity: 0.8;
    }
    
    .nav-item.active svg {
        opacity: 1;
        stroke-width: 2.5px;
    }

    /* Container */
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px 60px;
    }

    /* Sections */
    .section {
      display: none;
      animation: fadeIn 0.3s ease-out;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .section.active {
      display: block;
    }

    /* News Section */
    .news-controls {
      display: none;
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 16px 24px;
      margin-top: 32px;
      margin-bottom: 20px;
    }

    .news-controls .control-group {
      width: 100%;
    }

    #newsTab, #communityTab {
      width: 100%;
    }

    #newsTab .tab-btn, #communityTab .tab-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px 4px;
      font-size: 14px;
    }

    .news-card {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 32px;
      border: 1px solid rgba(255,255,255,0.5);
    }

    @media (min-width: 769px) {
      .news-card {
        margin-top: 32px;
      }
    }

    .news-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
    }

    .news-panel {
      display: block;
      border-right: none; 
      padding: 0;
      min-width: 0;
      overflow: hidden;
    }

    .news-panel:last-child {
      border-right: none;
    }

    .news-list {
      min-width: 0;
    }

    .news-item a {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .news-panel-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding: 12px 16px;
      border-radius: 12px;
      background: #f8fafc;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.03);
    }

    #news-inven .news-panel-header { background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); }
    #news-ruliweb .news-panel-header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3); }
    #news-gamemeca .news-panel-header { background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); box-shadow: 0 4px 10px rgba(217, 119, 6, 0.3); }
    #news-thisisgame .news-panel-header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); box-shadow: 0 4px 10px rgba(220, 38, 38, 0.3); }
    
    #community-dcinside .news-panel-header { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3); }
    #community-fmkorea .news-panel-header { background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3); }
    #community-arca .news-panel-header { background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3); }
    #community-ruliweb .news-panel-header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3); }

    .news-panel-title {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .news-more-link {
      margin-left: auto;
      font-size: 12px;
      color: rgba(255,255,255,0.9);
      text-decoration: none;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(255,255,255,0.1);
      transition: background 0.2s;
    }

    .news-more-link:hover {
      color: #fff;
      background: rgba(255,255,255,0.25);
    }

    .news-favicon {
      width: 20px;
      height: 20px;
      margin-right: 6px;
      vertical-align: middle;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
    }

    @media (max-width: 1400px) {
      .news-container { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 768px) {
      .news-controls {
        display: flex;
      }
      .news-card {
        padding: 20px;
      }
      .news-container {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .news-panel {
        display: block;
        background: #fff;
        border-radius: 12px;
        border: 1px solid var(--border);