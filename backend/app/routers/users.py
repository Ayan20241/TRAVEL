"""Users/me, notifications, audit logs, reviews, operator analytics, health."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import AuthUser, Role, get_current_user, require_roles, assert_trip_access
from app.database import get_db
from app.models import (
    Profile, Notification, AuditLog, Review, Trip, Booking, Disruption,
    TripStatus, BookingStatus, DisruptionStatus,
)
from app.schemas import (
    ProfileOut, ProfileUpdate, RoleUpdate, NotificationOut, AuditOut,
    ReviewIn, ReviewOut,
)
from app.utils.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["users"])


@router.get("/me", response_model=ProfileOut)
def me(user: AuthUser = Depends(get_current_user)):
    return ProfileOut.model_validate(user.profile)


@router.patch("/me", response_model=ProfileOut)
def update_me(data: ProfileUpdate, user: AuthUser = Depends(get_current_user),
              db: Session = Depends(get_db)):
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(user.profile, field, val)
    db.commit()
    db.refresh(user.profile)
    return ProfileOut.model_validate(user.profile)


@router.get("/users", response_model=list[ProfileOut],
            dependencies=[Depends(require_roles(Role.ADMIN, Role.OPERATOR))])
def list_users(db: Session = Depends(get_db), role: Role | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100)):
    q = db.query(Profile).order_by(Profile.created_at.desc())
    if role:
        q = q.filter(Profile.role == role)
    return [ProfileOut.model_validate(p)
            for p in q.offset((page - 1) * page_size).limit(page_size).all()]


@router.patch("/users/{user_id}/role", response_model=ProfileOut,
              dependencies=[Depends(require_roles(Role.ADMIN))])
def set_role(user_id: UUID, data: RoleUpdate, db: Session = Depends(get_db),
             admin: AuthUser = Depends(get_current_user)):
    p = db.get(Profile, user_id)
    if not p:
        raise HTTPException(404, "User not found")
    old = p.role.value
    p.role = data.role
    log_action(db, actor_id=admin.id, action="ROLE_CHANGED", resource_type="profile",
               resource_id=str(p.id), old_state={"role": old},
               new_state={"role": data.role.value})
    db.commit()
    db.refresh(p)
    return ProfileOut.model_validate(p)


# ---------- Notifications ----------
@router.get("/notifications", response_model=list[NotificationOut])
def my_notifications(user: AuthUser = Depends(get_current_user),
                     db: Session = Depends(get_db),
                     unread_only: bool = False):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.read == False)  # noqa: E712
    return [NotificationOut.model_validate(n)
            for n in q.order_by(Notification.created_at.desc()).limit(100).all()]


@router.post("/notifications/{nid}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(nid: UUID, user: AuthUser = Depends(get_current_user),
              db: Session = Depends(get_db)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read = True
    db.commit()


# ---------- Audit ----------
@router.get("/audit-logs", response_model=list[AuditOut],
            dependencies=[Depends(require_roles(Role.ADMIN, Role.OPERATOR))])
def audit_logs(db: Session = Depends(get_db),
               resource_type: str | None = None, action: str | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=200)):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if action:
        q = q.filter(AuditLog.action == action)
    return [AuditOut.model_validate(a)
            for a in q.offset((page - 1) * page_size).limit(page_size).all()]


# ---------- Reviews ----------
@router.post("/trips/{trip_id}/reviews", response_model=ReviewOut,
             status_code=status.HTTP_201_CREATED)
def create_review(trip_id: UUID, data: ReviewIn,
                  user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    if trip.traveler_id != user.id:
        raise HTTPException(403, "Only the traveler can review their trip")
    if trip.status != TripStatus.COMPLETED:
        raise HTTPException(409, "Only completed trips can be reviewed")
    review = Review(trip_id=trip.id, traveler_id=user.id,
                    rating=data.rating, comment=data.comment)
    db.add(review)
    db.commit()
    db.refresh(review)
    return ReviewOut.model_validate(review)


@router.get("/trips/{trip_id}/reviews", response_model=list[ReviewOut])
def list_reviews(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    return [ReviewOut.model_validate(r)
            for r in db.query(Review).filter(Review.trip_id == trip.id).all()]


# ---------- Operator analytics ----------
@router.get("/operator/summary")
def operator_summary(user: AuthUser = Depends(require_roles(Role.OPERATOR, Role.ADMIN)),
                     db: Session = Depends(get_db)):
    active = db.query(func.count(Trip.id)).filter(
        Trip.status.in_([TripStatus.BOOKED, TripStatus.IN_PROGRESS])).scalar()
    disrupted = db.query(func.count(Trip.id)).filter(Trip.status == TripStatus.DISRUPTED).scalar()
    at_risk = db.query(func.count(Disruption.id)).filter(
        Disruption.status.in_([DisruptionStatus.OPEN, DisruptionStatus.ANALYZED,
                               DisruptionStatus.RECOVERY_PROPOSED])).scalar()
    pending_bookings = db.query(func.count(Booking.id)).filter(
        Booking.status == BookingStatus.PENDING).scalar()
    revenue = db.query(func.coalesce(func.sum(Booking.amount), 0)).filter(
        Booking.status == BookingStatus.CONFIRMED).scalar()
    travelers = db.query(func.count(Profile.id)).filter(Profile.role == Role.TRAVELER).scalar()
    return {
        "active_tours": active, "disrupted_tours": disrupted,
        "open_disruptions": at_risk, "pending_bookings": pending_bookings,
        "confirmed_revenue": float(revenue or 0), "travelers": travelers,
    }
