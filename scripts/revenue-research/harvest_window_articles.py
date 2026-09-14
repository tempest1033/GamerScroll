"""Find published game amounts whose period falls inside the rank archive window.

The monthly harvester owns whole-month figures. This one looks for the shorter
periods the same outlets publish - a named day ("$10.1m on September 5th"), a
week ("first week of September") - because only those can be paired with the
rank archive that starts on 2026-08-02.

Discovery walks the outlet's section indexes, keeps articles published inside the
window, and stores each page with its SHA-256 so a figure can be traced back to
the sentence it came from. Extraction reuses the monthly harvester's name
matching and rejection rules; the period classifier is the new part.

Output is candidates only. Nothing here writes the ledger: a figure becomes a
label after a human reads the quoted sentence and accepts its scope.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

import harvest_monthly_charts as base

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'reports/rank-models/window-articles'

INDEX_PAGES = ([f'https://www.pocketgamer.biz/data/?page={n}' for n in range(1, 6)]
               + [f'https://www.pocketgamer.biz/tags/revenue/?page={n}' for n in range(1, 4)]
               + [f'https://www.pocketgamer.biz/tags/charts/?page={n}' for n in range(1, 4)]
               + [f'https://www.pocketgamer.biz/staff/100270/aaron-astle/?page={n}' for n in range(1, 4)])
# The outlet writes links as relative paths, so reuse the matcher that knows that.
ARTICLE_LINK = base.ARTICLE_LINK
SKIP_SLUG = re.compile(r'^(tags|staff|industry|data|news|subscribe|jobs|events|company|'
                       r'privacy-policy|terms-and-conditions|cookie-policy|about-us)$')

MONTH_NAMES = '|'.join(base.MONTHS)
# "September 5th", "September 5, 2026", "5th September", "on August 31st"
DAY_AFTER = re.compile(
    rf'\b({MONTH_NAMES})\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(20\d{{2}}))?\b', re.I)
DAY_BEFORE = re.compile(
    rf'\b(\d{{1,2}})(?:st|nd|rd|th)\s+(?:of\s+)?({MONTH_NAMES})(?:,?\s+(20\d{{2}}))?\b', re.I)
WEEK_PHRASE = re.compile(
    rf'\b((?:first|second|third|fourth|last|final|opening)\s+week\s+of\s+(?:{MONTH_NAMES})|'
    rf'week\s+(?:of|ending|beginning)\s+(?:{MONTH_NAMES})\s+\d{{1,2}}(?:st|nd|rd|th)?|'
    r'this\s+week|last\s+week|past\s+week|over\s+the\s+week)\b', re.I)
DAY_WORD = re.compile(r'\b(daily|a day|per day|in a single day|on the day|launch day|first day)\b', re.I)
COUNTRY_WORDS = {
    'the us': 'US', 'united states': 'US', 'america': 'US', 'japan': 'JP', 'japanese': 'JP',
    'korea': 'KR', 'south korea': 'KR', 'korean': 'KR', 'china': 'CN', 'chinese': 'CN',
    'taiwan': 'TW', 'germany': 'DE', 'the uk': 'GB', 'united kingdom': 'GB',
}


def published_on(html_text: str) -> str | None:
    match = base.re.search(
        r'(January|February|March|April|May|June|July|August|September|October|November|December)'
        r'\s+(\d{1,2}),\s+(20\d{2})', base.strip_html(html_text))
    if not match:
        return None
    month = base.MONTH_INDEX[match.group(1).lower()]
    return f'{match.group(3)}-{month:02d}-{int(match.group(2)):02d}'


def day_from(sentence: str, article_year: int) -> list[str]:
    """Explicit calendar days named in the sentence, as ISO dates.

    A year written next to the date wins over the article's year. Without that,
    a sentence recalling "December 31st, 2025" inside a 2026 article would be
    filed under 2026 - a wrong period on a row that looks perfectly clean.
    """
    days = []
    for month_name, day, year in DAY_AFTER.findall(sentence):
        days.append((month_name.lower(), int(day), year))
    for day, month_name, year in DAY_BEFORE.findall(sentence):
        days.append((month_name.lower(), int(day), year))
    dates = []
    for month_name, day, year in days:
        month = base.MONTH_INDEX[month_name]
        if 1 <= day <= 31:
            dates.append(f'{int(year) if year else article_year}-{month:02d}-{day:02d}')
    return sorted(set(dates))


def geography_of(sentence: str) -> str:
    # Word boundaries rather than surrounding spaces: a country at the end of a
    # sentence is followed by a full stop, and padding with spaces misses it, which
    # would let a two-country sentence pass as if it named only the first one.
    lowered = sentence.lower()
    hits = {code for phrase, code in COUNTRY_WORDS.items()
            if re.search(rf'(?<![a-z]){re.escape(phrase)}(?![a-z])', lowered)}
    if len(hits) == 1:
        return hits.pop()
    return 'WW' if not hits else 'ambiguous'


def classify(sentence: str, article_date: str) -> tuple[str, dict]:
    """Period kind for an amount in this sentence, with the evidence that decided it."""
    days = day_from(sentence, int(article_date[:4]))
    week = WEEK_PHRASE.search(sentence)
    if len(days) == 1 and DAY_WORD.search(sentence):
        return 'day', {'date': days[0], 'evidence': 'explicit date with a daily spend phrase'}
    if len(days) == 1 and not week:
        return 'day_unconfirmed', {'date': days[0], 'evidence': 'explicit date, no daily phrase'}
    if week and not days:
        return 'week', {'phrase': week.group(1), 'evidence': 'week phrase without explicit dates'}
    if week and days:
        return 'week', {'phrase': week.group(1), 'dates': days,
                        'evidence': 'week phrase alongside dates'}
    if len(days) > 1:
        return 'multi_day', {'dates': days, 'evidence': 'several dates in one sentence'}
    return 'unresolved', {'evidence': 'no period expression in the sentence'}


def reject_flags(sentence: str, match: re.Match, several: bool) -> list[str]:
    """The monthly harvester's rejection rules, minus the not-monthly one."""
    flags = []
    if not base.MONEY_WORDS.search(sentence):
        flags.append('no_money_word')
    if base.DOWNLOAD_WORDS.search(sentence):
        flags.append('downloads_axis' if not base.MONEY_WORDS.search(sentence) else 'mixed_axis')
    if base.PUBLISHER_WORDS.search(sentence):
        flags.append('publisher_or_aggregate')
    if base.VALUATION_WORDS.search(sentence):
        flags.append('not_revenue')
    if base.SEPARATION_WORDS.search(sentence):
        flags.append('difference_not_level')
    if base.STORE_SPECIFIC.search(sentence):
        flags.append('store_specific')
    if base.THRESHOLD_BEFORE.search(sentence[:match.start()]):
        flags.append('threshold_not_amount')
    if several:
        flags.append('multi_amount_sentence')
    return flags


def extract(url: str, html_text: str, names: dict[str, str], publishers: dict[str, str],
            article_date: str) -> list[dict]:
    text = base.strip_html(html_text)
    merged = dict(names)
    merged.update(base.article_tag_names(html_text))
    # A name can only match a sentence if it is somewhere in the article, so the
    # dictionary is narrowed once per article instead of being walked per sentence.
    # The narrowed set is a superset of every possible sentence match, so the result
    # is unchanged; only the work is.
    article_flat = base.normalise(text)
    merged = {lowered: canonical for lowered, canonical in merged.items()
              if base.normalise(lowered) in article_flat}
    article_year = int(article_date[:4])
    rows: list[dict] = []
    subject: str | None = None
    subject_age = 99
    for sentence in base.sentences(text):
        named = base.find_games(sentence, merged)
        if len(named) == 1:
            subject, subject_age = named[0], 0
        elif named:
            subject, subject_age = None, 99
        else:
            subject_age += 1
        matches = list(base.AMOUNT.finditer(sentence))
        if not matches:
            continue
        names_publisher = bool(base.find_games(sentence, publishers)) if publishers else False
        if len(named) == 1:
            game, attribution = named[0], 'in_sentence'
        elif (not named and subject and subject_age <= 3 and not names_publisher
              and base.carry_is_safe(sentence, subject)):
            game, attribution = subject, 'carried'
        else:
            continue
        kind, evidence = classify(sentence, article_date)
        geography = geography_of(sentence)
        # An article cannot report a day that had not happened when it was published.
        dated_after = (evidence.get('date') or '') > article_date
        for match in matches:
            flags = reject_flags(sentence, match, len(matches) > 1)
            if dated_after:
                flags.append('date_after_publication')
            if attribution == 'carried':
                flags.append('carried_subject')
            if geography == 'ambiguous':
                flags.append('ambiguous_geography')
            rows.append({
                'game': game,
                'attribution': attribution,
                'amount_usd_m': base.amount_millions(match.group(1), match.group(2)),
                'period_kind': kind,
                'period_evidence': evidence,
                'geography': geography,
                'article_published_on': article_date,
                'flags': flags,
                'keep': not flags and kind in {'day', 'week'},
                'sentence': sentence,
                'source_url': url,
            })
    return rows


def discover(window: tuple[str, str], hops: int, pause: float) -> dict[str, str]:
    """Article URLs published inside the window, with their publication dates."""
    base.CACHE = CACHE
    seen: dict[str, str | None] = {}
    frontier: list[str] = []
    for url in INDEX_PAGES:
        status, html_text = base.fetch(url)
        if status != 200:
            continue
        for slug in ARTICLE_LINK.findall(html_text):
            if SKIP_SLUG.match(slug):
                continue
            link = f'https://www.pocketgamer.biz/{slug}/'
            if link not in seen:
                seen[link] = None
                frontier.append(link)
        time.sleep(pause)
    in_window: dict[str, str] = {}
    for _ in range(hops):
        next_frontier: list[str] = []
        for link in frontier:
            status, html_text, _ = base.cached_fetch(link)
            if status != 200 or not html_text:
                continue
            date = published_on(html_text)
            seen[link] = date
            if date and window[0] <= date <= window[1]:
                in_window[link] = date
                for slug in ARTICLE_LINK.findall(html_text):
                    if SKIP_SLUG.match(slug):
                        continue
                    neighbour = f'https://www.pocketgamer.biz/{slug}/'
                    if neighbour not in seen:
                        seen[neighbour] = None
                        next_frontier.append(neighbour)
            time.sleep(pause)
        frontier = next_frontier
        if not frontier:
            break
    return in_window


def cached_articles(window: tuple[str, str], require: str = '') -> dict[str, str]:
    """In-window articles already stored locally, with no network access.

    Discovery over a news index is unbounded: it keeps finding older articles and
    the walk can outlast the time available for it. Everything it fetched is on
    disk, so extraction is offered as its own pass that always terminates.
    """
    in_window: dict[str, str] = {}
    for path in sorted(CACHE.glob('*.html')):
        html_text = path.read_text(encoding='utf-8', errors='ignore')
        # Name matching is the expensive part, so an article that never cites the data
        # provider is dropped before it reaches the extractor rather than after.
        if require and require.lower() not in html_text.lower():
            continue
        date = published_on(html_text)
        if date and window[0] <= date <= window[1]:
            in_window[f'https://www.pocketgamer.biz/{path.stem}/'] = date
    return in_window


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dictionary',
                        default='reports/rank-models/sustained-rank-observations-2026-09-11/'
                                'session-F5mbni/collector-output/apps.json')
    parser.add_argument('--start', default='2026-08-02')
    parser.add_argument('--end', default='2026-09-11')
    parser.add_argument('--hops', type=int, default=2)
    parser.add_argument('--offline', action='store_true',
                        help='extract from already cached articles instead of crawling')
    parser.add_argument('--require', default='appmagic',
                        help='offline only: skip cached pages that never mention this provider')
    parser.add_argument('--pause', type=float, default=0.2)
    parser.add_argument('--output', default='reports/rank-models/window-article-harvest-2026-09-12.json')
    arguments = parser.parse_args()

    base.CACHE = CACHE
    CACHE.mkdir(parents=True, exist_ok=True)
    window = (arguments.start, arguments.end)
    articles = (cached_articles(window, arguments.require) if arguments.offline
                else discover(window, arguments.hops, arguments.pause))

    names = base.load_game_names(ROOT / arguments.dictionary)
    publishers = base.load_publisher_names(ROOT / arguments.dictionary)
    records, rows = [], []
    for url, date in sorted(articles.items()):
        status, html_text, path = base.cached_fetch(url)
        if status != 200 or not html_text:
            records.append({'url': url, 'status': status, 'rows': 0})
            continue
        extracted = extract(url, html_text, names, publishers, date)
        rows.extend(extracted)
        records.append({
            'url': url, 'status': status, 'published_on': date,
            'sha256': hashlib.sha256(html_text.encode('utf-8')).hexdigest(),
            'cached': str(path.relative_to(ROOT)) if path else None,
            'rows': len(extracted), 'kept': sum(1 for row in extracted if row['keep']),
        })

    payload = {
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'window': {'start': arguments.start, 'end': arguments.end},
        'rank_archive_note': 'Only periods inside the window can be paired with archived ranks.',
        'dictionary': arguments.dictionary,
        'articles': records,
        'row_count': len(rows),
        'rows': rows,
    }
    output = ROOT / arguments.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    kinds: dict[str, int] = {}
    for row in rows:
        kinds[row['period_kind']] = kinds.get(row['period_kind'], 0) + 1
    print(json.dumps({'articles_in_window': len(articles), 'rows': len(rows),
                      'kept': sum(1 for row in rows if row['keep']), 'by_period_kind': kinds,
                      'output': arguments.output}))


if __name__ == '__main__':
    main()
