"""Add identity families for games that PocketGamer.biz's monthly charts name with install counts.

The monthly-chart articles (AppMagic figures) mention mid-table games that the
MobileGamer top-20 lists never reach, so their install counts are only usable
as download labels once the game is an identity family with store ids. Each
entry was matched by title and developer in the collected chart dictionary on
2026-09-12. Reuses the guarded writer from add_eog_identities: an id absent
from the dictionary or owned by another family aborts, existing families stay
untouched. Rainbow Six Mobile is left out (only its February launch month is
reported, and the Google Play app is not in the dictionary).
"""
from __future__ import annotations

from add_eog_identities import main as add_families

STATUS = ('download-chart family added 2026-09-12 from the all-country chart dictionary for the '
          'PocketGamer.biz monthly charts (title and developer matched by hand); '
          'vendor regional-family aggregation provisional')

FAMILIES: dict[str, tuple[list[str], list[str]]] = {
    'Head Ball 2': (['1193933380'], ['com.masomo.headball2']),
    'Hungry Shark Evolution': (['535500008'], ['com.fgol.HungrySharkEvolution']),
    'Last Asylum: Plague': (['6756989323'], ['com.phs.global']),
    'Dream League Soccer': (['1462911602'], ['com.firsttouchgames.dls7']),
    'Top Tycoon: Coin Theme Empire': (['6739124364'], ['com.monopoly.dream.idle.king']),
    'Mini Soccer: Football Cup 2026': ([], ['com.mini.football.filter.games']),
    'Royal Smash': (['6780891673'], ['com.cyphergames.royalsmash']),
    'Chess.com': (['329218549'], ['com.chess']),
    # MobileGamer download prose (2026-09-13): 'Jewel Coloring' 7.1m in April and
    # 'My Supermarket Simulator 3D' 7.9m in May. 'Block Crazy Robo World Craft'
    # (Prokids Studio), 'Tile Exploder' and 'Mahjong Wonders' are not in the
    # dictionary under those developers and stay without a family.
    'Jewel Coloring': (['6759081967'], ['color.number.paint.pixle.art.sort.jigsaw']),
    'My Supermarket Simulator 3D': (['6511238101'], ['com.playspare.supermarket.store.simulator']),
}
ALIASES = {
    'Dream League Soccer 2026': 'Dream League Soccer',
    'Top Tycoon': 'Top Tycoon: Coin Theme Empire',
    'Mini Soccer': 'Mini Soccer: Football Cup 2026',
}


if __name__ == '__main__':
    add_families(FAMILIES, ALIASES, STATUS)
