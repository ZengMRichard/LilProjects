# The Blue Ticket

A scraper and a one-page site that track internships on the Democratic side of Washington, DC: Democratic Hill offices, the party committees, and the think tanks, advocacy groups, unions and campaign firms around them, with nonpartisan institutions and federal internships listed beside them. Each run records when applications open and close.

For each posting the page also shows who it says it is open to (undergraduates, graduate and law students, recent graduates), what it asks applicants to send (résumé, cover letter, writing sample, essay and so on), and Claude's four scores for balance, social life, networking and hands-on work. There is also a small game, *Run for It*.

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
| USAJOBS | The Historic JOA endpoint (no API key), student-trainee series, filtered to Washington, DC. Shown on the nonpartisan side |

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

## Open to, asks for, offers

`scraper/lib/signals.js` reads each posting's own text for the level it names (`level`), the materials it asks for (`needs`) and schedule facts such as hours a week, remote or hybrid, and perks (`facts`). These are pattern matches: a missing bubble means the wording was not matched, not that an item is not needed.

## Claude's ratings

`data/ratings.json` holds four scores from 1 to 5 per posting (balance, social, networking, hands-on) and the one sentence they rest on, written by Claude from the posting text in `data/digests.json` against the rubric in `RATING_GUIDE.md`. A score is `null` where the posting does not speak to it. They are AI estimates from the posting's wording, not intern reviews, and the page says so. The nightly run rates any new posting and leaves existing ratings alone.

## Nonpartisan side

Now Hiring has a **Side** control: Democratic side, nonpartisan & federal, or both. The nonpartisan side is USAJOBS student announcements, Hill postings from offices that serve both parties or state no party, and postings from the organizations in `orgs.js` with `group: 'nonpartisan'` (Congress's support agencies, research centers, civic groups). Those organizations also appear in The Field.

## The game

`site/game.js` is *Run for It*, an original canvas runner written into the page at build time. A donkey jumps invented congressmen and ducks flying figures while Washington behind it is repaired and greens over four stages. The best score is kept in the browser's local storage only.

## Buttons

The four pin-back buttons in the masthead are photographs: `site/assets/pin-*.webp`, made from one blank button generated with Canva's image generator and recolored. `build.js` writes them into the page as data URIs so it stays a single file.

## Privacy and legal

The page's Fine Print section carries plain-language privacy and legal notices (no tracking; what stays in the browser; the Google Fonts request; no affiliation; no warranty; not advice; ratings are opinion; the game is satire). They have not been reviewed by a lawyer.

## Term order

Postings and the Hill roll are grouped by term. The order within a year is set by one line near the top of the script in `site/template.html`:

```js
var SEASONS = ['Spring', 'Fall', 'Summer'];
```

Reorder the names and run `npm run build`.

## Refreshing

- A Claude scheduled task runs every night at 12:00 a.m. Pacific: it scrapes, rates any new postings, builds, and commits the data and page to this branch.

- `.github/workflows/blue-ticket.yml` (at the repository root) runs the checks and a build on every push that touches this folder. Its **Run workflow** button scrapes again and commits the refreshed `data/internships.json` and `site/index.html`.
- `site/index.html` is the page in the form Claude Artifacts publish; `dist/index.html` (built, not committed) is the same page as a standalone document for any static host.

## Layout

```
scraper/run.js            orchestrator; writes data/internships.json
scraper/discover.js       finds careers pages, internship pages and hiring systems
scraper/config/orgs.js    the organization list and hand-checked cycles
scraper/sources/          one adapter per source
scraper/lib/              HTTP (politeness, robots.txt), text and date rules, roster, signals (level, needs, facts)
build.js                  data → site/index.html (Artifact form) and dist/index.html (standalone)
data/internships.json     the latest scrape
data/digests.json         posting text and facts the ratings are written from
data/ratings.json         Claude's ratings (see RATING_GUIDE.md)
site/template.html        the page: markup, styles and script
site/game.js              Run for It
site/assets/              the pin-back button photographs
server.js                 local site + JSON API
```
