import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crawlerApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search as SearchIcon,
  Plus,
  Edit3,
  Trash2,
  Play,
  Rss,
  Globe,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CrawlerSource {
  id: string;
  name: string;
  site_url: string;
  rss_url: string;
  schedule_cron: string;
  enabled: boolean;
  tags: string | string[];
  auto_publish: boolean;
  last_run_at: string | null;
  last_status: string | null;
  created_at?: string;
}

interface CrawlerListResponse {
  items: CrawlerSource[];
  total: number;
  page: number;
  page_size: number;
}

const emptyForm = {
  name: "",
  site_url: "",
  rss_url: "",
  schedule_cron: "0 */6 * * *",
  enabled: true,
  tags: "",
  auto_publish: true,
};

const cronPresets = [
  { label: "每30分钟", value: "*/30 * * * *" },
  { label: "每1小时", value: "0 * * * *" },
  { label: "每6小时", value: "0 */6 * * *" },
  { label: "每天凌晨2点", value: "0 2 * * *" },
];

export default function EngineManagement() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filterEnabled, setFilterEnabled] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<CrawlerSource | null>(
    null,
  );
  const [form, setForm] = useState(emptyForm);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CrawlerListResponse>({
    queryKey: ["crawler-sources", filterEnabled, searchTerm, page],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (filterEnabled !== "all") params.enabled = filterEnabled === "enabled";
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const res = await crawlerApi.list(params);
      return res.data;
    },
  });

  const patchCurrentSources = (
    updater: (old: CrawlerListResponse) => CrawlerListResponse,
  ) => {
    queryClient.setQueryData<CrawlerListResponse>(
      ["crawler-sources", filterEnabled],
      (old) => {
        if (!old) return old;
        return updater(old);
      },
    );
  };

  const createMutation = useMutation({
    mutationFn: (data: unknown) => crawlerApi.create(data),
    onSuccess: (resp) => {
      toast("数据源已创建", { variant: "success" });
      const created = resp?.data as CrawlerSource | undefined;
      if (created) {
        patchCurrentSources((old) => ({
          ...old,
          items: [created, ...old.items],
          total: old.total + 1,
        }));
      }
      closeForm();
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || "创建失败", {
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crawlerApi.delete(id),
    onSuccess: (_, deletedId) => {
      toast("数据源已删除", { variant: "success" });
      patchCurrentSources((old) => ({
        ...old,
        items: old.items.filter((item) => item.id !== deletedId),
        total: Math.max(0, old.total - 1),
      }));
      setShowDelete(null);
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || "删除失败", {
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      crawlerApi.update(id, data),
    onSuccess: (resp) => {
      toast("数据源已更新", { variant: "success" });
      const updated = resp?.data as CrawlerSource | undefined;
      if (updated) {
        patchCurrentSources((old) => ({
          ...old,
          items: old.items.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }));
      }
      closeForm();
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || "更新失败", {
        variant: "destructive",
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      crawlerApi.update(id, { enabled }),
    onSuccess: (resp) => {
      const updated = resp?.data as CrawlerSource | undefined;
      if (updated) {
        patchCurrentSources((old) => ({
          ...old,
          items: old.items.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }));
      }
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || "切换失败", {
        variant: "destructive",
      }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => crawlerApi.trigger(id),
    onMutate: (sourceId) => {
      patchCurrentSources((old) => ({
        ...old,
        items: old.items.map((item) =>
          item.id === sourceId
            ? {
                ...item,
                last_run_at: new Date().toISOString(),
                last_status: "running",
              }
            : item,
        ),
      }));
    },
    onSuccess: (_resp, sourceId) => {
      toast("采集已触发", { variant: "success" });
      patchCurrentSources((old) => ({
        ...old,
        items: old.items.map((item) =>
          item.id === sourceId
            ? {
                ...item,
                last_status: "triggered",
                last_run_at: new Date().toISOString(),
              }
            : item,
        ),
      }));
      queryClient.invalidateQueries({ queryKey: ["crawler-overview"] });
      setRunningSourceId(null);
    },
    onError: (err: any, sourceId) => {
      patchCurrentSources((old) => ({
        ...old,
        items: old.items.map((item) =>
          item.id === sourceId ? { ...item, last_status: "failed" } : item,
        ),
      }));
      toast(err?.response?.data?.detail || "启动失败", {
        variant: "destructive",
      });
      setRunningSourceId(null);
    },
  });

  const openNewForm = () => {
    setEditingSource(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (source: CrawlerSource) => {
    setEditingSource(source);
    setForm({
      name: source.name,
      site_url: source.site_url,
      rss_url: source.rss_url,
      schedule_cron: source.schedule_cron,
      enabled: source.enabled,
      tags: Array.isArray(source.tags) ? source.tags.join(",") : source.tags,
      auto_publish: source.auto_publish,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingSource(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast("名称不能为空", { variant: "destructive" });
      return;
    }
    const payload = { ...form };
    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleEnabled = (source: CrawlerSource) => {
    toggleMutation.mutate({ id: source.id, enabled: !source.enabled });
  };

  const sources = Array.isArray(data?.items) ? data.items : [];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap flex-shrink-0 pb-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索名称/URL..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={filterEnabled}
          onValueChange={(v) => {
            setFilterEnabled(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="enabled">已启用</SelectItem>
            <SelectItem value="disabled">已禁用</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={openNewForm}>
          <Plus className="w-4 h-4 mr-1" />
          添加引擎
        </Button>
      </div>

      {/* Table — scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0 border border-border rounded-lg">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : sources.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <SearchIcon className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">
                {searchTerm || filterEnabled !== "all"
                  ? "无匹配结果"
                  : "暂无数据源"}
              </p>
              {!searchTerm && filterEnabled === "all" && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={openNewForm}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加引擎
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    名称
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    网站/RSS
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase whitespace-nowrap">
                    定时表达式
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase whitespace-nowrap">
                    标签
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    状态
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr
                    key={source.id}
                    className={`border-b border-border hover:bg-muted/50 transition-colors ${startMutation.isPending && runningSourceId === source.id ? "bg-primary/5" : ""}`}
                  >
                    <td
                      className="px-4 py-3 font-medium max-w-[170px] truncate"
                      title={source.name}
                    >
                      {source.name}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-0.5 max-w-[200px] overflow-hidden">
                        {source.site_url ? (
                          <a
                            href={source.site_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-xs truncate block"
                            title={source.site_url}
                          >
                            <Globe className="w-3 h-3 inline mr-1 shrink-0" />
                            {source.site_url}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground/40 block">
                            —
                          </span>
                        )}
                        {/* {source.rss_url && (
                          <a
                            href={source.rss_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-xs truncate block"
                            title={source.rss_url}
                          >
                            <Rss className="w-3 h-3 inline mr-1 shrink-0" />
                            {source.rss_url}
                          </a>
                        )} */}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">
                        {source.schedule_cron}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const rawTags = source.tags;
                        const tagList: string[] = Array.isArray(rawTags)
                          ? (rawTags as string[]).filter(Boolean)
                          : typeof rawTags === "string" && rawTags.trim()
                            ? rawTags
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean)
                            : [];
                        return tagList.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tagList.slice(0, 2).map((t) => (
                              <Badge
                                key={t}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {t}
                              </Badge>
                            ))}
                            {tagList.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{tagList.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">
                            —
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Switch
                        checked={source.enabled}
                        onCheckedChange={() => toggleEnabled(source)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setRunningSourceId(source.id);
                            startMutation.mutate(source.id);
                          }}
                          disabled={startMutation.isPending || !source.enabled}
                          title={source.enabled ? "立即采集" : "请先启用"}
                        >
                          {startMutation.isPending &&
                          runningSourceId === source.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditForm(source)}
                          title="编辑"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          onClick={() => setShowDelete(source.id)}
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between flex-shrink-0 pt-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <div className="w-20">{data.total} 条</div>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className=" h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} 条/页
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from(
              { length: Math.min(Math.ceil(data.total / pageSize), 5) },
              (_, i) => {
                const totalPages = Math.ceil(data.total / pageSize);
                const start = Math.max(1, page - 2);
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                );
              },
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(data.total / pageSize)}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSource ? "编辑引擎" : "添加引擎"}</DialogTitle>
            <DialogDescription>
              {editingSource ? "修改数据源配置" : "添加新的RSS/网站数据源"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="source-name">名称</Label>
                <Input
                  id="source-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="数据源名称"
                  required
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="source-url">站点 URL</Label>
                <Input
                  id="source-url"
                  value={form.site_url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, site_url: e.target.value }))
                  }
                  placeholder="https://example.com"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="source-rss">RSS URL</Label>
                <Input
                  id="source-rss"
                  value={form.rss_url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rss_url: e.target.value }))
                  }
                  placeholder="https://example.com/feed.xml"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="source-cron">定时表达式</Label>
                <Input
                  id="source-cron"
                  value={form.schedule_cron}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, schedule_cron: e.target.value }))
                  }
                  placeholder="0 */6 * * *"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cronPresets.map((preset) => (
                    <Button
                      type="button"
                      key={preset.value}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setForm((f) => ({ ...f, schedule_cron: preset.value }))
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  标准 cron 表达式
                </p>
              </div>
              <div className="col-span-2">
                <Label htmlFor="source-tags">标签（逗号分隔）</Label>
                <Input
                  id="source-tags"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  placeholder="技术, AI, 新闻"
                />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <Switch
                  id="source-autopublish"
                  checked={form.auto_publish}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, auto_publish: v }))
                  }
                />
                <Label htmlFor="source-autopublish">自动发布抓取内容</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? "保存中..."
                  : editingSource
                    ? "更新"
                    : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              确认删除？
            </DialogTitle>
            <DialogDescription>
              确定要删除该数据源吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDelete && deleteMutation.mutate(showDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
