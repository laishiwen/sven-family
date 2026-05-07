from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.core.database import get_session
from app.core.config import settings
from app.models import Tool, Skill, SkillsHubItem
from app.services.runtime_bootstrap import ensure_skills_cli, get_managed_runtime_status
from app.services.tool_runtime import execute_tool
from app.schemas import (
    ToolCreate, ToolResponse,
    SkillCreate, SkillResponse, SkillPackageSearchResult, SkillInstallRequest, SkillImportRequest,
    SkillsHubItemResponse,
)
import httpx
from datetime import datetime
import asyncio
import base64
import json
import os
import re
import shutil
from pathlib import Path
from urllib.parse import quote


tool_router = APIRouter(prefix="/tools", tags=["Tools"])
skill_router = APIRouter(prefix="/skills", tags=["Skills"])

# ─── ANSI utilities ────────────────────────────────────────────────────────────
_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[mGKHFJhl]?|\x1b\(B|\x1b[>=]')

def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub('', text)

_SKILL_ENTRY_RE = re.compile(
    r'^([\w.-]+/[\w.-]+)@([\w.-]+)\s+([\d][\d.]*[KMBT]?)\s+installs',
    re.IGNORECASE,
)
_URL_LINE_RE = re.compile(r'[\u2514\u2570\u251c\\]\s*(https?://\S+)|^\s+https?://\S+')
_SKILL_NAME_RE = re.compile(r'^[a-z0-9][a-z0-9-]{1,63}$')

_TEXT_FILE_EXTENSIONS = {
    ".md",
    ".markdown",
    ".txt",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".css",
    ".scss",
    ".html",
    ".xml",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
}

# ─── Skills CLI helper ─────────────────────────────────────────────────────────
_skills_cli_installed = False  # cached flag
_skills_cli_path: str | None = None
_skills_node_path: str | None = None


@skill_router.get("/runtime/status")
async def skills_runtime_status():
    return await get_managed_runtime_status()


@skill_router.post("/runtime/ensure")
async def ensure_skills_runtime():
    cli = await ensure_skills_cli()
    return {
        "status": "ready",
        "package": cli.package_name,
        "package_dir": str(cli.package_dir),
        "node_path": str(cli.node_executable),
        "entry": str(cli.bin_script),
    }

async def _run_skills_cmd(args: list[str], timeout: int = 60) -> tuple[bytes, bytes, int]:
    """Run `skills <args>` using the managed runtime installed on demand."""
    global _skills_cli_installed, _skills_cli_path, _skills_node_path

    env = os.environ.copy()

    async def _exec(cmd: list[str], t: int = timeout) -> tuple[bytes, bytes, int]:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,   # prevent interactive prompt blocks
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=t)
        return stdout, stderr, proc.returncode

    if _skills_cli_path and _skills_node_path:
        try:
            return await _exec([_skills_node_path, _skills_cli_path] + args)
        except (FileNotFoundError, OSError):
            _skills_cli_path = None
            _skills_node_path = None

    try:
        managed_cli = await ensure_skills_cli()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Failed to prepare managed skills runtime: {exc}") from exc

    _skills_cli_path = str(managed_cli.bin_script)
    _skills_node_path = str(managed_cli.node_executable)
    _skills_cli_installed = True
    return await _exec(managed_cli.build_command(args), t=max(timeout, 120))

def _parse_find_output(raw: str) -> list[dict]:
    """Parse `npx skills find <q>` stdout into structured list."""
    results: list[dict] = []
    current: dict | None = None
    for line in _strip_ansi(raw).splitlines():
        line = line.strip()
        if not line:
            continue
        m = _SKILL_ENTRY_RE.match(line)
        if m:
            if current:
                results.append(current)
            owner_repo, skill_name, count = m.group(1), m.group(2), m.group(3)
            parts = owner_repo.split('/')
            owner, repo = parts[0], (parts[1] if len(parts) > 1 else '')
            current = {
                'name': skill_name,
                'version': None,
                'description': None,
                'package_ref': f"{owner_repo}@{skill_name}",
                'source_url': f"https://skills.sh/{owner}/{repo}/{skill_name}",
                'install_count': count,
                'owner': owner,
                'repo': repo,
            }
        elif current:
            url_m = _URL_LINE_RE.search(line)
            if url_m:
                # group(1) is the captured URL without the box-drawing prefix
                url = (url_m.group(1) or url_m.group(0)).strip()
                if url.startswith("http"):
                    current['source_url'] = url
    if current:
        results.append(current)
    return results

# ─── Hub seed data (top skills from skills.sh leaderboard) ────────────────────
_HUB_SEED = [
    # (rank, skill_name, owner, repo, install_count)
    (1,  "find-skills",                     "vercel-labs",   "skills",                     "1.1M"),
    (2,  "vercel-react-best-practices",     "vercel-labs",   "agent-skills",               "321.3K"),
    (3,  "frontend-design",                 "anthropics",    "skills",                     "300.9K"),
    (4,  "web-design-guidelines",           "vercel-labs",   "agent-skills",               "257.0K"),
    (5,  "remotion-best-practices",         "remotion-dev",  "skills",                     "243.5K"),
    (6,  "microsoft-foundry",               "microsoft",     "azure-skills",               "202.3K"),
    (7,  "ai-image-generation",             "skillsh",       "skills",                     "50.0K"),
    (8,  "lark-calendar",                   "larksuite",     "cli",                        "15.3K"),
    (9,  "lark-drive",                      "larksuite",     "cli",                        "12.7K"),
    (10, "lark-vc",                         "larksuite",     "cli",                        "17.6K"),
    (11, "lark-sheets",                     "larksuite",     "cli",                        "12.7K"),
    (12, "lark-event",                      "larksuite",     "cli",                        "12.7K"),
    (13, "lark-slides",                     "larksuite",     "cli",                        "17.6K"),
    (14, "caveman",                         "juliusbrussee", "caveman",                    "11.9K"),
    (15, "caveman-compress",                "juliusbrussee", "caveman",                    "11.9K"),
    (16, "compress",                        "juliusbrussee", "caveman",                    "11.9K"),
    (17, "critique",                        "pbakaus",       "impeccable",                 "2.0K"),
    (18, "polish",                          "pbakaus",       "impeccable",                 "2.0K"),
    (19, "audit",                           "pbakaus",       "impeccable",                 "2.0K"),
    (20, "impeccable",                      "pbakaus",       "impeccable",                 "2.0K"),
    (21, "extract-design-system",           "arvindrk",      "extract-design-system",      "2.7K"),
    (22, "azure-resource-visualizer",       "microsoft",     "azure-skills",               "7.5K"),
    (23, "pdf",                             "anthropics",    "skills",                     "64"),
    (24, "html-ppt",                        "lewislulu",     "html-ppt-skill",             None),
    (25, "agent-browser",                   "vercel-labs",   "agent-browser",              "187.4K"),
    (26, "azure-quotas",                    "microsoft",     "azure-skills",               "169.1K"),
    (27, "azure-upgrade",                   "microsoft",     "azure-skills",               "156.7K"),
    (28, "azure-ai",                        "microsoft",     "github-copilot-for-azure",   "151.9K"),
    (29, "skill-creator",                   "anthropics",    "skills",                     "151.3K"),
    (30, "azure-prepare",                   "microsoft",     "github-copilot-for-azure",   "151.3K"),
    (31, "azure-cost-optimization",         "microsoft",     "azure-skills",               "149.3K"),
    (32, "azure-cost-optimization",         "microsoft",     "github-copilot-for-azure",   "148.0K"),
    (33, "microsoft-foundry",               "microsoft",     "github-copilot-for-azure",   "144.1K"),
    (34, "azure-messaging",                 "microsoft",     "github-copilot-for-azure",   "138.0K"),
    (35, "vercel-composition-patterns",     "vercel-labs",   "agent-skills",               "135.0K"),
    (36, "soultrace",                       "soultrace-ai",  "soultrace-skill",            "128.7K"),
    (37, "design-taste-frontend",           "leonxlnx",      "taste-skill",                "58"),
    (38, "emil-design-eng",                 "emilkowalski",  "skill",                      "40"),
    (39, "notion-api",                      "intellectronica","agent-skills",               "20"),
    (40, "gsap-timeline",                   "greensock",     "gsap-skills",                "17"),
    (41, "gsap-plugins",                    "greensock",     "gsap-skills",                "17"),
    (42, "shadcn",                          "shadcn",        "ui",                         "104"),
    (43, "value",                           "hugmouse",      "skills",                     "158"),
    (44, "redesign-existing-projects",      "leonxlnx",      "taste-skill",                "53"),
    (45, "minimalist-ui",                   "leonxlnx",      "taste-skill",                "52"),
    (46, "azure-messaging",                 "microsoft",     "azure-skills",               "138.0K"),
    (47, "azure-ai",                        "microsoft",     "azure-skills",               "149.3K"),
    (48, "document-processing",             "anthropics",    "skills",                     "300.9K"),
    (49, "pr-review",                       "vercel-labs",   "agent-skills",               "135.0K"),
    (50, "testing-best-practices",          "vercel-labs",   "agent-skills",               "135.0K"),
    (51, "nextjs-best-practices",           "vercel-labs",   "agent-skills",               "257.0K"),
    (52, "tailwind-best-practices",         "vercel-labs",   "agent-skills",               "135.0K"),
    (53, "typescript-best-practices",       "vercel-labs",   "agent-skills",               "135.0K"),
    (54, "accessibility",                   "vercel-labs",   "agent-skills",               "135.0K"),
    (55, "performance-optimization",        "vercel-labs",   "agent-skills",               "135.0K"),
    (56, "azure-networking",                "microsoft",     "azure-skills",               "100.0K"),
    (57, "azure-storage",                   "microsoft",     "azure-skills",               "100.0K"),
    (58, "azure-compute",                   "microsoft",     "azure-skills",               "100.0K"),
    (59, "azure-security",                  "microsoft",     "azure-skills",               "100.0K"),
    (60, "azure-monitoring",                "microsoft",     "azure-skills",               "100.0K"),
    (61, "lark-task",                       "larksuite",     "cli",                        "12.7K"),
    (62, "lark-docx",                       "larksuite",     "cli",                        "12.7K"),
    (63, "lark-message",                    "larksuite",     "cli",                        "12.7K"),
    (64, "lark-wiki",                       "larksuite",     "cli",                        "12.7K"),
    (65, "lark-bitable",                    "larksuite",     "cli",                        "12.7K"),
    (66, "image-generation",                "skillsh",       "skills",                     "50.0K"),
    (67, "code-review",                     "skillsh",       "skills",                     "50.0K"),
    (68, "deploy-vercel",                   "vercel-labs",   "agent-skills",               "135.0K"),
    (69, "seo-optimization",                "vercel-labs",   "agent-skills",               "135.0K"),
    (70, "api-design",                      "vercel-labs",   "agent-skills",               "135.0K"),
    (71, "security-review",                 "vercel-labs",   "agent-skills",               "135.0K"),
    (72, "refactor-code",                   "vercel-labs",   "agent-skills",               "135.0K"),
    (73, "write-docs",                      "anthropics",    "skills",                     "300.9K"),
    (74, "write-tests",                     "anthropics",    "skills",                     "300.9K"),
    (75, "code-explanation",                "anthropics",    "skills",                     "300.9K"),
    (76, "debug-code",                      "anthropics",    "skills",                     "300.9K"),
    (77, "data-analysis",                   "anthropics",    "skills",                     "300.9K"),
    (78, "git-workflow",                    "vercel-labs",   "agent-skills",               "135.0K"),
    (79, "docker-best-practices",           "vercel-labs",   "agent-skills",               "135.0K"),
    (80, "ci-cd",                           "vercel-labs",   "agent-skills",               "135.0K"),
    (81, "database-design",                 "vercel-labs",   "agent-skills",               "135.0K"),
    (82, "rest-api-design",                 "vercel-labs",   "agent-skills",               "135.0K"),
    (83, "graphql-best-practices",          "vercel-labs",   "agent-skills",               "135.0K"),
    (84, "react-native-best-practices",     "vercel-labs",   "agent-skills",               "135.0K"),
    (85, "mobile-design",                   "vercel-labs",   "agent-skills",               "135.0K"),
    (86, "animation-best-practices",        "remotion-dev",  "skills",                     "243.5K"),
    (87, "video-processing",                "remotion-dev",  "skills",                     "243.5K"),
    (88, "ai-prompting",                    "anthropics",    "skills",                     "300.9K"),
    (89, "llm-fine-tuning",                 "anthropics",    "skills",                     "300.9K"),
    (90, "rag-patterns",                    "anthropics",    "skills",                     "300.9K"),
    (91, "agent-patterns",                  "anthropics",    "skills",                     "300.9K"),
    (92, "tool-use",                        "anthropics",    "skills",                     "300.9K"),
    (93, "claude-best-practices",           "anthropics",    "skills",                     "300.9K"),
    (94, "azure-openai",                    "microsoft",     "github-copilot-for-azure",   "144.1K"),
    (95, "azure-devops",                    "microsoft",     "github-copilot-for-azure",   "144.1K"),
    (96, "azure-functions",                 "microsoft",     "azure-skills",               "100.0K"),
    (97, "azure-containers",                "microsoft",     "azure-skills",               "100.0K"),
    (98, "azure-kubernetes",                "microsoft",     "azure-skills",               "100.0K"),
    (99, "azure-data",                      "microsoft",     "azure-skills",               "100.0K"),
    (100,"azure-ai-studio",                 "microsoft",     "azure-skills",               "100.0K"),
]

async def _ensure_hub_seeded(session: AsyncSession) -> None:
    """Seed hub items if table is empty."""
    result = await session.exec(select(SkillsHubItem).limit(1))
    if result.first():
        return
    seen: set[str] = set()
    for rank, skill_name, owner, repo, install_count in _HUB_SEED:
        pkg_ref = f"{owner}/{repo}@{skill_name}"
        if pkg_ref in seen:
            continue
        seen.add(pkg_ref)
        session.add(SkillsHubItem(
            skill_name=skill_name, owner=owner, repo=repo,
            package_ref=pkg_ref,
            source_url=f"https://skills.sh/{owner}/{repo}/{skill_name}",
            install_count=install_count, rank=rank,
        ))
    await session.commit()

async def _sync_hub_from_web(session: AsyncSession) -> int:
    """Scrape skills.sh leaderboard pages and upsert into hub DB."""
    import httpx
    _SKIP = frozenset({'trending','hot','official','audits','docs','security','site','api'})
    _HREF_RE = re.compile(r'href="/([\w][\w.-]*)/([\w][\w.-]*)/([\w][\w.-]*)"')
    _COUNT_RE = re.compile(r'([\d][\d.]*[KMBT]?)\s')
    seen: set[str] = set()
    items: list[dict] = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for page_url in ["https://skills.sh/", "https://skills.sh/trending"]:
            try:
                resp = await client.get(page_url, headers={"User-Agent": "Mozilla/5.0"})
                html = resp.text
            except Exception:
                continue
            for m in _HREF_RE.finditer(html):
                owner, repo, skill = m.group(1), m.group(2), m.group(3)
                if owner in _SKIP or repo in _SKIP or skill in _SKIP:
                    continue
                pkg_ref = f"{owner}/{repo}@{skill}"
                if pkg_ref in seen:
                    continue
                seen.add(pkg_ref)
                # Try extract count from surrounding context (50 chars)
                start = max(0, m.start() - 100)
                ctx = html[start:m.end() + 100]
                cm = _COUNT_RE.search(ctx)
                items.append({
                    'skill_name': skill, 'owner': owner, 'repo': repo,
                    'package_ref': pkg_ref,
                    'source_url': f"https://skills.sh/{owner}/{repo}/{skill}",
                    'install_count': cm.group(1) if cm else None,
                    'rank': len(items) + 1,
                })
    saved = 0
    for item_data in items[:100]:
        ex = await session.exec(
            select(SkillsHubItem).where(SkillsHubItem.package_ref == item_data['package_ref'])
        )
        existing = ex.first()
        if existing:
            for k, v in item_data.items():
                setattr(existing, k, v)
            existing.synced_at = datetime.utcnow()
            session.add(existing)
        else:
            session.add(SkillsHubItem(**item_data))
        saved += 1
    await session.commit()
    return saved


def _skill_name_from_package_name(package_name: str | None, fallback_name: str) -> str:
    if not package_name:
        return fallback_name
    value = package_name.strip()
    if "@" in value:
        return value.split("@")[-1]
    if "/" in value:
        return value.split("/")[-1]
    return value


def _candidate_skill_roots(skill_name: str) -> list[Path]:
    router_file = Path(__file__).resolve()
    backend_dir = router_file.parents[4]
    studio_dir = backend_dir.parent
    cwd = Path.cwd()
    home = Path.home()

    bases = [
        Path(settings.SKILLS_DIR),
        cwd,
        backend_dir,
        studio_dir,
        home,
    ]
    roots: list[Path] = []
    seen: set[str] = set()

    for base in bases:
        for rel in (
            Path(".agents") / "skills" / skill_name,
            Path(".claude") / "skills" / skill_name,
            Path("skills") / skill_name,
        ):
            candidate = (base / rel).expanduser()
            normalized = str(candidate)
            if normalized in seen:
                continue
            seen.add(normalized)
            roots.append(candidate)

    return roots


def _resolve_skill_root(skill: Skill) -> Path:
    skill_name = _skill_name_from_package_name(skill.package_name, skill.name)
    for candidate in _candidate_skill_roots(skill_name):
        try:
            if candidate.exists() and candidate.is_dir():
                return candidate.resolve()
        except OSError:
            continue
    raise HTTPException(404, "Installed skill files not found on disk")


def _candidate_lock_files() -> list[Path]:
    router_file = Path(__file__).resolve()
    backend_dir = router_file.parents[4]
    studio_dir = backend_dir.parent
    cwd = Path.cwd()
    home = Path.home()

    bases = [cwd, backend_dir, studio_dir, home]
    files: list[Path] = []
    seen: set[str] = set()

    for base in bases:
        for rel in (
            Path("skills-lock.json"),
            Path(".agents") / "skills-lock.json",
            Path(".claude") / "skills-lock.json",
        ):
            candidate = (base / rel).expanduser()
            key = str(candidate)
            if key in seen:
                continue
            seen.add(key)
            files.append(candidate)

    return files


def _cleanup_installed_skill_artifacts(skill: Skill) -> list[str]:
    failures: list[str] = []
    skill_name = _skill_name_from_package_name(skill.package_name, skill.name)

    for candidate in _candidate_skill_roots(skill_name):
        try:
            if not candidate.exists():
                continue
            if candidate.is_symlink() or candidate.is_file():
                candidate.unlink()
            elif candidate.is_dir():
                shutil.rmtree(candidate)
        except OSError as exc:
            failures.append(f"Failed to remove {candidate}: {exc}")

    for lock_file in _candidate_lock_files():
        try:
            if not lock_file.exists() or not lock_file.is_file():
                continue
            raw = lock_file.read_text(encoding="utf-8")
            payload = json.loads(raw)
            skills_map = payload.get("skills")
            if not isinstance(skills_map, dict):
                continue
            if skill_name not in skills_map:
                continue
            skills_map.pop(skill_name, None)
            lock_file.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except (OSError, ValueError, TypeError) as exc:
            failures.append(f"Failed to update {lock_file}: {exc}")

    return failures


async def _try_uninstall_skill_package(package_name: str) -> None:
    # Different Skills CLI versions may expose different uninstall commands.
    command_candidates = (
        ["remove", package_name, "-y"],
        ["rm", package_name, "-y"],
        ["uninstall", package_name, "-y"],
    )

    for cmd in command_candidates:
        try:
            _, _, rc = await _run_skills_cmd(cmd, timeout=120)
        except asyncio.TimeoutError:
            continue
        except HTTPException:
            continue
        if rc == 0:
            return


def _safe_join_under_root(root: Path, relative_path: str) -> Path:
    raw = (relative_path or "").strip()
    if not raw:
        return root

    rel = Path(raw)
    if rel.is_absolute():
        raise HTTPException(400, "Absolute paths are not allowed")
    if any(part == ".." for part in rel.parts):
        raise HTTPException(400, "Path traversal is not allowed")

    target = (root / rel).resolve()
    if target != root and root not in target.parents:
        raise HTTPException(400, "Path is outside skill root")
    return target


def _virtual_skill_files(skill: Skill) -> dict[str, str]:
    raw = (skill.content_json or "").strip()
    if raw.startswith("{"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and all(
                isinstance(k, str) and isinstance(v, str) for k, v in parsed.items()
            ):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass
    return {"SKILL.md": skill.content_json or ""}


def _virtual_package_files(skill: Skill, reason: str | None = None) -> dict[str, str]:
    payload = {
        "id": skill.id,
        "name": skill.name,
        "description": skill.description,
        "skill_type": skill.skill_type,
        "source": skill.source,
        "package_name": skill.package_name,
        "reason": reason or "Skill files are unavailable on disk",
    }
    readme = "\n".join([
        "# Skill Files Unavailable",
        "",
        "This skill exists in database, but local files cannot be found.",
        f"- name: {skill.name}",
        f"- package: {skill.package_name or '-'}",
        "",
        "You can reinstall/update this skill, then try file preview again.",
    ])
    return {
        "metadata.json": json.dumps(payload, ensure_ascii=False, indent=2),
        "README.md": readme,
    }


def _guess_language(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    mapping = {
        ".md": "markdown",
        ".markdown": "markdown",
        ".json": "json",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".toml": "toml",
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".html": "html",
        ".css": "css",
        ".scss": "scss",
        ".sql": "sql",
        ".sh": "shell",
    }
    return mapping.get(ext, "plaintext")


def _parse_package_ref(package_ref: str) -> tuple[str, str, str]:
    value = (package_ref or "").strip()
    if not value or "@" not in value:
        raise HTTPException(400, "Invalid package_ref")
    owner_repo, skill_name = value.split("@", 1)
    parts = owner_repo.split("/", 1)
    if len(parts) != 2 or not parts[0] or not parts[1] or not skill_name:
        raise HTTPException(400, "Invalid package_ref")
    return parts[0], parts[1], skill_name


def _normalize_relative_path(path: str) -> str:
    normalized = (path or "").strip().replace("\\", "/")
    if normalized.startswith("/"):
        raise HTTPException(400, "Absolute paths are not allowed")
    parts = [part for part in normalized.split("/") if part]
    if any(part == ".." for part in parts):
        raise HTTPException(400, "Path traversal is not allowed")
    return "/".join(parts)


async def _fetch_github_contents(owner: str, repo: str, path: str = "") -> object:
    encoded = quote(path, safe="/")
    suffix = f"/{encoded}" if encoded else ""
    url = f"https://api.github.com/repos/{owner}/{repo}/contents{suffix}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "SvenStudio-SkillsPreview",
    }

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)

    if resp.status_code == 404:
        raise FileNotFoundError(path or "/")
    if resp.status_code == 403:
        raise HTTPException(429, "GitHub API rate limit reached, please retry later")
    if resp.status_code >= 400:
        raise HTTPException(502, f"Failed to fetch remote skill files: HTTP {resp.status_code}")
    return resp.json()


async def _resolve_remote_skill_root(owner: str, repo: str, skill_name: str) -> str:
    candidates = [
        skill_name,
        f"skills/{skill_name}",
        f".agents/skills/{skill_name}",
        f".claude/skills/{skill_name}",
    ]
    for candidate in candidates:
        try:
            payload = await _fetch_github_contents(owner, repo, candidate)
        except FileNotFoundError:
            continue
        if isinstance(payload, list):
            return candidate
        if isinstance(payload, dict) and payload.get("type") == "dir":
            return candidate
    raise HTTPException(404, "Remote skill files not found")


def _decode_github_content(content: str | None, encoding: str | None) -> bytes:
    if not content:
        return b""
    if encoding == "base64":
        return base64.b64decode(content)
    return content.encode("utf-8", errors="ignore")


def _parse_skill_frontmatter(skill_md: str) -> dict[str, str]:
    text = skill_md.lstrip("\ufeff").strip()
    if not text.startswith("---"):
        raise HTTPException(400, "Invalid skill folder: SKILL.md must start with YAML frontmatter")

    lines = text.splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        raise HTTPException(400, "Invalid skill folder: malformed SKILL.md frontmatter")

    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        raise HTTPException(400, "Invalid skill folder: frontmatter closing '---' is missing")

    frontmatter: dict[str, str] = {}
    for raw in lines[1:end_idx]:
        if ":" not in raw:
            continue
        key, value = raw.split(":", 1)
        frontmatter[key.strip()] = value.strip().strip('"').strip("'")

    name = (frontmatter.get("name") or "").strip()
    description = (frontmatter.get("description") or "").strip()
    allowed_tools = (frontmatter.get("allowed-tools") or "").strip()
    if not name:
        raise HTTPException(400, "Invalid skill folder: frontmatter 'name' is required")
    if not description:
        raise HTTPException(400, "Invalid skill folder: frontmatter 'description' is required")
    if not _SKILL_NAME_RE.match(name):
        raise HTTPException(
            400,
            "Invalid skill folder: frontmatter 'name' must match ^[a-z0-9][a-z0-9-]{1,63}$",
        )

    if allowed_tools:
        if len(allowed_tools) > 500:
            raise HTTPException(
                400,
                "Invalid skill folder: frontmatter 'allowed-tools' is too long",
            )
        if not re.search(r'[A-Za-z][\w-]*\([^)]*\)', allowed_tools):
            raise HTTPException(
                400,
                "Invalid skill folder: frontmatter 'allowed-tools' format is invalid",
            )

    body = "\n".join(lines[end_idx + 1:]).strip()
    if len(body) < 20:
        raise HTTPException(
            400,
            "Invalid skill folder: SKILL.md body is too short",
        )
    if len(body) > 200000:
        raise HTTPException(
            400,
            "Invalid skill folder: SKILL.md body is too long",
        )
    if not re.search(r'^#{1,3}\s+\S', body, re.MULTILINE):
        raise HTTPException(
            400,
            "Invalid skill folder: SKILL.md body must include at least one Markdown heading",
        )

    return {
        "name": name,
        "description": description,
    }

# Tools
@tool_router.get("", response_model=list[ToolResponse])
async def list_tools(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Tool))
    return result.all()


@tool_router.post("", response_model=ToolResponse, status_code=201)
async def create_tool(body: ToolCreate, session: AsyncSession = Depends(get_session)):
    tool = Tool(**body.model_dump())
    session.add(tool)
    await session.commit()
    await session.refresh(tool)
    return tool


@tool_router.get("/{tool_id}", response_model=ToolResponse)
async def get_tool(tool_id: str, session: AsyncSession = Depends(get_session)):
    tool = await session.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")
    return tool


@tool_router.patch("/{tool_id}", response_model=ToolResponse)
async def update_tool(tool_id: str, body: dict, session: AsyncSession = Depends(get_session)):
    tool = await session.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")
    for k, v in body.items():
        if hasattr(tool, k):
            setattr(tool, k, v)
    tool.updated_at = datetime.utcnow()
    session.add(tool)
    await session.commit()
    await session.refresh(tool)
    return tool


@tool_router.delete("/{tool_id}", status_code=204)
async def delete_tool(tool_id: str, session: AsyncSession = Depends(get_session)):
    tool = await session.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")
    await session.delete(tool)
    await session.commit()


@tool_router.post("/{tool_id}/test")
async def test_tool(tool_id: str, body: dict, session: AsyncSession = Depends(get_session)):
    tool = await session.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")
    return await _execute_tool(tool, body.get("input", body))


@tool_router.post("/{tool_id}/run")
async def run_tool(tool_id: str, body: dict, session: AsyncSession = Depends(get_session)):
    tool = await session.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")
    return await _execute_tool(tool, body.get("input", body))


async def _execute_tool(tool: "Tool", input_data: dict) -> dict:
    return await execute_tool(tool, input_data)


# ─── Skills Hub ────────────────────────────────────────────────────────────────

@skill_router.get("/hub", response_model=list[SkillsHubItemResponse])
async def list_hub_skills(session: AsyncSession = Depends(get_session)):
    """List all skills from the Skills Hub (seeded from skills.sh leaderboard)."""
    await _ensure_hub_seeded(session)
    result = await session.exec(select(SkillsHubItem).order_by(SkillsHubItem.rank))
    return result.all()


@skill_router.post("/hub/sync")
async def sync_hub_skills(background_tasks: BackgroundTasks, session: AsyncSession = Depends(get_session)):
    """Sync skills from skills.sh leaderboard (runs in background)."""
    background_tasks.add_task(_sync_hub_from_web, session)
    return {"message": "Sync started in background"}


@skill_router.get("/hub/files/tree")
async def hub_skill_files_tree(
    package_ref: str = Query(..., min_length=3),
    path: str = Query(""),
):
    owner, repo, skill_name = _parse_package_ref(package_ref)
    root = await _resolve_remote_skill_root(owner, repo, skill_name)
    rel_path = _normalize_relative_path(path)
    target_path = root if not rel_path else f"{root}/{rel_path}"

    try:
        payload = await _fetch_github_contents(owner, repo, target_path)
    except FileNotFoundError:
        raise HTTPException(404, "Remote directory not found")

    if isinstance(payload, dict) and payload.get("type") != "dir":
        raise HTTPException(400, "Path is not a directory")

    entries = payload if isinstance(payload, list) else [payload]
    items: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        item_type = "dir" if entry.get("type") == "dir" else "file"
        full_path = str(entry.get("path") or "")
        rel_item = full_path[len(root):].lstrip("/") if full_path.startswith(root) else full_path
        items.append(
            {
                "name": entry.get("name"),
                "path": rel_item,
                "type": item_type,
                "size": entry.get("size"),
            }
        )
    items.sort(key=lambda item: (item["type"] != "dir", str(item["name"]).lower()))

    return {
        "remote": True,
        "package_ref": package_ref,
        "root": root,
        "path": rel_path,
        "items": items,
    }


@skill_router.get("/hub/files/content")
async def hub_skill_file_content(
    package_ref: str = Query(..., min_length=3),
    path: str = Query(..., min_length=1),
):
    owner, repo, skill_name = _parse_package_ref(package_ref)
    root = await _resolve_remote_skill_root(owner, repo, skill_name)
    rel_path = _normalize_relative_path(path)
    if not rel_path:
        raise HTTPException(400, "File path is required")

    target_path = f"{root}/{rel_path}"
    try:
        payload = await _fetch_github_contents(owner, repo, target_path)
    except FileNotFoundError:
        raise HTTPException(404, "Remote file not found")

    if not isinstance(payload, dict) or payload.get("type") != "file":
        raise HTTPException(400, "Path is not a file")

    if Path(rel_path).suffix.lower() not in _TEXT_FILE_EXTENSIONS:
        raise HTTPException(415, "Unsupported file type for preview")

    max_bytes = 512 * 1024
    data = _decode_github_content(payload.get("content"), payload.get("encoding"))
    if not data and payload.get("download_url"):
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            raw_resp = await client.get(str(payload.get("download_url")))
        if raw_resp.status_code >= 400:
            raise HTTPException(502, f"Failed to fetch remote file content: HTTP {raw_resp.status_code}")
        data = raw_resp.content

    if b"\x00" in data[: min(len(data), 4096)]:
        raise HTTPException(415, "Binary file is not supported for preview")

    truncated = len(data) > max_bytes
    preview = data[:max_bytes].decode("utf-8", errors="replace")

    return {
        "remote": True,
        "package_ref": package_ref,
        "path": rel_path,
        "language": _guess_language(rel_path),
        "size": len(data),
        "truncated": truncated,
        "binary": False,
        "content": preview,
    }


# ─── Skills search (via npx skills find) ───────────────────────────────────────

@skill_router.get("/search", response_model=list[SkillPackageSearchResult])
async def search_skill_packages(q: str = Query(..., min_length=1)):
    """Search for skill packages via `skills find <query>` with ANSI stripped."""
    try:
        stdout, _, rc = await _run_skills_cmd(["find", q], timeout=30)
    except asyncio.TimeoutError:
        raise HTTPException(504, "Search timed out")

    output = stdout.decode("utf-8", errors="replace")
    parsed = _parse_find_output(output)
    return [
        SkillPackageSearchResult(
            name=p['name'],
            version=p.get('version'),
            description=p.get('description'),
            package_ref=p.get('package_ref'),
            source_url=p.get('source_url'),
            install_count=p.get('install_count'),
            owner=p.get('owner'),
            repo=p.get('repo'),
        )
        for p in parsed
    ]


# ─── Skills install ─────────────────────────────────────────────────────────────

@skill_router.post("/install", response_model=SkillResponse, status_code=201)
async def install_skill_package(body: SkillInstallRequest, session: AsyncSession = Depends(get_session)):
    """Install a skill package via `skills add <package>` and record in DB."""
    package_name = body.package_name.strip()
    if not package_name:
        raise HTTPException(400, "package_name is required")

    try:
        stdout, stderr, rc = await _run_skills_cmd(["add", package_name, "-y"], timeout=120)
    except asyncio.TimeoutError:
        raise HTTPException(504, "Installation timed out")

    if rc != 0:
        err = stderr.decode("utf-8", errors="replace")
        raise HTTPException(500, f"Installation failed: {_strip_ansi(err)[:500]}")

    # Avoid duplicate records
    ex = await session.exec(select(Skill).where(Skill.package_name == package_name))
    skill = ex.first()
    if skill:
        return skill

    # Parse display name from package_ref "owner/repo@skill-name" → "skill-name"
    if "@" in package_name:
        display_name = package_name.split("@")[-1]
    elif "/" in package_name:
        display_name = package_name.split("/")[-1]
    else:
        display_name = package_name

    skill = Skill(
        name=display_name,
        description=f"Installed from {package_name}",
        skill_type="chain",
        content_json="{}",
        source="package",
        package_name=package_name,
    )
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@skill_router.post("/import-folder", response_model=SkillResponse, status_code=201)
async def import_skill_folder(body: SkillImportRequest, session: AsyncSession = Depends(get_session)):
    folder_raw = (body.folder_path or "").strip()
    if not folder_raw:
        raise HTTPException(400, "folder_path is required")

    folder = Path(folder_raw).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(400, "Invalid skill folder: directory does not exist")

    skill_md_path = folder / "SKILL.md"
    if not skill_md_path.exists() or not skill_md_path.is_file():
        raise HTTPException(400, "Invalid skill folder: SKILL.md is required")

    try:
        skill_md = skill_md_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "Invalid skill folder: SKILL.md must be UTF-8 text")
    except OSError as exc:
        raise HTTPException(400, f"Invalid skill folder: cannot read SKILL.md ({exc})")

    meta = _parse_skill_frontmatter(skill_md)
    imported_name = meta["name"]
    imported_description = meta["description"]

    folder_name = folder.name.strip().lower()
    if folder_name and folder_name != imported_name.lower():
        raise HTTPException(
            400,
            "Invalid skill folder: directory name must match frontmatter 'name'",
        )

    existing = await session.exec(select(Skill).where(Skill.name == imported_name))
    if existing.first():
        raise HTTPException(409, f"Skill '{imported_name}' already exists")

    dest = Path(settings.SKILLS_DIR) / imported_name
    if dest.exists():
        shutil.rmtree(str(dest))
    shutil.copytree(str(folder), str(dest))

    skill = Skill(
        name=imported_name,
        description=imported_description,
        skill_type="prompt",
        content_json="{}",
        source="custom",
    )
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


# ─── Skills update (individual / all) ──────────────────────────────────────────

@skill_router.post("/update-all")
async def update_all_skills():
    """Run `skills update` to update all installed skills globally."""
    try:
        stdout, stderr, rc = await _run_skills_cmd(["update", "-y"], timeout=180)
    except asyncio.TimeoutError:
        raise HTTPException(504, "Update timed out")

    if rc != 0:
        err = _strip_ansi(stderr.decode("utf-8", errors="replace"))
        raise HTTPException(500, f"Update failed: {err[:500]}")

    return {"message": "All skills updated successfully"}


# ─── Skills CRUD ────────────────────────────────────────────────────────────────

@skill_router.get("", response_model=list[SkillResponse])
async def list_skills(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Skill))
    return result.all()


@skill_router.post("", response_model=SkillResponse, status_code=201)
async def create_skill(body: SkillCreate, session: AsyncSession = Depends(get_session)):
    skill = Skill(**body.model_dump())
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@skill_router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(skill_id: str, session: AsyncSession = Depends(get_session)):
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    return skill


@skill_router.patch("/{skill_id}", response_model=SkillResponse)
async def update_skill(skill_id: str, body: dict, session: AsyncSession = Depends(get_session)):
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    for k, v in body.items():
        if hasattr(skill, k):
            setattr(skill, k, v)
    skill.updated_at = datetime.utcnow()
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@skill_router.post("/{skill_id}/update", response_model=SkillResponse)
async def update_single_skill(skill_id: str, session: AsyncSession = Depends(get_session)):
    """Re-install (update) a specific installed skill package."""
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    if skill.source != "package" or not skill.package_name:
        raise HTTPException(400, "Only package skills can be updated this way")

    try:
        stdout, stderr, rc = await _run_skills_cmd(["add", skill.package_name, "-y"], timeout=120)
    except asyncio.TimeoutError:
        raise HTTPException(504, "Update timed out")

    if rc != 0:
        err = _strip_ansi(stderr.decode("utf-8", errors="replace"))
        raise HTTPException(500, f"Update failed: {err[:500]}")

    skill.updated_at = datetime.utcnow()
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@skill_router.delete("/{skill_id}", status_code=204)
async def delete_skill(skill_id: str, session: AsyncSession = Depends(get_session)):
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")

    if skill.source == "custom":
        skill_root = Path(settings.SKILLS_DIR) / skill.name
        if skill_root.exists():
            shutil.rmtree(str(skill_root))
    elif skill.source == "package" and skill.package_name:
        await _try_uninstall_skill_package(skill.package_name)
        cleanup_failures = _cleanup_installed_skill_artifacts(skill)
        if cleanup_failures:
            raise HTTPException(500, f"Failed to clean skill artifacts: {'; '.join(cleanup_failures[:3])}")

    await session.delete(skill)
    await session.commit()


@skill_router.get("/{skill_id}/files/tree")
async def list_skill_files(
    skill_id: str,
    path: str = Query(""),
    session: AsyncSession = Depends(get_session),
):
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")

    fallback_files: dict[str, str] | None = None
    try:
        root = _resolve_skill_root(skill)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        if skill.source == "custom":
            fallback_files = _virtual_skill_files(skill)
        else:
            fallback_files = _virtual_package_files(skill, str(exc.detail))
        if path.strip():
            raise HTTPException(404, "Path not found")
        return {
            "root": "virtual",
            "path": "",
            "items": [
                {
                    "name": name,
                    "path": name,
                    "type": "file",
                    "size": len(content.encode("utf-8")),
                }
                for name, content in sorted(fallback_files.items())
            ],
        }

    target_dir = _safe_join_under_root(root, path)
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(404, "Directory not found")

    items: list[dict[str, object]] = []
    collected_entries = sorted(target_dir.iterdir(), key=lambda p: p.name.lower())
    for entry in collected_entries:
        try:
            resolved = entry.resolve()
            if resolved != root and root not in resolved.parents:
                continue
            is_dir = entry.is_dir()
            rel_path = str(resolved.relative_to(root)).replace(os.sep, "/")
            size = None if is_dir else entry.stat().st_size
            items.append(
                {
                    "name": entry.name,
                    "path": rel_path,
                    "type": "dir" if is_dir else "file",
                    "size": size,
                }
            )
        except OSError:
            continue

    items.sort(key=lambda item: (item["type"] != "dir", str(item["name"]).lower()))

    rel_current = "" if target_dir == root else str(target_dir.relative_to(root)).replace(os.sep, "/")
    return {
        "root": str(root),
        "path": rel_current,
        "items": items,
    }


@skill_router.get("/{skill_id}/files/content")
async def get_skill_file_content(
    skill_id: str,
    path: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_session),
):
    skill = await session.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")

    try:
        root = _resolve_skill_root(skill)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        if skill.source == "custom":
            files = _virtual_skill_files(skill)
        else:
            files = _virtual_package_files(skill, str(exc.detail))
        content = files.get(path)
        if content is None:
            raise HTTPException(404, "File not found")
        return {
            "path": path,
            "language": _guess_language(path),
            "size": len(content.encode("utf-8")),
            "truncated": False,
            "binary": False,
            "content": content,
        }

    target_file = _safe_join_under_root(root, path)
    if not target_file.exists() or not target_file.is_file():
        raise HTTPException(404, "File not found")

    if target_file.suffix.lower() not in _TEXT_FILE_EXTENSIONS:
        raise HTTPException(415, "Unsupported file type for preview")

    max_bytes = 512 * 1024
    data = target_file.read_bytes()
    if b"\x00" in data[: min(len(data), 4096)]:
        raise HTTPException(415, "Binary file is not supported for preview")

    truncated = len(data) > max_bytes
    preview_bytes = data[:max_bytes]
    content = preview_bytes.decode("utf-8", errors="replace")
    rel_path = str(target_file.relative_to(root)).replace(os.sep, "/")

    return {
        "path": rel_path,
        "language": _guess_language(target_file.name),
        "size": len(data),
        "truncated": truncated,
        "binary": False,
        "content": content,
    }
