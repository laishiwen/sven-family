import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { mcpApi } from "@/lib/api";
import MonacoEditor from "@monaco-editor/react";
import {
  Plus,
  Server,
  Trash2,
  RefreshCw,
  ChevronDown,
  Search,
  Globe,
  CheckCircle,
  Loader2,
  Pencil,
  Wrench,
  Cable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
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
import { useToastStore } from "@/stores/toastStore";

const EDITOR_LINE_HEIGHT = 20;
const JSON_EDITOR_OPTIONS = {
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
  padding: { top: EDITOR_LINE_HEIGHT * 2, bottom: EDITOR_LINE_HEIGHT * 2 },
};

function prettifyJson(value: string | undefined, fallback: string) {
  const source = value?.trim() || fallback;
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

function buildInitialMcpForm(server?: any) {
  if (server)
    return {
      ...server,
      transport: server.transport || "stdio",
      args_json: prettifyJson(server.args_json, "[]"),
      env_json: prettifyJson(server.env_json, "{}"),
    };
  return {
    name: "",
    description: "",
    transport: "stdio",
    command: "",
    args_json: prettifyJson("[]", "[]"),
    url: "",
    env_json: prettifyJson("{}", "{}"),
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

interface RegistryServer {
  id: string;
  slug: string;
  name: string;
  description: string;
  transport: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  repository?: string;
  homepage?: string;
  categories: string[];
  requiredEnvVars: string[];
  envVarDetails: Array<{
    name: string;
    description: string;
    isSecret?: boolean;
    isRequired?: boolean;
  }>;
  runtime?: string;
  author?: string;
}

function MCPModal({
  server,
  onClose,
  onSave,
  isSaving,
}: {
  server?: any;
  onClose: () => void;
  onSave: (form: any) => void;
  isSaving?: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => buildInitialMcpForm(server));
  const isHttp =
    form.transport === "http" ||
    form.transport === "sse" ||
    form.transport === "streamable-http";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base">
            {server?.id ? t("mcp.modal.edit-title") : t("mcp.modal.add-title")}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-3 overflow-y-auto max-h-[70vh]">
          <div className="space-y-1.5">
            <Label>{t("mcp.modal.name-required")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My MCP Server"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("mcp.modal.transport")}</Label>
            <Select
              value={form.transport}
              onValueChange={(v) => setForm({ ...form, transport: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio</SelectItem>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="sse">SSE</SelectItem>
                <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isHttp ? (
            <>
              <div className="space-y-1.5">
                <Label>{t("mcp.modal.command")}</Label>
                <Input
                  className="font-mono text-sm"
                  value={form.command || ""}
                  onChange={(e) =>
                    setForm({ ...form, command: e.target.value })
                  }
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("mcp.modal.args-json")}</Label>
                <div className="rounded-md border border-border overflow-hidden">
                  <MonacoEditor
                    height={120}
                    language="json"
                    onMount={handleEditorMount}
                    value={form.args_json}
                    onChange={(val) =>
                      setForm({ ...form, args_json: val ?? "[]" })
                    }
                    options={{ ...JSON_EDITOR_OPTIONS, tabSize: 2 }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("mcp.modal.url-label")}</Label>
              <Input
                value={form.url || ""}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="http://localhost:3001/mcp"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("mcp.modal.env-json")}</Label>
            <div className="rounded-md border border-border overflow-hidden">
              <MonacoEditor
                height={140}
                language="json"
                onMount={handleEditorMount}
                value={form.env_json}
                onChange={(val) => setForm({ ...form, env_json: val ?? "{}" })}
                options={{ ...JSON_EDITOR_OPTIONS, tabSize: 2 }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("description")}</Label>
            <Input
              value={form.description || ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name || isSaving}
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            {t("mcp.modal.save-and-test")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 48;

function RegistryGrid({
  items,
  onAdd,
  isInstalled,
}: {
  items: RegistryServer[];
  onAdd: (item: RegistryServer) => void;
  isInstalled: (name: string) => boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPage(1);
  }, [items]);
  const visible = items.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < items.length;
  const loadMore = useCallback(() => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((item) => {
          const installed = isInstalled(item.name);
          return (
            <div
              key={item.id}
              className="border border-border rounded-lg p-3 flex flex-col gap-2"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {item.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {item.transport}
                </Badge>
                {item.categories.slice(0, 2).map((c) => (
                  <Badge key={c} variant="secondary" className="text-[10px]">
                    {c}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center justify-between mt-auto h-7">
                {item.requiredEnvVars.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t("mcp.env-required", {
                      count: item.requiredEnvVars.length,
                    })}
                  </span>
                ) : (
                  <span />
                )}
                {installed ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onAdd(item)}
                        className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Cable className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Connect server</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

function RegistryGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-7" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RegistryHubTab({
  search,
  onAddFromRegistry,
  installedServerNames,
}: {
  search: string;
  onAddFromRegistry: (prefill: any) => void;
  installedServerNames: Set<string>;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState("all");
  const { data: registryServers = [], isLoading } = useQuery<RegistryServer[]>({
    queryKey: ["mcp-registry"],
    queryFn: () => fetch("/mcp-registry.json").then((r) => r.json()),
    staleTime: 1000 * 60 * 60,
  });
  const categories = useMemo(() => {
    const cats = new Set<string>();
    (registryServers as RegistryServer[]).forEach((s) =>
      s.categories.forEach((c) => cats.add(c)),
    );
    return Array.from(cats).sort();
  }, [registryServers]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (registryServers as RegistryServer[]).filter((s) => {
      if (installedServerNames.has(s.name.toLowerCase())) return false;
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.author || "").toLowerCase().includes(q) ||
        s.categories.some((c) => c.toLowerCase().includes(q));
      const matchCat = category === "all" || s.categories.includes(category);
      return matchSearch && matchCat;
    });
  }, [registryServers, search, category, installedServerNames]);

  const handleAdd = (item: RegistryServer) => {
    onAddFromRegistry({
      name: item.name,
      description: item.description || "",
      transport:
        item.transport === "streamable-http"
          ? "http"
          : item.transport || "stdio",
      command: item.command || "",
      args_json: item.args ? JSON.stringify(item.args) : "[]",
      url: item.url || "",
      env_json: item.env ? JSON.stringify(item.env, null, 2) : "{}",
      source: "hub",
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder={t("mcp.category.all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("mcp.category.all")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {isLoading
            ? t("loading")
            : t("mcp.total-count", { count: filtered.length })}
        </span>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          <RegistryGridSkeleton count={8} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Globe className="w-5 h-5 text-muted-foreground" />}
          title={t("mcp.empty.not-found-title")}
          description={
            search.trim()
              ? t("mcp.empty.not-found-description-with-search", {
                  search: search.trim(),
                })
              : t("mcp.empty.not-found-description")
          }
        />
      ) : (
        <RegistryGrid
          items={filtered}
          onAdd={handleAdd}
          isInstalled={(name) => installedServerNames.has(name.toLowerCase())}
        />
      )}
    </div>
  );
}

function InstalledTab({
  search,
  onAdd,
}: {
  search: string;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState<any>(null);
  const [pendingDeleteServer, setPendingDeleteServer] = useState<any>(null);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);

  const { data: servers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => mcpApi.list().then((r) => r.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => mcpApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-servers"] });
      addToast({ type: "success", message: t("mcp.toast.deleted") });
    },
  });

  const testMut = useMutation({
    mutationFn: (id: string) => mcpApi.testConnection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-servers"] });
      addToast({ type: "success", message: t("mcp.toast.test-success") });
    },
    onError: () => {
      addToast({ type: "error", message: t("mcp.toast.test-failed") });
    },
    onSettled: () => {
      setTestingServerId(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => mcpApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-servers"] });
      setEditing(null);
      addToast({ type: "success", message: t("mcp.toast.updated") });
    },
    onError: (e: any) => {
      addToast({
        type: "error",
        message: e?.response?.data?.detail || t("mcp.toast.update-failed"),
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? (servers as any[]).filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description || "").toLowerCase().includes(q),
        )
      : (servers as any[]);
  }, [servers, search]);

  return (
    <>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Server className="w-5 h-5 text-muted-foreground" />}
          title={t("mcp.empty.installed-title")}
          description={t("mcp.empty.installed-description")}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {filtered.map((server: any) => {
            const isHub = server.source === "hub";
            const isTestingThisServer = testingServerId === server.id;
            return (
              <div
                key={server.id}
                className="group relative border border-border rounded-lg p-3"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isHub ? "bg-amber-50 dark:bg-amber-900/20" : "bg-amber-50 dark:bg-amber-900/20"}`}
                  >
                    {isHub ? (
                      <Globe className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">
                      {server.name}
                    </h3>
                    {server.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {server.description}
                      </p>
                    )}
                    <div className="flex gap-1 mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {server.transport}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="absolute top-2 right-2 hidden group-hover:flex gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setTestingServerId(server.id);
                          testMut.mutate(server.id);
                        }}
                        disabled={isTestingThisServer}
                      >
                        {isTestingThisServer ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Test server</TooltipContent>
                  </Tooltip>
                  {!isHub && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setEditing(server)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit server</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-destructive"
                        onClick={() => setPendingDeleteServer(server)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete server</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MCPModal
          server={editing}
          onClose={() => setEditing(null)}
          onSave={(form: any) =>
            updateMut.mutate({ id: editing.id, data: form })
          }
        />
      )}

      <ConfirmDialog
        open={!!pendingDeleteServer}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteServer(null);
        }}
        title={t("mcp.confirm-delete-title")}
        description={
          pendingDeleteServer
            ? t("mcp.confirm-delete-description", {
                name: pendingDeleteServer.name,
              })
            : undefined
        }
        confirmText={t("delete")}
        onConfirm={() => {
          if (!pendingDeleteServer) return;
          deleteMut.mutate(pendingDeleteServer.id);
          setPendingDeleteServer(null);
        }}
        loading={deleteMut.isPending}
      />
    </>
  );
}

export default function MCPPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState("hub");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalPrefill, setModalPrefill] = useState<any>(null);
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

  const { data: servers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => mcpApi.list().then((r) => r.data),
  });
  const installedServerNames = useMemo(
    () => new Set((servers as any[]).map((s: any) => s.name.toLowerCase())),
    [servers],
  );

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await mcpApi.create(data);
      await mcpApi.testConnection(res.data.id);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-servers"] });
      setShowModal(false);
      setModalPrefill(null);
      addToast({ type: "success", message: t("mcp.toast.created") });
    },
    onError: (e: any) => {
      addToast({
        type: "error",
        message: e?.response?.data?.detail || t("mcp.toast.create-failed"),
      });
    },
  });

  const handleAddFromRegistry = (prefill: any) => {
    setModalPrefill(prefill);
    setShowModal(true);
  };
  const handleOpenCustom = () => {
    setModalPrefill({
      source: "custom",
      name: "",
      description: "",
      transport: "stdio",
      command: "",
      args_json: "[]",
      url: "",
      env_json: "{}",
    });
    setShowModal(true);
  };

  return (
    <div className="pt-4 px-6 pb-6 space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div ref={actionBarRef} className="sticky-action-bar pt-3 pb-4">
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="hub" className="gap-1.5 text-xs">
                <Globe className="w-3.5 h-3.5" />
                {t("mcp.hub-tab")}
              </TabsTrigger>
              <TabsTrigger value="installed" className="gap-1.5 text-xs">
                <Server className="w-3.5 h-3.5" />
                {t("mcp.installed")}
                {(servers as any[]).length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {(servers as any[]).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-1.5">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder={t("mcp.search-placeholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    {t("mcp.add")}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem
                    onClick={() => setActiveTab("hub")}
                    className="gap-2 text-xs"
                  >
                    <Globe className="w-3.5 h-3.5 text-amber-500" />
                    {t("mcp.install-from-hub")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleOpenCustom}
                    className="gap-2 text-xs"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    {t("mcp.custom")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <TabsContent value="hub" className="mt-3">
          <RegistryHubTab
            search={search}
            onAddFromRegistry={handleAddFromRegistry}
            installedServerNames={installedServerNames}
          />
        </TabsContent>
        <TabsContent value="installed" className="mt-3">
          <InstalledTab search={search} onAdd={handleOpenCustom} />
        </TabsContent>
      </Tabs>

      {showModal && (
        <MCPModal
          server={modalPrefill}
          onClose={() => {
            setShowModal(false);
            setModalPrefill(null);
          }}
          onSave={(form: any) => createMut.mutate(form)}
          isSaving={createMut.isPending}
        />
      )}
    </div>
  );
}
