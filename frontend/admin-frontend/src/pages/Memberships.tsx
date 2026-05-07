import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { membershipsApi } from "@/lib/api";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CreditCard,
  Plus,
  Edit3,
  Trash2,
  Loader2,
  CheckCircle2,
  X,
  ArrowUpDown,
  DollarSign,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  quarterly_price: number;
  yearly_price: number;
  features: string;
  sort_order: number;
  status: string;
}

const emptyForm = {
  name: "",
  description: "",
  monthly_price: 0,
  quarterly_price: 0,
  yearly_price: 0,
  features: "",
  sort_order: 0,
};

export default function Memberships() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDelete, setShowDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MembershipPlan[]>({
    queryKey: ["memberships"],
    queryFn: async () => {
      const res = await membershipsApi.list();
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: unknown) => membershipsApi.create(data),
    onSuccess: () => {
      toast(t("memberships.created-success"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      closeForm();
    },
    onError: (err: any) => toast(err?.response?.data?.detail || t("memberships.create") + " failed", { variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => membershipsApi.update(id, data),
    onSuccess: () => {
      toast(t("memberships.updated-success"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      closeForm();
    },
    onError: (err: any) => toast(err?.response?.data?.detail || t("memberships.edit") + " failed", { variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => membershipsApi.delete(id),
    onSuccess: () => {
      toast(t("memberships.deleted-success"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      setShowDelete(null);
    },
    onError: (err: any) => toast(err?.response?.data?.detail || t("memberships.delete") + " failed", { variant: "destructive" }),
  });

  const openNewForm = () => {
    setEditingPlan(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      description: plan.description,
      monthly_price: plan.monthly_price,
      quarterly_price: plan.quarterly_price,
      yearly_price: plan.yearly_price,
      features: plan.features,
      sort_order: plan.sort_order,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingPlan(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast(t("memberships.name-required"), { variant: "destructive" });
      return;
    }
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const plans = Array.isArray(data) ? [...data].sort((a, b) => a.sort_order - b.sort_order) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={openNewForm}>
          <Plus className="w-4 h-4 mr-1" />
          {t("memberships.new-plan")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-5 bg-muted animate-pulse rounded w-1/2 mb-3" />
                <div className="h-4 bg-muted animate-pulse rounded w-3/4 mb-4" />
                <div className="h-8 bg-muted animate-pulse rounded w-1/3 mb-4" />
                <div className="h-3 bg-muted animate-pulse rounded w-full mb-2" />
                <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">{t("memberships.no-plans")}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {t("memberships.create-first")}
            </p>
            <Button variant="outline" className="mt-4" onClick={openNewForm}>
              <Plus className="w-4 h-4 mr-1" />
              {t("memberships.new-plan")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan, idx) => (
            <Card key={plan.id} className="animate-card-enter" style={{ animationDelay: `${idx * 0.05}s` }}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg font-serif">{plan.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  </div>
                  <Badge className={plan.status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
                    {plan.status || "active"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Pricing */}
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("memberships.monthly")}</p>
                    <p className="font-semibold text-primary">${plan.monthly_price}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("memberships.quarterly")}</p>
                    <p className="font-semibold text-primary">${plan.quarterly_price}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("memberships.yearly")}</p>
                    <p className="font-semibold text-primary">${plan.yearly_price}</p>
                  </div>
                </div>

                {/* Features */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t("memberships.features-label")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(plan.features || "")
                      .split(",")
                      .map((f) => f.trim())
                      .filter(Boolean)
                      .map((f) => (
                        <Badge key={f} variant="secondary" className="text-[11px]">
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                          {f}
                        </Badge>
                      ))}
                  </div>
                </div>

                {/* Sort & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowUpDown className="w-3 h-3" />
                    <span>{t("memberships.sort-label", { value: plan.sort_order })}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(plan)}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setShowDelete(plan.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? t("memberships.edit-title") : t("memberships.create-title")}</DialogTitle>
            <DialogDescription>
              {editingPlan ? t("memberships.edit-desc") : t("memberships.create-desc")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="plan-name">{t("memberships.name-label")}</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("memberships.name-label")}
                  required
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="plan-desc">{t("memberships.desc-label")}</Label>
                <textarea
                  id="plan-desc"
                  className="flex min-h-[60px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t("memberships.desc-placeholder")}
                />
              </div>
              <div>
                <Label htmlFor="plan-monthly">{t("memberships.monthly-label")}</Label>
                <Input
                  id="plan-monthly"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.monthly_price}
                  onChange={(e) => setForm((f) => ({ ...f, monthly_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="plan-quarterly">{t("memberships.quarterly-label")}</Label>
                <Input
                  id="plan-quarterly"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.quarterly_price}
                  onChange={(e) => setForm((f) => ({ ...f, quarterly_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="plan-yearly">{t("memberships.yearly-label")}</Label>
                <Input
                  id="plan-yearly"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.yearly_price}
                  onChange={(e) => setForm((f) => ({ ...f, yearly_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="plan-sort">{t("memberships.sort-label-form")}</Label>
                <Input
                  id="plan-sort"
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="plan-features">{t("memberships.features-label")}</Label>
                <Input
                  id="plan-features"
                  value={form.features}
                  onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
                  placeholder={t("memberships.features-placeholder")}
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.features
                    .split(",")
                    .map((f) => f.trim())
                    .filter(Boolean)
                    .map((f) => (
                      <Badge key={f} variant="secondary" className="text-xs">
                        {f}
                      </Badge>
                    ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>{t("cancel")}</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? t("memberships.saving") : editingPlan ? t("memberships.update-plan") : t("memberships.create-plan")}
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
              {t("memberships.delete-title")}
            </DialogTitle>
            <DialogDescription>
              {t("memberships.delete-desc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>{t("cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => showDelete && deleteMutation.mutate(showDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("memberships.deleting") : t("memberships.delete-plan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
