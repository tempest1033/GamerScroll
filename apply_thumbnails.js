const fs = require('fs');
const path = require('path');

// URL mappings from agent outputs
const urlMappings = {
  // Group 1 (2025-12-05 ~ 2025-12-08)
  '2025-12-05': {
    'issues': {
      0: 'https://play-lh.googleusercontent.com/jV9Qr5SJcdTxjSNM83_T0voYwyFWnErzyM9HsQLopigYZM4unH-_2HRTVLSmJv17OrSW',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
      2: 'https://cdn.akamai.steamstatic.com/steam/apps/2731870/header.jpg',
      3: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.png'
    },
    'industryIssues': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Nexon_Logo.svg'
    },
    'metrics': {
      0: 'https://play-lh.googleusercontent.com/jV9Qr5SJcdTxjSNM83_T0voYwyFWnErzyM9HsQLopigYZM4unH-_2HRTVLSmJv17OrSW',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  '2025-12-06': {
    'issues': {
      0: 'https://play-lh.googleusercontent.com/jV9Qr5SJcdTxjSNM83_T0voYwyFWnErzyM9HsQLopigYZM4unH-_2HRTVLSmJv17OrSW',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
      2: 'https://store.nintendo.co.kr/media/catalog/product/cache/3be328691086628caca32d01ffcc430a/8/c/8cc76e54c89c832ed71749e46e9ee92f280979a32c8a90fba3230f655510a1d7.jpg',
      3: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1tfy.png'
    },
    'metrics': {
      0: 'https://play-lh.googleusercontent.com/jV9Qr5SJcdTxjSNM83_T0voYwyFWnErzyM9HsQLopigYZM4unH-_2HRTVLSmJv17OrSW',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/578080/header.jpg'
    }
  },
  '2025-12-07': {
    'issues': {
      0: 'https://play-lh.googleusercontent.com/jV9Qr5SJcdTxjSNM83_T0voYwyFWnErzyM9HsQLopigYZM4unH-_2HRTVLSmJv17OrSW',
      2: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg',
      3: 'https://cdn.akamai.steamstatic.com/steam/apps/921570/header.jpg',
      4: 'https://play-lh.googleusercontent.com/zCSGnBtZk0Lmp1BAbyaZfLktDzHmC6oke67qzz3G1lBegAF2asyt5KzXOJ2PVdHDYkU'
    },
    'industryIssues': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/2016590/header.jpg'
    },
    'metrics': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg',
      1: 'https://play-lh.googleusercontent.com/XPBW_sQGwtF3bADbMBWHjw1lNJgmeqCK4-UaTVl71J9ePWTjekdgNxqeF6EIbrO27NFY'
    }
  },
  '2025-12-08': {
    'issues': {
      1: 'https://play-lh.googleusercontent.com/KBlch6pf-GjHuz6oal1Z-FyRUVkARDKlqpPfL8JGLydpkRbbcjCVj1sCaRGCNhswrmPTovbLpJ9fMDGSI78z9pA',
      2: 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/af73819d08ad3bbb80a79dcfb048f847923bda56-5120x1280.png',
      3: 'https://www.smilegate.com/assets/img/metatag.png',
      4: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
    },
    'industryIssues': {
      0: 'https://www.smilegate.com/assets/img/metatag.png'
    },
    'metrics': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  // Group 2 (2025-12-09 ~ 2025-12-11)
  '2025-12-09': {
    'issues': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/2185490/header.jpg',
      2: 'https://play-lh.googleusercontent.com/sjxX8euf6_duuxPvwKQhp2xqsf3_Ksq3T9vqBFBDNaa6zlYhb6d9zLqgdOpj7RZzSAHH1c1Qlmi85UL-gHEGt-A',
      3: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_0.jpg'
    },
    'metrics': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/578080/header.jpg'
    }
  },
  '2025-12-10': {
    'issues': {
      1: 'https://cdn.prod.website-files.com/66a2e087ce9b65516296d5d7/6849b7381851f48bb0c2e5bb_nex-safe-content.jpg',
      2: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2073850/a3dae3d5cc681fc0508bdd0e2eb090c30846c60a/capsule_616x353.jpg',
      4: 'https://play-lh.googleusercontent.com/JfGzWE_v-KjofJoJ9eo1oBixex2sHlrSbSte4UG2g6CWDkolbvxI1qV2M_E1JgbjNeDcOrvrTYS7ko1Bb7TPmA'
    },
    'industryIssues': {
      0: 'https://play-lh.googleusercontent.com/JfGzWE_v-KjofJoJ9eo1oBixex2sHlrSbSte4UG2g6CWDkolbvxI1qV2M_E1JgbjNeDcOrvrTYS7ko1Bb7TPmA'
    },
    'metrics': {
      0: 'https://play-lh.googleusercontent.com/gtcDOls1xCaV_qtRKx3dsk75bNBqel81gWkhK2xvgq5KKHj_71lnZjXYO6He97w0j-U',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    }
  },
  '2025-12-11': {
    'issues': {
      0: 'https://play-lh.googleusercontent.com/jV9Qr5SJcdTxjSNM83_T0voYwyFWnErzyM9HsQLopigYZM4unH-_2HRTVLSmJv17OrSW',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg',
      2: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1623730/header.jpg',
      3: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1623730/header.jpg',
      4: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1157390/header.jpg'
    },
    'metrics': {
      0: 'https://cdn.cloudflare.steamstatic.com/steam/apps/216150/header.jpg',
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  // Group 3 (2025-12-12 ~ 2025-12-14)
  '2025-12-12': {
    'issues': {
      0: 'https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg',
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1276790/header.jpg',
      2: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
      3: 'https://cdn.cloudflare.steamstatic.com/steam/apps/578080/header.jpg',
      4: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2933620/header.jpg'
    },
    'industryIssues': {
      0: 'https://cdn.cloudflare.steamstatic.com/steam/apps/261430/header.jpg',
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/578080/header.jpg'
    }
  },
  '2025-12-13': {
    'issues': {
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/216150/header.jpg',
      2: 'https://cdn.cloudflare.steamstatic.com/steam/apps/502500/header.jpg',
      3: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg'
    }
  },
  '2025-12-14': {
    'issues': {
      0: 'https://cdn.cloudflare.steamstatic.com/steam/apps/582660/header.jpg',
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/212160/header.jpg',
      2: 'https://www.logo.wine/a/logo/NetEase/NetEase-Logo.wine.svg'
    },
    'industryIssues': {
      0: 'https://cdn.cloudflare.steamstatic.com/steam/apps/582660/header.jpg',
      1: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Wemade_CI.png'
    },
    'metrics': {
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  // Group 4 (2025-12-15 ~ 2025-12-17)
  '2025-12-15': {
    'issues': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/T1_esports_logo.svg',
      4: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2244130/header.jpg'
    },
    'metrics': {
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2694490/header.jpg'
    }
  },
  '2025-12-16': {
    'issues': {
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/212160/header.jpg',
      4: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg'
    },
    'industryIssues': {
      0: 'https://www.logo.wine/a/logo/NCSoft/NCSoft-Logo.wine.svg'
    }
  },
  '2025-12-17': {
    'issues': {
      0: 'https://cdn.cloudflare.steamstatic.com/steam/apps/435150/header.jpg',
      1: 'https://www.logo.wine/a/logo/NCSoft/NCSoft-Logo.wine.svg',
      2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Ubisoft_logo.svg/400px-Ubisoft_logo.svg.png'
    },
    'industryIssues': {
      0: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4077740/c15e27d4221478bb2ef67fcb2a1b32d08043c995/capsule_616x353.jpg'
    },
    'metrics': {
      1: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1808500/bf3cf2254deb9697fe23e42932a14c60656a3007/capsule_616x353_alt_assets_0.jpg'
    }
  },
  // Group 5 (2025-12-18 ~ 2025-12-20)
  '2025-12-18': {
    'issues': {
      0: 'https://www.pokemon.com/static-assets/content-assets/cms2/img/video-games/_tiles/tcg-pocket/launch/tcg-pocket-169-en.png',
      2: 'https://lwi.nexon.com/maplestoryidle/images/meta/meta_1200x630.jpg'
    }
  },
  '2025-12-19': {
    'issues': {
      2: 'https://nxm-clw-cdn.dn.nexoncdn.co.kr/ba/common/og_en.jpg',
      3: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3812660/d3bd7015bcd26bae627321e2fd586f4d978a0d41/capsule_616x353.jpg'
    },
    'metrics': {
      1: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1808500/bf3cf2254deb9697fe23e42932a14c60656a3007/capsule_616x353_alt_assets_0.jpg'
    }
  },
  '2025-12-20': {
    'issues': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/2827820/capsule_616x353.jpg',
      3: 'https://mabinogimobile.nexon.com/img/common/og.jpg'
    },
    'metrics': {
      0: 'https://lwi.nexon.com/maplestoryidle/images/meta/meta_1200x630.jpg',
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  // Group 6 (2025-12-21 ~ 2025-12-23)
  '2025-12-21': {
    'issues': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/578080/header.jpg',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/578080/header.jpg',
      3: 'https://drop-assets.ea.com/images/2I7VhVjwdzBgmbpeldmM8t/4f2dcad2d115abd786aa2bb9ff38d89f/battlefield-6-standard-edition-16x9.jpg'
    },
    'industryIssues': {
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1794680/header.jpg'
    },
    'metrics': {
      1: 'https://lwi.nexon.com/maplestoryidle/images/meta/meta_1200x630.jpg'
    }
  },
  '2025-12-22': {
    'issues': {
      0: 'https://lwi.nexon.com/m_mabinogim/global/en/main/meta.jpg',
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2827820/header.jpg',
      4: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1627720/header.jpg'
    },
    'metrics': {
      0: 'https://lwi.nexon.com/maplestoryidle/images/meta/meta_1200x630.jpg',
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/3419430/header.jpg'
    }
  },
  '2025-12-23': {
    'issues': {
      1: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg',
      2: 'https://www.shm-afeela.com/share/v2.0/pages/top/img/ogp.png',
      4: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2381520/header.jpg'
    },
    'metrics': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  // Group 7 (2025-12-24 ~ 2025-12-26)
  '2025-12-24': {
    'issues': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/T1_esports_logo.svg/330px-T1_esports_logo.svg.png',
      3: 'https://cdn.akamai.steamstatic.com/steam/apps/268050/header.jpg'
    },
    'industryIssues': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/212160/header.jpg'
    },
    'metrics': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Nexon.svg/330px-Nexon.svg.png'
    }
  },
  '2025-12-25': {
    'issues': {
      0: 'https://play-lh.googleusercontent.com/aYiAWQdXNsr3xZ6odA03uTFDAbu5fDLata-Lfu08mxRAQC3dTRsY4fu-sF_BKslo7OMKWtM4vAODZPWgwf2dDlc=w240-h480',
      3: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    },
    'industryIssues': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Netmarble_Logo.svg/330px-Netmarble_Logo.svg.png'
    },
    'metrics': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Nexon.svg/330px-Nexon.svg.png',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  '2025-12-26': {
    'issues': {
      0: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3768760/86d898447e0e475e3f8a9cc1ef660a80032472d7/header_alt_assets_1.jpg',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/921570/header.jpg',
      2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/T1_esports_logo.svg/330px-T1_esports_logo.svg.png',
      4: 'https://play-lh.googleusercontent.com/u7AtKbtkSonuGOyzDkY2ki4_H_mzf-mxgr-E9KVZxmqoMPsCtATZJzyp76N2SSCXyKrcniMa2i9-38AYVTur=w240-h480'
    },
    'industryIssues': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/NCSOFT_logo.svg/330px-NCSOFT_logo.svg.png'
    },
    'metrics': {
      0: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Nexon.svg/330px-Nexon.svg.png',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/578080/header.jpg'
    }
  },
  // Group 8 (2025-12-27 ~ 2025-12-29)
  '2025-12-27': {
    'issues': {
      0: 'https://lwi.nexon.com/m_mabinogim/global/en/main/meta.jpg',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/2016590/header.jpg',
      2: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    },
    'industryIssues': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/578080/header.jpg',
      1: 'https://sgimage.netmarble.com/images/netmarble/nanagb/20251223/haus1766475890999.jpg'
    },
    'metrics': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    }
  },
  '2025-12-28': {
    'issues': {
      2: 'https://cdn.akamai.steamstatic.com/steam/apps/921570/header.jpg',
      3: 'https://web-files-cdn.masangsoft.com/_Kingsraid/images/cbt/251224/og.jpg'
    },
    'industryIssues': {
      1: 'https://s1.blackdesertm.com/GL/forum/BDM/Upload/OGMetaTag/0aca1a54b3120251229052052957.jpg'
    },
    'metrics': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  '2025-12-29': {
    'issues': {
      0: 'https://lwi.nexon.com/m_mabinogim/global/en/main/meta.jpg',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/2016590/header.jpg',
      2: 'https://cdn.akamai.steamstatic.com/steam/apps/359550/header.jpg'
    },
    'industryIssues': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/1384160/header.jpg'
    },
    'metrics': {
      0: 'https://lwi.nexon.com/maplestoryidle/images/meta/meta_1200x630.jpg',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    }
  },
  // Group 9 (2025-12-30 ~ 2026-01-01)
  '2025-12-30': {
    'issues': {
      0: 'https://nikke-en.com/pc/ossweb-img/og_image.jpg',
      1: 'https://fizz-download.playnccdn.com/download/v2/buckets/conti-upload/files/19a8a3f7070-4ee6244e-ff37-470c-88b3-046f9aba3447',
      3: 'https://www.konami.com/efootball/s/img/share/eFootball_kv_play_crazy.jpg'
    },
    'industryIssues': {
      0: 'https://nikke-en.com/pc/ossweb-img/og_image.jpg',
      1: 'https://sgimage.netmarble.com/images/netmarble/thered/20250618/vqhm1750223980094.jpg'
    },
    'metrics': {
      0: 'https://www.lastwar.com/common/icon.png',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg'
    }
  },
  '2025-12-31': {
    'issues': {
      1: 'https://tgs.tca.org.tw/images/og_image_basic.jpg?k=20240618',
      2: 'https://azurpromilia-web.dn.nexoncdn.co.kr/events/2025/1215_preregistration_A23C27F10386720E/meta.jpg',
      4: 'https://ssl.pstatic.net/static/nng/glive/icon/ogtag.png'
    },
    'industryIssues': {
      1: 'https://ssl.pstatic.net/static/nng/glive/icon/ogtag.png'
    },
    'metrics': {
      0: 'https://images.rbxcdn.com/5348266ea6c5e67b19d6a814cbbb70f6.jpg',
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/578080/header.jpg'
    }
  },
  '2026-01-01': {
    'issues': {
      1: 'https://assets.playnccdn.com/purple/resources/share/nc.jpg',
      2: 'https://play-lh.googleusercontent.com/XX9ZhMxENdDRuuukBcFhuD2aopi5_-ncHLM5aYH20SYl5WINEvQsy1N9JAMWc4ubwQ',
      3: 'https://play-lh.googleusercontent.com/sseeBlDShgoJI_cg-tTrAdvdw2TjqF4bVo6aU8o7MnvLYlhd4INANQ-SM_MAF6nDfZVn0cnloPMbdvs2ymDuXg',
      4: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    },
    'industryIssues': {
      0: 'https://assets.playnccdn.com/purple/resources/share/nc.jpg'
    },
    'metrics': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    }
  },
  // Group 10 (2026-01-03 ~ 2026-01-04)
  '2026-01-03': {
    'issues': {
      0: 'https://images.squarespace-cdn.com/content/v1/62d09f54a49d6f1c78455cce/38786c61-a739-4de6-bf76-da0b1ada05d7/T1+red.png?format=1500w',
      1: 'https://assets.playnccdn.com/lineage/v1/img/meta/lineage_fb.jpg',
      3: 'https://cdn.akamai.steamstatic.com/steam/apps/2564140/header.jpg',
      4: 'https://cdn.akamai.steamstatic.com/steam/apps/582660/header.jpg'
    },
    'metrics': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    }
  },
  '2026-01-04': {
    'issues': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/2286620/header.jpg',
      3: 'https://cdn.akamai.steamstatic.com/steam/apps/2161700/header.jpg'
    },
    'industryIssues': {
      1: 'https://cdn.akamai.steamstatic.com/steam/apps/2795540/header.jpg'
    },
    'metrics': {
      0: 'https://cdn.akamai.steamstatic.com/steam/apps/1808500/header.jpg'
    }
  }
};

const reportsDir = '/mnt/c/Project/GamersCrawl/reports';
let totalUpdated = 0;
let totalFiles = 0;

for (const [date, sections] of Object.entries(urlMappings)) {
  const filePath = path.join(reportsDir, `${date}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`Skip: ${date}.json not found`);
    continue;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let fileUpdated = 0;

    // JSON structure is under data.ai
    const ai = data.ai;
    if (!ai) {
      console.log(`Skip: ${date}.json has no 'ai' key`);
      continue;
    }

    for (const [section, indices] of Object.entries(sections)) {
      if (!ai[section]) continue;

      for (const [indexStr, url] of Object.entries(indices)) {
        const index = parseInt(indexStr);
        if (ai[section][index]) {
          const oldUrl = ai[section][index].thumbnail;
          ai[section][index].thumbnail = url;
          fileUpdated++;
          console.log(`  ${date}|${section}|${index}: Updated`);
        }
      }
    }

    if (fileUpdated > 0) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      totalUpdated += fileUpdated;
      totalFiles++;
      console.log(`Updated ${date}.json: ${fileUpdated} thumbnails`);
    }
  } catch (e) {
    console.error(`Error processing ${date}.json: ${e.message}`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Files updated: ${totalFiles}`);
console.log(`Total thumbnails updated: ${totalUpdated}`);
