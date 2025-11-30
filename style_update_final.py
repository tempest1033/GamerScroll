import os

html_path = 'GamersCrawl/index.html'

new_css_content = r'''
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
        padding: 20px;
        border-right: none;
      }
    }

    .section-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 20px;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title svg {
      width: 20px;
      height: 20px;
      color: #3b82f6;
    }

    .news-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }

    .news-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 10px;
      transition: all 0.2s ease;
      min-width: 0;
      overflow: hidden;
    }

    .news-item:hover {
      background: #f8fafc;
      transform: translateX(4px);
      border-color: #cbd5e1;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .news-num {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      color: #64748b;
      font-size: 12px;
      font-weight: 700;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .news-item:nth-child(1) .news-num,
    .news-item:nth-child(2) .news-num,
    .news-item:nth-child(3) .news-num {
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
      color: white;
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
    }

    .news-content {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .news-content a {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      text-decoration: none;
      display: block;
      line-height: 1.5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      transition: color 0.2s;
    }

    .news-content a:hover {
      color: var(--primary);
    }

    .community-tag {
      font-size: 11px;
      font-weight: 700;
      color: var(--primary);
      background: #eef2ff;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Rankings Section */
    .rankings-controls {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 20px 32px;
      margin-top: 32px;
      margin-bottom: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 24px;
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .rankings-controls::-webkit-scrollbar {
      display: none;
    }

    .control-group {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .control-label {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .tab-group {
      display: flex;
      background: #f1f5f9;
      border-radius: 10px;
      padding: 4px;
      gap: 4px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .tab-group::-webkit-scrollbar {
      display: none;
    }

    .tab-btn {
      padding: 10px 20px;
      min-width: 100px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      white-space: nowrap;
      text-align: center;
    }

    .tab-btn:hover {
      color: var(--text);
      background: rgba(255,255,255,0.5);
    }

    .tab-btn.active {
      background: white;
      color: var(--primary);
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      font-weight: 700;
    }


    /* Rankings Table */
    .rankings-card {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .chart-section {
      display: none;
    }

    .chart-section.active {
      display: block;
    }

    .chart-scroll {
      overflow-x: auto;
    }

    .columns-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
    }

    .country-column {
      min-width: 0;
      border-right: 1px solid var(--border);
    }

    .country-column:last-child {
      border-right: none;
    }

    .column-header {
      padding: 16px 12px;
      background: #f8fafc;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(4px);
    }

    .flag {
      font-size: 1.4rem;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));
    }

    .country-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }

    .rank-list {
      padding: 8px 0;
    }

    .rank-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      transition: all 0.2s;
    }

    .rank-row:hover {
      background: #f8fafc;
      transform: scale(1.01);
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      z-index: 1;
      position: relative;
    }

    .rank-row:last-child {
      border-bottom: none;
    }

    .rank-num {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: #94a3b8;
      flex-shrink: 0;
      border-radius: 8px;
      background: #f1f5f9;
    }

    .rank-num.top1 {
      background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);
    }

    .rank-num.top2 {
      background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(148, 163, 184, 0.3);
    }

    .rank-num.top3 {
      background: linear-gradient(135deg, #fdba74 0%, #f97316 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(249, 115, 22, 0.3);
    }

    .app-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      object-fit: cover;
      flex-shrink: 0;
      background: #f1f5f9;
      box-shadow: 0 2px 5px rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.05);
    }

    .app-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .app-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .app-dev {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .no-data, .no-service {
      padding: 40px 20px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    /* Steam Section */
    .steam-controls {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 20px 32px;
      margin-top: 32px;
      margin-bottom: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .steam-table {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .steam-table-header {
      display: grid;
      grid-template-columns: 70px 1fr 140px;
      padding: 16px 24px;
      background: #f8fafc;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .steam-table-row {
      display: grid;
      grid-template-columns: 70px 1fr 140px;
      padding: 16px 24px;
      border-bottom: 1px solid #f1f5f9;
      align-items: center;
      transition: all 0.2s;
    }

    .steam-table-row:hover {
      background: #f8fafc;
      transform: translateX(4px);
    }

    .steam-table-row:last-child {
      border-bottom: none;
    }

    .steam-col-rank {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .steam-col-game {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .steam-img {
      width: 140px;
      height: 52px;
      border-radius: 8px;
      object-fit: cover;
      background: linear-gradient(135deg, #1b2838 0%, #2a475e 100%);
      flex-shrink: 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .steam-img-placeholder {
      width: 140px;
      height: 52px;
      border-radius: 8px;
      background: linear-gradient(135deg, #1b2838 0%, #2a475e 100%);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .steam-img-placeholder svg {
      width: 24px;
      height: 24px;
      fill: #66c0f4;
      opacity: 0.6;
    }

    .steam-game-info {
      min-width: 0;
    }

    .steam-game-name {
      font-size: 15px;
      font-weight: 700;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .steam-game-dev {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .steam-col-players {
      text-align: right;
      font-size: 14px;
      font-weight: 600;
      color: #16a34a;
    }

    .steam-price-info {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .steam-discount {
      background: #22c55e;
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 800;
      box-shadow: 0 2px 4px rgba(34, 197, 94, 0.2);
    }

    .steam-price {
      color: #1e293b;
      font-weight: 600;
    }

    .steam-rank {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: #64748b;
      background: #f1f5f9;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .steam-rank.top1 {
      background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);
    }

    .steam-rank.top2 {
      background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(148, 163, 184, 0.3);
    }

    .steam-rank.top3 {
      background: linear-gradient(135deg, #fdba74 0%, #f97316 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(249, 115, 22, 0.3);
    }

    .steam-col-game {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .steam-game-info {
      min-width: 0;
      flex: 1;
    }

    .steam-game-name {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Video Section (영상) */
    .video-controls {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 20px 32px;
      margin-top: 32px;
      margin-bottom: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .video-section {
      display: none;
    }

    .video-section.active {
      display: block;
    }

    .external-links {
      display: flex;
      gap: 8px;
    }

    .external-link-btn {
      display: inline-flex;
      align-items: center;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      background: #f1f5f9;
      border: none;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
    }

    .external-link-btn:hover {
      background: #e2e8f0;
      color: var(--text);
    }

    .link-favicon {
      width: 16px;
      height: 16px;
      margin-right: 6px;
    }

    .external-link-btn svg {
      margin-left: 4px;
      opacity: 0.5;
    }

    .youtube-link:hover {
      background: #ff0000;
      color: white;
    }

    .chzzk-link:hover {
      background: #00ffa3;
      color: #000;
    }

    .soop-link:hover {
      background: #5c7cfa;
      color: white;
    }

    /* YouTube Grid */
    .youtube-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
    }

    .youtube-card {
      background: white;
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
      text-decoration: none;
      transition: all 0.3s ease;
      border: none;
    }

    .youtube-card:hover {
      transform: translateY(-6px);
      box-shadow: var(--shadow-lg);
    }

    .youtube-thumbnail {
      position: relative;
      aspect-ratio: 16/9;
      background: #0f0f0f;
      overflow: hidden;
      border-radius: var(--radius) var(--radius) 0 0;
    }

    .youtube-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }
    
    .youtube-card:hover .youtube-thumbnail img {
        transform: scale(1.05);
    }

    .youtube-rank {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: white;
      background: rgba(0,0,0,0.7);
      border-radius: 6px;
      backdrop-filter: blur(4px);
    }

    .youtube-rank.top1 {
      background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
      color: #78350f;
    }

    .youtube-rank.top2 {
      background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
      color: #334155;
    }

    .youtube-rank.top3 {
      background: linear-gradient(135deg, #fed7aa 0%, #f97316 100%);
      color: #7c2d12;
    }

    .live-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 700;
      color: white;
      background: #ef4444;
      border-radius: 4px;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .youtube-info {
      padding: 16px;
    }

    .youtube-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .youtube-channel {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .youtube-views {
      font-size: 11px;
      color: var(--text-muted);
    }

    .youtube-empty {
      text-align: center;
      padding: 60px 20px;
      color: #64748b;
    }

    .youtube-empty p {
      margin: 8px 0;
    }

    @media (max-width: 1200px) {
      .youtube-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 768px) {
      .youtube-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }
    }

    @media (max-width: 480px) {
      .youtube-grid {
        grid-template-columns: 1fr;
      }
    }

    /* Top Banner */
    .top-banner {
      width: 100%;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 10px 0;
      text-align: center;
    }
    .top-banner img {
      max-width: 728px;
      width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .top-banner-placeholder {
      max-width: 728px;
      height: 90px;
      margin: 0 auto;
      background: var(--bg);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 14px;
    }

    /* Footer */
    .footer {
      background: var(--card);
      border-top: 1px solid var(--border);
      padding: 40px 20px;
      text-align: center;
      margin-top: 60px;
    }
    .footer-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    .footer-links {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .footer-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
      transition: color 0.2s;
    }
    .footer-links a:hover {
      color: var(--text);
    }
    .footer-info {
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.6;
      white-space: nowrap;
      overflow-x: auto;
    }
    .footer-info p {
      margin: 4px 0;
    }

    /* Print */
    @media print {
      .nav { display: none; }
      .rankings-controls { display: none; }
      body { background: white; }
      .header { background: #1e3a8a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    /* Mobile */
    @media (max-width: 768px) {
      .header-top { flex-direction: column; align-items: flex-start; gap: 8px; }
      .report-date { text-align: left; }
      .news-grid { grid-template-columns: 1fr; }
      .nav-item { padding: 12px 16px; font-size: 13px; }
    }
'''

with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

start_tag_idx = html_content.find('<style>')
end_tag_idx = html_content.find('</style>')

if start_tag_idx != -1 and end_tag_idx != -1:
    # Everything from <style> to </style> will be replaced
    new_html_content = html_content[:start_tag_idx + len('<style>')] + new_css_content + '\n' + html_content[end_tag_idx:]
    
    # --- SVG 로고 HTML 변경 ---
    # Python 스크립트에서 HTML 부분을 직접 찾아서 교체합니다.
    old_svg_html = r'''        <svg class="logo-svg" viewBox="0 0 280 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gamersGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#3b82f6"/>
              <stop offset="100%" style="stop-color:#6366f1"/>
            </linearGradient>
            <linearGradient id="crawlGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#6366f1"/>
              <stop offset="100%" style="stop-color:#8b5cf6"/>
            </linearGradient>
          </defs>
          <text x="0" y="32" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-size="36" font-weight="800" fill="url(#gamersGrad)">GAMERS</text>
          <text x="148" y="32" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-size="36" font-weight="800" fill="url(#crawlGrad)">CRAWL</text>
        </svg>'''

    new_svg_html = r'''        <svg class="logo-svg" viewBox="0 0 280 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gamersGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:var(--primary-dark)"/>
              <stop offset="100%" style="stop-color:var(--primary-light)"/>
            </linearGradient>
            <linearGradient id="crawlGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:var(--primary-light)"/>
              <stop offset="100%" style="stop-color:#7c3aed"/>
            </linearGradient>
          </defs>
          <text x="0" y="32" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-size="36" font-weight="800" fill="url(#gamersGrad)">GAMERS</text>
          <text x="148" y="32" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-size="36" font-weight="800" fill="url(#crawlGrad)">CRAWL</text>
        </svg>'''

    # new_html_content (string)에서 SVG 로고를 교체
    # 주의: new_html_content는 <style> 태그 안의 CSS를 교체한 후의 내용이므로,
    # SVG 교체는 이 new_html_content 변수에 대해 수행해야 합니다.
    new_html_content = new_html_content.replace(old_svg_html, new_svg_html, 1)

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_html_content)
    print('index.html updated successfully.')
else:
    print(f'Style tags not found in index.html. Start: {start_tag_idx}, End: {end_tag_idx}')
