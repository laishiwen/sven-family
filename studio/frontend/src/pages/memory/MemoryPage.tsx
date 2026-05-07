import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { memoriesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Cpu,
  Loader2,
  Pencil,
  Check,
  X,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ConfigItem = { id: string; name: string; memory_enabled: boolean };
type MemoryConfig = {
  global_enabled: boolean;
  models: ConfigItem[];
  agents: ConfigItem[];
};
type MemoryEntry = {
  id: string;
  key: string;
  value: string;
  created_at: string;
};

function MemoryEntriesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-background px-2.5 py-2 space-y-2"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function MemoryList({
  scope,
  scopeId,
}: {
  scope: "agent" | "model" | "session";
  scopeId?: string;
}) {
  const qc = useQueryClient();

  const { data: memories = [], isLoading } = useQuery<MemoryEntry[]>({
    queryKey: ["memory-entries", scope, scopeId ?? "_all"],
    queryFn: () =>
      memoriesApi
        .list(scopeId ? { scope, scope_id: scopeId } : { scope })
        .then((r) => r.data),
  });

  const deleteMem = useMutation({
    mutationFn: (id: string) => memoriesApi.delete(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["memory-entries", scope, scopeId] }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [creating, setCreating] = useState(false);

  const createMem = useMutation({
    mutationFn: () =>
      memoriesApi.create({
        key: newKey.trim(),
        value: newValue.trim(),
        scope,
        scope_id: scopeId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory-entries", scope, scopeId] });
      setShowNew(false);
      setNewKey("");
      setNewValue("");
    },
  });

  const startEdit = (m: MemoryEntry) => {
    setEditingId(m.id);
    setEditValue(m.value);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async (memoryId: string) => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      await memoriesApi.update(memoryId, editValue.trim());
      qc.invalidateQueries({ queryKey: ["memory-entries", scope, scopeId] });
      setEditingId(null);
      setEditValue("");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <MemoryEntriesSkeleton count={3} />;
  }

  if (memories.length === 0 && !showNew) {
    return (
      <div className="py-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          No memories recorded yet. Enable memory and run an agent to generate
          memories.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowNew(true)}
        >
          + New Memory
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 pt-2 pb-1">
      <div className="flex items-center justify-between px-2.5 mb-1">
        <span className="text-[11px] text-muted-foreground">
          {memories.length} {memories.length === 1 ? "entry" : "entries"}
        </span>
        {!showNew && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] gap-1"
            onClick={() => setShowNew(true)}
          >
            + New
          </Button>
        )}
      </div>

      {showNew && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-2 mb-2">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Key (e.g. User preference)"
            className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all"
            autoFocus
          />
          <textarea
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Memory content..."
            rows={2}
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all resize-y font-mono min-h-[48px]"
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={creating || !newKey.trim() || !newValue.trim()}
              onClick={() => createMem.mutate()}
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setShowNew(false);
                setNewKey("");
                setNewValue("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {memories.map((m) => (
        <div
          key={m.id}
          className="group flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-background/60 transition-colors"
        >
          {editingId === m.id ? (
            <div className="flex-1 space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                {m.key}
              </span>
              <Textarea
                className="min-h-[48px] text-xs font-mono resize-y"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                    saveEdit(m.id);
                  if (e.key === "Escape") cancelEdit();
                }}
                autoFocus
              />
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => saveEdit(m.id)}
                  disabled={saving || !editValue.trim()}
                >
                  <Check className="h-3 w-3 mr-1" /> Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={cancelEdit}
                >
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {m.key}
                </span>
                <p className="text-xs leading-relaxed mt-0.5 text-foreground/80">
                  {m.value}
                </p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => startEdit(m)}
                      className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-all"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => deleteMem.mutate(m.id)}
                      className="p-1 rounded-md text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function GlobalCard({
  globalOn,
  onToggle,
}: {
  globalOn: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="py-0 px-0">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50 dark:bg-violet-900/20 flex-shrink-0">
              <BrainCircuit className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <div className="text-left">
              <p className="text-sm">{t("memory.global-toggle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("memory.global-hint")}
              </p>
            </div>
          </button>
          <Switch checked={globalOn} onCheckedChange={onToggle} />
        </div>
        {expanded && (
          <div className="px-4 pb-3 border-t border-border/40">
            <MemoryList scope="session" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpandableCard({
  item,
  icon: Icon,
  iconBg,
  iconColor,
  scope,
  onToggle,
}: {
  item: ConfigItem;
  icon: typeof Bot;
  iconBg: string;
  iconColor: string;
  scope: "agent" | "model";
  onToggle: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="py-0 px-0">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0 ${iconBg}`}
            >
              <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
            </div>
            <span className="text-sm truncate">{item.name}</span>
          </button>
          <Switch checked={item.memory_enabled} onCheckedChange={onToggle} />
        </div>
        {expanded && (
          <div className="px-4 pb-3 border-t border-border/40">
            <MemoryList scope={scope} scopeId={item.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MemoryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<MemoryConfig>({
    queryKey: ["memory-config"],
    queryFn: () => memoriesApi.config().then((r) => r.data),
  });

  const globalMut = useMutation({
    mutationFn: (enabled: boolean) => memoriesApi.toggleGlobal(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory-config"] }),
  });

  const modelMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      memoriesApi.toggleModel(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory-config"] }),
  });

  const agentMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      memoriesApi.toggleAgent(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory-config"] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-5 p-6 max-w-3xl">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-6 w-10" />
            </div>
            <MemoryEntriesSkeleton count={2} />
          </CardContent>
        </Card>
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Card>
            <CardContent className="p-4">
              <MemoryEntriesSkeleton count={4} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const models = data?.models ?? [];
  const agents = data?.agents ?? [];
  const globalOn = data?.global_enabled ?? false;

  return (
    <div className="space-y-5 p-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">{t("memory.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("memory.description")}
        </p>
      </div>

      <GlobalCard globalOn={globalOn} onToggle={(v) => globalMut.mutate(v)} />

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="w-3.5 h-3.5" />
            {t("agents")}
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {agents.filter((a) => a.memory_enabled).length}/{agents.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-1.5">
            <Cpu className="w-3.5 h-3.5" />
            {t("llm")}
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {models.filter((m) => m.memory_enabled).length}/{models.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-3 space-y-1.5">
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("memory.empty-agents")}
            </p>
          ) : (
            agents.map((item) => (
              <ExpandableCard
                key={item.id}
                item={item}
                icon={Bot}
                iconBg="bg-emerald-50 dark:bg-emerald-900/20"
                iconColor="text-emerald-500"
                scope="agent"
                onToggle={(v) => agentMut.mutate({ id: item.id, enabled: v })}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="models" className="mt-3 space-y-1.5">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("memory.empty-models")}
            </p>
          ) : (
            models.map((item) => (
              <ExpandableCard
                key={item.id}
                item={item}
                icon={Cpu}
                iconBg="bg-amber-50 dark:bg-amber-900/20"
                iconColor="text-amber-600"
                scope="model"
                onToggle={(v) => modelMut.mutate({ id: item.id, enabled: v })}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
