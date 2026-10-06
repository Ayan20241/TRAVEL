"""Unit tests: dependency graph + constraint engine (pure Python, no DB)."""
import pytest

from app.engines.dependency_engine import DependencyGraph, DepNode, DepEdge
from app.engines.constraint_engine import evaluate, threshold_for, BUFFER_THRESHOLDS


def _graph():
    nodes = [
        DepNode("flight", 0, 540),          # 9h flight
        DepNode("transfer", 600, 660),      # 60 min buffer
        DepNode("hotel", 720, 750),         # 60 min buffer
        DepNode("dinner", 900, 1020),       # 150 min buffer
    ]
    edges = [
        DepEdge("flight", "transfer", "SEQUENTIAL", 30),
        DepEdge("transfer", "hotel", "SEQUENTIAL", 30),
        DepEdge("hotel", "dinner", "SEQUENTIAL", 30),
    ]
    types = {"flight": "FLIGHT", "transfer": "TRANSFER",
             "hotel": "HOTEL", "dinner": "RESTAURANT"}
    return DependencyGraph(nodes, edges), types


def test_thresholds_centralized():
    assert BUFFER_THRESHOLDS["FLIGHT_DOMESTIC"] == 75
    assert BUFFER_THRESHOLDS["FLIGHT_INTERNATIONAL"] == 120
    assert BUFFER_THRESHOLDS["HOTEL_CHECKIN"] == 60
    assert threshold_for("FLIGHT", international=True) == 120
    assert threshold_for("TRANSFER") == 30


def test_all_unaffected_when_buffers_ok():
    g, types = _graph()
    r = evaluate(g, types, changed_id="flight")
    assert r.feasible
    assert r.broken_items == []
    assert r.at_risk_items == []
    # downstream items in blast radius but with OK buffers -> FLAGGED, not broken
    assert r.affected_items["transfer"] == "FLAGGED"


def test_delay_causes_broken_and_at_risk():
    g, types = _graph()
    g.shift_node("flight", 180)  # 3h delay: flight ends at 720
    r = evaluate(g, types, changed_id="flight")
    assert not r.feasible
    # transfer now starts at 600, flight ends 720 -> buffer -120 -> BROKEN
    assert "transfer" in r.broken_items
    # hotel keeps its own buffer vs shifted transfer? transfer unchanged -> hotel unaffected
    assert r.affected_items["hotel"] in ("FLAGGED", "UNAFFECTED")
    # downstream items are NOT all blindly marked broken
    assert "dinner" not in r.broken_items


def test_at_risk_when_buffer_positive_but_below_threshold():
    g, types = _graph()
    g.shift_node("flight", 40)  # flight ends 580, transfer at 600 -> 20 min buffer
    r = evaluate(g, types, changed_id="flight")
    assert r.feasible  # nothing broken
    assert "transfer" in r.at_risk_items


def test_blast_radius_bfs():
    g, _ = _graph()
    assert g.blast_radius("flight") == ["transfer", "hotel", "dinner"]
    assert g.blast_radius("hotel") == ["dinner"]
    assert g.blast_radius("dinner") == []


def test_cycle_detection():
    nodes = [DepNode("a", 0, 10), DepNode("b", 20, 30)]
    edges = [DepEdge("a", "b", "SEQUENTIAL"), DepEdge("b", "a", "SEQUENTIAL")]
    with pytest.raises(ValueError, match="cycle"):
        DependencyGraph(nodes, edges).topological_order()


def test_topological_order():
    g, _ = _graph()
    assert g.topological_order() == ["flight", "transfer", "hotel", "dinner"]
