from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models import Model, Provider


DEFAULT_EMBEDDINGS = {
    "openai": [
        ("text-embedding-3-small", "OpenAI Text Embedding 3 Small", True),
        ("text-embedding-3-large", "OpenAI Text Embedding 3 Large", False),
    ],
    "ollama": [
        ("nomic-embed-text", "Nomic Embed Text", True),
        ("bge-m3", "BGE M3", False),
    ],
    "custom": [],
    "anthropic": [],
}

DEFAULT_RERANKERS = {
    "openai": [],
    "ollama": [
        ("bge-reranker-v2-m3", "BGE Reranker v2 M3", True),
    ],
    "custom": [],
    "anthropic": [],
}


def _option(value: str, label: str, description: str | None = None, provider_type: str | None = None, is_default: bool = False) -> dict:
    return {
        "value": value,
        "label": label,
        "description": description,
        "provider_type": provider_type,
        "is_default": is_default,
    }


def _merge_model_options(existing: dict[str, dict], models: Iterable[Model], provider_type: str, kind: str) -> None:
    for model in models:
        model_id = model.model_id.lower()
        is_embedding = "embed" in model_id or "embedding" in model_id
        is_reranker = "rerank" in model_id
        if kind == "embedding" and not is_embedding:
            continue
        if kind == "reranker" and not is_reranker:
            continue
        existing[model.model_id] = _option(
            model.model_id,
            model.name,
            f"来自已配置 provider {provider_type} 的模型",
            provider_type,
        )


async def build_capability_registry(session: AsyncSession) -> dict:
    providers_result = await session.exec(select(Provider))
    models_result = await session.exec(select(Model).where(Model.enabled == True))
    providers = providers_result.all()
    models = models_result.all()

    models_by_provider: dict[str, list[Model]] = defaultdict(list)
    provider_type_by_id = {provider.id: provider.provider_type for provider in providers}
    for model in models:
        provider_type = provider_type_by_id.get(model.provider_id, "custom")
        models_by_provider[provider_type].append(model)

    embedding_options: dict[str, dict] = {}
    reranker_options: dict[str, dict] = {}

    for provider_type, options in DEFAULT_EMBEDDINGS.items():
        for value, label, is_default in options:
            embedding_options[value] = _option(
                value,
                label,
                "默认推荐嵌入模型",
                provider_type,
                is_default,
            )

    for provider_type, options in DEFAULT_RERANKERS.items():
        for value, label, is_default in options:
            reranker_options[value] = _option(
                value,
                label,
                "默认推荐重排模型",
                provider_type,
                is_default,
            )

    for provider_type, provider_models in models_by_provider.items():
        _merge_model_options(embedding_options, provider_models, provider_type, "embedding")
        _merge_model_options(reranker_options, provider_models, provider_type, "reranker")

    return {
        "file_formats": [
            _option("pdf", "PDF", "支持提取多页文档文本", is_default=True),
            _option("docx", "Word DOCX", "适合知识文档和说明书"),
            _option("txt", "Plain Text", "轻量纯文本导入"),
            _option("md", "Markdown", "适合技术文档和 README"),
            _option("html", "HTML", "网页导入与离线归档"),
            _option("csv", "CSV", "结构化文本或 FAQ 数据"),
            _option("tsv", "TSV", "制表符分隔的结构化文本"),
            _option("json", "JSON", "结构化知识与元数据注入"),
            _option("xlsx", "Excel XLSX", "适合表格型知识与清单"),
            _option("pptx", "PowerPoint PPTX", "适合方案、培训与演示文档"),
        ],
        "preprocessors": [
            _option("native", "标准解析", "直接抽取正文内容并建立索引，适合常规文档", is_default=True),
            _option("markitdown", "增强解析", "先做结构清洗与版式整理，再进入索引流程"),
        ],
        "chunk_strategies": [
            _option("sentence", "按句切分", "适合通用文档", is_default=True),
            _option("paragraph", "按段切分", "适合长文本上下文保持"),
            _option("token", "按 token 切分", "适合精细控制上下文窗口"),
            _option("markdown", "按 Markdown 结构切分", "保留标题层级与代码块"),
        ],
        "metadata_modes": [
            _option("auto", "自动注入", "自动写入文件名、路径、时间戳", is_default=True),
            _option("custom", "自定义模板", "通过 metadata_template_json 注入自定义字段"),
            _option("disabled", "禁用", "不写入额外元数据"),
        ],
        "embeddings": list(embedding_options.values()),
        "rerankers": list(reranker_options.values()),
        "search_providers": [
            _option("tavily", "Tavily", "适合 agent 搜索增强", is_default=settings.SEARCH_DEFAULT_PROVIDER == "tavily"),
            _option("brave", "Brave Search", "开源生态常见接入", is_default=settings.SEARCH_DEFAULT_PROVIDER == "brave"),
            _option("serpapi", "SerpAPI", "通用搜索 API 聚合", is_default=settings.SEARCH_DEFAULT_PROVIDER == "serpapi"),
        ],
        "observability_backends": [
            _option("langfuse", "Langfuse", "优先推荐，支持 trace / generation / score", is_default=True),
            _option("opentelemetry", "OpenTelemetry", "便于导出到多种 APM/Tracing 平台"),
            _option("phoenix", "Arize Phoenix", "面向 LLM 评估与观测"),
            _option("openlit", "OpenLIT", "开源 LLM telemetry"),
        ],
        "store_types": [
            _option("sqlite", "SQLite", "本地默认数据库", is_default=True),
            _option("postgresql", "PostgreSQL", "关系型数据库"),
            _option("mysql", "MySQL", "关系型数据库"),
            _option("qdrant", "Qdrant", "向量数据库"),
            _option("milvus", "Milvus", "向量数据库"),
            _option("s3", "S3 Compatible", "对象存储，用于文档与导出包"),
        ],
        "defaults": {
            "rag": {
                "preprocessor": "native",
                "chunk_strategy": "sentence",
                "chunk_size": 512,
                "chunk_overlap": 50,
                "metadata_mode": "auto",
                "retrieval_top_k": 5,
                "search_provider": settings.SEARCH_DEFAULT_PROVIDER,
            },
            "chat": {
                "reasoning_mode": "standard",
                "search_enabled": False,
                "search_provider": settings.SEARCH_DEFAULT_PROVIDER,
            },
        },
    }


async def build_provider_capabilities(session: AsyncSession, provider_type: str) -> dict:
    registry = await build_capability_registry(session)
    embeddings = [item for item in registry["embeddings"] if item.get("provider_type") in (provider_type, None)]
    rerankers = [item for item in registry["rerankers"] if item.get("provider_type") in (provider_type, None)]
    return {
        "provider_type": provider_type,
        "embeddings": embeddings,
        "rerankers": rerankers,
        "defaults": registry["defaults"],
    }