'use strict';
/**
 * Build the site from the latest scrape.
 *
 *   node build.js
 *
 * Reads data/internships.json, trims it to what the page shows, and writes:
 *   site/index.html   page content only (the form Claude Artifacts publish)
 *   dist/index.html   the same page as a complete standalone HTML document for any static host
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'internships.json'), 'utf8'));
const template = fs.readFileSync(path.join(ROOT, 'site', 'template.html'), 'utf8');

const win = (w) => ({ iso: w.iso, y: w.hasYear ? 1 : 0, m: w.month, d: w.day, s: w.season || null, sy: w.seasonYear || null, t: w.term || null, g: w.termGuessed ? 1 : 0, a: w.approx ? 1 : 0, q: w.snippet || '' });

// The site is about the Democratic side: postings from Republican offices are dropped here.
const postings = data.postings.filter((p) => p.party !== 'R').map((p) => ({
  id: p.id, src: p.source, org: p.org, orgFull: p.orgFull || null, orgId: p.orgId, group: p.group, chamber: p.chamber || null,
  title: p.title, url: p.url, srcUrl: p.sourceUrl || null, email: p.applyEmail || null, ref: p.refNo || null,
  loc: p.location || null, place: p.place, role: p.role, term: p.term || null,
  posted: p.postedAt || null, opens: p.opensAt || null,
  dl: p.deadline || null, dlBasis: p.deadlineBasis || null, dlNote: p.deadlineNote || null, rolling: p.rolling ? 1 : 0,
  paid: p.paid, pay: p.payNote || null,
  party: p.party || null, via: p.partyVia || null,
  st: p.member ? p.member.state : null, dist: p.member ? p.member.district || null : null, mid: p.member ? p.member.id : null,
  sum: p.summary || '', seen: p.firstSeen ? p.firstSeen.slice(0, 10) : null, fresh: p.newThisWeek ? 1 : 0, status: p.status || null,
}));
const kept = new Set(postings.map((p) => p.id));

const orgs = data.orgs.map((o) => {
  const s = o.scraped;
  return {
    id: o.id, name: o.name, short: o.short, group: o.group, url: o.url, blurb: o.blurb,
    page: o.page, careers: o.careers, linkOnly: o.linkOnly ? 1 : 0,
    board: o.board ? { label: o.board.label, url: o.board.url, ok: o.board.ok ? 1 : 0, total: o.board.total } : null,
    other: o.otherSystem, blocked: o.siteBlocked ? 1 : 0,
    cycles: o.cycles || [],
    facts: s && s.ok && s.isInternPage ? { url: s.url, w: (s.windows || []).map(win), o: (s.opens || []).map(win), n: s.notices || [], rolling: s.rolling ? 1 : 0, paid: s.paid, pay: s.payNote, at: s.checkedAt } : null,
    pageErr: s && !s.ok ? s.error : null, changed: s && s.changed ? 1 : 0,
    pids: (o.postingIds || []).filter((id) => kept.has(id)),
  };
});

const offices = data.offices.map((o) => ({
  id: o.id, name: o.name, last: o.last, ch: o.chamber === 'senate' ? 'S' : 'H', party: o.party, st: o.state, stn: o.stateName, dist: o.district,
  url: o.url, room: o.office, phone: o.phone, page: o.internUrl, found: o.status === 'found' ? 1 : 0,
  w: (o.windows || []).map(win), o: (o.opens || []).map(win), n: (o.notices || []).slice(0, 2), rolling: o.rolling ? 1 : 0,
  paid: o.paid, pay: o.payNote, apply: o.applyUrl, changed: o.changed ? 1 : 0,
  pids: (o.postingIds || []).filter((id) => kept.has(id)),
}));

const sources = data.sources.map((s) => ({ id: s.id, group: s.group || null, label: s.label, kind: s.kind, url: s.url, ok: s.ok ? 1 : 0, count: s.count, total: s.total, error: s.error || null, note: s.note || null, at: s.fetchedAt, carried: s.carried ? 1 : 0 }));

const out = {
  meta: data.meta, sources, postings, orgs, offices,
  changes: { since: data.changes.since, fresh: data.changes.newPostings.filter((id) => kept.has(id)), gone: data.changes.gonePostings.length, pages: data.changes.changedPages },
};

// JSON inside a <script> block: neutralize anything that could end the block early.
const json = JSON.stringify(out).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
if (!template.includes('/*__DATA__*/')) throw new Error('template.html is missing the /*__DATA__*/ placeholder');
const page = template.replace('/*__DATA__*/', () => json);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'site', 'index.html'), page);
const standalone = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n${page}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(ROOT, 'dist', 'index.html'), standalone);
fs.writeFileSync(path.join(ROOT, 'dist', 'internships.json'), JSON.stringify(data));

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`Built site/index.html (${kb(page.length)}) and dist/index.html from the scrape of ${data.meta.generatedAt}`);
console.log(`${postings.length} postings shown (${data.postings.length - postings.length} from Republican offices left out), ${orgs.length} organizations, ${offices.length} offices.`);
