"""Plugin system stub — reserved for future use.

The plugin system will allow:
- Install/uninstall community plugins
- Plugin hooks: on_startup, on_shutdown, on_message, on_tool_call
- Plugin marketplace discovery
"""

from __future__ import annotations

from typing import Any, Protocol


class PluginProtocol(Protocol):
    """Protocol that all plugins must implement."""

    name: str
    version: str
    description: str

    async def on_startup(self) -> None: ...
    async def on_shutdown(self) -> None: ...
    async def on_message(self, message: dict[str, Any]) -> dict[str, Any] | None: ...
    async def on_tool_call(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any] | None: ...


class PluginRegistry:
    """Central registry for installed plugins."""

    def __init__(self):
        self._plugins: dict[str, PluginProtocol] = {}

    def register(self, plugin: PluginProtocol):
        if plugin.name in self._plugins:
            raise ValueError(f"Plugin '{plugin.name}' already registered")
        self._plugins[plugin.name] = plugin

    def unregister(self, name: str):
        self._plugins.pop(name, None)

    def list(self) -> list[dict[str, str]]:
        return [
            {"name": p.name, "version": p.version, "description": p.description}
            for p in self._plugins.values()
        ]

    def get(self, name: str) -> PluginProtocol | None:
        return self._plugins.get(name)

    async def broadcast_message(self, message: dict[str, Any]) -> list[dict[str, Any]]:
        results = []
        for plugin in self._plugins.values():
            try:
                result = await plugin.on_message(message)
                if result:
                    results.append(result)
            except Exception:
                pass
        return results

    async def broadcast_tool_call(self, tool_name: str, arguments: dict[str, Any]) -> list[dict[str, Any]]:
        results = []
        for plugin in self._plugins.values():
            try:
                result = await plugin.on_tool_call(tool_name, arguments)
                if result:
                    results.append(result)
            except Exception:
                pass
        return results


# Global singleton
plugin_registry = PluginRegistry()
