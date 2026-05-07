from __future__ import annotations

import logging
from typing import Any

from app.integrations.llm.client import llm_complete_text
from app.integrations.llamaindex.runtime import (
    apply_score_threshold,
    apply_metadata_filters,
    hybrid_rerank,
    query_vector_store,
    resolve_kb_runtime,
)

logger = logging.getLogger(__name__)


async def rewrite_query(
    query: str,
    model: str,
    api_key: str | None = None,
    api_base: str | None = None,
) -> str:
    """Rewrite a user query via LLM for better retrieval coverage."""
    try:
        rewritten = (
            await llm_complete_text(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a query rewriting assistant. Expand and clarify the user's query "
                            "so it better matches relevant document chunks in a vector database. "
                            "Return ONLY the rewritten query text, no explanation, no quotes."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Rewrite this query for better document retrieval:\n{query}",
                    },
                ],
                api_key=api_key,
                api_base=api_base,
                temperature=0.2,
                max_tokens=150,
            )
        ).strip()
        return rewritten if rewritten else query
    except Exception as exc:
        logger.warning("Query rewrite failed: %s — using original query", exc)
        return query


async def query_kb(
    kb_id: str,
    query: str,
    top_k: int = 5,
    metadata_filters: dict[str, Any] | None = None,
    min_score: float | None = None,
    enable_hybrid_rerank: bool | None = None,
    return_debug: bool = False,
) -> list[dict[str, Any]] | dict[str, Any]:
    runtime = await resolve_kb_runtime(kb_id)
    kb = runtime["kb"]
    retrieval_config = runtime["retrieval_config"]
    configured_rerank = bool(retrieval_config.get("enable_hybrid_rerank"))
    effective_hybrid_rerank = (
        configured_rerank if enable_hybrid_rerank is None else enable_hybrid_rerank
    )
    candidate_multiplier = 3 if kb.reranker_model_id or effective_hybrid_rerank else 2
    similarity_top_k = max(
        top_k,
        int(retrieval_config.get("similarity_top_k") or top_k * candidate_multiplier),
    )
    configured_min_score = retrieval_config.get("min_score") if isinstance(retrieval_config, dict) else None
    effective_min_score = configured_min_score if min_score is None else min_score

    results = await query_vector_store(kb_id, query, similarity_top_k, runtime["embed_model"])

    configured_filters = retrieval_config.get("metadata_filters") if isinstance(retrieval_config, dict) else None
    merged_filters = {**(configured_filters or {}), **(metadata_filters or {})} if configured_filters or metadata_filters else None
    filtered_results = apply_metadata_filters(results, merged_filters)

    should_rerank = bool(kb.reranker_model_id) or effective_hybrid_rerank
    if should_rerank:
        filtered_results = hybrid_rerank(filtered_results, query)
    else:
        filtered_results.sort(key=lambda item: item.get("score", 0.0), reverse=True)

    thresholded_results = apply_score_threshold(filtered_results, effective_min_score)
    returned_results = thresholded_results[:top_k]

    query_report = {
        "results": returned_results,
        "retrieval_debug": {
            "top_k_requested": top_k,
            "similarity_top_k": similarity_top_k,
            "initial_result_count": len(results),
            "metadata_filtered_count": len(apply_metadata_filters(results, merged_filters)),
            "thresholded_result_count": len(thresholded_results),
            "returned_result_count": len(returned_results),
            "applied_min_score": effective_min_score,
            "applied_hybrid_rerank": should_rerank,
        },
    }

    if return_debug:
        return query_report
    return returned_results
