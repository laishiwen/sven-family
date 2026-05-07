"""E2E tests for built-in tools, MCP servers, and channels via API."""
import pytest
import httpx
import asyncio


API = "http://localhost:8000/api/v1"


@pytest.mark.asyncio
async def test_builtin_tools_exist():
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{API}/tools")
        assert resp.status_code == 200
        tools = resp.json()
        names = [t["name"] for t in tools]
        expected = ["Web Search", "File I/O", "System CLI"]
        for name in expected:
            assert name in names, f"Built-in tool '{name}' not found. Tools: {names}"
        # Verify is_builtin flag
        for t in tools:
            if t["name"] in expected:
                assert t["is_builtin"] is True, f"{t['name']} should be is_builtin=True"


@pytest.mark.asyncio
async def test_builtin_tools_cannot_be_deleted():
    async with httpx.AsyncClient(timeout=10) as client:
        for tool_id in ["builtin-web-search", "builtin-file-io", "builtin-cli"]:
            resp = await client.delete(f"{API}/tools/{tool_id}")
            assert resp.status_code == 403, f"Deleting {tool_id} should return 403, got {resp.status_code}"


@pytest.mark.asyncio
async def test_file_io_read():
    """Test file_io tool can read a file."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(f"{API}/tools/builtin-file-io/run", json={
            "input": {"operation": "write", "filepath": "test-e2e.txt", "content": "Hello E2E Test!"}
        })
        assert resp.status_code == 200, f"Write failed: {resp.text}"

        resp = await client.post(f"{API}/tools/builtin-file-io/run", json={
            "input": {"operation": "read", "filepath": "test-e2e.txt"}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "Hello E2E Test!" in data.get("content", "")


@pytest.mark.asyncio
async def test_cli_execute():
    """Test CLI tool can execute a command."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{API}/tools/builtin-cli/run", json={
            "input": {"command": "echo 'hello from cli'"}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "hello from cli" in data.get("stdout", "")


@pytest.mark.asyncio
async def test_builtin_mcp_servers_exist():
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{API}/mcp/servers")
        assert resp.status_code == 200
        servers = resp.json()
        names = [s["name"] for s in servers]
        expected = ["Playwright", "Chrome DevTools", "Brave Search", "Web Fetch", "Filesystem", "Memory", "Sequential Thinking"]
        for name in expected:
            assert name in names, f"Built-in MCP server '{name}' not found. Servers: {names}"


@pytest.mark.asyncio
async def test_builtin_mcp_cannot_be_deleted():
    async with httpx.AsyncClient(timeout=10) as client:
        for srv_id in ["builtin-mcp-playwright", "builtin-mcp-chrome-devtools", "builtin-mcp-brave-search"]:
            resp = await client.delete(f"{API}/mcp/servers/{srv_id}")
            assert resp.status_code == 403, f"Deleting {srv_id} should return 403, got {resp.status_code}"


@pytest.mark.asyncio
async def test_channels_crud():
    """Test channel CRUD operations."""
    async with httpx.AsyncClient(timeout=10) as client:
        # Create
        resp = await client.post(f"{API}/channels", json={
            "channel_type": "telegram",
            "name": "Test Bot",
            "config_json": '{"bot_token": "fake_token", "test_chat_id": "123"}',
        })
        assert resp.status_code == 201, f"Create channel failed: {resp.text}"
        ch = resp.json()
        ch_id = ch["id"]
        assert ch["channel_type"] == "telegram"

        # List
        resp = await client.get(f"{API}/channels")
        assert resp.status_code == 200
        ids = [c["id"] for c in resp.json()]
        assert ch_id in ids

        # Update
        resp = await client.patch(f"{API}/channels/{ch_id}", json={"name": "Updated Bot"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Bot"

        # Delete
        resp = await client.delete(f"{API}/channels/{ch_id}")
        assert resp.status_code == 204


@pytest.mark.asyncio
async def test_preset_agents_exist():
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{API}/agents")
        assert resp.status_code == 200
        agents = resp.json()
        names = [a["name"] for a in agents]
        # Check a few preset agents
        for expected in ["Code Review Assistant", "Technical Writer", "General Assistant", "Translator"]:
            assert expected in names, f"Preset agent '{expected}' not found"


class TestE2EFull:
    """Full E2E tests requiring all services."""

    @pytest.mark.asyncio
    async def test_community_health(self):
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("http://localhost:8100/api/community/health")
            assert resp.status_code == 200
            assert resp.json()["service"] == "community"

    @pytest.mark.asyncio
    async def test_community_topics_flow(self):
        """Test full community topic lifecycle."""
        async with httpx.AsyncClient(timeout=10) as client:
            community = "http://localhost:8100/api/community"

            # Login
            resp = await client.post(f"{community}/auth/login", json={
                "provider": "email",
                "email": "test@example.com",
                "password": "test123456",
            })
            assert resp.status_code == 200, f"Login failed: {resp.text}"
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Create topic
            resp = await client.post(f"{community}/topics", json={
                "title": "E2E Test Topic",
                "content": "## Testing\n\nThis is a **test** topic with `code` snippets.\n\n```python\nprint('hello')\n```",
                "tags": ["test", "e2e"],
            }, headers=headers)
            assert resp.status_code == 201, f"Create topic failed: {resp.text}"
            topic = resp.json()
            topic_id = topic["id"]
            assert topic["title"] == "E2E Test Topic"
            assert len(topic["tags"]) == 2

            # List topics
            resp = await client.get(f"{community}/topics")
            assert resp.status_code == 200
            items = resp.json()["items"]
            assert any(t["id"] == topic_id for t in items)

            # Get topic
            resp = await client.get(f"{community}/topics/{topic_id}")
            assert resp.status_code == 200
            assert resp.json()["content"].find("test") != -1

            # Search
            resp = await client.get(f"{community}/topics/search?q=Testing")
            assert resp.status_code == 200

            # Comment (authenticated)
            resp = await client.post(f"{community}/topics/{topic_id}/comments", json={
                "content": "Great test topic!",
            }, headers=headers)
            assert resp.status_code == 201
            comment_id = resp.json()["id"]

            # List comments
            resp = await client.get(f"{community}/topics/{topic_id}/comments")
            assert resp.status_code == 200
            comments = resp.json()
            assert len(comments) > 0

            # Anonymous access (no auth)
            resp = await client.post(f"{community}/topics/{topic_id}/comments", json={
                "content": "Should fail - no auth",
            })
            assert resp.status_code == 401, f"Anonymous comment should 401, got {resp.status_code}"

            # Like
            resp = await client.post(f"{community}/topics/{topic_id}/like", headers=headers)
            assert resp.status_code == 200
            assert resp.json()["liked"] is True

            # Tags
            resp = await client.get(f"{community}/topics/tags")
            assert resp.status_code == 200
            tags = resp.json()
            assert any(t["name"] == "test" for t in tags)

            # Delete topic
            resp = await client.delete(f"{community}/topics/{topic_id}", headers=headers)
            assert resp.status_code == 204


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
