"""Tests for the archived Japanese rank harvester and its agreement check."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from game_i_agreement import match_by_prefix, normalise  # noqa: E402
from harvest_game_i_ranks import (add_game_ranks, parse_ranking, rank_gaps,  # noqa: E402
                                  write_day)

PAGE = '''
<div class="gi-ranking-list">
<article class="gi-ranking-item">
  <div class="gi-rank rank-1"><strong>1</strong><span class="up">&#9650;1</span></div>
  <a href="https://game-i.daa.jp/?APP/111"><img class="gi-icon" src="a.jpg"></a>
  <a class="gi-app" href="https://game-i.daa.jp/?APP/111">
    <div class="gi-title">&#12454;&#12510;&#23064;</div>
    <div class="gi-company">Cygames</div>
    <div class="gi-meta">Games</div>
  </a>
</article>
<article class="gi-ranking-item">
  <div class="gi-rank rank-2"><strong>2</strong></div>
  <a class="gi-app" href="https://game-i.daa.jp/?APP/222">
    <div class="gi-title">LINE&#12510;&#12531;&#12460;</div>
    <div class="gi-company">LINE</div>
    <div class="gi-meta">Book</div>
  </a>
</article>
<article class="gi-ranking-item">
  <div class="gi-rank rank-4"><strong>4</strong></div>
  <a class="gi-app" href="https://game-i.daa.jp/?APP/333">
    <div class="gi-title">Monster Strike</div>
    <div class="gi-company">MIXI</div>
    <div class="gi-meta">Games</div>
  </a>
</article>
<article class="gi-ranking-item">
  <div class="gi-rank rank-5"><strong>5</strong></div>
  <a class="gi-app" href="https://game-i.daa.jp/?APP/444">
    <div class="gi-company">Nobody</div>
    <div class="gi-meta">Games</div>
  </a>
</article>
</div>
'''


class ParsePage(unittest.TestCase):
    def test_reads_rank_id_title_and_category(self):
        rows = parse_ranking(PAGE)
        self.assertEqual([row['overall_rank'] for row in rows], [1, 2, 4])
        self.assertEqual([row['id'] for row in rows], ['111', '222', '333'])
        self.assertEqual(rows[0]['title'], 'ウマ娘')
        self.assertEqual(rows[0]['company'], 'Cygames')
        self.assertEqual(rows[1]['category'], 'Book')

    def test_row_without_a_title_is_dropped_not_guessed(self):
        # A half-read row would enter a panel as a wrong rank for an unknown app.
        self.assertNotIn('444', [row['id'] for row in parse_ranking(PAGE)])


class GameRanks(unittest.TestCase):
    def test_games_are_ranked_among_themselves_in_page_order(self):
        rows = add_game_ranks(parse_ranking(PAGE))
        self.assertEqual([row['game_rank'] for row in rows], [1, None, 2])

    def test_non_game_rows_keep_no_game_rank(self):
        rows = add_game_ranks(parse_ranking(PAGE))
        self.assertIsNone(next(row for row in rows if row['category'] == 'Book')['game_rank'])


class RankGaps(unittest.TestCase):
    def test_counts_positions_the_page_skips(self):
        self.assertEqual(rank_gaps(add_game_ranks(parse_ranking(PAGE))), 1)

    def test_contiguous_page_reports_no_gap(self):
        rows = [{'overall_rank': 1}, {'overall_rank': 2}, {'overall_rank': 3}]
        self.assertEqual(rank_gaps(rows), 0)

    def test_repeated_or_backwards_ranks_are_unusable(self):
        self.assertEqual(rank_gaps([{'overall_rank': 2}, {'overall_rank': 2}]), -1)
        self.assertEqual(rank_gaps([{'overall_rank': 3}, {'overall_rank': 1}]), -1)


class WriteDay(unittest.TestCase):
    def test_written_rows_keep_rank_id_and_category(self):
        import tempfile
        rows = add_game_ranks(parse_ranking(PAGE))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'day.csv'
            write_day(rows, path)
            lines = path.read_text(encoding='utf-8').splitlines()
        self.assertEqual(lines[0], 'overall_rank,game_rank,id,category,title')
        self.assertEqual(lines[1], '1,1,111,"Games","ウマ娘"')
        self.assertEqual(lines[2], '2,,222,"Book","LINEマンガ"')


class TitleMatching(unittest.TestCase):
    def test_width_and_trademark_differences_fold_together(self):
        self.assertEqual(normalise('eFootball™'), normalise('ｅFootball'))

    def test_marketing_suffix_still_matches_the_same_game(self):
        candidates = {normalise('ゼンレスゾーンゼロ'): 7}
        self.assertEqual(match_by_prefix(normalise('ゼンレスゾーンゼロ - アニバーサリー'), candidates), 7)

    def test_ambiguous_prefix_is_refused(self):
        candidates = {normalise('パズドラ バトル'): 3, normalise('パズドラ ストーリー'): 9}
        self.assertIsNone(match_by_prefix(normalise('パズドラ'), candidates))


if __name__ == '__main__':
    unittest.main()
