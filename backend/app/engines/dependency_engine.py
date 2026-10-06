"""Dependency Engine — DAG of itinerary items and blast-radius traversal.

A dependency source -> target requires that target starts at least
`minimum_required_buffer_minutes` after source ends. The engine walks
downstream from a changed item to find everything in the blast radius.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Iterable


@dataclass
class DepEdge:
    source_id: str
    target_id: str
    dependency_type: str  # SEQUENTIAL | SPATIAL
    minimum_required_buffer_minutes: int = 30


@dataclass
class DepNode:
    id: str
    start_minutes: float  # minutes since trip epoch (caller-defined origin)
    end_minutes: float
    is_fixed: bool = False


class DependencyGraph:
    def __init__(self, nodes: Iterable[DepNode], edges: Iterable[DepEdge]):
        self.nodes: dict[str, DepNode] = {n.id: n for n in nodes}
        self.edges = list(edges)
        self._downstream: dict[str, list[DepEdge]] = {}
        self._upstream: dict[str, list[DepEdge]] = {}
        for e in self.edges:
            self._downstream.setdefault(e.source_id, []).append(e)
            self._upstream.setdefault(e.target_id, []).append(e)

    def downstream_edges(self, node_id: str) -> list[DepEdge]:
        return self._downstream.get(node_id, [])

    def blast_radius(self, changed_id: str) -> list[str]:
        """All nodes reachable downstream of changed_id (BFS), excluding itself."""
        seen: list[str] = []
        queue = [changed_id]
        visited = {changed_id}
        while queue:
            cur = queue.pop(0)
            for e in self.downstream_edges(cur):
                if e.target_id not in visited:
                    visited.add(e.target_id)
                    seen.append(e.target_id)
                    queue.append(e.target_id)
        return seen

    def shift_node(self, node_id: str, delta_minutes: float) -> None:
        node = self.nodes[node_id]
        node.start_minutes += delta_minutes
        node.end_minutes += delta_minutes

    def buffer_minutes(self, edge: DepEdge) -> float:
        """Actual gap between source end and target start."""
        src = self.nodes[edge.source_id]
        tgt = self.nodes[edge.target_id]
        return tgt.start_minutes - src.end_minutes

    def topological_order(self) -> list[str]:
        """Kahn's algorithm; raises ValueError on cycles."""
        indeg = {nid: 0 for nid in self.nodes}
        for e in self.edges:
            if e.target_id in indeg:
                indeg[e.target_id] += 1
        queue = [nid for nid, d in indeg.items() if d == 0]
        order: list[str] = []
        while queue:
            cur = queue.pop(0)
            order.append(cur)
            for e in self.downstream_edges(cur):
                indeg[e.target_id] -= 1
                if indeg[e.target_id] == 0:
                    queue.append(e.target_id)
        if len(order) != len(self.nodes):
            raise ValueError("Itinerary dependency graph contains a cycle")
        return order
