from __future__ import annotations

import asyncio
import json
import os
import platform
import shutil
import sys
import tarfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx
from fastapi import HTTPException

from app.core.config import settings


@dataclass
class ManagedCli:
    package_name: str
    package_spec: str
    install_dir: Path
    package_dir: Path
    node_executable: Path
    bin_script: Path

    def build_command(self, args: list[str]) -> list[str]:
        return [str(self.node_executable), str(self.bin_script), *args]


_LOCKS: dict[str, asyncio.Lock] = {
    "node": asyncio.Lock(),
    "skills": asyncio.Lock(),
    "mcp": asyncio.Lock(),
}


def _managed_root() -> Path:
    path = Path(settings.MANAGED_RUNTIME_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _node_root_dir() -> Path:
    return _managed_root() / "node"


def _tools_root_dir() -> Path:
    path = _managed_root() / "tools"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _platform_triplet() -> tuple[str, str, str]:
    system = sys.platform
    machine = platform.machine().lower()

    if system == "darwin":
        node_platform = "darwin"
    elif system.startswith("linux"):
        node_platform = "linux"
    elif system == "win32":
        node_platform = "win"
    else:
        raise HTTPException(500, f"Unsupported platform: {system}")

    if machine in {"x86_64", "amd64"}:
        node_arch = "x64"
    elif machine in {"arm64", "aarch64"}:
        node_arch = "arm64"
    else:
        raise HTTPException(500, f"Unsupported architecture: {machine}")

    archive_ext = "zip" if node_platform == "win" else "tar.gz"
    return node_platform, node_arch, archive_ext


def _node_archive_name() -> str:
    node_platform, node_arch, archive_ext = _platform_triplet()
    return f"node-{settings.MANAGED_NODE_VERSION}-{node_platform}-{node_arch}.{archive_ext}"


def _node_download_url() -> str:
    archive_name = _node_archive_name()
    return f"https://nodejs.org/dist/{settings.MANAGED_NODE_VERSION}/{archive_name}"


def _node_extract_dir() -> Path:
    node_platform, node_arch, _ = _platform_triplet()
    return _node_root_dir() / f"node-{settings.MANAGED_NODE_VERSION}-{node_platform}-{node_arch}"


def _node_executable_path() -> Path:
    node_root = _node_extract_dir()
    if sys.platform == "win32":
        return node_root / "node.exe"
    return node_root / "bin" / "node"


def _npm_cli_candidates(node_root: Path) -> list[Path]:
    return [
        node_root / "lib" / "node_modules" / "npm" / "bin" / "npm-cli.js",
        node_root / "node_modules" / "npm" / "bin" / "npm-cli.js",
    ]


def _package_install_dir(package_name: str) -> Path:
    safe_name = package_name.replace("@", "").replace("/", "__")
    path = _tools_root_dir() / safe_name
    path.mkdir(parents=True, exist_ok=True)
    return path


def _package_dir(package_name: str) -> Path:
    return _package_install_dir(package_name) / "node_modules" / Path(*package_name.split("/"))


def _read_package_bin(package_name: str) -> Path:
    package_dir = _package_dir(package_name)
    package_json_path = package_dir / "package.json"
    if not package_json_path.exists():
        raise HTTPException(500, f"Package metadata missing for {package_name}")

    package_json = json.loads(package_json_path.read_text(encoding="utf-8"))
    bin_field = package_json.get("bin")
    if isinstance(bin_field, str):
        bin_rel = bin_field
    elif isinstance(bin_field, dict) and bin_field:
        preferred_name = package_json.get("name", package_name).split("/")[-1]
        bin_rel = bin_field.get(preferred_name) or next(iter(bin_field.values()))
    else:
        raise HTTPException(500, f"Package {package_name} does not expose a CLI entry")

    bin_script = package_dir / bin_rel
    if not bin_script.exists():
        raise HTTPException(500, f"CLI entry not found for {package_name}")
    return bin_script


async def _download_file(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=settings.MANAGED_RUNTIME_TIMEOUT_SEC, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with target.open("wb") as handle:
                async for chunk in response.aiter_bytes():
                    handle.write(chunk)


def _extract_archive(archive_path: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    if archive_path.suffix == ".zip":
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(destination)
        return

    with tarfile.open(archive_path, "r:gz") as archive:
        archive.extractall(destination)


async def ensure_node_runtime() -> tuple[Path, Path]:
    async with _LOCKS["node"]:
        node_root = _node_extract_dir()
        node_executable = _node_executable_path()
        npm_cli = next((path for path in _npm_cli_candidates(node_root) if path.exists()), None)
        if node_executable.exists() and npm_cli:
            return node_executable, npm_cli

        archive_name = _node_archive_name()
        archives_dir = _managed_root() / "archives"
        archive_path = archives_dir / archive_name
        temp_dir = _managed_root() / "tmp"

        if node_root.exists():
            shutil.rmtree(node_root, ignore_errors=True)
        loop = asyncio.get_running_loop()
        for attempt in range(2):
            if not archive_path.exists():
                try:
                    await _download_file(_node_download_url(), archive_path)
                except httpx.HTTPError as exc:
                    raise HTTPException(503, f"Failed to download Node runtime: {exc}") from exc

            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
            temp_dir.mkdir(parents=True, exist_ok=True)

            try:
                await loop.run_in_executor(None, _extract_archive, archive_path, temp_dir)
            except Exception as exc:
                # Corrupted archive can happen if a previous download was interrupted.
                shutil.rmtree(temp_dir, ignore_errors=True)
                archive_path.unlink(missing_ok=True)
                if attempt == 0:
                    continue
                raise HTTPException(500, f"Failed to extract Node runtime: {exc}") from exc

            extracted_dir = temp_dir / node_root.name
            if not extracted_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
                archive_path.unlink(missing_ok=True)
                if attempt == 0:
                    continue
                raise HTTPException(500, "Downloaded Node runtime has unexpected structure")

            node_root.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(extracted_dir), str(node_root))
            shutil.rmtree(temp_dir, ignore_errors=True)

            npm_cli = next((path for path in _npm_cli_candidates(node_root) if path.exists()), None)
            if node_executable.exists() and npm_cli:
                return node_executable, npm_cli

            shutil.rmtree(node_root, ignore_errors=True)
            archive_path.unlink(missing_ok=True)

        raise HTTPException(500, "Managed Node runtime is incomplete after extraction")


async def _run_subprocess(cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None, timeout: int | None = None) -> tuple[str, str, int]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise
    return stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), proc.returncode


async def ensure_managed_cli(package_name: str, package_spec: str | None = None) -> ManagedCli:
    lock_key = "mcp" if package_name == settings.MCP_CLI_PACKAGE else "skills"
    async with _LOCKS[lock_key]:
        node_executable: Path | None = None
        npm_cli: Path | None = None
        runtime_error: HTTPException | None = None
        try:
            node_executable, npm_cli = await ensure_node_runtime()
        except HTTPException as exc:
            runtime_error = exc
            node_path = shutil.which("node")
            if node_path:
                node_executable = Path(node_path)

        if not node_executable:
            if runtime_error:
                raise runtime_error
            raise HTTPException(500, "No Node.js runtime available")

        install_dir = _package_install_dir(package_name)
        package_dir = _package_dir(package_name)
        bin_script = _read_package_bin(package_name) if package_dir.exists() else None

        if bin_script and bin_script.exists():
            return ManagedCli(
                package_name=package_name,
                package_spec=package_spec or package_name,
                install_dir=install_dir,
                package_dir=package_dir,
                node_executable=node_executable,
                bin_script=bin_script,
            )

        install_spec = package_spec or package_name
        env = {
            **os.environ,
            "npm_config_registry": settings.MANAGED_NPM_REGISTRY,
            "npm_config_fund": "false",
            "npm_config_audit": "false",
        }

        if npm_cli and npm_cli.exists():
            cmd = [
                str(node_executable),
                str(npm_cli),
                "install",
                "--prefix",
                str(install_dir),
                "--no-fund",
                "--no-audit",
                install_spec,
            ]
        else:
            npm_cmd = shutil.which("npm")
            if not npm_cmd:
                if runtime_error:
                    raise runtime_error
                raise HTTPException(500, "npm is not available to install managed CLI packages")
            cmd = [
                npm_cmd,
                "install",
                "--prefix",
                str(install_dir),
                "--no-fund",
                "--no-audit",
                install_spec,
            ]

        try:
            _, stderr, code = await _run_subprocess(cmd, timeout=settings.MANAGED_RUNTIME_TIMEOUT_SEC, env=env)
        except asyncio.TimeoutError as exc:
            raise HTTPException(504, f"Timed out while installing {install_spec}") from exc

        if code != 0:
            raise HTTPException(500, f"Failed to install {install_spec}: {stderr.strip()[:500]}")

        bin_script = _read_package_bin(package_name)
        return ManagedCli(
            package_name=package_name,
            package_spec=install_spec,
            install_dir=install_dir,
            package_dir=package_dir,
            node_executable=node_executable,
            bin_script=bin_script,
        )


async def ensure_skills_cli() -> ManagedCli:
    return await ensure_managed_cli(settings.SKILLS_CLI_PACKAGE)


async def ensure_mcp_cli() -> ManagedCli:
    return await ensure_managed_cli(settings.MCP_CLI_PACKAGE)


async def get_managed_runtime_status() -> dict[str, object]:
    node_root = _node_extract_dir()
    node_executable = _node_executable_path()
    skills_dir = _package_dir(settings.SKILLS_CLI_PACKAGE)
    mcp_dir = _package_dir(settings.MCP_CLI_PACKAGE)

    return {
        "runtime_dir": str(_managed_root()),
        "node": {
            "version": settings.MANAGED_NODE_VERSION,
            "installed": node_executable.exists(),
            "path": str(node_executable),
            "root": str(node_root),
        },
        "skills": {
            "package": settings.SKILLS_CLI_PACKAGE,
            "installed": skills_dir.exists(),
            "path": str(skills_dir),
        },
        "mcp": {
            "package": settings.MCP_CLI_PACKAGE,
            "installed": mcp_dir.exists(),
            "path": str(mcp_dir),
        },
    }