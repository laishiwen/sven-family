from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
import uuid


def gen_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.utcnow()


# ─── Provider / Model ──────────────────────────────────────────────────────────

class Provider(SQLModel, table=True):
    __tablename__ = "providers"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    provider_type: str  # openai | anthropic | ollama | custom
    base_url: Optional[str] = None
    api_key_encrypted: Optional[str] = None
    gateway_type: Optional[str] = None
    gateway_config_json: Optional[str] = None  # JSON
    enabled: bool = True
    health_status: str = "unknown"  # healthy | unhealthy | unknown
    last_checked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    models: List["Model"] = Relationship(back_populates="provider")


class Model(SQLModel, table=True):
    __tablename__ = "models"
    id: str = Field(default_factory=gen_id, primary_key=True)
    provider_id: str = Field(foreign_key="providers.id")
    name: str
    model_id: str
    source_type: str = "api"  # api | local | gateway
    gateway_model_id: Optional[str] = None
    context_window: int = 4096
    supports_vision: bool = False
    supports_function_call: bool = False
    owned_by: Optional[str] = None  # e.g. "OpenAI", "Anthropic", "Azure OpenAI"
    cost_per_input_token: float = 0.0
    cost_per_output_token: float = 0.0
    memory_enabled: bool = False
    enabled: bool = True
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    provider: Optional[Provider] = Relationship(back_populates="models")


# ─── Agent ─────────────────────────────────────────────────────────────────────

class Agent(SQLModel, table=True):
    __tablename__ = "agents"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    description: Optional[str] = None
    model_id: Optional[str] = Field(default=None, foreign_key="models.id")
    system_prompt_type: str = "none"  # none | template | custom
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2048
    tool_ids_json: str = "[]"  # JSON array
    skill_ids_json: str = "[]"  # JSON array
    prompt_ids_json: str = "[]"  # JSON array
    mcp_server_ids_json: str = "[]"  # JSON array
    kb_ids_json: str = "[]"  # JSON array
    sub_agent_ids_json: str = "[]"  # JSON array of agent IDs
    working_directory: Optional[str] = None  # optional working dir override
    hitl_enabled: bool = False  # human-in-the-loop master switch
    hitl_approval_level: str = "tool_call"  # tool_call | mcp_call | all
    sub_agent_max_depth: int = 1  # max recursion depth for subagents
    memory_enabled: bool = True
    structured_output_enabled: bool = False
    structured_output_schema_json: str = "{}"  # JSON Schema
    enabled: bool = True
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Prompt(SQLModel, table=True):
    __tablename__ = "prompts"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    description: Optional[str] = None
    content: str
    tags_json: str = "[]"
    source: str = "custom"  # custom | hub
    enabled: bool = True
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


# ─── Tool / Skill ──────────────────────────────────────────────────────────────

class Tool(SQLModel, table=True):
    __tablename__ = "tools"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    description: Optional[str] = None
    tool_type: str = "python"  # python | http | web_search | file_io | cli
    parameters_schema_json: str = "{}"  # JSON Schema
    code_content: Optional[str] = None  # for python type
    http_config_json: Optional[str] = None  # for http / web_search type
    is_builtin: bool = False
    enabled: bool = True
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Skill(SQLModel, table=True):
    __tablename__ = "skills"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    description: Optional[str] = None
    skill_type: str = "prompt"  # prompt | chain
    content_json: str = "{}"  # JSON
    source: str = "custom"  # custom | package
    package_name: Optional[str] = None  # npm package name for source=package
    enabled: bool = True
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class SkillsHubItem(SQLModel, table=True):
    __tablename__ = "skills_hub_items"
    id: str = Field(default_factory=gen_id, primary_key=True)
    skill_name: str        # e.g. "find-skills"
    owner: str             # e.g. "vercel-labs"
    repo: str              # e.g. "skills"
    package_ref: str       # e.g. "vercel-labs/skills@find-skills"  (unique)
    source_url: str        # e.g. "https://skills.sh/vercel-labs/skills/find-skills"
    install_count: Optional[str] = None   # "1.1M"
    description: Optional[str] = None
    rank: int = 0
    synced_at: datetime = Field(default_factory=now)


# ─── MCP Server ────────────────────────────────────────────────────────────────

class MCPServer(SQLModel, table=True):
    __tablename__ = "mcp_servers"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    description: Optional[str] = None
    transport: str = "stdio"  # stdio | http | sse
    command: Optional[str] = None  # for stdio
    args_json: str = "[]"  # JSON
    url: Optional[str] = None  # for http/sse
    env_json: str = "{}"  # JSON
    capabilities_json: str = "[]"  # JSON
    token_usage_json: str = "{}"  # JSON
    health_status: str = "unknown"
    last_checked_at: Optional[datetime] = None
    enabled: bool = True
    source: Optional[str] = Field(default="custom")  # hub | custom | builtin
    is_builtin: bool = False
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


# ─── Channel ──────────────────────────────────────────────────────────────────

class Channel(SQLModel, table=True):
    __tablename__ = "channels"
    id: str = Field(default_factory=gen_id, primary_key=True)
    channel_type: str  # email | lark | telegram | facebook | whatsapp | discord | slack
    name: str
    description: Optional[str] = None
    config_json: str = "{}"  # API keys, webhook secrets, tokens
    agent_id: Optional[str] = Field(default=None, foreign_key="agents.id")
    webhook_url: Optional[str] = None
    enabled: bool = True
    health_status: str = "unknown"
    last_checked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


# ─── Knowledge Base / RAG ──────────────────────────────────────────────────────

class KnowledgeBase(SQLModel, table=True):
    __tablename__ = "knowledge_bases"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    description: Optional[str] = None
    embedding_model_id: Optional[str] = Field(default=None, foreign_key="models.id")
    embedding_provider_type: Optional[str] = None
    reranker_model_id: Optional[str] = Field(default=None, foreign_key="models.id")
    chunk_strategy: str = "sentence"
    chunk_size: int = 512
    chunk_overlap: int = 50
    metadata_mode: str = "auto"
    metadata_template_json: str = "{}"
    parser_config_json: str = "{}"
    retrieval_config_json: str = "{}"
    retrieval_top_k: int = 5
    doc_count: int = 0
    chunk_count: int = 0
    status: str = "ready"  # ready | ingesting | error
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    documents: List["KBDocument"] = Relationship(back_populates="knowledge_base")


class KBDocument(SQLModel, table=True):
    __tablename__ = "kb_documents"
    id: str = Field(default_factory=gen_id, primary_key=True)
    kb_id: str = Field(foreign_key="knowledge_bases.id")
    filename: str
    file_path: str
    file_size: int = 0
    status: str = "pending"  # pending | processing | done | error
    chunk_count: int = 0
    error_msg: Optional[str] = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    knowledge_base: Optional[KnowledgeBase] = Relationship(back_populates="documents")


# ─── Dataset ───────────────────────────────────────────────────────────────────

class Dataset(SQLModel, table=True):
    __tablename__ = "datasets"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    description: Optional[str] = None
    file_path: Optional[str] = None
    output_path: Optional[str] = None
    row_count: int = 0
    field_mapping_json: str = "{}"  # {instruction, input, output} field names
    processing_config_json: str = "{}"
    split_config_json: str = "{}"
    format: str = "jsonl"  # jsonl | csv | parquet
    status: str = "ready"
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


# ─── Chat / Session ────────────────────────────────────────────────────────────

class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_sessions"
    id: str = Field(default_factory=gen_id, primary_key=True)
    title: str = "New Chat"
    mode: str = "model"  # model | agent
    agent_id: Optional[str] = Field(default=None, foreign_key="agents.id")
    model_id: Optional[str] = Field(default=None, foreign_key="models.id")
    reasoning_mode: str = "standard"  # standard | deep
    stream_output: bool = False
    memory_enabled: bool = False
    search_enabled: bool = False
    search_provider: Optional[str] = None
    search_config_json: str = "{}"
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    messages: List["ChatMessage"] = Relationship(back_populates="session")


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"
    id: str = Field(default_factory=gen_id, primary_key=True)
    session_id: str = Field(foreign_key="chat_sessions.id")
    role: str  # user | assistant | system | tool
    content: str
    tool_calls_json: Optional[str] = None  # JSON
    meta_json: Optional[str] = None  # JSON: tokens, latency etc.
    created_at: datetime = Field(default_factory=now)
    session: Optional[ChatSession] = Relationship(back_populates="messages")


# ─── Run / Trace ───────────────────────────────────────────────────────────────

class Run(SQLModel, table=True):
    __tablename__ = "runs"
    id: str = Field(default_factory=gen_id, primary_key=True)
    session_id: str = Field(foreign_key="chat_sessions.id")
    agent_id: Optional[str] = None
    model_id: Optional[str] = None
    trace_id: Optional[str] = None  # Langfuse trace id
    trace_provider: Optional[str] = None
    status: str = "running"  # running | completed | failed
    input_tokens: int = 0
    output_tokens: int = 0
    total_cost: float = 0.0
    latency_ms: int = 0
    error_msg: Optional[str] = None
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=now)
    completed_at: Optional[datetime] = None
    steps: List["RunStep"] = Relationship(back_populates="run")


class RunStep(SQLModel, table=True):
    __tablename__ = "run_steps"
    id: str = Field(default_factory=gen_id, primary_key=True)
    run_id: str = Field(foreign_key="runs.id")
    parent_step_id: Optional[str] = None
    step_index: int = 0
    step_type: str  # llm_call | tool_call | retrieval | mcp_call
    name: str
    input_json: Optional[str] = None
    output_json: Optional[str] = None
    metadata_json: str = "{}"
    status: str = "completed"
    latency_ms: int = 0
    created_at: datetime = Field(default_factory=now)
    run: Optional[Run] = Relationship(back_populates="steps")


class RunScore(SQLModel, table=True):
    __tablename__ = "run_scores"
    id: str = Field(default_factory=gen_id, primary_key=True)
    run_id: str = Field(foreign_key="runs.id")
    step_id: Optional[str] = Field(default=None, foreign_key="run_steps.id")
    name: str
    score_type: str = "numeric"  # numeric | boolean | categorical
    value: str
    comment: Optional[str] = None
    source: str = "system"  # user | evaluator | system
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=now)


class RunArtifact(SQLModel, table=True):
    __tablename__ = "run_artifacts"
    id: str = Field(default_factory=gen_id, primary_key=True)
    run_id: str = Field(foreign_key="runs.id")
    step_id: Optional[str] = Field(default=None, foreign_key="run_steps.id")
    artifact_type: str
    name: str
    content: str
    content_type: str = "text/plain"
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=now)


class RunEvent(SQLModel, table=True):
    __tablename__ = "run_events"
    id: str = Field(default_factory=gen_id, primary_key=True)
    run_id: str = Field(foreign_key="runs.id")
    step_id: Optional[str] = Field(default=None, foreign_key="run_steps.id")
    event_type: str  # token | reasoning | log | warning | error
    content: str
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=now)


# ─── LoRA / Fine-tune ──────────────────────────────────────────────────────────

class FineTuneJob(SQLModel, table=True):
    __tablename__ = "fine_tune_jobs"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    base_model_id: str = Field(foreign_key="models.id")
    dataset_id: str = Field(foreign_key="datasets.id")
    config_json: str = "{}"  # LoRA hyperparams
    status: str = "pending"  # pending | running | completed | failed
    progress: int = 0
    log_path: Optional[str] = None
    output_path: Optional[str] = None
    registered_model_id: Optional[str] = None
    error_msg: Optional[str] = None
    created_at: datetime = Field(default_factory=now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# ─── Usage Stats ───────────────────────────────────────────────────────────────

class UsageDailyStat(SQLModel, table=True):
    __tablename__ = "usage_daily_stats"
    id: str = Field(default_factory=gen_id, primary_key=True)
    date: str  # YYYY-MM-DD
    scope: str  # provider | model | agent
    scope_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_cost: float = 0.0
    request_count: int = 0
    error_count: int = 0


class RuntimeConfig(SQLModel, table=True):
    __tablename__ = "runtime_configs"
    id: str = Field(default_factory=gen_id, primary_key=True)
    key: str  # env var name
    source: str = "default"  # system | file | default
    description: Optional[str] = None
    is_sensitive: bool = False
    group: str = "app"


# Store for known services
class StoreService(SQLModel, table=True):
    __tablename__ = "store_services"
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    service_type: str  # sqlite | redis | milvus | custom
    category: str = "database"
    connection_url: Optional[str] = None
    config_json: str = "{}"
    enabled_capabilities_json: str = "[]"
    health_status: str = "unknown"
    last_checked_at: Optional[datetime] = None
    is_default: bool = False
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class StoreOperationJob(SQLModel, table=True):
    __tablename__ = "store_operation_jobs"
    id: str = Field(default_factory=gen_id, primary_key=True)
    service_id: Optional[str] = None
    source_service_id: Optional[str] = None
    target_service_id: Optional[str] = None
    operation_type: str  # export | import | migrate
    status: str = "pending"  # pending | running | completed | failed
    payload_json: str = "{}"
    artifact_path: Optional[str] = None
    error_msg: Optional[str] = None
    created_at: datetime = Field(default_factory=now)
    completed_at: Optional[datetime] = None


# ─── Memory ────────────────────────────────────────────────────────────────────

class Memory(SQLModel, table=True):
    __tablename__ = "memories"
    id: str = Field(default_factory=gen_id, primary_key=True)
    session_id: Optional[str] = Field(default=None, foreign_key="chat_sessions.id")
    scope: str = "session"  # session | agent | model
    scope_id: Optional[str] = None  # agent_id or model_id or session_id
    key: str  # short label for the memory fact
    value: str  # the memory content
    created_at: datetime = Field(default_factory=now)


# Export all models for init
all_models = [
    Provider, Model, Agent, Prompt, Tool, Skill, SkillsHubItem, MCPServer,
    KnowledgeBase, KBDocument, Dataset, ChatSession, ChatMessage, Memory,
    Run, RunStep, RunScore, RunArtifact, RunEvent, FineTuneJob,
    UsageDailyStat, RuntimeConfig, StoreService, StoreOperationJob
]
