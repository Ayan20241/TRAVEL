"""Trip CRUD + preferences. Trip-level authorization enforced on every route."""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import AuthUser, Role, get_current_user, require_roles, assert_trip_access
from app.database import get_db
from app.models import Trip, TripPreference, TripStatus
from app.schemas import (
    TripCreate, TripUpdate, TripOut, TripPreferenceIn, TripPreferenceOut,
)
from app.utils.audit import log_action

router = APIRouter(prefix="/api/v1/trips", tags=["trips"])


def _to_out(t: Trip) -> TripOut:
    return TripOut.model_validate(t)


@router.post("", response_model=TripOut, status_code=status.HTTP_201_CREATED)
def create_trip(data: TripCreate, user: AuthUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    if user.role not in (Role.TRAVELER, Role.OPERATOR, Role.ADMIN):
        raise HTTPException(403, "Only travelers can create trips")
    duration = (data.end_date - data.start_date).days + 1
    trip = Trip(
        traveler_id=user.id, title=data.title, destination=data.destination,
        start_date=data.start_date, end_date=data.end_date, duration_days=duration,
        budget=data.budget, currency=data.currency, travel_style=data.travel_style,
        status=TripStatus.DRAFT,
    )
    db.add(trip)
    db.flush()
    log_action(db, actor_id=user.id, action="TRIP_CREATED", resource_type="trip",
               resource_id=str(trip.id), new_state={"title": trip.title})
    db.commit()
    db.refresh(trip)
    return _to_out(trip)


@router.get("", response_model=list[TripOut])
def list_trips(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db),
               status_filter: TripStatus | None = Query(None, alias="status"),
               page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    q = db.query(Trip)
    if user.role == Role.TRAVELER:
        q = q.filter(Trip.traveler_id == user.id)
    elif user.role == Role.COORDINATOR:
        q = q.filter(Trip.coordinator_id == user.id)
    elif user.role == Role.VENDOR:
        raise HTTPException(403, "Vendors access bookings, not trips")
    if status_filter:
        q = q.filter(Trip.status == status_filter)
    trips = q.order_by(Trip.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return [_to_out(t) for t in trips]


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: UUID, user: AuthUser = Depends(get_current_user),
             db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    return _to_out(trip)


@router.patch("/{trip_id}", response_model=TripOut)
def update_trip(trip_id: UUID, data: TripUpdate, user: AuthUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    # Only the traveler (or staff) may change core fields; status transitions guarded.
    old = {"status": trip.status.value, "title": trip.title}
    for field in ("title", "destination", "budget", "travel_style"):
        val = getattr(data, field)
        if val is not None:
            setattr(trip, field, val)
    if data.start_date:
        trip.start_date = data.start_date
    if data.end_date:
        trip.end_date = data.end_date
    if data.start_date or data.end_date:
        if trip.end_date < trip.start_date:
            raise HTTPException(422, "end_date must be on or after start_date")
        trip.duration_days = (trip.end_date - trip.start_date).days + 1
    if data.status:
        # Travelers move forward along the planning lifecycle; staff have full control.
        traveler_allowed = {
            TripStatus.DRAFT: {TripStatus.PLANNING, TripStatus.CANCELLED},
            TripStatus.PLANNING: {TripStatus.READY, TripStatus.DRAFT, TripStatus.CANCELLED},
            TripStatus.READY: {TripStatus.BOOKED, TripStatus.PLANNING, TripStatus.CANCELLED},
            TripStatus.BOOKED: {TripStatus.COMPLETED, TripStatus.CANCELLED},
            TripStatus.IN_PROGRESS: {TripStatus.COMPLETED},
            TripStatus.DISRUPTED: set(),
            TripStatus.COMPLETED: set(),
            TripStatus.CANCELLED: set(),
        }
        if user.role == Role.TRAVELER and data.status not in traveler_allowed.get(trip.status, set()):
            raise HTTPException(403, f"Cannot move trip from {trip.status.value} to {data.status.value}")
        trip.status = data.status
    if data.coordinator_id is not None:
        if user.role not in (Role.OPERATOR, Role.ADMIN):
            raise HTTPException(403, "Only operators can assign coordinators")
        trip.coordinator_id = data.coordinator_id
    log_action(db, actor_id=user.id, action="TRIP_UPDATED", resource_type="trip",
               resource_id=str(trip.id), old_state=old,
               new_state={"status": trip.status.value, "title": trip.title})
    db.commit()
    db.refresh(trip)
    return _to_out(trip)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not (user.role in (Role.ADMIN, Role.OPERATOR) or trip.traveler_id == user.id):
        raise HTTPException(403, "You don't have access to this trip")
    if trip.status not in (TripStatus.DRAFT, TripStatus.PLANNING, TripStatus.CANCELLED):
        raise HTTPException(409, "Only draft/planning/cancelled trips can be deleted")
    log_action(db, actor_id=user.id, action="TRIP_DELETED", resource_type="trip",
               resource_id=str(trip.id), old_state={"title": trip.title})
    db.delete(trip)
    db.commit()


@router.put("/{trip_id}/preferences", response_model=TripPreferenceOut)
def upsert_preferences(trip_id: UUID, data: TripPreferenceIn,
                       user: AuthUser = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    pref = db.query(TripPreference).filter(TripPreference.trip_id == trip.id).first()
    if pref is None:
        pref = TripPreference(trip_id=trip.id)
        db.add(pref)
    for field in ("budget", "accommodation_preference", "transportation_preference",
                  "interests", "activity_preferences", "pace", "travel_style", "notes"):
        setattr(pref, field, getattr(data, field))
    db.commit()
    db.refresh(pref)
    return TripPreferenceOut.model_validate(pref)


@router.get("/{trip_id}/preferences", response_model=TripPreferenceOut | None)
def get_preferences(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    pref = db.query(TripPreference).filter(TripPreference.trip_id == trip.id).first()
    return TripPreferenceOut.model_validate(pref) if pref else None
