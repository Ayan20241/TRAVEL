"""Disruptions, impact analysis, recovery options, selection."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.client import AIClient
from app.auth import AuthUser, Role, get_current_user, assert_trip_access
from app.database import get_db
from app.engines.disruption_engine import record_disruption, DisruptionInput, analyze_impact
from app.engines.recovery_engine import generate_recovery_options, select_recovery_option
from app.models import Disruption, RecoveryOption, Trip, ConstraintEvaluation
from app.schemas import DisruptionCreate, DisruptionOut, ImpactOut, RecoveryOptionOut

router = APIRouter(prefix="/api/v1", tags=["disruptions"])


def _disruption_or_404(db: Session, disruption_id: UUID, user: AuthUser) -> Disruption:
    d = db.get(Disruption, disruption_id)
    if not d:
        raise HTTPException(404, "Disruption not found")
    trip = db.get(Trip, d.trip_id)
    assert_trip_access(user, trip)
    return d


@router.post("/trips/{trip_id}/disruptions", response_model=DisruptionOut,
             status_code=status.HTTP_201_CREATED)
def create_disruption(trip_id: UUID, data: DisruptionCreate,
                      user: AuthUser = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    try:
        d = record_disruption(
            db,
            DisruptionInput(trip_id=trip.id, type=data.type,
                            source_item_id=data.source_item_id,
                            new_start_time=data.new_start_time,
                            delay_minutes=data.delay_minutes, reason=data.reason),
            actor_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    db.commit()
    db.refresh(d)
    return DisruptionOut.model_validate(d)


@router.get("/trips/{trip_id}/disruptions", response_model=list[DisruptionOut])
def list_disruptions(trip_id: UUID, user: AuthUser = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    trip = db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    assert_trip_access(user, trip)
    ds = (db.query(Disruption).filter(Disruption.trip_id == trip.id)
          .order_by(Disruption.created_at.desc()).all())
    return [DisruptionOut.model_validate(d) for d in ds]


@router.post("/disruptions/{disruption_id}/impact", response_model=ImpactOut)
def run_impact(disruption_id: UUID, user: AuthUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    d = _disruption_or_404(db, disruption_id, user)
    evaluation = analyze_impact(db, d, actor_id=user.id)
    db.commit()
    return ImpactOut(
        evaluation_id=evaluation.id, feasible=evaluation.feasible,
        affected_items=evaluation.affected_items, broken_items=evaluation.broken_items,
        at_risk_items=evaluation.at_risk_items, violations=evaluation.violations,
        warnings=evaluation.warnings, explanation=evaluation.explanation or "")


@router.post("/disruptions/{disruption_id}/recovery-options",
             response_model=list[RecoveryOptionOut])
def create_recovery_options(disruption_id: UUID,
                            user: AuthUser = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    d = _disruption_or_404(db, disruption_id, user)
    options = generate_recovery_options(db, d, actor_id=user.id)

    # AI ranks the PRE-VALIDATED feasible options; never creates new ones.
    ai = AIClient()
    ranked = ai.rank_recovery_options([
        {"id": str(o.id), "title": o.title, "description": o.description,
         "estimated_cost_delta": float(o.estimated_cost_delta or 0),
         "experience_impact": o.experience_impact} for o in options])
    rank_map = {r.option_id: (r.rank, r.reason) for r in ranked}
    for o in options:
        if str(o.id) in rank_map:
            o.ai_rank, reason = rank_map[str(o.id)]
            # store reason transiently via description? keep in response only
    db.commit()

    out = []
    for o in options:
        payload = RecoveryOptionOut.model_validate(o)
        if str(o.id) in rank_map:
            payload.ai_rank, payload.ai_reason = rank_map[str(o.id)]
        out.append(payload)
    return sorted(out, key=lambda x: (x.ai_rank or 99))


@router.get("/disruptions/{disruption_id}/recovery-options",
            response_model=list[RecoveryOptionOut])
def list_recovery_options(disruption_id: UUID,
                          user: AuthUser = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    d = _disruption_or_404(db, disruption_id, user)
    opts = (db.query(RecoveryOption)
            .filter(RecoveryOption.disruption_id == d.id, RecoveryOption.feasibility == True)  # noqa: E712
            .order_by(RecoveryOption.ai_rank.nullslast(), RecoveryOption.estimated_cost_delta)
            .all())
    return [RecoveryOptionOut.model_validate(o) for o in opts]


@router.post("/recovery-options/{option_id}/select", response_model=RecoveryOptionOut)
def select_option(option_id: UUID, user: AuthUser = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    o = db.get(RecoveryOption, option_id)
    if not o:
        raise HTTPException(404, "Recovery option not found")
    trip = db.get(Trip, o.trip_id)
    assert_trip_access(user, trip)
    # Only traveler/operator/admin may accept a recovery option.
    if user.role == Role.VENDOR:
        raise HTTPException(403, "Vendors cannot select recovery options")
    try:
        select_recovery_option(db, o, actor_id=user.id)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    db.commit()
    db.refresh(o)
    return RecoveryOptionOut.model_validate(o)
