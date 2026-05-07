from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class BaseResponse(BaseModel):
    success: bool = True
    message: str = "ok"


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int = 1
    page_size: int = 20


# Provider schemas
class ProviderCreate(BaseModel):
    name: str
    provider_type: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    gateway_type: Optional[str] = None
    gateway_config_json: Optional[str] = None


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    enabled: Optional[bool] = None
    gateway_type: Optional[str] = None
    gateway_config_json: Optional[str] = None


class ProviderResponse(BaseModel):
    id: str
    name: str
    provider_type: str
    base_url: Optional[str]
    gateway_type: Optional[str]
    enabled: bool
    health_status: str
    last_checked_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# Model schemas
class ModelCreate(BaseModel):
    provider_id: str
    name: str
    model_id: str
    source_type: str = "api"
    gateway_model_id: Optional[str] = None
    context_window: int = 4096
    supports_vision: bool = False
    supports_function_call: bool = False
    cost_per_input_token: float = 0.0
    cost_per_output_token: float = 0.0


class ModelResponse(BaseModel):
    id: str
    provider_id: str
    name: str
    model_id: str
    source_type: str
    context_window: int
    supports_vision: bool
    supports_function_call: bool
    owned_by: Optional[str] = None
    memory_enabled: bool = False
    enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Agent schemas
class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    model_id: Optional[str] = None
    system_prompt_type: str = "none"
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2048
    tool_ids_json: str = "[]"
    skill_ids_json: str = "[]"
    prompt_ids_json: str = "[]"
    mcp_server_ids_json: str = "[]"
    kb_ids_json: str = "[]"
    sub_agent_ids_json: str = "[]"
    working_directory: Optional[str] = None
    hitl_enabled: bool = False
    hitl_approval_level: str = "tool_call"
    sub_agent_max_depth: int = 1
    memory_enabled: bool = True
    structured_output_enabled: bool = False
    structured_output_schema_json: str = "{}"


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    model_id: Optional[str] = None
    system_prompt_type: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    tool_ids_json: Optional[str] = None
    skill_ids_json: Optional[str] = None
    prompt_ids_json: Optional[str] = None
    mcp_server_ids_json: Optional[str] = None
    kb_ids_json: Optional[str] = None
    sub_agent_ids_json: Optional[str] = None
    working_directory: Optional[str] = None
    hitl_enabled: Optional[bool] = None
    hitl_approval_level: Optional[str] = None
    sub_agent_max_depth: Optional[int] = None
    memory_enabled: Optional[bool] = None
    structured_output_enabled: Optional[bool] = None
    structured_output_schema_json: Optional[str] = None
    enabled: Optional[bool] = None


class AgentResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    model_id: Optional[str]
    system_prompt_type: str
    system_prompt: Optional[str]
    temperature: float
    max_tokens: int
    tool_ids_json: str
    skill_ids_json: str
    prompt_ids_json: str
    mcp_server_ids_json: str
    kb_ids_json: str
    sub_agent_ids_json: str
    working_directory: Optional[str] = None
    hitl_enabled: bool = False
    hitl_approval_level: str = "tool_call"
    sub_agent_max_depth: int = 1
    memory_enabled: bool = True
    structured_output_enabled: bool
    structured_output_schema_json: str
    enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PromptCreate(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    tags_json: str = "[]"
    source: str = "custom"
    enabled: bool = True


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    tags_json: Optional[str] = None
    source: Optional[str] = None
    enabled: Optional[bool] = None


class PromptResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    content: str
    tags_json: str
    source: str = "custom"
    enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Tool schemas
class ToolCreate(BaseModel):
    name: str
    description: Optional[str] = None
    tool_type: str = "python"
    parameters_schema_json: str = "{}"
    code_content: Optional[str] = None
    http_config_json: Optional[str] = None


class ToolResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    tool_type: str
    parameters_schema_json: str
    code_content: Optional[str]
    http_config_json: Optional[str]
    is_builtin: bool = False
    enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PromptsHubItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    content: str
    tags: list[str] = []
    category: Optional[str] = None
    author: Optional[str] = None
    votes: int = 0
    type: str = "TEXT"


class PromptsHubResponse(BaseModel):
    query: Optional[str] = None
    count: int
    prompts: list[PromptsHubItem]


# Skill schemas
class SkillCreate(BaseModel):
    name: str
    description: Optional[str] = None
    skill_type: str = "prompt"
    content_json: str = "{}"
    source: str = "custom"
    package_name: Optional[str] = None


class SkillResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    skill_type: str
    content_json: str
    source: str
    package_name: Optional[str]
    enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SkillPackageSearchResult(BaseModel):
    name: str
    version: Optional[str] = None
    description: Optional[str] = None
    package_ref: Optional[str] = None
    source_url: Optional[str] = None
    install_count: Optional[str] = None
    owner: Optional[str] = None
    repo: Optional[str] = None


class SkillInstallRequest(BaseModel):
    package_name: str  # full package_ref e.g. "vercel-labs/skills@find-skills"


class SkillImportRequest(BaseModel):
    folder_path: str


class SkillsHubItemResponse(BaseModel):
    id: str
    skill_name: str
    owner: str
    repo: str
    package_ref: str
    source_url: str
    install_count: Optional[str]
    description: Optional[str]
    rank: int
    synced_at: datetime

    class Config:
        from_attributes = True


# MCP schemas
class MCPServerCreate(BaseModel):
    name: str
    description: Optional[str] = None
    transport: str = "stdio"
    command: Optional[str] = None
    args_json: str = "[]"
    url: Optional[str] = None
    env_json: str = "{}"
    source: Optional[str] = "custom"


class MCPServerUpdate(BaseModel):
    """Only the fields a user can edit through the UI."""
    name: Optional[str] = None
    description: Optional[str] = None
    transport: Optional[str] = None
    command: Optional[str] = None
    args_json: Optional[str] = None
    url: Optional[str] = None
    env_json: Optional[str] = None
    source: Optional[str] = None


class MCPServerResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    transport: str
    command: Optional[str]
    args_json: str
    url: Optional[str]
    env_json: str
    capabilities_json: str
    token_usage_json: str
    health_status: str
    enabled: bool
    source: Optional[str] = "custom"
    is_builtin: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# Channel schemas
class ChannelCreate(BaseModel):
    channel_type: str  # email | lark | telegram | facebook | whatsapp | discord | slack
    name: str
    description: Optional[str] = None
    config_json: str = "{}"
    agent_id: Optional[str] = None


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config_json: Optional[str] = None
    agent_id: Optional[str] = None
    enabled: Optional[bool] = None


class ChannelResponse(BaseModel):
    id: str
    channel_type: str
    name: str
    description: Optional[str]
    config_json: str
    agent_id: Optional[str]
    webhook_url: Optional[str]
    enabled: bool
    health_status: str
    last_checked_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# KnowledgeBase schemas
class KnowledgeBaseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    embedding_model_id: Optional[str] = None
    embedding_provider_type: Optional[str] = None
    reranker_model_id: Optional[str] = None
    chunk_strategy: str = "sentence"
    chunk_size: int = 512
    chunk_overlap: int = 50
    metadata_mode: str = "auto"
    metadata_template_json: str = "{}"
    parser_config_json: str = "{}"
    retrieval_config_json: str = "{}"
    retrieval_top_k: int = 5


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    embedding_model_id: Optional[str]
    embedding_provider_type: Optional[str]
    reranker_model_id: Optional[str]
    chunk_strategy: str
    chunk_size: int
    chunk_overlap: int
    metadata_mode: str
    metadata_template_json: str
    parser_config_json: str
    retrieval_config_json: str
    retrieval_top_k: int
    doc_count: int
    chunk_count: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# Dataset schemas
class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    field_mapping_json: str = "{}"
    processing_config_json: str = "{}"
    split_config_json: str = "{}"
    format: str = "jsonl"


class DatasetResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    file_path: Optional[str]
    output_path: Optional[str]
    row_count: int
    field_mapping_json: str
    processing_config_json: str
    split_config_json: str
    format: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# Chat schemas
class ChatSessionCreate(BaseModel):
    title: str = "New Chat"
    mode: str = "model"
    agent_id: Optional[str] = None
    model_id: Optional[str] = None
    reasoning_mode: str = "standard"
    stream_output: bool = False
    memory_enabled: bool = False
    search_enabled: bool = False
    search_provider: Optional[str] = None
    search_config_json: str = "{}"


class ChatMessageCreate(BaseModel):
    role: str
    content: str
    think: Optional[bool] = None


class ChatSessionResponse(BaseModel):
    id: str
    title: str
    mode: str
    agent_id: Optional[str]
    model_id: Optional[str]
    reasoning_mode: str
    stream_output: bool
    memory_enabled: bool = False
    search_enabled: bool
    search_provider: Optional[str]
    search_config_json: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None

    class Config:
        from_attributes = True


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


# Run schemas
class RunResponse(BaseModel):
    id: str
    session_id: str
    agent_id: Optional[str]
    model_id: Optional[str]
    trace_id: Optional[str]
    trace_provider: Optional[str]
    status: str
    input_tokens: int
    output_tokens: int
    total_cost: float
    latency_ms: int
    error_msg: Optional[str] = None
    completed_at: Optional[datetime] = None
    score_count: int = 0
    artifact_count: int = 0
    event_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


# FineTune schemas
class FineTuneJobCreate(BaseModel):
    name: str
    base_model_id: str
    dataset_id: str
    config_json: str = "{}"


class FineTuneJobResponse(BaseModel):
    id: str
    name: str
    base_model_id: str
    dataset_id: str
    config_json: str
    status: str
    progress: int
    log_path: Optional[str]
    output_path: Optional[str]
    registered_model_id: Optional[str]
    error_msg: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# Dashboard schemas
class DashboardOverview(BaseModel):
    total_runs: int
    total_sessions: int
    total_agents: int
    total_models: int
    total_tokens_today: int
    total_cost_today: float
    active_providers: int


class HealthStatus(BaseModel):
    service: str
    status: str
    latency_ms: Optional[int] = None
    error: Optional[str] = None


# Settings schemas
class RuntimeConfigResponse(BaseModel):
    key: str
    source: str
    description: Optional[str]
    is_sensitive: bool
    group: str
    value_preview: Optional[str] = None


class CapabilityOption(BaseModel):
    value: str
    label: str
    description: Optional[str] = None
    provider_type: Optional[str] = None
    is_default: bool = False


class CapabilityRegistryResponse(BaseModel):
    file_formats: list[CapabilityOption]
    preprocessors: list[CapabilityOption]
    chunk_strategies: list[CapabilityOption]
    metadata_modes: list[CapabilityOption]
    embeddings: list[CapabilityOption]
    rerankers: list[CapabilityOption]
    search_providers: list[CapabilityOption]
    observability_backends: list[CapabilityOption]
    store_types: list[CapabilityOption]
    defaults: dict[str, Any]


# StoreService schemas
class StoreServiceCreate(BaseModel):
    name: str
    service_type: str
    category: str = "database"
    connection_url: Optional[str] = None
    config_json: str = "{}"
    enabled_capabilities_json: str = "[]"


class StoreServiceResponse(BaseModel):
    id: str
    name: str
    service_type: str
    category: str
    connection_url: Optional[str]
    config_json: str = "{}"
    enabled_capabilities_json: str = "[]"
    health_status: str
    last_checked_at: Optional[datetime] = None
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True


class StoreOperationRequest(BaseModel):
    service_id: Optional[str] = None
    source_service_id: Optional[str] = None
    target_service_id: Optional[str] = None
    file_path: Optional[str] = None
    include_data: bool = True
    payload_json: str = "{}"


class StoreOperationResponse(BaseModel):
    id: str
    service_id: Optional[str]
    source_service_id: Optional[str]
    target_service_id: Optional[str]
    operation_type: str
    status: str
    payload_json: str
    artifact_path: Optional[str]
    error_msg: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
