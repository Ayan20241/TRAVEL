"""AI-assisted recommendations, itinerary generation, trip Q&A."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.ai.client import AIClient
from app.auth import AuthUser, get_current_user, assert_trip_access
from app.database import get_db
from app.models import Trip, TripPreference
from app.schemas import RecommendationOut, TripQuestionIn

router = APIRouter(prefix="/api/v1/trips/{trip_id}", tags=["ai"])


def _trip_ctx(db: Session, trip_id: UUID, user: AuthUser) -> tuple[Trip, TripPreference | None]:
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    pref = db.query(TripPreference).filter(TripPreference.trip_id == trip.id).first()
    return trip, pref


@router.get("/recommendations", response_model=list[RecommendationOut])
def recommendations(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    trip, pref = _trip_ctx(db, trip_id, user)
    ai = AIClient()
    recs = ai.recommend_experiences(
        destination=trip.destination,
        interests=(pref.interests if pref else []) or [],
        travel_style=(pref.travel_style if pref else None) or trip.travel_style,
        budget=float(pref.budget) if pref and pref.budget else (float(trip.budget) if trip.budget else None),
        duration_days=trip.duration_days,
    )
    return [RecommendationOut(**r.__dict__) for r in recs]


@router.get("/itinerary-suggestion")
def itinerary_suggestion(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    """AI day-by-day skeleton. Caller must validate before persisting as items."""
    trip, pref = _trip_ctx(db, trip_id, user)
    ai = AIClient()
    days = ai.generate_itinerary(
        destination=trip.destination,
        start_date=trip.start_date.isoformat(),
        duration_days=trip.duration_days,
        interests=(pref.interests if pref else []) or [],
        travel_style=(pref.travel_style if pref else None) or trip.travel_style,
        budget=float(pref.budget) if pref and pref.budget else (float(trip.budget) if trip.budget else None),
    )
    return {"trip_id": str(trip.id), "ai_enabled": ai.enabled, "days": days}


@router.post("/ask")
def ask_question(trip_id: UUID, data: TripQuestionIn,
                 user: AuthUser = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    trip, pref = _trip_ctx(db, trip_id, user)
    ai = AIClient()
    answer = ai.answer_trip_question(data.question, {
        "title": trip.title, "destination": trip.destination,
        "dates": f"{trip.start_date} to {trip.end_date}",
        "budget": str(trip.budget), "status": trip.status.value,
        "interests": (pref.interests if pref else []),
    })
    return {"answer": answer, "ai_enabled": ai.enabled}
