'use strict';
/**
 * Checks for the text rules the scraper relies on. No network needed.
 *   node scraper/test.js
 */
const assert = require('assert');
const T = require('./lib/text');
const S = require('./lib/signals');
const { splitListings, fileDate } = require('./sources/house');
const { buildMatcher } = require('./lib/roster');

const REF = '2026-11-11';
const dl = (s, ref = REF) => T.extractWindows(s, ref, { pastSlack: 75 }).deadlines.map((d) => d.iso);
const op = (s, ref = REF) => T.extractWindows(s, ref, { pastSlack: 75 }).opens.map((d) => d.iso);
let n = 0;
const t = (name, fn) => { fn(); n++; };

t('deadline with a year', () => assert.deepStrictEqual(dl('The deadline to submit your application materials is November 16th, 2026 at 5:00pm PT.'), ['2026-11-16']));
t('deadline without a year resolves to the nearest occurrence', () => assert.deepStrictEqual(dl('Deadline to apply is Friday, November 6.'), ['2026-11-06']));
t('a January deadline seen in November is next year', () => assert.deepStrictEqual(dl('Applications are due January 5.'), ['2027-01-05']));
t('"by <date>" counts when the sentence is about applying', () => assert.deepStrictEqual(dl('Please send a resume to intern@mail.house.gov by November 15.'), ['2026-11-15']));
t('a notification date is not a deadline', () => assert.deepStrictEqual(dl('Applicants will be notified by December 1.'), []));
t('programme dates are not deadlines', () => assert.deepStrictEqual(dl('The program will run from January 11, 2027 - March 19, 2027.'), []));
t('"due to" is not "due"', () => assert.deepStrictEqual(dl('Due to a high volume of applicants we cannot reply. The office reopens January 4, 2027.'), []));
t('eligibility dates are not deadlines', () => assert.deepStrictEqual(dl('Interns must be 18 on or before the first day of the internship, January 11, 2027.'), []));
t('lower-case "may 2" is not a date', () => assert.deepStrictEqual(T.findDates('Interns may 2 days a week work remotely.', REF), []));
t('numeric fractions are not dates', () => assert.deepStrictEqual(dl('Our office is open 24/7 and interns work 1/2 days.'), []));

t('terms pair with the season in the same sentence', () => {
  const w = T.extractWindows('The deadlines for each internship session are as follows: Fall: July 28, Spring: December 9th, Summer: April 1st.', REF, {});
  assert.deepStrictEqual(w.deadlines.map((d) => d.term).sort(), ['Fall 2027', 'Spring 2027', 'Summer 2027']);
});
t('a row of dates under one heading is not all one term', () => {
  const w = T.extractWindows('Fall internships\nApplication Deadline: | December 1 | March 31 | July 25 |', REF, {});
  assert.deepStrictEqual(w.deadlines.map((d) => `${d.term}${d.termGuessed ? '?' : ''}`), ['Spring 2027?', 'Summer 2027?', 'Fall 2027?']);
});
t('an implausible season is replaced by a guess', () => {
  const w = T.extractWindows('Fall interns: apply by November 13.', REF, {});
  assert.strictEqual(w.deadlines[0].term, 'Spring 2027'); assert.strictEqual(w.deadlines[0].termGuessed, true);
});
t('opening date with a full date', () => assert.deepStrictEqual(op('Applications for the Summer 2027 CBCF Internship Program open September 1, 2026 and close November 30, 2026.'), ['2026-09-01']));
t('a program start date is not an opening date', () => assert.deepStrictEqual(op('The program will take place in person from May 24 through July 23, 2027, with office placements beginning June 1.'), []));
t('opening date given as a month', () => assert.deepStrictEqual(op('Summer 2027 applications will open in late January.'), ['2027-01-20']));
t('"opens mid-January 2027"', () => assert.deepStrictEqual(op('The application opens mid-January 2027; check back for the exact date.'), ['2027-01-15']));
t('"launched in January 2015" is not an opening date', () => assert.deepStrictEqual(op('BallotReady was launched in January 2015.'), []));
t('rolling review is detected', () => assert.strictEqual(T.extractWindows('Applications are reviewed on a rolling basis.', REF, {}).rolling, true));

t('term from a title', () => assert.strictEqual(T.detectTerm('Spring 2027 Press Internship', '', REF).label, 'Spring 2027'));
t('Winter/Spring Hill terms count as spring', () => assert.strictEqual(T.detectTerm('Intern', 'for the Winter/Spring 2027 term (January - April)', REF).label, 'Spring 2027'));
t('pay: stipend', () => assert.strictEqual(T.detectPay('offers a $1,500 monthly stipend').paid, 'paid'));
t('pay: unpaid', () => assert.strictEqual(T.detectPay('This is an unpaid internship.').paid, 'unpaid'));
t('pay: a figure beside pay words', () => assert.strictEqual(T.detectPay('Interns receive a $1,500 monthly stipend.').note, '$1,500 monthly stipend'));
t('pay: money raised is not pay', () => assert.strictEqual(T.detectPay('We have raised over $1 billion for campaigns. This is a paid internship.').note, 'Paid / stipend'));
t('pay: a transit benefit is not pay', () => assert.strictEqual(T.detectPay('Interns get a transit benefit of $175 per month. The role pays $18.40 per hour.').note, '$18.40 per hour'));
t('needs: materials named in the posting', () => assert.deepStrictEqual(S.requirements('Send a resume, cover letter, two writing samples and three references.'), ['resume', 'cover', 'writing', 'refs']));
t('needs: press clips are a duty, not a requirement', () => assert.deepStrictEqual(S.requirements('Interns compile daily press clips. To apply, email a résumé.'), ['resume']));
t('level: undergraduate, graduate and law, recent graduates', () => {
  assert.deepStrictEqual(S.levels('Spring Intern', 'Open to current undergraduate students and recent graduates.'), ['undergrad', 'recent']);
  assert.deepStrictEqual(S.levels('Spring 2027 Law Clerk', 'For students who have finished their 1L year.'), ['grad']);
  assert.deepStrictEqual(S.levels('Intern', 'We advocate for seniors and working families.'), []);
});
t('facts: hours, schedule and mode', () => {
  const f = S.facts('Intern', 'A full-time, paid position of 37.5 hours per week. This work may be done hybrid or in-person.');
  assert.strictEqual(f.hours, '37.5'); assert.strictEqual(f.time, 'full-time'); assert.strictEqual(f.mode, 'hybrid');
});
t('role: clerk, fellow, intern', () => { assert.strictEqual(T.classifyRole('Spring 2027 Law Clerk'), 'clerkship'); assert.strictEqual(T.classifyRole('Legal Fellow'), 'fellowship'); assert.strictEqual(T.classifyRole('Press Intern'), 'internship'); });
t('"Internal Communications Director" is not an internship', () => assert.strictEqual(T.isEarlyCareer('Internal Communications Director'), false));
t('place', () => { assert.strictEqual(T.placeOf('Washington, District of Columbia'), 'dc'); assert.strictEqual(T.placeOf('Phoenix, Arizona'), 'elsewhere'); assert.strictEqual(T.placeOf('Remote'), 'remote'); });

t('House bulletin: listings split on their reference numbers', () => {
  const l = splitListings('Internship Openings\nWeek of November 2, 2026\nDigital/Press 2027 Internship - MEM-330-26\nThe Office of Congressman Salud Carbajal (CA-24) is seeking an intern.\n\nSpring Intern – MEM-318-26\nThe office seeks interns.');
  assert.deepStrictEqual(l.map((x) => x.id), ['MEM-330-26', 'MEM-318-26']);
  assert.strictEqual(l[0].title, 'Digital/Press 2027 Internship');
});
t('House bulletin: file dates', () => { assert.strictEqual(fileDate('HVAPS Template_Internships_2026_11_02_26.pdf'), '2026-11-02'); assert.strictEqual(fileDate('Internship_Bulletin_9.3.2024.pdf'), '2024-09-03'); });

t('roster matcher: names, districts, titles', () => {
  const m = buildMatcher([
    { id: 'C1', name: 'Salud O. Carbajal', first: 'Salud', last: 'Carbajal', chamber: 'house', caucus: 'D', state: 'CA', district: '24' },
    { id: 'H1', name: 'Pat Harrigan', first: 'Pat', last: 'Harrigan', chamber: 'house', caucus: 'R', state: 'NC', district: '10' },
    { id: 'W1', name: 'Peter Welch', first: 'Peter', last: 'Welch', chamber: 'senate', caucus: 'D', state: 'VT', district: null },
  ]);
  assert.strictEqual(m('The Office of Congressman Salud Carbajal (CA-24) is seeking').id, 'C1');
  assert.strictEqual(m('Representative Pat Harrigan (NC-10) seeks interns').caucus, 'R');
  assert.strictEqual(m('Legal Fellow for the Office of Senator Welch').id, 'W1');
  assert.strictEqual(m('An office seeks a motivated intern'), null);
});

console.log(`${n} checks passed`);
