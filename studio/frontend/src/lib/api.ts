import axios from "axios";
import i18n from "@/i18n";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err.response?.data?.detail;
    const requestUrl = String(err.config?.url || "");
    const isSpeechTranscribe = requestUrl.includes("/speech/transcribe");
    const isCanceled = err.code === "ERR_CANCELED";
    const isExpectedSpeechNotReady =
      isSpeechTranscribe && detail === "model_not_ready";

    if (isCanceled || isExpectedSpeechNotReady) {
      return Promise.reject(err);
    }

    const message = detail || err.message || "Network Error";
    console.error(`API Error: ${message}`);
    return Promise.reject(err);
  },
);

// ── Providers ──────────────────────────────────────────────────────────────────
export const providersApi = {
  list: () => api.get("/providers"),
  create: (data: any) => api.post("/providers", data),
  get: (id: string) => api.get(`/providers/${id}`),
  update: (id: string, data: any) => api.patch(`/providers/${id}`, data),
  delete: (id: string) => api.delete(`/providers/${id}`),
  healthCheck: (id: string) => api.post(`/providers/${id}/health-check`),
  fetchModels: (id: string) => api.post(`/providers/${id}/fetch-models`),
};

export const modelsApi = {
  list: () => api.get("/models"),
  catalog: () => api.get("/models/catalog"),
  create: (data: any) => api.post("/models", data),
  get: (id: string) => api.get(`/models/${id}`),
  delete: (id: string) => api.delete(`/models/${id}`),
  test: (id: string) => api.post(`/models/${id}/test`),
};

// ── Capabilities ──────────────────────────────────────────────────────────────
export const capabilitiesApi = {
  registry: () => api.get("/capabilities"),
  provider: (providerType: string) =>
    api.get(`/capabilities/providers/${providerType}`),
};

// ── Agents ─────────────────────────────────────────────────────────────────────
export const agentsApi = {
  list: () => api.get("/agents"),
  create: (data: any) => api.post("/agents", data),
  get: (id: string) => api.get(`/agents/${id}`),
  update: (id: string, data: any) => api.patch(`/agents/${id}`, data),
  delete: (id: string) => api.delete(`/agents/${id}`),
  testChat: (id: string, message: string) =>
    api.post(`/agents/${id}/test-chat`, { message }),
};

export const promptsApi = {
  list: (q?: string) => api.get("/prompts", { params: q ? { q } : undefined }),
  tags: () => api.get("/prompts/tags"),
  create: (data: any) => api.post("/prompts", data),
  get: (id: string) => api.get(`/prompts/${id}`),
  update: (id: string, data: any) => api.patch(`/prompts/${id}`, data),
  delete: (id: string) => api.delete(`/prompts/${id}`),
  hub: (params?: {
    q?: string;
    category?: string;
    tag?: string;
    page?: number;
    per_page?: number;
  }) => api.get("/prompts/hub", { params }),
  search: (params: {
    q: string;
    category?: string;
    tag?: string;
    page?: number;
    per_page?: number;
  }) => api.get("/prompts/search", { params }),
};

// ── Chat ───────────────────────────────────────────────────────────────────────
export const chatApi = {
  listSessions: () => api.get("/chat/sessions"),
  createSession: (data: any) => api.post("/chat/sessions", data),
  getSession: (id: string) => api.get(`/chat/sessions/${id}`),
  updateSession: (id: string, data: any) =>
    api.patch(`/chat/sessions/${id}`, data),
  deleteSession: (id: string) => api.delete(`/chat/sessions/${id}`),
  listMessages: (sessionId: string) =>
    api.get(`/chat/sessions/${sessionId}/messages`),
  sendMessage: (
    sessionId: string,
    content: string,
    think: boolean,
    signal?: AbortSignal,
  ) =>
    api.post(
      `/chat/sessions/${sessionId}/messages`,
      {
        role: "user",
        content,
        think,
      },
      {
        // Non-stream chat waits for full model output; avoid client-side timeout.
        timeout: 0,
        signal,
      },
    ),
  listRuns: (sessionId: string) => api.get(`/chat/sessions/${sessionId}/runs`),
  approveAction: (sessionId: string, runId: string, approved: boolean) =>
    api.post(`/chat/sessions/${sessionId}/messages/approve`, {
      run_id: runId,
      approved,
    }),
};

export type StreamChunk = {
  kind: "reasoning" | "content";
  text: string;
};

export type ApprovalInfo = {
  run_id: string;
  action: string;
  target: string;
  arguments: Record<string, unknown>;
  label: string;
};

export type ToolCallInfo = {
  type: string;
  name: string;
};

export const streamChat = (
  sessionId: string,
  content: string,
  think: boolean,
  onChunk: (chunk: StreamChunk) => void,
  onDone: (runId: string) => void,
  onError: (error: string) => void,
  onApproval?: (info: ApprovalInfo) => void,
  onToolCall?: (info: ToolCallInfo) => void,
): { abort: () => void } => {
  // Use a relative path so the request goes through the Vite dev-proxy (/api → backend).
  // Using the absolute backend URL (VITE_API_BASE_URL) would make the browser issue a
  // cross-origin fetch, which causes CORS to block the SSE response body and shows blank.
  const url = `/api/v1/chat/sessions/${sessionId}/messages/stream`;

  // Use fetch for POST SSE
  const abortController = new AbortController();

  let settled = false;
  const finishDone = (runId: string) => {
    if (settled) return;
    settled = true;
    onDone(runId);
  };
  const finishError = (message: string) => {
    if (settled) return;
    settled = true;
    onError(message);
  };

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ role: "user", content, think }),
    signal: abortController.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        let detail = "";
        try {
          detail = await response.text();
        } catch {
          // ignore
        }
        finishError(
          detail
            ? `HTTP ${response.status}: ${detail.slice(0, 200)}`
            : `HTTP ${response.status}`,
        );
        return;
      }
      if (!response.body) {
        finishError(i18n.t("api.stream.empty-body"));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastRunId = "";

      const parseEventBlock = (rawBlock: string) => {
        const lines = rawBlock.split("\n");
        const dataLines = lines
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        if (dataLines.length === 0) return;

        const payload = dataLines.join("\n");
        if (payload === "[DONE]") {
          finishDone(lastRunId);
          return;
        }

        try {
          const data = JSON.parse(payload);
          if (data.type === "text") {
            onChunk({ kind: "content", text: String(data.content || "") });
            return;
          }
          if (data.type === "done") {
            lastRunId = String(data.run_id || "");
            finishDone(lastRunId);
            return;
          }
          if (data.type === "tool_call") {
            onToolCall?.({
              type: String(data.type || "tool"),
              name: String(data.name || ""),
            });
            return;
          }
          if (data.type === "approval_required") {
            if (!settled && onApproval) {
              settled = true;
              onApproval({
                run_id: String(data.run_id || ""),
                action: String(data.action || ""),
                target: String(data.target || ""),
                arguments: (data.arguments as Record<string, unknown>) || {},
                label: String(data.label || ""),
              });
            }
            return;
          }
          if (data.type === "error") {
            finishError(
              String(data.error || i18n.t("api.stream.unknown-error")),
            );
            return;
          }

          const choices = data.choices;
          if (Array.isArray(choices) && choices.length > 0) {
            const delta = choices[0]?.delta || {};
            if (
              typeof delta.reasoning === "string" &&
              delta.reasoning.length > 0
            ) {
              onChunk({ kind: "reasoning", text: delta.reasoning });
              return;
            }

            if (typeof delta.content === "string" && delta.content.length > 0) {
              onChunk({ kind: "content", text: delta.content });
            }
          }
        } catch {
          // Ignore malformed event frames and continue parsing subsequent frames.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Normalize CRLF to LF so SSE frame splitting works across runtimes/proxies.
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const rawBlock = buffer.slice(0, sep).trim();
          buffer = buffer.slice(sep + 2);
          if (rawBlock) {
            parseEventBlock(rawBlock);
          }
          sep = buffer.indexOf("\n\n");
        }
      }

      buffer += decoder.decode().replace(/\r/g, "");
      if (buffer.trim()) {
        parseEventBlock(buffer.trim());
      }

      // If upstream closed stream without explicit done event, treat it as completion.
      if (!settled) {
        finishDone(lastRunId);
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        finishError(err.message);
      }
    });

  return { abort: () => abortController.abort() };
};

// ── WebSocket chat transport ─────────────────────────────────────────────────

export const wsChat = (
  sessionId: string,
  content: string,
  think: boolean,
  onChunk: (chunk: StreamChunk) => void,
  onDone: (runId: string) => void,
  onError: (error: string) => void,
  onApproval?: (info: ApprovalInfo) => void,
  onToolCall?: (info: ToolCallInfo) => void,
): { abort: () => void } => {
  // Use the backend API base; Vite proxy forwards ws:// with ws:true config.
  const apiHost = API_BASE.replace(/^https?:\/\//, "");
  const protocol = API_BASE.startsWith("https") ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${apiHost}/api/v1/chat/ws/${sessionId}`;
  const ws = new WebSocket(wsUrl);
  let settled = false;

  const finishDone = (runId: string) => {
    if (settled) return;
    settled = true;
    onDone(runId);
    ws.close();
  };
  const finishError = (message: string) => {
    if (settled) return;
    settled = true;
    onError(message);
    ws.close();
  };

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "send", content, think }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "text":
          onChunk({ kind: "content", text: String(data.content || "") });
          break;
        case "done":
          finishDone(String(data.run_id || ""));
          break;
        case "error":
          finishError(String(data.error || "Unknown error"));
          break;
        case "approval_required":
          if (!settled && onApproval) {
            settled = true;
            onApproval({
              run_id: String(data.run_id || ""),
              action: String(data.action || ""),
              target: String(data.target || ""),
              arguments: (data.arguments as Record<string, unknown>) || {},
              label: String(data.label || ""),
            });
          }
          break;
        case "tool_call":
          onToolCall?.({ type: String(data.type || "tool"), name: String(data.name || "") });
          break;
        case "pong":
          break;
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onerror = () => {
    finishError("WebSocket connection failed");
  };

  ws.onclose = () => {
    if (!settled) {
      finishDone("");
    }
  };

  return {
    abort: () => {
      if (!settled) {
        settled = true;
        ws.close();
      }
    },
  };
};

// ── Tools & Skills ─────────────────────────────────────────────────────────────
export const toolsApi = {
  list: () => api.get("/tools"),
  create: (data: any) => api.post("/tools", data),
  get: (id: string) => api.get(`/tools/${id}`),
  update: (id: string, data: any) => api.patch(`/tools/${id}`, data),
  delete: (id: string) => api.delete(`/tools/${id}`),
  test: (id: string, input: any) => api.post(`/tools/${id}/test`, input),
  run: (id: string, input: any) => api.post(`/tools/${id}/run`, input),
};

export const skillsApi = {
  list: () => api.get("/skills"),
  create: (data: any) => api.post("/skills", data),
  get: (id: string) => api.get(`/skills/${id}`),
  update: (id: string, data: any) => api.patch(`/skills/${id}`, data),
  delete: (id: string) => api.delete(`/skills/${id}`),
  search: (q: string) => api.get("/skills/search", { params: { q } }),
  install: (package_name: string) =>
    api.post("/skills/install", { package_name }),
  importFolder: (folder_path: string) =>
    api.post("/skills/import-folder", { folder_path }),
  updateSingle: (id: string) => api.post(`/skills/${id}/update`),
  updateAll: () => api.post("/skills/update-all"),
  hubList: () => api.get("/skills/hub"),
  hubSync: () => api.post("/skills/hub/sync"),
  fileTree: (id: string, path?: string) =>
    api.get(`/skills/${id}/files/tree`, {
      params: path ? { path } : undefined,
    }),
  fileContent: (id: string, path: string) =>
    api.get(`/skills/${id}/files/content`, { params: { path } }),
  hubFileTree: (package_ref: string, path?: string) =>
    api.get("/skills/hub/files/tree", {
      params: {
        package_ref,
        ...(path ? { path } : {}),
      },
    }),
  hubFileContent: (package_ref: string, path: string) =>
    api.get("/skills/hub/files/content", { params: { package_ref, path } }),
};

// ── MCP ────────────────────────────────────────────────────────────────────────
export const mcpApi = {
  list: () => api.get("/mcp/servers"),
  create: (data: any) => api.post("/mcp/servers", data),
  get: (id: string) => api.get(`/mcp/servers/${id}`),
  update: (id: string, data: any) => api.patch(`/mcp/servers/${id}`, data),
  delete: (id: string) => api.delete(`/mcp/servers/${id}`),
  testConnection: (id: string) =>
    api.post(`/mcp/servers/${id}/test-connection`),
};

// ── RAG ────────────────────────────────────────────────────────────────────────
export const ragApi = {
  list: () => api.get("/knowledge-bases"),
  create: (data: any) => api.post("/knowledge-bases", data),
  get: (id: string) => api.get(`/knowledge-bases/${id}`),
  update: (id: string, data: any) => api.patch(`/knowledge-bases/${id}`, data),
  delete: (id: string) => api.delete(`/knowledge-bases/${id}`),
  export: (id: string) =>
    api.get(`/knowledge-bases/${id}/export`, { responseType: "blob" }),
  listDocuments: (kbId: string) =>
    api.get(`/knowledge-bases/${kbId}/documents`),
  deleteDocument: (kbId: string, docId: string) =>
    api.delete(`/knowledge-bases/${kbId}/documents/${docId}`),
  retryDocument: (kbId: string, docId: string) =>
    api.post(`/knowledge-bases/${kbId}/documents/${docId}/retry`),
  previewDocument: (kbId: string, docId: string) =>
    api.get(`/knowledge-bases/${kbId}/documents/${docId}/preview`),
  upload: (kbId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/knowledge-bases/${kbId}/documents/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  uploadBatch: (kbId: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) {
      form.append("files", file);
    }
    return api.post(`/knowledge-bases/${kbId}/documents/upload-batch`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  reindex: (kbId: string) => api.post(`/knowledge-bases/${kbId}/reindex`),
  uploadText: (kbId: string, title: string, content: string) =>
    api.post(`/knowledge-bases/${kbId}/documents/text`, { title, content }),
  query: (
    kbId: string,
    query: string,
    options?: {
      topK?: number;
      rewrite?: boolean;
      metadataFilters?: Record<string, string>;
      minScore?: number;
      enableHybridRerank?: boolean;
    },
  ) =>
    api.post(`/knowledge-bases/${kbId}/query`, {
      query,
      top_k: options?.topK,
      rewrite: options?.rewrite,
      metadata_filters: options?.metadataFilters,
      min_score: options?.minScore,
      enable_hybrid_rerank: options?.enableHybridRerank,
    }),
};

// ── Datasets ───────────────────────────────────────────────────────────────────
export const datasetsApi = {
  list: () => api.get("/datasets"),
  create: (data: any) => api.post("/datasets", data),
  get: (id: string) => api.get(`/datasets/${id}`),
  update: (id: string, data: any) => api.patch(`/datasets/${id}`, data),
  delete: (id: string) => api.delete(`/datasets/${id}`),
  upload: (file: File, meta?: { name?: string; field_mapping?: any }) => {
    const form = new FormData();
    form.append("file", file);
    if (meta?.name) form.append("name", meta.name);
    if (meta?.field_mapping)
      form.append("field_mapping", JSON.stringify(meta.field_mapping));
    return api.post("/datasets/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  preview: (id: string, limit?: number) =>
    api.get(`/datasets/${id}/preview?limit=${limit || 20}`),
  process: (id: string, data: any) => api.post(`/datasets/${id}/process`, data),
  export: (id: string, data?: any) =>
    api.post(`/datasets/${id}/export`, data || {}),
};

// ── Fine-tune / LoRA ───────────────────────────────────────────────────────────
export const finetuneApi = {
  listJobs: () => api.get("/fine-tune/jobs"),
  listDatasets: () => api.get("/datasets"),
  createJob: (data: any) => api.post("/fine-tune/jobs", data),
  getJob: (id: string) => api.get(`/fine-tune/jobs/${id}`),
  deleteJob: (id: string) => api.delete(`/fine-tune/jobs/${id}`),
  getLogs: (id: string) => api.get(`/fine-tune/jobs/${id}/logs`),
  cancelJob: (id: string) => api.post(`/fine-tune/jobs/${id}/cancel`),
  registerModel: (id: string, data?: any) =>
    api.post(`/fine-tune/jobs/${id}/register-model`, data || {}),
  testChat: (id: string, message: string) =>
    api.post(`/fine-tune/jobs/${id}/test-chat`, { message }),
};

// ── Observability ──────────────────────────────────────────────────────────────
export const obsApi = {
  listRuns: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    return api.get(`/observability/runs?${qs.toString()}`);
  },
  getRun: (id: string) => api.get(`/observability/runs/${id}`),
  listTraces: () => api.get("/observability/traces"),
  getStats: () => api.get("/observability/stats/usage"),
  feedback: (
    id: string,
    data: {
      name?: string;
      value: string | number | boolean;
      score_type?: "numeric" | "boolean" | "categorical";
      comment?: string;
    },
  ) => api.post(`/observability/runs/${id}/feedback`, data),
  exportRun: (id: string) => api.get(`/observability/runs/${id}/export`),
  cleanup: (data: { retention_days?: number; status?: string }) =>
    api.post("/observability/cleanup", data),
  getConfig: () => api.get("/observability/config"),
  updateConfig: (data: any) => api.put("/observability/config", data),
};

// ── Dashboard ──────────────────────────────────────────────────────────────────
export const dashboardApi = {
  overview: () => api.get("/dashboard/overview"),
  health: () => api.get("/dashboard/health"),
  activity: () => api.get("/dashboard/activity"),
  usage: () => api.get("/dashboard/usage"),
};

// ── Store & Settings ───────────────────────────────────────────────────────────
export const storeApi = {
  list: () => api.get("/store/services"),
  create: (data: any) => api.post("/store/services", data),
  delete: (id: string) => api.delete(`/store/services/${id}`),
  healthCheck: (id: string) => api.post(`/store/services/${id}/health-check`),
  listOperations: () => api.get("/store/operations"),
  export: (data: any) => api.post("/store/operations/export", data),
  import: (data: any) => api.post("/store/operations/import", data),
  migrate: (data: any) => api.post("/store/operations/migrate", data),
};

export const settingsApi = {
  get: () => api.get("/settings"),
  update: (data: any) => api.put("/settings", data),
  getEnvironment: () => api.get("/settings/environment"),
  getRuntime: () => api.get("/settings/runtime"),
  testDirectory: (path?: string) =>
    api.post("/settings/test-directory", { path: path || "" }),
};

// ── Speech ─────────────────────────────────────────────────────────────────────
export type SpeechStatus = {
  ready: boolean;
  downloading: boolean;
  download_started: boolean;
  error: string | null;
  model: string;
  active_engine?: string | null;
  device_tier?: string;
  candidates?: string[];
  engine_order?: string[];
};

export const channelsApi = {
  list: () => api.get("/channels"),
  get: (id: string) => api.get(`/channels/${id}`),
  create: (data: any) => api.post("/channels", data),
  update: (id: string, data: any) => api.patch(`/channels/${id}`, data),
  delete: (id: string) => api.delete(`/channels/${id}`),
  test: (id: string) => api.post(`/channels/${id}/test`),
};

export const speechApi = {
  status: () => api.get<SpeechStatus>("/speech/status"),
  ensure: () => api.post<SpeechStatus>("/speech/ensure"),
  transcribe: (blob: Blob, filename = "chunk.webm", signal?: AbortSignal) => {
    const form = new FormData();
    form.append("audio", new File([blob], filename, { type: blob.type }));
    return api.post<{ text: string }>("/speech/transcribe", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 0,
      signal,
    });
  },
  abCompare: (blob: Blob, engines = "sherpa-onnx,whisper-cpp,vosk") => {
    const form = new FormData();
    form.append(
      "audio",
      new File([blob], "ab-compare.webm", { type: blob.type }),
    );
    return api.post<{
      device_tier: string;
      reports: Array<{
        engine: string;
        backend?: string;
        latency_ms?: number;
        first_token_ms?: number;
        text?: string;
        error?: string;
      }>;
    }>(`/speech/ab-compare?engines=${encodeURIComponent(engines)}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 0,
    });
  },
};

export const memoriesApi = {
  config: () =>
    api.get<{
      models: { id: string; name: string; memory_enabled: boolean }[];
      agents: { id: string; name: string; memory_enabled: boolean }[];
      global_enabled: boolean;
    }>("/memories/config"),

  toggleGlobal: (enabled: boolean) =>
    api.post("/memories/config/global", { enabled }),

  toggleModel: (modelId: string, enabled: boolean) =>
    api.post(`/memories/config/models/${modelId}`, { enabled }),

  toggleAgent: (agentId: string, enabled: boolean) =>
    api.post(`/memories/config/agents/${agentId}`, { enabled }),

  create: (data: {
    key: string;
    value: string;
    session_id?: string | null;
    scope?: string;
    scope_id?: string | null;
  }) => api.post("/memories", data),

  list: (params?: { session_id?: string; scope?: string; scope_id?: string }) =>
    api.get<{
      id: string;
      session_id: string | null;
      scope: string;
      scope_id: string | null;
      key: string;
      value: string;
      created_at: string;
    }[]>("/memories", { params }),

  update: (memoryId: string, value: string) =>
    api.put(`/memories/${memoryId}`, { value }),

  delete: (memoryId: string) =>
    api.delete(`/memories/${memoryId}`),

  clearSession: (sessionId: string) =>
    api.delete(`/memories/session/${sessionId}`),
};
