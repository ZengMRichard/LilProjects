'use strict';
/**
 * Job-board adapters. Each takes an org with `board: { type, token }` and returns
 * { ok, error, total, postings } where postings are the early-career roles
 * (internships, fellowships, clerkships) in the shared posting shape.
 */
const { fetchJson, fetchText, politeFetch, pool } = require('../lib/http');
const T = require('../lib/text');

function finish(org, source, raw, today) {
  const body = raw.body || '';
  const ref = (raw.postedAt || today).slice(0, 10);
  const dl = T.pickDeadline(body, ref);
  const term = T.detectTerm(raw.title, body, ref);
  const pay = T.detectPay(`${raw.title}\n${body}`);
  const closes = raw.closesAt ? raw.closesAt.slice(0, 10) : dl.deadline;
  // "applications open September 1, 2026": when the posting says so, keep the opening date too
  const opened = T.extractWindows(body, ref, { pastSlack: 200 }).opens.filter((o) => !o.approx && (!closes || o.iso <= closes)).sort((a, b) => a.iso.localeCompare(b.iso))[0];
  return {
    id: `${source}:${org.id}:${raw.nativeId}`,
    source, orgId: org.id, org: org.short || org.name, orgFull: org.name, group: org.group,
    title: raw.title.replace(/\s+/g, ' ').trim(), url: raw.url,
    location: raw.location || null, place: T.placeOf(raw.location, body),
    role: T.classifyRole(raw.title) || 'internship',
    term: term ? term.label : null,
    postedAt: raw.postedAt ? raw.postedAt.slice(0, 10) : null,
    opensAt: opened ? opened.iso : null,
    deadline: closes || null,
    deadlineBasis: raw.closesAt ? 'board' : (dl.deadline ? 'text' : null),
    deadlineNote: raw.closesAt ? null : dl.snippet,
    rolling: !!dl.rolling,
    paid: raw.paid || pay.paid, payNote: raw.payNote || pay.note,
    dept: raw.dept || null,
    summary: T.clip(body, 280),
  };
}

const toIso = (v) => {
  if (!v && v !== 0) return null;
  const d = new Date(typeof v === 'number' ? v : String(v).replace(' UTC', 'Z').replace(/^(\d{4}-\d\d-\d\d) (\d\d:)/, '$1T$2'));
  return isNaN(d) ? null : d.toISOString();
};

// ----------------------------------------------------------------- Greenhouse
// https://developers.greenhouse.io/job-board.html  (public, no auth)
async function greenhouse(org, today) {
  const r = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(org.board.token)}/jobs?content=true`);
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  const jobs = r.json.jobs || [];
  const postings = jobs.filter((j) => T.isEarlyCareer(j.title)).map((j) => finish(org, 'greenhouse', {
    nativeId: j.id, title: j.title, url: j.absolute_url,
    location: j.location && j.location.name,
    postedAt: toIso(j.first_published || j.updated_at),
    body: T.htmlToText(T.decodeEntities(j.content || '')),
    dept: (j.departments || []).map((d) => d.name).filter(Boolean).join(', ') || null,
  }, today));
  return { ok: true, total: jobs.length, postings };
}

// ---------------------------------------------------------------------- Lever
// https://github.com/lever/postings-api  (public, no auth)
async function lever(org, today) {
  const r = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(org.board.token)}?mode=json`);
  if (!r.ok || !Array.isArray(r.json)) return { ok: false, error: r.error || 'unexpected response', total: 0, postings: [] };
  const postings = r.json.filter((j) => T.isEarlyCareer(j.text) || /intern/i.test((j.categories && j.categories.commitment) || '')).map((j) => {
    const lists = (j.lists || []).map((l) => `${l.text}\n${T.htmlToText(l.content || '')}`).join('\n');
    const body = [j.descriptionPlain || T.htmlToText(j.description || ''), lists, j.additionalPlain || T.htmlToText(j.additional || '')].join('\n');
    const c = j.categories || {};
    return finish(org, 'lever', {
      nativeId: j.id, title: j.text, url: j.hostedUrl,
      location: c.location || (c.allLocations || []).join('; ') || null,
      postedAt: toIso(j.createdAt), body, dept: c.team || c.department || null,
    }, today);
  });
  return { ok: true, total: r.json.length, postings };
}

// ------------------------------------------------------------------- Rippling
// Public board page embeds its job list as Next.js page data.
function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}
async function rippling(org, today) {
  const base = `https://ats.rippling.com/${encodeURIComponent(org.board.token)}/jobs`;
  const items = [];
  let total = 0;
  for (let page = 0; page < 10; page++) {
    const r = await politeFetch(page ? `${base}?page=${page}` : base);
    if (!r.ok) { if (!page) return { ok: false, error: r.error, total: 0, postings: [] }; break; }
    const nd = nextData(r.text);
    const q = nd && nd.props && nd.props.pageProps && nd.props.pageProps.dehydratedState && nd.props.pageProps.dehydratedState.queries;
    const data = q && q[0] && q[0].state && q[0].state.data;
    if (!data || !Array.isArray(data.items)) { if (!page) return { ok: false, error: 'board format changed', total: 0, postings: [] }; break; }
    const before = items.length;
    for (const it of data.items) if (!items.some((x) => x.id === it.id)) items.push(it);
    total = data.totalItems || data.total || items.length;
    const pages = data.totalPages || Math.ceil(total / (data.pageSize || 20));
    if (items.length === before || page + 1 >= pages) break;
  }
  const early = items.filter((it) => T.isEarlyCareer(it.name) || /intern/i.test((it.department && it.department.name) || ''));
  const postings = await pool(early, 3, async (it) => {
    let body = '', postedAt = null;
    const d = await politeFetch(it.url);
    if (d.ok) {
      const nd = nextData(d.text);
      const jp = nd && nd.props && nd.props.pageProps && nd.props.pageProps.apiData && nd.props.pageProps.apiData.jobPost;
      if (jp) { body = T.htmlToText((jp.description && jp.description.role) || ''); postedAt = toIso(jp.createdOn); }
    }
    const loc = (it.locations || []).map((l) => l.name).filter(Boolean).join('; ');
    return finish(org, 'rippling', { nativeId: it.id, title: it.name, url: it.url, location: loc, postedAt, body, dept: it.department && it.department.name }, today);
  });
  return { ok: true, total: Math.max(total, items.length), postings };
}

// ------------------------------------------------------------------ Paylocity
async function paylocity(org, today) {
  // numeric module ids live under /List/, GUID ids under /All/
  const forms = /^[0-9a-f]{8}-/i.test(org.board.token) ? ['All', 'List'] : ['List', 'All'];
  let r, m;
  for (const form of forms) {
    r = await politeFetch(`https://recruiting.paylocity.com/recruiting/jobs/${form}/${org.board.token}`);
    m = r.ok ? r.text.match(/window\.pageData\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|\n)/) : null;
    if (m) break;
  }
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  if (!m) return { ok: false, error: 'board format changed', total: 0, postings: [] };
  let data;
  try { data = JSON.parse(m[1]); } catch (e) { return { ok: false, error: 'board data unreadable', total: 0, postings: [] }; }
  const jobs = data.Jobs || [];
  const early = jobs.filter((j) => T.isEarlyCareer(j.JobTitle));
  const postings = await pool(early, 2, async (j) => {
    const url = `https://recruiting.paylocity.com/Recruiting/Jobs/Details/${j.JobId}`;
    const d = await politeFetch(url);
    const body = d.ok ? T.htmlToText(T.mainHtml(d.text)) : (j.Description || '');
    return finish(org, 'paylocity', { nativeId: j.JobId, title: j.JobTitle, url, location: j.LocationName, postedAt: toIso(j.PublishedDate), body, dept: j.HiringDepartment }, today);
  });
  return { ok: true, total: jobs.length, postings };
}

// ------------------------------------------------------------------ Recruitee
// https://docs.recruitee.com/reference/offers  (public careers-site API)
async function recruitee(org, today) {
  const r = await fetchJson(`https://${org.board.token}.recruitee.com/api/offers/`);
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  const offers = r.json.offers || [];
  const postings = offers.filter((o) => T.isEarlyCareer(o.title)).map((o) => finish(org, 'recruitee', {
    nativeId: o.id, title: o.title, url: o.careers_url, location: o.location || [o.city, o.state_code].filter(Boolean).join(', '),
    postedAt: toIso(o.published_at), closesAt: toIso(o.close_at),
    body: T.htmlToText(`${o.description || ''}\n${o.requirements || ''}`), dept: o.department,
  }, today));
  return { ok: true, total: offers.length, postings };
}

// -------------------------------------------------------------- AcademicWorks
// Scholarship/program portal (CBCF): one table row per opportunity with a deadline.
async function academicworks(org, today) {
  const base = `https://${org.board.token}.academicworks.com`;
  const r = await politeFetch(`${base}/opportunities`);
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  const rows = r.text.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const postings = [];
  let total = 0;
  for (const row of rows) {
    const link = row.match(/href="(\/opportunities\/(\d+))"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    total++;
    const title = T.htmlToText(link[3]);
    const text = T.htmlToText(row);
    const dl = text.match(/Deadline\s*\|?\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/i);
    const award = text.match(/\$\s?[\d,]+/);
    if (!/intern|fellow/i.test(title)) continue;
    const detail = await politeFetch(base + link[1]);
    const body = detail.ok ? T.htmlToText(detail.text) : text; // the description sits outside the page's <main> region
    postings.push(finish(org, 'academicworks', {
      nativeId: link[2], title, url: base + link[1], location: 'Washington, DC',
      closesAt: dl ? `${dl[3]}-${dl[1].padStart(2, '0')}-${dl[2].padStart(2, '0')}` : null,
      body, paid: award ? 'paid' : undefined, payNote: award ? `${award[0].replace(/\s/g, '')} stipend` : undefined,
    }, today));
  }
  return { ok: true, total, postings };
}

// ------------------------------------------------------------------- Workable
async function workable(org, today) {
  const r = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(org.board.token)}?details=true`);
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  const jobs = r.json.jobs || [];
  const postings = jobs.filter((j) => T.isEarlyCareer(j.title)).map((j) => finish(org, 'workable', {
    nativeId: j.shortcode || j.id, title: j.title, url: j.url || j.application_url,
    location: [j.city, j.state, j.country].filter(Boolean).join(', ') + (j.telecommuting ? ' (remote)' : ''),
    postedAt: toIso(j.published_on || j.created_at), body: T.htmlToText(j.description || ''), dept: j.department,
  }, today));
  return { ok: true, total: jobs.length, postings };
}

// ---------------------------------------------------------------------- Ashby
async function ashby(org, today) {
  const r = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org.board.token)}`);
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  const jobs = r.json.jobs || [];
  const postings = jobs.filter((j) => T.isEarlyCareer(j.title) || /intern/i.test(j.employmentType || '')).map((j) => finish(org, 'ashby', {
    nativeId: j.id, title: j.title, url: j.jobUrl, location: j.location + (j.isRemote ? ' (remote)' : ''),
    postedAt: toIso(j.publishedAt), body: j.descriptionPlain || T.htmlToText(j.descriptionHtml || ''), dept: j.department || j.team,
  }, today));
  return { ok: true, total: jobs.length, postings };
}

// ------------------------------------------------------------------- BambooHR
async function bamboohr(org, today) {
  const base = `https://${org.board.token}.bamboohr.com/careers`;
  const r = await fetchJson(`${base}/list`);
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  const jobs = r.json.result || [];
  const early = jobs.filter((j) => T.isEarlyCareer(j.jobOpeningName) || /intern/i.test(j.employmentStatusLabel || ''));
  const postings = await pool(early, 2, async (j) => {
    const d = await fetchJson(`${base}/${j.id}/detail`);
    const jo = (d.ok && d.json.result && d.json.result.jobOpening) || {};
    const loc = j.location ? [j.location.city, j.location.state].filter(Boolean).join(', ') : null;
    return finish(org, 'bamboohr', { nativeId: j.id, title: j.jobOpeningName, url: `${base}/${j.id}`, location: loc || (j.isRemote ? 'Remote' : null), postedAt: toIso(jo.datePosted), body: T.htmlToText(jo.description || ''), dept: j.departmentLabel }, today);
  });
  return { ok: true, total: jobs.length, postings };
}

// --------------------------------------------------------------------- Breezy
async function breezy(org, today) {
  const r = await fetchJson(`https://${org.board.token}.breezy.hr/json`);
  if (!r.ok || !Array.isArray(r.json)) return { ok: false, error: r.error || 'unexpected response', total: 0, postings: [] };
  const postings = r.json.filter((j) => T.isEarlyCareer(j.name) || /intern/i.test((j.type && j.type.name) || '')).map((j) => finish(org, 'breezy', {
    nativeId: j.id, title: j.name, url: j.url, location: j.location && j.location.name, postedAt: toIso(j.published_date), body: '', dept: j.department,
  }, today));
  return { ok: true, total: r.json.length, postings };
}

// ------------------------------------------------------------------- JazzHR
async function jazzhr(org, today) {
  const base = `https://${org.board.token}.applytojob.com`;
  const r = await politeFetch(`${base}/apply/jobs/`);
  if (!r.ok) return { ok: false, error: r.error, total: 0, postings: [] };
  const rows = [...r.text.matchAll(/<a[^>]+href="((?:https?:\/\/[^"]*applytojob\.com)?\/apply\/(?:jobs\/details\/)?([A-Za-z0-9]{8,})[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
  const seen = new Set();
  const jobs = rows.map((m) => ({ url: new URL(m[1].replace(/\?&?$/, ''), base).href, id: m[2], title: T.htmlToText(m[3]) })).filter((j) => j.title && !seen.has(j.id) && seen.add(j.id));
  const early = jobs.filter((j) => T.isEarlyCareer(j.title));
  const postings = await pool(early, 2, async (j) => {
    const d = await politeFetch(j.url);
    const body = d.ok ? T.htmlToText(T.mainHtml(d.text)) : '';
    return finish(org, 'jazzhr', { nativeId: j.id, title: j.title, url: j.url, location: null, postedAt: null, body }, today);
  });
  return { ok: true, total: jobs.length, postings };
}

const ADAPTERS = { greenhouse, lever, rippling, paylocity, recruitee, academicworks, workable, ashby, bamboohr, breezy, jazzhr };
const LABELS = { greenhouse: 'Greenhouse', lever: 'Lever', rippling: 'Rippling', paylocity: 'Paylocity', recruitee: 'Recruitee', academicworks: 'AcademicWorks', workable: 'Workable', ashby: 'Ashby', bamboohr: 'BambooHR', breezy: 'Breezy', jazzhr: 'JazzHR' };

function boardUrl(board) {
  const t = board.token;
  switch (board.type) {
    case 'greenhouse': return `https://job-boards.greenhouse.io/${t}`;
    case 'lever': return `https://jobs.lever.co/${t}`;
    case 'rippling': return `https://ats.rippling.com/${t}/jobs`;
    case 'paylocity': return `https://recruiting.paylocity.com/recruiting/jobs/All/${t}`;
    case 'recruitee': return `https://${t}.recruitee.com`;
    case 'academicworks': return `https://${t}.academicworks.com/opportunities`;
    case 'workable': return `https://apply.workable.com/${t}/`;
    case 'ashby': return `https://jobs.ashbyhq.com/${t}`;
    case 'bamboohr': return `https://${t}.bamboohr.com/careers`;
    case 'breezy': return `https://${t}.breezy.hr`;
    case 'jazzhr': return `https://${t}.applytojob.com/apply/jobs/`;
    default: return null;
  }
}

async function fetchBoard(org, today) {
  const fn = ADAPTERS[org.board.type];
  if (!fn) return { ok: false, error: `no adapter for ${org.board.type}`, total: 0, postings: [], unsupported: true };
  try {
    const res = await fn(org, today);
    res.postings = (res.postings || []).filter(Boolean);
    return res;
  } catch (e) { return { ok: false, error: String((e && e.message) || e), total: 0, postings: [] }; }
}

module.exports = { fetchBoard, boardUrl, ADAPTERS, LABELS };
