/**
 * X(Twitter) search wrapper — uses the same OAuth 1.0a credentials as
 * post-article-to-x.js (.env: X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN /
 * X_ACCESS_SECRET). Internally derives an App-only Bearer for read-only
 * search/recent calls; no User Context required.
 *
 * CLI:
 *   node search-x.js "<query>" [--max N] [--lang ko|en] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--out file.json] [--sort recency|relevancy]
 *
 * Examples:
 *   node search-x.js "GPT-5.5 Codex" --max 20 --lang en
 *   node search-x.js "from:OpenAIDevs codex" --since 2026-05-09
 *   node search-x.js "코덱스 OR 그록" --lang ko --out tweets.json
 *
 * Output:
 *   - default: stdout markdown — easy for an LLM/Lead to consume
 *   - --out <file>: full JSON dump (preserves all tweet fields)
 *
 * Rate limit: ~450 req / 15-min window (App-only Bearer, paid plan).
 */

const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');

function loadDotenv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotenv();

// Default language filter — when --lang is omitted we still keep posts to
// English + Korean so article research surfaces both audiences without manual
// merge. Pass --lang en or --lang ko (or --lang any) to override.
const DEFAULT_LANGS = ['en', 'ko'];

function parseArgs(argv) {
  const opts = { max: 100, sort: 'recency' };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // X API v2 search/recent enforces 10 <= max_results <= 100. Default to
    // the upper bound so a single call surfaces as much as the endpoint allows.
    if (a === '--max') opts.max = Math.max(10, Math.min(100, Number(argv[++i]) || 100));
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--until') opts.until = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--sort') opts.sort = argv[++i] === 'relevancy' ? 'relevancy' : 'recency';
    else if (!a.startsWith('--')) positional.push(a);
  }
  opts.query = positional.join(' ').trim();
  return opts;
}

function resolveLangs(opts) {
  if (!opts.lang) return DEFAULT_LANGS;
  if (opts.lang === 'any' || opts.lang === 'all') return null;
  return [opts.lang];
}

function buildQuery(opts) {
  const parts = [opts.query];
  const langs = resolveLangs(opts);
  // X v2 query parser accepts grouped OR on lang operators inside a single
  // call, so we encode the default ko/en filter at the API level instead of
  // post-filtering client-side. Saves quota and keeps result_count honest.
  if (langs) {
    parts.push(langs.length === 1 ? `lang:${langs[0]}` : '(' + langs.map(l => 'lang:' + l).join(' OR ') + ')');
  }
  if (opts.since) parts.push(`since:${opts.since}`);
  if (opts.until) parts.push(`until:${opts.until}`);
  parts.push('-is:retweet');
  return parts.join(' ');
}

function renderMarkdown(tweets, query) {
  const lines = [];
  lines.push(`# X search: \`${query}\``);
  lines.push(`Returned: ${tweets.length} posts`);
  lines.push('');
  for (const t of tweets) {
    const m = t.public_metrics || {};
    lines.push(`### @${t.author_id} — ${t.created_at}`);
    lines.push(`https://x.com/i/status/${t.id}`);
    lines.push(`likes ${m.like_count ?? 0} · RT ${m.retweet_count ?? 0} · reply ${m.reply_count ?? 0} · views ${m.impression_count ?? 0}`);
    lines.push('');
    lines.push((t.text || '').trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.query) {
    console.error('Usage: node search-x.js "<query>" [--max N] [--lang ko|en] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--out file.json] [--sort recency|relevancy]');
    process.exit(1);
  }
  const required = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[search-x] missing env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  });

  const query = buildQuery(opts);
  const result = await client.v2.search(query, {
    max_results: opts.max,
    sort_order: opts.sort,
    'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'lang'],
  });

  // Pull only the first page. The paginator's `for await` would chase further
  // pages and on a quiet keep-alive socket can stall the event loop until
  // SIGTERM. One call = up to 100 posts is already the API ceiling per
  // request, so a single page covers the "as many as possible" intent.
  const tweets = Array.isArray(result?.tweets) ? result.tweets : (result?.data?.data || []);

  if (opts.out) {
    fs.writeFileSync(opts.out, JSON.stringify({ query, tweets }, null, 2), 'utf-8');
    console.error(`[search-x] wrote ${tweets.length} tweets → ${opts.out}`);
    return;
  }

  process.stdout.write(renderMarkdown(tweets, query));
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('[search-x] error:', e?.message || e);
    if (e?.data) console.error(JSON.stringify(e.data, null, 2));
    process.exit(1);
  });
