"""Itinerary models: items, dependencies, bookings, payments."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import (
    String, Text, DateTime, Numeric, Boolean, ForeignKey, Integer,
    Enum as SQLEnum, Index, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.core import TimestampMixin, JSONType, _uuid, _now
from app.models.enums import (
    ItemType, ItemStatus, BookingStatus, DependencyType, PaymentStatus,
)


class ItineraryItem(Base, TimestampMixin):
    __tablename__ = "itinerary_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)

    type: Mapped[ItemType] = mapped_column(SQLEnum(ItemType, name="item_type"), nullable=False)
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(250))

    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)

    cost: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)

    status: Mapped[ItemStatus] = mapped_column(SQLEnum(ItemStatus, name="item_status"), default=ItemStatus.PLANNED, nullable=False)
    booked_status: Mapped[BookingStatus] = mapped_column(SQLEnum(BookingStatus, name="booking_status"), default=BookingStatus.PLANNED, nullable=False)
    is_fixed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # hard constraint if True

    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"))
    booking_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"))
    sequence_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="itinerary_items")

    __table_args__ = (
        Index("ix_itinerary_trip", "trip_id"),
        Index("ix_itinerary_trip_seq", "trip_id", "sequence_order"),
    )


class ItineraryDependency(Base, TimestampMixin):
    """source must precede target with at least minimum_required_buffer_minutes."""
    __tablename__ = "itinerary_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    source_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("itinerary_items.id", ondelete="CASCADE"), nullable=False)
    target_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("itinerary_items.id", ondelete="CASCADE"), nullable=False)
    dependency_type: Mapped[DependencyType] = mapped_column(SQLEnum(DependencyType, name="dependency_type"), default=DependencyType.SEQUENTIAL, nullable=False)
    minimum_required_buffer_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    __table_args__ = (
        UniqueConstraint("source_item_id", "target_item_id", name="uq_dependency_pair"),
        Index("ix_dependency_trip", "trip_id"),
    )


class Booking(Base, TimestampMixin):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    traveler_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)

    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"))
    service_type: Mapped[str] = mapped_column(String(60), nullable=False)  # hotel|activity|transport...
    service_name: Mapped[str] = mapped_column(String(250), nullable=False)
    reference_code: Mapped[str | None] = mapped_column(String(100))

    status: Mapped[BookingStatus] = mapped_column(SQLEnum(BookingStatus, name="booking_status"), default=BookingStatus.PLANNED, nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    booked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("ix_bookings_trip", "trip_id"),
        Index("ix_bookings_traveler", "traveler_id"),
    )


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(SQLEnum(PaymentStatus, name="payment_status"), default=PaymentStatus.PENDING, nullable=False)
    provider: Mapped[str | None] = mapped_column(String(60))
    provider_ref: Mapped[str | None] = mapped_column(String(200))
