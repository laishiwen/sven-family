import unittest

from app.api.v1.routers.chat import _normalize_session_payload


class ChatSessionNormalizationTest(unittest.TestCase):
    def test_model_mode_clears_agent_id(self) -> None:
        payload = _normalize_session_payload(
            {"mode": "model", "model_id": "model-1", "agent_id": "agent-1"}
        )

        self.assertEqual(payload["mode"], "model")
        self.assertEqual(payload["model_id"], "model-1")
        self.assertIsNone(payload["agent_id"])

    def test_agent_mode_clears_model_id(self) -> None:
        payload = _normalize_session_payload(
            {"mode": "agent", "model_id": "model-1", "agent_id": "agent-1"}
        )

        self.assertEqual(payload["mode"], "agent")
        self.assertEqual(payload["agent_id"], "agent-1")
        self.assertIsNone(payload["model_id"])

    def test_update_without_explicit_mode_keeps_current_mode_when_ids_are_null(self) -> None:
        payload = _normalize_session_payload({"agent_id": None}, current_mode="model")

        self.assertEqual(payload["mode"], "model")
        self.assertIsNone(payload["agent_id"])


if __name__ == "__main__":
    unittest.main()