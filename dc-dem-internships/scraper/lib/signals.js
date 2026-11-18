'use strict';
/**
 * What a posting asks for, who it is for, and the schedule facts a reader weighs.
 * Pure functions over the posting's own text; nothing here guesses beyond what is written.
 */

// key, label shown on the page, pattern
const NEEDS = [
  ['resume', 'Résumé', /(?<![A-Za-z])(?:resume|résumé|resumé|curriculum vitae)(?![A-Za-z])|\bCV\b/i], // \b does not see accented letters
  ['cover', 'Cover letter', /cover letter|letter of interest|statement of interest/i],
  ['writing', 'Writing sample', /writing samples?/i],
  ['essay', 'Essay', /\bessays?\b|short[- ]answer|personal statement|written responses?|(?:essay|application) questions/i],
  ['transcript', 'Transcript', /\btranscripts?\b/i],
  ['refs', 'References', /\b(?:\d|one|two|three|four|list of|names? of|professional|academic|personal)\s+(?:\w+\s+)?references\b|references? (?:are |is |will be )?required|letters? of (?:recommendation|support)|recommendation letters?|\brecommenders?\b|professional recommendation/i],
  ['samples', 'Work samples', /portfolio|work samples?|design samples?|digital samples?|samples of (?:your|their) work/i],
  ['video', 'Video', /video (?:response|essay|introduction|submission|statement)/i],
  ['availability', 'Availability', /(?:dates?|hours?|days)(?:\s*(?:and|&|\/|or)\s*(?:hours|times|dates))? of availability|availability (?:dates|schedule)|your availability|start and end dates/i],
];
const NEED_LABELS = Object.fromEntries(NEEDS.map(([k, label]) => [k, label]));

/** Application materials the text names, in a fixed order. */
function requirements(text) {
  const t = String(text || '');
  return NEEDS.filter(([, , re]) => re.test(t)).map(([k]) => k);
}

/** Who the posting says it is for: 'undergrad', 'grad' (graduate and law), 'recent' (recent graduates). */
function levels(title, text) {
  const t = `${title || ''}\n${text || ''}`;
  const out = [];
  if (/undergraduate|college students?|pursuing (?:a |an )?(?:bachelor|associate)|currently enrolled in (?:a |an )?(?:(?:two|four|2|4)[- ]year )?(?:college|university)|(?:college|rising|current) (?:freshm[ae]n|sophomores?|juniors?|seniors?)|\b(?:sophomores?|juniors?),? (?:and|or) seniors?\b/i.test(t)) out.push('undergrad');
  if (/(?<!under)graduate students?|(?<!under)graduate[- ](?:level|school|program)|law students?|law school|\bJ\.?D\.?\b|\b[123]Ls?\b|LL\.?M|\bmaster'?s\b|\bM\.?P\.?[PA]\.?\b|Ph\.?D|doctoral|law clerk|legal (?:fellow|intern|extern)|law fellow/i.test(t)) out.push('grad');
  if (/recent(?:ly)? (?:college |law school )?graduat|graduated within|within (?:\w+ )?(?:months|years?) of graduat|post-?graduate|bachelor'?s degree (?:is )?required|completed (?:a |an |their )?(?:bachelor|undergraduate)/i.test(t)) out.push('recent');
  return out;
}

/** Schedule and programme facts stated in the text. Used on the page and as the basis for ratings. */
function facts(title, text) {
  const t = `${title || ''}\n${text || ''}`;
  const f = {};
  const h = t.match(/(?<![\d.])(\d{1,2}(?:\.\d)?)(?:\s*(?:-|–|to)\s*(\d{1,2}(?:\.\d)?))?\s*\+?\s*(?:hours?|hrs?\.?)\s*(?:per|a|each|\/)\s*(?:week|wk)/i);
  if (h && +h[1] >= 5 && +h[1] <= 60) f.hours = h[2] ? `${h[1]}–${h[2]}` : h[1];
  const ft = /full[- ]time/i.test(t), pt = /part[- ]time/i.test(t);
  if (ft || pt) f.time = ft && pt ? 'full- or part-time' : ft ? 'full-time' : 'part-time';
  if (/flexible (?:schedule|hours|scheduling)|hours are flexible|flexib(?:le|ility) (?:to|with|around)/i.test(t)) f.flexible = true;
  const remote = /\b(?:fully )?remote\b|\bvirtual(?:ly)?\b/i.test(t), hybrid = /\bhybrid\b/i.test(t), inPerson = /in[- ]person|on[- ]site|in[- ]office/i.test(t);
  const mode = hybrid ? 'hybrid' : remote && inPerson ? 'remote or in person' : remote ? 'remote' : inPerson ? 'in person' : null;
  if (mode) f.mode = mode;
  const perks = [];
  if (/\bmentor/i.test(t)) perks.push('mentorship');
  if (/speaker series|guest speakers?|brown[- ]bag|lunch(?:eon)? (?:series|and learn)/i.test(t)) perks.push('speaker series');
  if (/professional development|career development|skills? training|training sessions?/i.test(t)) perks.push('professional development');
  if (/\bnetwork(?:ing)?\b/i.test(t)) perks.push('networking');
  if (/\bcohort|intern class|class of (?:interns|fellows)|fellow interns/i.test(t)) perks.push('cohort');
  if (/housing (?:is )?(?:provided|included)|provided housing|-provided housing|free housing/i.test(t)) perks.push('housing');
  if (/academic credit|course credit|school credit/i.test(t)) perks.push('course credit');
  if (/\bmetro\b|transit|commuter|transportation (?:stipend|benefit|subsidy|reimburse)/i.test(t)) perks.push('transit');
  if (perks.length) f.perks = perks;
  f.admin = (t.match(/answer(?:ing)? (?:the )?(?:phones?|constituent calls|calls)|\bphones?\b|sort(?:ing)? (?:the )?mail|\bmail\b|\btours?\b|front (?:office|desk)|greet(?:ing)? (?:visitors|constituents)|administrative|data entry|\bfiling\b/gi) || []).length;
  f.subst = (t.match(/research|draft(?:ing)?|memos?\b|memoranda|hearings?|briefings?|legislative|analy[sz]|policy|press (?:releases?|clips)|social media|graphics?|writing|reports?\b|litigation|\blegal\b/gi) || []).length;
  const w = t.match(/(\d{1,2})[- ]weeks?\b/i);
  if (w && +w[1] >= 4 && +w[1] <= 52) f.weeks = +w[1];
  if (/\bevenings?\b|\bweekends?\b|after[- ]hours|long hours|late nights?/i.test(t)) f.evenings = true;
  return f;
}

module.exports = { requirements, levels, facts, NEEDS, NEED_LABELS };
