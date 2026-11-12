# Decisions

Numbered records of judgment calls made while building against [SPEC.md](SPEC.md): context,
decision, alternatives. Items marked **Needs owner** are open questions for the human owner.

## D-001 · The project lives in `facet/` inside LilProjects
- Context: the spec assumes its own monorepo; this repository holds several small projects.
- Decision: everything lives under `facet/`, laid out as the spec's monorepo. CI is at the
  repository root in `.github/workflows/facet.yml`, scoped to `facet/**`.

## D-002 · One-shot scope: a working local vertical slice of the MVP
- Context: the spec is 28 weeks for a team of six, on AWS, with trained models and counsel
  review. The request was to build it in one pass.
- Decision: build the MVP feature set (section 3) as software that runs end to end on one
  machine: web app, API, worker pipeline, metrics library, norms, report templates, privacy
  controls. Everything that needs data, GPUs, cloud accounts, app stores or lawyers is left out
  and listed in [PROGRESS.md](PROGRESS.md). No placeholder directories were created for the
  parts not built (`apps/mobile`, `apps/analyst-console`, `services/inference`, `ml/`, `infra/`).

## D-003 · Landmarks are computed in the browser, not on a GPU server
- Context: the spec runs MediaPipe plus a custom clinical-landmark model on Triton. There is no
  trained clinical model, and a Python MediaPipe dependency is heavy and fragile across platforms.
- Decision: the browser runs MediaPipe's face landmarker (478 points) for live guidance and for
  the final landmarks, including the 8 test-time augmentations, and submits landmark sets with
  the scan. The server recomputes pose and every metric from those landmarks with the pure-Python
  library. Photos are still uploaded through signed URLs and stored encrypted, because the
  quality gate, the skin snapshot and the annotated report need pixels.
- Consequence: the server trusts client-supplied landmarks. That is acceptable for a local
  build and wrong for production, where landmarks must come from server inference (the
  `landmark_set.model_version` field records which it was).
- The pose algorithm is implemented twice (Python and TypeScript) and pinned to the same numbers
  by `packages/fixtures/pose_cases.json`, so a frame the capture screen accepts passes the server.

## D-004 · Reference ranges are provisional placeholders (**Needs owner**)
- Context: section 4 places values against published anthropometric norms; open question 1 asks
  which studies are licensed. None has been chosen, and fabricating citations is not acceptable.
- Decision: `packages/norms` ships one pooled-adult group whose ranges are rounded from commonly
  taught proportion figures, with `status: "provisional"`, no source, and a note saying so. The
  report labels every band "provisional" and explains it in the opener. Entries carry only
  `low`/`high`, so the report gives three bands (below, within, above) and no percentiles; the
  five percentile bands switch on when an entry has a cited `mean` and `sd`.
- Not done: ancestry-specific groups. There is no licensed data for them, and open question 2
  asks whether they are needed at all. The reference-group selector is therefore not shown.
- These ranges were sanity-checked against the canonical mesh and one real detection only.
  They must be replaced, and re-derived for this camera-mesh measurement method, before any
  real user sees a band.

## D-005 · Clinical landmarks are approximated by mesh vertices
- Context: the ~68-point clinical model does not exist yet.
- Decision: `facet_metrics/canonical.py` maps each clinical landmark to a fixed MediaPipe vertex
  (the alar point is the most lateral of four). The metric functions take landmark names, so the
  trained model replaces the table without touching them.
- Two MVP metrics cannot be measured honestly from the mesh and are reported as "not measured"
  with the reason, rather than estimated: the **upper third** (the hairline lies above the mesh)
  and **upper-lid exposure** (the lid crease is not a mesh landmark).

## D-006 · Profile metrics are experimental and never compared with a range
- Context: nasofrontal angle, nasolabial angle, gonial angle and chin projection need a true
  profile. MediaPipe does not track a 90° profile reliably.
- Decision: the capture protocol takes two turned views at 35° to 60° of yaw. Profile metrics
  are read from the sagittal plane after the head rotation is removed, using the mesh's depth
  estimate. That depth smooths the nose and chin outline, so these four are marked experimental,
  capped at low confidence, and shown without a reference range. The spec's `three_quarter` view
  is supported by the API but not captured, since nothing would use it (data minimisation).

## D-007 · Face shape is nearest-prototype over three ratios
- Decision: `facet_metrics/shape.py` picks the nearest of six conventional shapes from
  length-to-width, forehead-to-cheek and jaw-to-cheek, and names a runner-up when two are close.
  The prototype values are heuristics. The report says face shape is a styling convention.

## D-008 · The skin snapshot is image statistics, not a skin model (**Needs owner**)
- Context: section 7 specifies a trained ConvNeXt classifier with a macro-F1 gate and a
  per-Fitzpatrick breakdown. There is no training data.
- Decision: `facet_worker/skin.py` computes simple statistics over mesh-defined zones (fine-scale
  lightness variation, cheek-versus-forehead redness, dark-patch coverage, under-eye lightness)
  and bands them with uncalibrated cut-offs. Pores are reported as not assessed below about 260
  pixels between the pupils. The report labels the whole section experimental.
- This has not been tested across skin tones and will behave differently on them. It must not
  ship to users; it exists so the report, plan ranking and pipeline are exercised end to end.

## D-009 · Quality gate: what is checked and what is not
- Checked on the server: head pose per view, face size, mouth closed, exposure, left-right
  lighting evenness, sharpness. Checked on the device and sent as hints: smile and jaw-open
  blendshapes, and a blink for liveness.
- Not checked: beauty filters, heavy edits, photos of screens, glasses and hair occlusion, and
  apparent age. Each needs a trained model. The tamper check is recorded as "not evaluated"
  on every scan instead of silently passing. Liveness is attested by the client, which a
  modified client could fake.
- A rejected scan keeps nothing: its photos are deleted at once.

## D-010 · Local stand-ins for the AWS architecture
- SQS → an in-process queue with retries and a dead-letter state (`facet_worker/jobs.py`).
- S3 + KMS → the filesystem with AES-256-GCM (`facet_api/storage.py`); pre-signed PUT → an
  HMAC-signed upload URL on the API.
- Postgres → SQLite through the same SQLAlchemy models. Redis → in-memory rate limiting.
- WebSocket status push → polling. Triton → none (D-003).
- No Terraform, no deployment config, no observability stack.

## D-011 · Auth is an email magic link, applied instantly in development
- Apple and Google sign-in need provider credentials and are not built. In development the
  magic-link token is returned to the browser instead of emailed; with `FACET_ENV=prod` the
  endpoint refuses until a mailer exists.

## D-012 · Checkout is a test provider that takes no payment
- Stripe, StoreKit and Play Billing are not wired up. In development "Unlock the full report"
  marks the report as full and records a $0 purchase; in production the endpoint returns 501.
  The tracking subscription is not built: progress is shown to anyone with two scans.

## D-013 · The LLM narrative pass is optional and off by default
- With `FACET_LLM_NARRATIVE=1` and the `llm` extra installed, the summary paragraph is rewritten
  by Claude from the structured findings. Its output must pass the banned-phrase list and may not
  contain any number that is not in the findings; a refusal, error, truncation or failed check
  falls back to the template. Everything else in the report is always template text.
- The spec asks for temperature 0. Current Claude models reject sampling parameters, so
  determinism comes from the template fallback and the checks instead. The spec's separate
  output classifier and the 500-prompt red-team set are not built.
- This path is covered by unit tests with a fake client; it has not been run against the live
  API in this session.

## D-014 · The 14-day scan limit is off in development
- `FACET_SCAN_MIN_INTERVAL_DAYS` defaults to 14 when `FACET_ENV=prod` and 0 otherwise, so a
  developer can scan repeatedly. Only completed camera scans count; rejected scans and the
  synthetic sample do not.

## D-015 · Consent withdrawal and retention (**Needs owner**, for counsel)
- Withdrawing biometric consent deletes stored photos and landmark sets immediately and blocks
  new scans. Metric values and reports are kept until account deletion, following the spec's
  "landmarks and metrics kept until account deletion". Whether derived measurements must also go
  on withdrawal is a question for privacy counsel.
- The date of birth is checked once and never stored; only the 18+ outcome is.
- The free-text goals note is screened for distress and then discarded; only the flag is kept.
- Research-use consent is recorded but nothing uses scans for research. Analyst-review consent
  cannot be given, because the feature does not exist.

## D-016 · A synthetic sample scan
- "Use the synthetic sample" runs the whole pipeline on the canonical model face with a small
  fixed asymmetry. It needs no camera, is labelled as synthetic everywhere, does not count toward
  the scan limit, and has no skin snapshot. It is also what the end-to-end tests and the public
  `/sample` page use.

## D-017 · PDF: headless Chromium prints the same report
- `/report/{id}/print` is server-rendered and reachable with a short-lived render token, so
  `GET /v1/reports/{id}/pdf` can print it with a local Chrome or Chromium and return a signed
  URL. If no browser is found the API answers 503 and the web app opens the browser's own print
  dialog on the same page. The cached PDF is deleted with the scan's photos, because it embeds
  one.

## D-018 · Wellbeing resources need clinical review (**Needs owner**)
- The support card lists the 988 Lifeline, Crisis Text Line, findahelpline.com and the BDD
  Foundation. The list and the distress keyword screen should be reviewed by the dermatology and
  mental-health advisors named in the spec before launch.

## D-019 · No licence file
- The spec describes a commercial product, so no open-source licence was added and the packages
  are marked `UNLICENSED`/private. MediaPipe's canonical face model (Apache-2.0) is vendored with
  attribution in `NOTICE`. **Needs owner** if the project should be open source.
