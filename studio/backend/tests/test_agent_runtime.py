import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.models import Run, Skill, Tool
from app.services.agent_runtime import (
    _format_skill,
    _parse_agent_action,
    _parse_tool_decision,
    _plan_and_maybe_execute_action,
)
from app.services.tool_runtime import execute_tool


class AgentRuntimeHelpersTest(unittest.IsolatedAsyncioTestCase):
    async def test_execute_tool_runs_python_tool(self) -> None:
        tool = Tool(
            name="echo_tool",
            tool_type="python",
            code_content=(
                "def run(input):\n"
                "    return {'echo': input.get('message', '')}\n"
            ),
        )

        result = await execute_tool(tool, {"message": "hello"})

        self.assertEqual(result, {"echo": "hello"})

    def test_parse_tool_decision_accepts_fenced_json(self) -> None:
        decision = _parse_tool_decision(
            """```json
            {"action": "tool", "tool_name": "search", "tool_input": {"q": "weather"}}
            ```"""
        )

        self.assertEqual(decision["action"], "tool")
        self.assertEqual(decision["tool_name"], "search")
        self.assertEqual(decision["tool_input"], {"q": "weather"})

    def test_format_skill_includes_structured_content(self) -> None:
        skill = Skill(
            name="analysis-skill",
            skill_type="chain",
            description="Analyze the task before answering",
            content_json='{"prompt":"be precise","steps":["inspect","answer"]}',
        )

        formatted = _format_skill(skill)

        self.assertIn("analysis-skill", formatted)
        self.assertIn("be precise", formatted)
        self.assertIn("inspect; answer", formatted)

    def test_parse_agent_action_supports_mcp_payload(self) -> None:
        action = _parse_agent_action(
            '{"action":"mcp_tool","server_name":"chrome-devtools","target":"list_network_requests","arguments":{"pageSize":5}}'
        )

        self.assertEqual(action.action, "mcp_tool")
        self.assertEqual(action.server_name, "chrome-devtools")
        self.assertEqual(action.target, "list_network_requests")
        self.assertEqual(action.arguments, {"pageSize": 5})

    async def test_mcp_only_agent_can_still_execute_planned_action(self) -> None:
        agent = SimpleNamespace(id="agent-1", tool_ids_json="[]")
        run = Run(id="run-1", session_id="session-1")
        session = SimpleNamespace(get=AsyncMock())

        with patch(
            "app.services.agent_runtime.llm_complete_text",
            new=AsyncMock(
                return_value=(
                    '{"action":"mcp_tool","server_name":"chrome-devtools",'
                    '"target":"list_network_requests","arguments":{"pageSize":5}}'
                )
            ),
        ), patch(
            "app.services.agent_runtime._execute_mcp_action",
            new=AsyncMock(return_value=("mcp context", 1)),
        ) as execute_mcp_action:
            context, step = await _plan_and_maybe_execute_action(
                session=session,
                agent=agent,
                run=run,
                next_step_index=1,
                body_content="show network requests",
                conversation_messages=[],
                model_id_str="gpt-4o-mini",
                provider_api_key=None,
                provider_api_base=None,
                provider_type=None,
                system_parts=[],
                mcp_catalog=[{"name": "chrome-devtools", "capabilities": []}],
            )

        self.assertEqual((context, step), ("mcp context", 1))
        execute_mcp_action.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()