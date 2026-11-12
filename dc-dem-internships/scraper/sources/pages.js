'use strict';
/**
 * Page reading, shared by the member-office crawl and the organization page watcher.
 *
 * readPage() fetches one page and pulls out what an applicant cares about:
 *   windows  – dated deadlines tied to a term where the page says so
 *   opens    – dated "applications open" statements
 *   notices  – sentences such as "Applications for Summer 2027 are now closed"
 *   rolling / paid, an apply link, and a hash of the text so the next run can say "this page changed".
 */
const { politeFetch } = require('../lib/http');
const T = require('../lib/text');
const L = require('../lib/links');

const NOTICE_RE = /[^.!?\n]{0,160}(?:applications?|application (?:period|window|portal|process)|portal|program)[^.!?\n]{0,80}\b(?:(?:are|is|will be|has|have)\s+(?:now |currently |not |no longer |been )*(?:open(?:ed)?|closed|accept(?:ed|ing)|available|live|under review)|will (?:re)?open|opens?\s+(?:in|on|this|next)|closes?\s+(?:in|on)|check back|not (?:currently )?accepting)[^.!?\n]{0,200}[.!?]?/gi;

function notices(text) {
  const out = [];
  const seen = new Set();
  let m;
  const re = new RegExp(NOTICE_RE.source, 'gi');
  while ((m = re.exec(text)) && out.length < 4) {
    const s = m[0].replace(/\s+/g, ' ').trim();
    if (s.length < 30 || s.length > 420) continue;
    const key = s.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function applyLink(html, base) {
  const ls = L.links(html, base).filter((l) => /\bapply\b|application|submit/i.test(l.text) && !/mailto:/i.test(l.href) && l.text.length < 60);
  const scored = ls.map((l) => ({ l, s: (/apply (now|here|online|today)|application form|online application/i.test(l.text) ? 3 : 1) + (/form|apply|application|oampublic|intern/i.test(l.href) ? 2 : 0) })).sort((a, b) => b.s - a.s);
  return scored[0] ? scored[0].l.href : null;
}

async function readPage(url, today) {
  const r = await politeFetch(url, { timeout: 25000 });
  if (!r.ok) return { ok: false, error: r.error, url };
  const html = T.mainHtml(r.text);
  const text = T.htmlToText(html);
  const w = T.extractWindows(text, today, { pastSlack: 75 });
  // pages left over from an earlier year ("Our Summer 2023 application…") are not current facts
  const thisYear = +today.slice(0, 4);
  const current = (x) => !(x.seasonYear && x.seasonYear < thisYear) && T.dayDiff(x.iso, today) > -240;
  w.deadlines = w.deadlines.filter(current);
  w.opens = w.opens.filter(current);
  const stale = (sentence) => { const ys = (sentence.match(/\b20\d{2}\b/g) || []).map(Number); return ys.length > 0 && Math.max(...ys) < thisYear; };
  const pay = T.detectPay(text);
  return {
    ok: true, url: r.url, text,
    hash: T.hashText(text.replace(/\d/g, '#').slice(0, 20000) + text.replace(/\D/g, '').slice(0, 4000)),
    windows: w.deadlines.slice(0, 8), opens: w.opens.slice(0, 4), rolling: w.rolling,
    notices: notices(text).filter((n) => !stale(n)), paid: pay.paid, payNote: pay.note,
    applyUrl: applyLink(html, r.url),
    mentionsIntern: L.INTERN_RE.test(text),
    length: text.length,
  };
}

module.exports = { readPage, notices };
