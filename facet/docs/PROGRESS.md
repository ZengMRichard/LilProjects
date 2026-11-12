# Progress

What has been built against [SPEC.md](SPEC.md), what has been verified and how, and what has
not been built. Judgment calls are in [DECISIONS.md](DECISIONS.md).

## Session 1 · 2026-11-12 · one-shot build of the MVP slice

### Built

| Spec area | State | Notes |
| --- | --- | --- |
| Guided multi-angle capture (§3) | Built for web | Front, left and right views with live checks for head angle, distance, expression, lighting, sharpness and a blink. Auto-captures when all pass. Glasses and hair occlusion are not detected (D-009) |
| Quality gate (§3) | Partly built | Server re-checks pose, size, expression, exposure, evenness, sharpness. Filter, edit and screen-recapture detection is recorded as not evaluated (D-009) |
| Proportions and harmony (§4) | Built | 12 frontal metrics with provisional ranges, 4 experimental profile metrics, face shape. Upper third and upper-lid exposure are reported as not measured (D-005, D-006) |
| Symmetry map (§3, §4) | Built | Spec formula over 148 mirrored pairs in six regions, overall index, heatmap |
| Uncertainty (§4 step 5) | Built | 8 test-time augmentations per view; spread becomes each metric's 95% interval and confidence level |
| Reference comparison (§4 step 6) | Built on placeholders | Band placement works for range-only and mean/sd norms. The shipped ranges are provisional (D-004) |
| Skin snapshot (§3) | Experimental stand-in | Image statistics, uncalibrated, untested across skin tones (D-008) |
| Report viewer + PDF (§3) | Built | Metric cards in the spec's five-part pattern, annotated mesh or photo, print layout, PDF by headless Chromium (D-017) |
| Routine plan (§3, §9) | Built | 16 catalogue items ranked by goals and skin bands, evidence level on each, status tracking |
| Progress tracking (§3) | Built | Deltas across scans, each marked real or within measurement noise |
| Narrative (§4 step 7, §9) | Built | Templates always; optional guarded LLM rewrite of the summary, off by default (D-013) |
| REST API (§6) | Built | All eleven spec endpoints plus uploads, signed object URLs, plan, checkout, audit. `POST /reports/{id}/review` answers 501 |
| Data model (§6) | Built | All entities except `review`. SQLite locally (D-010) |
| Consent, age gate, deletion, export (§8) | Built | Three separate revocable consents, 18+ attestation, 30-day purge, immediate deletion, export zip, account deletion, audit log |
| Wellbeing safeguards (§9) | Built | 14-day limit, distress screening with support resources and paused upsells, plan before paywall, disclaimer on every results screen |
| Monetisation (§10) | Test mode only | Free preview and full report tiers; checkout takes no payment (D-012) |

### Verified

- **Python: 100 tests pass** (`uv run pytest`), covering metrics on fixtures of known geometry
  (a symmetric face scores S = 1; pose recovered to 1e-6°; metrics invariant to distance,
  position and head turns within the capture window), norms, the banned-phrase check over all
  report copy, LLM guardrails with a fake client, the API end to end, the purge job, encryption
  at rest, metadata stripping, the PDF renderer and one golden report snapshot.
- **Web: 10 unit tests pass** (`pnpm -C apps/web test`), including Python/TypeScript pose parity
  on shared fixtures.
- **Lint and types clean**: ruff, pyright, tsc, biome.
- **Browser, synthetic sample**: sign-in, age gate, consent, scan, free preview, unlock, full
  report, progress, plan and settings were driven in headless Chromium with no console errors.
  The Playwright suite in `apps/web/e2e` covers the same journey.
- **Browser, real camera path**: the capture screen was driven with a fake webcam fed a public
  test portrait. MediaPipe detected the face; head angles from the browser and the server agreed
  to within half a degree; lighting, sharpness and blink-based liveness passed; a smile correctly
  blocked capture. With the client's expression threshold relaxed in the test, the front view was
  captured and the flow advanced to the left view.
- **PDF**: `GET /v1/reports/{id}/pdf` produced a 15-page A4 PDF in 1.6 s through the headless
  Chromium shell.

### Not verified

- A complete three-view camera scan by a real person. A still photo cannot turn its head, so the
  left and right captures, the upload of real photos through the browser and the skin snapshot
  on a live capture were exercised only by the API tests (with drawn images) and a direct call
  on one real frame. **Try it with your own webcam before relying on it.**
- Whether MediaPipe tracks every face reliably at the 35° to 60° turn the side views ask for.
- The LLM narrative against the live API (D-013).
- Phones. The layout is responsive and was checked at phone width, but capture was not tested on
  a mobile browser.
- Full Chrome in `--headless=new` mode did not produce a PDF in the build sandbox; the headless
  shell did. The renderer waits for the file rather than the process, but only the shell was
  exercised.

### Not built

Everything below is in the spec and absent from this repository.

- **Mobile app** (React Native, VisionCamera) and native in-app purchases.
- **Analyst console and analyst review** (v2), **style guide**, **consult-prep pack**, **morphs**,
  **clinic portal** (v2 and v3).
- **Trained models**: clinical landmarks, face parsing, skin classifier, quality and tamper
  detector, on-device age estimation. No training code, no dataset, no annotation pipeline.
- **Evaluation gates** (§7): landmark error, subgroup fairness, test-retest, skin F1, tamper
  recall. None can be run without annotated data, so **no accuracy or fairness claim can be made
  about this build**.
- **Licensed reference norms** and any group-specific ranges.
- **Infrastructure**: AWS, Terraform, Triton, SQS, S3/KMS, Redis, Postgres deployment,
  observability, load testing.
- **Auth and payments**: Apple and Google sign-in, email delivery, Stripe, StoreKit, Play Billing,
  the tracking subscription.
- **Legal**: privacy policy, retention policy, model card, counsel review, SOC 2, pen test, EU
  region.
- **Golden reports**: one snapshot, not the fifty the spec asks for.
- **LLM red-team set** and the output classifier.

### Next

1. Run a real scan on a webcam and a phone; fix whatever the turned views reveal.
2. Decide the reference-norm question (open questions 1 and 2), then replace the provisional set.
3. Detect the hairline (hair segmentation) so the upper third can be measured.
4. Start the annotation set; nothing in §7 can move without it.
