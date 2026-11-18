'use strict';
/**
 * Text utilities: HTML -> text, date / deadline extraction, term + pay detection.
 * Everything here is pure (no I/O) so it can be unit-tested with `node scraper/test.js`.
 */

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', eacute: 'é', ntilde: 'ñ', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú' };

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(NAMED, n.toLowerCase()) ? NAMED[n.toLowerCase()] : m));
}
function safeCp(n) { try { return String.fromCodePoint(n); } catch (e) { return ' '; } }

/** Strip markup. Block-level tags become newlines so sentence/row structure survives. */
function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/table|\/ul|\/ol|\/dd|\/dt|\/blockquote)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/(td|th)>/gi, ' | ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[  -​ ]/g, ' ');
  s = s.replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n');
  return s.trim();
}

/** Prefer the page's main content region so nav/footer dates don't pollute extraction. */
function mainHtml(html) {
  const s = String(html || '');
  const m = s.match(/<main\b[\s\S]*?<\/main>/i) || s.match(/<article\b[\s\S]*?<\/article>/i);
  if (m && m[0].length > 400) return m[0];
  const body = s.match(/<body\b[\s\S]*<\/body>/i);
  let b = body ? body[0] : s;
  b = b.replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ');
  return b;
}

// ------------------------------------------------------------------- dates
const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec'];
// Month names must be Capitalized or ALL CAPS: avoids "interns may 2 days a week".
const MONTH_ALT = MONTH_WORDS.flatMap((w) => [w, w.toUpperCase()]).sort((a, b) => b.length - a.length).join('|');
const DATE_SRC =
  `\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(20\\d{2}))?` + // Month D[, YYYY]
  `|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\b\\.?(?:,?\\s+(20\\d{2}))?` +    // D Month [YYYY]
  `|(?<![\\d/$.])(\\d{1,2})/(\\d{1,2})(?:/(20\\d{2}|\\d{2}))?(?![\\d/])`;             // M/D[/YY]

function iso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function validYmd(y, m, d) {
  if (m < 0 || m > 11 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m, d));
  return dt.getUTCMonth() === m && dt.getUTCDate() === d;
}
function dayDiff(aIso, bIso) { return Math.round((Date.parse(aIso + 'T00:00:00Z') - Date.parse(bIso + 'T00:00:00Z')) / 86400000); }

/**
 * A date with no year is resolved to the occurrence nearest the reference date,
 * allowing it to sit up to `pastSlack` days in the past (a deadline that just went by).
 */
function resolveYear(month, day, refIso, pastSlack = 60) {
  const ry = Number(refIso.slice(0, 4));
  for (const y of [ry - 1, ry, ry + 1, ry + 2]) {
    if (!validYmd(y, month, day)) continue;
    const cand = iso(y, month, day);
    if (dayDiff(cand, refIso) >= -pastSlack) return cand;
  }
  return null;
}

/** Find every date expression. Returns [{ index, end, raw, month, day, year|null, iso }]. */
function findDates(text, refIso, opts = {}) {
  const out = [];
  const re = new RegExp(DATE_SRC, 'g');
  let m;
  while ((m = re.exec(text))) {
    let month, day, year = null, numeric = false;
    if (m[1]) { month = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()]; day = +m[2]; year = m[3] ? +m[3] : null; }
    else if (m[5]) { month = MONTH_INDEX[m[5].slice(0, 3).toLowerCase()]; day = +m[4]; year = m[6] ? +m[6] : null; }
    else { month = +m[7] - 1; day = +m[8]; year = m[9] ? (+m[9] < 100 ? 2000 + +m[9] : +m[9]) : null; numeric = true; }
    if (numeric && opts.noNumeric) continue;
    if (month === undefined || !(month >= 0 && month <= 11) || day < 1 || day > 31) continue;
    const resolved = year ? (validYmd(year, month, day) ? iso(year, month, day) : null) : resolveYear(month, day, refIso, opts.pastSlack);
    if (!resolved) continue;
    out.push({ index: m.index, end: m.index + m[0].length, raw: m[0], month, day, year, iso: resolved, numeric });
  }
  return out;
}

// --------------------------------------------------------------- deadlines
const DEADLINE_BEFORE = /(dead\s?line|due(?!\s+to\b)(?:\s+date)?|apply by|applications?(?:\s+\w+){0,3}\s+(?:by|until|through|close[sd]?)|submit(?:ted)?(?:\s+\w+){0,6}\s+(?:by|before|no later than)|no later than|accept(?:ed|ing)?(?:\s+\w+){0,4}\s+(?:until|through)|closes?(?:\s+on)?|received by|priority (?:date|consideration)|must be (?:received|submitted)|open until|(?:submitted|received|postmarked) on or before)/i;
const DEADLINE_AFTER = /^\W{0,6}(?:is the |is our |application )?(dead\s?line|priority deadline)/i;
const OPEN_BEFORE = /((?:applications?|portal|window)(?:\s+[\w+’'-]+){0,9}\s+(?:(?:re)?open(?:s|ed)?|launch(?:es|ed)?|available|accepted (?:beginning|starting))|(?:re)?open(?:s|ing)?(?:\s+\w+){0,2}\s+(?:on|in))\s*(?:on|in|from|beginning|starting)?\s*$/i;
// "…to intern@mail.house.gov by November 15": a bare "by <date>" counts when the sentence is about applying
const BY_DATE = /\b(?:by|before|until|through|no later than)\s+(?:(?:close of business|COB|end of (?:the )?day|EOD|midnight|noon|\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?(?:\s*(?:E[SD]?T|C[SD]?T|M[SD]?T|P[SD]?T|Eastern|Central|Pacific))?)\s+(?:on\s+)?)?(?:(?:Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?\.?,?\s+)?$/i;
const APPLY_CTX = /appl(?:y|ication|icant)|submit|send|e-?mail|resume|résumé|cover letter|materials|interested/i;
const NOT_DEADLINE = /notif|selected|selection|decision|contacted|hear back|respond|announce|interview|start(?:s|ing)?\b|begin|orientation|run(?:s)? from/i;
// "applications will open in late September 2026" (month only, so the date is approximate)
const MONTH_OPEN_RE = new RegExp(`(?:open(?:s|ed|ing)?|re-?open(?:s)?|launch(?:es|ed)?|available|accepted|check back|posted)\\s+(?:again\\s+)?(?:(?:in|by|during|starting in|beginning in|this)\\s+(?:the\\s+)?(early|mid|late)?[- ]?|(early|mid|late)[- ])(?:${MONTH_ALT})\\b(?!\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b)(?:\\s+(?:of\\s+)?(20\\d{2}))?`, 'g');
const ROLLING_RE = /rolling basis|rolling admission|reviewed on a rolling|accepted on a rolling|until (?:the )?positions? (?:is|are) filled|until filled/i;

const SEASON_RE = /\b(Spring|Summer|Fall|Autumn|Winter)\b(?:\s*\/\s*(?:Spring|Summer|Fall|Winter))?(?:\s+(?:Session|Semester|Term|Internship|Program|Class|Cohort))?(?:\s+(?:of\s+)?(20\d{2}))?/gi;

function normSeason(s) {
  const t = s.toLowerCase();
  if (t === 'autumn') return 'Fall';
  if (t === 'winter') return 'Spring'; // "Winter/Spring" Hill terms start in January
  return t[0].toUpperCase() + t.slice(1);
}

/** Every season mention with position, e.g. "Spring 2027", "Summer Session". */
function findSeasons(text) {
  const out = [];
  const re = new RegExp(SEASON_RE.source, 'gi');
  let m;
  while ((m = re.exec(text))) {
    // skip lower-case verbs like "fall under", "spring into"
    if (m[1][0] !== m[1][0].toUpperCase() && !m[2]) continue;
    out.push({ index: m.index, end: m.index + m[0].length, season: normSeason(m[1]), year: m[2] ? +m[2] : null, raw: m[0] });
  }
  return out;
}

function sentenceAround(text, index, end) {
  let a = index;
  while (a > 0 && !/[\n]/.test(text[a - 1]) && !(/[.!?]/.test(text[a - 1]) && /\s/.test(text[a] || ' ') && a < index - 1)) a--;
  let b = end;
  while (b < text.length && !/[\n]/.test(text[b]) && !(/[.!?]/.test(text[b]) && /\s|$/.test(text[b + 1] || ' '))) b++;
  if (index - a > 260) a = index - 260;
  if (b - end > 200) b = end + 200;
  return { start: a, stop: Math.min(text.length, b + 1), text: text.slice(a, Math.min(text.length, b + 1)).replace(/\s+/g, ' ').trim() };
}

/**
 * Pull application-window facts out of free text.
 * Returns { deadlines: [{iso, raw, hasYear, season, seasonYear, snippet}], opens: [...], rolling, snippets }.
 * A date only becomes a structured deadline when a deadline phrase sits in the same sentence
 * right before it (or directly after): table cells with no such phrase stay snippet-only.
 */
function extractWindows(text, refIso, opts = {}) {
  const dates = findDates(text, refIso, opts);
  const seasons = findSeasons(text);
  const deadlines = [];
  const opens = [];
  const seen = new Set();
  for (const d of dates) {
    const sent = sentenceAround(text, d.index, d.end);
    const before = text.slice(Math.max(sent.start, d.index - 130), d.index);
    const after = text.slice(d.end, Math.min(sent.stop, d.end + 40));
    const near = before.slice(-70);
    const isDeadline = DEADLINE_BEFORE.test(before) || DEADLINE_AFTER.test(after)
      || (BY_DATE.test(before) && APPLY_CTX.test(sent.text) && !NOT_DEADLINE.test(near));
    const isOpen = !isDeadline && OPEN_BEFORE.test(before.replace(/\s+/g, ' '));
    if (!isDeadline && !isOpen) continue;
    if (d.numeric && !d.year && !/dead\s?line|due/i.test(before + after)) continue; // "24/7", "1/2"
    // nearest season: prefer one earlier in the same sentence, then the closest one before within 320 chars
    let season = null;
    const inSent = seasons.filter((s) => s.index >= sent.start && s.index < sent.stop);
    const prior = inSent.filter((s) => s.index < d.index);
    if (prior.length) season = prior[prior.length - 1];
    else if (inSent.length) season = inSent[0];
    else if (dates.filter((x) => x.index >= sent.start && x.index < sent.stop).length === 1) {
      // a season named just before counts only when this sentence holds a single date
      // (a table row of three dates under one "Fall" heading must not all become Fall)
      const back = seasons.filter((s) => s.index < d.index && d.index - s.index < 320);
      if (back.length) season = back[back.length - 1];
    }
    const rec = { iso: d.iso, raw: d.raw, hasYear: !!d.year, month: d.month + 1, day: d.day, season: season ? season.season : null, seasonYear: season ? season.year : null, snippet: sent.text.slice(0, 320) };
    if (isDeadline) Object.assign(rec, termFor(rec));
    const key = (isDeadline ? 'd' : 'o') + rec.iso + (rec.season || '');
    if (seen.has(key)) continue;
    seen.add(key);
    (isDeadline ? deadlines : opens).push(rec);
  }
  // month-only opening statements
  const mre = new RegExp(MONTH_OPEN_RE.source, 'g');
  let mm;
  while ((mm = mre.exec(text))) {
    const word = mm[0].match(new RegExp(`(${MONTH_ALT})\\b`));
    if (!word) continue;
    const month = MONTH_INDEX[word[1].slice(0, 3).toLowerCase()];
    const mod = mm[1] || mm[2] || '';
    const day = /late/i.test(mod) ? 20 : /mid/i.test(mod) ? 15 : 1;
    const isoDate = mm[3] ? iso(+mm[3], month, day) : resolveYear(month, day, refIso, 120);
    if (!isoDate) continue;
    const sent = sentenceAround(text, mm.index, mm.index + mm[0].length);
    if (!/appl(?:y|ication)|portal|internship|program/i.test(sent.text)) continue; // "launched in January 2015" is not an opening date
    if (dayDiff(isoDate, refIso) < -200) continue;
    const inSent = seasons.filter((x) => x.index >= sent.start && x.index < sent.stop);
    // "…opens mid-January; deadline March 5": an opening named beside a deadline belongs to that deadline's term
    const sib = deadlines.find((d) => d.snippet === sent.text.slice(0, 320) && d.season);
    const season = inSent.length ? inSent[0] : sib ? { season: sib.season, year: sib.seasonYear } : null;
    const key = 'o' + isoDate + (season ? season.season : '');
    if (seen.has(key)) continue;
    seen.add(key);
    opens.push({ iso: isoDate, raw: mm[0], hasYear: !!mm[3], approx: true, month: month + 1, day, season: season ? season.season : null, seasonYear: season ? season.year : null, snippet: sent.text.slice(0, 320) });
  }
  return { deadlines, opens, rolling: ROLLING_RE.test(text) };
}

/**
 * Which term a deadline belongs to. Uses the season the page names; when it names none,
 * falls back to the Washington calendar (autumn deadlines are for spring, late-winter
 * deadlines for summer, early-summer deadlines for fall) and marks the term as guessed.
 */
function termFor(rec) {
  const y = +rec.iso.slice(0, 4), m = +rec.iso.slice(5, 7);
  const yearFor = (se) => (se === 'Spring' ? (m >= 6 ? y + 1 : y) : se === 'Summer' ? (m >= 8 ? y + 1 : y) : (m >= 11 ? y + 1 : y));
  const START = { Spring: 1, Summer: 6, Fall: 9 };
  let season = rec.season, year = rec.seasonYear, guessed = false;
  // a "Fall" deadline in November would be ten months early: the page is naming another term nearby
  if (season && !year && (yearFor(season) * 12 + START[season]) - (y * 12 + m) > 8) season = null;
  if (!season) { season = m >= 9 ? 'Spring' : m <= 4 ? 'Summer' : 'Fall'; guessed = true; year = null; }
  if (!year) year = yearFor(season);
  return { term: `${season} ${year}`, termGuessed: guessed };
}

/** Best single deadline for a job posting (earliest dated deadline not long past). */
function pickDeadline(text, refIso) {
  const w = extractWindows(text, refIso, { pastSlack: 45 });
  if (!w.deadlines.length) return { deadline: null, rolling: w.rolling, snippet: null };
  const sorted = w.deadlines.slice().sort((a, b) => a.iso.localeCompare(b.iso));
  return { deadline: sorted[0].iso, rolling: w.rolling, snippet: sorted[0].snippet, all: sorted };
}

/** "Spring 2027" style label for a posting, from its title first, then its body. */
function detectTerm(title, body, refIso) {
  for (const src of [title || '', (body || '').slice(0, 4000)]) {
    const s = findSeasons(src);
    const withYear = s.find((x) => x.year);
    const pick = withYear || s[0];
    if (pick) {
      let year = pick.year;
      if (!year && refIso) {
        // no year given: assume the next start of that season after the reference date
        const start = { Spring: 0, Summer: 4, Fall: 7 }[pick.season];
        const ry = +refIso.slice(0, 4), rm = +refIso.slice(5, 7) - 1;
        year = rm > start + 1 ? ry + 1 : ry;
      }
      return { season: pick.season, year: year || null, label: year ? `${pick.season} ${year}` : pick.season };
    }
  }
  // bare year in title: "Digital/Press 2027 Internship"
  const y = (title || '').match(/\b(20\d{2})\b/);
  return y ? { season: null, year: +y[1], label: y[1] } : null;
}

// -------------------------------------------------------------------- pay
function detectPay(text) {
  const t = String(text || '');
  const unpaid = /\b(unpaid|un-paid|not a paid|no stipend|without (?:pay|compensation)|volunteer (?:position|internship)|for (?:academic|course|school) credit only)\b/i.test(t);
  // A dollar figure only counts as pay when pay words sit beside it: "$1 billion raised" and a
  // "$175 transit benefit" are not what the internship pays.
  const re = /\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:-|–|to)\s?\$?\s?\d[\d,]*(?:\.\d{1,2})?)?(?:\s*(?:\/|per|an|a)\s*(?:hour|hr|month|week|year|session|semester|term))?(?:\s+(?:monthly\s+|weekly\s+|living\s+)?stipend)?/gi;
  let money = null, m;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    if (/^\s*(?:million|billion|trillion|[kmb]\b)/i.test(t.slice(end, end + 12))) continue;
    const before = t.slice(Math.max(0, m.index - 70), m.index), around = before + m[0] + t.slice(end, end + 50);
    if (/transit|commuter|metro|parking|wellness|reimburs|raised|donat|budget|grant/i.test(before.slice(-45))) continue;
    if (/stipend|hour|salary|compensat|\bpaid\b|\bpay\b|wage|\brate\b|per (?:week|month|semester)/i.test(around)) { money = m[0]; break; }
  }
  const paidWord = /\b(paid (?:internship|intern|position|fellowship|program)|is paid|are paid|will be paid|(?:full|part)-time,? paid|stipend|hourly (?:rate|wage)|compensat(?:ed|ion))\b/i.test(t);
  if (money || (paidWord && !unpaid)) return { paid: 'paid', note: money ? money.replace(/\s+/g, ' ').trim() : 'Paid / stipend' };
  if (unpaid) return { paid: paidWord ? 'mixed' : 'unpaid', note: paidWord ? 'Unpaid; stipend or credit may be available' : 'Unpaid' };
  return { paid: 'unknown', note: null };
}

// ------------------------------------------------------------- role + place
function classifyRole(title) {
  const t = String(title || '');
  if (/\b(law clerk|legal clerk|clerkship|extern)/i.test(t)) return 'clerkship';
  if (/\bintern(s|ship|ships)?\b/i.test(t)) return 'internship';
  if (/\bfellow(s|ship|ships)?\b/i.test(t)) return 'fellowship';
  if (/\b(apprentice|trainee|page program)\b/i.test(t)) return 'internship';
  return null;
}
function isEarlyCareer(title) {
  const t = String(title || '');
  if (/\binternal\b/i.test(t) && !/\bintern(s|ship|ships)?\b/i.test(t)) return false;
  return classifyRole(t) !== null;
}
function placeOf(loc, body) {
  const l = String(loc || '');
  if (/washington|district of columbia|\bD\.?C\.?\b/i.test(l)) return 'dc';
  if (/remote|virtual|anywhere|nationwide/i.test(l)) return 'remote';
  if (l.trim()) return 'elsewhere';
  const b = String(body || '').slice(0, 1200);
  if (/washington,? ?d\.?c\.?|capitol hill|d\.?c\.? office/i.test(b)) return 'dc';
  return 'unknown';
}

function clip(s, n = 420) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
}

function hashText(s) {
  // FNV-1a, enough to tell "page text changed since last run"
  let h = 0x811c9dc5;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

module.exports = { termFor, decodeEntities, htmlToText, mainHtml, findDates, findSeasons, extractWindows, pickDeadline, detectTerm, detectPay, classifyRole, isEarlyCareer, placeOf, clip, hashText, iso, dayDiff, resolveYear };
