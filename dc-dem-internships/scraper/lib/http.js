'use strict';
/**
 * HTTP helpers shared by every source adapter.
 *
 *  - one honest User-Agent (no browser spoofing; sites that refuse bots are recorded as "blocked")
 *  - per-host politeness: max 2 requests in flight per host, with a short gap between them
 *  - robots.txt is honored for every HTML crawl (documented public JSON APIs skip the check)
 *  - timeouts and a single retry on network errors / 5xx
 */

const UA = 'Mozilla/5.0 (compatible; HillInternTracker/1.0; personal internship-deadline tracker)';
const DEFAULT_TIMEOUT = 25000;

const hostState = new Map(); // host -> { active, queue, last }
const PER_HOST = 2;
const HOST_GAP_MS = 250;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withHostSlot(host, fn) {
  let st = hostState.get(host);
  if (!st) { st = { active: 0, queue: [], last: 0 }; hostState.set(host, st); }
  if (st.active >= PER_HOST) await new Promise((res) => st.queue.push(res));
  st.active++;
  const wait = st.last + HOST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  st.last = Date.now();
  try { return await fn(); } finally {
    st.active--;
    const next = st.queue.shift();
    if (next) next();
  }
}

/**
 * Fetch a URL as text. Never throws: returns { ok, status, url, text, error }.
 */
async function fetchText(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, headers = {}, retries = 1, method = 'GET', body } = opts;
  let host;
  try { host = new URL(url).host; } catch (e) { return { ok: false, status: 0, url, text: '', error: 'bad url' }; }
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await withHostSlot(host, async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const r = await fetch(url, {
          method, body, redirect: 'follow', signal: ctrl.signal,
          headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', ...headers },
        });
        const text = await r.text();
        return { ok: r.ok, status: r.status, url: r.url || url, text, error: r.ok ? null : `HTTP ${r.status}` };
      } catch (e) {
        const msg = e && e.name === 'AbortError' ? 'timeout' : String((e && e.cause && e.cause.code) || (e && e.message) || e);
        return { ok: false, status: 0, url, text: '', error: msg };
      } finally { clearTimeout(timer); }
    });
    if (res.ok) return res;
    lastErr = res;
    // retry only on network errors and 5xx / 429
    if (!(res.status === 0 || res.status >= 500 || res.status === 429)) break;
    if (attempt < retries) await sleep(800 * (attempt + 1));
  }
  return lastErr;
}

async function fetchJson(url, opts = {}) {
  const r = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) return { ...r, json: null };
  try { return { ...r, json: JSON.parse(r.text) }; } catch (e) { return { ...r, ok: false, json: null, error: 'invalid JSON' }; }
}

/** Run fn over items with bounded concurrency; results keep input order. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: String((e && e.message) || e) }; }
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------- robots.txt
const robotsCache = new Map(); // origin -> Promise<rules[]>

function parseRobots(txt) {
  // Collect rule groups; we obey the group for our own token if present, otherwise "*".
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'disallow' || key === 'allow') cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && 'hillinterntracker'.includes(a)));
  const star = groups.filter((g) => g.agents.includes('*'));
  const chosen = mine.length ? mine : star;
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== '');
}

function ruleMatches(rulePath, path) {
  // Supports * wildcards and the $ end anchor, as in the common robots.txt dialect.
  const esc = rulePath.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$').replace(/\$$/, '$');
  try { return new RegExp('^' + esc).test(path); } catch (e) { return path.startsWith(rulePath); }
}

async function robotsAllowed(url) {
  let u;
  try { u = new URL(url); } catch (e) { return true; }
  if (!robotsCache.has(u.origin)) {
    robotsCache.set(u.origin, (async () => {
      const r = await fetchText(u.origin + '/robots.txt', { timeout: 12000, retries: 0 });
      if (!r.ok || /<html/i.test(r.text.slice(0, 300))) return [];
      return parseRobots(r.text);
    })());
  }
  const rules = await robotsCache.get(u.origin);
  const path = u.pathname + u.search;
  let best = null; // longest matching rule wins
  for (const r of rules) {
    if (ruleMatches(r.path, path) && (!best || r.path.length > best.path.length)) best = r;
  }
  return best ? best.allow : true;
}

/** fetchText, but only if robots.txt permits it. */
async function politeFetch(url, opts = {}) {
  if (!(await robotsAllowed(url))) return { ok: false, status: 0, url, text: '', error: 'disallowed by robots.txt' };
  return fetchText(url, opts);
}

module.exports = { UA, fetchText, fetchJson, politeFetch, robotsAllowed, pool, sleep };
