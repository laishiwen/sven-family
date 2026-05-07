import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPage from "./AgentsPage";

const apiMocks = vi.hoisted(() => ({
  listAgents: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  listProviders: vi.fn(),
  listPrompts: vi.fn(),
  listModels: vi.fn(),
  listTools: vi.fn(),
  listSkills: vi.fn(),
  listMcp: vi.fn(),
  listRag: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  addToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  agentsApi: {
    list: apiMocks.listAgents,
    create: apiMocks.createAgent,
    update: apiMocks.updateAgent,
    delete: apiMocks.deleteAgent,
  },
  providersApi: {
    list: apiMocks.listProviders,
  },
  modelsApi: {
    list: apiMocks.listModels,
  },
  promptsApi: {
    list: apiMocks.listPrompts,
  },
  toolsApi: {
    list: apiMocks.listTools,
  },
  skillsApi: {
    list: apiMocks.listSkills,
  },
  mcpApi: {
    list: apiMocks.listMcp,
  },
  ragApi: {
    list: apiMocks.listRag,
  },
}));

vi.mock("@/stores/toastStore", () => ({
  useToastStore: (selector: any) => selector({ addToast: toastMocks.addToast }),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <AgentsPage />
    </QueryClientProvider>,
  );
}

function setupListMocks() {
  apiMocks.listAgents.mockResolvedValue({
    data: [
      {
        id: "a1",
        name: "Agent Alpha",
        description: "alpha desc",
        model_id: "m1",
        system_prompt_type: "none",
        system_prompt: null,
        temperature: 0.7,
        max_tokens: 2048,
        tool_ids_json: "[]",
        skill_ids_json: "[]",
        prompt_ids_json: "[]",
        mcp_server_ids_json: "[]",
        kb_ids_json: "[]",
        structured_output_enabled: false,
        structured_output_schema_json: "{}",
        enabled: true,
        created_at: "2026-04-19T10:00:00Z",
      },
      {
        id: "b1",
        name: "Agent Beta",
        description: "beta desc",
        model_id: "m2",
        system_prompt_type: "none",
        system_prompt: null,
        temperature: 0.7,
        max_tokens: 2048,
        tool_ids_json: "[]",
        skill_ids_json: "[]",
        prompt_ids_json: "[]",
        mcp_server_ids_json: "[]",
        kb_ids_json: "[]",
        structured_output_enabled: true,
        structured_output_schema_json: '{"type":"object"}',
        enabled: true,
        created_at: "2026-04-19T10:00:00Z",
      },
    ],
  });

  apiMocks.listProviders.mockResolvedValue({ data: [] });
  apiMocks.listModels.mockResolvedValue({
    data: [
      { id: "m1", name: "Model 1", model_id: "model-1" },
      { id: "m2", name: "Model 2", model_id: "model-2" },
    ],
  });
  apiMocks.listPrompts.mockResolvedValue({ data: [] });
  apiMocks.listTools.mockResolvedValue({ data: [] });
  apiMocks.listSkills.mockResolvedValue({ data: [] });
  apiMocks.listMcp.mockResolvedValue({ data: [] });
  apiMocks.listRag.mockResolvedValue({ data: [] });
}

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupListMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("编辑不同Agent时表单会切换到正确数据", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Agent Alpha");
    await screen.findByText("Agent Beta");

    await user.click(screen.getByRole("button", { name: "编辑 Agent Alpha" }));
    const nameInput = await screen.findByLabelText("名称 *");
    expect(nameInput).toHaveValue("Agent Alpha");

    await user.click(screen.getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "编辑 Agent Beta" }));
    expect(await screen.findByLabelText("名称 *")).toHaveValue("Agent Beta");
  });

  it("新建失败时显示错误提示并可恢复提交状态", async () => {
    const user = userEvent.setup();
    apiMocks.createAgent.mockRejectedValue({
      response: { data: { detail: "创建失败: 名称重复" } },
    });

    renderPage();

    await screen.findByText("Agent Alpha");
    await user.click(screen.getByRole("button", { name: "新建 Agent" }));

    const nameInput = await screen.findByLabelText("名称 *");
    await user.type(nameInput, "New Agent");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(apiMocks.createAgent).toHaveBeenCalledTimes(1);
      expect(toastMocks.addToast).toHaveBeenCalledWith({
        type: "error",
        message: "创建失败: 名称重复",
      });
    });

    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("编辑成功后关闭弹窗并触发列表刷新", async () => {
    const user = userEvent.setup();
    apiMocks.updateAgent.mockResolvedValue({ data: {} });

    renderPage();

    await screen.findByText("Agent Alpha");
    await user.click(screen.getByRole("button", { name: "编辑 Agent Alpha" }));

    const nameInput = await screen.findByLabelText("名称 *");
    await user.clear(nameInput);
    await user.type(nameInput, "Agent Alpha Updated");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(apiMocks.updateAgent).toHaveBeenCalledTimes(1);
      expect(apiMocks.listAgents).toHaveBeenCalledTimes(2);
      expect(toastMocks.addToast).toHaveBeenCalledWith({
        type: "success",
        message: "Agent 更新成功",
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    });
  });

  it("新建 Agent 时结构化输出默认关闭并提交 false", async () => {
    const user = userEvent.setup();
    apiMocks.createAgent.mockResolvedValue({ data: {} });

    renderPage();

    await screen.findByText("Agent Alpha");
    await user.click(screen.getByRole("button", { name: "新建 Agent" }));

    expect(screen.queryByLabelText("输出 Schema (JSON)")).toBeNull();

    await user.type(await screen.findByLabelText("名称 *"), "Agent New");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(apiMocks.createAgent).toHaveBeenCalledTimes(1);
      expect(apiMocks.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          structured_output_enabled: false,
        }),
      );
    });
  });

  it("开启结构化输出后，非法 Schema 会阻止提交", async () => {
    const user = userEvent.setup();

    renderPage();

    await screen.findByText("Agent Alpha");
    await user.click(screen.getByRole("button", { name: "新建 Agent" }));

    await user.type(await screen.findByLabelText("名称 *"), "Agent Invalid");
    await user.click(screen.getByRole("switch"));

    const schemaInput = await screen.findByLabelText("输出 Schema (JSON)");
    await user.clear(schemaInput);
    await user.type(schemaInput, "invalid-json");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(apiMocks.createAgent).not.toHaveBeenCalled();
    expect(
      await screen.findByText("结构化输出 Schema 必须是合法 JSON 对象"),
    ).toBeInTheDocument();
  });
});
