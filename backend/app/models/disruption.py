"""Disruption, impact evaluation, recovery options, notifications, audit, reviews."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import (
    String, Text, DateTime, Numeric, Integer, Boolean, ForeignKey,
    Enum as SQLEnum, Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.core import TimestampMixin, JSONType, _uuid, _now
from app.models.enums import (
    DisruptionType, DisruptionStatus, ImpactState, RecoveryAction,
)


class Disruption(Base, TimestampMixin):
    __tablename__ = "disruptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[DisruptionType] = mapped_column(SQLEnum(DisruptionType, name="disruption_type"), nullable=False)
    source_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("itinerary_items.id", ondelete="SET NULL"))

    original_start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    new_start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delay_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[DisruptionStatus] = mapped_column(SQLEnum(DisruptionStatus, name="disruption_status"), default=DisruptionStatus.OPEN, nullable=False)

    __table_args__ = (Index("ix_disruptions_trip", "trip_id"),)


class ConstraintEvaluation(Base, TimestampMixin):
    """Persisted result of a constraint-engine run (impact analysis)."""
    __tablename__ = "constraint_evaluations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    disruption_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("disruptions.id", ondelete="SET NULL"))

    feasible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    violations: Mapped[list] = mapped_column(JSONType, default=list)
    warnings: Mapped[list] = mapped_column(JSONType, default=list)
    affected_items: Mapped[dict] = mapped_column(JSONType, default=dict)  # item_id -> impact state
    broken_items: Mapped[list] = mapped_column(JSONType, default=list)
    at_risk_items: Mapped[list] = mapped_column(JSONType, default=list)
    explanation: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("ix_evaluations_trip", "trip_id"),)


class RecoveryOption(Base, TimestampMixin):
    __tablename__ = "recovery_options"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    disruption_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("disruptions.id", ondelete="CASCADE"), nullable=False)

    action: Mapped[RecoveryAction] = mapped_column(SQLEnum(RecoveryAction, name="recovery_action"), nullable=False)
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    estimated_cost_delta: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    experience_impact: Mapped[str | None] = mapped_column(String(30))  # low|medium|high
    feasibility: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # validated by constraint engine
    ai_rank: Mapped[int | None] = mapped_column(Integer)  # 1 = best, set by AI ranking

    affected_items: Mapped[list] = mapped_column(JSONType, default=list)
    changes: Mapped[dict] = mapped_column(JSONType, default=dict)  # item_id -> {field: new_value}
    reason: Mapped[str | None] = mapped_column(Text)

    selected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    selected_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"))

    __table_args__ = (Index("ix_recovery_disruption", "disruption_id"),)


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(60), default="info", nullable=False)  # info|disruption|recovery|booking
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (Index("ix_notifications_user", "user_id"),)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(100))
    old_state: Mapped[dict] = mapped_column(JSONType, default=dict)
    new_state: Mapped[dict] = mapped_column(JSONType, default=dict)
    meta: Mapped[dict] = mapped_column("metadata", JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    __table_args__ = (
        Index("ix_audit_actor", "actor_id"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
        Index("ix_audit_action", "action"),
    )


class Review(Base, TimestampMixin):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    traveler_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..5
    comment: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (Index("ix_reviews_trip", "trip_id"),)
