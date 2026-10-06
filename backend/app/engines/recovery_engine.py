"""Recovery Engine — generate candidate recovery options and VALIDATE each one
with the deterministic Constraint Engine. Only feasible options are offered.

Generation is rule-based (templates per disruption type); the AI layer only
RANKS the feasible options — it never creates or approves them.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.engines.disruption_engine import build_graph
from app.engines.constraint_engine import evaluate as evaluate_constraints
from app.models import (
    Disruption, DisruptionType, DisruptionStatus, RecoveryOption, RecoveryAction,
    ItineraryItem, ItineraryDependency, ItemType,
)
from app.utils.audit import log_action


@dataclass
class CandidateOption:
    action: RecoveryAction
    title: str
    description: str
    changes: dict[str, dict] = field(default_factory=dict)  # item_id -> {"start_time": iso, "end_time": iso, ...}
    estimated_cost_delta: float = 0.0
    experience_impact: str = "low"  # low|medium|high
    affected_items: list[str] = field(default_factory=list)
    reason: str = ""


def _shift_change(item: ItineraryItem, minutes: int) -> dict:
    return {
        "start_time": (item.start_time + timedelta(minutes=minutes)).isoformat(),
        "end_time": (item.end_time + timedelta(minutes=minutes)).isoformat(),
    }


def generate_candidates(
    db: Session, disruption: Disruption
) -> list[CandidateOption]:
    """Rule-based candidate generation per disruption type."""
    items = {str(i.id): i for i in
             db.query(ItineraryItem).filter(ItineraryItem.trip_id == disruption.trip_id).all()}
    src = items.get(str(disruption.source_item_id)) if disruption.source_item_id else None
    candidates: list[CandidateOption] = []
    delay = disruption.delay_minutes or 0

    def downstream_of(item_id: str) -> list[ItineraryItem]:
        deps = db.query(ItineraryDependency).filter(
            ItineraryDependency.trip_id == disruption.trip_id,
            ItineraryDependency.source_item_id == UUID(item_id)).all()
        out = []
        for d in deps:
            nxt = items.get(str(d.target_item_id))
            if nxt:
                out.append(nxt)
                out.extend(downstream_of(str(nxt.id)))
        return out

    if disruption.type in (DisruptionType.FLIGHT_DELAY, DisruptionType.TRAIN_DELAY) and src:
        affected = downstream_of(str(src.id))
        # Option 1: shift everything downstream by the delay.
        changes = {str(i.id): _shift_change(i, delay) for i in [src, *affected]}
        candidates.append(CandidateOption(
            action=RecoveryAction.RESCHEDULE_ITEM,
            title=f"Shift itinerary by {delay} min",
            description=f"Move {src.title} and {len(affected)} downstream item(s) later by the delay.",
            changes=changes, estimated_cost_delta=0.0, experience_impact="low",
            affected_items=[str(i.id) for i in [src, *affected]],
            reason="Preserves the full plan; only timing moves.",
        ))
        # Option 2: drop the first optional activity to recover buffer.
        optional = [i for i in affected if i.type == ItemType.ACTIVITY and not i.is_fixed]
        if optional:
            drop = optional[0]
            candidates.append(CandidateOption(
                action=RecoveryAction.CANCEL_OPTIONAL_ACTIVITY,
                title=f"Skip '{drop.title}' to recover time",
                description="Cancel one optional activity so the rest of the day keeps its buffers.",
                changes={str(drop.id): {"status": "CANCELLED"}},
                estimated_cost_delta=-(float(drop.cost or 0)),
                experience_impact="medium",
                affected_items=[str(drop.id)],
                reason="Sacrifices one optional item to protect the rest.",
            ))
        # Option 3: faster transfer if a transfer follows.
        transfers = [i for i in affected if i.type == ItemType.TRANSFER]
        if transfers:
            t = transfers[0]
            candidates.append(CandidateOption(
                action=RecoveryAction.CHANGE_TRANSFER,
                title="Upgrade to express transfer",
                description=f"Replace '{t.title}' with a faster express option to win back time.",
                changes={str(t.id): {"title": t.title + " (express)", "duration_minutes": 20}},
                estimated_cost_delta=1500.0, experience_impact="low",
                affected_items=[str(t.id)],
                reason="Buys back buffer with a faster transfer.",
            ))

    if disruption.type == DisruptionType.HOTEL_UNAVAILABLE and src:
        candidates.append(CandidateOption(
            action=RecoveryAction.RESCHEDULE_ITEM,
            title="Rebook a comparable hotel",
            description="Move the stay to a similar hotel nearby for the same nights.",
            changes={str(src.id): {"title": src.title + " (rebooked nearby)", "status": "REBOOKED"}},
            estimated_cost_delta=2500.0, experience_impact="low",
            affected_items=[str(src.id)],
            reason="Keeps the rest of the itinerary untouched.",
        ))

    if disruption.type in (DisruptionType.ACTIVITY_CANCELLED, DisruptionType.FLIGHT_CANCELLATION,
                           DisruptionType.TRANSFER_UNAVAILABLE) and src:
        action = {
            DisruptionType.ACTIVITY_CANCELLED: RecoveryAction.REPLACE_ACTIVITY,
            DisruptionType.FLIGHT_CANCELLATION: RecoveryAction.REPLACE_TRANSPORT,
            DisruptionType.TRANSFER_UNAVAILABLE: RecoveryAction.CHANGE_TRANSFER,
        }[disruption.type]
        candidates.append(CandidateOption(
            action=action,
            title=f"Find replacement for '{src.title}'",
            description="Substitute a comparable alternative in the same time slot.",
            changes={str(src.id): {"title": src.title + " (alternative)", "status": "REBOOKED"}},
            estimated_cost_delta=1000.0, experience_impact="medium",
            affected_items=[str(src.id)],
            reason="Replaces the lost item with the closest alternative.",
        ))

    return candidates


def _apply_changes_to_graph(db, disruption, candidate: CandidateOption):
    """Build a hypothetical graph with the candidate's changes applied."""
    from datetime import datetime
    items = db.query(ItineraryItem).filter(ItineraryItem.trip_id == disruption.trip_id).all()
    deps = db.query(ItineraryDependency).filter(ItineraryDependency.trip_id == disruption.trip_id).all()
    if not items:
        raise ValueError("No itinerary items")
    epoch = min(i.start_time for i in items)

    # Apply changes to in-memory copies of item times.
    overridden: dict[str, tuple] = {}
    for item_id, change in candidate.changes.items():
        if "start_time" in change and "end_time" in change:
            overridden[item_id] = (
                datetime.fromisoformat(change["start_time"]),
                datetime.fromisoformat(change["end_time"]),
            )

    class _Proxy:
        def __init__(self, item):
            self._item = item
            if str(item.id) in overridden:
                s, e = overridden[str(item.id)]
                self.start_time, self.end_time = s, e
            else:
                self.start_time, self.end_time = item.start_time, item.end_time
        def __getattr__(self, name):
            return getattr(self._item, name)

    proxies = [_Proxy(i) for i in items]
    return build_graph(proxies, deps, epoch)


def validate_candidate(db: Session, disruption: Disruption, candidate: CandidateOption) -> bool:
    """A candidate is feasible only if the Constraint Engine says so."""
    try:
        graph, item_types = _apply_changes_to_graph(db, disruption, candidate)
        result = evaluate_constraints(graph, item_types, changed_id=None)
        return result.feasible
    except Exception:
        return False  # fail closed: unvalidatable options are not offered


def generate_recovery_options(
    db: Session, disruption: Disruption, *, actor_id: UUID | None = None
) -> list[RecoveryOption]:
    """Generate, validate, and persist feasible recovery options."""
    persisted: list[RecoveryOption] = []
    for cand in generate_candidates(db, disruption):
        feasible = validate_candidate(db, disruption, cand)
        opt = RecoveryOption(
            trip_id=disruption.trip_id,
            disruption_id=disruption.id,
            action=cand.action,
            title=cand.title,
            description=cand.description,
            estimated_cost_delta=cand.estimated_cost_delta,
            experience_impact=cand.experience_impact,
            feasibility=feasible,
            affected_items=cand.affected_items,
            changes=cand.changes,
            reason=cand.reason,
        )
        db.add(opt)
        persisted.append(opt)

    disruption.status = DisruptionStatus.RECOVERY_PROPOSED
    db.flush()
    log_action(db, actor_id=actor_id, action="RECOVERY_GENERATED",
               resource_type="disruption", resource_id=str(disruption.id),
               new_state={"options": len(persisted),
                          "feasible": sum(1 for o in persisted if o.feasibility)})
    return [o for o in persisted if o.feasibility]


def select_recovery_option(
    db: Session, option: RecoveryOption, *, actor_id: UUID | None = None
) -> RecoveryOption:
    """Apply a feasible option: revalidate, mutate itinerary, audit."""
    from datetime import datetime
    if not option.feasibility:
        raise ValueError("This recovery option is not feasible and cannot be applied")
    # Backend revalidation — the authoritative check before any mutation.
    disruption = db.get(Disruption, option.disruption_id)
    if not validate_candidate(db, disruption,
                              CandidateOption(action=option.action, title=option.title,
                                              description=option.description or "",
                                              changes=option.changes or {})):
        raise ValueError("Recovery option failed revalidation")

    for item_id, change in (option.changes or {}).items():
        item = db.get(ItineraryItem, UUID(item_id))
        if item is None:
            continue
        if "start_time" in change:
            item.start_time = datetime.fromisoformat(change["start_time"])
        if "end_time" in change:
            item.end_time = datetime.fromisoformat(change["end_time"])
        if "title" in change:
            item.title = change["title"]
        if "status" in change:
            from app.models import ItemStatus as _IS
            item.status = _IS(change["status"])
        if "duration_minutes" in change:
            item.duration_minutes = change["duration_minutes"]

    option.selected = True
    from datetime import timezone
    option.selected_at = datetime.now(timezone.utc)
    option.selected_by = actor_id
    disruption.status = DisruptionStatus.RESOLVED
    db.flush()

    log_action(db, actor_id=actor_id, action="RECOVERY_SELECTED",
               resource_type="recovery_option", resource_id=str(option.id),
               new_state={"action": option.action.value, "changes": option.changes})
    return option
