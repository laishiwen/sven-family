import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { providersApi, modelsApi } from "@/lib/api";
import { healthColor } from "@/lib/utils";
import { useToastStore } from "@/stores/toastStore";
import {
  Plus,
  Cpu,
  Trash2,
  X,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  Eye,
  MessageSquare,
  Code2,
  Hash,
  ImageIcon,
  Zap,
  Pencil,
  FlaskConical,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google AI" },
  { value: "ollama", label: "provider.ollama-local" },
  { value: "custom", label: "provider.custom" },
];

const EMPTY_PROVIDER_FORM = {
  name: "",
  provider_type: "openai",
  base_url: "",
  api_key: "",
};

async function testProviderConnection(
  form: any,
  setState: (s: "idle" | "loading" | "ok" | "fail") => void,
  setMsg: (m: string) => void,
  t: (key: string, opts?: any) => string,
) {
  if (!form.base_url && !form.api_key) return;
  setState("loading");
  setMsg("");
  try {
    const url =
      (form.base_url || "https://api.openai.com/v1").replace(/\/$/, "") +
      "/models";
    const res = await fetch(url, {
      headers: form.api_key ? { Authorization: `Bearer ${form.api_key}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      setState("ok");
      setMsg(t("llm-page.connection-success"));
    } else if (res.status === 401 || res.status === 403) {
      setState("fail");
      setMsg(t("llm-page.auth-failed", { status: res.status }));
    } else {
      setState("fail");
      setMsg(t("llm-page.request-failed-http", { status: res.status }));
    }
  } catch (e: any) {
    setState("fail");
    setMsg(
      e?.message?.includes("timeout")
        ? t("llm-page.connection-timeout")
        : t("llm-page.connection-failed"),
    );
  }
}

function getModelCapabilities(model: any) {
  const id = (model.model_id || model.name || "").toLowerCase();
  const caps: { key: string; label: string; icon: any; cls: string }[] = [];

  const isEmbed = id.includes("embed");
  const isImage =
    id.includes("dall-e") ||
    id.includes("imagen") ||
    id.includes("stable") ||
    id.includes("flux");
  const isCode =
    id.includes("code") ||
    id.includes("deepseek-coder") ||
    id.includes("codex");

  if (isEmbed) {
    caps.push({
      key: "embed",
      label: "llm-page.cap.embedding",
      icon: Hash,
      cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    });
  }
  if (isImage) {
    caps.push({
      key: "image",
      label: "llm-page.cap.image",
      icon: ImageIcon,
      cls: "text-pink-500 bg-pink-50 dark:bg-pink-950/30",
    });
  }
  if (isCode) {
    caps.push({
      key: "code",
      label: "llm-page.cap.code",
      icon: Code2,
      cls: "text-green-500 bg-green-50 dark:bg-green-950/30",
    });
  }
  if (!isEmbed && !isImage) {
    caps.unshift({
      key: "chat",
      label: "llm-page.cap.chat",
      icon: MessageSquare,
      cls: "text-muted-foreground bg-muted",
    });
  }
  if (
    model.supports_vision ||
    id.includes("vision") ||
    id.includes("4o") ||
    id.includes("claude-3")
  ) {
    caps.push({
      key: "vision",
      label: "llm-page.cap.vision",
      icon: Eye,
      cls: "text-purple-500 bg-purple-50 dark:bg-purple-950/30",
    });
  }
  if (
    model.supports_function_call ||
    id.includes("function") ||
    id.includes("tool")
  ) {
    caps.push({
      key: "function",
      label: "llm-page.cap.function",
      icon: Zap,
      cls: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30",
    });
  }
  return caps;
}

function ModelCard({
  model,
  onDelete,
  onTest,
}: {
  model: any;
  onDelete: () => void;
  onTest: () => Promise<{ status: string; error?: string }>;
}) {
  const { t } = useTranslation();
  const caps = getModelCapabilities(model);
  const [testLoading, setTestLoading] = useState(false);

  async function handleTest() {
    setTestLoading(true);
    try {
      await onTest();
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="group relative border border-border rounded-lg p-3 flex flex-col gap-2 hover:bg-accent/40 transition-colors">
        <p className="font-medium text-sm truncate">{model.name}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">
          {model.model_id}
        </p>

        <div className="flex items-center justify-between mt-auto pt-0.5">
          <div className="flex items-center gap-1">
            {caps.map((cap) => {
              const CapIcon = cap.icon;
              return (
                <Tooltip key={cap.key}>
                  <TooltipTrigger asChild>
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center ${cap.cls}`}
                    >
                      <CapIcon className="w-3 h-3" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t(cap.label)}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleTest}
                  disabled={testLoading}
                >
                  {testLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3 h-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Test model</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onDelete}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete model</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ModelGroupGrid({
  models,
  onDelete,
  onTest,
}: {
  models: any[];
  onDelete: (id: string) => void;
  onTest: (id: string) => Promise<{ status: string; error?: string }>;
}) {
  const { t } = useTranslation();
  const groups: Record<string, any[]> = {};
  for (const m of models) {
    const key = m.owned_by || t("llm-page.owner.other");
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }

  const groupEntries = Object.entries(groups).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-3">
      {groupEntries.map(([owner, items]) => (
        <div key={owner}>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            {owner}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
            {items.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                onDelete={() => onDelete(m.id)}
                onTest={() => onTest(m.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProviderForm({
  form,
  onChange,
  testState,
  testMsg,
  onTest,
  saveError,
}: {
  form: any;
  onChange: (patch: any) => void;
  testState: "idle" | "loading" | "ok" | "fail";
  testMsg: string;
  onTest: () => void;
  saveError?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("llm-page.name-required")}</Label>
          <Input
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("llm-page.example.my-openai")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("type")}</Label>
          <Select
            value={form.provider_type}
            onValueChange={(v) => onChange({ provider_type: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_TYPES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label.startsWith("provider.")
                    ? t(item.label)
                    : item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("llm-page.api-base-url-label")}</Label>
        <Input
          value={form.base_url}
          onChange={(e) => onChange({ base_url: e.target.value })}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("llm-page.api-key-label")}</Label>
        <Input
          type="password"
          value={form.api_key}
          onChange={(e) => onChange({ api_key: e.target.value })}
          placeholder="sk-..."
        />
      </div>

      {testState !== "idle" && (
        <div
          className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${
            testState === "ok"
              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
              : testState === "fail"
                ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {testState === "loading" && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          )}
          {testState === "ok" && <CheckCircle className="w-3.5 h-3.5" />}
          {testState === "fail" && <XCircle className="w-3.5 h-3.5" />}
          {testState === "loading" ? t("llm-page.testing-connection") : testMsg}
        </div>
      )}

      {saveError && <p className="text-xs text-destructive">{saveError}</p>}

      <Button
        variant="outline"
        size="sm"
        onClick={onTest}
        disabled={testState === "loading" || (!form.base_url && !form.api_key)}
      >
        {testState === "loading" && (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        )}
        {t("llm-page.test-connection")}
      </Button>
    </div>
  );
}

function AddModelModal({
  providers,
  defaultProviderId,
  onClose,
  onSave,
}: {
  providers: any[];
  defaultProviderId?: string;
  onClose: () => void;
  onSave: (form: any) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    provider_id: defaultProviderId || providers[0]?.id || "",
    name: "",
    model_id: "",
    context_window: 4096,
    supports_vision: false,
    supports_function_call: false,
    cost_per_input_token: 0,
    cost_per_output_token: 0,
  });

  const content = (
    <TooltipProvider>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <h2 className="text-base font-semibold">
              {t("llm-page.manual-add-model")}
            </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                >
                  <X className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>

          <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1">
            <div className="space-y-1.5">
              <Label>{t("llm-page.provider-label")}</Label>
              <Select
                value={form.provider_id}
                onValueChange={(v) => setForm({ ...form, provider_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("llm-page.display-name-required")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("llm-page.example.gpt4o")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("llm-page.model-id-required")}</Label>
              <Input
                value={form.model_id}
                onChange={(e) => setForm({ ...form, model_id: e.target.value })}
                placeholder={t("llm-page.example.gpt4o-id")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("llm-page.context-window-label")}</Label>
                <Input
                  type="number"
                  value={form.context_window}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      context_window: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("llm-page.input-cost-label")}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.cost_per_input_token}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cost_per_input_token: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.supports_vision}
                  onChange={(e) =>
                    setForm({ ...form, supports_vision: e.target.checked })
                  }
                />
                {t("llm-page.supports-vision")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.supports_function_call}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      supports_function_call: e.target.checked,
                    })
                  }
                />
                {t("llm-page.supports-function-call")}
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border flex-shrink-0">
            <Button variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => onSave(form)}
              disabled={!form.name || !form.model_id}
            >
              {t("llm-page.add")}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function ProviderModal({
  provider,
  onClose,
  onSave,
  isPending,
  saveError,
}: {
  provider: any | null;
  onClose: () => void;
  onSave: (form: any) => void;
  isPending?: boolean;
  saveError?: string | null;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    provider
      ? {
          name: provider.name,
          provider_type: provider.provider_type,
          base_url: provider.base_url || "",
          api_key: "",
        }
      : { ...EMPTY_PROVIDER_FORM },
  );
  const [testState, setTestState] = useState<
    "idle" | "loading" | "ok" | "fail"
  >("idle");
  const [testMsg, setTestMsg] = useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {provider
              ? t("llm-page.edit-provider")
              : t("llm-page.add-provider")}
          </DialogTitle>
        </DialogHeader>
        <div className="py-1">
          <ProviderForm
            form={form}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            testState={testState}
            testMsg={testMsg}
            onTest={() =>
              testProviderConnection(form, setTestState, setTestMsg, t)
            }
            saveError={saveError}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name || isPending}
          >
            {isPending && (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            )}
            {provider
              ? t("llm-page.save-changes")
              : t("llm-page.create-provider")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LLMPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showModelModal, setShowModelModal] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [addProviderError, setAddProviderError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [editProviderError, setEditProviderError] = useState<string | null>(
    null,
  );

  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: () => providersApi.list().then((r) => r.data),
  });

  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => modelsApi.list().then((r) => r.data),
  });

  const healthChecked = useRef(false);

  useEffect(() => {
    if ((providers as any[]).length > 0) {
      if (!activeTab) {
        setActiveTab((providers as any[])[0].id);
      }
      if (!healthChecked.current) {
        healthChecked.current = true;
        (providers as any[]).forEach((p) => healthCheck.mutate(p.id));
      }
    }
  }, [providers]);

  const createProvider = useMutation({
    mutationFn: async (data: any) => {
      const res = await providersApi.create(data);
      const provider = res.data;
      try {
        await providersApi.fetchModels(provider.id);
      } catch {
        /* non-fatal */
      }
      return provider;
    },
    onSuccess: (provider) => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      qc.invalidateQueries({ queryKey: ["models"] });
      setAddProviderError(null);
      setShowAddProviderModal(false);
      setActiveTab(provider.id);
    },
    onError: (err: any) => {
      setAddProviderError(
        err?.response?.data?.detail ||
          err?.message ||
          t("llm-page.save-failed"),
      );
    },
  });

  const updateProvider = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      providersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      setEditingProvider(null);
      setEditProviderError(null);
    },
    onError: (err: any) => {
      setEditProviderError(
        err?.response?.data?.detail ||
          err?.message ||
          t("llm-page.save-failed"),
      );
    },
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) => providersApi.delete(id),
    onSuccess: (_: any, deletedId: string) => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      if (activeTab === deletedId) {
        const remaining = (providers as any[]).filter(
          (p) => p.id !== deletedId,
        );
        setActiveTab(remaining.length ? remaining[0].id : null);
      }
    },
  });

  const healthCheck = useMutation({
    mutationFn: (id: string) => providersApi.healthCheck(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers"] }),
  });

  const fetchModels = useMutation({
    mutationFn: (id: string) => providersApi.fetchModels(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });

  const createModel = useMutation({
    mutationFn: (data: any) => modelsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["models"] });
      setShowModelModal(false);
    },
  });

  const deleteModel = useMutation({
    mutationFn: (id: string) => modelsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });

  const activeProvider = (providers as any[]).find((p) => p.id === activeTab);
  const activeModels = (models as any[]).filter(
    (m) => m.provider_id === activeTab,
  );
  const normalizedModelSearchQuery = modelSearchQuery.trim().toLowerCase();
  const filteredActiveModels =
    normalizedModelSearchQuery.length === 0
      ? activeModels
      : activeModels.filter((m) => {
          const name = (m.name || "").toLowerCase();
          const modelId = (m.model_id || "").toLowerCase();
          const ownedBy = (m.owned_by || "").toLowerCase();
          return (
            name.includes(normalizedModelSearchQuery) ||
            modelId.includes(normalizedModelSearchQuery) ||
            ownedBy.includes(normalizedModelSearchQuery)
          );
        });

  const actionBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = actionBarRef.current;
    if (!bar) return;
    const container = bar.closest("[class*='overflow-y-auto']") || bar.parentElement;
    if (!container) return;
    const onScroll = () => {
      bar.classList.toggle("scrolled", container.scrollTop > 0);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <TooltipProvider>
      <div className="pt-4 px-6 pb-6 space-y-5">
        <div ref={actionBarRef} className="sticky-action-bar pt-3 pb-4">
          <div className="flex items-center justify-end">
            <Button
              onClick={() => {
                setAddProviderError(null);
                setShowAddProviderModal(true);
              }}
              size="sm"
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("llm-page.add-provider")}
            </Button>
          </div>
          {(providers as any[]).length > 0 && (
            <div>
              <div className="flex items-center gap-1 overflow-x-auto pb-px">
                {(providers as any[]).map((p) => (
                  <Button
                    key={p.id}
                    onClick={() => setActiveTab(p.id)}
                    variant={activeTab === p.id ? "default" : "ghost"}
                    size="sm"
                    className="flex items-center gap-1.5 rounded-t-lg rounded-b-none flex-shrink-0"
                  >
                    <Cpu className="w-3 h-3" />
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {(providers as any[]).length === 0 && (
          <EmptyState
            icon={<Cpu className="w-5 h-5" />}
            title={t("llm-page.empty-provider-title")}
            description={t("llm-page.empty-provider-description")}
            action={{
              label: t("llm-page.create-first-provider"),
              onClick: () => {
                setAddProviderError(null);
                setShowAddProviderModal(true);
              },
            }}
          />
        )}

        {activeProvider && (
          <div className="space-y-5">
            <div className="flex items-center justify-between border border-border rounded-lg p-3">
              <div className="flex items-center gap-3 min-w-0">
                <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {activeProvider.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {activeProvider.provider_type} ·{" "}
                    {activeProvider.base_url || t("llm-page.default-endpoint")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => fetchModels.mutate(activeProvider.id)}
                      disabled={fetchModels.isPending}
                    >
                      {fetchModels.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sync models</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => healthCheck.mutate(activeProvider.id)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Check health</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditProviderError(null);
                        setEditingProvider(activeProvider);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit provider</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmOpen(true)}
                      disabled={deleteProvider.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete provider</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">
                  {t("llm-page.model-list")}
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    {filteredActiveModels.length}
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  <Input
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    placeholder={t("llm-page.search-model-placeholder")}
                    className="w-56 h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowModelModal(true)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {t("llm-page.manual-add")}
                  </Button>
                </div>
              </div>

              {filteredActiveModels.length > 0 ? (
                <ModelGroupGrid
                  models={filteredActiveModels}
                  onDelete={(id) => deleteModel.mutate(id)}
                  onTest={async (id) => {
                    try {
                      const res = await modelsApi.test(id);
                      const result = res.data;
                      if (result.status === "healthy") {
                        addToast({
                          type: "success",
                          title: t("llm-page.model-test-success-title"),
                          message: t("llm-page.model-test-success-message"),
                        });
                        qc.invalidateQueries({ queryKey: ["providers"] });
                      } else {
                        addToast({
                          type: "error",
                          title: t("llm-page.model-test-failed-title"),
                          message:
                            result.error || t("llm-page.model-unavailable"),
                        });
                      }
                      return result;
                    } catch (err: any) {
                      addToast({
                        type: "error",
                        title: t("llm-page.test-request-failed-title"),
                        message:
                          err?.response?.data?.detail ||
                          err?.message ||
                          t("llm-page.model-request-failed"),
                      });
                      throw err;
                    }
                  }}
                />
              ) : normalizedModelSearchQuery ? (
                <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{t("llm-page.no-matched-models")}</p>
                </div>
              ) : (
                <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
                  <Download className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{t("llm-page.no-models")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {showAddProviderModal && (
          <ProviderModal
            provider={null}
            onClose={() => setShowAddProviderModal(false)}
            onSave={(form) => createProvider.mutate(form)}
            isPending={createProvider.isPending}
            saveError={addProviderError}
          />
        )}
        {editingProvider && (
          <ProviderModal
            provider={editingProvider}
            onClose={() => setEditingProvider(null)}
            onSave={(form) =>
              updateProvider.mutate({ id: editingProvider.id, data: form })
            }
            isPending={updateProvider.isPending}
            saveError={editProviderError}
          />
        )}

        {showModelModal && (
          <AddModelModal
            providers={providers as any[]}
            defaultProviderId={
              activeTab && activeTab !== "add" ? activeTab : undefined
            }
            onClose={() => setShowModelModal(false)}
            onSave={(form) => createModel.mutate(form)}
          />
        )}

        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("llm-page.confirm-delete-provider")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t("llm-page.delete-provider-prefix")}{" "}
              <span className="font-medium text-foreground">
                {activeProvider?.name}
              </span>{" "}
              {t("llm-page.delete-provider-suffix")}
            </p>
            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (activeProvider) deleteProvider.mutate(activeProvider.id);
                  setDeleteConfirmOpen(false);
                }}
                disabled={deleteProvider.isPending}
              >
                {deleteProvider.isPending && (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                )}
                {t("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
