import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { communityApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Ban,
  UserCheck,
  UserPlus,
  Edit3,
  Trash2,
  Mail,
  Calendar,
  MessageCircle,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CommunityUser {
  id: string;
  username: string;
  email: string;
  status: string;
  post_count: number;
  last_active_at: string | null;
  created_at: string;
  avatar_url?: string;
  bio?: string;
  level?: { level: number; name: string; color: string };
}

interface PaginatedResponse {
  items: CommunityUser[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

const emptyForm = {
  username: "",
  email: "",
  password: "",
  status: "active",
  bio: "",
};

export default function CommunityUsers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<CommunityUser | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<CommunityUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDelete, setShowDelete] = useState<CommunityUser | null>(null);
  const [showBan, setShowBan] = useState<CommunityUser | null>(null);
  const [banDuration, setBanDuration] = useState("24");
  const [banReason, setBanReason] = useState("");

  const statusConfig: Record<string, { label: string; class: string }> = {
    active: {
      label: t("community.users.active"),
      class: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    banned: {
      label: t("community.users.banned"),
      class: "bg-red-100 text-red-700 border-red-200",
    },
    inactive: {
      label: t("community.users.inactive"),
      class: "bg-slate-100 text-slate-600 border-slate-200",
    },
  };

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["community-users", search, statusFilter, page],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, size: 20 };
      if (search) params.search = search;
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await communityApi.listUsers(params);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) =>
      communityApi.createUser({
        username: data.username,
        email: data.email,
        password_hash: data.password,
        status: data.status,
        bio: data.bio,
      }),
    onSuccess: () => {
      toast("用户已创建", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-users"] });
      closeForm();
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "创建失败", {
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      communityApi.updateUser(id, data),
    onSuccess: () => {
      toast("用户已更新", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-users"] });
      closeForm();
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "更新失败", {
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communityApi.deleteUser(id),
    onSuccess: () => {
      toast("用户已删除", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-users"] });
      setShowDelete(null);
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "删除失败", {
        variant: "destructive",
      }),
  });

  const banMutation = useMutation({
    mutationFn: ({
      id,
      duration,
      reason,
    }: {
      id: string;
      duration: string;
      reason: string;
    }) => communityApi.banUser(id),
    onSuccess: () => {
      toast("用户已封禁", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-users"] });
      setShowBan(null);
      setBanDuration("24");
      setBanReason("");
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "封禁失败", {
        variant: "destructive",
      }),
  });

  const unbanMutation = useMutation({
    mutationFn: (id: string) => communityApi.unbanUser(id),
    onSuccess: () => {
      toast("用户已解封", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-users"] });
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "解封失败", {
        variant: "destructive",
      }),
  });

  const actionPending =
    deleteMutation.isPending ||
    banMutation.isPending ||
    unbanMutation.isPending;

  const openNewForm = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setShowForm(true);
  };
  const openEditForm = (u: CommunityUser) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      email: u.email,
      password: "",
      status: u.status,
      bio: u.bio || "",
    });
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.email.trim()) {
      toast("用户名和邮箱不能为空", { variant: "destructive" });
      return;
    }
    if (editingUser) {
      const updates: Record<string, unknown> = {
        username: form.username,
        status: form.status,
        bio: form.bio,
      };
      updateMutation.mutate({ id: editingUser.id, data: updates });
    } else {
      if (!form.password) {
        toast("密码不能为空", { variant: "destructive" });
        return;
      }
      createMutation.mutate(form);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("community.users.search-placeholder")}
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
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("community.users.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("community.users.all")}</SelectItem>
            <SelectItem value="active">
              {t("community.users.active")}
            </SelectItem>
            <SelectItem value="banned">
              {t("community.users.banned")}
            </SelectItem>
            <SelectItem value="inactive">
              {t("community.users.inactive")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openNewForm}>
          <UserPlus className="w-4 h-4 mr-1" />
          添加用户
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[2.2fr_2fr_1.4fr_1.1fr_0.9fr_1fr] items-center gap-3 rounded-lg border border-border/60 px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16 mx-auto" />
                  <Skeleton className="h-4 w-8 mx-auto" />
                  <div className="flex justify-end gap-1">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">
                {t("community.users.no-users")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      用户
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      邮箱
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      等级
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      状态
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      帖子
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => {
                    const st = statusConfig[user.status] || statusConfig.active;
                    const lv = user.level || {
                      level: 1,
                      name: "新手上路",
                      color: "#9CA3AF",
                    };
                    return (
                      <tr
                        key={user.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                              {(user.username || "?")[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium">
                              {user.username || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {user.email}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            style={{
                              backgroundColor: lv.color + "18",
                              color: lv.color,
                              borderColor: lv.color + "40",
                            }}
                            className="border text-[11px]"
                          >
                            Lv{lv.level} {lv.name}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={st.class}>{st.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center text-xs">
                          {user.post_count ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDetail(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditForm(user)}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            {user.status === "banned" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600"
                                onClick={() =>
                                  unbanMutation.mutate(user.id)
                                }
                                disabled={actionPending}
                              >
                                <UserCheck className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600"
                                onClick={() => setShowBan(user)}
                                disabled={actionPending}
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              onClick={() => setShowDelete(user)}
                              disabled={actionPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("community.users.pagination", {
              page: data.page,
              pages: data.pages,
              total: data.total,
            })}
          </p>
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

      {/* Detail Modal */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> 用户详情
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                  {(selectedUser.username || "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-lg">
                    {selectedUser.username}
                    {selectedUser.level && (
                      <Badge
                        style={{
                          backgroundColor: selectedUser.level.color + "18",
                          color: selectedUser.level.color,
                        }}
                        className="ml-2 text-[11px]"
                      >
                        Lv{selectedUser.level.level} {selectedUser.level.name}
                      </Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedUser.email}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">状态：</span>
                  <Badge
                    className={
                      (statusConfig[selectedUser.status] || statusConfig.active)
                        .class
                    }
                  >
                    {
                      (statusConfig[selectedUser.status] || statusConfig.active)
                        .label
                    }
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">帖子：</span>
                  <span className="font-medium">
                    {selectedUser.post_count ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">注册：</span>
                  <span className="font-medium">
                    {formatDate(selectedUser.created_at)}
                  </span>
                </div>
              </div>
              {selectedUser.bio && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">简介</p>
                  <p className="text-sm">{selectedUser.bio}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span>
                  最近活跃：
                  {selectedUser.last_active_at
                    ? formatDate(selectedUser.last_active_at)
                    : "从未"}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form Modal */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? "编辑用户" : "添加用户"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "修改用户信息" : "创建新的社区用户"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">用户名</label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">邮箱</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            {!editingUser && (
              <div>
                <label className="text-sm font-medium mb-1 block">密码</label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </div>
            )}
            {editingUser && (
              <div>
                <label className="text-sm font-medium mb-1 block">状态</label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">简介</label>
              <textarea
                className="flex min-h-[60px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "保存中..."
                  : editingUser
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
              <Trash2 className="w-5 h-5 text-red-500" /> 删除用户
            </DialogTitle>
            <DialogDescription>
              确定删除用户 "{showDelete?.username}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showDelete && deleteMutation.mutate(showDelete.id)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Modal */}
      <Dialog open={!!showBan} onOpenChange={() => setShowBan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" /> 封禁用户
            </DialogTitle>
            <DialogDescription>
              封禁 {showBan?.username}，限制其在社区的权限。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                封禁时长（小时）
              </label>
              <Input
                type="number"
                min={0}
                value={banDuration}
                onChange={(e) => setBanDuration(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                设为 0 表示永久封禁
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">原因</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="封禁原因..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBan(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showBan &&
                banMutation.mutate({
                  id: showBan.id,
                  duration: banDuration,
                  reason: banReason,
                })
              }
              disabled={banMutation.isPending}
            >
              {banMutation.isPending ? "封禁中..." : "确认封禁"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
