#!/usr/bin/env python3
"""
GamersCrawl 일간 리포트 썸네일 검증 및 수정 스크립트

작업:
1. ai.issues, ai.industryIssues, ai.metrics 섹션에서 thumbnail 필드 확인
2. thumbnail이 없거나 null/빈문자열인 항목 찾기
3. news 섹션에서 제목 키워드 매칭으로 thumbnail URL 찾아서 채우기
4. 빈 문자열은 null로 변경
"""

import json
import os
import re
from typing import Optional, Dict, List, Any

def is_valid_thumbnail(url: Optional[str]) -> bool:
    """썸네일 URL이 유효한지 확인"""
    if url is None or url == "":
        return False
    # http/https로 시작하거나 //로 시작하는 경우 유효
    if url.startswith("http://") or url.startswith("https://") or url.startswith("//"):
        return True
    return False

def extract_keywords(title: str) -> List[str]:
    """제목에서 검색용 키워드 추출"""
    # 특수문자 제거 및 소문자화
    clean_title = re.sub(r'[^\w\s가-힣]', ' ', title)
    # 공백으로 분리
    words = clean_title.split()
    # 2글자 이상인 단어만 추출
    keywords = [w for w in words if len(w) >= 2]
    return keywords

def find_thumbnail_from_news(title: str, news_sources: Dict[str, List[Dict]]) -> Optional[str]:
    """뉴스 섹션에서 제목과 매칭되는 썸네일 찾기"""
    keywords = extract_keywords(title)
    if not keywords:
        return None

    best_match = None
    best_score = 0

    for source_name, articles in news_sources.items():
        for article in articles:
            article_title = article.get('title', '')
            article_thumbnail = article.get('thumbnail')

            if not is_valid_thumbnail(article_thumbnail):
                continue

            # 키워드 매칭 점수 계산
            score = 0
            for keyword in keywords:
                if keyword in article_title:
                    score += 1

            # 더 높은 점수를 가진 매칭 찾기
            if score > best_score and score >= 2:  # 최소 2개 키워드 매칭
                best_score = score
                best_match = article_thumbnail

    return best_match

def process_file(filepath: str) -> Dict[str, Any]:
    """파일 처리 및 결과 반환"""
    result = {
        'filename': os.path.basename(filepath),
        'issues_checked': 0,
        'issues_fixed': 0,
        'industry_issues_checked': 0,
        'industry_issues_fixed': 0,
        'metrics_checked': 0,
        'metrics_fixed': 0,
        'empty_to_null': 0,
        'details': []
    }

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    modified = False

    # news 섹션 수집
    news_sources = {}
    if 'news' in data:
        for source in ['inven', 'ruliweb', 'gamemeca', 'thisisgame']:
            if source in data['news']:
                news_sources[source] = data['news'][source]

    # ai 섹션 처리
    if 'ai' in data:
        ai = data['ai']

        # ai.issues 처리
        if 'issues' in ai:
            for i, issue in enumerate(ai['issues']):
                result['issues_checked'] += 1
                title = issue.get('title', '')
                thumbnail = issue.get('thumbnail')

                # 빈 문자열을 null로 변경
                if thumbnail == "":
                    issue['thumbnail'] = None
                    result['empty_to_null'] += 1
                    modified = True
                    result['details'].append(f"[issues #{i+1}] 빈 문자열 -> null: {title[:30]}...")
                    thumbnail = None

                # 유효하지 않은 썸네일 처리
                if not is_valid_thumbnail(thumbnail):
                    found_thumbnail = find_thumbnail_from_news(title, news_sources)
                    if found_thumbnail:
                        issue['thumbnail'] = found_thumbnail
                        result['issues_fixed'] += 1
                        modified = True
                        result['details'].append(f"[issues #{i+1}] 썸네일 추가: {title[:30]}... -> {found_thumbnail[:50]}...")
                    else:
                        result['details'].append(f"[issues #{i+1}] 썸네일 없음 (매칭 실패): {title[:30]}...")

        # ai.industryIssues 처리
        if 'industryIssues' in ai:
            for i, issue in enumerate(ai['industryIssues']):
                result['industry_issues_checked'] += 1
                title = issue.get('title', '')
                thumbnail = issue.get('thumbnail')

                # 빈 문자열을 null로 변경
                if thumbnail == "":
                    issue['thumbnail'] = None
                    result['empty_to_null'] += 1
                    modified = True
                    result['details'].append(f"[industryIssues #{i+1}] 빈 문자열 -> null: {title[:30]}...")
                    thumbnail = None

                # 유효하지 않은 썸네일 처리
                if not is_valid_thumbnail(thumbnail):
                    found_thumbnail = find_thumbnail_from_news(title, news_sources)
                    if found_thumbnail:
                        issue['thumbnail'] = found_thumbnail
                        result['industry_issues_fixed'] += 1
                        modified = True
                        result['details'].append(f"[industryIssues #{i+1}] 썸네일 추가: {title[:30]}... -> {found_thumbnail[:50]}...")
                    else:
                        result['details'].append(f"[industryIssues #{i+1}] 썸네일 없음 (매칭 실패): {title[:30]}...")

        # ai.metrics 처리
        if 'metrics' in ai:
            for i, metric in enumerate(ai['metrics']):
                result['metrics_checked'] += 1
                title = metric.get('title', '')
                thumbnail = metric.get('thumbnail')

                # 빈 문자열을 null로 변경
                if thumbnail == "":
                    metric['thumbnail'] = None
                    result['empty_to_null'] += 1
                    modified = True
                    result['details'].append(f"[metrics #{i+1}] 빈 문자열 -> null: {title[:30]}...")
                    thumbnail = None

                # 유효하지 않은 썸네일 처리
                if not is_valid_thumbnail(thumbnail):
                    found_thumbnail = find_thumbnail_from_news(title, news_sources)
                    if found_thumbnail:
                        metric['thumbnail'] = found_thumbnail
                        result['metrics_fixed'] += 1
                        modified = True
                        result['details'].append(f"[metrics #{i+1}] 썸네일 추가: {title[:30]}... -> {found_thumbnail[:50]}...")
                    else:
                        result['details'].append(f"[metrics #{i+1}] 썸네일 없음 (매칭 실패): {title[:30]}...")

    # 파일 저장
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        result['saved'] = True
    else:
        result['saved'] = False

    return result

def main():
    """메인 함수"""
    base_path = "/mnt/c/Project/GamersCrawl/history"
    files = [
        "2025-12-21.json",
        "2025-12-22.json",
        "2025-12-23.json",
        "2025-12-24.json"
    ]

    print("=" * 60)
    print("GamersCrawl 일간 리포트 썸네일 검증 및 수정")
    print("=" * 60)

    total_fixed = 0

    for filename in files:
        filepath = os.path.join(base_path, filename)

        if not os.path.exists(filepath):
            print(f"\n[오류] 파일 없음: {filepath}")
            continue

        print(f"\n{'=' * 60}")
        print(f"처리 중: {filename}")
        print("-" * 60)

        result = process_file(filepath)

        print(f"\n[요약]")
        print(f"  - issues: {result['issues_checked']}개 확인, {result['issues_fixed']}개 수정")
        print(f"  - industryIssues: {result['industry_issues_checked']}개 확인, {result['industry_issues_fixed']}개 수정")
        print(f"  - metrics: {result['metrics_checked']}개 확인, {result['metrics_fixed']}개 수정")
        print(f"  - 빈문자열->null 변환: {result['empty_to_null']}개")
        print(f"  - 파일 저장: {'예' if result['saved'] else '아니오'}")

        if result['details']:
            print(f"\n[상세 내역]")
            for detail in result['details']:
                print(f"  {detail}")

        fixed_count = result['issues_fixed'] + result['industry_issues_fixed'] + result['metrics_fixed']
        total_fixed += fixed_count

    print(f"\n{'=' * 60}")
    print(f"전체 완료: 총 {total_fixed}개 썸네일 수정됨")
    print("=" * 60)

if __name__ == "__main__":
    main()
