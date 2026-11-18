'use strict';
/**
 * U.S. Senate Employment Office careers site (replaced the old Senate Employment Bulletin
 * pages in 2026). The site publishes a sitemap of active postings, and every posting page
 * carries schema.org JobPosting data, so no HTML scraping of layout is needed.
 */
const { politeFetch, pool } = require('../lib/http');
const T = require('../lib/text');
const S = require('../lib/signals');

const SITE = 'https://careers.employment.senate.gov';
const SITEMAP = `${SITE}/sitemap_active_jobs.xml`;

const INSTITUTIONAL = /sergeant at arms|secretary of the senate|capitol police|architect of the capitol|chaplain|senate library|disbursing|legislative counsel|employment office|stars of valor|page program|senate historical|office of (?:congressional|senate)/i;

function jobPosting(html) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const b of blocks) {
    const json = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const d = JSON.parse(json);
      const list = Array.isArray(d) ? d : [d];
      const jp = list.find((x) => x && x['@type'] === 'JobPosting');
      if (jp) return jp;
    } catch (e) { /* malformed block: try the next */ }
  }
  return null;
}

function partyOf(org, text, match, majority) {
  const m = match(`${org}\n${text.slice(0, 1500)}`, 'senate');
  if (m) return { party: m.caucus, member: m };
  const hay = `${org} ${text.slice(0, 2500)}`;
  if (/\bDemocrat(?:ic)?\b|\bDem\.? (?:office|senator)/i.test(hay) && !/\bRepublican\b/i.test(hay)) return { party: 'D', member: null };
  if (/\bRepublican\b|\bGOP\b|\bconservative\b/i.test(hay) && !/\bDemocrat/i.test(hay)) return { party: 'R', member: null };
  if (/\bmajority\b/i.test(org) && majority) return { party: majority, member: null, viaMajority: true };
  if (/\bminority\b/i.test(org) && majority) return { party: majority === 'D' ? 'R' : 'D', member: null, viaMajority: true };
  if (INSTITUTIONAL.test(org)) return { party: 'N', member: null }; // nonpartisan Senate office
  return { party: null, member: null };
}

async function senate({ today, match, senateMajority }) {
  const sm = await politeFetch(SITEMAP);
  if (!sm.ok) return { ok: false, error: sm.error, total: 0, postings: [] };
  const urls = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => /\/job\//.test(u));
  const pages = await pool(urls, 4, async (url) => {
    const r = await politeFetch(url);
    if (!r.ok) return null;
    const jp = jobPosting(r.text);
    return jp ? { url, jp } : null;
  });
  const postings = [];
  let total = 0;
  for (const p of pages) {
    if (!p) continue;
    total++;
    const { jp, url } = p;
    const title = T.decodeEntities(jp.title || '').trim();
    const isIntern = String(jp.employmentType || '').toUpperCase() === 'INTERN' || T.isEarlyCareer(title);
    if (!isIntern) continue;
    const body = T.htmlToText(jp.description || '');
    const org = T.decodeEntities((jp.hiringOrganization && jp.hiringOrganization.name) || '').trim();
    const addr = (jp.jobLocation && (Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation).address) || {};
    const location = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', ');
    const posted = jp.datePosted ? String(jp.datePosted).slice(0, 10) : null;
    const ref = posted || today;
    const dl = T.pickDeadline(body, ref);
    // validThrough is when the posting comes down (usually midnight after the deadline)
    let expiry = null;
    if (jp.validThrough) {
      const d = new Date(jp.validThrough);
      if (!isNaN(d)) { d.setUTCHours(d.getUTCHours() - 6); expiry = d.toISOString().slice(0, 10); }
    }
    const pp = partyOf(org, `${title}\n${body}`, match, senateMajority);
    const term = T.detectTerm(title, body, ref);
    const pay = T.detectPay(`${title}\n${body}`);
    const id = (jp.identifier && jp.identifier.value) || url.replace(/.*-(\d+)$/, '$1');
    postings.push({
      id: `senate:${id}`, source: 'senate', chamber: 'senate',
      orgId: 'senate-bulletin', org: pp.member ? `Sen. ${pp.member.name}` : (org || 'Senate office'), orgFull: org || 'Senate office', group: 'hill',
      title, url,
      location, place: T.placeOf(location, body),
      role: T.classifyRole(title) || 'internship',
      term: term ? term.label : null,
      postedAt: posted,
      deadline: dl.deadline || expiry, deadlineBasis: dl.deadline ? 'text' : (expiry ? 'expiry' : null), deadlineNote: dl.snippet, rolling: !!dl.rolling,
      paid: pay.paid, payNote: pay.note,
      party: pp.party, partyVia: pp.member ? 'member' : (pp.viaMajority ? 'majority' : (pp.party ? 'text' : null)),
      member: pp.member ? { id: pp.member.id, name: pp.member.name, state: pp.member.state } : null,
      summary: T.clip(body, 280),
      needs: S.requirements(body), level: S.levels(title, body), facts: S.facts(title, body), excerpt: T.clip(body, 1100),
    });
  }
  return { ok: true, total, postings };
}

module.exports = { senate, SITE };
