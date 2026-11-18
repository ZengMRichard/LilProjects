'use strict';
/**
 * Run every source, merge the results, compare with the previous run, write data/internships.json.
 *
 *   node scraper/run.js                       # everything
 *   node scraper/run.js --only=senate,house   # just these stages (others carry over from the last run)
 *   node scraper/run.js --skip=offices        # everything except the slow member-office crawl
 *
 * Stages: boards · senate · house · usajobs · offices · pages
 */
require('./lib/proxy').ensureProxy();
const fs = require('fs');
const path = require('path');
const { pool } = require('./lib/http');
const { loadRoster, buildMatcher } = require('./lib/roster');
const { ORGS } = require('./config/orgs');
const { fetchBoard, boardUrl, ADAPTERS, LABELS } = require('./sources/boards');
const { senate, SITE: SENATE_SITE } = require('./sources/senate');
const { house } = require('./sources/house');
const { usajobs } = require('./sources/usajobs');
const { offices } = require('./sources/offices');
const { readPage } = require('./sources/pages');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'internships.json');
const DIGESTS = path.join(ROOT, 'data', 'digests.json'); // posting text and facts, the basis for the ratings in data/ratings.json
const DISCOVERED = path.join(__dirname, 'config', 'discovered.json');
const STAGES = ['boards', 'senate', 'house', 'usajobs', 'offices', 'pages'];

/**
 * Which party organizes each chamber. Only used to read postings that say "majority staff"
 * or "minority staff" without naming a party. The 120th Congress row reflects the AP calls
 * from the November 2026 midterms; edit it if the organizing resolutions say otherwise.
 */
const CONTROL = [
  { from: '2025-01-03', house: 'R', senate: 'R' },
  { from: '2027-01-03', house: 'D', senate: 'D' },
];
const controlOn = (iso) => CONTROL.filter((c) => c.from <= iso).pop() || CONTROL[0];

// Tokens the discovery pass picks up from embedded third-party widgets rather than the org's own board.
const TOKEN_DENY = new Set(['nrgconsultinggroup', 'larnellvickers', 'cdn02', 'daga']);

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const easternToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

function parseArgs() {
  const a = { only: null, skip: [] };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--missing') a.missing = true; // offices: only re-crawl sites with no internship page yet
    else if (arg.startsWith('--only=')) a.only = arg.slice(7).split(',').filter(Boolean);
    else if (arg.startsWith('--skip=')) a.skip = arg.slice(7).split(',').filter(Boolean);
  }
  const bad = [...(a.only || []), ...a.skip].filter((s) => !STAGES.includes(s));
  if (bad.length) { log(`Unknown stage: ${bad.join(', ')}. Stages are: ${STAGES.join(', ')}`); process.exit(2); }
  return a;
}

function pickBoard(d) {
  if (!d || !d.ats) return null;
  return d.ats.find((a) => ADAPTERS[a.type] && !TOKEN_DENY.has(String(a.token).toLowerCase())) || null;
}
function otherSystem(d) {
  if (!d || !d.ats) return null;
  const a = d.ats.find((x) => !ADAPTERS[x.type] && x.type !== 'getro' && !TOKEN_DENY.has(String(x.token).toLowerCase()));
  return a ? a.type : null;
}
/** A discovered "internship page" is only trusted if its address looks like a program page. */
function goodInternUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (/greenhouse\.io|lever\.co|icims\.com|rippling\.com|paylocity\.com|workday|bamboohr|applytojob/i.test(url.host)) return null;
    if (!/intern/i.test(url.pathname)) return null;
    if (/video|\/news\/|\/blog\//i.test(url.pathname)) return null;
    return u;
  } catch (e) { return null; }
}

const fromPrev = (o) => ({ id: o.id, internUrl: o.internUrl, status: o.status, windows: o.windows, opens: o.opens, notices: o.notices, rolling: o.rolling, paid: o.paid, payNote: o.payNote, applyUrl: o.applyUrl, hash: o.hash, checkedAt: o.checkedAt, error: o.error, needs: o.needs, level: o.level });

async function main() {
  const args = parseArgs();
  const runs = (s) => (args.only ? args.only.includes(s) : !args.skip.includes(s));
  const today = easternToday();
  const startedAt = new Date().toISOString();
  const prev = readJson(DATA);
  const discovered = readJson(DISCOVERED) || {};
  const control = controlOn(today);
  const sources = [];
  const addSource = (s) => { sources.push({ fetchedAt: new Date().toISOString(), ...s }); log(`  ${s.ok ? 'ok ' : 'ERR'} ${s.id}: ${s.ok ? `${s.count} kept of ${s.total}` : s.error}`); };
  const carry = (id) => (prev && prev.sources ? prev.sources.filter((s) => s.id === id || s.group === id).map((s) => ({ ...s, carried: true })) : []);

  log(`Scrape started ${startedAt} (today in Washington: ${today})`);

  // ── roster ───────────────────────────────────────────────────────────────
  log('Roster of current members…');
  let members = [];
  try { members = await loadRoster(); } catch (e) { log('  roster failed: ' + e.message); }
  const match = buildMatcher(members);
  const dems = members.filter((m) => m.caucus === 'D');
  sources.push({ id: 'roster', label: 'Members of Congress (congress-legislators)', kind: 'data file', url: 'https://github.com/unitedstates/congress-legislators', ok: members.length > 0, count: dems.length, total: members.length, error: members.length ? null : 'download failed', fetchedAt: new Date().toISOString() });
  log(`  ${members.length} members, ${dems.length} Democratic or caucusing with Democrats`);

  // ── organizations: merge hand-set config over discovery ──────────────────
  const orgs = ORGS.map((o) => {
    const d = discovered[o.id] || {};
    const board = o.board || pickBoard(d);
    return {
      ...o, board,
      page: o.page || goodInternUrl(d.internUrl) || null,
      careers: d.careersUrl || null,
      otherSystem: board ? null : otherSystem(d),
      siteBlocked: typeof d.homeStatus === 'string' ? d.homeStatus : null,
    };
  });

  let postings = [];
  const keep = (src) => (prev && prev.postings ? prev.postings.filter((p) => src(p)) : []);

  // ── job boards ───────────────────────────────────────────────────────────
  const boardInfo = {};
  if (runs('boards')) {
    const withBoards = orgs.filter((o) => o.board);
    log(`Job boards: ${withBoards.length} organizations…`);
    const res = await pool(withBoards, 6, async (o) => ({ o, r: await fetchBoard(o, today) }));
    for (const { o, r } of res) {
      boardInfo[o.id] = { ok: r.ok, total: r.total, error: r.error || null, count: r.postings.length };
      addSource({ id: `board:${o.id}`, group: 'boards', label: `${o.short || o.name} job board (${LABELS[o.board.type]})`, kind: 'api', url: boardUrl(o.board), ok: r.ok, count: r.postings.length, total: r.total, error: r.error || null });
      postings.push(...r.postings);
      // a board that fails today keeps what it showed on the last run instead of going blank
      if (!r.ok) postings.push(...keep((p) => p.orgId === o.id && !['senate', 'house', 'usajobs'].includes(p.source)));
    }
  } else {
    postings.push(...keep((p) => !['senate', 'house', 'usajobs'].includes(p.source)));
    sources.push(...carry('boards'));
    for (const s of carry('boards')) boardInfo[s.id.replace('board:', '')] = { ok: s.ok, total: s.total, error: s.error, count: s.count };
  }

  // ── Senate ───────────────────────────────────────────────────────────────
  if (runs('senate')) {
    log('Senate Employment Office…');
    const r = await senate({ today, match, senateMajority: control.senate });
    addSource({ id: 'senate', label: 'Senate Employment Office careers site', kind: 'html', url: `${SENATE_SITE}/jobs`, ok: r.ok, count: r.postings.length, total: r.total, error: r.error || null });
    if (r.ok) postings.push(...r.postings); else postings.push(...keep((p) => p.source === 'senate'));
  } else { postings.push(...keep((p) => p.source === 'senate')); sources.push(...carry('senate')); }

  // ── House ────────────────────────────────────────────────────────────────
  if (runs('house')) {
    log('House Employment Bulletin…');
    const r = await house({ today, match, houseMajority: control.house });
    addSource({ id: 'house', label: 'House Employment Bulletin (internships)', kind: 'pdf archive', url: 'https://github.com/dwillis/house-jobs', ok: r.ok, count: r.postings.length, total: r.total, error: r.error || null, note: r.ok ? `Bulletin dated ${r.bulletinDate}${r.note ? '. ' + r.note : ''}` : null, bulletinDate: r.bulletinDate || null });
    if (r.ok) postings.push(...r.postings); else postings.push(...keep((p) => p.source === 'house'));
  } else { postings.push(...keep((p) => p.source === 'house')); sources.push(...carry('house')); }

  // ── USAJOBS ──────────────────────────────────────────────────────────────
  if (runs('usajobs')) {
    log('USAJOBS student announcements…');
    const r = await usajobs({ today });
    addSource({ id: 'usajobs', label: 'USAJOBS student and intern announcements (Washington, DC)', kind: 'api', url: 'https://www.usajobs.gov/search/results/?hp=student&l=Washington%2C%20District%20of%20Columbia', ok: r.ok, count: r.postings.length, total: r.total, error: r.error || null, note: r.note || null });
    if (r.ok) postings.push(...r.postings); else postings.push(...keep((p) => p.source === 'usajobs'));
  } else { postings.push(...keep((p) => p.source === 'usajobs')); sources.push(...carry('usajobs')); }

  // ── member offices ───────────────────────────────────────────────────────
  let officeResults = {};
  if (runs('offices') && dems.length) {
    const prevOffices = new Map(((prev && prev.offices) || []).map((o) => [o.id, o]));
    const todo = args.missing ? dems.filter((m) => !(prevOffices.get(m.id) && prevOffices.get(m.id).status === 'found')) : dems;
    if (args.missing) for (const o of prevOffices.values()) officeResults[o.id] = fromPrev(o);
    log(`Member offices: crawling ${todo.length} sites…`);
    const r = await offices({ members: todo, today, onProgress: (d, n) => log(`  ${d}/${n}`) });
    for (const x of r.results) {
      // a site that timed out today but was read on an earlier run keeps its earlier reading
      const po = prevOffices.get(x.id);
      officeResults[x.id] = x.status !== 'found' && po && po.status === 'found' ? fromPrev(po) : x;
    }
    const foundAll = dems.filter((m) => officeResults[m.id] && officeResults[m.id].status === 'found').length;
    addSource({ id: 'offices', label: 'Democratic member-office websites', kind: 'html crawl', url: 'https://www.congress.gov/members', ok: true, count: foundAll, total: dems.length, error: null, note: `${foundAll} of ${dems.length} offices had an internship page we could read` });
  } else {
    for (const o of (prev && prev.offices) || []) officeResults[o.id] = fromPrev(o);
    sources.push(...carry('offices'));
  }

  // ── organization pages ───────────────────────────────────────────────────
  const pageInfo = {};
  if (runs('pages')) {
    const targets = orgs.filter((o) => !o.noCrawl && (o.page || o.careers));
    log(`Organization pages: reading ${targets.length}…`);
    const res = await pool(targets, 8, async (o) => ({ o, p: await readPage(o.page || o.careers, today) }));
    let okCount = 0;
    for (const { o, p } of res) {
      if (p.ok) okCount++;
      const { text, mentionsIntern, length, ...rest } = p; // keep the facts, not the page text
      // dates on a general careers page belong to staff jobs: only a real internship page is read for dates
      if (!o.page && rest.ok) Object.assign(rest, { windows: [], opens: [], notices: [], rolling: false, paid: 'unknown', payNote: null, applyUrl: null, needs: [], level: [] });
      pageInfo[o.id] = { ...rest, isInternPage: !!o.page, checkedAt: new Date().toISOString() };
    }
    addSource({ id: 'pages', label: 'Organization internship and careers pages', kind: 'html', url: null, ok: true, count: okCount, total: targets.length, error: null, note: targets.length === okCount ? 'Every page loaded' : `${targets.length - okCount} ${targets.length - okCount === 1 ? 'page' : 'pages'} refused automated requests or failed to load` });
  } else {
    for (const o of (prev && prev.orgs) || []) if (o.scraped) pageInfo[o.id] = o.scraped;
    sources.push(...carry('pages'));
  }

  // ── assemble ─────────────────────────────────────────────────────────────
  const prevPost = new Map(((prev && prev.postings) || []).map((p) => [p.id, p]));
  const prevOrg = new Map(((prev && prev.orgs) || []).map((o) => [o.id, o]));
  const prevOffice = new Map(((prev && prev.offices) || []).map((o) => [o.id, o]));
  const seenIds = new Set();
  postings = postings.filter((p) => p && p.id && !seenIds.has(p.id) && seenIds.add(p.id));
  for (const p of postings) p.firstSeen = (prevPost.get(p.id) && prevPost.get(p.id).firstSeen) || startedAt;
  postings.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (b.postedAt || '').localeCompare(a.postedAt || ''));

  const outOrgs = orgs.map((o) => {
    const pi = pageInfo[o.id] || null;
    const po = prevOrg.get(o.id);
    const prevHash = po && po.scraped && po.scraped.hash;
    const bi = boardInfo[o.id];
    return {
      id: o.id, name: o.name, short: o.short || null, group: o.group, url: o.url, blurb: o.blurb || null,
      page: o.page || null, careers: o.careers || null, linkOnly: !!o.noCrawl,
      board: o.board ? { type: o.board.type, label: LABELS[o.board.type] || o.board.type, url: boardUrl(o.board), ok: bi ? bi.ok : null, total: bi ? bi.total : null, error: bi ? bi.error : null } : null,
      otherSystem: o.otherSystem, siteBlocked: o.siteBlocked,
      cycles: o.cycles || [],
      scraped: pi ? { ...pi, changed: !!(pi.ok && prevHash && pi.hash && prevHash !== pi.hash) } : null,
      postingIds: postings.filter((p) => p.orgId === o.id).map((p) => p.id),
    };
  });

  const outOffices = dems.map((m) => {
    const r = officeResults[m.id] || { status: 'not-checked', windows: [], opens: [], notices: [] };
    const po = prevOffice.get(m.id);
    return {
      id: m.id, name: m.name, last: m.last, chamber: m.chamber, party: m.party, state: m.state, stateName: m.stateName, district: m.district, rank: m.rank,
      url: m.url, office: m.office, phone: m.phone, termEnd: m.termEnd,
      internUrl: r.internUrl || null, status: r.status, error: r.error || null,
      windows: r.windows || [], opens: r.opens || [], notices: r.notices || [], rolling: !!r.rolling, paid: r.paid || 'unknown', payNote: r.payNote || null, applyUrl: r.applyUrl || null, needs: r.needs || [], level: r.level || [],
      hash: r.hash || null, changed: !!(po && po.hash && r.hash && po.hash !== r.hash), checkedAt: r.checkedAt || null,
      postingIds: postings.filter((p) => p.member && p.member.id === m.id).map((p) => p.id),
    };
  }).sort((a, b) => a.stateName.localeCompare(b.stateName) || (a.chamber === b.chamber ? 0 : a.chamber === 'senate' ? -1 : 1) || (Number(a.district) || 0) - (Number(b.district) || 0) || a.last.localeCompare(b.last));

  const changes = { since: prev ? prev.meta.generatedAt : null, newPostings: [], gonePostings: [], changedPages: [] };
  if (prev) {
    changes.newPostings = postings.filter((p) => !prevPost.has(p.id)).map((p) => p.id);
    changes.gonePostings = [...prevPost.values()].filter((p) => !seenIds.has(p.id)).map((p) => ({ id: p.id, title: p.title, org: p.org }));
    changes.changedPages = [
      ...outOrgs.filter((o) => o.scraped && o.scraped.changed).map((o) => ({ kind: 'org', id: o.id, name: o.short || o.name, url: o.scraped.url })),
      ...outOffices.filter((o) => o.changed).map((o) => ({ kind: 'office', id: o.id, name: o.name, url: o.internUrl })),
    ];
  }

  // Ratings are written from this digest (see RATING_GUIDE.md). Postings carried over from an
  // earlier run have no fresh text, so their previous digest entry is kept.
  const prevDigests = (readJson(DIGESTS) || {}).postings || {};
  const digests = {};
  for (const p of postings) {
    if (p.excerpt) digests[p.id] = { org: p.orgFull || p.org, title: p.title, term: p.term, role: p.role, place: p.place, location: p.location, paid: p.paid, pay: p.payNote, deadline: p.deadline, needs: p.needs, level: p.level, facts: p.facts, text: p.excerpt };
    else if (prevDigests[p.id]) digests[p.id] = prevDigests[p.id];
    delete p.excerpt;
  }
  fs.mkdirSync(path.dirname(DIGESTS), { recursive: true });
  fs.writeFileSync(DIGESTS, JSON.stringify({ generatedAt: startedAt, postings: digests }, null, 1));

  const hill = postings.filter((p) => p.source === 'senate' || p.source === 'house');
  const out = {
    meta: {
      generatedAt: startedAt, finishedAt: new Date().toISOString(), today, version: 1,
      control: { house: control.house, senate: control.senate, from: control.from, next: CONTROL.find((c) => c.from > today) || null },
      counts: {
        postings: postings.length,
        hillPostings: hill.length, hillDem: hill.filter((p) => p.party === 'D').length,
        orgPostings: postings.filter((p) => !['senate', 'house', 'usajobs'].includes(p.source)).length,
        federalPostings: postings.filter((p) => p.source === 'usajobs').length,
        orgs: outOrgs.length, offices: outOffices.length, officesWithPage: outOffices.filter((o) => o.status === 'found').length,
        officesWithDates: outOffices.filter((o) => o.windows.length).length,
      },
    },
    sources, postings, orgs: outOrgs, offices: outOffices, changes,
  };
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  if (prev) fs.writeFileSync(path.join(ROOT, 'data', 'previous.json'), JSON.stringify(prev));
  fs.writeFileSync(DATA, JSON.stringify(out, null, 1));
  log(`\nWrote ${path.relative(process.cwd(), DATA)}: ${postings.length} live postings (${out.meta.counts.hillDem} from Democratic Hill offices), ${outOrgs.length} organizations, ${outOffices.length} member offices.`);
  if (prev) log(`Since last run: ${changes.newPostings.length} new postings, ${changes.gonePostings.length} gone, ${changes.changedPages.length} pages changed.`);
  const failed = sources.filter((s) => !s.ok && !s.carried);
  if (failed.length) log(`Sources that failed: ${failed.map((s) => s.id).join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
