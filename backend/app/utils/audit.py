"""Audit logging helper. Important mutations must call this."""
from __future__ import annotations
from typing import Any
from sqlalchemy.orm import Session

from app.models.disruption import AuditLog


def log_action(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    old_state: dict[str, Any] | None = None,
    new_state: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        old_state=old_state or {},
        new_state=new_state or {},
        meta=metadata or {},
    )
    db.add(entry)
    db.flush()
    return entry
