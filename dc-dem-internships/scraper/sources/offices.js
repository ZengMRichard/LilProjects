'use strict';
/**
 * Member-office crawl. For every Democratic (or Democratic-caucusing) member of Congress:
 * open the office website, find its internship page, and read the application deadlines
 * it publishes. Each office runs its own program, so this is where most Hill
 * internships are actually advertised.
 *
 * Finding the page, in order: an "internship" link on the homepage → the same on the
 * site's Services / Students / Help hub pages → the site's sitemap.xml → a few common paths.
 */
const { politeFetch, pool } = require('../lib/http');
const L = require('../lib/links');
const { readPage } = require('./pages');

const GUESSES = ['/services/internships', '/internships', '/services/internship', '/services/students/internships', '/constituent-services/internships', '/serving-you/internships', '/students/internships', '/help/internships', '/services/student-resources/internships', '/internship'];
const HUB_RE = /service|student|help|constituent|resources|serving|opportunit|get-involved|youth/i;

/** Prefer the Washington program page over a district-office one when a site has both. */
function dcFirst(urls) {
  const score = (u) => (/washington|[-/]dc\b|d-c\b|capitol/i.test(u) ? -1 : /district|regional|local|state-office|in-[a-z]+-[a-z]+|field/i.test(u) ? 1 : 0);
  return urls.slice().sort((a, b) => score(a) - score(b));
}

/** Small pages that only bounce the browser elsewhere (meta refresh / JS redirect). */
function bounceTarget(html, base) {
  if (html.length > 3000) return null;
  const m = html.match(/http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i) || html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
  if (!m) return null;
  try { return new URL(m[1], base).href; } catch (e) { return null; }
}

async function fetchHome(url) {
  let r = await politeFetch(url, { timeout: 25000 });
  if (r.ok) {
    const t = bounceTarget(r.text, r.url);
    if (t) { const r2 = await politeFetch(t, { timeout: 25000 }); if (r2.ok) r = r2; }
  }
  return r;
}

async function crawlOffice(m, today) {
  const out = { id: m.id, internUrl: null, status: 'not-found', windows: [], opens: [], notices: [], rolling: false, paid: 'unknown', payNote: null, applyUrl: null, hash: null, checkedAt: new Date().toISOString() };
  if (!m.url) { out.status = 'no-website'; return out; }
  const host = L.bareHost(new URL(m.url).host);
  const tried = new Set();
  const tryPages = async (urls) => {
    for (const url of dcFirst(urls)) {
      const key = url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
      if (tried.has(key)) continue;
      tried.add(key);
      const p = await readPage(url, today);
      if (!p.ok || !p.mentionsIntern || p.length < 250) continue;
      // a real program page talks about applying; a soft-404 or nav stub does not
      if (!/appl(y|ication)|resume|résumé|deadline|session|semester/i.test(p.text)) continue;
      Object.assign(out, { internUrl: p.url, status: 'found', windows: p.windows, opens: p.opens, notices: p.notices, rolling: p.rolling, paid: p.paid, payNote: p.payNote, applyUrl: p.applyUrl, hash: p.hash });
      delete out.error;
      return true;
    }
    return false;
  };

  const home = await fetchHome(m.url);
  let homeLinks = [];
  if (home.ok) homeLinks = L.links(home.text, home.url);
  else { out.status = /robots/.test(home.error || '') ? 'robots' : 'site-error'; out.error = home.error; }

  // 1. internship links on the homepage
  if (await tryPages(L.ranked(homeLinks, L.scoreIntern, host).slice(0, 3).map((l) => l.href))) return out;

  // 2. hub pages (Services, Students, Help…) one hop away
  const hubs = [];
  const seenHub = new Set();
  for (const l of homeLinks) {
    let u;
    try { u = new URL(l.href); } catch (e) { continue; }
    if (L.bareHost(u.host) !== host) continue;
    if (!HUB_RE.test(u.pathname + ' ' + l.text)) continue;
    const key = u.origin + u.pathname;
    if (seenHub.has(key) || u.pathname.split('/').filter(Boolean).length > 2) continue;
    seenHub.add(key);
    hubs.push(key);
  }
  for (const hub of hubs.slice(0, 3)) {
    const r = await politeFetch(hub, { timeout: 20000 });
    if (!r.ok) continue;
    const c = L.ranked(L.links(r.text, r.url), L.scoreIntern, host).slice(0, 2).map((l) => l.href);
    if (c.length && (await tryPages(c))) return out;
  }

  // 3. sitemap.xml
  const base = home.ok ? new URL(home.url).origin : m.url;
  const sm = await politeFetch(base + '/sitemap.xml', { timeout: 20000, retries: 0 });
  if (sm.ok) {
    let locs = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1]);
    // sitemap index: open the first few child sitemaps that look like page lists
    if (/<sitemapindex/i.test(sm.text)) {
      const kids = locs.filter((u) => !/news|press|post|media|video|photo|event/i.test(u)).slice(0, 3);
      locs = [];
      for (const k of kids) {
        const kr = await politeFetch(k, { timeout: 20000, retries: 0 });
        if (kr.ok) locs.push(...[...kr.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1]));
      }
    }
    const hits = locs.filter((u) => /intern/i.test(u) && !/news|press|\/20\d\d\/|statement|release/i.test(u)).sort((a, b) => a.length - b.length).slice(0, 3);
    if (hits.length && (await tryPages(hits))) return out;
  }

  // 4. common paths
  await tryPages(GUESSES.map((g) => base + g));
  return out;
}

async function offices({ members, today, onProgress }) {
  let done = 0;
  const results = await pool(members, 12, async (m) => {
    const r = await crawlOffice(m, today);
    done++;
    if (onProgress && done % 20 === 0) onProgress(done, members.length);
    return r;
  });
  const found = results.filter((r) => r && r.status === 'found').length;
  return { ok: true, total: members.length, found, results: results.filter(Boolean) };
}

module.exports = { offices, crawlOffice };
