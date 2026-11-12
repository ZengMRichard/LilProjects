"""Request and response models. The web app's types are generated from these (pnpm gen:api)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

View = Literal["front", "left", "right", "three_quarter"]
Goal = Literal["skin", "jaw", "style", "general"]
ConsentType = Literal["biometric_processing", "research_use", "analyst_review"]
Confidence = Literal["high", "medium", "low"]


class MagicLinkRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class MagicLinkResponse(BaseModel):
    sent: bool
    dev_token: str | None = None  # returned only in development, where no email is sent


class SessionRequest(BaseModel):
    token: str


class ConsentState(BaseModel):
    type: ConsentType
    title: str
    required: bool
    available: bool
    version: str
    granted: bool
    granted_at: datetime | None
    revoked_at: datetime | None


class Me(BaseModel):
    id: str
    email: str
    age_verified: bool
    age_blocked: bool
    region: str
    consents: list[ConsentState]
    can_scan: bool
    next_scan_at: datetime | None
    upsells_paused: bool
    env: str
    scan_min_interval_days: int
    image_retention_days: int


class AgeRequest(BaseModel):
    birth_date: date


class ConsentRequest(BaseModel):
    type: ConsentType
    version: str


class ScanCreate(BaseModel):
    source: Literal["camera", "synthetic"] = "camera"
    goals: list[Goal] = Field(default_factory=list, max_length=4)
    goal_note: str | None = Field(default=None, max_length=600)
    age_range: Literal["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] | None = None
    views: list[View] = Field(default_factory=lambda: ["front", "left", "right"], max_length=4)


class SupportResource(BaseModel):
    name: str
    detail: str
    url: str


class Support(BaseModel):
    title: str
    body: str
    resources: list[SupportResource]
    note: str


class ImageState(BaseModel):
    view: View
    stored: bool
    purge_at: datetime | None
    purged_at: datetime | None


class ScanOut(BaseModel):
    id: str
    status: Literal["uploaded", "rejected", "processing", "complete", "failed"]
    source: Literal["camera", "synthetic"]
    created_at: datetime
    completed_at: datetime | None
    reject_reasons: list[str]
    error: str | None
    report_id: str | None
    images: list[ImageState]


class ScanCreated(BaseModel):
    scan: ScanOut
    uploads: dict[str, str]
    support: Support | None


class ViewSubmission(BaseModel):
    width: int = Field(gt=0, le=10000)
    height: int = Field(gt=0, le=10000)
    landmarks: list[list[float]]
    augmented: list[list[list[float]]] = Field(default_factory=list, max_length=16)
    blendshapes: dict[str, float] = Field(default_factory=dict)
    liveness: bool = False


class ScanSubmit(BaseModel):
    model_version: str = Field(max_length=80)
    views: dict[View, ViewSubmission]


class SignedUrl(BaseModel):
    url: str
    expires_at: datetime


class Reference(BaseModel):
    low: float
    high: float
    range_display: str
    band: str
    side: Literal["below", "typical", "above"]
    borderline: bool
    provisional: bool
    group_label: str


class MetricCard(BaseModel):
    key: str
    region: str
    title: str
    unit: str
    locked: bool = False
    experimental: bool = False
    value: float | None = None
    display: str | None = None
    ci_low: float | None = None
    ci_high: float | None = None
    ci_display: str | None = None
    confidence: Confidence | None = None
    confidence_reason: str | None = None
    reference: Reference | None = None
    what: str | None = None
    meaning: str | None = None
    definition: str | None = None
    landmarks: list[str] = Field(default_factory=list)


class Region(BaseModel):
    key: str
    label: str


class FaceShapeOut(BaseModel):
    label: str
    runner_up: str | None
    length_to_width: float
    forehead_to_cheek: float
    jaw_to_cheek: float
    text: str


class SymmetryRegion(BaseModel):
    key: str
    label: str
    index: float
    mean_deviation_pct: float


class SymmetryOut(BaseModel):
    overall: MetricCard
    regions: list[SymmetryRegion]
    pairs: list[tuple[int, int, str, float]]
    note: str


class SkinAttributeOut(BaseModel):
    key: str
    label: str
    band: Literal["low", "medium", "high"] | None
    value: float | None
    text: str


class SkinOut(BaseModel):
    status: Literal["ok", "unavailable"]
    reason: str | None = None
    note: str
    attributes: list[SkinAttributeOut]


class PlanItemOut(BaseModel):
    id: str
    key: str
    category: str
    category_label: str
    action: str
    detail: str
    reason: str
    evidence_level: Literal["strong", "moderate", "limited", "anecdotal"]
    evidence_note: str
    status: Literal["todo", "doing", "done", "skipped"]


class PlanOut(BaseModel):
    report_id: str | None
    preface: str
    items: list[PlanItemOut]
    locked_count: int = 0


class PlanPatch(BaseModel):
    status: Literal["todo", "doing", "done", "skipped"]


class ImageGeometry(BaseModel):
    width: int | None
    height: int | None
    points: list[tuple[float, float]]
    available: bool


class Geometry(BaseModel):
    frontal: list[tuple[float, float]]
    image: ImageGeometry


class Figures(BaseModel):
    thirds: dict[str, float]
    fifths: list[float]
    canthal_tilt: dict[str, float]


class Opener(BaseModel):
    title: str
    can: list[str]
    cannot: list[str]
    asymmetry: str
    ranges: str


class ReferenceGroupOut(BaseModel):
    key: str
    label: str
    description: str
    provisional: bool
    note: str
    source: str | None
    sample: str | None
    era: str | None


class Unmeasured(BaseModel):
    key: str
    title: str
    reason: str


class Upsell(BaseModel):
    paused: bool
    price_usd: int
    provider: Literal["dev", "none"]


class SummaryOut(BaseModel):
    text: str
    source: Literal["template", "llm"]


class ReportOut(BaseModel):
    id: str
    scan_id: str
    tier: Literal["free_preview", "full", "premium"]
    source: Literal["camera", "synthetic"]
    created_at: datetime
    versions: dict[str, str]
    reference_group: ReferenceGroupOut
    opener: Opener
    regions: list[Region]
    headline: list[str]
    metrics: list[MetricCard]
    face_shape: FaceShapeOut
    figures: Figures
    geometry: Geometry
    symmetry: SymmetryOut | None
    skin: SkinOut
    summary: SummaryOut | None
    plan: PlanOut
    unavailable: list[Unmeasured]
    poses: dict[str, dict[str, float]]
    support: Support | None
    upsell: Upsell
    disclaimer: str


class ReportSummary(BaseModel):
    id: str
    scan_id: str
    tier: str
    source: str
    created_at: datetime


class CheckoutRequest(BaseModel):
    report_id: str
    product: Literal["full_report"] = "full_report"


class CheckoutResult(BaseModel):
    status: Literal["paid"]
    provider: str
    tier: str
    amount_usd: int


class ProgressPoint(BaseModel):
    scan_id: str
    report_id: str | None
    at: datetime
    value: float
    display: str
    ci_low: float | None
    ci_high: float | None


class ProgressMetric(BaseModel):
    key: str
    title: str
    region: str
    unit: str
    points: list[ProgressPoint]
    delta: float
    delta_display: str
    within_noise: bool | None
    reference_low: float | None
    reference_high: float | None


class ProgressOut(BaseModel):
    source: Literal["camera", "synthetic"] | None
    scans: list[ReportSummary]
    metrics: list[ProgressMetric]
    note: str


class AuditEntry(BaseModel):
    actor: str
    action: str
    target: str
    at: datetime


class Health(BaseModel):
    status: Literal["ok"]
    version: str
    env: str
    overdue_images: int
