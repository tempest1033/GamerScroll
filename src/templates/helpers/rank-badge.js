'use strict';

// Pure, zero-dependency static rank badge resolver, SVG renderer, and embed snippet builder.
// Runs in both Node (build-time static SVG generation, tests) and Cloudflare Workers (game-ssr bundle).

const { pickCountry, expand } = require('./game-rank-summary');

const SITE_ORIGIN = 'https://gamerscroll.com';
const BADGE_HEIGHT = 28;
const EDITION_PREFIX = { en: '', ja: '/ja', 'zh-cn': '/zh-cn', ko: '/ko', 'zh-tw': '/zh-tw' };
const EDITION_COUNTRY = { en: 'us', ja: 'jp', 'zh-cn': 'cn', ko: 'kr', 'zh-tw': 'tw' };

const MESSAGES = {
  en: {
    countries: { us: 'United States', jp: 'Japan', kr: 'Korea', cn: 'China', tw: 'Taiwan' },
    stores: { ios: 'App Store', android: 'Google Play', steam: 'Steam' },
    grossing: (rank, market) => `#${rank} Top Grossing · ${market}`,
    steam: (rank) => `#${rank} Most Played · Steam`,
    unranked: (scope) => (scope ? `Unranked · ${scope}` : 'Unranked'),
  },
  ja: {
    countries: { us: 'アメリカ', jp: '日本', kr: '韓国', cn: '中国', tw: '台湾' },
    stores: { ios: 'App Store', android: 'Google Play', steam: 'Steam' },
    grossing: (rank, market) => `売上${rank}位 · ${market}`,
    steam: (rank) => `同時接続${rank}位 · Steam`,
    unranked: (scope) => (scope ? `圏外 · ${scope}` : '圏外'),
  },
  ko: {
    countries: { us: '미국', jp: '일본', kr: '한국', cn: '중국', tw: '대만' },
    stores: { ios: '앱스토어', android: '구글플레이', steam: '스팀' },
    grossing: (rank, market) => `매출 ${rank}위 · ${market}`,
    steam: (rank) => `최다 플레이 ${rank}위 · 스팀`,
    unranked: (scope) => (scope ? `순위권 외 · ${scope}` : '순위권 외'),
  },
  'zh-cn': {
    countries: { us: '美国', jp: '日本', kr: '韩国', cn: '中国', tw: '台湾' },
    stores: { ios: 'App Store', android: 'Google Play', steam: 'Steam' },
    grossing: (rank, market) => `畅销第${rank}名 · ${market}`,
    steam: (rank) => `同时在线第${rank}名 · Steam`,
    unranked: (scope) => (scope ? `未上榜 · ${scope}` : '未上榜'),
  },
  'zh-tw': {
    countries: { us: '美國', jp: '日本', kr: '韓國', cn: '中國', tw: '台灣' },
    stores: { ios: 'App Store', android: 'Google Play', steam: 'Steam' },
    grossing: (rank, market) => `暢銷第${rank}名 · ${market}`,
    steam: (rank) => `同時在線第${rank}名 · Steam`,
    unranked: (scope) => (scope ? `未上榜 · ${scope}` : '未上榜'),
  },
};

const TONE_FILLS = {
  top3: '#4f46e5',
  top10: '#0066cc',
  top50: '#0f766e',
  ranked: '#334155',
  steamTop: '#1d4ed8',
  steam: '#1e3a5f',
  unranked: '#64748b',
};

const escXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeEdition = (code) => (Object.prototype.hasOwnProperty.call(EDITION_PREFIX, code) ? code : 'en');
const nums = (arr) => arr.filter((x) => x != null);

function currentSteamRank(game) {
  const rank = (game && game.steam && typeof game.steam.rank === 'number' && game.steam.rank > 0 ? game.steam.rank : null)
    || (game && game.steamRecord && typeof game.steamRecord.rank === 'number' && game.steamRecord.rank > 0 ? game.steamRecord.rank : null);
  return rank || null;
}

// Resolves the edition page's headline market and store rank — matching renderGameRankSummary's hero lead
// (country = pickCountry(rank, home, L); baseStore = ios when cn or iosDays >= androidDays, else android).
// Falls back to the other store in the same headline market if baseStore is off-chart today, then to Steam Most Played.
function resolveHeadlineBadgeRank(game, meta, editionCode = 'en') {
  const code = normalizeEdition(editionCode);
  const home = EDITION_COUNTRY[code];
  const length = meta && Array.isArray(meta.days) ? meta.days.length : 0;
  const rank = game && game.rank;
  const steamRank = currentSteamRank(game);

  if (rank && rank.s && length > 0) {
    const country = pickCountry(rank, home, length);
    const ios = expand(rank.s[country] && rank.s[country].ios, length);
    const android = expand(rank.s[country] && rank.s[country].android, length);
    const useIos = country === 'cn' || nums(ios).length >= nums(android).length;
    const baseStore = useIos ? 'ios' : 'android';
    const otherStore = useIos ? 'android' : 'ios';
    const baseCur = useIos ? ios[length - 1] : android[length - 1];
    const otherCur = useIos ? android[length - 1] : ios[length - 1];

    if (typeof baseCur === 'number' && Number.isFinite(baseCur) && baseCur > 0) {
      return { status: 'ranked', kind: 'mobile', country, store: baseStore, rank: baseCur };
    }
    if (typeof otherCur === 'number' && Number.isFinite(otherCur) && otherCur > 0) {
      return { status: 'ranked', kind: 'mobile', country, store: otherStore, rank: otherCur };
    }
    if (steamRank) {
      return { status: 'ranked', kind: 'steam', country: null, store: 'steam', rank: steamRank };
    }
    return { status: 'unranked', kind: 'mobile', country, store: baseStore, rank: null };
  }

  if (steamRank) {
    return { status: 'ranked', kind: 'steam', country: null, store: 'steam', rank: steamRank };
  }

  const isSteamGame = Boolean(game && (game.steam || game.steamRecord || (Array.isArray(game.platforms) && game.platforms.includes('steam'))));
  return { status: 'unranked', kind: isSteamGame ? 'steam' : 'mobile', country: null, store: isSteamGame ? 'steam' : null, rank: null };
}

function toneFor(resolved) {
  if (resolved.status !== 'ranked') return 'unranked';
  if (resolved.kind === 'steam') return resolved.rank <= 10 ? 'steamTop' : 'steam';
  if (resolved.rank <= 3) return 'top3';
  if (resolved.rank <= 10) return 'top10';
  if (resolved.rank <= 50) return 'top50';
  return 'ranked';
}

function badgeLabel(resolved, editionCode = 'en', gameName = '') {
  const code = normalizeEdition(editionCode);
  const msg = MESSAGES[code];
  let text;
  if (resolved.status === 'ranked') {
    if (resolved.kind === 'steam') {
      text = msg.steam(resolved.rank);
    } else {
      const market = `${msg.countries[resolved.country]} ${msg.stores[resolved.store]}`;
      text = msg.grossing(resolved.rank, market);
    }
  } else if (resolved.kind === 'steam') {
    text = msg.unranked(msg.stores.steam);
  } else {
    const scope = resolved.country ? msg.countries[resolved.country] : '';
    text = msg.unranked(scope);
  }
  const ariaLabel = gameName ? `${gameName} — ${text} (GamerScroll)` : `GamerScroll: ${text}`;
  return { text, ariaLabel, tone: toneFor(resolved) };
}

// Approximate rendered width (px) at 11.5px bold/semibold system sans-serif with safe padding for CJK and Latin.
function estimateTextWidth(text) {
  let w = 0;
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x2e80 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xffef)) {
      w += 12.2;
    } else if (" ilI1.,:;!|'·".includes(ch)) {
      w += 4.3;
    } else if ('mwMW@#%&'.includes(ch)) {
      w += 9.8;
    } else if (cp >= 0x41 && cp <= 0x5a) {
      w += 8.2;
    } else {
      w += 6.9;
    }
  }
  return Math.ceil(w);
}

function badgeDimensions(text) {
  const leftWidth = 106;
  const rightWidth = Math.max(66, estimateTextWidth(text) + 24);
  return { leftWidth, rightWidth, width: leftWidth + rightWidth, height: BADGE_HEIGHT };
}

function renderBadgeSvg({ text, ariaLabel, tone }) {
  const fill = TONE_FILLS[tone] || TONE_FILLS.ranked;
  const { leftWidth, rightWidth, width: totalWidth, height } = badgeDimensions(text);
  const rightCenter = leftWidth + rightWidth / 2;
  const safeTitle = escXml(ariaLabel || `GamerScroll: ${text}`);
  const safeText = escXml(text);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="${safeTitle}">`,
    `<title>${safeTitle}</title>`,
    '<defs>',
    '<linearGradient id="gs-g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient>',
    '<linearGradient id="gs-s" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/><stop offset="100%" stop-color="#000000" stop-opacity="0.08"/></linearGradient>',
    `<clipPath id="gs-r"><rect width="${totalWidth}" height="${height}" rx="6"/></clipPath>`,
    '</defs>',
    '<g clip-path="url(#gs-r)">',
    `<rect width="${leftWidth}" height="${height}" fill="#18181b"/>`,
    `<rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="${fill}"/>`,
    `<rect width="${totalWidth}" height="${height}" fill="url(#gs-s)"/>`,
    `<line x1="${leftWidth}" y1="0" x2="${leftWidth}" y2="${height}" stroke="#ffffff" stroke-opacity="0.15"/>`,
    '</g>',
    `<rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="5.5" fill="none" stroke="#000000" stroke-opacity="0.14"/>`,
    '<g transform="translate(9 7) scale(0.21875)">',
    '<rect x="4" y="26" width="7" height="16" rx="3.5" fill="url(#gs-g)" opacity="0.5"/>',
    '<rect x="14" y="20" width="7" height="28" rx="3.5" fill="url(#gs-g)" opacity="0.78"/>',
    '<rect x="24" y="14" width="7" height="40" rx="3.5" fill="url(#gs-g)"/>',
    '<rect x="33" y="14" width="7" height="40" rx="3.5" fill="url(#gs-g)"/>',
    '<rect x="43" y="20" width="7" height="28" rx="3.5" fill="url(#gs-g)" opacity="0.78"/>',
    '<rect x="53" y="26" width="7" height="16" rx="3.5" fill="url(#gs-g)" opacity="0.5"/>',
    '</g>',
    '<g fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'Hiragino Sans\',\'Noto Sans CJK JP\',\'Malgun Gothic\',\'Microsoft YaHei\',sans-serif" font-size="11.5">',
    '<text x="27" y="18" font-weight="700">GamerScroll</text>',
    `<text x="${rightCenter.toFixed(1)}" y="18" text-anchor="middle" font-weight="600">${safeText}</text>`,
    '</g>',
    '</svg>',
  ].join('');
}

function renderGameBadge(game, meta, editionCode = 'en') {
  const code = normalizeEdition(editionCode);
  const resolved = resolveHeadlineBadgeRank(game, meta, code);
  const gameName = (game && game.names && game.names[code]) || (game && game.name) || '';
  const label = badgeLabel(resolved, code, gameName);
  const { width, height } = badgeDimensions(label.text);
  return { svg: renderBadgeSvg(label), resolved, label, width, height };
}

function badgePath(slug, editionCode = 'en') {
  const code = normalizeEdition(editionCode);
  return `${EDITION_PREFIX[code]}/badge/${encodeURIComponent(slug)}.svg`;
}

function badgeUrl(slug, editionCode = 'en', { absolute = true } = {}) {
  const rel = badgePath(slug, editionCode);
  return absolute ? `${SITE_ORIGIN}${rel}` : rel;
}

function embedSnippets({ slug, editionCode = 'en', pageUrl, altText }) {
  const url = badgeUrl(slug, editionCode, { absolute: true });
  const previewUrl = badgeUrl(slug, editionCode, { absolute: false });
  const safeHref = escXml(pageUrl);
  const safeSrc = escXml(url);
  const safeAltHtml = escXml(altText);
  const safeAltMd = String(altText || '').replace(/([\[\]])/g, '\\$1');
  const html = `<a href="${safeHref}"><img src="${safeSrc}" alt="${safeAltHtml}" height="${BADGE_HEIGHT}"></a>`;
  const markdown = `[![${safeAltMd}](${url})](${pageUrl})`;
  return { previewUrl, badgeUrl: url, html, markdown };
}

module.exports = {
  BADGE_HEIGHT,
  resolveHeadlineBadgeRank,
  badgeLabel,
  badgeDimensions,
  renderBadgeSvg,
  renderGameBadge,
  badgePath,
  badgeUrl,
  embedSnippets,
};
