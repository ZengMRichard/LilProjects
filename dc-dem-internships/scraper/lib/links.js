'use strict';
/** Link extraction + scoring, shared by discovery and the member-office crawl. */
const { decodeEntities } = require('./text');

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
const SKIP_RE = /\.(pdf|docx?|jpg|png|zip)(\?|$)|facebook\.com|twitter\.com|x\.com\/|instagram\.com|linkedin\.com|youtube\.com|mailto:|\/news\/|\/press|\/blog\/|\/story|\/article|\/media\/|\/20\d\d\//i;

const bareHost = (h) => h.replace(/^www\./, '');

function scoreIntern(l, host) {
  if (SKIP_RE.test(l.href)) return 0;
  let u;
  try { u = new URL(l.href); } catch (e) { return 0; }
  let s = 0;
  if (INTERN_RE.test(u.pathname)) s += 6;
  if (INTERN_RE.test(l.text)) s += 4;
  if (!s) return 0;
  if (/fellowship/i.test(u.pathname + ' ' + l.text)) s += 1;
  if (bareHost(u.host) === host) s += 2;
  if (/program|opportunit|apply/i.test(u.pathname + l.text)) s += 1;
  if (u.pathname.split('/').filter(Boolean).length > 4) s -= 2;
  if (/international|internal|internet/i.test(u.pathname + l.text) && !/internship/i.test(u.pathname + l.text)) return 0;
  return s;
}

function scoreCareer(l, host) {
  if (SKIP_RE.test(l.href)) return 0;
  let u;
  try { u = new URL(l.href); } catch (e) { return 0; }
  let s = 0;
  if (CAREER_RE.test(u.pathname)) s += 4;
  if (CAREER_RE.test(l.text)) s += 3;
  if (!s) return 0;
  if (/career|jobs|employment/i.test(u.pathname)) s += 2;
  if (bareHost(u.host) === host) s += 1;
  if (u.pathname.split('/').filter(Boolean).length > 3) s -= 2;
  return s;
}

function best(ls, fn, host) {
  const scored = ls.map((l) => ({ l, s: fn(l, host) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored[0] ? scored[0].l : null;
}
function ranked(ls, fn, host) {
  const seen = new Set();
  return ls.map((l) => ({ l, s: fn(l, host) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
    .filter((x) => (seen.has(x.l.href) ? false : seen.add(x.l.href))).map((x) => x.l);
}

module.exports = { links, scoreIntern, scoreCareer, best, ranked, bareHost, INTERN_RE };
