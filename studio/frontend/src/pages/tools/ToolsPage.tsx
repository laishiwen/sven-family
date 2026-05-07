import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import YAML from "yaml";
import { toolsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Bot,
  CheckCircle,
  ChevronDown,
  Code,
  Download,
  Globe,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Terminal,
  FileText,
  Upload,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MonacoEditor from "@monaco-editor/react";
import { useToastStore } from "@/stores/toastStore";

type ToolType = "python" | "http" | "web_search" | "file_io" | "cli";
type HttpPresetKey =
  | "generic"
  | "openai-chat"
  | "openai-responses"
  | "openai-embeddings";
type ToolCategoryKey =
  | "all"
  | "python"
  | "openai"
  | "http-read"
  | "http-write"
  | "builtin";
type ExportFormat = "json" | "yaml";

type ToolRecord = {
  id?: string;
  name: string;
  description?: string | null;
  tool_type: ToolType;
  parameters_schema_json: string;
  code_content?: string | null;
  http_config_json?: string | null;
  is_builtin?: boolean;
  enabled?: boolean;
  created_at?: string;
};

function ToolGridSkeleton() {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-8 w-8" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-10" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type ToolForm = {
  name: string;
  description: string;
  tool_type: ToolType;
  parameters_schema_json: string;
  code_content: string;
  http_config_json: string;
};

type HttpConfig = {
  standard?: string;
  operation?: string;
  method?: string;
  url?: string;
  base_url?: string;
  endpoint_path?: string;
  api_key?: string;
  model?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body_template?: Record<string, unknown>;
  payload_mode?: string;
  timeout?: number;
};

const TOOL_EXPORT_VERSION = 1;
const EDITOR_LINE_HEIGHT = 20;

const EDITOR_OPTIONS = {
  fontSize: 13,
  lineHeight: EDITOR_LINE_HEIGHT,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  folding: true,
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  automaticLayout: true,
  formatOnPaste: true,
  formatOnType: true,
  padding: {
    top: EDITOR_LINE_HEIGHT * 2,
    bottom: EDITOR_LINE_HEIGHT * 2,
  },
};

const DEFAULT_PYTHON = `def run(input: dict) -> dict:
    value = input.get("value", "")
    return {"result": f"processed result: {value}"}
`;

const DEFAULT_SCHEMA = `{
  "type": "object",
  "properties": {
    "value": {
      "type": "string",
      "description": "Input value"
    }
  },
  "required": ["value"]
}`;

const DEFAULT_HTTP = `{
  "standard": "generic",
  "method": "POST",
  "url": "",
  "headers": {},
  "params": {},
  "body_template": {},
  "payload_mode": "json",
  "timeout": 30
}`;

const OPENAI_CHAT_SCHEMA = `{
  "type": "object",
  "properties": {
    "message": { "type": "string", "description": "User input message" },
    "model": { "type": "string", "description": "Model ID, e.g. gpt-4.1-mini" },
    "api_key": { "type": "string", "description": "OpenAI-compatible API key" }
  },
  "required": ["message", "model", "api_key"]
}`;

const OPENAI_RESPONSES_SCHEMA = `{
  "type": "object",
  "properties": {
    "input": { "type": "string", "description": "Responses API input" },
    "model": { "type": "string", "description": "Model ID" },
    "api_key": { "type": "string", "description": "OpenAI-compatible API key" }
  },
  "required": ["input", "model", "api_key"]
}`;

const OPENAI_EMBEDDINGS_SCHEMA = `{
  "type": "object",
  "properties": {
    "input": { "type": "string", "description": "Text to vectorize" },
    "model": { "type": "string", "description": "Embedding model ID" },
    "api_key": { "type": "string", "description": "OpenAI-compatible API key" }
  },
  "required": ["input", "model", "api_key"]
}`;

const OPENAI_CHAT_HTTP = `{
  "standard": "openai", "operation": "chat.completions",
  "base_url": "https://api.openai.com",
  "endpoint_path": "/v1/chat/completions",
  "api_key": "{{api_key}}", "model": "{{model}}",
  "system_prompt": "", "temperature": 0.2, "max_tokens": 1024,
  "headers": {}, "params": {}, "body_template": {}, "timeout": 30
}`;

const OPENAI_RESPONSES_HTTP = `{
  "standard": "openai", "operation": "responses",
  "base_url": "https://api.openai.com",
  "endpoint_path": "/v1/responses",
  "api_key": "{{api_key}}", "model": "{{model}}",
  "headers": {}, "params": {}, "body_template": {}, "timeout": 30
}`;

const OPENAI_EMBEDDINGS_HTTP = `{
  "standard": "openai", "operation": "embeddings",
  "base_url": "https://api.openai.com",
  "endpoint_path": "/v1/embeddings",
  "api_key": "{{api_key}}", "model": "{{model}}",
  "headers": {}, "params": {}, "body_template": {}, "timeout": 30
}`;

function prettifyJson(value: string, fallback: string) {
  const source = value?.trim() || fallback;
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

function prettifyPython(value: string, fallback: string) {
  const source = (value || fallback).replace(/\r\n/g, "\n");
  return `${source.trim()}\n`;
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function detectHttpPreset(configText?: string | null): HttpPresetKey {
  const config = safeJsonParse<HttpConfig>(configText, {} as HttpConfig);
  if (config.standard !== "openai") return "generic";
  if (config.operation === "responses") return "openai-responses";
  if (config.operation === "embeddings") return "openai-embeddings";
  return "openai-chat";
}

function getPresetConfig(preset: HttpPresetKey) {
  if (preset === "openai-chat") {
    return {
      schema: OPENAI_CHAT_SCHEMA,
      http: OPENAI_CHAT_HTTP,
      hintKey: "tools.http-hint.openai-chat",
    };
  }
  if (preset === "openai-responses") {
    return {
      schema: OPENAI_RESPONSES_SCHEMA,
      http: OPENAI_RESPONSES_HTTP,
      hintKey: "tools.http-hint.openai-responses",
    };
  }
  if (preset === "openai-embeddings") {
    return {
      schema: OPENAI_EMBEDDINGS_SCHEMA,
      http: OPENAI_EMBEDDINGS_HTTP,
      hintKey: "tools.http-hint.openai-embeddings",
    };
  }
  return {
    schema: DEFAULT_SCHEMA,
    http: DEFAULT_HTTP,
    hintKey: "tools.http-hint.generic",
  };
}

function buildInitialToolForm(
  tool?: ToolRecord,
  initialType?: ToolType,
  initialPreset?: HttpPresetKey,
): ToolForm {
  const toolType = tool?.tool_type ?? initialType ?? "python";
  const presetConfig = getPresetConfig(initialPreset || "generic");
  return {
    name: tool?.name || "",
    description: tool?.description || "",
    tool_type: toolType,
    parameters_schema_json: prettifyJson(
      tool?.parameters_schema_json ||
        (toolType === "http" ? presetConfig.schema : DEFAULT_SCHEMA),
      DEFAULT_SCHEMA,
    ),
    code_content: prettifyPython(
      tool?.code_content || DEFAULT_PYTHON,
      DEFAULT_PYTHON,
    ),
    http_config_json: prettifyJson(
      tool?.http_config_json ||
        (toolType === "http" ? presetConfig.http : DEFAULT_HTTP),
      DEFAULT_HTTP,
    ),
  };
}

function handleEditorMount(editor: any) {
  queueMicrotask(() => {
    editor
      .getAction("editor.action.formatDocument")
      ?.run()
      .catch(() => {});
  });
}

function isBuiltinToolType(tt: string): tt is "web_search" | "file_io" | "cli" {
  return tt === "web_search" || tt === "file_io" || tt === "cli";
}

function getToolCategory(tool: ToolRecord): Exclude<ToolCategoryKey, "all"> {
  if (tool.tool_type === "python") return "python";
  if (isBuiltinToolType(tool.tool_type)) return "builtin";
  const config = safeJsonParse<HttpConfig>(
    tool.http_config_json,
    {} as HttpConfig,
  );
  if (config.standard === "openai") return "openai";
  const method = (config.method || "POST").toUpperCase();
  return method === "GET" || method === "HEAD" ? "http-read" : "http-write";
}

function getHttpConfig(tool: ToolRecord): HttpConfig {
  return safeJsonParse<HttpConfig>(tool.http_config_json, {} as HttpConfig);
}

function getToolAccent(tool: ToolRecord) {
  const tt = tool.tool_type;
  if (tt === "python")
    return "text-orange-500 bg-orange-50 dark:bg-orange-900/20";
  if (tt === "web_search") return "text-sky-500 bg-sky-50 dark:bg-sky-900/20";
  if (tt === "file_io")
    return "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20";
  if (tt === "cli") return "text-slate-500 bg-slate-50 dark:bg-slate-900/20";
  const category = getToolCategory(tool);
  if (category === "openai")
    return "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20";
  if (category === "http-read")
    return "text-amber-600 bg-amber-50 dark:bg-amber-950/20";
  return "text-violet-500 bg-violet-50 dark:bg-violet-900/20";
}

function getToolSubtitle(
  tool: ToolRecord,
  t: (key: string, options?: any) => string,
) {
  if (tool.tool_type === "python") return t("tools.subtitle.python");
  if (tool.tool_type === "web_search") return t("tools.subtitle.web-search");
  if (tool.tool_type === "file_io") return t("tools.subtitle.file-io");
  if (tool.tool_type === "cli") return t("tools.subtitle.cli");
  const config = getHttpConfig(tool);
  if (config.standard === "openai") {
    return t("tools.subtitle.openai", {
      operation: config.operation || "chat.completions",
    });
  }
  const method = (config.method || "POST").toUpperCase();
  return t("tools.subtitle.http", {
    method,
    url: config.url || t("tools.subtitle.url-unset"),
  });
}

function serializeTools(tools: ToolRecord[]) {
  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description || "",
    tool_type: tool.tool_type,
    parameters_schema_json: prettifyJson(
      tool.parameters_schema_json,
      DEFAULT_SCHEMA,
    ),
    code_content:
      tool.tool_type === "python"
        ? prettifyPython(tool.code_content || DEFAULT_PYTHON, DEFAULT_PYTHON)
        : null,
    http_config_json:
      tool.tool_type === "http"
        ? prettifyJson(tool.http_config_json || DEFAULT_HTTP, DEFAULT_HTTP)
        : null,
  }));
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeImportedTools(value: unknown): ToolRecord[] {
  const rawTools = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as any).tools)
      ? (value as any).tools
      : [value];

  return rawTools
    .map((tool: unknown) => {
      if (!tool || typeof tool !== "object") return null;
      const item = tool as Record<string, unknown>;
      const toolType =
        item.tool_type === "http" || item.http_config_json ? "http" : "python";
      const name = String(item.name || "").trim();
      if (!name) return null;
      return {
        id: typeof item.id === "string" ? item.id : undefined,
        name,
        description:
          typeof item.description === "string" ? item.description : "",
        tool_type: toolType,
        parameters_schema_json: prettifyJson(
          typeof item.parameters_schema_json === "string"
            ? item.parameters_schema_json
            : DEFAULT_SCHEMA,
          DEFAULT_SCHEMA,
        ),
        code_content: prettifyPython(
          typeof item.code_content === "string"
            ? item.code_content
            : DEFAULT_PYTHON,
          DEFAULT_PYTHON,
        ),
        http_config_json: prettifyJson(
          typeof item.http_config_json === "string"
            ? item.http_config_json
            : DEFAULT_HTTP,
          DEFAULT_HTTP,
        ),
      } satisfies ToolRecord;
    })
    .filter(Boolean) as ToolRecord[];
}

function buildToolPayload(form: ToolForm) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    tool_type: form.tool_type,
    parameters_schema_json: prettifyJson(
      form.parameters_schema_json,
      DEFAULT_SCHEMA,
    ),
    code_content:
      form.tool_type === "python"
        ? prettifyPython(form.code_content, DEFAULT_PYTHON)
        : null,
    http_config_json:
      form.tool_type === "http"
        ? prettifyJson(form.http_config_json, DEFAULT_HTTP)
        : null,
  };
}

function ToolModal({
  tool,
  initialType,
  initialPreset,
  onClose,
  onSave,
  isSaving,
}: {
  tool?: ToolRecord;
  initialType?: ToolType;
  initialPreset?: HttpPresetKey;
  onClose: () => void;
  onSave: (form: ToolForm) => void;
  isSaving?: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ToolForm>(() =>
    buildInitialToolForm(tool, initialType, initialPreset),
  );
  const [httpPreset, setHttpPreset] = useState<HttpPresetKey>(
    () => initialPreset || detectHttpPreset(tool?.http_config_json),
  );
  const preset = getPresetConfig(httpPreset);

  const updateToolType = (nextType: ToolType) => {
    if (nextType === form.tool_type) return;
    if (nextType === "python") {
      setForm((c) => ({
        ...c,
        tool_type: "python",
        code_content: prettifyPython(
          c.code_content || DEFAULT_PYTHON,
          DEFAULT_PYTHON,
        ),
        parameters_schema_json: prettifyJson(
          c.parameters_schema_json || DEFAULT_SCHEMA,
          DEFAULT_SCHEMA,
        ),
      }));
      return;
    }
    setHttpPreset("generic");
    const genericPreset = getPresetConfig("generic");
    setForm((c) => ({
      ...c,
      tool_type: "http",
      http_config_json: genericPreset.http,
      parameters_schema_json: genericPreset.schema,
    }));
  };

  const applyPreset = (nextPreset: HttpPresetKey) => {
    setHttpPreset(nextPreset);
    const nextConfig = getPresetConfig(nextPreset);
    setForm((c) => ({
      ...c,
      tool_type: "http",
      parameters_schema_json: nextConfig.schema,
      http_config_json: nextConfig.http,
    }));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-5xl p-0 gap-0 flex flex-col h-[88vh] overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border flex-shrink-0">
          <DialogTitle className="text-base">
            {tool ? t("tools.modal.edit-title") : t("tools.modal.new-title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {t("tools.modal.basic-info")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("tools.modal.name-required")}</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, name: e.target.value }))
                    }
                    placeholder={t("tools.modal.name-placeholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("description")}</Label>
                  <Textarea
                    className="min-h-[72px]"
                    value={form.description}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, description: e.target.value }))
                    }
                    placeholder={t("tools.modal.description-placeholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("tools.modal.tool-type")}</Label>
                  <Select
                    value={form.tool_type}
                    onValueChange={(v: ToolType) => updateToolType(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="python">
                        {t("tools.type.python")}
                      </SelectItem>
                      <SelectItem value="http">
                        {t("tools.type.http")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.tool_type === "http" && (
                  <div className="space-y-1.5">
                    <Label>{t("tools.modal.http-template")}</Label>
                    <Select
                      value={httpPreset}
                      onValueChange={(v: HttpPresetKey) => applyPreset(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="generic">
                          {t("tools.template.generic")}
                        </SelectItem>
                        <SelectItem value="openai-chat">
                          {t("tools.template.openai-chat")}
                        </SelectItem>
                        <SelectItem value="openai-responses">
                          {t("tools.template.openai-responses")}
                        </SelectItem>
                        <SelectItem value="openai-embeddings">
                          {t("tools.template.openai-embeddings")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    {form.tool_type === "python"
                      ? t("tools.modal.exec-code")
                      : t("tools.modal.http-config")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border overflow-hidden">
                    <MonacoEditor
                      height={280}
                      language={form.tool_type === "python" ? "python" : "json"}
                      onMount={handleEditorMount}
                      value={
                        form.tool_type === "python"
                          ? form.code_content
                          : form.http_config_json
                      }
                      onChange={(value) =>
                        setForm((c) =>
                          c.tool_type === "python"
                            ? { ...c, code_content: value ?? "" }
                            : { ...c, http_config_json: value ?? "" },
                        )
                      }
                      options={{
                        ...EDITOR_OPTIONS,
                        tabSize: form.tool_type === "python" ? 4 : 2,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    {t("tools.modal.param-schema")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border overflow-hidden">
                    <MonacoEditor
                      height={180}
                      language="json"
                      onMount={handleEditorMount}
                      value={form.parameters_schema_json}
                      onChange={(value) =>
                        setForm((c) => ({
                          ...c,
                          parameters_schema_json: value ?? "",
                        }))
                      }
                      options={{ ...EDITOR_OPTIONS, tabSize: 2 }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border flex-shrink-0 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || isSaving}
          >
            {isSaving && (
              <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
            )}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestToolModal({
  tool,
  onClose,
}: {
  tool: ToolRecord;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("{}");
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fillSample = () => {
    try {
      const schema = JSON.parse(tool.parameters_schema_json || "{}");
      const sample: Record<string, any> = {};
      if (schema.properties) {
        for (const [key, value] of Object.entries(
          schema.properties as Record<string, any>,
        )) {
          sample[key] =
            value.type === "string"
              ? t("tools.test.sample-value")
              : value.type === "number"
                ? 0
                : value.type === "boolean"
                  ? true
                  : null;
        }
      }
      setInput(JSON.stringify(sample, null, 2));
    } catch {
      setInput("{}");
    }
  };

  const runTool = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const parsedInput = JSON.parse(input);
      const response = await toolsApi.run(tool.id || "", {
        input: parsedInput,
      });
      setResult(response.data);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || err.message || t("tools.test.failed"),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-2xl p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base">
            {t("tools.test.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>{t("tools.test.input-json")}</Label>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={fillSample}
              >
                {t("tools.test.fill-sample")}
              </Button>
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <MonacoEditor
                height={150}
                language="json"
                onMount={handleEditorMount}
                value={input}
                onChange={(v) => setInput(v ?? "{}")}
                options={{
                  ...EDITOR_OPTIONS,
                  folding: false,
                  lineNumbers: "off",
                  tabSize: 2,
                }}
              />
            </div>
          </div>

          {result !== null && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/10">
              <div className="flex items-center gap-1 mb-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {t("tools.test.success")}
                </span>
              </div>
              <pre className="text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/10">
              <div className="flex items-center gap-1 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-700 dark:text-red-400">
                  {t("tools.test.failed")}
                </span>
              </div>
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("tools.test.close")}
          </Button>
          <Button onClick={runTool} disabled={running || !tool.id}>
            {running ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1" />
            )}
            {running ? t("tools.test.running") : t("tools.test.run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolCard({
  tool,
  onEdit,
  onTest,
  onDelete,
  onExport,
}: {
  tool: ToolRecord;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
  onExport: (format: ExportFormat) => void;
}) {
  const { t } = useTranslation();
  const accent = getToolAccent(tool);

  return (
    <div className="group border border-border rounded-lg p-3 flex flex-col gap-2 hover:bg-accent/40 transition-colors">
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            accent,
          )}
        >
          {tool.tool_type === "python" ? (
            <Code className="w-3.5 h-3.5" />
          ) : tool.tool_type === "web_search" ? (
            <Globe className="w-3.5 h-3.5" />
          ) : tool.tool_type === "file_io" ? (
            <FileText className="w-3.5 h-3.5" />
          ) : tool.tool_type === "cli" ? (
            <Terminal className="w-3.5 h-3.5" />
          ) : (
            <Globe className="w-3.5 h-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-medium text-sm truncate">{tool.name}</h3>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Tool actions</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={onTest} className="gap-2 text-xs">
                  <Play className="w-3.5 h-3.5 text-emerald-500" />{" "}
                  {t("tools.actions.test")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit} className="gap-2 text-xs">
                  <Pencil className="w-3.5 h-3.5" /> {t("edit")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onExport("json")}
                  className="gap-2 text-xs"
                >
                  <Download className="w-3.5 h-3.5" /> JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onExport("yaml")}
                  className="gap-2 text-xs"
                >
                  <Download className="w-3.5 h-3.5" /> YAML
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {tool.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {tool.description}
            </p>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {getToolSubtitle(tool, t)}
      </div>
    </div>
  );
}

export default function ToolsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const importInputRef = useRef<HTMLInputElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = actionBarRef.current;
    if (!bar) return;
    const container =
      bar.closest("[class*='overflow-y-auto']") || bar.parentElement;
    if (!container) return;
    const onScroll = () => {
      bar.classList.toggle("scrolled", container.scrollTop > 0);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const [editing, setEditing] = useState<ToolRecord | null>(null);
  const [testing, setTesting] = useState<ToolRecord | null>(null);
  const [pendingDeleteTool, setPendingDeleteTool] = useState<ToolRecord | null>(
    null,
  );
  const [newToolType, setNewToolType] = useState<ToolType | null>(null);
  const [newToolPreset, setNewToolPreset] = useState<HttpPresetKey | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<ToolCategoryKey>("all");
  const [importing, setImporting] = useState(false);

  const { data: tools = [], isLoading } = useQuery<ToolRecord[]>({
    queryKey: ["tools"],
    queryFn: () => toolsApi.list().then((r) => r.data),
  });

  const BUILTIN_MARKET_DEFS = useMemo(
    () => [
      {
        id: "builtin-web-search",
        name: "Web Search",
        description:
          "Search the web via DuckDuckGo (free), SerpAPI, Tavily, or Brave.",
        tool_type: "web_search" as const,
        icon: Globe,
        parameters_schema_json: JSON.stringify({
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            provider: {
              type: "string",
              enum: ["duckduckgo", "serpapi", "tavily", "brave"],
              default: "duckduckgo",
            },
            max_results: {
              type: "integer",
              default: 10,
              minimum: 1,
              maximum: 20,
            },
          },
          required: ["query"],
        }),
        http_config_json: JSON.stringify({
          provider: "duckduckgo",
          description:
            "DuckDuckGo is free. Other providers need API keys in env vars.",
        }),
      },
      {
        id: "builtin-file-io",
        name: "File I/O",
        description:
          "Read, write, list, and delete files within the workspace directory.",
        tool_type: "file_io" as const,
        icon: FileText,
        parameters_schema_json: JSON.stringify({
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: ["read", "write", "list", "delete"],
            },
            filepath: {
              type: "string",
              description: "Relative path within workspace",
            },
            content: {
              type: "string",
              description: "Content to write (for write operation)",
            },
          },
          required: ["operation", "filepath"],
        }),
        http_config_json: JSON.stringify({ workspace_root: "~" }),
      },
      {
        id: "builtin-cli",
        name: "System CLI",
        description: "Execute shell commands on the local system.",
        tool_type: "cli" as const,
        icon: Terminal,
        parameters_schema_json: JSON.stringify({
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "Shell command to execute",
            },
            timeout: { type: "integer", default: 60, maximum: 300 },
            cwd: { type: "string", description: "Working directory" },
          },
          required: ["command"],
        }),
        http_config_json: JSON.stringify({ timeout: 60 }),
      },
    ],
    [],
  );

  const visibleTools = useMemo(() => tools, [tools]);

  const installedBuiltinIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tool of tools) {
      if (tool.is_builtin) ids.add(tool.id!);
    }
    return ids;
  }, [tools]);

  const marketTools = useMemo(
    () => BUILTIN_MARKET_DEFS.filter((def) => !installedBuiltinIds.has(def.id)),
    [BUILTIN_MARKET_DEFS, installedBuiltinIds],
  );

  const installMarketMut = useMutation({
    mutationFn: (def: (typeof BUILTIN_MARKET_DEFS)[number]) =>
      toolsApi.create({
        name: def.name,
        description: def.description,
        tool_type: def.tool_type,
        parameters_schema_json: def.parameters_schema_json,
        http_config_json: def.http_config_json,
        code_content: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
      addToast({ type: "success", message: t("tools.toast.created") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("tools.toast.create-failed"),
      });
    },
  });

  const createMut = useMutation({
    mutationFn: (data: any) => toolsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
      setNewToolType(null);
      setNewToolPreset(null);
      addToast({ type: "success", message: t("tools.toast.created") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("tools.toast.create-failed"),
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      toolsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
      setEditing(null);
      addToast({ type: "success", message: t("tools.toast.updated") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("tools.toast.update-failed"),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => toolsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
      addToast({ type: "success", message: t("tools.toast.deleted") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("tools.toast.delete-failed"),
      });
    },
  });

  const searchKeyword = search.trim().toLowerCase();
  const searchedTools = useMemo(() => {
    return visibleTools.filter((tool) => {
      if (!searchKeyword) return true;
      const haystack = [
        tool.name,
        tool.description || "",
        getToolSubtitle(tool, t),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchKeyword);
    });
  }, [searchKeyword, t, visibleTools]);

  const counts = useMemo(() => {
    const next = {
      all: searchedTools.length,
      python: 0,
      openai: 0,
      "http-read": 0,
      "http-write": 0,
      builtin: 0,
    } satisfies Record<ToolCategoryKey, number>;
    for (const tool of searchedTools) next[getToolCategory(tool)] += 1;
    return next;
  }, [searchedTools]);

  const filteredTools = useMemo(() => {
    if (activeCategory === "all") return searchedTools;
    return searchedTools.filter(
      (tool) => getToolCategory(tool) === activeCategory,
    );
  }, [activeCategory, searchedTools]);

  const exportBundle = (
    selectedTools: ToolRecord[],
    format: ExportFormat,
    fileBase: string,
  ) => {
    const payload = {
      version: TOOL_EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      tools: serializeTools(selectedTools),
    };
    const fileName = `${fileBase}.${format === "json" ? "json" : "yaml"}`;
    if (format === "json") {
      downloadTextFile(
        fileName,
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }
    downloadTextFile(
      fileName,
      YAML.stringify(payload),
      "application/x-yaml;charset=utf-8",
    );
  };

  const exportSingleTool = (tool: ToolRecord, format: ExportFormat) => {
    exportBundle(
      [tool],
      format,
      `${tool.name.replace(/\s+/g, "-").toLowerCase()}-tool`,
    );
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = /\.ya?ml$/i.test(file.name)
        ? YAML.parse(text)
        : JSON.parse(text);
      const importedTools = normalizeImportedTools(parsed);
      if (!importedTools.length)
        throw new Error(t("tools.import.no-valid-definitions"));
      for (const tool of importedTools) {
        const existing = visibleTools.find(
          (item) => (tool.id && item.id === tool.id) || item.name === tool.name,
        );
        const payload = buildToolPayload(
          buildInitialToolForm(tool, tool.tool_type),
        );
        if (existing?.id) {
          await toolsApi.update(existing.id, payload);
        } else {
          await toolsApi.create(payload);
        }
      }
      await qc.invalidateQueries({ queryKey: ["tools"] });
      addToast({
        type: "success",
        message: t("tools.import.imported-count", {
          count: importedTools.length,
        }),
      });
    } catch (error: any) {
      addToast({
        type: "error",
        message: error?.message || t("tools.import.failed"),
      });
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.yaml,.yml"
        className="hidden"
        onChange={handleImportFile}
      />
      <div className="pt-4 px-6 pb-6 space-y-5">
        <div ref={actionBarRef} className="sticky-action-bar pt-3 pb-4">
          <div className="flex items-center justify-end gap-1.5">
            <div className="relative w-44">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tools.search-placeholder")}
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import tool</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Export tool</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onClick={() => exportBundle(filteredTools, "json", "tools")}
                >
                  Export JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onClick={() => exportBundle(filteredTools, "yaml", "tools")}
                >
                  Export YAML
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Wrench className="w-3.5 h-3.5" />
                  {t("tools.new.button")}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onClick={() => {
                    setNewToolType("python");
                    setNewToolPreset(null);
                  }}
                >
                  <Code className="w-3.5 h-3.5 text-orange-500" />{" "}
                  {t("tools.new.python")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onClick={() => {
                    setNewToolType("http");
                    setNewToolPreset("generic");
                  }}
                >
                  <Globe className="w-3.5 h-3.5 text-amber-500" />{" "}
                  {t("tools.new.http-generic")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onClick={() => {
                    setNewToolType("http");
                    setNewToolPreset("openai-chat");
                  }}
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-500" />{" "}
                  {t("tools.new.openai-template")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex gap-1 flex-wrap mt-1.5">
            {(
              [
                "all",
                "python",
                "openai",
                "http-read",
                "http-write",
                "builtin",
              ] as ToolCategoryKey[]
            ).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={activeCategory === key ? "secondary" : "ghost"}
                onClick={() => setActiveCategory(key)}
                className="text-xs h-7"
              >
                {key === "all"
                  ? t("tools.filter.all")
                  : key === "python"
                    ? t("tools.category.python.label")
                    : key === "openai"
                      ? t("tools.category.openai.label")
                      : key === "http-read"
                        ? t("tools.category.http-read.label")
                        : key === "http-write"
                          ? t("tools.category.http-write.label")
                          : t("tools.category.builtin.label")}
                <span className="ml-1 text-muted-foreground">
                  {counts[key]}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <ToolGridSkeleton />
        ) : filteredTools.length === 0 ? (
          <EmptyState
            icon={<Wrench className="w-5 h-5 text-muted-foreground" />}
            title={t("tools.empty-title")}
            description={t("tools.empty-description")}
            action={{
              label: t("tools.new.first"),
              onClick: () => setNewToolType("python"),
            }}
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredTools.map((tool) => (
              <ToolCard
                key={tool.id || tool.name}
                tool={tool}
                onEdit={() => setEditing(tool)}
                onTest={() => setTesting(tool)}
                onDelete={() => setPendingDeleteTool(tool)}
                onExport={(format) => exportSingleTool(tool, format)}
              />
            ))}
          </div>
        )}

        {/* Marketplace — uninstalled built-in tools */}
        {marketTools.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-medium font-serif">
                {t("tools.market.title")}
              </h3>
              <span className="text-xs text-muted-foreground">
                {marketTools.length} {t("tools.market.available")}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {marketTools.map((def) => {
                const Icon = def.icon;
                return (
                  <Card key={def.id} className="group">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium truncate">
                            {def.name}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {def.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px]">
                          {t("tools.market.builtin")}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={installMarketMut.isPending}
                          onClick={() => installMarketMut.mutate(def)}
                        >
                          <Plus className="w-3 h-3" />
                          {t("install")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {newToolType && (
          <ToolModal
            initialType={newToolType}
            initialPreset={newToolPreset || undefined}
            onClose={() => {
              setNewToolType(null);
              setNewToolPreset(null);
            }}
            onSave={(form) => createMut.mutate(buildToolPayload(form))}
            isSaving={createMut.isPending}
          />
        )}

        {editing && (
          <ToolModal
            tool={editing}
            onClose={() => setEditing(null)}
            onSave={(form) => {
              if (!editing.id) return;
              updateMut.mutate({
                id: editing.id,
                data: buildToolPayload(form),
              });
            }}
            isSaving={updateMut.isPending}
          />
        )}

        {testing && (
          <TestToolModal tool={testing} onClose={() => setTesting(null)} />
        )}

        <ConfirmDialog
          open={!!pendingDeleteTool}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteTool(null);
          }}
          title={t("tools.confirm-delete-title")}
          description={
            pendingDeleteTool
              ? t("tools.confirm-delete-description", {
                  name: pendingDeleteTool.name,
                })
              : undefined
          }
          confirmText={t("delete")}
          onConfirm={() => {
            if (!pendingDeleteTool?.id) return;
            deleteMut.mutate(pendingDeleteTool.id);
            setPendingDeleteTool(null);
          }}
          loading={deleteMut.isPending}
        />
      </div>
    </>
  );
}
