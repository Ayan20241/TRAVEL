"""Itinerary items + dependencies."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user, assert_trip_access
from app.database import get_db
from app.models import ItineraryItem, ItineraryDependency, Trip, DependencyType
from app.schemas import (
    ItineraryItemCreate, ItineraryItemUpdate, ItineraryItemOut,
    DependencyCreate, DependencyOut,
)
from app.utils.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["itinerary"])


def _trip_or_404(db: Session, trip_id: UUID, user: AuthUser) -> Trip:
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    return trip


@router.get("/trips/{trip_id}/itinerary", response_model=list[ItineraryItemOut])
def list_items(trip_id: UUID, user: AuthUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id, user)
    items = (db.query(ItineraryItem).filter(ItineraryItem.trip_id == trip.id)
             .order_by(ItineraryItem.sequence_order, ItineraryItem.start_time).all())
    return [ItineraryItemOut.model_validate(i) for i in items]


@router.post("/trips/{trip_id}/itinerary", response_model=ItineraryItemOut,
             status_code=status.HTTP_201_CREATED)
def create_item(trip_id: UUID, data: ItineraryItemCreate,
                user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id, user)
    item = ItineraryItem(trip_id=trip.id, **data.model_dump())
    if item.duration_minutes is None:
        item.duration_minutes = int((item.end_time - item.start_time).total_seconds() // 60)
    db.add(item)
    db.flush()
    log_action(db, actor_id=user.id, action="ITINERARY_UPDATED", resource_type="itinerary_item",
               resource_id=str(item.id), new_state={"title": item.title, "trip_id": str(trip.id)})
    db.commit()
    db.refresh(item)
    return ItineraryItemOut.model_validate(item)


@router.patch("/itinerary/{item_id}", response_model=ItineraryItemOut)
def update_item(item_id: UUID, data: ItineraryItemUpdate,
                user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(ItineraryItem, item_id)
    if not item:
        raise HTTPException(404, "Itinerary item not found")
    trip = db.get(Trip, item.trip_id)
    assert_trip_access(user, trip)
    old = {"title": item.title, "start_time": item.start_time.isoformat()}
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(item, field, val)
    if item.end_time <= item.start_time:
        raise HTTPException(422, "end_time must be after start_time")
    log_action(db, actor_id=user.id, action="ITINERARY_UPDATED", resource_type="itinerary_item",
               resource_id=str(item.id), old_state=old,
               new_state={"title": item.title})
    db.commit()
    db.refresh(item)
    return ItineraryItemOut.model_validate(item)


@router.delete("/itinerary/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: UUID, user: AuthUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    item = db.get(ItineraryItem, item_id)
    if not item:
        raise HTTPException(404, "Itinerary item not found")
    trip = db.get(Trip, item.trip_id)
    assert_trip_access(user, trip)
    if item.is_fixed:
        raise HTTPException(409, "Fixed itinerary items cannot be deleted")
    log_action(db, actor_id=user.id, action="ITINERARY_UPDATED", resource_type="itinerary_item",
               resource_id=str(item.id), old_state={"title": item.title, "deleted": True})
    db.delete(item)
    db.commit()


# ---------- Dependencies ----------
@router.get("/trips/{trip_id}/dependencies", response_model=list[DependencyOut])
def list_dependencies(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id, user)
    deps = db.query(ItineraryDependency).filter(ItineraryDependency.trip_id == trip.id).all()
    return [DependencyOut(
        id=d.id, trip_id=d.trip_id, source_item_id=d.source_item_id,
        target_item_id=d.target_item_id,
        dependency_type=d.dependency_type.value if hasattr(d.dependency_type, "value") else str(d.dependency_type),
        minimum_required_buffer_minutes=d.minimum_required_buffer_minutes) for d in deps]


@router.post("/trips/{trip_id}/dependencies", response_model=DependencyOut,
             status_code=status.HTTP_201_CREATED)
def create_dependency(trip_id: UUID, data: DependencyCreate,
                      user: AuthUser = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id, user)
    for iid in (data.source_item_id, data.target_item_id):
        it = db.get(ItineraryItem, iid)
        if not it or it.trip_id != trip.id:
            raise HTTPException(422, "Both items must belong to this trip")
    if data.source_item_id == data.target_item_id:
        raise HTTPException(422, "An item cannot depend on itself")
    dep = ItineraryDependency(
        trip_id=trip.id, source_item_id=data.source_item_id,
        target_item_id=data.target_item_id,
        dependency_type=DependencyType(data.dependency_type),
        minimum_required_buffer_minutes=data.minimum_required_buffer_minutes,
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return DependencyOut(
        id=dep.id, trip_id=dep.trip_id, source_item_id=dep.source_item_id,
        target_item_id=dep.target_item_id, dependency_type=dep.dependency_type.value,
        minimum_required_buffer_minutes=dep.minimum_required_buffer_minutes)


@router.delete("/dependencies/{dep_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dependency(dep_id: UUID, user: AuthUser = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    dep = db.get(ItineraryDependency, dep_id)
    if not dep:
        raise HTTPException(404, "Dependency not found")
    trip = db.get(Trip, dep.trip_id)
    assert_trip_access(user, trip)
    db.delete(dep)
    db.commit()
