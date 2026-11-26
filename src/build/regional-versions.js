'use strict';

/**
 * Same-name game pages of an edition: separate records of one title from different markets (e.g. the Japanese, Taiwanese and
 * Chinese apps of Fate/Grand Order), each with its own store apps and rank history, that the edition indexes under one display
 * name or page title. Each such page carries its market in its title, H1 and SoftwareApplication name and links the others as other
 * regional versions (src/templates/pages/game.js); of pages that market, store and developer do not tell apart, only the one
 * with the longest chart history is indexable. Pure; src/build/game-pages.js applies the result to the game pages.
 *
 *   qualifier q = { m: <country> | 'global' | 'steam', st?: 'ios' | 'android', d?: <developer>, ds?: <developer without its company form> }
 */
const COUNTRIES = ['kr', 'jp', 'us', 'cn', 'tw'];
const STORES = ['ios', 'android'];

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const chartDays = (s, country, store) => { const e = s && s[country] && s[country][store]; return e ? e.v.filter((r) => r != null).length : 0; };

// A record's market: the one country of its revenue-chart history, or global when that history spans several countries;
// a record without one (a Steam record) is on Steam.
// s: daily rank series { <country>: { <store>: {o, v} } } (src/build/game-data.js rankSeries).
function marketOf(s) {
  const countries = COUNTRIES.filter((country) => STORES.some((store) => chartDays(s, country, store)));
  return countries.length > 1 ? 'global' : countries[0] || 'steam';
}

// The store a record has its apps on, when that is one store only.
const onlyStore = (appIds) => {
  const stores = STORES.filter((store) => Object.entries(appIds || {}).some(([slot, id]) => id && slot.split(/[_:]/)[0] === store));
  return stores.length === 1 ? stores[0] : null;
};

// A developer without its company form ("Darkwinter Software Co., Ltd." → "Darkwinter Software").
const COMPANY_FORM = /[\s,.]*\b(?:co|company|corp|corporation|inc|incorporated|llc|ltd|limited|pte|pvt|private|gmbh|plc)\b[\s,.]*$/i;
function shortDeveloper(developer) {
  let out = developer;
  for (let next = out.replace(COMPANY_FORM, ''); next && next !== out; next = out.replace(COMPANY_FORM, '')) out = next;
  return out;
}

// Chart days of a page: its revenue-chart days over every market and store, then its Steam chart days.
const historyOf = (p) => COUNTRIES.reduce((n, country) => n + STORES.reduce((m, store) => m + chartDays(p.s, country, store), 0), 0) + (p.steamDays || 0);

// Qualifiers of one same-name group with only the parts that tell its pages apart: the market; among pages of one market the
// store, when each of them has apps on one store only and those stores differ (a page on both stores is never labelled with
// one), else the developer. → { q, twins: [[index, ...]] }: pages that none of these parts tells apart.
function qualify(group) {
  const q = group.map((p) => ({ m: marketOf(p.s) }));
  const store = group.map((p) => onlyStore(p.appIds));
  const same = (list) => {
    const by = new Map();
    for (const i of list) by.set(JSON.stringify(q[i]), [...(by.get(JSON.stringify(q[i])) || []), i]);
    return [...by.values()].filter((l) => l.length > 1);
  };
  const twins = [];
  for (const open = same(group.map((p, i) => i)); open.length;) {
    const list = open.pop();
    if (!q[list[0]].st && list.every((i) => store[i]) && new Set(list.map((i) => store[i])).size > 1) for (const i of list) q[i].st = store[i];
    else if (!q[list[0]].d && new Set(list.map((i) => group[i].developer || '')).size > 1) for (const i of list) { if (group[i].developer) q[i].d = group[i].developer; }
    else { twins.push(list); continue; }
    open.push(...same(list));
  }
  // A title too long for the full developer takes it without its company form, where that still tells the page apart.
  group.forEach((p, i) => {
    const ds = q[i].d && shortDeveloper(q[i].d);
    if (ds && ds !== q[i].d && group.every((o, j) => j === i || q[j].m !== q[i].m || q[j].st !== q[i].st || shortDeveloper(o.developer || '') !== ds)) q[i].ds = ds;
  });
  return { q, twins };
}

// Groups of `members` that share a display name or title in the edition `code`.
function sameNameGroups(members, code) {
  const parent = members.map((p, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstWith = new Map();
  members.forEach((p, i) => {
    for (const key of [`n:${norm(p.names[code])}`, ...(p.titles ? [`t:${p.titles[code]}`] : [])]) {
      if (firstWith.has(key)) parent[find(i)] = find(firstWith.get(key));
      else firstWith.set(key, i);
    }
  });
  const groups = new Map();
  members.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) || []), p]));
  return [...groups.values()].filter((group) => group.length > 1);
}

// pages: [{ slug, editions: [<code>], names: { <code>: name }, titles: { <code>: title }, s, steamDays, developer, appIds }] (editions:
// where the page is indexable by its own rule; titles: the unqualified page titles, which can meet although the names differ
// once a long name is shortened to its main part; steamDays: its Steam chart days). → { <slug>: { <code>: { q, o: [{ s: slug,
// n: name, q }] } } } for the pages that share their name or title with another in an edition, and { <code>: { x: slug } } for
// a page that is in all its parts the same as another whose chart history is longer (slug x): it is no indexable page there.
function regionalVersions(pages, codes) {
  const out = {};
  for (const code of codes) {
    let members = pages.filter((p) => p.editions.includes(code));
    for (;;) {
      const groups = sameNameGroups(members, code).map((group) => ({ group, ...qualify(group) }));
      const dropped = new Map();
      for (const { group, twins } of groups) {
        for (const list of twins) {
          const [kept, ...rest] = list.map((i) => group[i]).sort((a, b) => historyOf(b) - historyOf(a) || (a.slug < b.slug ? -1 : 1));
          for (const p of rest) dropped.set(p, kept.slug);
        }
      }
      if (!dropped.size) {
        for (const { group, q } of groups) {
          group.forEach((p, i) => {
            (out[p.slug] = out[p.slug] || {})[code] = { q: q[i], o: group.flatMap((o, j) => (j === i ? [] : [{ s: o.slug, n: o.names[code], q: q[j] }])) };
          });
        }
        break;
      }
      for (const [p, kept] of dropped) (out[p.slug] = out[p.slug] || {})[code] = { x: kept };
      members = members.filter((p) => !dropped.has(p));
    }
  }
  return out;
}

module.exports = { regionalVersions, marketOf };
