import json
import re
from typing import Optional

META_RE = re.compile(r"<!--crawler_meta:(.*?)-->", re.DOTALL)


def parse_job_description(description: Optional[str]) -> tuple[str, list[str]]:
    raw = (description or "").strip()
    if not raw:
        return "", []

    match = META_RE.search(raw)
    if not match:
        return raw, []

    meta_text = (match.group(1) or "").strip()
    target_sections: list[str] = []
    if meta_text:
        try:
            meta = json.loads(meta_text)
            values = meta.get("target_sections", []) if isinstance(meta, dict) else []
            if isinstance(values, list):
                target_sections = [str(item).strip() for item in values if str(item).strip()]
        except Exception:
            target_sections = []

    clean_description = META_RE.sub("", raw).strip()
    return clean_description, target_sections


def build_job_description(display_description: Optional[str], target_sections: list[str]) -> str:
    sections = [str(item).strip() for item in target_sections if str(item).strip()]
    description = (display_description or "").strip()
    meta = json.dumps({"target_sections": sections}, ensure_ascii=False, separators=(",", ":"))
    meta_comment = f"<!--crawler_meta:{meta}-->"
    return f"{description}\n{meta_comment}".strip()
