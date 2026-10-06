"""Bookings, pricing, payments (record-level; no real gateway in hackathon scope)."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import AuthUser, Role, get_current_user, require_roles, assert_trip_access, can_access_vendor
from app.database import get_db
from app.models import Booking, BookingStatus, Trip, ItineraryItem, ItemType, Vendor
from app.schemas import BookingCreate, BookingUpdate, BookingOut, PricingOut
from app.utils.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["bookings"])


@router.post("/trips/{trip_id}/bookings", response_model=BookingOut,
             status_code=status.HTTP_201_CREATED)
def create_booking(trip_id: UUID, data: BookingCreate,
                   user: AuthUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    booking = Booking(trip_id=trip.id, traveler_id=trip.traveler_id,
                      status=BookingStatus.PLANNED, **data.model_dump())
    db.add(booking)
    db.flush()
    log_action(db, actor_id=user.id, action="BOOKING_CREATED", resource_type="booking",
               resource_id=str(booking.id),
               new_state={"service": booking.service_name, "amount": str(booking.amount)})
    db.commit()
    db.refresh(booking)
    return BookingOut.model_validate(booking)


@router.get("/trips/{trip_id}/bookings", response_model=list[BookingOut])
def list_bookings(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    bookings = db.query(Booking).filter(Booking.trip_id == trip.id).all()
    return [BookingOut.model_validate(b) for b in bookings]


@router.patch("/bookings/{booking_id}", response_model=BookingOut)
def update_booking(booking_id: UUID, data: BookingUpdate,
                   user: AuthUser = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(404, "Booking not found")
    trip = db.get(Trip, booking.trip_id)
    assert_trip_access(user, trip)
    # Travelers may cancel their own bookings; confirmations are staff-only.
    if data.status == BookingStatus.CONFIRMED and user.role == Role.TRAVELER:
        raise HTTPException(403, "Only staff can confirm bookings")
    old = {"status": booking.status.value}
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(booking, field, val)
    if data.status == BookingStatus.CONFIRMED:
        from datetime import datetime, timezone
        booking.booked_at = datetime.now(timezone.utc)
    log_action(db, actor_id=user.id, action="BOOKING_UPDATED", resource_type="booking",
               resource_id=str(booking.id), old_state=old,
               new_state={"status": booking.status.value})
    db.commit()
    db.refresh(booking)
    return BookingOut.model_validate(booking)


# Operator-scoped booking view
@router.get("/bookings", response_model=list[BookingOut])
def all_bookings(user: AuthUser = Depends(require_roles(Role.OPERATOR, Role.ADMIN, Role.COORDINATOR)),
                 db: Session = Depends(get_db)):
    q = db.query(Booking)
    if user.role == Role.COORDINATOR:
        q = q.join(Trip, Trip.id == Booking.trip_id).filter(Trip.coordinator_id == user.id)
    return [BookingOut.model_validate(b)
            for b in q.order_by(Booking.created_at.desc()).limit(200).all()]


# ---------- Pricing ----------
TRANSPORT_TYPES = {ItemType.FLIGHT, ItemType.TRAIN, ItemType.BUS, ItemType.TRANSFER}


@router.get("/trips/{trip_id}/pricing", response_model=PricingOut)
def get_pricing(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Backend-authoritative cost estimate. Frontend totals are never trusted."""
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    items = db.query(ItineraryItem).filter(ItineraryItem.trip_id == trip.id).all()

    buckets = {"transportation": 0.0, "accommodation": 0.0, "activities": 0.0, "other": 0.0}
    for it in items:
        cost = float(it.cost or 0)
        if it.type in TRANSPORT_TYPES:
            buckets["transportation"] += cost
        elif it.type == ItemType.HOTEL:
            buckets["accommodation"] += cost
        elif it.type in (ItemType.ACTIVITY, ItemType.EVENT):
            buckets["activities"] += cost
        else:
            buckets["other"] += cost

    base = sum(buckets.values())
    additional = 0.0   # taxes/fees hook for future provider data
    discount = 0.0
    total = base + additional - discount
    budget = float(trip.budget) if trip.budget else None
    return PricingOut(
        trip_id=trip.id, currency=trip.currency, **buckets,
        base_cost=base, additional_cost=additional, discount=discount,
        estimated_total=total, budget=budget,
        within_budget=(total <= budget) if budget is not None else None,
    )
