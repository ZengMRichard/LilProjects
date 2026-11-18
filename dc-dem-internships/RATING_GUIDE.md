# How Claude rates a posting

Each posting gets four scores from 1 to 5, or `null` where its text gives nothing to go on, and one sentence saying why. A rating is Claude's reading of the posting's own words, plus what is generally true of that kind of placement. It is not an intern review and must never be written as if it were.

Ratings live in `data/ratings.json`, keyed by posting id. The text and facts they rest on are in `data/digests.json`, which the scraper rewrites on each run.

## Rules

- Use only the posting's entry in `data/digests.json`. Do not look anything up.
- Never state or imply something negative about a named office or organization that its own posting does not say. Where the text is silent, score `null`, not low.
- `why` is one sentence of at most 170 characters that names the facts the scores rest on.
- Leave an existing rating alone unless the posting's text has changed.
- Postings with no digest entry (the federal USAJOBS feed carries no description) are not rated.

## Scores

**balance**: how much room the schedule leaves.

| Score | When |
|---|---|
| 5 | Part-time or under 25 hours a week, or flexible hours with remote or hybrid work |
| 4 | Flexible hours, a part-time option, or hybrid work |
| 3 | A standard full-time week is stated |
| 2 | Full-time plus evenings, weekends or long session days are stated |
| 1 | The posting itself says the hours are heavy |
| null | No hours or schedule stated |

**social**: how much of a cohort there is.

| Score | When |
|---|---|
| 5 | A named class or cohort with shared housing or programmed events |
| 4 | An intern class or cohort, in person |
| 3 | In person, in an office that takes several interns |
| 2 | Remote, or a single intern |
| null | Not stated |

**network**: who you meet.

| Score | When |
|---|---|
| 5 | A Hill or national-committee placement with programmed access: speaker series, mentors, events with members or senior staff |
| 4 | A Hill office, committee, national party committee or well-known institution, in person |
| 3 | An established organization or firm, with contact across teams |
| 2 | Mostly remote, or a small shop |
| null | Not enough to say |

**work**: how substantive the tasks are.

| Score | When |
|---|---|
| 5 | Named substantive work (research, drafting, legal work, data, a defined project) with little administrative work |
| 4 | A mix that leans substantive |
| 3 | An even mix of substantive and front-office work |
| 2 | Mostly phones, mail, tours and administrative tasks |
| null | Duties not described |

## Format

```json
{
  "ratings": {
    "house:MEM-330-26": { "balance": 4, "social": 3, "network": 4, "work": 4, "why": "32 flexible hours a week in person; mostly graphics, video and press writing with some front-office help.", "at": "2026-11-13" }
  }
}
```
