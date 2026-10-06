"""Constraint Engine — DETERMINISTIC feasibility evaluation.

Centralizes all timing thresholds. Given a dependency graph with (possibly
shifted) item times, classifies every item into an impact state:

    buffer >= threshold            -> UNAFFECTED
    0 <= buffer < threshold        -> AT_RISK
    buffer < 0                     -> BROKEN (target starts before source ends)
    downstream within blast radius
      but buffers still OK         -> FLAGGED

Never marks every downstream item broken blindly.
"""
from __future__ import annotations
from dataclasses import dataclass, field

from app.engines.dependency_engine import DependencyGraph, DepEdge

# ---------------------------------------------------------------
# CENTRALIZED THRESHOLDS (minutes). Do NOT scatter these values.
# ---------------------------------------------------------------
BUFFER_THRESHOLDS: dict[str, int] = {
    "FLIGHT_DOMESTIC": 75,
    "FLIGHT_INTERNATIONAL": 120,
    "HOTEL_CHECKIN": 60,
    "ACTIVITY": 45,
    "EVENT": 45,
    "TRAIN": 30,
    "BUS": 30,
    "TRANSFER": 30,
    "RESTAURANT": 30,
    "OTHER": 30,
}

# Map item type -> which threshold applies for the *incoming* edge.
TYPE_THRESHOLD_KEY: dict[str, str] = {
    "FLIGHT": "FLIGHT_DOMESTIC",   # callers may override with FLIGHT_INTERNATIONAL
    "TRAIN": "TRAIN",
    "BUS": "BUS",
    "TRANSFER": "TRANSFER",
    "HOTEL": "HOTEL_CHECKIN",
    "ACTIVITY": "ACTIVITY",
    "EVENT": "EVENT",
    "RESTAURANT": "RESTAURANT",
    "OTHER": "OTHER",
}


@dataclass
class ConstraintViolation:
    item_id: str
    rule: str
    severity: str  # error | warning
    expected_value: float | str | None
    actual_value: float | str | None
    message: str


@dataclass
class ConstraintEvaluationResult:
    feasible: bool
    violations: list[ConstraintViolation] = field(default_factory=list)
    warnings: list[ConstraintViolation] = field(default_factory=list)
    affected_items: dict[str, str] = field(default_factory=dict)  # item_id -> impact state
    broken_items: list[str] = field(default_factory=list)
    at_risk_items: list[str] = field(default_factory=list)
    explanation: str = ""


def threshold_for(item_type: str, international: bool = False) -> int:
    key = TYPE_THRESHOLD_KEY.get(item_type, "OTHER")
    if item_type == "FLIGHT" and international:
        key = "FLIGHT_INTERNATIONAL"
    return BUFFER_THRESHOLDS[key]


def evaluate(
    graph: DependencyGraph,
    item_types: dict[str, str],
    changed_id: str | None = None,
    international_flags: dict[str, bool] | None = None,
) -> ConstraintEvaluationResult:
    """Evaluate all dependency buffers in the graph.

    `changed_id`: the disrupted item; its downstream blast radius is computed
    so unaffected-but-downstream items become FLAGGED instead of BROKEN.
    """
    international_flags = international_flags or {}
    violations: list[ConstraintViolation] = []
    warnings: list[ConstraintViolation] = []
    affected: dict[str, str] = {}

    blast = set(graph.blast_radius(changed_id)) if changed_id else set()

    for edge in graph.edges:
        if edge.source_id not in graph.nodes or edge.target_id not in graph.nodes:
            continue
        tgt_type = item_types.get(edge.target_id, "OTHER")
        required = max(
            edge.minimum_required_buffer_minutes,
            threshold_for(tgt_type, international_flags.get(edge.target_id, False)),
        )
        actual = graph.buffer_minutes(edge)

        if actual < 0:
            state = "BROKEN"
            violations.append(ConstraintViolation(
                item_id=edge.target_id,
                rule="BUFFER_UNDERFLOW",
                severity="error",
                expected_value=required,
                actual_value=round(actual, 1),
                message=(f"{edge.target_id} starts {abs(actual):.0f} min before "
                         f"{edge.source_id} ends (needs {required} min buffer)"),
            ))
        elif actual < required:
            state = "AT_RISK"
            warnings.append(ConstraintViolation(
                item_id=edge.target_id,
                rule="BUFFER_BELOW_THRESHOLD",
                severity="warning",
                expected_value=required,
                actual_value=round(actual, 1),
                message=(f"Buffer into {edge.target_id} is {actual:.0f} min, "
                         f"below the {required} min threshold"),
            ))
        else:
            state = "FLAGGED" if edge.target_id in blast else "UNAFFECTED"

        # Keep the worst state seen for an item with multiple incoming edges.
        rank = {"UNAFFECTED": 0, "FLAGGED": 1, "AT_RISK": 2, "BROKEN": 3}
        prev = affected.get(edge.target_id, "UNAFFECTED")
        affected[edge.target_id] = state if rank[state] > rank[prev] else prev

    # Ensure every node appears in the map.
    for nid in graph.nodes:
        affected.setdefault(nid, "FLAGGED" if nid in blast else "UNAFFECTED")

    broken = [i for i, s in affected.items() if s == "BROKEN"]
    at_risk = [i for i, s in affected.items() if s == "AT_RISK"]
    feasible = not broken

    parts = []
    if broken:
        parts.append(f"{len(broken)} item(s) broken: {', '.join(broken)}")
    if at_risk:
        parts.append(f"{len(at_risk)} item(s) at risk: {', '.join(at_risk)}")
    explanation = "; ".join(parts) if parts else "All itinerary constraints satisfied."

    return ConstraintEvaluationResult(
        feasible=feasible,
        violations=violations,
        warnings=warnings,
        affected_items=affected,
        broken_items=broken,
        at_risk_items=at_risk,
        explanation=explanation,
    )
