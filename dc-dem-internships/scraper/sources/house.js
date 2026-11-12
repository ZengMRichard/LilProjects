'use strict';
/**
 * House internship postings, from the weekly House Employment Bulletin (HVAPS).
 *
 * The CAO emails the bulletin as a PDF; the public archive github.com/dwillis/house-jobs
 * commits each one. We read the newest "Internships" PDF (plus the week before, to tell
 * which listings are new), convert it with `pdftotext -layout`, and split it into listings.
 * If pdftotext is not installed we fall back to the archive's own extracted text.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const T = require('../lib/text');

const REPO = 'https://github.com/dwillis/house-jobs';
const CACHE = path.join(__dirname, '..', '.cache', 'house-jobs');

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: opts.cwd || CACHE, encoding: opts.encoding === undefined ? 'utf8' : opts.encoding, maxBuffer: 64 * 1024 * 1024, timeout: opts.timeout || 240000, env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Blobless shallow clone: we only download the few files we actually read. */
function syncArchive() {
  if (fs.existsSync(path.join(CACHE, '.git'))) {
    try { git(['fetch', '--depth', '1', '--filter=blob:none', 'origin', 'HEAD']); return 'FETCH_HEAD'; }
    catch (e) { return 'HEAD'; } // offline: use what we have
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  git(['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', REPO, CACHE], { cwd: path.dirname(CACHE), timeout: 600000 });
  return 'HEAD';
}

/** Date encoded in a bulletin filename, e.g. HVAPS Template_Internships_2026_11_02_26.pdf */
function fileDate(name) {
  let m = name.match(/(20\d{2})[_.-](\d{1,2})[_.-](\d{1,2})/);
  if (m) return T.iso(+m[1], +m[2] - 1, +m[3]);
  m = name.match(/(\d{1,2})[._-](\d{1,2})[._-](20\d{2})/);
  if (m) return T.iso(+m[3], +m[1] - 1, +m[2]);
  return null;
}

function bulletinText(ref, file) {
  if (/\.pdf$/i.test(file)) {
    try {
      const buf = git(['show', `${ref}:${file}`], { encoding: 'buffer' });
      const tmp = path.join(os.tmpdir(), `hvaps-${process.pid}-${Date.now()}.pdf`);
      fs.writeFileSync(tmp, buf);
      try { return execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
      finally { fs.unlinkSync(tmp); }
    } catch (e) { return null; }
  }
  try { return git(['show', `${ref}:${file}`]); } catch (e) { return null; }
}

const HEAD_RE = /^\s{0,12}(\S.{2,170}?)\s+[-–—]\s*((?:[A-Z]{2,6})[-–]\d{1,4}[-–]\d{2})\s*$/;

function splitListings(text) {
  const lines = text.replace(/\f/g, '\n').split('\n');
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(HEAD_RE);
    if (m) { cur = { title: m[1].trim(), id: m[2].replace(/–/g, '-'), lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out.map((l) => ({ title: l.title, id: l.id, body: l.lines.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() }));
}

function officeOf(body) {
  const flat = body.slice(0, 900).replace(/\s+/g, ' ');
  let m = flat.match(/(?:[Oo]ffice of\s+)?(?:U\.S\.\s+)?((?:Congress(?:man|woman|member)|Representative|Rep\.|Delegate|Resident Commissioner|Ranking Member|Chair(?:man|woman)?|Democratic Leader|Speaker|Whip)\s+(?:[A-Z][\w.'’-]+\s?){1,4})(?:\s*\(([A-Z]{2}-(?:\d{1,2}|AL))\))?/);
  if (m) return m[1].replace(/\s+(is|seeks|has|in|for|of|to|and)$/i, '').trim() + (m[2] ? ` (${m[2]})` : '');
  m = flat.match(/((?:House\s+)?(?:Sub)?[Cc]ommittee on [A-Z][A-Za-z,&' -]{3,70}?)(?=\s+(?:is|seeks|Democrat|Republican|Majority|Minority|has|invites)|[,.(])/);
  if (m) return m[1].trim();
  m = flat.match(/((?:Congressional|House) [A-Z][A-Za-z ]{3,50}? (?:Caucus|Coalition|Conference))/);
  if (m) return m[1].trim();
  return null;
}

function applyOf(body) {
  const url = (body.match(/https?:\/\/[^\s)>\]]+/) || [null])[0];
  const email = (body.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [null])[0];
  return { applyUrl: url ? url.replace(/[.,;]+$/, '') : null, applyEmail: email };
}

function parseBulletin(text, bulletinDate, file, { match, houseMajority }) {
  const pdfUrl = `${REPO}/blob/main/${file.split('/').map(encodeURIComponent).join('/')}`;
  return splitListings(text).map((l) => {
    const office = officeOf(l.body);
    const member = match(`${l.title}\n${l.body.slice(0, 1200)}`, 'house');
    let party = member ? member.caucus : null;
    let partyVia = member ? 'member' : null;
    if (!party) {
      const hay = `${l.title} ${l.body.slice(0, 3000)}`;
      const d = /\bDemocrat(?:ic)?\b|\bprogressive\b/i.test(hay), r = /\bRepublican\b|\bGOP\b|\bconservative\b/i.test(hay);
      if (d && !r) { party = 'D'; partyVia = 'text'; }
      else if (r && !d) { party = 'R'; partyVia = 'text'; }
      else if (/\bmajority\b/i.test(hay) && houseMajority && !/\bminority\b/i.test(hay)) { party = houseMajority; partyVia = 'majority'; }
      else if (/\bminority\b/i.test(hay) && houseMajority && !/\bmajority\b/i.test(hay)) { party = houseMajority === 'D' ? 'R' : 'D'; partyVia = 'majority'; }
    }
    // PDF text wraps mid-sentence: join wrapped lines (keeping paragraph breaks) before reading dates
    const flat = l.body.replace(/-\n(?=[a-z])/g, '-').replace(/([^\n])\n(?!\n|\s*[•·▪o]\s)/g, '$1 ');
    const dl = T.pickDeadline(flat, bulletinDate);
    const term = T.detectTerm(l.title, flat, bulletinDate);
    const pay = T.detectPay(`${l.title}\n${l.body}`);
    const dc = /washington,? ?d\.? ?c\.?|\bD\.?C\.? office|capitol hill/i.test(`${l.title} ${l.body}`);
    const district = /district office|state office|regional office/i.test(`${l.title} ${l.body}`);
    const { applyUrl, applyEmail } = applyOf(l.body);
    return {
      id: `house:${l.id}`, source: 'house', chamber: 'house',
      orgId: 'house-bulletin', org: member ? `Rep. ${member.name}` : (office || 'House office (not named)'), orgFull: office || (member ? member.name : 'House office (not named)'), group: 'hill',
      title: l.title, url: applyUrl || pdfUrl, sourceUrl: pdfUrl, applyEmail, refNo: l.id,
      location: dc && district ? 'Washington, DC and district office' : dc ? 'Washington, DC' : district ? 'District office' : null,
      place: dc ? 'dc' : district ? 'elsewhere' : 'unknown',
      role: T.classifyRole(l.title) || 'internship',
      term: term ? term.label : null,
      postedAt: bulletinDate, bulletin: bulletinDate,
      deadline: dl.deadline, deadlineBasis: dl.deadline ? 'text' : null, deadlineNote: dl.snippet, rolling: !!dl.rolling,
      paid: pay.paid, payNote: pay.note,
      party, partyVia,
      member: member ? { id: member.id, name: member.name, state: member.state, district: member.district } : null,
      summary: T.clip(flat, 280),
    };
  });
}

async function house(ctx) {
  let ref;
  try { ref = syncArchive(); } catch (e) { return { ok: false, error: `archive unavailable (${String(e.message || e).split('\n')[0]})`, total: 0, postings: [] }; }
  let files;
  try { files = git(['ls-tree', '-r', '--name-only', ref, 'input', 'output']).split('\n').filter(Boolean).map((f) => f.replace(/^"|"$/g, '')); }
  catch (e) { return { ok: false, error: 'archive listing failed', total: 0, postings: [] }; }
  let hasPdftotext = true;
  try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); } catch (e) { hasPdftotext = e.status !== undefined && e.code !== 'ENOENT'; }
  const wanted = files.filter((f) => /intern/i.test(f) && (hasPdftotext ? /^input\/.*\.pdf$/i.test(f) : /^output\/.*\.txt$/i.test(f)))
    .map((f) => ({ file: f, date: fileDate(path.basename(f)) })).filter((x) => x.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!wanted.length) return { ok: false, error: 'no internship bulletins found in archive', total: 0, postings: [] };
  // newest bulletin = what is advertised now; the one before tells us which listings are new this week
  const latest = wanted[0];
  const prior = wanted.find((w) => w.date < latest.date);
  const text = bulletinText(ref, latest.file);
  if (!text) return { ok: false, error: `could not read ${latest.file}`, total: 0, postings: [] };
  const postings = parseBulletin(text, latest.date, latest.file, ctx);
  if (prior) {
    const pt = bulletinText(ref, prior.file);
    if (pt) {
      const old = new Set(splitListings(pt).map((l) => `house:${l.id}`));
      for (const p of postings) p.newThisWeek = !old.has(p.id);
    }
  }
  return { ok: true, total: postings.length, postings, bulletinDate: latest.date, bulletinFile: latest.file, note: hasPdftotext ? null : 'pdftotext not installed: used the archive’s extracted text, which can lag a week or two' };
}

module.exports = { house, parseBulletin, splitListings, fileDate };
