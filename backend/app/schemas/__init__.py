"""Pydantic schemas — request/response contracts."""
from __future__ import annotations
from datetime import date, datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    Role, TripStatus, ItemType, ItemStatus, BookingStatus,
    DisruptionType, DisruptionStatus, RecoveryAction,
)


# ---------- Profiles ----------
class ProfileOut(BaseModel):
    id: UUID
    email: str
    full_name: str | None = None
    role: Role
    phone: str | None = None

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=40)


class RoleUpdate(BaseModel):
    role: Role


# ---------- Trips ----------
class TripCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    destination: str = Field(..., min_length=2, max_length=200)
    start_date: date
    end_date: date
    budget: float | None = Field(None, ge=0)
    currency: str = Field("INR", min_length=3, max_length=3)
    travel_style: str | None = Field(None, max_length=60)

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("end_date must be on or after start_date")
        return v


class TripUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    destination: str | None = Field(None, min_length=2, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = Field(None, ge=0)
    travel_style: str | None = Field(None, max_length=60)
    status: TripStatus | None = None
    coordinator_id: UUID | None = None


class TripOut(BaseModel):
    id: UUID
    traveler_id: UUID
    operator_id: UUID | None = None
    coordinator_id: UUID | None = None
    title: str
    destination: str
    start_date: date
    end_date: date
    duration_days: int
    budget: float | None = None
    currency: str
    status: TripStatus
    travel_style: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TripPreferenceIn(BaseModel):
    budget: float | None = Field(None, ge=0)
    accommodation_preference: str | None = Field(None, max_length=60)
    transportation_preference: str | None = Field(None, max_length=60)
    interests: list[str] = Field(default_factory=list)
    activity_preferences: list[str] = Field(default_factory=list)
    pace: str | None = Field(None, max_length=30)
    travel_style: str | None = Field(None, max_length=60)
    notes: str | None = None


class TripPreferenceOut(TripPreferenceIn):
    id: UUID
    trip_id: UUID

    model_config = {"from_attributes": True}


# ---------- Itinerary ----------
class ItineraryItemCreate(BaseModel):
    type: ItemType
    title: str = Field(..., min_length=2, max_length=250)
    description: str | None = None
    location: str | None = Field(None, max_length=250)
    start_time: datetime
    end_time: datetime
    duration_minutes: int | None = Field(None, ge=0)
    cost: float | None = Field(None, ge=0)
    currency: str = Field("INR", min_length=3, max_length=3)
    is_fixed: bool = False
    vendor_id: UUID | None = None
    sequence_order: int = 0

    @field_validator("end_time")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_time" in info.data and v <= info.data["start_time"]:
            raise ValueError("end_time must be after start_time")
        return v


class ItineraryItemUpdate(BaseModel):
    type: ItemType | None = None
    title: str | None = Field(None, min_length=2, max_length=250)
    description: str | None = None
    location: str | None = Field(None, max_length=250)
    start_time: datetime | None = None
    end_time: datetime | None = None
    duration_minutes: int | None = Field(None, ge=0)
    cost: float | None = Field(None, ge=0)
    status: ItemStatus | None = None
    is_fixed: bool | None = None
    vendor_id: UUID | None = None
    sequence_order: int | None = None


class ItineraryItemOut(BaseModel):
    id: UUID
    trip_id: UUID
    type: ItemType
    title: str
    description: str | None = None
    location: str | None = None
    start_time: datetime
    end_time: datetime
    duration_minutes: int | None = None
    cost: float | None = None
    currency: str
    status: ItemStatus
    booked_status: BookingStatus
    is_fixed: bool
    vendor_id: UUID | None = None
    booking_id: UUID | None = None
    sequence_order: int

    model_config = {"from_attributes": True}


class DependencyCreate(BaseModel):
    source_item_id: UUID
    target_item_id: UUID
    dependency_type: str = Field("SEQUENTIAL", pattern="^(SEQUENTIAL|SPATIAL)$")
    minimum_required_buffer_minutes: int = Field(30, ge=0, le=1440)


class DependencyOut(BaseModel):
    id: UUID
    trip_id: UUID
    source_item_id: UUID
    target_item_id: UUID
    dependency_type: str
    minimum_required_buffer_minutes: int

    model_config = {"from_attributes": True}


# ---------- Disruptions ----------
class DisruptionCreate(BaseModel):
    type: DisruptionType
    source_item_id: UUID | None = None
    new_start_time: datetime | None = None
    delay_minutes: int = Field(0, ge=0, le=10080)
    reason: str | None = None


class DisruptionOut(BaseModel):
    id: UUID
    trip_id: UUID
    type: DisruptionType
    source_item_id: UUID | None = None
    original_start_time: datetime | None = None
    new_start_time: datetime | None = None
    delay_minutes: int
    reason: str | None = None
    status: DisruptionStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class ImpactOut(BaseModel):
    evaluation_id: UUID
    feasible: bool
    affected_items: dict[str, str]
    broken_items: list[str]
    at_risk_items: list[str]
    violations: list[dict]
    warnings: list[dict]
    explanation: str


class RecoveryOptionOut(BaseModel):
    id: UUID
    trip_id: UUID
    disruption_id: UUID
    action: RecoveryAction
    title: str
    description: str | None = None
    estimated_cost_delta: float
    experience_impact: str | None = None
    feasibility: bool
    ai_rank: int | None = None
    ai_reason: str | None = None
    affected_items: list[str]
    changes: dict[str, Any]
    reason: str | None = None
    selected: bool

    model_config = {"from_attributes": True}


# ---------- Bookings / pricing ----------
class BookingCreate(BaseModel):
    service_type: str = Field(..., min_length=2, max_length=60)
    service_name: str = Field(..., min_length=2, max_length=250)
    vendor_id: UUID | None = None
    amount: float | None = Field(None, ge=0)
    currency: str = Field("INR", min_length=3, max_length=3)
    notes: str | None = None


class BookingUpdate(BaseModel):
    status: BookingStatus | None = None
    amount: float | None = Field(None, ge=0)
    reference_code: str | None = Field(None, max_length=100)
    notes: str | None = None


class BookingOut(BaseModel):
    id: UUID
    trip_id: UUID
    traveler_id: UUID
    vendor_id: UUID | None = None
    service_type: str
    service_name: str
    reference_code: str | None = None
    status: BookingStatus
    amount: float | None = None
    currency: str
    booked_at: datetime | None = None
    notes: str | None = None

    model_config = {"from_attributes": True}


class PricingOut(BaseModel):
    trip_id: UUID
    currency: str
    transportation: float
    accommodation: float
    activities: float
    other: float
    base_cost: float
    additional_cost: float
    discount: float
    estimated_total: float
    budget: float | None = None
    within_budget: bool | None = None


# ---------- Catalog (vendors / hotels / activities / transport) ----------
class VendorIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    service_type: str = Field(..., max_length=60)
    contact_email: str | None = None
    contact_phone: str | None = Field(None, max_length=40)
    city: str | None = Field(None, max_length=120)
    profile_id: UUID | None = None


class VendorOut(VendorIn):
    id: UUID
    is_active: bool
    rating: float | None = None

    model_config = {"from_attributes": True}


class HotelIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    city: str = Field(..., min_length=2, max_length=120)
    country: str | None = None
    stars: int | None = Field(None, ge=1, le=7)
    price_per_night: float | None = Field(None, ge=0)
    currency: str = "INR"
    amenities: list[str] = Field(default_factory=list)
    vendor_id: UUID | None = None


class HotelOut(HotelIn):
    id: UUID
    is_active: bool

    model_config = {"from_attributes": True}


class ActivityIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    city: str = Field(..., min_length=2, max_length=120)
    category: str | None = None
    duration_minutes: int | None = Field(None, ge=0)
    price: float | None = Field(None, ge=0)
    currency: str = "INR"
    vendor_id: UUID | None = None


class ActivityOut(ActivityIn):
    id: UUID
    is_active: bool

    model_config = {"from_attributes": True}


class TransportationIn(BaseModel):
    mode: str = Field(..., max_length=40)
    name: str = Field(..., min_length=2, max_length=200)
    origin: str | None = None
    destination: str | None = None
    price: float | None = Field(None, ge=0)
    currency: str = "INR"
    vendor_id: UUID | None = None


class TransportationOut(TransportationIn):
    id: UUID
    is_active: bool

    model_config = {"from_attributes": True}


# ---------- Misc ----------
class DestinationOut(BaseModel):
    id: UUID
    name: str
    country: str
    description: str | None = None
    image_url: str | None = None
    tags: list[str] = []
    avg_daily_cost: float | None = None
    currency: str

    model_config = {"from_attributes": True}


class NotificationOut(BaseModel):
    id: UUID
    title: str
    body: str | None = None
    kind: str
    read: bool
    trip_id: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditOut(BaseModel):
    id: UUID
    actor_id: UUID | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    old_state: dict
    new_state: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None


class ReviewOut(BaseModel):
    id: UUID
    trip_id: UUID
    traveler_id: UUID
    rating: int
    comment: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RecommendationOut(BaseModel):
    title: str
    description: str
    category: str = ""
    estimated_cost: float | None = None
    score: float = 0.0


class TripQuestionIn(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)


class Page(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
