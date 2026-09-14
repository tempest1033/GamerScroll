"""Harvest published monthly game revenue figures from provider chart articles.

Store ranks cannot be recovered retroactively, but published monthly amounts can.
This fetches the provider's monthly chart write-ups, caches the raw HTML with a
hash, and extracts every sentence that states a game name together with a USD
amount, keeping the sentence verbatim so a human can check the reading.

Extraction is deliberately conservative: a candidate needs a currency amount and
a game name that already exists in the collected store dictionary or in the
article's own tag list. Nothing is written into the anchor ledger here; the
output is a review file. Research only.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'reports/rank-models/monthly-chart-articles'
UA = 'Mozilla/5.0 (GamerScroll research harvester)'

MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
          'august', 'september', 'october', 'november', 'december']
MONTH_INDEX = {name: number for number, name in enumerate(MONTHS, start=1)}


def fetch(url: str, timeout: int = 25) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as error:
        return error.code, ''
    except Exception:  # network failures stay visible as status 0
        return 0, ''


def cached_fetch(url: str, refresh: bool = False) -> tuple[int, str, Path | None]:
    """Preserve UTF-8 page-text bytes so cache hits keep the fetched digest."""
    CACHE.mkdir(parents=True, exist_ok=True)
    slug = url.rstrip('/').split('/')[-1]
    path = CACHE / f'{slug}.html'
    if path.exists() and not refresh:
        return 200, path.read_bytes().decode('utf-8'), path
    status, html = fetch(url)
    if status == 200 and html:
        path.write_bytes(html.encode('utf-8'))
        return status, html, path
    return status, html, None


def strip_html(html_text: str) -> str:
    # Normalize parser text, not preserved source bytes or their digest.
    html_text = html_text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'(?is)<(script|style|nav|footer)[^>]*>.*?</\1>', ' ', html_text)
    text = re.sub(r'(?is)<br\s*/?>', ' ', text)
    text = re.sub(r'(?is)</(p|h[1-6]|li|div|tr)>', '\n', text)
    text = re.sub(r'(?s)<[^>]+>', ' ', text)
    text = html.unescape(text)
    return re.sub(r'[ \t]+', ' ', text)


AMOUNT = re.compile(r'\$\s?([0-9]+(?:\.[0-9]+)?)\s?(m|million|bn|billion)\b', re.I)
RANK_WORDS = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
              'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10}
ORDINAL = re.compile(r'\b(\d{1,3})(?:st|nd|rd|th)\b')


def amount_millions(value: str, unit: str) -> float:
    number = float(value)
    return number * 1000 if unit.lower() in {'bn', 'billion'} else number


def sentences(text: str) -> list[str]:
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z\u201c])|\n+', text)
    return [' '.join(part.split()) for part in parts if part and part.strip()]


GENERIC_TAGS = {'charts', 'revenue', 'downloads', 'top charts', 'data', 'news',
                'mobile', 'ios', 'android', 'app store', 'google play', 'china',
                'japan', 'korea', 'interview', 'esports', 'funding'}


def load_game_names(dictionary_path: Path) -> dict[str, str]:
    """Map a lowercase game name to its canonical name from the chart dictionary.

    The collector writes {"aos:package": {"t": title, "d": developer}}.
    """
    names: dict[str, str] = {}
    if not dictionary_path.exists():
        return names
    payload = json.loads(dictionary_path.read_text(encoding='utf-8'))
    entries = payload.get('apps', payload) if isinstance(payload, dict) else payload
    iterator = entries.values() if isinstance(entries, dict) else entries
    for entry in iterator:
        if not isinstance(entry, dict):
            continue
        name = entry.get('t') or entry.get('name') or entry.get('title')
        if isinstance(name, str):
            name = name.split(':')[0].split(' - ')[0].strip()
            if len(name) >= 4:
                names.setdefault(name.lower(), name)
    return names


def load_publisher_names(dictionary_path: Path) -> dict[str, str]:
    """Developer names from the same dictionary, used to reject publisher figures."""
    names: dict[str, str] = {}
    if not dictionary_path.exists():
        return names
    payload = json.loads(dictionary_path.read_text(encoding='utf-8'))
    entries = payload.get('apps', payload) if isinstance(payload, dict) else payload
    iterator = entries.values() if isinstance(entries, dict) else entries
    for entry in iterator:
        if isinstance(entry, dict):
            developer = entry.get('d') or entry.get('developer')
            if isinstance(developer, str) and len(developer) >= 4:
                names.setdefault(developer.lower(), developer)
    return names


def article_tag_names(html_text: str) -> dict[str, str]:
    names: dict[str, str] = {}
    for slug in re.findall(r'href=[^>]{0,8}[^"\' >]*tags/([a-z0-9-]+)/', html_text):
        pretty = slug.replace('-', ' ')
        if len(pretty) >= 4 and pretty not in GENERIC_TAGS:
            names.setdefault(pretty, pretty)
    return names


GENERIC_TOKENS = {'the', 'a', 'an', 'game', 'games', 'mobile', 'app', 'apps', 'play',
                  'puzzle', 'new', 'best', 'top', 'world', 'story', 'fun', 'run',
                  'free', 'online', 'legend', 'legends', 'hero', 'heroes', 'idle',
                  'master', 'craft', 'simulator', 'clicker', 'party', 'city', 'life',
                  'war', 'battle', 'super', 'pro', 'plus', 'hd', 'x', 'go', 'of', 'and'}


def normalise(text: str) -> str:
    decomposed = unicodedata.normalize('NFKD', text.lower().replace('\u2019', "'"))
    ascii_text = ''.join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+', ' ', ascii_text).strip()


def specific_enough(key: str) -> bool:
    """Reject names that collapse to everyday words once normalised."""
    tokens = key.split()
    if not tokens or len(key) < 6:
        return False
    if all(token in GENERIC_TOKENS for token in tokens):
        return False
    return len(tokens) >= 2 or len(key) >= 5


def find_games(sentence: str, names: dict[str, str]) -> list[str]:
    flat = normalise(sentence)
    found = []
    for lowered, canonical in names.items():
        key = normalise(lowered)
        if not specific_enough(key):
            continue
        if re.search(rf'(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])', flat):
            found.append((key, canonical))
    # Drop names contained in a longer match (Pokemon Go vs Pokemon Go Plus).
    return [canonical for key, canonical in found
            if not any(key != other_key and key in other_key for other_key, _ in found)]


MONEY_WORDS = re.compile(
    r'\b(spend|spends|spending|revenue|revenues|grossing|gross|earn|earned|earnings|'
    r'made|make|makes|generat\w+|raking|raked|accrued|hit|hitting|reach\w+|totall?\w*|'
    r'picked up|picking up|pulled in|brought in|took in)\b', re.I)
DOWNLOAD_WORDS = re.compile(r'\b(download|downloads|install|installs|users|players joined)\b', re.I)
DAILY_WORDS = re.compile(r'\b(daily|a day|on the \d{1,2}(?:st|nd|rd|th)|lifetime|per day|first day|launch day)\b', re.I)
PUBLISHER_WORDS = re.compile(r'\b(publisher|publishers|portfolio|combin\w+|collectively|across all|the pair|overall)\b', re.I)
VALUATION_WORDS = re.compile(r'\b(valu\w+|acquisition|acquir\w+|investment|invest\w+|raised|stake|worth|deal)\b', re.I)
MONTH_MENTION = re.compile(r'\b(' + '|'.join(MONTHS) + r')\b', re.I)
YEAR_ONLY = re.compile(r'\b(?:in|during|across|for)\s+(20\d{2})\b', re.I)
ATTACHED_MONTH = re.compile(r'[^.]{0,12}?\b(?:in|for|during|through|this|last)\s+('
                            + '|'.join(MONTHS) + r')\b', re.I)
SEPARATION_WORDS = re.compile(r'\b(separated by|difference|gap of|short of|margin|ahead by|behind by|apart)\b', re.I)
THRESHOLD_BEFORE = re.compile(r'\b(above|over|more than|beyond|under|below|less than|nearly|almost|around|about|up to)\s*$', re.I)
TITLE_CASE_PHRASE = re.compile(r'\b([A-Z][\w\u00c0-\uffff\']*(?:\s+(?:of|the|and|[A-Z][\w\u00c0-\uffff\']*)){1,4})')


def month_reference(sentence: str, article_month: tuple[int, int],
                    position: int | None = None) -> tuple[str, str, str]:
    """Return (period_start, period_end, basis) for the month an amount refers to.

    When a sentence names several months ("fell from January to February to $111m")
    the month closest to the amount wins, because the provider writes the period
    next to the figure. Distance is measured from the end of the amount first.
    """
    article_year, article_index = article_month
    mentions = [(match.start(), MONTH_INDEX[match.group(1).lower()])
                for match in MONTH_MENTION.finditer(sentence)]
    if not mentions:
        return (f'{article_year}-{article_index:02d}-01',
                month_end(article_year, article_index), 'article_month')

    distinct = sorted({month for _, month in mentions})
    if len(distinct) == 1:
        month, basis_kind = distinct[0], 'single_mention'
    elif position is None:
        return (f'{article_year}-{article_index:02d}-01',
                month_end(article_year, article_index), 'ambiguous')
    else:
        # "made $83m in August" attaches the month right after the figure; anything
        # further away is a comparison, so the month stated before the figure wins.
        trailing = ATTACHED_MONTH.match(sentence[position:position + 30])
        before = [(position - start, month) for start, month in mentions if start < position]
        nearest_before = min(before, default=None)
        if trailing:
            month, basis_kind = MONTH_INDEX[trailing.group(1).lower()], 'attached_after'
        elif nearest_before and nearest_before[0] <= 160:
            month, basis_kind = nearest_before[1], 'nearest_before'
        else:
            return (f'{article_year}-{article_index:02d}-01',
                    month_end(article_year, article_index), 'ambiguous')

    year = article_year if month <= article_index else article_year - 1
    year_match = YEAR_ONLY.search(sentence)
    if year_match:
        stated = int(year_match.group(1))
        if stated <= article_year:
            year = stated
    basis = 'article_month' if (month == article_index and year == article_year) else basis_kind
    return f'{year}-{month:02d}-01', month_end(year, month), basis


CAPITALISED = re.compile(r'\b([A-Z][A-Za-z0-9\u00c0-\uffff\']{2,})')
CARRY_OPENERS = re.compile(
    r'^(it|its|the (?:game|title|app|studio|developer|series|sequel|franchise)|player spending|'
    r'revenue|spending|that|this|those|these|by|in|alongside|meanwhile|overall|monthly|'
    r'on a|with|of the|after|despite|even)\b', re.I)
STORE_SPECIFIC = re.compile(r'\b(app store|google play|ios|android)\b[^.]{0,30}\b(version|only|alone|side|half)\b', re.I)
CARRY_SAFE_CAPITALS = {'appmagic', 'app', 'store', 'google', 'play', 'ios', 'android',
                       'us', 'uk', 'eu', 'china', 'japan', 'korea', 'taiwan', 'usa',
                       'm', 'y', 'monthly', 'revenue'}


def carry_is_safe(sentence: str, subject: str) -> bool:
    """Only carry a subject into a sentence that names no other company or title.

    A pronoun sentence ("It made just $19.6m last month") is safe; a sentence that
    introduces another proper noun ("In third was UGC platform Roblox") is not.
    """
    if not CARRY_OPENERS.match(sentence.strip()):
        return False
    subject_key = normalise(subject)
    subject_tokens = set(subject_key.split())
    for word in CAPITALISED.findall(sentence):
        key = normalise(word)
        if not key or key in subject_key or key in subject_tokens:
            continue
        if key in MONTH_INDEX or key in CARRY_SAFE_CAPITALS or key in GENERIC_TOKENS:
            continue
        return False
    return True


def extract(url: str, html_text: str, names: dict[str, str], period: tuple[str, str],
            publishers: dict[str, str] | None = None) -> list[dict]:
    text = strip_html(html_text)
    merged = dict(names)
    merged.update(article_tag_names(html_text))
    publishers = publishers or {}
    article_year = int(period[0][:4])
    article_index = int(period[0][5:7])
    rows: list[dict] = []
    subject: str | None = None
    subject_age = 99
    for sentence in sentences(text):
        named = find_games(sentence, merged)
        if len(named) == 1:
            subject, subject_age = named[0], 0
        elif named:
            subject, subject_age = None, 99
        else:
            subject_age += 1
        matches = list(AMOUNT.finditer(sentence))
        if not matches:
            continue
        names_publisher = bool(find_games(sentence, publishers)) if publishers else False
        if len(named) == 1:
            game, attribution = named[0], 'in_sentence'
        elif (not named and subject and subject_age <= 3 and not names_publisher
              and carry_is_safe(sentence, subject)):
            game, attribution = subject, 'carried'
        else:
            continue
        is_money = bool(MONEY_WORDS.search(sentence))
        is_download = bool(DOWNLOAD_WORDS.search(sentence))
        flags = []
        if not is_money:
            flags.append('no_money_word')
        if is_download and not is_money:
            flags.append('downloads_axis')
        if is_download and is_money:
            flags.append('mixed_axis')
        if DAILY_WORDS.search(sentence):
            flags.append('not_monthly')
        if PUBLISHER_WORDS.search(sentence) or (names_publisher and attribution == 'carried'):
            flags.append('publisher_or_aggregate')
        if VALUATION_WORDS.search(sentence):
            flags.append('not_revenue')
        if SEPARATION_WORDS.search(sentence):
            flags.append('difference_not_level')
        if STORE_SPECIFIC.search(sentence):
            flags.append('store_specific')
        months_in_sentence = {MONTH_INDEX[name.lower()] for name in MONTH_MENTION.findall(sentence)}
        if len(matches) > 1 and len(months_in_sentence) < 2:
            flags.append('multi_amount_same_month')
        year_only = YEAR_ONLY.search(sentence)
        if year_only and not MONTH_MENTION.search(sentence):
            flags.append('not_monthly')
        ranks = [int(value) for value in ORDINAL.findall(sentence)]
        for word, value in RANK_WORDS.items():
            if re.search(rf'\b{word}\b', sentence, re.I):
                ranks.append(value)
        for match in matches:
            start, end, month_basis = month_reference(
                sentence, (article_year, article_index), position=match.end())
            row_flags = list(flags)
            if month_basis == 'ambiguous':
                row_flags.append('ambiguous_month')
            if THRESHOLD_BEFORE.search(sentence[:match.start()]):
                row_flags.append('threshold_not_amount')
            if attribution == 'carried':
                row_flags.append('carried_subject')
            rows.append({
                'game': game,
                'attribution': attribution,
                'amount_usd_m': amount_millions(match.group(1), match.group(2)),
                'period_start': start,
                'period_end': end,
                'month_basis': month_basis,
                'article_period_start': period[0],
                'stated_ranks': sorted(set(ranks)),
                'flags': row_flags,
                'keep': not [flag for flag in row_flags if flag != 'carried_subject'],
                'sentence': sentence,
                'source_url': url,
            })
    return rows


MARKET_SUBJECT = re.compile(r'\b(mobile games|all mobile games|games|the market|mobile game market)\b', re.I)
MARKET_VERB = re.compile(r'\b(generated|made|grossed|totall?\w*|brought in|accounted for)\b', re.I)


def extract_market_totals(url: str, html_text: str, period: tuple[str, str],
                          names: dict[str, str]) -> list[dict]:
    """Whole-market monthly spend, which the fit uses as a constraint.

    Only sentences about games in aggregate qualify, and a sentence naming any
    single game is rejected so a big title is never read as the market.
    """
    text = strip_html(html_text)
    article_year, article_index = int(period[0][:4]), int(period[0][5:7])
    rows = []
    for sentence in sentences(text):
        matches = list(AMOUNT.finditer(sentence))
        if len(matches) != 1 or not MARKET_SUBJECT.search(sentence) or not MARKET_VERB.search(sentence):
            continue
        if find_games(sentence, names) or DOWNLOAD_WORDS.search(sentence):
            continue
        amount = amount_millions(matches[0].group(1), matches[0].group(2))
        if amount < 1000:  # a monthly world total is billions; smaller figures are segments
            continue
        start, end, basis = month_reference(sentence, (article_year, article_index),
                                            position=matches[0].end())
        rows.append({'metric': 'market_total', 'amount_usd_m': amount,
                     'period_start': start, 'period_end': end, 'month_basis': basis,
                     'article_period_start': period[0], 'sentence': sentence,
                     'source_url': url, 'keep': basis != 'ambiguous'})
    return rows


def month_end(year: int, month: int) -> str:
    if month == 12:
        return f'{year}-12-31'
    import calendar
    return f'{year}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}'


ARTICLE_LINK = re.compile(r'href="(?:https://www\.pocketgamer\.biz)?/?([a-z0-9][a-z0-9-]{6,})/"')
MONTHLY_SLUG = re.compile(r'^(' + '|'.join(MONTHS) + r')-(\d{4})-mobile-game-charts(?:-[a-z0-9-]+)?$')
INDEX_PAGES = ([f'https://www.pocketgamer.biz/tags/charts/?page={n}' for n in range(1, 5)]
               + [f'https://www.pocketgamer.biz/data/?page={n}' for n in range(1, 8)]
               + [f'https://www.pocketgamer.biz/staff/100270/aaron-astle/?page={n}' for n in range(1, 8)])


def monthly_urls(html_text: str) -> set[str]:
    return {f'https://www.pocketgamer.biz/{slug}/'
            for slug in ARTICLE_LINK.findall(html_text) if MONTHLY_SLUG.match(slug)}


def discover(seed_urls: list[str], hops: int = 30) -> list[str]:
    """Find monthly chart articles from the section indexes, then walk their links.

    Each write-up links to neighbouring months, so following those links reaches
    months that no index page still lists.
    """
    found: dict[str, None] = {url: None for url in seed_urls}
    frontier = list(seed_urls)
    for url in INDEX_PAGES:
        status, html_text = fetch(url)
        if status != 200 or not html_text:
            continue
        for link in monthly_urls(html_text):
            if link not in found:
                found[link] = None
                frontier.append(link)
        time.sleep(0.2)
    for _ in range(hops):
        next_frontier = []
        for url in frontier:
            status, html_text, _ = cached_fetch(url)
            if status != 200:
                continue
            for link in monthly_urls(html_text):
                if link not in found:
                    found[link] = None
                    next_frontier.append(link)
            time.sleep(0.2)
        frontier = next_frontier
        if not frontier:
            break
    return list(found)


def period_for(url: str) -> tuple[str, str] | None:
    match = re.search(r'/([a-z]+)-(\d{4})-', url)
    if not match:
        return None
    month = MONTH_INDEX.get(match.group(1))
    if not month:
        return None
    year = int(match.group(2))
    return f'{year}-{month:02d}-01', month_end(year, month)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dictionary',
                        default='reports/rank-models/sustained-rank-observations-2026-09-11/session-F5mbni/collector-output/apps.json')
    parser.add_argument('--output', default='reports/rank-models/monthly-chart-harvest-2026-09-11.json')
    parser.add_argument('--refresh', action='store_true')
    arguments = parser.parse_args()

    seeds = [f'https://www.pocketgamer.biz/{month}-{year}-mobile-game-charts/'
             for year in (2026,) for month in ('january', 'june', 'july', 'august')]
    urls = discover(seeds)

    names = load_game_names(ROOT / arguments.dictionary)
    publishers = load_publisher_names(ROOT / arguments.dictionary)
    articles = []
    rows: list[dict] = []
    market_rows: list[dict] = []
    for url in sorted(urls):
        period = period_for(url)
        if not period:
            continue
        status, html_text, path = cached_fetch(url, refresh=arguments.refresh)
        if status != 200 or not html_text:
            articles.append({'url': url, 'status': status, 'rows': 0})
            continue
        extracted = extract(url, html_text, names, period, publishers)
        rows.extend(extracted)
        market_rows.extend(extract_market_totals(url, html_text, period, names))
        articles.append({
            'url': url,
            'status': status,
            'period_start': period[0],
            'sha256': hashlib.sha256(html_text.encode('utf-8')).hexdigest(),
            'cached': str(path.relative_to(ROOT)) if path else None,
            'rows': len(extracted),
        })

    output = ROOT / arguments.output
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'dictionary': arguments.dictionary,
        'articles': articles,
        'row_count': len(rows),
        'months': sorted({row['period_start'] for row in rows}),
        'rows': rows,
        'market_total_rows': market_rows,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'articles': len(articles), 'ok_articles': sum(1 for a in articles if a['status'] == 200),
                      'rows': len(rows), 'market_totals': sum(1 for row in market_rows if row['keep']),
                      'months': payload['months'], 'output': arguments.output}))


if __name__ == '__main__':
    main()
