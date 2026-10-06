# TourFlow AI — Constraint Engine

Implementation: `backend/app/engines/constraint_engine.py` (+ `dependency_engine.py`).
Pure Python, no database access, fully unit-tested (`backend/tests/test_engines.py`).

## 1. Inputs
- `DependencyGraph`: nodes (itinerary items as time intervals) + edges
  (source→target with `minimum_required_buffer_minutes`).
- `item_types`: item id → `ItemType` (selects the applicable threshold).
- `changed_id`: the disrupted item; defines the blast radius.

## 2. Centralized thresholds
```python
BUFFER_THRESHOLDS = {
    "FLIGHT_DOMESTIC": 75, "FLIGHT_INTERNATIONAL": 120,
    "HOTEL_CHECKIN": 60, "ACTIVITY": 45, "EVENT": 45,
    "TRAIN": 30, "BUS": 30, "TRANSFER": 30,
    "RESTAURANT": 30, "OTHER": 30,
}
```
The effective requirement for an edge is `max(dependency.minimum_required_buffer_minutes,
threshold_for(target_type))`. These values exist in exactly one place.

## 3. Classification rules
For each edge, `buffer = target.start − source.end`:
- `buffer >= threshold` → **UNAFFECTED**
- `0 <= buffer < threshold` → **AT_RISK** (warning, still feasible)
- `buffer < 0` → **BROKEN** (error, infeasible)
- node in blast radius but all its edges OK → **FLAGGED** (watch, not broken)

An item with multiple incoming edges keeps the **worst** state. The result is
`feasible = (no BROKEN items)` plus violations, warnings, affected map, and a
human-readable explanation.

## 4. Why not "everything downstream is broken"
A 3-hour flight delay breaks the immediate transfer (negative buffer) but a dinner
6 hours later may still have a healthy buffer — it becomes FLAGGED, not BROKEN.
This is what makes recovery options surgical instead of destructive.

## 5. Usage
- `disruption_engine.analyze_impact` builds the graph from the trip's items +
  dependencies, applies the disruption (shift or removal), and evaluates.
- `recovery_engine.validate_candidate` builds a hypothetical graph with the
  candidate's changes applied and requires `feasible == True`.
- `select_recovery_option` revalidates at selection time (protects against races).

## 6. Dependency engine notes
- `blast_radius` is BFS over downstream edges.
- `topological_order` (Kahn's) raises `ValueError` on cycles — the API surfaces
  this as 422, preventing cyclic itineraries from being evaluated.
