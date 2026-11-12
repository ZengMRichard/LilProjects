'use strict';
/**
 * Current Members of Congress from the public-domain @unitedstates/congress-legislators dataset.
 * Used two ways: (1) the directory of Democratic offices, (2) telling which party a
 * bulletin posting belongs to ("Office of Congresswoman Susie Lee" -> D-NV-3).
 */
const { fetchJson } = require('./http');

const ROSTER_URL = 'https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json';

const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands' };

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function loadRoster() {
  const r = await fetchJson(ROSTER_URL, { timeout: 40000 });
  if (!r.ok) throw new Error(`roster fetch failed: ${r.error}`);
  const members = r.json.map((p) => {
    const t = p.terms[p.terms.length - 1];
    const chamber = t.type === 'sen' ? 'senate' : 'house';
    const party = t.party === 'Democrat' ? 'D' : t.party === 'Republican' ? 'R' : 'I';
    const caucus = party === 'I' ? (t.caucus === 'Democrat' ? 'D' : t.caucus === 'Republican' ? 'R' : 'I') : party;
    const full = p.name.official_full || `${p.name.first} ${p.name.last}`;
    return {
      id: p.id.bioguide,
      name: full,
      first: p.name.first, last: p.name.last, nickname: p.name.nickname || null,
      chamber, party, caucus,
      state: t.state, stateName: STATE_NAMES[t.state] || t.state,
      district: chamber === 'house' ? (t.district === 0 ? 'At-Large' : String(t.district)) : null,
      rank: t.state_rank || null,
      url: (t.url || '').replace(/\/+$/, ''),
      office: t.office || null,
      phone: t.phone || null,
      termEnd: t.end,
    };
  });
  return members;
}

/** Build a matcher: free text -> the member it names (or null). */
function buildMatcher(members) {
  const byFull = new Map();
  const byLast = new Map();
  const byDistrict = new Map();
  for (const m of members) {
    const names = new Set([fold(`${m.first} ${m.last}`), fold(m.name)]);
    if (m.nickname) names.add(fold(`${m.nickname} ${m.last}`));
    // official_full often has a middle initial: also index first + last without it
    names.add(fold(m.name.replace(/\b[A-Z]\.\s*/g, '')));
    for (const n of names) if (n) byFull.set(n, m);
    const lk = fold(m.last);
    if (!byLast.has(lk)) byLast.set(lk, []);
    byLast.get(lk).push(m);
    if (m.chamber === 'house') byDistrict.set(`${m.state}-${m.district === 'At-Large' ? '0' : m.district}`, m);
  }
  const fullKeys = [...byFull.keys()].sort((a, b) => b.length - a.length);

  return function match(text, hintChamber) {
    const raw = String(text || '');
    const t = ' ' + fold(raw) + ' ';
    // 1. full name anywhere in the text
    for (const k of fullKeys) {
      if (t.includes(' ' + k + ' ')) {
        const m = byFull.get(k);
        if (!hintChamber || m.chamber === hintChamber || true) return m;
      }
    }
    // 2. House district code: (CA-24), NY-08, TX-AL
    const dc = raw.match(/\b([A-Z]{2})[-–\s]?(\d{1,2}|AL)\b(?=\)|\s|,|\.|$)/);
    if (dc && /\(|district|representing|congress/i.test(raw)) {
      const m = byDistrict.get(`${dc[1]}-${dc[2] === 'AL' ? '0' : String(+dc[2])}`);
      if (m) return m;
    }
    // 3. title + last name, when that last name is unique in the hinted chamber
    const titled = raw.match(/\b(?:Senator|Sen\.|Congressman|Congresswoman|Congressmember|Representative|Rep\.|Delegate|Ranking Member|Chair(?:man|woman)?|Leader|Whip)\s+(?:[A-Z][\w.'’-]*\s+){0,3}?([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)(?=['’]s\b|\s*\(|\s*,|\s+\(|\s+is\b|\s+seeks\b|\s+\(D|\s|\.|$)/g) || [];
    for (const hit of titled) {
      const words = fold(hit).split(' ');
      for (let n = Math.min(3, words.length); n >= 1; n--) {
        const cand = words.slice(-n).join(' ');
        let list = byLast.get(cand);
        if (!list) continue;
        const chamber = /senator|sen\b/.test(fold(hit)) ? 'senate' : /congress|representative|rep\b|delegate/.test(fold(hit)) ? 'house' : hintChamber;
        if (chamber) list = list.filter((m) => m.chamber === chamber);
        if (list.length === 1) return list[0];
      }
    }
    return null;
  };
}

module.exports = { loadRoster, buildMatcher, STATE_NAMES, fold };
