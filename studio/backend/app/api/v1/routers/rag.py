from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.core.database import get_session
from app.models import KnowledgeBase, KBDocument
from app.schemas import KnowledgeBaseCreate, KnowledgeBaseResponse
from app.core.config import settings
from app.services.rag_jobs import enqueue_document_ingestion
from datetime import datetime
from pathlib import Path
import io
import json
import shutil
import uuid
import asyncio
import zipfile


async def reconcile_kb_documents(session: AsyncSession, kb: KnowledgeBase) -> None:
    from app.integrations.llamaindex.runtime import get_document_chunk_count

    result = await session.exec(select(KBDocument).where(KBDocument.kb_id == kb.id))
    docs = result.all()
    changed = False
    total_chunks = 0
    has_inflight = False

    for doc in docs:
        indexed_chunks = get_document_chunk_count(kb.id, doc.file_path)
        if indexed_chunks > 0 and (doc.status != "done" or doc.chunk_count != indexed_chunks):
            doc.status = "done"
            doc.chunk_count = indexed_chunks
            doc.error_msg = None
            doc.updated_at = datetime.utcnow()
            session.add(doc)
            changed = True
        elif doc.status in {"pending", "processing"}:
            has_inflight = True
            stale_for_seconds = (datetime.utcnow() - doc.updated_at).total_seconds()
            if stale_for_seconds > 15:
                enqueue_document_ingestion(doc.id, kb.id)
        total_chunks += doc.chunk_count or 0

    next_status = "ingesting" if has_inflight else "ready"
    if kb.chunk_count != total_chunks or kb.status != next_status:
        kb.chunk_count = total_chunks
        kb.status = next_status
        kb.updated_at = datetime.utcnow()
        session.add(kb)
        changed = True

    if changed:
        await session.commit()
        await session.refresh(kb)


async def _store_uploaded_document(
    session: AsyncSession,
    kb: KnowledgeBase,
    uploaded_file: UploadFile,
) -> KBDocument:
    upload_dir = Path(settings.APP_DATA_DIR) / "uploads" / kb.id
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{uuid.uuid4()}_{uploaded_file.filename}"

    content = await uploaded_file.read()
    with open(file_path, "wb") as file_handle:
        file_handle.write(content)

    document = KBDocument(
        kb_id=kb.id,
        filename=uploaded_file.filename,
        file_path=str(file_path),
        file_size=len(content),
        status="pending",
    )
    session.add(document)
    return document


def _queue_ingestion(documents: list[KBDocument], kb_id: str) -> None:
    for document in documents:
        enqueue_document_ingestion(document.id, kb_id)


async def _reset_documents_for_rebuild(
    session: AsyncSession,
    kb: KnowledgeBase,
    documents: list[KBDocument],
) -> None:
    from app.integrations.llamaindex.runtime import clear_kb_storage

    clear_kb_storage(kb.id)

    now = datetime.utcnow()
    for document in documents:
        document.status = "pending"
        document.chunk_count = 0
        document.error_msg = None
        document.updated_at = now
        session.add(document)

    kb.chunk_count = 0
    kb.doc_count = len(documents)
    kb.status = "ingesting" if documents else "ready"
    kb.updated_at = now
    session.add(kb)

    await session.commit()
    for document in documents:
        await session.refresh(document)


def _kb_export_filename(kb: KnowledgeBase) -> str:
    safe_name = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in kb.name)
    safe_name = safe_name.strip("-") or kb.id
    return f"{safe_name}-export.zip"

router = APIRouter(prefix="/knowledge-bases", tags=["RAG / Knowledge Bases"])


@router.get("", response_model=list[KnowledgeBaseResponse])
async def list_knowledge_bases(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(KnowledgeBase))
    knowledge_bases = result.all()
    for kb in knowledge_bases:
        if kb.status == "ingesting":
            await reconcile_kb_documents(session, kb)
    return knowledge_bases


@router.post("", response_model=KnowledgeBaseResponse, status_code=201)
async def create_knowledge_base(
    body: KnowledgeBaseCreate, session: AsyncSession = Depends(get_session)
):
    kb = KnowledgeBase(**body.model_dump())
    session.add(kb)
    await session.commit()
    await session.refresh(kb)
    return kb


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
async def get_knowledge_base(kb_id: str, session: AsyncSession = Depends(get_session)):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")
    return kb


@router.patch("/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(
    kb_id: str, body: dict, session: AsyncSession = Depends(get_session)
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")
    for k, v in body.items():
        if hasattr(kb, k):
            setattr(kb, k, v)
    kb.updated_at = datetime.utcnow()
    session.add(kb)
    await session.commit()
    await session.refresh(kb)
    return kb


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(kb_id: str, session: AsyncSession = Depends(get_session)):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")

    docs_result = await session.exec(select(KBDocument).where(KBDocument.kb_id == kb_id))
    documents = docs_result.all()
    for document in documents:
        await session.delete(document)
    await session.delete(kb)
    await session.commit()

    upload_dir = Path(settings.APP_DATA_DIR) / "uploads" / kb_id
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)
    kb_store_dir = Path(settings.APP_DATA_DIR) / "vector_store" / kb_id
    if kb_store_dir.exists():
        shutil.rmtree(kb_store_dir, ignore_errors=True)


@router.get("/{kb_id}/export")
async def export_knowledge_base(kb_id: str, session: AsyncSession = Depends(get_session)):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")

    await reconcile_kb_documents(session, kb)
    result = await session.exec(select(KBDocument).where(KBDocument.kb_id == kb_id))
    documents = result.all()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "knowledge_base.json",
            json.dumps(kb.model_dump(), ensure_ascii=False, indent=2, default=str),
        )
        archive.writestr(
            "documents.json",
            json.dumps([document.model_dump() for document in documents], ensure_ascii=False, indent=2, default=str),
        )

        lance_dir = Path(settings.APP_DATA_DIR) / "vector_store" / kb_id / "lance"
        if lance_dir.exists():
            for lance_file in lance_dir.rglob("*"):
                if lance_file.is_file():
                    archive.write(lance_file, arcname=f"lance/{lance_file.relative_to(lance_dir)}")

        for document in documents:
            file_path = Path(document.file_path)
            if file_path.exists():
                archive.write(file_path, arcname=f"sources/{document.filename}")

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{_kb_export_filename(kb)}"',
        },
    )


@router.post("/{kb_id}/documents/upload")
async def upload_document(
    kb_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")

    doc = await _store_uploaded_document(session, kb, file)

    kb.doc_count += 1
    kb.status = "ingesting"
    kb.updated_at = datetime.utcnow()
    session.add(kb)

    await session.commit()
    await session.refresh(doc)

    _queue_ingestion([doc], kb_id)

    return {"document_id": doc.id, "filename": file.filename, "status": "pending"}


@router.post("/{kb_id}/documents/upload-batch")
async def upload_documents_batch(
    kb_id: str,
    files: list[UploadFile] = File(...),
    session: AsyncSession = Depends(get_session),
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")
    if not files:
        raise HTTPException(400, "At least one file is required")

    documents: list[KBDocument] = []
    for uploaded_file in files:
        document = await _store_uploaded_document(session, kb, uploaded_file)
        documents.append(document)

    kb.doc_count += len(documents)
    kb.status = "ingesting"
    kb.updated_at = datetime.utcnow()
    session.add(kb)

    await session.commit()
    for document in documents:
        await session.refresh(document)

    _queue_ingestion(documents, kb_id)

    return {
        "count": len(documents),
        "documents": [
            {
                "document_id": document.id,
                "filename": document.filename,
                "status": document.status,
            }
            for document in documents
        ],
    }


@router.post("/{kb_id}/documents/text")
async def upload_text_content(
    kb_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")

    title = (body.get("title") or "").strip()
    content = (body.get("content") or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    if not content:
        raise HTTPException(400, "Content is required")

    upload_dir = Path(settings.APP_DATA_DIR) / "uploads" / kb.id
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{title}.txt"
    file_path = upload_dir / f"{uuid.uuid4()}_{filename}"
    file_path.write_text(content, encoding="utf-8")

    document = KBDocument(
        kb_id=kb.id,
        filename=filename,
        file_path=str(file_path),
        file_size=len(content.encode("utf-8")),
        status="pending",
    )
    session.add(document)
    kb.doc_count += 1
    kb.status = "ingesting"
    kb.updated_at = datetime.utcnow()
    session.add(kb)
    await session.commit()
    await session.refresh(document)

    _queue_ingestion([document], kb_id)

    return {"document_id": document.id, "filename": filename, "status": "pending"}


@router.get("/{kb_id}/documents")
async def list_documents(kb_id: str, session: AsyncSession = Depends(get_session)):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")
    await reconcile_kb_documents(session, kb)
    result = await session.exec(select(KBDocument).where(KBDocument.kb_id == kb_id))
    docs = result.all()
    return docs


@router.delete("/{kb_id}/documents/{doc_id}", status_code=204)
async def delete_document(
    kb_id: str,
    doc_id: str,
    session: AsyncSession = Depends(get_session),
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")
    document = await session.get(KBDocument, doc_id)
    if not document or document.kb_id != kb_id:
        raise HTTPException(404, "Document not found")

    file_path = Path(document.file_path)
    await session.delete(document)
    await session.commit()
    if file_path.exists():
        file_path.unlink(missing_ok=True)

    from app.integrations.llamaindex.runtime import delete_document_nodes
    delete_document_nodes(kb_id, str(file_path))

    result = await session.exec(select(KBDocument).where(KBDocument.kb_id == kb_id))
    remaining_documents = result.all()
    now = datetime.utcnow()
    kb.doc_count = len(remaining_documents)
    kb.chunk_count = sum(doc.chunk_count or 0 for doc in remaining_documents)
    kb.status = "ready" if not remaining_documents else ("ingesting" if any(doc.status in {"pending", "processing"} for doc in remaining_documents) else "ready")
    kb.updated_at = now
    session.add(kb)
    await session.commit()


@router.post("/{kb_id}/documents/{doc_id}/retry")
async def retry_document_ingestion(
    kb_id: str,
    doc_id: str,
    session: AsyncSession = Depends(get_session),
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")
    document = await session.get(KBDocument, doc_id)
    if not document or document.kb_id != kb_id:
        raise HTTPException(404, "Document not found")

    result = await session.exec(select(KBDocument).where(KBDocument.kb_id == kb_id))
    documents = result.all()
    await _reset_documents_for_rebuild(session, kb, documents)
    _queue_ingestion(documents, kb_id)

    return {
        "kb_id": kb_id,
        "document_id": doc_id,
        "queued_documents": len(documents),
        "status": kb.status,
    }


@router.get("/{kb_id}/documents/{doc_id}/preview")
async def preview_document(
    kb_id: str,
    doc_id: str,
    session: AsyncSession = Depends(get_session),
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")
    doc = await session.get(KBDocument, doc_id)
    if not doc or doc.kb_id != kb_id:
        raise HTTPException(404, "Document not found")

    from app.integrations.llamaindex.runtime import read_source_content

    parser_config = {}
    try:
        import json

        parser_config = json.loads(kb.parser_config_json or "{}")
    except Exception:
        parser_config = {}

    try:
        source_content = read_source_content(doc.file_path, parser_config)
    except Exception as exc:
        raise HTTPException(500, f"Document preview failed: {exc}") from exc

    preview_text = source_content.get("text", "")[:20000]
    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
        "preview_text": preview_text,
        "preprocessor": source_content.get("preprocessor", "native"),
        "truncated": len(source_content.get("text", "")) > len(preview_text),
    }


@router.post("/{kb_id}/reindex")
async def reindex_knowledge_base(kb_id: str, session: AsyncSession = Depends(get_session)):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")

    result = await session.exec(select(KBDocument).where(KBDocument.kb_id == kb_id))
    documents = result.all()

    await _reset_documents_for_rebuild(session, kb, documents)

    _queue_ingestion(documents, kb_id)

    return {
        "kb_id": kb_id,
        "queued_documents": len(documents),
        "status": kb.status,
    }


@router.post("/{kb_id}/query")
async def query_knowledge_base(
    kb_id: str, body: dict, session: AsyncSession = Depends(get_session)
):
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(404, "Knowledge Base not found")

    query = body.get("query", "")
    top_k = body.get("top_k", kb.retrieval_top_k)
    metadata_filters = body.get("metadata_filters") or None
    rewrite = bool(body.get("rewrite", False))
    enable_hybrid_rerank = body.get("enable_hybrid_rerank")
    min_score_raw = body.get("min_score")

    if min_score_raw in {"", None}:
        min_score = None
    else:
        try:
            min_score = float(min_score_raw)
        except (TypeError, ValueError) as exc:
            raise HTTPException(400, "min_score must be a number between 0 and 1") from exc
        if min_score < 0 or min_score > 1:
            raise HTTPException(400, "min_score must be a number between 0 and 1")

    if enable_hybrid_rerank is None:
        effective_enable_hybrid_rerank = None
    else:
        effective_enable_hybrid_rerank = bool(enable_hybrid_rerank)

    if not query.strip():
        raise HTTPException(400, "Query is required")

    rewritten_query = query
    if rewrite:
        from app.models import Model, Provider
        model_result = await session.exec(select(Model).where(Model.enabled == True).limit(1))
        chat_model = model_result.first()
        chat_provider = None
        if chat_model:
            chat_provider = await session.get(Provider, chat_model.provider_id)
        from app.integrations.llamaindex.retriever import rewrite_query as _rewrite_query
        rewritten_query = await _rewrite_query(
            query,
            model=chat_model.model_id if chat_model else "gpt-3.5-turbo",
            api_key=chat_provider.api_key_encrypted if chat_provider else None,
            api_base=chat_provider.base_url if chat_provider else None,
        )

    try:
        from app.integrations.llamaindex.retriever import query_kb
        query_response = await query_kb(
            kb_id,
            rewritten_query,
            top_k,
            metadata_filters=metadata_filters,
            min_score=min_score,
            enable_hybrid_rerank=effective_enable_hybrid_rerank,
            return_debug=True,
        )
    except Exception as exc:
        raise HTTPException(500, f"Knowledge base query failed: {exc}") from exc

    return {
        "query": query,
        "rewritten_query": rewritten_query if rewritten_query != query else None,
        "results": query_response["results"],
        "kb_id": kb_id,
        "metadata_filters": metadata_filters or {},
        "retrieval_debug": query_response["retrieval_debug"],
    }


async def ingest_document(doc_id: str, kb_id: str):
    """Background task: ingest document into vector store"""
    from app.core.database import async_session_factory
    async with async_session_factory() as session:
        doc = await session.get(KBDocument, doc_id)
        kb = await session.get(KnowledgeBase, kb_id)
        if not doc or not kb:
            return
        try:
            doc.status = "processing"
            session.add(doc)
            await session.commit()

            from app.integrations.llamaindex.ingestion import ingest_file
            chunk_count = await ingest_file(
                doc.file_path,
                kb_id,
                kb.chunk_size,
                kb.chunk_overlap,
                source_filename=doc.filename,
            )

            doc.status = "done"
            doc.chunk_count = chunk_count
            kb.chunk_count += chunk_count
            kb.status = "ready"
        except Exception as e:
            doc.status = "error"
            doc.error_msg = str(e)
            kb.status = "ready"

        session.add(doc)
        session.add(kb)
        await session.commit()
