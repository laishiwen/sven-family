from __future__ import annotations

import asyncio
import logging

from sqlmodel import select

from app.core.database import async_session_factory
from app.models import KBDocument, KnowledgeBase

logger = logging.getLogger(__name__)

_ACTIVE_INGESTIONS: dict[str, asyncio.Task] = {}


def enqueue_document_ingestion(doc_id: str, kb_id: str) -> bool:
    existing_task = _ACTIVE_INGESTIONS.get(doc_id)
    if existing_task and not existing_task.done():
        return False

    task = asyncio.create_task(_run_document_ingestion(doc_id, kb_id))
    _ACTIVE_INGESTIONS[doc_id] = task

    def _cleanup(_: asyncio.Task) -> None:
        current_task = _ACTIVE_INGESTIONS.get(doc_id)
        if current_task is task:
            _ACTIVE_INGESTIONS.pop(doc_id, None)

    task.add_done_callback(_cleanup)
    return True


async def _run_document_ingestion(doc_id: str, kb_id: str) -> None:
    from app.api.v1.routers.rag import ingest_document

    try:
        await ingest_document(doc_id, kb_id)
    except Exception:
        logger.exception("RAG ingestion task crashed for doc=%s kb=%s", doc_id, kb_id)


async def resume_pending_rag_jobs() -> int:
    scheduled_count = 0
    async with async_session_factory() as session:
        result = await session.exec(
            select(KBDocument, KnowledgeBase)
            .join(KnowledgeBase, KnowledgeBase.id == KBDocument.kb_id)
            .where(KBDocument.status.in_(["pending", "processing"]))
        )
        rows = result.all()

        for document, kb in rows:
            if kb.status != "ingesting":
                kb.status = "ingesting"
                session.add(kb)
            if enqueue_document_ingestion(document.id, kb.id):
                scheduled_count += 1

        await session.commit()

    if scheduled_count:
        logger.info("Resumed %s pending RAG ingestion job(s)", scheduled_count)
    else:
        logger.info("No pending RAG ingestion jobs to resume")
    return scheduled_count