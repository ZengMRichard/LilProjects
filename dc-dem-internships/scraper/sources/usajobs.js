'use strict';
/**
 * Federal student / intern announcements in Washington, from USAJOBS.
 *
 * Uses the Historic JOA endpoint, which needs no API key. It has no keyword search and is
 * slow on broad queries, so we ask for the "student trainee" occupational series (the xx99
 * codes agencies use for Pathways interns) one series at a time and filter to DC ourselves.
 * These are nonpartisan civil-service and legislative-agency roles: they are shown in
 * their own section, not as Democratic-side leads.
 */
const { fetchJson, pool } = require('../lib/http');
const T = require('../lib/text');
const S = require('../lib/signals');

const API = 'https://data.usajobs.gov/api/historicjoa';
// Student-trainee series most relevant to policy, law, communications, data and admin work.
const SERIES = ['0099', '0199', '0299', '0399', '0599', '0999', '1099', '1499', '1599', '2299'];

function daysAgo(todayIso, n) {
  const d = new Date(todayIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function usajobs({ today }) {
  const since = daysAgo(today, 120);
  const seen = new Map();
  const errors = [];
  await pool(SERIES, 3, async (series) => {
    let url = `${API}?PositionSeries=${series}&StartPositionOpenDate=${since}`;
    for (let page = 0; page < 4 && url; page++) {
      const r = await fetchJson(url, { timeout: 60000 });
      if (!r.ok) { errors.push(`${series}: ${r.error}`); return; }
      for (const x of r.json.data || []) seen.set(x.usajobsControlNumber, x);
      const next = r.json.paging && r.json.paging.next;
      url = next ? `https://data.usajobs.gov${next}` : null;
    }
  });
  if (!seen.size && errors.length) return { ok: false, error: errors[0], total: 0, postings: [] };
  const postings = [];
  for (const x of seen.values()) {
    const locs = x.positionlocations || [];
    const inDc = locs.some((l) => l.positionLocationState === 'District of Columbia');
    if (!inDc) continue;
    const isIntern = x.appointmentType === 'Internships' || /intern|student trainee|pathways/i.test(x.positionTitle || '') || (x.hiringpaths || []).some((h) => /student/i.test(h.hiringPath || ''));
    if (!isIntern) continue;
    const close = x.positionCloseDate ? String(x.positionCloseDate).slice(0, 10) : null;
    if (close && T.dayDiff(close, today) < -21) continue; // long closed
    const generic = /^other agencies/i;
    const agency = [x.hiringSubelementName, x.hiringAgencyName, x.hiringDepartmentName].find((v) => v && !generic.test(v)) || 'Federal agency';
    const unpaid = /unpaid|volunteer/i.test(x.positionTitle || '') || !x.minimumSalary;
    const salary = x.minimumSalary ? `$${Math.round(x.minimumSalary).toLocaleString('en-US')}${x.maximumSalary && x.maximumSalary !== x.minimumSalary ? '–$' + Math.round(x.maximumSalary).toLocaleString('en-US') : ''} ${String(x.salaryType || '').toLowerCase()}`.trim() : null;
    postings.push({
      id: `usajobs:${x.usajobsControlNumber}`, source: 'usajobs',
      orgId: 'usajobs', org: agency, orgFull: [x.hiringDepartmentName, x.hiringAgencyName].filter((v, i, a) => v && a.indexOf(v) === i).join(' · '), group: 'federal',
      title: x.positionTitle, url: `https://www.usajobs.gov/job/${x.usajobsControlNumber}`,
      location: locs.length > 1 ? `Washington, DC + ${locs.length - 1} more` : 'Washington, DC', place: 'dc',
      role: 'internship', term: (() => { const tm = T.detectTerm(x.positionTitle, '', (x.positionOpenDate ? String(x.positionOpenDate).slice(0, 10) : today)); return tm && tm.season ? tm.label : null; })(),
      postedAt: x.positionOpenDate ? String(x.positionOpenDate).slice(0, 10) : null,
      deadline: close, deadlineBasis: close ? 'board' : null, deadlineNote: null, rolling: false,
      paid: unpaid ? (/unpaid|volunteer/i.test(x.positionTitle || '') ? 'unpaid' : 'unknown') : 'paid', payNote: unpaid ? null : salary,
      status: x.positionOpeningStatus || null,
      needs: [], level: S.levels(x.positionTitle, ''), facts: { time: /part/i.test(x.workSchedule || '') ? 'part-time' : /full/i.test(x.workSchedule || '') ? 'full-time' : undefined },
      summary: [x.appointmentType, x.workSchedule, x.payScale && x.minimumGrade ? `${x.payScale}-${x.minimumGrade}${x.maximumGrade && x.maximumGrade !== x.minimumGrade ? '/' + x.maximumGrade : ''}` : null, x.announcementNumber].filter(Boolean).join(' · '),
    });
  }
  return { ok: true, total: seen.size, postings, note: errors.length ? `${errors.length} of ${SERIES.length} series queries failed` : null };
}

module.exports = { usajobs };
