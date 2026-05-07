import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { channelsApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  RefreshCw,
  MessageCircle,
  Mail,
  Send,
  Pencil,
  Search,
  CheckCircle2,
  Copy,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToastStore } from "@/stores/toastStore";

type ChannelItem = {
  id: string;
  channel_type: string;
  name: string;
  config_json: string;
  agent_id?: string | null;
  webhook_url?: string | null;
  health_status?: string | null;
};

type ChannelFormState = {
  channel_type: string;
  name: string;
  config_json: string;
  agent_id: string;
};

const CHANNEL_TYPES: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    descKey: string;
    sampleConfig: string;
  }
> = {
  telegram: {
    label: "Telegram",
    icon: <Send className="h-4 w-4" />,
    descKey: "channels.desc.telegram",
    sampleConfig: JSON.stringify(
      { bot_token: "", webhook_secret: "", allowed_chat_ids: [] },
      null,
      2,
    ),
  },
  lark: {
    label: "Feishu / Lark",
    icon: <MessageCircle className="h-4 w-4" />,
    descKey: "channels.desc.feishu",
    sampleConfig: JSON.stringify(
      { app_id: "", app_secret: "", encrypt_key: "" },
      null,
      2,
    ),
  },
  feishu: {
    label: "Feishu",
    icon: <MessageCircle className="h-4 w-4" />,
    descKey: "channels.desc.feishu",
    sampleConfig: JSON.stringify(
      { app_id: "", app_secret: "", encrypt_key: "" },
      null,
      2,
    ),
  },
  email: {
    label: "Email",
    icon: <Mail className="h-4 w-4" />,
    descKey: "channels.desc.email",
    sampleConfig: JSON.stringify(
      { smtp_host: "", smtp_port: 587, username: "", password: "" },
      null,
      2,
    ),
  },
  facebook: {
    label: "Facebook",
    icon: <MessageCircle className="h-4 w-4" />,
    descKey: "channels.desc.facebook",
    sampleConfig: JSON.stringify({ page_token: "", verify_token: "" }, null, 2),
  },
};

const EMPTY_FORM: ChannelFormState = {
  channel_type: "telegram",
  name: "",
  config_json: CHANNEL_TYPES.telegram.sampleConfig,
  agent_id: "",
};

function ChannelListSkeleton() {
  return (
    <div className="grid gap-2 xl:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="flex gap-1">
                <Skeleton className="h-7 w-7" />
                <Skeleton className="h-7 w-7" />
              </div>
            </div>
            <div className="rounded-md border border-border px-2.5 py-2 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatJson(value: string) {
  return JSON.stringify(JSON.parse(value), null, 2);
}

export default function ChannelsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ChannelItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChannelItem | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChannelFormState>(EMPTY_FORM);

  const { data: channels = [], isLoading } = useQuery<ChannelItem[]>({
    queryKey: ["channels"],
    queryFn: () => channelsApi.list().then((r) => r.data),
  });

  const jsonError = useMemo(() => {
    try {
      JSON.parse(form.config_json || "{}");
      return "";
    } catch (error: any) {
      return error?.message || "Invalid JSON";
    }
  }, [form.config_json]);

  const filteredChannels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return channels;
    return channels.filter((ch) => {
      const typeLabel =
        CHANNEL_TYPES[ch.channel_type]?.label || ch.channel_type;
      return [ch.name, ch.channel_type, typeLabel, ch.webhook_url || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [channels, query]);

  const createMut = useMutation({
    mutationFn: (data: ChannelFormState) => channelsApi.create(data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["channels"] });
      addToast({ type: "success", message: t("channels.toast-created") });
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("channels.toast-create-failed"),
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ChannelFormState }) =>
      channelsApi.update(id, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["channels"] });
      addToast({ type: "success", message: t("channels.toast-updated") });
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("channels.toast-update-failed"),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => channelsApi.delete(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["channels"] });
      addToast({ type: "success", message: t("channels.toast-deleted") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("channels.toast-delete-failed"),
      });
    },
  });

  const testMut = useMutation({
    mutationFn: (id: string) => channelsApi.test(id),
    onSuccess: () => {
      addToast({ type: "success", message: t("channels.toast-test-success") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("channels.toast-test-failed"),
      });
    },
    onSettled: () => {
      setTestingId(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (channel: ChannelItem) => {
    setEditing(channel);
    setForm({
      channel_type: channel.channel_type,
      name: channel.name,
      config_json: channel.config_json || "{}",
      agent_id: channel.agent_id || "",
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (jsonError) return;
    if (editing) {
      updateMut.mutate({ id: editing.id, data: form });
      return;
    }
    createMut.mutate(form);
  };

  const copyWebhook = async (value?: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      addToast({ type: "success", message: t("channels.toast-copy-success") });
    } catch {
      addToast({ type: "error", message: t("channels.toast-copy-failed") });
    }
  };

  const isSubmitting = createMut.isPending || updateMut.isPending;

  return (
    <div className="pt-4 px-6 pb-6 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("channels.search-placeholder")}
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" />
          {t("channels.add-button")}
        </Button>
      </div>

      {isLoading ? (
        <ChannelListSkeleton />
      ) : filteredChannels.length === 0 ? (
        <EmptyState
          icon={<Send className="h-5 w-5 text-muted-foreground" />}
          title={t("channels.empty-title")}
          description={t("channels.empty-description")}
          action={{ label: t("channels.add-button"), onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {filteredChannels.map((ch) => {
            const info = CHANNEL_TYPES[ch.channel_type] || {
              label: ch.channel_type,
              icon: <MessageCircle className="h-4 w-4" />,
              descKey: "",
              sampleConfig: "{}",
            };

            const healthy = ch.health_status === "healthy";
            return (
              <Card key={ch.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                        {info.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">
                            {ch.name}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {info.label}
                          </Badge>
                          <Badge
                            variant={healthy ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {healthy
                              ? t("channels.health-healthy")
                              : t("channels.health-unknown")}
                          </Badge>
                        </div>
                        {info.descKey && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {t(info.descKey)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setTestingId(ch.id);
                          testMut.mutate(ch.id);
                        }}
                        disabled={testMut.isPending}
                        title={t("channels.button-test")}
                      >
                        {testingId === ch.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(ch)}
                        title={t("channels.button-edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive"
                        onClick={() => setPendingDelete(ch)}
                        title={t("channels.button-delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t("channels.webhook-url")}
                      </p>
                      <p className="text-xs truncate">
                        {ch.webhook_url || t("channels.webhook-not-generated")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5"
                      onClick={() => copyWebhook(ch.webhook_url)}
                      disabled={!ch.webhook_url}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {t("channels.button-copy")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-border">
            <DialogTitle className="text-base">
              {editing
                ? t("channels.modal-title-edit")
                : t("channels.modal-title-new")}
            </DialogTitle>
          </DialogHeader>

          <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("channels.label-type")}</Label>
                <Select
                  value={form.channel_type}
                  onValueChange={(value) => {
                    const sample = CHANNEL_TYPES[value]?.sampleConfig || "{}";
                    setForm((current) => ({
                      ...current,
                      channel_type: value,
                      config_json:
                        editing || current.config_json.trim() !== ""
                          ? current.config_json
                          : sample,
                    }));
                  }}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANNEL_TYPES).map(([key, item]) => (
                      <SelectItem key={key} value={key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("channels.label-name")}</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder={t("channels.name-placeholder")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("channels.label-config")}</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={() => {
                      try {
                        setForm((current) => ({
                          ...current,
                          config_json: formatJson(current.config_json || "{}"),
                        }));
                      } catch {
                        addToast({
                          type: "error",
                          message: t("channels.toast-format-error"),
                        });
                      }
                    }}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    {t("channels.button-format")}
                  </Button>
                </div>
              </div>
              <Textarea
                value={form.config_json}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    config_json: event.target.value,
                  }))
                }
                rows={12}
                className="font-mono text-xs"
                placeholder='{"bot_token": "..."}'
              />
              {jsonError ? (
                <p className="text-xs text-destructive">
                  {t("channels.error-invalid-json", { error: jsonError })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("channels.valid-json-message")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("channels.label-agent-id")}</Label>
              <Input
                value={form.agent_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    agent_id: event.target.value,
                  }))
                }
                placeholder={t("channels.agent-id-placeholder")}
              />
            </div>
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={isSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                !form.name.trim() ||
                !form.channel_type.trim() ||
                !!jsonError
              }
            >
              {isSubmitting && (
                <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              )}
              {editing
                ? t("channels.button-update")
                : t("channels.button-create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("channels.delete-confirm-title")}
        description={
          pendingDelete
            ? t("channels.delete-confirm-description", {
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
    </div>
  );
}
