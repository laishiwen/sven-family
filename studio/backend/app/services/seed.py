"""Seed built-in tools, MCP servers, and preset agents on first startup."""

from __future__ import annotations

import json
import logging

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Tool, MCPServer, Agent, Prompt
from app.services.builtin_tools import BUILTIN_TOOLS

logger = logging.getLogger(__name__)

BUILTIN_MCP_SERVERS = [
    {
        "id": "builtin-mcp-playwright",
        "name": "Playwright",
        "description": "Browser automation with Playwright. Control Chromium, Firefox, and WebKit browsers.",
        "transport": "stdio",
        "command": "npx",
        "args_json": json.dumps(["-y", "@anthropic/mcp-server-playwright"]),
        "env_json": "{}",
        "source": "builtin",
        "is_builtin": True,
    },
    {
        "id": "builtin-mcp-chrome-devtools",
        "name": "Chrome DevTools",
        "description": "Chrome DevTools Protocol MCP server for browser debugging and inspection.",
        "transport": "stdio",
        "command": "npx",
        "args_json": json.dumps(["-y", "@anthropic/mcp-server-chrome-devtools"]),
        "env_json": "{}",
        "source": "builtin",
        "is_builtin": True,
    },
    {
        "id": "builtin-mcp-brave-search",
        "name": "Brave Search",
        "description": "Brave Search API integration for web and local search. Requires BRAVE_API_KEY env var.",
        "transport": "stdio",
        "command": "npx",
        "args_json": json.dumps(["-y", "@cherry/mcp-brave-search"]),
        "env_json": json.dumps({"BRAVE_API_KEY": ""}),
        "source": "builtin",
        "is_builtin": True,
    },
    {
        "id": "builtin-mcp-fetch",
        "name": "Web Fetch",
        "description": "Retrieves webpage content from URLs and converts to markdown.",
        "transport": "stdio",
        "command": "npx",
        "args_json": json.dumps(["-y", "@cherry/mcp-fetch"]),
        "env_json": "{}",
        "source": "builtin",
        "is_builtin": True,
    },
    {
        "id": "builtin-mcp-filesystem",
        "name": "Filesystem",
        "description": "File system operations via MCP. Configure WORKSPACE_ROOT env var to restrict access.",
        "transport": "stdio",
        "command": "npx",
        "args_json": json.dumps(["-y", "@cherry/mcp-filesystem"]),
        "env_json": json.dumps({"WORKSPACE_ROOT": ""}),
        "source": "builtin",
        "is_builtin": True,
    },
    {
        "id": "builtin-mcp-memory",
        "name": "Memory",
        "description": "Persistent memory based on a local knowledge graph. Configure MEMORY_FILE_PATH env var.",
        "transport": "stdio",
        "command": "npx",
        "args_json": json.dumps(["-y", "@cherry/mcp-memory"]),
        "env_json": json.dumps({"MEMORY_FILE_PATH": ""}),
        "source": "builtin",
        "is_builtin": True,
    },
    {
        "id": "builtin-mcp-sequentialthinking",
        "name": "Sequential Thinking",
        "description": "Structured thinking for reflective problem-solving via sequential thought process.",
        "transport": "stdio",
        "command": "npx",
        "args_json": json.dumps(["-y", "@cherry/mcp-sequentialthinking"]),
        "env_json": "{}",
        "source": "builtin",
        "is_builtin": True,
    },
]

PRESET_AGENT_CATEGORIES = {
    "coding": [
        {"name": "Code Review Assistant", "description": "Reviews code for bugs, security issues, and best practices.", "system_prompt": "You are a senior code reviewer. Analyze code for bugs, security vulnerabilities, performance issues, and adherence to best practices. Provide specific, actionable feedback with code examples."},
        {"name": "Debugging Expert", "description": "Helps identify and fix bugs in code.", "system_prompt": "You are a debugging expert. Analyze error messages, logs, and code to identify root causes. Suggest fixes with clear explanations. Ask clarifying questions when needed."},
        {"name": "API Designer", "description": "Designs RESTful and GraphQL APIs following best practices.", "system_prompt": "You are an API design expert. Design clean, versioned, and well-documented REST and GraphQL APIs. Follow OpenAPI/Swagger standards. Consider authentication, rate limiting, pagination, and error handling."},
        {"name": "Database Architect", "description": "Designs database schemas and optimizes queries.", "system_prompt": "You are a database architect. Design normalized schemas, write efficient queries, and suggest indexing strategies. Consider both SQL and NoSQL approaches."},
        {"name": "DevOps Engineer", "description": "CI/CD, Docker, Kubernetes, and infrastructure help.", "system_prompt": "You are a DevOps engineer. Help with CI/CD pipelines, Docker containerization, Kubernetes orchestration, and cloud infrastructure. Follow infrastructure-as-code principles."},
    ],
    "writing": [
        {"name": "Technical Writer", "description": "Creates clear technical documentation and READMEs.", "system_prompt": "You are a technical writer. Create clear, concise documentation with examples. Structure content for readability. Use appropriate formatting and diagrams (Mermaid) when helpful."},
        {"name": "Blog Post Writer", "description": "Crafts engaging blog posts with SEO optimization.", "system_prompt": "You are a professional blog writer. Write engaging, well-structured posts with compelling titles. Include SEO best practices. Adapt tone to the target audience."},
        {"name": "Copy Editor", "description": "Proofreads and improves writing clarity and grammar.", "system_prompt": "You are a copy editor. Proofread text for grammar, spelling, clarity, and consistency. Suggest improvements while preserving the author's voice."},
        {"name": "Markdown Formatter", "description": "Formats and beautifies Markdown documents.", "system_prompt": "You are a Markdown expert. Format documents with proper headings, lists, tables, code blocks, and links. Ensure consistent style and readability."},
    ],
    "data": [
        {"name": "Data Analyst", "description": "Analyzes data and creates visualizations.", "system_prompt": "You are a data analyst. Analyze datasets, identify trends, and create meaningful visualizations. Write efficient pandas/SQL queries. Present findings clearly with actionable insights."},
        {"name": "SQL Query Optimizer", "description": "Optimizes and writes SQL queries.", "system_prompt": "You are a SQL expert. Write efficient queries, suggest indexes, and optimize complex joins. Support PostgreSQL, MySQL, SQLite, and SQL Server dialects."},
        {"name": "Data Pipeline Builder", "description": "Designs ETL/ELT data pipelines.", "system_prompt": "You are a data engineer. Design robust ETL/ELT pipelines. Consider data quality, monitoring, error handling, and incremental processing patterns."},
    ],
    "ai_ml": [
        {"name": "ML Engineer", "description": "Machine learning model development and deployment.", "system_prompt": "You are an ML engineer. Help with model selection, training, evaluation, and deployment. Consider data preprocessing, feature engineering, and production ML pipelines."},
        {"name": "Prompt Engineer", "description": "Crafts effective prompts for LLMs.", "system_prompt": "You are a prompt engineering expert. Design effective prompts with clear instructions, examples, and constraints. Optimize for consistency, accuracy, and desired output format."},
        {"name": "RAG Architect", "description": "Designs retrieval-augmented generation systems.", "system_prompt": "You are a RAG system architect. Design chunking strategies, embedding models, retrieval pipelines, and reranking approaches for knowledge-grounded AI applications."},
    ],
    "business": [
        {"name": "Product Manager", "description": "Helps define product requirements and roadmaps.", "system_prompt": "You are a product manager. Help define user stories, prioritize features, and create product roadmaps. Use data-driven decision making and consider user experience."},
        {"name": "Business Analyst", "description": "Analyzes business processes and requirements.", "system_prompt": "You are a business analyst. Document requirements, create process flows, and identify improvement opportunities. Bridge the gap between stakeholders and technical teams."},
        {"name": "Marketing Strategist", "description": "Develops marketing strategies and content plans.", "system_prompt": "You are a marketing strategist. Develop targeted campaigns, content strategies, and growth tactics. Consider audience segmentation, channels, and metrics."},
    ],
    "design": [
        {"name": "UI/UX Designer", "description": "Provides UI/UX design guidance and reviews.", "system_prompt": "You are a UI/UX designer. Provide design feedback, suggest layout improvements, and ensure accessibility compliance. Reference established design patterns and principles."},
        {"name": "CSS Expert", "description": "Helps with CSS layouts, animations, and responsive design.", "system_prompt": "You are a CSS expert. Help with complex layouts using Flexbox/Grid, create smooth animations, and ensure responsive design across breakpoints. Prefer Tailwind CSS when applicable."},
    ],
    "general": [
        {"name": "General Assistant", "description": "Versatile assistant for various tasks.", "system_prompt": "You are a helpful AI assistant. Answer questions accurately, provide detailed explanations, and help with a wide range of tasks."},
        {"name": "Translator", "description": "Translates text between multiple languages.", "system_prompt": "You are a professional translator. Provide accurate translations while preserving tone, context, and cultural nuances. Support all major languages with native-level fluency."},
        {"name": "Summarizer", "description": "Summarizes long texts concisely.", "system_prompt": "You are a summarization expert. Extract key points from long texts while preserving important details. Provide structured summaries with bullet points and clear sections."},
        {"name": "Tutor", "description": "Explains concepts and teaches various subjects.", "system_prompt": "You are a patient tutor. Explain complex concepts step-by-step with examples. Adapt explanations to the learner's level. Check understanding and provide practice exercises."},
    ],
}


async def seed_builtin_tools(session: AsyncSession) -> int:
    seeded = 0
    for tool_data in BUILTIN_TOOLS:
        existing = await session.get(Tool, tool_data["id"])
        if existing:
            continue
        session.add(Tool(**tool_data))
        seeded += 1
    if seeded:
        logger.info("Seeded %d built-in tools", seeded)
    return seeded


async def seed_builtin_mcp_servers(session: AsyncSession) -> int:
    seeded = 0
    for mcp_data in BUILTIN_MCP_SERVERS:
        existing = await session.get(MCPServer, mcp_data["id"])
        if existing:
            continue
        session.add(MCPServer(**mcp_data))
        seeded += 1
    if seeded:
        logger.info("Seeded %d built-in MCP servers", seeded)
    return seeded


async def seed_preset_agents(session: AsyncSession) -> int:
    seeded = 0
    for category, agents in PRESET_AGENT_CATEGORIES.items():
        for agent_data in agents:
            safe_name = agent_data["name"].lower().replace(" ", "-")
            agent_id = f"preset-{category}-{safe_name}"
            existing = await session.get(Agent, agent_id)
            if existing:
                continue
            # Create a prompt for each agent
            prompt_id = f"prompt-{agent_id}"
            existing_prompt = await session.get(Prompt, prompt_id)
            if not existing_prompt:
                prompt = Prompt(
                    id=prompt_id,
                    name=f"{agent_data['name']} System Prompt",
                    content=agent_data["system_prompt"],
                    prompt_type="system",
                )
                session.add(prompt)
            agent = Agent(
                id=agent_id,
                name=agent_data["name"],
                description=agent_data["description"],
                system_prompt=agent_data["system_prompt"],
                prompt_ids_json=json.dumps([prompt_id]),
                temperature=0.7,
                max_tokens=4096,
            )
            session.add(agent)
            seeded += 1
    if seeded:
        logger.info("Seeded %d preset agents across %d categories", seeded, len(PRESET_AGENT_CATEGORIES))
    return seeded


async def seed_all(session: AsyncSession) -> dict[str, int]:
    result = {}
    result["tools"] = await seed_builtin_tools(session)
    result["mcp_servers"] = await seed_builtin_mcp_servers(session)
    result["agents"] = await seed_preset_agents(session)
    await session.commit()
    return result
