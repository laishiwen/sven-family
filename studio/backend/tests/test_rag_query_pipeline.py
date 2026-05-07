import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.integrations.llamaindex.retriever import query_kb


class RAGQueryPipelineTest(unittest.IsolatedAsyncioTestCase):
    async def test_query_kb_applies_filters_rerank_threshold_and_debug_counts(self) -> None:
        runtime = {
            "kb": SimpleNamespace(
                reranker_model_id=None,
            ),
            "retrieval_config": {
                "metadata_filters": {"extension": "txt"},
                "min_score": 0.2,
                "enable_hybrid_rerank": True,
            },
            "embed_model": object(),
        }
        vector_results = [
            {
                "text": "Beta document",
                "score": 0.7,
                "metadata": {"filename": "beta.txt", "extension": "txt"},
            },
            {
                "text": "Alpha exact token document",
                "score": 0.3,
                "metadata": {"filename": "alpha.txt", "extension": "txt"},
            },
            {
                "text": "Other file",
                "score": 0.9,
                "metadata": {"filename": "other.pdf", "extension": "pdf"},
            },
            {
                "text": "Low score exact token",
                "score": 0.1,
                "metadata": {"filename": "low.txt", "extension": "txt"},
            },
        ]

        with patch(
            "app.integrations.llamaindex.retriever.resolve_kb_runtime",
            new=AsyncMock(return_value=runtime),
        ), patch(
            "app.integrations.llamaindex.retriever.query_vector_store",
            new=AsyncMock(return_value=vector_results),
        ) as query_vector_store:
            report = await query_kb(
                "kb-1",
                "exact token",
                top_k=2,
                metadata_filters={"filename": "alpha.txt"},
                return_debug=True,
            )

        query_vector_store.assert_awaited_once()
        self.assertEqual(report["results"][0]["text"], "Alpha exact token document")
        self.assertEqual(len(report["results"]), 1)
        self.assertEqual(report["retrieval_debug"]["initial_result_count"], 4)
        self.assertEqual(report["retrieval_debug"]["metadata_filtered_count"], 1)
        self.assertEqual(report["retrieval_debug"]["thresholded_result_count"], 1)
        self.assertTrue(report["retrieval_debug"]["applied_hybrid_rerank"])
        self.assertEqual(report["retrieval_debug"]["applied_min_score"], 0.2)


if __name__ == "__main__":
    unittest.main()
