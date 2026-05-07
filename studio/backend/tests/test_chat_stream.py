import json
import unittest
from unittest.mock import AsyncMock, patch

from app.api.v1.routers.chat import stream_chat
from app.models import ChatSession, Run
from app.schemas import ChatMessageCreate


class FakeSession:
    def __init__(self, chat_session: ChatSession) -> None:
        self.chat_session = chat_session
        self.added = []
        self.commits = 0

    async def get(self, model, item_id: str):
        if model is ChatSession and item_id == self.chat_session.id:
            return self.chat_session
        return None

    def add(self, item) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1


async def _fake_llm_events(*args, **kwargs):
    yield json.dumps({"choices": [{"delta": {"reasoning": "thinking"}}]})
    yield json.dumps({"choices": [{"delta": {"content": "Hello"}}]})
    yield json.dumps({"choices": [{"delta": {"content": " world"}}]})
    yield "[DONE]"


class ChatStreamTest(unittest.IsolatedAsyncioTestCase):
    async def test_stream_passthrough_accumulates_content_for_persistence(self) -> None:
        chat_session = ChatSession(
            id="session-1",
            title="Test",
            mode="model",
            model_id="model-1",
        )
        fake_session = FakeSession(chat_session)

        with patch(
            "app.api.v1.routers.chat._build_model_chat_request",
            new=AsyncMock(
                return_value=(
                    [{"role": "user", "content": "Hi"}],
                    "gpt-test",
                    "key",
                    "https://example.test/v1",
                    "openai",
                    0,
                    {},
                )
            ),
        ), patch(
            "app.api.v1.routers.chat.llm_chat_events",
            new=_fake_llm_events,
        ), patch(
            "app.api.v1.routers.chat._persist_chat_success",
            new=AsyncMock(),
        ) as persist_success:
            response = await stream_chat(
                "session-1",
                ChatMessageCreate(role="user", content="Hi"),
                fake_session,
            )
            body = ""
            async for chunk in response.body_iterator:
                body += chunk.decode() if isinstance(chunk, bytes) else chunk

        self.assertIn('"reasoning": "thinking"', body)
        self.assertIn('"content": "Hello"', body)
        self.assertTrue(body.endswith("data: [DONE]\n\n"))

        persist_success.assert_awaited_once()
        persisted_args = persist_success.await_args.args
        self.assertEqual(persisted_args[3], "Hello world")
        self.assertTrue(any(isinstance(item, Run) for item in fake_session.added))


if __name__ == "__main__":
    unittest.main()
