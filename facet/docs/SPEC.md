# Facial Aesthetics Analysis Platform — Product & Technical Spec

Nov 11, 2026 · @Richard

A Markdown transcription of [Facet-Product-and-Technical-Spec.pdf](Facet-Product-and-Technical-Spec.pdf),
which remains the source of truth. What this repository has built against it is tracked in
[PROGRESS.md](PROGRESS.md); where the build departs from it, see [DECISIONS.md](DECISIONS.md).

## 1. Overview

**Facet** (working codename) turns a set of guided selfies into a measured, explained
facial-aesthetics report in under 2 minutes, with a premium tier reviewed by a human analyst. It
is modeled on [Qoves Studio](https://qoves.com/facial-assessment-tool/), whose reports pair
cephalometric-style measurements against population averages with a personalized improvement
plan ([sample report](https://www.scribd.com/document/683724839/Sample-FINAL-Comprehensive-Report-V2)).

**Problem.** People researching skincare, grooming, orthodontics or cosmetic procedures get
either vague influencer advice or a costly in-person consult. There is little in between that is
structured, measured and honest about uncertainty.

**Vision.** The most trustworthy place to understand your face: precise measurements, plain
explanations, conservative recommendations, and a clear handoff to qualified professionals when
something is beyond self-care.

**Goals (first 12 months)**

1. Ship an automated report covering proportions, symmetry, feature-level metrics and skin,
   generated in < 120 s at p95.
2. Landmark accuracy within 2% of inter-pupillary distance against a hand-annotated test set.
3. Measurable fairness: no metric's error differs by more than 15% across skin-tone and ancestry
   groups.
4. 10,000 paid reports and a 4.5+ store rating.

**Non-goals**

- Medical diagnosis, surgical planning or any claim of clinical accuracy.
- A single "attractiveness score" or ranking users against each other.
- Users under 18, or analysis of anyone other than the account holder.
- Real-time AR filters or social sharing feeds.

## 2. Users and use cases

Three personas drive the MVP; clinicians are a v2 B2B channel.

| Persona | Who | Job to be done | What they pay for |
| --- | --- | --- | --- |
| Self-improver | 18–35, grooming and skincare focused | "Tell me which non-invasive changes would make the biggest difference." | Full report + routine plan |
| Procedure researcher | 25–50, considering orthodontics, fillers or rhinoplasty | "Help me understand my features before I see a surgeon, so I ask better questions." | Report + consult-prep pack |
| Style seeker | 18–40 | "Which hairstyles, glasses and beard shapes suit my face shape?" | Style add-on |
| Clinician (v2) | Dermatologists, orthodontists, aesthetic clinics | "Give me standardized measurements and before/after tracking for patients." | Seat-based B2B plan |

**Core journey (MVP)**

1. Download app, confirm 18+, read and accept the biometric consent screen.
2. Guided capture: frontal, left and right profile, 3/4 views, with live checks for lighting,
   angle, expression and distance.
3. Optional context: goals (skin, jaw, style), age range, self-identified ancestry for
   reference-norm selection.
4. Free preview: face shape, 3 headline proportions, skin snapshot.
5. Paywall, then the full report in ~2 minutes, delivered in-app and as a PDF.
6. Routine plan with check-ins; re-scan after 4–12 weeks to track change.
7. Premium only: analyst review within 72 hours, with written commentary and a short video
   walkthrough.

## 3. Feature scope

The MVP ships the capture flow, automated report and routine plan; human review, morphs and B2B
come after the core metrics prove accurate.

| Feature | Release | Description |
| --- | --- | --- |
| Guided multi-angle capture | MVP | On-device face mesh gives live feedback on yaw/pitch/roll (±5°), lighting, neutral expression, glasses and hair occlusion |
| Quality gate | MVP | Rejects blurry, filtered or heavily edited photos before upload; detects screenshots of other people's photos |
| Proportions and harmony | MVP | Facial thirds and fifths, width-to-height ratio, canthal tilt, lip ratios, nasal ratios, jaw and chin angles |
| Symmetry map | MVP | Per-region left/right deviation shown as a heatmap overlay, with context that mild asymmetry is normal |
| Skin snapshot | MVP | Texture, redness, visible pores, under-eye darkness and spot detection, each as a low/medium/high band |
| Report viewer + PDF | MVP | Annotated images, metric cards with a plain-language explanation, reference range and confidence |
| Routine plan | MVP | Ranked non-invasive actions (skincare, grooming, posture, sleep) with evidence level per item |
| Progress tracking | MVP | Re-scan under the same capture protocol; side-by-side and metric deltas over time |
| Style guide | v2 | Hairstyle, eyewear and beard recommendations by face shape, with try-on previews |
| Analyst review | v2 | Human expert annotates, corrects landmarks and writes commentary; 72-hour SLA |
| Consult-prep pack | v2 | Questions to ask, how procedures are typically evaluated, how to vet a board-certified provider |
| Morph visualizations | v3 | Constrained, clearly labeled simulations of conservative changes, never shown by default |
| Clinic portal | v3 | Patient roster, standardized captures, longitudinal tracking, exports |

Each metric card follows one pattern: what was measured, your value, the typical range for your
selected reference group, what it means in plain words, and how confident the system is.

## 4. Analysis engine

The engine is deterministic geometry on top of learned landmarks: ML finds the points, plain math
computes the metrics, so every number is explainable and reproducible.

**Pipeline per report**

1. **Detect and align.** Face detection, then 3D head-pose estimation; frames outside ±5° are
   rejected. Images are rotated so the inter-pupillary line is horizontal.
2. **Landmarks.** A dense mesh (478 points via MediaPipe Face Mesh as baseline) plus a custom
   high-precision model for ~68 clinical soft-tissue landmarks: trichion, glabella, nasion,
   subnasale, stomion, menton, gonion, zygion, endocanthion, exocanthion, alar base, pogonion.
3. **Scale normalization.** All distances are divided by inter-pupillary distance (IPD) so phone
   distance and resolution cancel out.
4. **Metric computation.** Pure functions in a versioned `metrics` library, each with unit tests
   and a documented reference.
5. **Uncertainty.** Run landmarks on 8 test-time augmentations (small shifts, brightness
   changes); the spread becomes each metric's confidence interval.
6. **Reference comparison.** Values are placed against published anthropometric norms for the
   user's chosen reference group, reported as a percentile band, never a pass/fail.
7. **Narrative.** A templated explanation per metric, plus an LLM pass that writes the summary
   under strict guardrails (Section 9).

**Key formulas**

Normalized distance between landmarks a and b:

```
d_{ab} = \frac{\lVert p_a - p_b \rVert}{\lVert p_{\text{pupil}_L} - p_{\text{pupil}_R} \rVert}
```

Symmetry index for mirrored landmark pairs (i, i′), reflected across the facial midline M:

```
S = 1 - \frac{1}{n}\sum_{i=1}^{n} \frac{\lVert p_i - M(p_{i'}) \rVert}{\text{IPD}}
```

Canthal tilt, from the inner (en) to outer (ex) eye corner:

```
\theta = \arctan\left(\frac{y_{en} - y_{ex}}{x_{ex} - x_{en}}\right)
```

**MVP metric set**

| Region | Metrics | Landmarks used |
| --- | --- | --- |
| Whole face | Facial thirds, facial fifths, width-to-height ratio, face shape class | Trichion, glabella, subnasale, menton, zygion |
| Eyes | Canthal tilt, eye spacing ratio, palpebral fissure ratio, upper-lid exposure | Endocanthion, exocanthion, pupils |
| Nose | Nasal width to intercanthal width, nasofrontal angle, nasolabial angle (profile) | Alar base, nasion, subnasale, pronasale |
| Lips | Upper-to-lower lip ratio, mouth width to nose width, philtrum length | Labrale superius/inferius, stomion, cheilion |
| Jaw and chin | Gonial angle, bigonial to bizygomatic ratio, chin projection (profile) | Gonion, zygion, pogonion, menton |
| Symmetry | Regional and overall symmetry index | All bilateral pairs |
| Skin | Texture, redness, pores, pigmentation spots, under-eye darkness | Segmentation masks per zone |

**Scoring philosophy.** No overall attractiveness score. Each metric shows a value, a reference
range and a confidence band. A "harmony" summary describes which proportions are typical and
which are distinctive, in neutral language.

## 5. System architecture

A thin API accepts scans and hands them to an asynchronous worker pipeline on AWS, so slow GPU
and LLM steps never block the app and every step can be retried.

*One queue-driven worker turns each scan into a report.*

```
Mobile app                    Web app                      Analyst console
React Native, VisionCamera    Next.js, Stripe checkout     Landmark correction, notes
Live pose and quality checks  Web report viewer and PDF    Audited access, no downloads
        │                            │                            │
        ▼                            ▼                            ▼
API service · FastAPI on EKS
Auth, consent, scans, reports, billing webhooks, export and deletion
Pre-signed URLs let clients upload images straight to S3; reads Postgres and Redis
        │ on submit
        ▼
Job queue · SQS        ──▶  Worker pipeline                 ──▶  Inference · Triton on GPU
One job per submitted scan   1. Quality and tamper check          Landmark, parsing, skin and
Retries and dead-letter      2. Landmarks via inference           tamper models as ONNX
queue                        3. Metrics library (pure math)  ──▶  LLM API
                             4. Narrative with guardrails         Rewrites findings into prose
                             5. PDF render, push notify
                                     │
                                     ▼
Data layer · AWS, encrypted at rest
Postgres · RDS                 Object storage · S3 + KMS      Redis
Users, consent, scans,         Images, purged after 30 days   Sessions and rate limits
landmarks, metrics, audit log  Report PDFs                    Scan status pub/sub
```

Clients never send images through the API: they upload directly to S3 with pre-signed URLs, and
the worker is the only service that reads them.

**Tech stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile | React Native (Expo dev client) + VisionCamera frame processors | One codebase; frame processors run pose and quality models at 30 fps on device |
| On-device ML | MediaPipe Face Mesh, Core ML / TensorFlow Lite | Live capture feedback without uploading frames |
| Web | Next.js + TypeScript, Tailwind | Report viewer, marketing, checkout and analyst console share components |
| API | Python 3.12, FastAPI, Pydantic, SQLAlchemy | Same language as the metrics library and ML code |
| Jobs | AWS SQS + Python workers on EKS | Simple, durable, autoscaling on queue depth |
| Inference | NVIDIA Triton, ONNX models, GPU node pool | Batching and model versioning out of the box |
| Narrative | Hosted LLM API with structured input, temperature 0 | Rewrites findings only; guardrails in Section 9 |
| PDF | Headless Chromium rendering the same React report | One design, two outputs |
| Data | Postgres 16 (RDS), S3 with SSE-KMS, Redis (ElastiCache) | Managed, encrypted, region-pinnable for EU |
| Payments | StoreKit, Google Play Billing, Stripe | Store rules for in-app; Stripe for web |
| Infra and CI | Terraform, GitHub Actions, Argo CD | Reproducible environments, GitOps deploys |
| Observability | OpenTelemetry, Grafana, Sentry | Trace a scan from upload to report |

## 6. Data model and API

Postgres holds accounts, consent, scans and metric results; raw images live only in encrypted
object storage, referenced by key and deleted on schedule.

**Core entities**

| Entity | Key fields | Notes |
| --- | --- | --- |
| `user` | id, email, birth_year_verified, region, created_at | Region drives which consent and retention rules apply |
| `consent` | id, user_id, type, version, granted_at, revoked_at | One row per consent type (biometric processing, research use, analyst review) |
| `scan` | id, user_id, status, capture_protocol_version, created_at | Status: uploaded, rejected, processing, complete, failed |
| `scan_image` | id, scan_id, view (front, left, right, three_quarter), storage_key, quality_json, purge_at | storage_key points to KMS-encrypted S3 object |
| `landmark_set` | id, scan_image_id, model_version, points (jsonb), confidence | Points stored, not the image, so metrics can be recomputed |
| `metric_result` | id, scan_id, metric_key, value, ci_low, ci_high, reference_group, percentile_band, metrics_lib_version | Fully reproducible from landmarks + versions |
| `report` | id, scan_id, tier, narrative_json, pdf_key, status | Tier: free_preview, full, premium |
| `review` | id, report_id, analyst_id, corrections_json, commentary, completed_at | Premium analyst work |
| `plan_item` | id, user_id, report_id, category, action, evidence_level, status | Routine plan tracking |
| `audit_log` | id, actor, action, target, at | Every image access and every deletion |

**REST API (v1)**

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/auth/session` | Sign in (Apple, Google, email magic link) |
| POST | `/v1/consents` | Record a consent grant; DELETE revokes it |
| POST | `/v1/scans` | Create a scan; returns pre-signed upload URLs per view |
| POST | `/v1/scans/{id}/submit` | Lock the scan and enqueue processing |
| GET | `/v1/scans/{id}` | Poll status; also pushed via WebSocket |
| GET | `/v1/reports/{id}` | Full report JSON for the viewer |
| GET | `/v1/reports/{id}/pdf` | Short-lived signed URL to the PDF |
| POST | `/v1/reports/{id}/review` | Purchase and request analyst review |
| GET | `/v1/progress` | Metric deltas across a user's scans |
| GET | `/v1/me/export` | Data-subject export (GDPR/CCPA) |
| DELETE | `/v1/me` | Delete account, images, landmarks and reports within 30 days |

All endpoints require auth except sign-in. Image endpoints are rate-limited and every read writes
an `audit_log` row.

## 7. ML pipeline

Start with pretrained open models, then fine-tune only the clinical-landmark and skin models on
licensed, consented, demographically balanced data.

| Model | Baseline | Fine-tuned target | Runs on |
| --- | --- | --- | --- |
| Face detection + pose | MediaPipe Face Detector / Face Mesh | Off the shelf | Device (capture) + server (verify) |
| Dense mesh | MediaPipe Face Mesh, 478 points | Off the shelf | Server |
| Clinical landmarks | HRNet-W32 heatmap regressor | ~68 soft-tissue points, frontal + profile heads | Server GPU |
| Face parsing | BiSeNet segmentation | Skin zones, hair, glasses, beard | Server GPU |
| Skin attributes | ConvNeXt-Tiny multi-head classifier | Texture, redness, pores, spots, under-eye bands | Server GPU |
| Quality and tamper | Lightweight CNN | Blur, beauty filters, screen-recapture detection | Device + server |

**Data**

- Licensed datasets only, with commercial terms that permit biometric model training; check each
  license (several public face datasets are research-only).
- In-house annotation: 5,000 consented images, two independent annotators per image, a senior
  adjudicator on disagreements over 1.5% IPD.
- Balanced across Fitzpatrick skin types I–VI, age bands 18–65+, sex, and self-identified
  ancestry groups.
- User scans are used for training only with a separate, opt-in research consent; never by
  default.

**Training and serving**

- PyTorch, tracked with MLflow or Weights & Biases; data versioned with DVC.
- Export to ONNX, serve with Triton Inference Server on GPU nodes; on-device capture models via
  Core ML and TensorFlow Lite.
- Every metric result stores `model_version` and `metrics_lib_version`; any model change triggers
  a re-run of the regression suite.

**Evaluation gates (must pass before release)**

| Check | Threshold |
| --- | --- |
| Normalized mean error, clinical landmarks | ≤ 2.0% of IPD overall |
| Error gap across skin-type and ancestry subgroups | ≤ 15% relative to best group |
| Test-retest: same person, 2 captures, same day | Metric drift within the reported CI for 95% of metrics |
| Skin classifier macro-F1 | ≥ 0.75, with per-Fitzpatrick-type breakdown |
| Tamper/filter detection recall | ≥ 0.95 |

Fairness results are published in a model card per release.

## 8. Privacy, security and legal

Face geometry is biometric data almost everywhere we would launch, so the default design is
written opt-in consent, minimal retention and no identification, ever. This section is an
engineering checklist, not legal advice; budget for privacy counsel before launch.

| Law | What it requires of us | Enforcement |
| --- | --- | --- |
| [Illinois BIPA](https://www.recordinglaw.com/us-laws/data-privacy-laws/biometric-privacy-laws/) | Written consent before capture, a public retention and destruction policy, no sale of biometric data | Private right of action, $1,000–$5,000 per violation; 2024 amendment limits recovery to one per person per method ([source](https://privacylawmap.com/biometric-compliance-checker)) |
| [Texas CUBI](https://privacylawmap.com/blog/biometric-privacy-laws-by-state-2026) | Consent before capture for commercial purposes, destruction within a set period | Attorney General only, up to $25,000 per violation; the AG secured a $1.4B Meta settlement in 2024 |
| Washington RCW 19.375 + My Health My Data Act | Notice and consent; MHMDA treats biometric data as consumer health data | AG; MHMDA also has a private right of action |
| [Colorado Privacy Act (2024 biometric amendment)](https://www.venable.com/insights/publications/2026/07/biometric-data-in-focus-what-businesses-need) | BIPA-style consent plus more prescriptive deletion rules | AG |
| CCPA/CPRA and ~20 state privacy laws | Biometric data is sensitive data: opt-in consent, right to delete, right to limit use | State AGs / CPPA |
| EU/UK GDPR, Article 9 | Explicit consent for special-category data, DPIA, EU representative, data residency | Supervisory authorities |

**Design requirements**

- [ ] Separate, unbundled consent screens for biometric processing, analyst review and research
      use; each revocable in settings.
- [ ] Raw images auto-deleted 30 days after report delivery (user can choose immediate
      deletion); landmarks and metrics kept until account deletion.
- [ ] No face recognition or matching across users; embeddings that could identify a person are
      never computed or stored.
- [ ] Age gate: 18+ attestation at sign-up, plus an on-device age-estimation check that blocks
      capture if the face appears under 18.
- [ ] Only the account holder's own face: liveness check at capture (blink or head turn) to
      deter uploading other people's photos.
- [ ] Encryption: TLS 1.3 in transit; S3 SSE-KMS at rest with per-region keys; Postgres
      encrypted at rest.
- [ ] Analyst access through a just-in-time, audited console; images watermarked; no downloads.
- [ ] EU users processed and stored in an EU region.
- [ ] SOC 2 Type I within 12 months; annual penetration test.
- [ ] Published retention policy, privacy policy and model card before launch.

## 9. Responsible design

Appearance-rating products can worsen body image and push people toward procedures they don't
need, so harm reduction is a product requirement, not a disclaimer. Critics already note that
measuring a feature does not prove it predicts beauty or treatment outcomes
([remio](https://www.remio.ai/post/qoves-facial-analysis-turns-beauty-scores-into-treatment-plans-but-measurement-i));
the report should say the same thing plainly.

**Language rules**

- Describe, don't grade: "your canthal tilt is +4°, within the typical range" instead of
  "positive tilt, attractive".
- No words like flaw, defect, ugly, fix, "failo" or community slang from looksmaxxing forums.
- Reference ranges are labeled as population averages from specific studies, with their sample
  and era, not as ideals.
- Every report opens with what the numbers can and cannot tell you, and that most measured
  asymmetry is normal.

**Recommendation rules**

- Order: lifestyle and skincare first, then grooming and style, then "topics to discuss with a
  professional".
- Never recommend a specific surgery, injectable, dose or provider; procedures appear only as
  consult questions.
- Each recommendation carries an evidence level (strong, moderate, limited, anecdotal).
- No "mewing", bone smashing or other unproven or harmful self-treatments, even if users ask.

**LLM guardrails**

- The LLM only rewrites structured findings into prose; it never invents metrics or sees the
  image.
- Output passes a classifier and a banned-phrase list; failures fall back to the template text.
- Red-team set of 500 prompts covering slurs, ethnicity-based judgments, minors and self-harm
  language, run on every model or prompt change.

**Wellbeing safeguards**

- Rate limit: at most 1 full scan per 14 days; re-scans framed around progress, not rescoring.
- If a user's goals or support messages mention distress, self-harm or disordered eating, the
  app shows support resources and pauses upsells.
- Show the routine plan and education before any paid upgrade, not after a low-feeling result.
- Medical disclaimer on every screen with results: general information, not a diagnosis or
  medical advice.

## 10. Monetization

Freemium with one-time report purchases first, a subscription for tracking second, B2B seats
third. Prices below are starting hypotheses to test, not researched market rates.

| Tier | Price (USD, hypothesis) | Includes | Unit cost driver |
| --- | --- | --- | --- |
| Free preview | $0 | Face shape, 3 headline proportions, skin snapshot | ~$0.03 GPU inference |
| Full report | $29 one-time | All MVP metrics, symmetry map, PDF, routine plan | ~$0.10 inference + LLM narrative |
| Tracking plan | $9.99 / month or $59 / year | Re-scans every 14 days, progress deltas, plan check-ins | Inference per scan |
| Premium analyst review | $149 one-time | Full report + human landmark correction, written commentary, video walkthrough | ~45 min analyst time |
| Clinic (v3) | $199 / seat / month | Portal, standardized captures, patient tracking, exports | Support + compliance |

**Rules:** no affiliate links to surgeons or clinics and no paid placement in recommendations,
since that would undercut trust. Skincare product suggestions, if added, are ingredient-level and
disclosed if any partnership exists. App-store purchases go through StoreKit and Google Play
Billing; web checkout through Stripe.

## 11. Delivery plan

A team of 6 can reach a US launch in about 28 weeks if each gate passes on the first attempt.

*Four gates stand between the first prototype and a public launch.*

| Phase | When | Work |
| --- | --- | --- |
| Foundations | Weeks 1–6 | Capture app prototype, MediaPipe baseline, consent flows. Annotation pipeline, cloud infra, metrics library skeleton |
| *Gate* | | Landmark error ≤ 3% of IPD; counsel signs off on the consent design |
| MVP build | Weeks 7–16 | Clinical landmark model, full metric set, skin model. Report viewer, PDF, payments, deletion and export |
| *Gate* | | Every Section 7 evaluation gate passes; external pen test is clean |
| Closed beta | Weeks 17–22 | 500 invited US users, analyst calibration. Copy and harm-reduction review with outside advisors |
| *Gate* | | 70%+ of beta users rate the report useful; zero severe-harm incidents |
| US launch | Weeks 23–28 | Public iOS and Android release, tracking plan. Model card, retention policy and privacy policy published |
| *Gate* | | 2,000 paid reports; refund rate under 5% |
| v2 | Months 8–12 | Analyst review, style guide, consult-prep pack. EU region with GDPR DPIA, SOC 2 Type I |

Each gate is a go/no-go review; a missed gate repeats the last 2 weeks of its phase rather than
shipping around it.

**Team (MVP)**

| Role | Count | Owns |
| --- | --- | --- |
| Mobile engineer | 1 | Capture flow, on-device models, report viewer |
| Backend / infra engineer | 1 | API, workers, storage, privacy controls, CI/CD |
| ML engineers | 2 | Landmark and skin models, evaluation and fairness suite |
| Product designer | 1 | Capture UX, report design, harm-reduction copy |
| Product / founder | 1 | Roadmap, analyst program, partnerships |
| Contract | — | Privacy counsel, dermatology and orthodontic advisors, annotators |

**Repository structure (monorepo)**

```
facet/
  apps/
    mobile/            # React Native + VisionCamera, on-device capture models
    web/               # Next.js: marketing site, web report viewer, checkout
    analyst-console/   # Next.js: landmark correction, commentary, audit trail
  services/
    api/               # FastAPI: auth, scans, reports, consent, billing webhooks
    worker/            # Queue consumers: quality, landmarks, metrics, narrative, PDF
    inference/         # Triton model repository + configs
  packages/
    metrics/           # Pure-Python metric functions, versioned, 100% unit-tested
    norms/             # Reference ranges with citations per study
    report-templates/  # Metric explanations, narrative templates, banned-phrase list
  ml/
    training/          # PyTorch training code, configs
    eval/              # Accuracy, test-retest and fairness suites
    data-cards/        # Dataset licenses and documentation
  infra/               # Terraform: AWS accounts, VPC, EKS, RDS, S3, KMS
  docs/                # ADRs, model cards, runbooks
```

**Testing strategy**

- Metrics: unit tests on synthetic landmark fixtures with known geometry (a perfect symmetric
  face must score S = 1).
- Golden reports: 50 fixed scans whose full report JSON is snapshot-tested on every change.
- Model regression: accuracy, test-retest and fairness suites from Section 7 run in CI on any
  model or metrics change.
- Mobile E2E with Maestro on real devices across 3 iOS and 5 Android models; capture tested in
  low light and with glasses.
- Load: 50 scan submissions per minute sustained with p95 report time under 120 s.
- Privacy: automated checks that purge jobs ran and no image object outlives its `purge_at`.

**Risks**

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Biometric privacy lawsuit or AG action | Medium | High | Counsel review, unbundled consent, 30-day image retention, no identification |
| Model performs worse for darker skin or some ancestries | Medium | High | Balanced data, subgroup gates, published model card |
| App store rejection over appearance-rating content | Medium | Medium | No single score, clear disclaimers, 18+ rating, early review contact |
| Report harms user wellbeing | Medium | High | Section 9 rules, distress detection, advisor review in beta |
| Low accuracy from phone capture conditions | High | Medium | Strict quality gate, multi-view capture, confidence bands shown to users |
| Competitors with an existing brand and dataset | High | Medium | Differentiate on transparency, fairness and progress tracking |

**Open questions**

- [ ] Which reference-norm studies are licensed for commercial use, and how many ancestry groups
      do they cover?
- [ ] Is self-identified ancestry needed at all, or can ranges be shown for every group side by
      side?
- [ ] Should the analyst team be in-house or a vetted contractor network?
- [ ] Launch iOS-only first to halve capture QA?
- [ ] What clinical advisory board, if any, is needed before the consult-prep pack ships?
