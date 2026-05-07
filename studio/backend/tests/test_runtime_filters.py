import unittest

from app.integrations.llamaindex.runtime import apply_metadata_filters, apply_score_threshold, build_metadata, hybrid_rerank


class ApplyMetadataFiltersTest(unittest.TestCase):
    def setUp(self) -> None:
        self.results = [
            {
                "text": "alpha",
                "metadata": {
                    "filename": "8d8f2d7f-4d5d-4b2b-b0f1-b0e5aa9aa111_Report.PDF",
                    "extension": "pdf",
                    "kb_id": "kb-1",
                },
            },
            {
                "text": "beta",
                "metadata": {
                    "filename": "report-v2.pdf",
                    "extension": "pdf",
                    "kb_id": "kb-1",
                },
            },
            {
                "text": "gamma",
                "metadata": {
                    "filename": "notes.txt",
                    "extension": "txt",
                    "kb_id": "kb-2",
                },
            },
        ]

    def test_returns_original_results_when_filters_missing(self) -> None:
        filtered = apply_metadata_filters(self.results, None)

        self.assertEqual(filtered, self.results)

    def test_matches_filename_with_case_insensitive_exact_comparison(self) -> None:
        filtered = apply_metadata_filters(
            self.results,
            {"filename": "report.pdf"},
        )

        self.assertEqual(len(filtered), 1)
        self.assertEqual(
            filtered[0]["metadata"]["filename"],
            "8d8f2d7f-4d5d-4b2b-b0f1-b0e5aa9aa111_Report.PDF",
        )

    def test_does_not_match_different_filename(self) -> None:
        filtered = apply_metadata_filters(
            self.results,
            {"filename": "report-final.pdf"},
        )

        self.assertEqual(filtered, [])

    def test_combines_multiple_filters_with_and_semantics(self) -> None:
        filtered = apply_metadata_filters(
            self.results,
            {"filename": "REPORT.PDF", "extension": "PDF", "kb_id": "kb-1"},
        )

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["text"], "alpha")

    def test_non_string_filter_values_keep_exact_matching(self) -> None:
        results = [
            {"metadata": {"chunk_index": 1, "filename": "Report.PDF"}},
            {"metadata": {"chunk_index": 2, "filename": "Report.PDF"}},
        ]

        filtered = apply_metadata_filters(results, {"chunk_index": 1})

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["metadata"]["chunk_index"], 1)

    def test_build_metadata_prefers_original_source_filename(self) -> None:
        metadata = build_metadata(
            kb_id="kb-1",
            file_path="/tmp/8d8f2d7f-4d5d-4b2b-b0f1-b0e5aa9aa111_Report.PDF",
            metadata_mode="auto",
            metadata_template=None,
            source_filename="Report.PDF",
        )

        self.assertEqual(metadata["filename"], "Report.PDF")

    def test_apply_score_threshold_filters_out_low_scores(self) -> None:
        results = [
            {"score": 0.61, "text": "alpha"},
            {"score": 0.42, "text": "beta"},
            {"score": 0.19, "text": "gamma"},
        ]

        filtered = apply_score_threshold(results, 0.4)

        self.assertEqual([item["text"] for item in filtered], ["alpha", "beta"])

    def test_hybrid_rerank_promotes_exact_phrase_match(self) -> None:
        results = [
            {"score": 0.45, "text": "Alpha retrieval document. Unique token: CHROME_ALPHA_TOKEN."},
            {"score": 0.6, "text": "Beta retrieval document. Unique token: CHROME_BETA_TOKEN."},
        ]

        reranked = hybrid_rerank(results, "CHROME_ALPHA_TOKEN")

        self.assertEqual(reranked[0]["text"], results[0]["text"])
        self.assertGreater(reranked[0]["score"], reranked[1]["score"])


if __name__ == "__main__":
    unittest.main()