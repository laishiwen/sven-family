from __future__ import annotations

import logging

from app.integrations.llamaindex.runtime import (
    add_nodes_to_vector_store,
    build_metadata,
    build_nodes,
    read_source_content,
    resolve_kb_runtime,
)


logger = logging.getLogger(__name__)


async def ingest_file(
    file_path: str,
    kb_id: str,
    chunk_size: int = 512,
    chunk_overlap: int = 50,
    source_filename: str | None = None,
) -> int:
    runtime = await resolve_kb_runtime(kb_id)
    kb = runtime["kb"]

    source_content = read_source_content(file_path, runtime["parser_config"])
    text = source_content["text"]
    if not text.strip():
        raise ValueError(f"No readable content extracted from {file_path}")

    metadata = build_metadata(
        kb_id=kb_id,
        file_path=file_path,
        metadata_mode=kb.metadata_mode,
        metadata_template=runtime["metadata_template"],
        source_filename=source_filename,
    )
    metadata["preprocessor"] = source_content.get("preprocessor", "native")
    nodes = build_nodes(
        text=text,
        metadata=metadata,
        chunk_strategy=source_content.get("chunk_strategy_override") or kb.chunk_strategy,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        parser_config=runtime["parser_config"],
    )
    if not nodes:
        raise ValueError(f"No chunks generated for {file_path}")

    chunk_count = add_nodes_to_vector_store(kb_id, nodes, runtime["embed_model"])

    logger.info(
        "Ingested %s chunks into KB %s using %s",
        chunk_count,
        kb_id,
        kb.embedding_model_id or "local/hash-embedding",
    )
    return chunk_count
