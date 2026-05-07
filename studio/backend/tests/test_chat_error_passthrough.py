import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.v1.routers.chat import send_message
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


class ChatErrorPassthroughTest(unittest.IsolatedAsyncioTestCase):
    async def test_agent_prepare_http_exception_is_not_wrapped_as_500(self) -> None:
        chat_session = ChatSession(
            id="session-1",
            title="Agent Session",
            mode="agent",
            agent_id="agent-1",
        )
        fake_session = FakeSession(chat_session)

        with patch(
            "app.api.v1.routers.chat.prepare_agent_request",
            new=AsyncMock(side_effect=HTTPException(422, "invalid schema")),
        ), patch(
            "app.api.v1.routers.chat._persist_chat_failure",
            new=AsyncMock(),
        ) as persist_failure:
            with self.assertRaises(HTTPException) as ctx:
                await send_message(
                    "session-1",
                    ChatMessageCreate(role="user", content="hello"),
                    fake_session,
                )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(str(ctx.exception.detail), "invalid schema")
        persist_failure.assert_awaited_once()
        self.assertTrue(any(isinstance(item, Run) for item in fake_session.added))


if __name__ == "__main__":
    unittest.main()
