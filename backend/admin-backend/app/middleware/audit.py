"""Audit logging helper for admin write endpoints.

Logs admin actions to the AuditLog table for accountability.
Uses its own database session to avoid interfering with the main transaction.
"""

from datetime import datetime, timezone
from typing import Optional

from app.core.database import async_session_factory
from app.models.admin import AuditLog


async def log_admin_action(
    admin_id: str,
    admin_name: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[str] = None,
    ip: Optional[str] = None,
) -> None:
    """Record an admin action to the audit log using a dedicated session."""
    async with async_session_factory() as session:
        log = AuditLog(
            actor_type="admin",
            actor_id=admin_id,
            actor_name=admin_name,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or "{}",
            ip=ip,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        session.add(log)
        await session.commit()
