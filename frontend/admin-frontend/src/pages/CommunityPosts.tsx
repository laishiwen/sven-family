import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { communityApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Plus,
  ExternalLink,
  Edit3,
} from "lucide-react";
import MDEditor from "@uiw/react-md-editor";

interface CommunityPost {
  id: string;
  title: string;
  author_name: string;
  author_avatar?: string;
  tags: string[];
  source: string;
  status: string;
  comment_count: number;
  section_name?: string;
  section_slug?: string;
  content?: string;
  source_url?: string;
  source_name?: string;
  created_at: string;
  updated_at?: string;
}

interface PaginatedResponse {
  items: CommunityPost[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface Section {
  id: string;
  name: string;
  slug: string;
}

function simpleDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function getAuthorDisplay(post: CommunityPost): string {
  if (post.source === "crawler") return "News";
  return post.author_name || "—";
}

function CommunityPostsTableSkeleton() {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[2.8fr_1.3fr_1fr_0.9fr_0.9fr_1fr_0.8fr] items-center gap-3 rounded-lg border border-border/60 px-3 py-3"
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-20" />
          <div className="flex justify-end gap-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CommunityPosts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSection, setEditSection] = useState("sec-engineering");
  const [editStatus, setEditStatus] = useState("published");
  const [editTags, setEditTags] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["community-sections"],
    queryFn: async () => {
      const res = await communityApi.getSections();
      return res.data;
    },
  });

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: [
      "community-posts",
      search,
      statusFilter,
      sourceFilter,
      sectionFilter,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (search) params.search = search;
      if (statusFilter !== "all") params.status = statusFilter;
      if (sourceFilter !== "all") params.source = sourceFilter;
      if (sectionFilter !== "all") params.section = sectionFilter;
      const res = await communityApi.listPosts(params);
      const d = res.data as PaginatedResponse;
      d.pages = Math.ceil(d.total / (d.page_size || pageSize));
      return d;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      communityApi.updatePost(id, data),
    onSuccess: () => {
      toast("帖子已更新", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      closeEditor();
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "更新失败", {
        variant: "destructive",
      }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      communityApi.createPost(data),
    onSuccess: () => {
      toast("帖子已创建", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      setShowCreate(false);
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "创建失败", {
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communityApi.deletePost(id),
    onSuccess: () => {
      toast("帖子已删除", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      setShowDelete(null);
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "删除失败", {
        variant: "destructive",
      }),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => communityApi.batchDeletePosts(ids),
    onSuccess: (resp) => {
      const count = resp?.data?.deleted_count ?? selectedIds.size;
      toast(`已删除 ${count} 条帖子`, { variant: "success" });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "批量删除失败", {
        variant: "destructive",
      }),
  });

  const toggleSelectAll = () => {
    if (!data) return;
    if (selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEditor = (post: CommunityPost) => {
    setEditingPost(post);
    setEditTitle(post.title);
    setEditContent(post.content || "");
    setEditSection(post.section_slug || "engineering");
    setEditStatus(post.status);
    setEditTags((post.tags || []).join(", "));
    setShowEditor(true);
  };

  const openCreate = () => {
    setEditTitle("");
    setEditContent("");
    setEditSection("engineering");
    setEditStatus("published");
    setEditTags("");
    setShowCreate(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingPost(null);
  };

  const handleUpdate = () => {
    if (!editingPost) return;
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    updateMutation.mutate({
      id: editingPost.id,
      data: {
        title: editTitle,
        content: editContent,
        section_id: editSection,
        status: editStatus,
        tags,
      },
    });
  };

  const handleCreate = () => {
    if (!editTitle.trim()) {
      toast("标题不能为空", { variant: "destructive" });
      return;
    }
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    createMutation.mutate({
      title: editTitle,
      content: editContent,
      section_id: editSection,
      tags,
      status: editStatus,
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap flex-shrink-0 pb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("community.posts.search-placeholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="pending_review">Pending</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            setSourceFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="crawler">
              {t("community.posts.source-crawler")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sectionFilter}
          onValueChange={(v) => {
            setSectionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {(sections || []).map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm(`确定删除选中的 ${selectedIds.size} 条帖子？`)) {
                batchDeleteMutation.mutate(Array.from(selectedIds));
              }
            }}
            disabled={batchDeleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {batchDeleteMutation.isPending
              ? "删除中..."
              : `删除 (${selectedIds.size})`}
          </Button>
        )}
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          新建帖子
        </Button>
      </div>

      {/* Table — scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0 border border-border rounded-lg">
        <div className="overflow-x-auto">
          {isLoading ? (
            <CommunityPostsTableSkeleton />
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">
                {t("community.posts.no-posts")}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pl-4 py-3 w-10 align-middle">
                    <input
                      type="checkbox"
                      className="rounded border-border align-middle"
                      checked={
                        data &&
                        data.items.length > 0 &&
                        selectedIds.size === data.items.length
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    标题
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    作者
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    板块
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    来源
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    状态
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    日期
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((post) => (
                  <tr
                    key={post.id}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td
                      className="pl-4 py-3 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border align-middle"
                        checked={selectedIds.has(post.id)}
                        onChange={() => toggleSelect(post.id)}
                      />
                    </td>
                    <td
                      className="px-4 py-3 font-medium max-w-[300px] truncate cursor-pointer"
                      onClick={() => openEditor(post)}
                    >
                      {post.title}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {getAuthorDisplay(post)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {post.section_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {post.source || "user"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          post.status === "published"
                            ? "text-emerald-600"
                            : post.status === "pending_review"
                              ? "text-amber-600"
                              : post.status === "hidden"
                                ? "text-slate-400"
                                : "text-red-600"
                        }
                      >
                        {post.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {simpleDate(post.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={`http://localhost:3002/topics/${post.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditor(post)}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          onClick={() => setShowDelete(post.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
            {Array.from({ length: Math.min(data.pages, 5) }, (_, i) => {
              const start = Math.max(1, data.page - 2);
              const p = start + i;
              if (p > data.pages) return null;
              return (
                <Button
                  key={p}
                  variant={p === data.page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Modal with Markdown Editor */}
      <Dialog
        open={showEditor}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5" /> 编辑帖子
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">标题</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">板块</label>
                <Select value={editSection} onValueChange={setEditSection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(sections || []).map((s) => (
                      <SelectItem key={s.slug} value={s.slug}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">状态</label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="pending_review">
                      Pending Review
                    </SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">标签</label>
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="逗号分隔"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                内容 (Markdown)
              </label>
              <div data-color-mode="light">
                <MDEditor
                  value={editContent}
                  onChange={(v: string | undefined) => setEditContent(v || "")}
                  height={400}
                  preview="live"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              取消
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> 新建帖子
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">标题</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">板块</label>
                <Select value={editSection} onValueChange={setEditSection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(sections || []).map((s) => (
                      <SelectItem key={s.slug} value={s.slug}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">状态</label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="pending_review">
                      Pending Review
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">标签</label>
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="逗号分隔"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                内容 (Markdown)
              </label>
              <div data-color-mode="light">
                <MDEditor
                  value={editContent}
                  onChange={(v: string | undefined) => setEditContent(v || "")}
                  height={400}
                  preview="live"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "创建中..." : "发布"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" /> 删除帖子
            </DialogTitle>
            <DialogDescription>
              确定删除该帖子吗？此操作不可撤销。
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
