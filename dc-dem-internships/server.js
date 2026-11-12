'use strict';
/**
 * Local server: the site plus a small JSON API over the latest scrape.
 *
 *   node server.js            → http://127.0.0.1:4127
 *
 *   GET  /                    the site (dist/index.html)
 *   GET  /api/internships     the whole dataset
 *   GET  /api/postings        live postings; filters: ?source=senate|house|usajobs|lever|…
 *                             &party=D  &place=dc  &open=1  &q=text
 *   GET  /api/offices         Democratic member offices; filters: ?state=NY &chamber=senate
 *   GET  /api/status          when the data was scraped, and whether a refresh is running
 *   POST /api/refresh         run the scraper and rebuild (add ?fast=1 to skip the office crawl)
 *
 * It listens on 127.0.0.1 only, so nothing outside this machine can start a scrape.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4127;
const DATA = path.join(ROOT, 'data', 'internships.json');
const PAGE = path.join(ROOT, 'dist', 'index.html');

let refresh = null; // { startedAt, fast, log: [] } while a scrape is running
let lastRefresh = null;

const readData = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { return null; } };
function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s), 'Cache-Control': 'no-store' });
  res.end(s);
}
const dayDiff = (iso, today) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);

function run(cmd, args, onLine) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: process.env });
    const feed = (b) => String(b).split('\n').filter(Boolean).forEach(onLine);
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('close', (code) => resolve(code));
    p.on('error', () => resolve(1));
  });
}

async function startRefresh(fast) {
  refresh = { startedAt: new Date().toISOString(), fast, log: [] };
  const keep = (l) => { refresh.log.push(l); if (refresh.log.length > 200) refresh.log.shift(); };
  let code = await run(process.execPath, ['scraper/run.js'].concat(fast ? ['--skip=offices'] : []), keep);
  if (code === 0) code = await run(process.execPath, ['build.js'], keep);
  lastRefresh = { startedAt: refresh.startedAt, finishedAt: new Date().toISOString(), ok: code === 0, tail: refresh.log.slice(-8) };
  refresh = null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const q = url.searchParams;

  if (url.pathname === '/api/status') {
    const d = readData();
    return json(res, 200, { scrapedAt: d ? d.meta.generatedAt : null, counts: d ? d.meta.counts : null, refreshing: !!refresh, refreshStartedAt: refresh ? refresh.startedAt : null, lastRefresh });
  }
  if (url.pathname === '/api/refresh') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST to start a refresh.' });
    if (refresh) return json(res, 409, { error: 'A refresh is already running.', startedAt: refresh.startedAt });
    startRefresh(q.get('fast') === '1');
    return json(res, 202, { started: true, fast: q.get('fast') === '1', note: 'Poll /api/status; the full run takes about ten minutes, the fast one about three.' });
  }
  if (url.pathname.startsWith('/api/')) {
    const d = readData();
    if (!d) return json(res, 503, { error: 'No data yet. Run `npm run refresh` or POST /api/refresh.' });
    if (url.pathname === '/api/internships') return json(res, 200, d);
    if (url.pathname === '/api/postings') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
      const text = (q.get('q') || '').toLowerCase();
      const out = d.postings.filter((p) =>
        (!q.get('source') || p.source === q.get('source')) &&
        (!q.get('party') || p.party === q.get('party')) &&
        (!q.get('place') || p.place === q.get('place')) &&
        (q.get('open') !== '1' || !p.deadline || dayDiff(p.deadline, today) >= 0) &&
        (!text || `${p.title} ${p.org} ${p.orgFull || ''}`.toLowerCase().includes(text)));
      return json(res, 200, { scrapedAt: d.meta.generatedAt, count: out.length, postings: out });
    }
    if (url.pathname === '/api/offices') {
      const out = d.offices.filter((o) => (!q.get('state') || o.state === q.get('state').toUpperCase()) && (!q.get('chamber') || o.chamber === q.get('chamber')));
      return json(res, 200, { scrapedAt: d.meta.generatedAt, count: out.length, offices: out });
    }
    return json(res, 404, { error: 'Unknown endpoint. See the comment at the top of server.js.' });
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(PAGE, (err, buf) => {
      if (err) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('The site has not been built yet. Run: npm run refresh'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`The Blue Ticket is at http://127.0.0.1:${PORT}  (API: /api/postings, /api/offices, /api/status)`));
