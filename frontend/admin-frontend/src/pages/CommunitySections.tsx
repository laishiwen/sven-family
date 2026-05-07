import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { communityApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Edit3, Trash2, GripVertical, Layers } from "lucide-react";

interface Section {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sort_order?: number;
}

const emptyForm = { name: "", slug: "", description: "", sort_order: 99 };

export default function CommunitySections() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: sections, isLoading } = useQuery<Section[]>({
    queryKey: ["community-sections"],
    queryFn: async () => {
      const res = await communityApi.getSections();
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: unknown) => communityApi.createSection(data),
    onSuccess: () => {
      toast(t("sections.created"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-sections"] });
      close();
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("sections.create-failed"), {
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      communityApi.updateSection(id, data),
    onSuccess: () => {
      toast(t("sections.updated"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-sections"] });
      queryClient.invalidateQueries({
        queryKey: ["community-sections-crawler"],
      });
      close();
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("sections.update-failed"), {
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communityApi.deleteSection(id),
    onSuccess: () => {
      toast(t("sections.deleted"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["community-sections"] });
      queryClient.invalidateQueries({
        queryKey: ["community-sections-crawler"],
      });
      setDeleteId(null);
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("sections.delete-failed"), {
        variant: "destructive",
      }),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (s: Section) => {
    setEditing(s);
    setForm({
      name: s.name,
      slug: s.slug,
      description: s.description || "",
      sort_order: s.sort_order ?? 99,
    });
    setShowForm(true);
  };

  const close = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast(t("sections.name-slug-required"), { variant: "destructive" });
      return;
    }
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: {
          name: form.name,
          description: form.description,
          sort_order: Number(form.sort_order),
        },
      });
    } else {
      createMutation.mutate({ ...form, sort_order: Number(form.sort_order) });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("sections.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("sections.desc")}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" />
          {t("sections.add")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-2">
                <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
                <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !sections?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">{t("sections.empty")}</p>
            <Button variant="outline" className="mt-4" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" />
              {t("sections.add")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...sections]
            .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
            .map((s) => (
              <Card key={s.id} className="group">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                      <CardTitle className="text-base truncate">
                        {s.name}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">
                        {s.slug}
                      </span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(s)}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {s.description || (
                      <span className="italic opacity-50">
                        {t("sections.no-desc")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground/50 mt-2">
                    {t("sections.sort-order")}：{s.sort_order ?? "-"}
                  </p>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("sections.edit") : t("sections.add")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>{t("sections.name")} *</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="AI、科技、财经..."
              />
            </div>
            <div>
              <Label>{t("sections.slug")} *</Label>
              <Input
                className="mt-1 font-mono"
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                  }))
                }
                placeholder="ai、tech、finance..."
                disabled={!!editing}
              />
              {editing && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("sections.slug-readonly")}
                </p>
              )}
            </div>
            <div>
              <Label>{t("sections.description")}</Label>
              <Input
                className="mt-1"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder={t("sections.description-placeholder")}
              />
            </div>
            <div>
              <Label>{t("sections.sort-order")}</Label>
              <Input
                className="mt-1 w-24"
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? t("saving")
                  : editing
                    ? t("save")
                    : t("sections.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sections.delete-title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("sections.delete-desc")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
