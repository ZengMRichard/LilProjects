"""Database models (spec section 6). SQLite locally; the same models run on Postgres.

Raw images are never stored here: scan_image.storage_key points at an encrypted object that is
deleted on schedule. Landmarks are stored so metrics can be recomputed without the image.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker
from sqlalchemy.pool import StaticPool

from facet_api.security import new_id


def now() -> datetime:
    return datetime.now(UTC)


def aware(value: datetime | None) -> datetime | None:
    """SQLite drops tzinfo; every timestamp is stored in UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class Base(DeclarativeBase):
    pass


def _pk(prefix: str) -> Mapped[str]:
    return mapped_column(String(40), primary_key=True, default=lambda: new_id(prefix))


class User(Base):
    __tablename__ = "user"
    id: Mapped[str] = _pk("usr")
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    birth_year_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    age_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    region: Mapped[str] = mapped_column(String(8), default="US")
    wellbeing_flag_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuthSession(Base):
    __tablename__ = "auth_session"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MagicLink(Base):
    __tablename__ = "magic_link"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Consent(Base):
    __tablename__ = "consent"
    id: Mapped[str] = _pk("con")
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    version: Mapped[str] = mapped_column(String(20))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Scan(Base):
    __tablename__ = "scan"
    id: Mapped[str] = _pk("scn")
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="uploaded")  # uploaded rejected processing complete failed
    capture_protocol_version: Mapped[str] = mapped_column(String(8))
    source: Mapped[str] = mapped_column(String(12), default="camera")  # camera | synthetic
    goals: Mapped[list] = mapped_column(JSON, default=list)
    age_range: Mapped[str | None] = mapped_column(String(12), nullable=True)
    reference_group: Mapped[str] = mapped_column(String(40), default="pooled_adult")
    reject_reasons: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    images: Mapped[list[ScanImage]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    report: Mapped[Report | None] = relationship(back_populates="scan", cascade="all, delete-orphan", uselist=False)
    metrics: Mapped[list[MetricResult]] = relationship(cascade="all, delete-orphan")


class ScanImage(Base):
    __tablename__ = "scan_image"
    id: Mapped[str] = _pk("img")
    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.id", ondelete="CASCADE"), index=True)
    view: Mapped[str] = mapped_column(String(16))  # front | left | right | three_quarter
    storage_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quality_json: Mapped[dict] = mapped_column(JSON, default=dict)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purge_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    scan: Mapped[Scan] = relationship(back_populates="images")
    landmarks: Mapped[LandmarkSet | None] = relationship(cascade="all, delete-orphan", uselist=False)


class LandmarkSet(Base):
    __tablename__ = "landmark_set"
    id: Mapped[str] = _pk("lms")
    scan_image_id: Mapped[str] = mapped_column(ForeignKey("scan_image.id", ondelete="CASCADE"), index=True)
    model_version: Mapped[str] = mapped_column(String(80))
    points: Mapped[list] = mapped_column(JSON)
    augmented: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)


class MetricResult(Base):
    __tablename__ = "metric_result"
    id: Mapped[str] = _pk("met")
    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.id", ondelete="CASCADE"), index=True)
    metric_key: Mapped[str] = mapped_column(String(60))
    value: Mapped[float] = mapped_column(Float)
    ci_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    ci_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    reference_group: Mapped[str | None] = mapped_column(String(40), nullable=True)
    percentile_band: Mapped[str | None] = mapped_column(String(20), nullable=True)
    metrics_lib_version: Mapped[str] = mapped_column(String(20))


class Report(Base):
    __tablename__ = "report"
    id: Mapped[str] = _pk("rep")
    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.id", ondelete="CASCADE"), unique=True)
    tier: Mapped[str] = mapped_column(String(16), default="free_preview")  # free_preview | full | premium
    narrative_json: Mapped[dict] = mapped_column(JSON, default=dict)
    pdf_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ready")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    scan: Mapped[Scan] = relationship(back_populates="report")
    plan_items: Mapped[list[PlanItem]] = relationship(cascade="all, delete-orphan", order_by="PlanItem.position")


class PlanItem(Base):
    __tablename__ = "plan_item"
    id: Mapped[str] = _pk("pln")
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("report.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(Text)
    detail: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)
    evidence_level: Mapped[str] = mapped_column(String(12))
    evidence_note: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="todo")  # todo | doing | done | skipped
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Purchase(Base):
    __tablename__ = "purchase"
    id: Mapped[str] = _pk("pur")
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[str] = mapped_column(String(40))
    product: Mapped[str] = mapped_column(String(24))
    provider: Mapped[str] = mapped_column(String(16))
    amount_usd: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    """Every image access and every deletion (spec section 6). Rows outlive account deletion,
    keyed by a user id that no longer resolves to a person."""

    __tablename__ = "audit_log"
    id: Mapped[str] = _pk("aud")
    user_id: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    actor: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(120))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def make_engine(url: str):
    if url.startswith("sqlite"):
        memory = url in ("sqlite://", "sqlite:///:memory:")
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            **({"poolclass": StaticPool} if memory else {}),
        )
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def _pragmas(connection, _record):  # pragma: no cover - driver hook
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            if not memory:
                cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


def make_session_factory(engine) -> sessionmaker[Session]:
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def audit(db: Session, *, user_id: str | None, actor: str, action: str, target: str) -> None:
    db.add(AuditLog(user_id=user_id, actor=actor, action=action, target=target))
