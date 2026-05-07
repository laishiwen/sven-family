import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  agentsApi,
  modelsApi,
  providersApi,
  toolsApi,
  skillsApi,
  promptsApi,
  mcpApi,
  ragApi,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plus,
  Bot,
  Pencil,
  Trash2,
  Cpu,
  Wrench,
  BookOpen,
  Network,
  Database,
  CheckCircle2,
  Search,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MonacoEditor from "@monaco-editor/react";
import { EmptyState } from "@/components/EmptyState";
import { ModelCombobox, ProviderRecord } from "@/components/ModelCombobox";
import { useToastStore } from "@/stores/toastStore";

const DEFAULT_STRUCTURED_OUTPUT_SCHEMA = `{
  "type": "object",
  "properties": {
    "answer": {
      "type": "string",
      "description": "Primary answer for the user"
    }
  },
  "required": ["answer"],
  "additionalProperties": false
}`;

type AgentRecord = {
  id: string;
  name: string;
  description?: string | null;
  model_id?: string | null;
  system_prompt_type: string;
  system_prompt?: string | null;
  temperature: number;
  max_tokens: number;
  tool_ids_json: string;
  skill_ids_json: string;
  prompt_ids_json: string;
  mcp_server_ids_json: string;
  kb_ids_json: string;
  sub_agent_ids_json?: string;
  working_directory?: string | null;
  hitl_enabled?: boolean;
  hitl_approval_level?: string;
  sub_agent_max_depth?: number;
  structured_output_enabled?: boolean;
  structured_output_schema_json?: string | null;
  enabled: boolean;
  created_at?: string;
};

function AgentGridSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-7 w-7" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type AgentFormState = {
  name: string;
  description: string;
  model_id: string;
  system_prompt_type: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  toolIds: string[];
  skillIds: string[];
  promptIds: string[];
  mcpIds: string[];
  ragIds: string[];
  subAgentIds: string[];
  workingDirectory: string;
  hitlEnabled: boolean;
  hitlApprovalLevel: string;
  subAgentMaxDepth: number;
  structured_output_enabled: boolean;
  structured_output_schema_json: string;
};

function parseIds(value?: string): string[] {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

function getErrorDetail(error: any, fallback: string): string {
  return error?.response?.data?.detail || fallback;
}

function isValidJsonObject(value: string): boolean {
  try {
    const parsed = JSON.parse(value || "{}");
    return Boolean(
      parsed && typeof parsed === "object" && !Array.isArray(parsed),
    );
  } catch {
    return false;
  }
}

function buildInitialForm(agent?: AgentRecord): AgentFormState {
  if (!agent) {
    return {
      name: "",
      description: "",
      model_id: "",
      system_prompt_type: "none",
      system_prompt: "",
      temperature: 0.7,
      max_tokens: 2048,
      toolIds: [],
      skillIds: [],
      promptIds: [],
      mcpIds: [],
      ragIds: [],
      subAgentIds: [],
      workingDirectory: "",
      hitlEnabled: false,
      hitlApprovalLevel: "tool_call",
      subAgentMaxDepth: 1,
      structured_output_enabled: false,
      structured_output_schema_json: DEFAULT_STRUCTURED_OUTPUT_SCHEMA,
    };
  }
  return {
    name: agent.name,
    description: agent.description || "",
    model_id: agent.model_id || "",
    system_prompt_type: agent.system_prompt_type || "none",
    system_prompt: agent.system_prompt || "",
    temperature: agent.temperature ?? 0.7,
    max_tokens: agent.max_tokens ?? 2048,
    toolIds: parseIds(agent.tool_ids_json),
    skillIds: parseIds(agent.skill_ids_json),
    promptIds: parseIds(agent.prompt_ids_json),
    mcpIds: parseIds(agent.mcp_server_ids_json),
    ragIds: parseIds(agent.kb_ids_json),
    subAgentIds: parseIds(agent.sub_agent_ids_json),
    workingDirectory: agent.working_directory || "",
    hitlEnabled: Boolean(agent.hitl_enabled),
    hitlApprovalLevel: agent.hitl_approval_level || "tool_call",
    subAgentMaxDepth: agent.sub_agent_max_depth ?? 1,
    structured_output_enabled: Boolean(agent.structured_output_enabled),
    structured_output_schema_json:
      agent.structured_output_schema_json || DEFAULT_STRUCTURED_OUTPUT_SCHEMA,
  };
}

function CapabilityPicker({
  title,
  description,
  icon: Icon,
  items,
  selected,
  onChange,
  labelKey = "name",
  idKey = "id",
}: any) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState("");

  const filteredItems = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item: any) => {
      const haystack = [item[labelKey], item.description || ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [items, keyword, labelKey]);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((value: string) => value !== id)
        : [...selected, id],
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="secondary" className="text-[10px]">
          {selected.length}
        </Badge>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={t("agents.search-title", { title })}
        />
      </div>

      <div className="h-[260px] overflow-y-auto rounded-lg border border-border bg-muted/20">
        <div className="space-y-1 p-2">
          {filteredItems.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("common.no-items-available")}
            </div>
          )}
          {filteredItems.map((item: any) => {
            const id = item[idKey];
            const checked = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={cn(
                  "w-full flex items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
                  checked ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30",
                  )}
                >
                  {checked && <CheckCircle2 className="h-3 w-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item[labelKey]}</p>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgentModal({
  agent,
  models,
  providers,
  tools,
  skills,
  prompts,
  mcpServers,
  ragKbs,
  availableAgents,
  onClose,
  onSave,
  isSaving,
}: {
  agent?: AgentRecord | null;
  models: any[];
  providers: ProviderRecord[];
  tools: any[];
  skills: any[];
  prompts: any[];
  mcpServers: any[];
  ragKbs: any[];
  availableAgents: AgentRecord[];
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving?: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AgentFormState>(() =>
    buildInitialForm(agent || undefined),
  );
  const [structuredSchemaError, setStructuredSchemaError] = useState("");
  const [tab, setTab] = useState("basic");

  const save = () => {
    if (
      form.structured_output_enabled &&
      !isValidJsonObject(form.structured_output_schema_json)
    ) {
      setStructuredSchemaError(t("agents.structured-schema-invalid"));
      return;
    }
    setStructuredSchemaError("");
    onSave({
      name: form.name.trim(),
      description: form.description.trim(),
      model_id: form.model_id || null,
      system_prompt_type: form.system_prompt_type,
      system_prompt:
        form.system_prompt_type === "none" ? null : form.system_prompt.trim(),
      temperature: form.temperature,
      max_tokens: form.max_tokens,
      tool_ids_json: JSON.stringify(form.toolIds),
      skill_ids_json: JSON.stringify(form.skillIds),
      prompt_ids_json: JSON.stringify(form.promptIds),
      mcp_server_ids_json: JSON.stringify(form.mcpIds),
      kb_ids_json: JSON.stringify(form.ragIds),
      sub_agent_ids_json: JSON.stringify(form.subAgentIds),
      working_directory: form.workingDirectory.trim() || null,
      hitl_enabled: form.hitlEnabled,
      hitl_approval_level: form.hitlApprovalLevel,
      sub_agent_max_depth: form.subAgentMaxDepth,
      structured_output_enabled: form.structured_output_enabled,
      structured_output_schema_json: form.structured_output_schema_json,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-base">
            {agent ? t("agents.edit-agent") : t("agents.new-agent")}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-5 h-10">
            <TabsTrigger value="basic" className="text-xs gap-1.5">
              {t("agents.basic-info")}
            </TabsTrigger>
            <TabsTrigger value="tools" className="text-xs gap-1.5">
              <Wrench className="w-3 h-3" />
              {t("agents.tools")}
              {form.toolIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {form.toolIds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="skills" className="text-xs gap-1.5">
              <BookOpen className="w-3 h-3" />
              Skills
              {form.skillIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {form.skillIds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="prompts" className="text-xs gap-1.5">
              <ScrollText className="w-3 h-3" />
              Prompts
              {form.promptIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {form.promptIds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mcp" className="text-xs gap-1.5">
              <Network className="w-3 h-3" />
              MCP
              {form.mcpIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {form.mcpIds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="rag" className="text-xs gap-1.5">
              <Database className="w-3 h-3" />
              RAG
              {form.ragIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {form.ragIds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="subagents" className="text-xs gap-1.5">
              <Bot className="w-3 h-3" />
              {t("agents.subagents")}
              {form.subAgentIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {form.subAgentIds.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-5">
            <TabsContent value="basic" className="mt-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">
                    {t("agents.name-required")}
                  </Label>
                  <Input
                    id="agent-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, name: event.target.value }))
                    }
                    placeholder={t("agents.name-placeholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("agents.bound-model")}</Label>
                  <ModelCombobox
                    value={form.model_id}
                    onValueChange={(v) =>
                      setForm((c) => ({ ...c, model_id: v }))
                    }
                    models={models}
                    providers={providers}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-description">
                  {t("agents.description")}
                </Label>
                <Textarea
                  id="agent-description"
                  className="min-h-[80px]"
                  value={form.description}
                  onChange={(event) =>
                    setForm((c) => ({ ...c, description: event.target.value }))
                  }
                  placeholder={t("agents.description-placeholder")}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <Label>
                      {t("agents.generation-params.temperature-label")}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {form.temperature.toFixed(1)}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={2}
                    step={0.1}
                    value={[form.temperature]}
                    onValueChange={([v]) =>
                      setForm((c) => ({ ...c, temperature: v }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-max-tokens">
                    {t("agents.generation-params.max-tokens-label")}
                  </Label>
                  <Input
                    id="agent-max-tokens"
                    type="number"
                    min={1}
                    value={form.max_tokens}
                    onChange={(event) =>
                      setForm((c) => ({
                        ...c,
                        max_tokens: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("agents.prompt-type")}</Label>
                <Select
                  value={form.system_prompt_type}
                  onValueChange={(v) =>
                    setForm((c) => ({ ...c, system_prompt_type: v }))
                  }
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("agents.none")}</SelectItem>
                    <SelectItem value="template">
                      {t("agents.template")}
                    </SelectItem>
                    <SelectItem value="custom">{t("agents.custom")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.system_prompt_type !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="agent-system-prompt">
                    {t("agents.system-prompt-content")}
                  </Label>
                  <Textarea
                    id="agent-system-prompt"
                    className="min-h-[180px]"
                    value={form.system_prompt}
                    onChange={(event) =>
                      setForm((c) => ({
                        ...c,
                        system_prompt: event.target.value,
                      }))
                    }
                    placeholder={t("agents.system-prompt-placeholder")}
                  />
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <p className="text-sm">
                    {t("agents.enable-structured-output")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("agents.structured-output-hint")}
                  </p>
                </div>
                <Switch
                  checked={form.structured_output_enabled}
                  onCheckedChange={(checked) => {
                    setForm((c) => ({
                      ...c,
                      structured_output_enabled: checked,
                    }));
                    if (!checked) setStructuredSchemaError("");
                  }}
                />
              </div>

              {form.structured_output_enabled && (
                <div className="space-y-2">
                  <Label>{t("agents.output-schema")}</Label>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <MonacoEditor
                      height={200}
                      language="json"
                      theme="vs-dark"
                      value={form.structured_output_schema_json}
                      onChange={(value) => {
                        const next = value ?? "";
                        setForm((c) => ({
                          ...c,
                          structured_output_schema_json: next,
                        }));
                        if (structuredSchemaError && isValidJsonObject(next))
                          setStructuredSchemaError("");
                      }}
                      options={{
                        fontSize: 12,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: "on",
                        wordWrap: "on",
                        automaticLayout: true,
                        tabSize: 2,
                        padding: { top: 8, bottom: 8 },
                      }}
                    />
                  </div>
                  {structuredSchemaError && (
                    <p className="text-xs text-destructive">
                      {structuredSchemaError}
                    </p>
                  )}
                </div>
              )}

              {/* -- Working Directory -- */}
              <div className="space-y-2">
                <Label htmlFor="agent-work-dir">
                  {t("agents.working-directory")}
                </Label>
                <Input
                  id="agent-work-dir"
                  value={form.workingDirectory}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, workingDirectory: e.target.value }))
                  }
                  placeholder={t("agents.working-directory-placeholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("agents.working-directory-hint")}
                </p>
              </div>

              {/* -- HITL -- */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">{t("agents.hitl-enabled")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("agents.hitl-description")}
                    </p>
                  </div>
                  <Switch
                    checked={form.hitlEnabled}
                    onCheckedChange={(checked) =>
                      setForm((c) => ({ ...c, hitlEnabled: checked }))
                    }
                  />
                </div>
                {form.hitlEnabled && (
                  <div className="space-y-2">
                    <Label>{t("agents.hitl-approval-level")}</Label>
                    <Select
                      value={form.hitlApprovalLevel}
                      onValueChange={(v) =>
                        setForm((c) => ({ ...c, hitlApprovalLevel: v }))
                      }
                    >
                      <SelectTrigger className="max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tool_call">
                          {t("agents.hitl-level.tool_call")}
                        </SelectItem>
                        <SelectItem value="mcp_call">
                          {t("agents.hitl-level.mcp_call")}
                        </SelectItem>
                        <SelectItem value="all">
                          {t("agents.hitl-level.all")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* -- Sub-agent Max Depth -- */}
              <div className="space-y-2">
                <Label htmlFor="sub-agent-max-depth">
                  {t("agents.sub-agent-max-depth")}
                </Label>
                <Input
                  id="sub-agent-max-depth"
                  type="number"
                  min={1}
                  max={5}
                  value={form.subAgentMaxDepth}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      subAgentMaxDepth: Math.max(
                        1,
                        Math.min(5, Number(e.target.value) || 1),
                      ),
                    }))
                  }
                  className="max-w-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  {t("agents.sub-agent-max-depth-hint")}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="tools" className="mt-0">
              <p className="text-xs text-muted-foreground mb-3 px-1">
                {t("agents.tools-builtin-notice")}
              </p>
              <CapabilityPicker
                title={t("agents.tools")}
                description={t("agents.tools-description")}
                icon={Wrench}
                items={tools}
                selected={form.toolIds}
                onChange={(ids: string[]) =>
                  setForm((c) => ({ ...c, toolIds: ids }))
                }
              />
            </TabsContent>

            <TabsContent value="skills" className="mt-0">
              <CapabilityPicker
                title="Skills"
                description={t("agents.skills-description")}
                icon={BookOpen}
                items={skills}
                selected={form.skillIds}
                onChange={(ids: string[]) =>
                  setForm((c) => ({ ...c, skillIds: ids }))
                }
              />
            </TabsContent>

            <TabsContent value="mcp" className="mt-0">
              <CapabilityPicker
                title={t("agents.mcp-server")}
                description={t("agents.mcp-description")}
                icon={Network}
                items={mcpServers}
                selected={form.mcpIds}
                onChange={(ids: string[]) =>
                  setForm((c) => ({ ...c, mcpIds: ids }))
                }
              />
            </TabsContent>

            <TabsContent value="prompts" className="mt-0">
              <CapabilityPicker
                title="Prompts"
                description={t("agents.prompts-description")}
                icon={ScrollText}
                items={prompts}
                selected={form.promptIds}
                onChange={(ids: string[]) =>
                  setForm((c) => ({ ...c, promptIds: ids }))
                }
              />
            </TabsContent>

            <TabsContent value="rag" className="mt-0">
              <CapabilityPicker
                title={t("agents.rag-kb")}
                description={t("agents.rag-description")}
                icon={Database}
                items={ragKbs}
                selected={form.ragIds}
                onChange={(ids: string[]) =>
                  setForm((c) => ({ ...c, ragIds: ids }))
                }
              />
            </TabsContent>

            <TabsContent value="subagents" className="mt-0">
              <CapabilityPicker
                title={t("agents.subagents")}
                description={t("agents.subagents-description")}
                icon={Bot}
                items={availableAgents.filter((a) => a.id !== agent?.id)}
                labelKey="name"
                selected={form.subAgentIds}
                onChange={(ids: string[]) =>
                  setForm((c) => ({ ...c, subAgentIds: ids }))
                }
              />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t border-border px-5 py-3 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={!form.name.trim() || isSaving}>
            {isSaving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AgentRecord | null>(null);
  const [pendingDeleteAgent, setPendingDeleteAgent] =
    useState<AgentRecord | null>(null);

  const { data: agents = [], isLoading } = useQuery<AgentRecord[]>({
    queryKey: ["agents"],
    queryFn: () => agentsApi.list().then((r) => r.data),
  });
  const { data: models = [] } = useQuery<any[]>({
    queryKey: ["models"],
    queryFn: () => modelsApi.list().then((r) => r.data),
  });
  const { data: providers = [] } = useQuery<ProviderRecord[]>({
    queryKey: ["providers"],
    queryFn: () => providersApi.list().then((r) => r.data),
  });
  const { data: tools = [] } = useQuery<any[]>({
    queryKey: ["tools"],
    queryFn: () => toolsApi.list().then((r) => r.data),
  });
  const { data: skills = [] } = useQuery<any[]>({
    queryKey: ["skills"],
    queryFn: () => skillsApi.list().then((r) => r.data),
  });
  const { data: prompts = [] } = useQuery<any[]>({
    queryKey: ["prompts"],
    queryFn: () => promptsApi.list().then((r) => r.data),
  });
  const { data: mcpServers = [] } = useQuery<any[]>({
    queryKey: ["mcp"],
    queryFn: () => mcpApi.list().then((r) => r.data),
  });
  const { data: ragKbs = [] } = useQuery<any[]>({
    queryKey: ["rag-kbs"],
    queryFn: () => ragApi.list().then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => agentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setShowModal(false);
      addToast({ type: "success", message: t("agents.create-success") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: getErrorDetail(error, t("agents.create-failed")),
      });
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      agentsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setEditing(null);
      addToast({ type: "success", message: t("agents.update-success") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: getErrorDetail(error, t("agents.update-failed")),
      });
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      addToast({ type: "success", message: t("agents.deleted") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: getErrorDetail(error, t("agents.delete-failed")),
      });
    },
  });

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

  return (
    <div className="pt-4 px-6 pb-6 space-y-5">
      <div ref={actionBarRef} className="sticky-action-bar pt-3 pb-4">
        <div className="flex justify-end">
          <Button
            onClick={() => setShowModal(true)}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("agents.new-agent")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <AgentGridSkeleton />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-5 w-5 text-muted-foreground" />}
          title={t("agents.empty-title")}
          description={t("agents.empty-description")}
          action={{
            label: t("agents.new-first-agent"),
            onClick: () => setShowModal(true),
          }}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const model = models.find((item) => item.id === agent.model_id);
            const toolIds = parseIds(agent.tool_ids_json);
            const skillIds = parseIds(agent.skill_ids_json);
            const promptIds = parseIds(agent.prompt_ids_json);
            const mcpIds = parseIds(agent.mcp_server_ids_json);
            const ragIds = parseIds(agent.kb_ids_json);
            const subAgentIds = parseIds(agent.sub_agent_ids_json);

            return (
              <Card key={agent.id} className="group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                        <h3 className="truncate font-medium text-sm">
                          {agent.name}
                        </h3>
                      </div>
                      {agent.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {agent.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditing(agent)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit agent</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setPendingDeleteAgent(agent)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete agent</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Cpu className="h-3 w-3" />
                      {model?.name || t("agents.unbound-model")}
                    </Badge>
                    {agent.system_prompt_type !== "none" && (
                      <Badge variant="outline" className="text-[10px]">
                        {agent.system_prompt_type}
                      </Badge>
                    )}
                    {subAgentIds.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {subAgentIds.length} subs
                      </Badge>
                    )}
                    {toolIds.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {toolIds.length} tools
                      </Badge>
                    )}
                    {skillIds.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {skillIds.length} skills
                      </Badge>
                    )}
                    {mcpIds.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {mcpIds.length} mcp
                      </Badge>
                    )}
                    {ragIds.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {ragIds.length} rag
                      </Badge>
                    )}
                    {agent.hitl_enabled && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-amber-400 text-amber-600"
                      >
                        HITL
                      </Badge>
                    )}
                    {agent.working_directory && (
                      <Badge variant="outline" className="text-[10px]">
                        wd
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(showModal || editing) && (
        <AgentModal
          agent={editing}
          models={models}
          providers={providers}
          tools={tools}
          skills={skills}
          prompts={prompts}
          mcpServers={mcpServers}
          ragKbs={ragKbs}
          availableAgents={agents}
          isSaving={createMut.isPending || updateMut.isPending}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSave={(form) => {
            if (editing) {
              updateMut.mutate({ id: editing.id, data: form });
              return;
            }
            createMut.mutate(form);
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDeleteAgent}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteAgent(null);
        }}
        title={t("agents.confirm-delete-title")}
        description={
          pendingDeleteAgent
            ? t("agents.confirm-delete-description", {
                name: pendingDeleteAgent.name,
              })
            : undefined
        }
        confirmText={t("delete")}
        onConfirm={() => {
          if (!pendingDeleteAgent) return;
          deleteMut.mutate(pendingDeleteAgent.id);
          setPendingDeleteAgent(null);
        }}
        loading={deleteMut.isPending}
      />
    </div>
  );
}
