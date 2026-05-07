import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { promptsApi } from "@/lib/api";
import { useToastStore } from "@/stores/toastStore";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Pencil,
  Plus,
  ScrollText,
  Search,
  Tag,
  Trash2,
  X,
  Globe,
  Download,
  Loader2,
  CheckCircle,
  ChevronDown,
  Wrench,
  Eye,
} from "lucide-react";

type PromptRecord = {
  id: string;
  name: string;
  description?: string | null;
  content: string;
  tags_json: string;
  source: string;
  enabled: boolean;
  created_at?: string;
};

type HubItem = {
  id: string;
  title: string;
  description?: string | null;
  content: string;
  tags: string[];
  category?: string | null;
  author?: string | null;
  votes: number;
  type: string;
};

type PromptFormState = {
  name: string;
  description: string;
  content: string;
  tags: string[];
  source: string;
  enabled: boolean;
};

function parseTags(raw?: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((tag: any) => typeof tag === "string")
      .map((tag: string) => tag.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeTags(tags: string[]): string[] {
  const dedup = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) dedup.add(normalized);
  }
  return [...dedup];
}

function getErrorDetail(error: any, fallback: string): string {
  return error?.response?.data?.detail || fallback;
}

function pickPreviewText(
  content?: string | null,
  description?: string | null,
): string {
  const contentText = String(content || "").trim();
  if (contentText) return contentText;
  return String(description || "").trim();
}

function PromptGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-12" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TruncatedPreview({
  text,
  onView,
  className,
}: {
  text: string;
  onView: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const check = () => {
      setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    };

    check();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(check);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text]);

  return (
    <div className="group/preview relative">
      <p
        ref={textRef}
        className={`line-clamp-3 whitespace-pre-wrap break-words pr-7 ${className || ""}`}
      >
        {text}
      </p>
      {isTruncated ? (
        <button
          type="button"
          onClick={onView}
          className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border border-border bg-background/95 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/preview:opacity-100"
          title={t("prompts.preview.view-full")}
          aria-label={t("prompts.preview.view-full")}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function sanitizeSingleLineText(value: string): string {
  return value.replace(/[\p{C}□■�]/gu, "").replace(/[\r\n\t]/g, "");
}

function buildForm(prompt?: PromptRecord | null): PromptFormState {
  if (!prompt)
    return {
      name: "",
      description: "",
      content: "",
      tags: [],
      source: "custom",
      enabled: true,
    };
  return {
    name: sanitizeSingleLineText(prompt.name || ""),
    description: prompt.description || "",
    content: prompt.content || "",
    tags: parseTags(prompt.tags_json),
    source: prompt.source || "custom",
    enabled: prompt.enabled,
  };
}

function PromptModal({
  prompt,
  allTags,
  onClose,
  onSave,
  isSaving,
}: {
  prompt?: PromptRecord | null;
  allTags: string[];
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PromptFormState>(() => buildForm(prompt));
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    setForm(buildForm(prompt));
    setNewTag("");
  }, [prompt]);

  const addTag = (value: string) => {
    const incoming = value.trim();
    if (!incoming) return;
    setForm((c) => ({ ...c, tags: normalizeTags([...c.tags, incoming]) }));
    setNewTag("");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {prompt
              ? t("prompts.modal.edit-title")
              : t("prompts.modal.new-title")}
          </DialogTitle>
          <DialogDescription>
            {t("prompts.modal.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("prompts.modal.name-required")}</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    name: sanitizeSingleLineText(e.target.value),
                  }))
                }
                placeholder={t("prompts.modal.name-placeholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("description")}</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((c) => ({ ...c, description: e.target.value }))
                }
                placeholder={t("prompts.modal.description-placeholder")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("prompts.modal.content-required")}</Label>
            <Textarea
              className="min-h-[200px]"
              value={form.content}
              onChange={(e) =>
                setForm((c) => ({ ...c, content: e.target.value }))
              }
              placeholder={t("prompts.modal.content-placeholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("prompts.modal.tags")}</Label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder={t("prompts.modal.tag-placeholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(newTag);
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant={newTag.trim() ? "default" : "secondary"}
                onClick={() => addTag(newTag)}
                disabled={!newTag.trim()}
              >
                {t("prompts.modal.fill-tag")}
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((c) => ({
                          ...c,
                          tags: c.tags.filter((t) => t !== tag),
                        }))
                      }
                      className="opacity-70 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: sanitizeSingleLineText(form.name).trim(),
                description: form.description.trim() || null,
                content: form.content,
                tags_json: JSON.stringify(normalizeTags(form.tags)),
                source: form.source,
                enabled: form.enabled,
              })
            }
            disabled={!form.name.trim() || !form.content.trim() || isSaving}
          >
            {isSaving ? t("common.processing") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Prompts Hub Tab
// ════════════════════════════════════════════════════════════════════════════════

function PromptsHubTab({
  installedNames,
  search,
}: {
  installedNames: Set<string>;
  search: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState<{
    title: string;
    text: string;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data: hubData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["prompts-hub", debouncedQ],
    queryFn: () =>
      debouncedQ
        ? promptsApi.search({ q: debouncedQ }).then((r) => r.data)
        : promptsApi.hub().then((r) => r.data),
    staleTime: 120_000,
  });

  const hubItems: HubItem[] = hubData?.prompts ?? [];

  const handleImport = async (item: HubItem) => {
    const resolvedContent = pickPreviewText(item.content, item.description);
    if (!resolvedContent) {
      addToast({ type: "error", message: t("prompts.preview.no-content") });
      return;
    }

    setInstallingId(item.id);
    try {
      await promptsApi.create({
        name: item.title,
        description: item.description || null,
        content: resolvedContent,
        tags_json: JSON.stringify(item.tags || []),
        source: "hub",
      });
      setJustInstalled((prev) => new Set(prev).add(item.title));
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["prompt-tags"] });
      addToast({
        type: "success",
        message: t("prompts.toast.import-success", { name: item.title }),
      });
    } catch (e: any) {
      const detail = getErrorDetail(e, t("prompts.toast.import-failed"));
      addToast({ type: "error", message: detail });
    } finally {
      setInstallingId(null);
    }
  };

  const isImported = (title: string) =>
    installedNames.has(title) || justInstalled.has(title);

  return (
    <div className="space-y-3">
      {isLoading ? (
        <PromptGridSkeleton count={8} />
      ) : isError ? (
        <EmptyState
          icon={<Globe className="w-5 h-5 text-muted-foreground" />}
          title={t("prompts.hub-error")}
          description={String(error)}
        />
      ) : hubItems.length === 0 ? (
        <EmptyState
          icon={<Globe className="w-5 h-5 text-muted-foreground" />}
          title={t("prompts.empty.hub-title")}
          description={
            debouncedQ
              ? t("prompts.empty.hub-description")
              : t("prompts.empty.hub-description")
          }
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {hubItems.map((item) => {
            const imported = isImported(item.title);
            const installing = installingId === item.id;
            const previewText = pickPreviewText(item.content, item.description);
            return (
              <div
                key={item.id}
                className="group border border-border rounded-lg p-3 flex flex-col gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{item.title}</p>
                  {previewText ? (
                    <div className="mt-0.5">
                      <TruncatedPreview
                        text={previewText}
                        onView={() =>
                          setPreviewing({
                            title: item.title,
                            text: previewText,
                          })
                        }
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("prompts.preview.no-content")}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {item.author && (
                      <span className="text-[10px] text-muted-foreground">
                        @{item.author}
                      </span>
                    )}
                    {item.category && (
                      <Badge variant="outline" className="text-[10px] py-0">
                        {item.category}
                      </Badge>
                    )}
                    {item.tags.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] py-0"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/50 h-7">
                  <span className="text-[10px] text-muted-foreground">
                    {item.votes > 0 ? `▲ ${item.votes}` : ""}
                  </span>
                  {installing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : imported ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <button
                      onClick={() => handleImport(item)}
                      className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                      title={t("prompts.import")}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!previewing}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {previewing?.title || t("prompts.preview.dialog-title")}
            </DialogTitle>
            <DialogDescription>
              {t("prompts.preview.dialog-description")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap break-words">
            {previewing?.text || t("prompts.preview.no-content")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Installed Tab (existing functionality)
// ════════════════════════════════════════════════════════════════════════════════

function InstalledTab({ search }: { search: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PromptRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PromptRecord | null>(null);
  const [previewing, setPreviewing] = useState<{
    title: string;
    text: string;
  } | null>(null);

  const { data: prompts = [], isLoading } = useQuery<PromptRecord[]>({
    queryKey: ["prompts", search],
    queryFn: () => promptsApi.list(search || undefined).then((r) => r.data),
  });
  const { data: allTags = [] } = useQuery<string[]>({
    queryKey: ["prompt-tags"],
    queryFn: () => promptsApi.tags().then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => promptsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["prompt-tags"] });
      setShowCreate(false);
      addToast({ type: "success", message: t("prompts.toast.created") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: getErrorDetail(error, t("prompts.toast.create-failed")),
      });
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      promptsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["prompt-tags"] });
      setEditing(null);
      addToast({ type: "success", message: t("prompts.toast.updated") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: getErrorDetail(error, t("prompts.toast.update-failed")),
      });
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => promptsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["prompt-tags"] });
      addToast({ type: "success", message: t("prompts.toast.deleted") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: getErrorDetail(error, t("prompts.toast.delete-failed")),
      });
    },
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <PromptGridSkeleton count={6} />
      ) : prompts.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5 text-muted-foreground" />}
          title={t("prompts.empty.installed-title")}
          description={t("prompts.empty.installed-description")}
          action={{
            label: t("prompts.new-first"),
            onClick: () => setShowCreate(true),
          }}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {prompts.map((prompt) => {
            const tags = parseTags(prompt.tags_json);
            const isHub = prompt.source === "hub";
            const previewText = pickPreviewText(
              prompt.content,
              prompt.description,
            );
            return (
              <Card key={prompt.id} className="group flex flex-col">
                <CardContent className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-sm truncate">
                          {prompt.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 flex-shrink-0"
                        >
                          {isHub
                            ? t("prompts.source.hub")
                            : t("prompts.source.custom")}
                        </Badge>
                      </div>
                      {prompt.description ? (
                        <TruncatedPreview
                          text={prompt.description}
                          onView={() =>
                            setPreviewing({
                              title: prompt.name,
                              text: prompt.description || "",
                            })
                          }
                          className="text-xs text-muted-foreground mt-0.5"
                        />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditing(prompt)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit prompt</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setPendingDelete(prompt)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete prompt</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="mt-2 rounded-md border border-border bg-muted/30 p-2.5">
                    {previewText ? (
                      <TruncatedPreview
                        text={previewText}
                        onView={() =>
                          setPreviewing({
                            title: prompt.name,
                            text: previewText,
                          })
                        }
                        className="text-xs text-foreground"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("prompts.preview.no-content")}
                      </p>
                    )}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tags.map((tag) => (
                        <Badge
                          key={`${prompt.id}-${tag}`}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(showCreate || editing) && (
        <PromptModal
          prompt={editing}
          allTags={allTags}
          isSaving={createMut.isPending || updateMut.isPending}
          onClose={() => {
            setShowCreate(false);
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
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("prompts.confirm-delete-title")}
        description={
          pendingDelete
            ? t("prompts.confirm-delete-description", {
                name: pendingDelete.name,
              })
            : undefined
        }
        confirmText={t("delete")}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMut.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        loading={deleteMut.isPending}
      />

      <Dialog
        open={!!previewing}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {previewing?.title || t("prompts.preview.dialog-title")}
            </DialogTitle>
            <DialogDescription>
              {t("prompts.preview.dialog-description")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap break-words">
            {previewing?.text || t("prompts.preview.no-content")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Main PromptsPage
// ════════════════════════════════════════════════════════════════════════════════

export default function PromptsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState("hub");
  const [hubSearch, setHubSearch] = useState("");
  const [installedSearch, setInstalledSearch] = useState("");
  const [showCustomModal, setShowCustomModal] = useState(false);

  const { data: prompts = [] } = useQuery<PromptRecord[]>({
    queryKey: ["prompts", ""],
    queryFn: () => promptsApi.list().then((r) => r.data),
  });

  const installedNames = useMemo<Set<string>>(
    () => new Set((prompts as PromptRecord[]).map((p) => p.name)),
    [prompts],
  );

  const createMut = useMutation({
    mutationFn: (data: any) => promptsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["prompt-tags"] });
      setShowCustomModal(false);
      setActiveTab("installed");
      addToast({ type: "success", message: t("prompts.toast.created") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: getErrorDetail(error, t("prompts.toast.create-failed")),
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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div ref={actionBarRef} className="sticky-action-bar pt-3 pb-4">
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="hub" className="gap-1.5 text-xs">
                <Globe className="w-3.5 h-3.5" />
                {t("prompts.hub")}
              </TabsTrigger>
              <TabsTrigger value="installed" className="gap-1.5 text-xs">
                <ScrollText className="w-3.5 h-3.5" />
                {t("prompts.installed")}
                {(prompts as PromptRecord[]).length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {(prompts as PromptRecord[]).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-1.5">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder={
                    activeTab === "hub"
                      ? t("prompts.hub-search-placeholder")
                      : t("prompts.installed-search-placeholder")
                  }
                  value={activeTab === "hub" ? hubSearch : installedSearch}
                  onChange={(e) =>
                    activeTab === "hub"
                      ? setHubSearch(e.target.value)
                      : setInstalledSearch(e.target.value)
                  }
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    {t("prompts.new")}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem
                    onClick={() => setActiveTab("hub")}
                    className="gap-2 text-xs"
                  >
                    <Globe className="w-3.5 h-3.5 text-amber-500" />
                    {t("prompts.install-from-hub")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowCustomModal(true)}
                    className="gap-2 text-xs"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    {t("prompts.custom")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <TabsContent value="hub" className="mt-3">
          <PromptsHubTab installedNames={installedNames} search={hubSearch} />
        </TabsContent>
        <TabsContent value="installed" className="mt-3">
          <InstalledTab search={installedSearch} />
        </TabsContent>
      </Tabs>

      {showCustomModal && (
        <PromptModal
          prompt={null}
          allTags={[]}
          isSaving={createMut.isPending}
          onClose={() => setShowCustomModal(false)}
          onSave={(form) => createMut.mutate(form)}
        />
      )}
    </div>
  );
}
