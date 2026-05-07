import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminUsersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
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
import { Shield, UserPlus, Edit3, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

const roleConfig: Record<string, { label: string; class: string }> = {
  super_admin: {
    label: "Super Admin",
    class: "bg-purple-100 text-purple-700 border-purple-200",
  },
  admin: { label: "Admin", class: "bg-blue-100 text-blue-700 border-blue-200" },
  moderator: {
    label: "Moderator",
    class: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

const emptyForm = { username: "", email: "", password: "", role: "moderator" };

function AdminUsersTableSkeleton() {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[2fr_2fr_1.2fr_1fr_1.5fr_0.9fr] items-center gap-3 rounded-lg border border-border/60 px-3 py-3"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-20 mx-auto" />
          <Skeleton className="h-4 w-12 mx-auto" />
          <Skeleton className="h-4 w-24" />
          <div className="flex justify-end gap-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentAdmin = useAuthStore((s) => s.adminUser);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDelete, setShowDelete] = useState<AdminUser | null>(null);
  const [editPassword, setEditPassword] = useState("");

  // Redirect non-super-admins
  if (currentAdmin?.role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">只有超级管理员可以访问此页面</p>
      </div>
    );
  }

  const { data: admins, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await adminUsersApi.list();
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => adminUsersApi.create(data),
    onSuccess: () => {
      toast("管理员已创建", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      closeForm();
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "创建失败", {
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adminUsersApi.update(id, data),
    onSuccess: () => {
      toast("管理员已更新", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      closeForm();
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "更新失败", {
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminUsersApi.delete(id),
    onSuccess: () => {
      toast("管理员已删除", { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowDelete(null);
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail || "删除失败", {
        variant: "destructive",
      }),
  });

  const openNewForm = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setShowForm(true);
  };
  const openEditForm = (u: AdminUser) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      email: u.email,
      password: "",
      role: u.role,
    });
    setEditPassword("");
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setForm(emptyForm);
    setEditPassword("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.email.trim()) {
      toast("用户名和邮箱不能为空", { variant: "destructive" });
      return;
    }
    if (editingUser) {
      const data: Record<string, unknown> = {
        username: form.username,
        email: form.email,
        role: form.role,
      };
      if (editPassword) data.password = editPassword;
      updateMutation.mutate({ id: editingUser.id, data });
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
        <div className="flex-1" />
        <Button onClick={openNewForm}>
          <UserPlus className="w-4 h-4 mr-1" />
          添加管理员
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <AdminUsersTableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      用户名
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      邮箱
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      角色
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      状态
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      最后登录
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(admins || []).map((admin) => {
                    const rc = roleConfig[admin.role] || roleConfig.moderator;
                    const isSelf = admin.id === currentAdmin?.id;
                    return (
                      <tr
                        key={admin.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                              {(admin.username || "?")[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium">
                              {admin.username}
                            </span>
                            {isSelf && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                                当前
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {admin.email}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={rc.class}>{rc.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={
                              admin.status === "active"
                                ? "text-emerald-600 text-xs"
                                : "text-red-600 text-xs"
                            }
                          >
                            {admin.status === "active" ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {admin.last_login_at
                            ? new Date(admin.last_login_at).toLocaleString(
                                "zh-CN",
                                {
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "从未"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditForm(admin)}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600"
                                onClick={() => setShowDelete(admin)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
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

      {/* Create/Edit Form */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "编辑管理员" : "添加管理员"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "修改管理员信息。留空密码则不修改。"
                : "创建新的后台管理账号。"}
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
            <div>
              <label className="text-sm font-medium mb-1 block">
                {editingUser ? "新密码（留空不修改）" : "密码"}
              </label>
              <Input
                type="password"
                value={editingUser ? editPassword : form.password}
                onChange={(e) =>
                  editingUser
                    ? setEditPassword(e.target.value)
                    : setForm({ ...form, password: e.target.value })
                }
                required={!editingUser}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">角色</label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">
                    Super Admin - 全部权限
                  </SelectItem>
                  <SelectItem value="admin">Admin - 日常管理</SelectItem>
                  <SelectItem value="moderator">
                    Moderator - 内容审核
                  </SelectItem>
                </SelectContent>
              </Select>
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
              <Trash2 className="w-5 h-5 text-red-500" /> 删除管理员
            </DialogTitle>
            <DialogDescription>
              确定删除管理员 "{showDelete?.username}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDelete && deleteMutation.mutate(showDelete.id)}
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
