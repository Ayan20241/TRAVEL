"""Core domain models: profiles, destinations, trips, preferences."""
from __future__ import annotations
import uuid
from datetime import date, datetime, timezone
from sqlalchemy import (
    String, Text, Date, DateTime, Numeric, ForeignKey, Enum as SQLEnum,
    UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base
from app.models.enums import Role, TripStatus


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Use JSONB on Postgres, plain JSON elsewhere (SQLite tests).
JSONType = JSONB().with_variant(JSON(), "sqlite")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class Profile(Base, TimestampMixin):
    """One row per Supabase Auth user. id == auth.users.id."""
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(SQLEnum(Role, name="user_role"), default=Role.TRAVELER, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    avatar_url: Mapped[str | None] = mapped_column(Text)

    trips: Mapped[list["Trip"]] = relationship("Trip", back_populates="traveler", foreign_keys="Trip.traveler_id")


class Destination(Base, TimestampMixin):
    __tablename__ = "destinations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSONType, default=list)  # e.g. ["history","food"]
    avg_daily_cost: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)

    __table_args__ = (Index("ix_destinations_country", "country"),)


class Trip(Base, TimestampMixin):
    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    traveler_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    operator_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"))
    coordinator_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"))

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_days: Mapped[int] = mapped_column(nullable=False)
    budget: Mapped[float | None] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[TripStatus] = mapped_column(SQLEnum(TripStatus, name="trip_status"), default=TripStatus.DRAFT, nullable=False)
    travel_style: Mapped[str | None] = mapped_column(String(60))  # relaxed|balanced|packed|luxury|budget

    traveler: Mapped[Profile] = relationship("Profile", back_populates="trips", foreign_keys=[traveler_id])
    preferences: Mapped["TripPreference | None"] = relationship("TripPreference", back_populates="trip", uselist=False, cascade="all, delete-orphan")
    itinerary_items: Mapped[list["ItineraryItem"]] = relationship("ItineraryItem", back_populates="trip", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_trips_traveler", "traveler_id"),
        Index("ix_trips_status", "status"),
    )


class TripPreference(Base, TimestampMixin):
    """Preferences influence recommendations; they NEVER override hard constraints."""
    __tablename__ = "trip_preferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), unique=True, nullable=False)

    budget: Mapped[float | None] = mapped_column(Numeric(14, 2))
    accommodation_preference: Mapped[str | None] = mapped_column(String(60))   # hotel|hostel|villa|resort|homestay
    transportation_preference: Mapped[str | None] = mapped_column(String(60))  # flight|train|bus|car|mixed
    interests: Mapped[list] = mapped_column(JSONType, default=list)             # ["history","food",...]
    activity_preferences: Mapped[list] = mapped_column(JSONType, default=list)
    pace: Mapped[str | None] = mapped_column(String(30))                       # relaxed|moderate|fast
    travel_style: Mapped[str | None] = mapped_column(String(60))
    notes: Mapped[str | None] = mapped_column(Text)

    trip: Mapped[Trip] = relationship("Trip", back_populates="preferences")
