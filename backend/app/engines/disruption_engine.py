"""Disruption Engine — record a disruption and run deterministic impact analysis.

Flow:
    record disruption (delay shifts source item, cancellation removes it)
 -> build dependency graph from itinerary + dependencies
 -> apply the disruption to the graph
 -> run the Constraint Engine
 -> classify items into UNAFFECTED / FLAGGED / AT_RISK / BROKEN
 -> persist disruption + constraint evaluation
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from app.engines.dependency_engine import DependencyGraph, DepNode, DepEdge
from app.engines.constraint_engine import evaluate as evaluate_constraints
from app.models import (
    Disruption, DisruptionStatus, DisruptionType, ConstraintEvaluation,
    ItineraryItem, ItineraryDependency, ItemStatus, Trip, TripStatus,
)
from app.utils.audit import log_action


@dataclass
class DisruptionInput:
    trip_id: UUID
    type: DisruptionType
    source_item_id: UUID | None = None
    new_start_time: datetime | None = None
    delay_minutes: int = 0
    reason: str | None = None


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _to_minutes(dt: datetime, epoch: datetime) -> float:
    return (_aware(dt) - _aware(epoch)).total_seconds() / 60.0


def build_graph(
    items: Sequence[ItineraryItem],
    deps: Sequence[ItineraryDependency],
    epoch: datetime,
    shift_item_id: UUID | None = None,
    shift_minutes: float = 0.0,
    remove_item_id: UUID | None = None,
) -> tuple[DependencyGraph, dict[str, str]]:
    nodes: list[DepNode] = []
    item_types: dict[str, str] = {}
    for it in items:
        if remove_item_id and it.id == remove_item_id:
            continue
        start = _to_minutes(it.start_time, epoch)
        end = _to_minutes(it.end_time, epoch)
        if shift_item_id and it.id == shift_item_id:
            start += shift_minutes
            end += shift_minutes
        nodes.append(DepNode(id=str(it.id), start_minutes=start, end_minutes=end,
                             is_fixed=it.is_fixed))
        item_types[str(it.id)] = it.type.value if hasattr(it.type, "value") else str(it.type)
    removed = {str(remove_item_id)} if remove_item_id else set()
    edges = [
        DepEdge(source_id=str(d.source_item_id), target_id=str(d.target_item_id),
                dependency_type=d.dependency_type.value if hasattr(d.dependency_type, "value") else str(d.dependency_type),
                minimum_required_buffer_minutes=d.minimum_required_buffer_minutes)
        for d in deps
        if str(d.source_item_id) not in removed and str(d.target_item_id) not in removed
    ]
    return DependencyGraph(nodes, edges), item_types


def analyze_impact(
    db: Session,
    disruption: Disruption,
    *,
    actor_id: UUID | None = None,
) -> ConstraintEvaluation:
    """Run deterministic impact analysis for a recorded disruption."""
    trip: Trip = db.get(Trip, disruption.trip_id)
    items = db.query(ItineraryItem).filter(ItineraryItem.trip_id == trip.id).all()
    deps = db.query(ItineraryDependency).filter(ItineraryDependency.trip_id == trip.id).all()
    if not items:
        raise ValueError("Trip has no itinerary items to analyze")

    epoch = min(i.start_time for i in items)
    if epoch.tzinfo is None:
        epoch = epoch.replace(tzinfo=timezone.utc)

    delay_types = {DisruptionType.FLIGHT_DELAY, DisruptionType.TRAIN_DELAY}
    cancel_types = {
        DisruptionType.FLIGHT_CANCELLATION, DisruptionType.HOTEL_UNAVAILABLE,
        DisruptionType.ACTIVITY_CANCELLED, DisruptionType.TRANSFER_UNAVAILABLE,
    }

    graph, item_types = build_graph(
        items, deps, epoch,
        shift_item_id=disruption.source_item_id if disruption.type in delay_types else None,
        shift_minutes=float(disruption.delay_minutes or 0),
        remove_item_id=disruption.source_item_id if disruption.type in cancel_types else None,
    )
    changed = str(disruption.source_item_id) if disruption.source_item_id else None
    result = evaluate_constraints(graph, item_types, changed_id=changed)

    evaluation = ConstraintEvaluation(
        trip_id=trip.id,
        disruption_id=disruption.id,
        feasible=result.feasible,
        violations=[v.__dict__ for v in result.violations],
        warnings=[w.__dict__ for w in result.warnings],
        affected_items=result.affected_items,
        broken_items=result.broken_items,
        at_risk_items=result.at_risk_items,
        explanation=result.explanation,
    )
    db.add(evaluation)

    # Reflect impact on itinerary item statuses + trip status.
    state_to_status = {"BROKEN": ItemStatus.BROKEN, "AT_RISK": ItemStatus.AT_RISK}
    for it in items:
        state = result.affected_items.get(str(it.id))
        if state in state_to_status and it.status not in (ItemStatus.CANCELLED, ItemStatus.COMPLETED):
            it.status = state_to_status[state]
    if result.broken_items or result.at_risk_items:
        trip.status = TripStatus.DISRUPTED
    disruption.status = DisruptionStatus.ANALYZED
    db.flush()

    log_action(db, actor_id=actor_id, action="IMPACT_EVALUATED",
               resource_type="disruption", resource_id=str(disruption.id),
               new_state={"feasible": result.feasible,
                          "broken": result.broken_items,
                          "at_risk": result.at_risk_items})
    return evaluation


def record_disruption(db: Session, data: DisruptionInput, *, actor_id: UUID | None = None) -> Disruption:
    """Persist a disruption, then run impact analysis."""
    source_item = db.get(ItineraryItem, data.source_item_id) if data.source_item_id else None
    original_start = source_item.start_time if source_item else None
    new_start = data.new_start_time
    delay = data.delay_minutes
    if source_item and new_start and original_start and not delay:
        delay = int((new_start - original_start).total_seconds() // 60)

    disruption = Disruption(
        trip_id=data.trip_id,
        type=data.type,
        source_item_id=data.source_item_id,
        original_start_time=original_start,
        new_start_time=new_start,
        delay_minutes=delay,
        reason=data.reason,
        status=DisruptionStatus.OPEN,
    )
    db.add(disruption)
    db.flush()

    log_action(db, actor_id=actor_id, action="DISRUPTION_CREATED",
               resource_type="disruption", resource_id=str(disruption.id),
               new_state={"type": data.type.value, "delay_minutes": delay})

    analyze_impact(db, disruption, actor_id=actor_id)
    disruption.status = DisruptionStatus.ANALYZED
    db.flush()
    return disruption
