# The Blue Ticket

A scraper and a one-page site that track internships on the Democratic side of Washington, DC: Democratic Hill offices, the party committees, and the think tanks, advocacy groups, unions and campaign firms around them. Each run records when applications open and close.

No dependencies beyond Node 22. `pdftotext` (poppler-utils) and `git` are used for the House bulletin and are optional.

## Run it

```bash
npm run refresh     # scrape everything, then build the site (about ten minutes)
```

```bash
npm run serve       # the site and a JSON API at http://127.0.0.1:4127
```

Other commands:

| Command | What it does |
|---|---|
| `npm run scrape` | Scrape every source into `data/internships.json` |
| `npm run scrape:fast` | The same without the crawl of 264 office sites (about three minutes) |
| `node scraper/run.js --only=senate,house` | Run only the named stages; the rest carry over from the last run |
| `node scraper/run.js --only=offices --missing` | Retry only the offices whose internship page was not found |
| `npm run build` | Rebuild `site/index.html` and `dist/index.html` from the last scrape |
| `npm run discover` | Re-detect each organization's careers page, internship page and hiring system |
| `npm test` | Checks for the date and deadline rules (no network) |

`dist/index.html` is a complete page with the data inside it. Put it on any static host.

## What it reads

| Source | How |
|---|---|
| Senate Employment Office (`careers.employment.senate.gov`) | Sitemap of active postings, then the structured job data on each posting page |
| House Employment Bulletin | The weekly internships PDF, from the public archive `github.com/dwillis/house-jobs`, converted with `pdftotext` and split into listings |
| Democratic member offices (264) | Roster from `unitedstates/congress-legislators`; each office site is crawled for its internship page and the deadlines printed on it |
| Organization job boards | Public Greenhouse, Lever, Recruitee, Workable, Ashby, BambooHR, Breezy job-board APIs; Rippling, Paylocity, JazzHR and AcademicWorks board pages |
| Organization internship pages | Read for dates and for sentences such as "applications are now closed"; a hash of the text flags pages that changed since the last run |
| USAJOBS | The Historic JOA endpoint (no API key), student-trainee series, filtered to Washington, DC. Shown separately as nonpartisan |

Run-to-run changes (new postings, postings that came down, pages whose text changed) are written to the `changes` block of `data/internships.json`. The previous run is kept as `data/previous.json`.

## How dates are labeled

- **From a posting / from their page**: stated by the organization. The sentence it was read from is stored with it.
- **Listed until**: the posting gives no deadline; this is the day the Senate site takes the posting down.
- **Reported**: from a third-party listing, not confirmed on the organization's page.
- **Estimated**: inferred from last year's date. Hand-entered in `scraper/config/orgs.js` with a note and a source.
- A date printed without a year ("Deadline: November 1") is treated as repeating every year.
- When a page gives a deadline without naming a term, the term is inferred from the calendar and shown with a `?`.

Statuses on the page (open, closes in N days, closed) are worked out from the viewer's date, so the page stays correct between scrapes; the underlying dates only change when you scrape again.

## Add or fix an organization

Edit `scraper/config/orgs.js`. An entry needs only `id`, `name`, `group` and `url`; `npm run discover` fills in the rest. Anything you set by hand wins:

```js
{ id: 'example', name: 'Example Action Fund', group: 'advocacy', url: 'https://example.org',
  page: 'https://example.org/internships',             // page to read for dates
  board: { type: 'greenhouse', token: 'exampleaction' }, // job board to read for postings
  cycles: [{ term: 'Summer 2027', closes: '2027-03-01', basis: 'pattern', note: 'Last year’s deadline was March 1.', source: 'https://example.org/internships' }],
  blurb: 'One line on what they do and what the internship is.' }
```

## Good manners

The scraper identifies itself, obeys `robots.txt` on every HTML crawl, keeps to two requests at a time per host, and does not pretend to be a browser. Sites that refuse automated readers are linked on the page but not checked. Job boards that are aggregators (Arena, GAIN Power, Daybook and the like) are linked, never scraped.

## Things to know

- The roster lists members currently in office. Members elected in November 2026 appear once they are sworn in and the public roster is updated. `CONTROL` in `scraper/run.js` records which party organizes each chamber, used only to read postings that say "majority staff" or "minority staff"; edit it if it is wrong.
- About half of Hill offices print no date on their internship page. The site says so rather than guessing.
- Deadline extraction is rule-based. It only accepts a date when a deadline phrase sits in the same sentence, and the page shows the sentence so you can judge it. It will still miss some and misread a few: the linked page is the authority.
- Postings from Republican offices are scraped (the bulletins mix both parties) and left out when the site is built. They remain in `data/internships.json` with `party: "R"`.

## Term order

Postings, the Hill roll and the federal list are grouped by term. The order within a year is set by one line near the top of the script in `site/template.html`:

```js
var SEASONS = ['Spring', 'Fall', 'Summer'];
```

Reorder the names and run `npm run build`.

## Refreshing

- `.github/workflows/blue-ticket.yml` (at the repository root) runs the checks and a build on every push that touches this folder. Its **Run workflow** button scrapes again and commits the refreshed `data/internships.json` and `site/index.html`.
- `site/index.html` is the page in the form Claude Artifacts publish; `dist/index.html` (built, not committed) is the same page as a standalone document for any static host.

## Layout

```
scraper/run.js            orchestrator; writes data/internships.json
scraper/discover.js       finds careers pages, internship pages and hiring systems
scraper/config/orgs.js    the organization list and hand-checked cycles
scraper/sources/          one adapter per source
scraper/lib/              HTTP (politeness, robots.txt), text and date rules, roster
build.js                  data → site/index.html (Artifact form) and dist/index.html (standalone)
data/internships.json     the latest scrape
site/template.html        the page: markup, styles and script
server.js                 local site + JSON API
```
