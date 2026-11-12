'use strict';
/**
 * Discovery: visit each organization's site once, find its careers + internship pages,
 * and detect which hiring system (Greenhouse, Lever, …) it embeds or links to.
 *
 *   node scraper/discover.js              # every org in config/orgs.js
 *   node scraper/discover.js dnc cap      # just these ids
 *
 * Writes scraper/config/discovered.json, which run.js merges under hand-set values.
 */
const fs = require('fs');
const path = require('path');
require('./lib/proxy').ensureProxy();
const { politeFetch, pool } = require('./lib/http');
const { decodeEntities } = require('./lib/text');
const { ORGS } = require('./config/orgs');

const OUT = path.join(__dirname, 'config', 'discovered.json');

// [type, regex, token builder]
const ATS = [
  ['greenhouse', /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\/?\?for=([A-Za-z0-9_-]+)/i],
  ['greenhouse', /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([A-Za-z0-9_-]+)/i],
  ['lever', /jobs\.lever\.co\/([A-Za-z0-9_.-]+)/i],
  ['rippling', /ats\.rippling\.com\/([A-Za-z0-9_-]+)/i],
  ['paylocity', /recruiting\.paylocity\.com\/recruiting\/jobs\/(?:List|All)\/([A-Za-z0-9-]+\/[^"'\s?<>]+)/i],
  ['recruitee', /https?:\/\/([a-z0-9-]+)\.recruitee\.com/i],
  ['workable', /apply\.workable\.com\/([A-Za-z0-9_-]+)/i],
  ['ashby', /jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i],
  ['bamboohr', /https?:\/\/([a-z0-9-]+)\.bamboohr\.com/i],
  ['jazzhr', /https?:\/\/([a-z0-9-]+)\.applytojob\.com/i],
  ['breezy', /https?:\/\/([a-z0-9-]+)\.breezy\.hr/i],
  ['icims', /https?:\/\/([a-z0-9-]+)\.icims\.com/i],
  ['workday', /https?:\/\/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?[A-Za-z0-9_-]+)/i],
  ['smartrecruiters', /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i],
  ['jobvite', /jobs\.jobvite\.com\/([A-Za-z0-9_-]+)/i],
  ['adp', /workforcenow\.adp\.com\/[^"'\s<>]*cid=([A-Za-z0-9-]+)/i],
  ['ukg', /recruiting\d*\.ultipro\.com\/([A-Z0-9]+\/JobBoard\/[a-z0-9-]+)/i],
  ['paycom', /paycomonline\.net\/[^"'\s<>]*clientkey=([A-Z0-9]+)/i],
  ['paycor', /recruitingbypaycor\.com\/career\/CareerHome\.action\?clientId=([A-Za-z0-9]+)/i],
  ['applicantpro', /https?:\/\/([a-z0-9-]+)\.applicantpro\.com/i],
  ['teamtailor', /https?:\/\/([a-z0-9-]+)\.teamtailor\.com/i],
  ['pinpoint', /https?:\/\/([a-z0-9-]+)\.pinpointhq\.com/i],
  ['dayforce', /jobs\.dayforcehcm\.com\/[A-Za-z-]+\/([A-Za-z0-9]+\/[A-Za-z0-9_]+)/i],
  ['isolved', /https?:\/\/([a-z0-9-]+)\.isolvedhire\.com/i],
  ['trinet', /app\.trinethire\.com\/companies\/([0-9A-Za-z-]+)/i],
  ['gusto', /jobs\.gusto\.com\/boards\/([A-Za-z0-9-]+)/i],
  ['academicworks', /https?:\/\/([a-z0-9-]+)\.academicworks\.com/i],
  ['getro', /https?:\/\/(careers\.[a-z0-9.-]+)\/(?:jobs|companies)/i],
];
const BAD_TOKENS = new Set(['www', 'api', 'app', 'embed', 'support', 'help', 'boards', 'job-boards', 'jobs', 'careers', 'cdn', 'static', 'assets']);

function detectAts(html) {
  const found = [];
  for (const [type, re] of ATS) {
    const m = html.match(re);
    if (!m) continue;
    const token = decodeEntities(m[1]).replace(/\/+$/, '');
    if (BAD_TOKENS.has(token.toLowerCase())) continue;
    if (!found.some((f) => f.type === type)) found.push({ type, token });
  }
  return found;
}

function links(html, base) {
  const out = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href;
    try { href = new URL(decodeEntities(m[1].trim()), base).href; } catch (e) { continue; }
    if (!/^https?:/.test(href)) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80);
    out.push({ href, text });
  }
  return out;
}

const INTERN_RE = /intern(ship)?s?\b/i;
const CAREER_RE = /career|\bjobs?\b|job-|employment|work[- ]?(with|for|at)[- ]?us|join[- ]?(our[- ]?team|us|the[- ]?team)|opportunit|hiring|open[- ]?positions|get[- ]?involved/i;
const SKIP_RE = /\.(pdf|docx?|jpg|png|zip)(\?|$)|facebook\.com|twitter\.com|x\.com\/|instagram\.com|linkedin\.com|youtube\.com|mailto:|\/news\/|\/press|\/blog\/|\/story|\/article|\/20\d\d\//i;

function scoreIntern(l, host) {
  if (SKIP_RE.test(l.href)) return 0;
  let s = 0;
  let path = '';
  try { path = new URL(l.href).pathname; } catch (e) { return 0; }
  if (INTERN_RE.test(path)) s += 6;
  if (INTERN_RE.test(l.text)) s += 4;
  if (/fellowship/i.test(path + ' ' + l.text)) s += 1;
  if (s && new URL(l.href).host.replace(/^www\./, '') === host) s += 2; // same-site pages beat off-site
  if (s && /program|opportunit|apply/i.test(path + l.text)) s += 1;
  if (s && path.split('/').filter(Boolean).length > 4) s -= 2; // deep = likely a single posting / article
  return s;
}
function scoreCareer(l, host) {
  if (SKIP_RE.test(l.href)) return 0;
  let s = 0;
  let u;
  try { u = new URL(l.href); } catch (e) { return 0; }
  if (CAREER_RE.test(u.pathname)) s += 4;
  if (CAREER_RE.test(l.text)) s += 3;
  if (/career|jobs|employment/i.test(u.pathname)) s += 2;
  if (s && u.host.replace(/^www\./, '') === host) s += 1;
  if (s && u.pathname.split('/').filter(Boolean).length > 3) s -= 2;
  return s;
}
const best = (ls, fn, host) => ls.map((l) => ({ l, s: fn(l, host) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];

async function discoverOne(org) {
  const res = { id: org.id, homeStatus: null, careersUrl: null, internUrl: null, ats: [], checkedAt: new Date().toISOString(), notes: [] };
  if (org.noCrawl) { res.notes.push('link only'); return res; }
  const host = new URL(org.url).host.replace(/^www\./, '');
  const home = await politeFetch(org.url, { timeout: 25000 });
  res.homeStatus = home.ok ? home.status : (home.error || 'failed');
  const pages = [];
  if (home.ok) pages.push(home);
  let all = home.ok ? links(home.text, home.url) : [];

  // hand-set internship page counts as a starting point too
  if (org.page) {
    const p = await politeFetch(org.page, { timeout: 25000 });
    if (p.ok) { pages.push(p); res.internUrl = p.url; all = all.concat(links(p.text, p.url)); }
    else res.notes.push(`page ${org.page}: ${p.error}`);
  }
  const c = best(all, scoreCareer, host);
  if (c) {
    const cp = await politeFetch(c.l.href, { timeout: 25000 });
    if (cp.ok) { res.careersUrl = cp.url; pages.push(cp); all = all.concat(links(cp.text, cp.url)); }
  }
  if (!res.internUrl) {
    const i = best(all, scoreIntern, host);
    if (i) {
      const ip = await politeFetch(i.l.href, { timeout: 25000 });
      if (ip.ok) { res.internUrl = ip.url; pages.push(ip); }
    }
  }
  for (const p of pages) for (const a of detectAts(p.text)) if (!res.ats.some((x) => x.type === a.type && x.token === a.token)) res.ats.push(a);
  return res;
}

async function main() {
  const only = process.argv.slice(2);
  const todo = ORGS.filter((o) => !only.length || only.includes(o.id));
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
  let done = 0;
  const results = await pool(todo, 8, async (org) => {
    const r = await discoverOne(org);
    done++;
    process.stderr.write(`[${done}/${todo.length}] ${org.id}: home=${r.homeStatus} careers=${r.careersUrl ? 'y' : '-'} intern=${r.internUrl ? 'y' : '-'} ats=${r.ats.map((a) => a.type + ':' + a.token).join(',') || '-'}\n`);
    return r;
  });
  for (const r of results) if (r && r.id) prev[r.id] = r;
  fs.writeFileSync(OUT, JSON.stringify(prev, null, 1));
  console.log(`wrote ${OUT} (${Object.keys(prev).length} orgs)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
