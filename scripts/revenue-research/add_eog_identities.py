"""Add identity families for the games on eog.gg's revenue board.

The board's monthly amounts are only usable as labels when the game is an
identity family with store ids, because the observation index is built per
family. Each entry below was matched by title in the collected chart
dictionary (apps.json) on 2026-09-12; regional editions are grouped the way
the board combines them. The script refuses an id that is absent from the
dictionary or already owned by another family, and leaves existing families
untouched. Re-running only adds ids that are still missing from the families
this script created (a regional edition found later, such as the Japanese
ONE PIECE Bounty Rush app).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IDENTITIES = ROOT / 'docs/research/anchors/identities.json'
DICTIONARY = ROOT / 'reports/rank-models/sustained-rank-observations-2026-09-11/session-F5mbni/collector-output/apps.json'
STATUS = ('store ids taken from the collected chart dictionary for the eog.gg revenue board (2026-09-12); '
          'regional editions grouped as the board combines them')

FAMILIES: dict[str, tuple[list[str], list[str]]] = {
    'Arknights': (['1464872022', '1478990007', '1454663939', '1490985322'],
                  ['com.YoStarEN.Arknights', 'com.YoStarJP.Arknights', 'tw.txwy.and.arknights']),
    'Azur Lane': (['1411126549', '1242186587', '1170457573'], ['com.YoStarEN.AzurLane', 'com.YoStarJP.AzurLane']),
    'Blue Archive': (['1571873795', '1515877221'], ['com.nexon.bluearchive', 'com.YostarJP.BlueArchive']),
    'CookieRun: Kingdom': (['1509450845'], ['com.devsisters.ck']),
    'CookieRun: Crumble': (['6749251466'], ['com.devsisters.cc']),
    'DRAGON BALL Z DOKKAN BATTLE': (['951627425', '951627670'],
                                    ['com.bandainamcogames.dbzdokkanww', 'com.bandainamcogames.dbzdokkan']),
    'Dragon Ball Legends': (['1358222641', '1358232022'],
                            ['com.bandainamcoent.dblegends_ww', 'com.bandainamcoent.dblegends_jp']),
    'Goddess of Victory: NIKKE': (['1585915174'], ['com.proximabeta.nikke']),
    'Gakuen iDOLM@STER': (['6446659989'], ['com.bandainamcoent.idolmaster_gakuen']),
    'HATSUNE MIKU: COLORFUL STAGE!': (['1580044138', '1489932710'], ['com.sega.ColorfulStage.en', 'com.sega.pjsekai']),
    'Infinity Nikki': (['6502622570', '6502622479'], []),
    'Marvel Contest of Champions': (['896112560'], ['com.kabam.marvelbattle']),
    'MementoMori': (['1611490041'], ['jp.boi.mementomori.android']),
    'Monster Strike': (['658511662'], ['jp.co.mixi.monsterstrike']),
    'Naruto Mobile': (['955396648'], []),
    'Puzzle & Dragons': (['493470467', '808027845'], ['jp.gungho.pad', 'jp.gungho.padHT']),
    'Reverse: 1999': (['1672933190', '6449023119'],
                      ['com.bluepoch.m.en.reverse1999', 'kr.haoplay.game.and.reverse',
                       'com.bluepoch.m.jp.reverse1999.and', 'com.mover.twcfwl1999']),
    'Star Wars: Galaxy of Heroes': (['921022358'], ['com.ea.game.starwarscapital_row']),
    'Summoners War': (['852912420'], ['com.com2us.smon.normal.freefull.google.kr.android.common']),
    'The Battle Cats': (['850057092', '547145938'], ['jp.co.ponos.battlecatsen', 'jp.co.ponos.battlecats']),
    'The Seven Deadly Sins: Grand Cross': (['1268959718'], ['com.netmarble.nanatsunotaizai']),
    'The Seven Deadly Sins: Origin': (['6744205088'], ['com.netmarble.nanaori']),
    'Yu-Gi-Oh! Master Duel': (['1554247785'], ['jp.konami.masterduel']),
    'ONE PIECE Bounty Rush': (['1343688545', '1322310031'], ['com.bandainamcoent.opbrww', 'com.bandainamcoent.opbrjp']),
    'ONE PIECE TREASURE CRUISE': (['943690848', '824116884'],
                                  ['com.namcobandaigames.spmoja010E', 'com.namcobandaigames.spmoja010']),
    'Onmyoji': (['1257031979', '895670960'], ['com.netease.onmyoji.na', 'com.onmyoji.hmt2']),
    'Mahjong Soul': (['1469186379'], ['com.YoStarJP.MajSoul', 'com.soulgamechst.majsoul']),
    'Light and Night': (['1439754823'], []),
    'Shining Nikki': (['1455833480'], []),
    'Neverness to Everness': (['6754593077', '6514281568'], ['com.hottagames.nte']),
    'Chaos Zero Nightmare': (['6502326151'], ['com.smilegate.chaoszero.stove.google']),
    "Girls' Frontline 2: Exilium": (['6502505286'], ['com.haoplay.game.and.exilium']),
    'Jujutsu Kaisen Phantom Parade': (['6475925341', '1551798277'],
                                      ['com.bilibilihk.jujutsuphanparagp', 'jp.co.sumzap.pj0014']),
    'Disney Twisted-Wonderland': (['1477455989'], ['com.aniplex.twst.jp']),
    'Shadowverse: Worlds Beyond': (['6472019540'], ['jp.co.cygames.ShadowverseWorldsBeyond']),
    'Seven Knights Re:BIRTH': (['6479595079'], ['com.netmarble.tskgb']),
    'ENSEMBLE STARS': (['1494428618'], ['jp.co.happyelements.boysm']),
    'SD Gundam G Generation ETERNAL': (['6692611665'], ['com.bandainamcoent.gget_WW', 'com.bandainamcoent.gget_JP']),
    'Suikoden STAR LEAP': (['6746180100'], ['jp.konami.suikoden.starleap']),
    'Pokémon Masters EX': (['1442061397'], ['com.dena.a12026418']),
    'DRAGON QUEST Smash/Grow': (['6747737418', '6747736697'], ['com.square_enix.android_googleplay.dqsgj']),
    'Trickal RE:VIVE': (['6443824730'], ['com.epidgames.trickcalrevive']),
    'BLEACH: Soul Resonance': (['6748335097', '6751220183', '6745081346'],
                               ['com.bleach.apj', 'com.crunchyroll.bleachsoulres', 'com.bladetw.bd']),
    'Dragon Traveler': (['6751086804'], ['com.gametree.lhlr.gp']),
    'DIGIMON UP': (['6756247787', '6756247422'], []),
    'LifeMakeover': (['1619100281', '1552333447'], []),
    'Beyond the World': (['6475668638'], []),
    'Sword x Staff': (['6751270546'], ['com.zjcs.android.us']),
}
ALIASES = {
    'GODDESS OF VICTORY: NIKKE': 'Goddess of Victory: NIKKE',
}


def main(families: dict[str, tuple[list[str], list[str]]] = FAMILIES,
         aliases: dict[str, str] = ALIASES, status: str = STATUS) -> None:
    """Add or extend the given families; other scripts pass their own table and status text."""
    identities = json.loads(IDENTITIES.read_text(encoding='utf-8'))
    dictionary = json.loads(DICTIONARY.read_text(encoding='utf-8'))
    apps = dictionary.get('apps', dictionary)
    taken = {f'{store}:{app}' for entry in identities['games'].values()
             for store in ('ios', 'aos') for app in entry[store]}
    added, skipped, extended = [], [], []
    for name, (ios, aos) in families.items():
        existing = identities['games'].get(name)
        if existing is not None and existing.get('status') != status:
            skipped.append(name)
            continue
        slots = [f'ios:{app}' for app in ios] + [f'aos:{app}' for app in aos]
        missing = [slot for slot in slots if slot not in apps]
        clash = [slot for slot in slots if slot in taken and (existing is None or slot.split(':', 1)[1] not in existing['ios'] + existing['aos'])]
        if missing or clash:
            raise SystemExit(f'{name}: missing {missing} clash {clash}')
        if existing is None:
            identities['games'][name] = {'ios': ios, 'aos': aos, 'status': status}
            added.append(name)
        else:
            new_ids = [app for app in ios if app not in existing['ios']] + [app for app in aos if app not in existing['aos']]
            if new_ids:
                existing['ios'] = existing['ios'] + [app for app in ios if app not in existing['ios']]
                existing['aos'] = existing['aos'] + [app for app in aos if app not in existing['aos']]
                extended.append(name)
        taken.update(slots)
    identities['aliases'].update(aliases)
    identities['games'] = dict(sorted(identities['games'].items()))
    identities['aliases'] = dict(sorted(identities['aliases'].items()))
    IDENTITIES.write_text(json.dumps(identities, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'added': len(added), 'extended': extended, 'skipped_existing': skipped,
                      'families': len(identities['games'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
