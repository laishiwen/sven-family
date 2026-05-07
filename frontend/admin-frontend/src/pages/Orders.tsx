import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ordersApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  RotateCcw,
  User,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Order {
  id: string;
  order_id?: string;
  user_id: string;
  plan_name: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  created_at: string;
  subscription_id?: string;
  gateway_tx_id?: string;
  metadata?: Record<string, unknown>;
  user_email?: string;
}

interface PaginatedResponse {
  items: Order[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

const statusConfig: Record<string, { labelKey: string; class: string }> = {
  paid: {
    labelKey: "orders.paid",
    class: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  pending: {
    labelKey: "orders.pending",
    class: "bg-amber-100 text-amber-700 border-amber-200",
  },
  failed: {
    labelKey: "orders.failed",
    class: "bg-red-100 text-red-700 border-red-200",
  },
  refunded: {
    labelKey: "orders.refunded",
    class: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export default function Orders() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrderId, setRefundOrderId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["orders", statusFilter, page],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, size: 20 };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await ordersApi.list(params);
      return res.data;
    },
  });

  const refundMutation = useMutation({
    mutationFn: (id: string) => ordersApi.refund(id),
    onSuccess: () => {
      toast(t("orders.refund-success"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setShowRefundModal(false);
      setRefundOrderId(null);
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("orders.refund-failed"), {
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("orders.all-status")}</SelectItem>
            <SelectItem value="paid">{t("orders.paid")}</SelectItem>
            <SelectItem value="pending">{t("orders.pending")}</SelectItem>
            <SelectItem value="failed">{t("orders.failed")}</SelectItem>
            <SelectItem value="refunded">{t("orders.refunded")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[0.5fr_1.4fr_1.2fr_1fr_1fr_0.9fr_1fr_1.2fr_0.7fr] items-center gap-3 rounded-lg border border-border/60 px-3 py-3"
                >
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-14 ml-auto" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-8 ml-auto" />
                </div>
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">{t("orders.no-orders")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {t("orders.no-orders-desc")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-8 px-4 py-3"></th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("orders.order-id")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("orders.user")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("orders.plan")}
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("orders.amount")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("status")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("orders.payment")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("orders.date")}
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((order) => {
                    const st =
                      statusConfig[order.status] || statusConfig.pending;
                    const isExpanded = expandedOrder === order.id;
                    return (
                      <tr
                        key={order.id}
                        className={`border-b border-border hover:bg-muted/50 transition-colors ${isExpanded ? "bg-muted/30" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              setExpandedOrder(isExpanded ? null : order.id)
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {(order.order_id || order.id).slice(0, 12)}...
                          </code>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span className="text-xs">
                              {order.user_id?.slice(0, 8)}...
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {order.plan_name}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          <span
                            className={
                              order.status === "refunded"
                                ? "text-muted-foreground line-through"
                                : ""
                            }
                          >
                            {order.currency || "$"}
                            {order.amount?.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={st.class}>{t(st.labelKey)}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {order.payment_method || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {order.status === "paid" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-600"
                              onClick={() => {
                                setRefundOrderId(order.id);
                                setShowRefundModal(true);
                              }}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Expanded Details */}
              {expandedOrder &&
                (() => {
                  const order = data.items.find((o) => o.id === expandedOrder);
                  if (!order) return null;
                  return (
                    <div className="border-t border-border bg-muted/20 p-6 space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        {t("orders.detail-title")}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {t("orders.detail-order-id")}
                          </p>
                          <code className="text-xs bg-white px-2 py-1 rounded border border-border font-mono">
                            {order.order_id || order.id}
                          </code>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {t("orders.detail-user-id")}
                          </p>
                          <code className="text-xs bg-white px-2 py-1 rounded border border-border font-mono">
                            {order.user_id}
                          </code>
                          {order.user_email && (
                            <p className="text-xs mt-1 text-muted-foreground">
                              {order.user_email}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {t("orders.detail-subscription")}
                          </p>
                          <code className="text-xs bg-white px-2 py-1 rounded border border-border font-mono">
                            {order.subscription_id || "—"}
                          </code>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {t("orders.detail-gateway")}
                          </p>
                          <code className="text-xs bg-white px-2 py-1 rounded border border-border font-mono">
                            {order.gateway_tx_id || "—"}
                          </code>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {t("orders.detail-amount")}
                          </p>
                          <p className="font-medium">
                            {order.currency || "$"}
                            {order.amount?.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {t("orders.detail-payment")}
                          </p>
                          <p>{order.payment_method || "—"}</p>
                        </div>
                      </div>
                      {order.metadata &&
                        Object.keys(order.metadata).length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">
                              {t("orders.detail-metadata")}
                            </p>
                            <pre className="text-xs bg-white p-3 rounded-lg border border-border overflow-x-auto">
                              {JSON.stringify(order.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                    </div>
                  );
                })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("orders.pagination", {
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

      {/* Refund Modal */}
      <Dialog open={showRefundModal} onOpenChange={setShowRefundModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-500" />
              {t("orders.refund-title")}
            </DialogTitle>
            <DialogDescription>{t("orders.refund-desc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefundModal(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() =>
                refundOrderId && refundMutation.mutate(refundOrderId)
              }
              disabled={refundMutation.isPending}
            >
              {refundMutation.isPending
                ? t("orders.refunding")
                : t("orders.confirm-refund")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
