import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { dashboardApi, modelsApi, providersApi } from "@/lib/api";
import { formatTokens, formatCost } from "@/lib/utils";
import {
  Activity,
  Plus,
  X,
  PlayCircle,
  MessageSquare,
  Bot,
  Cpu,
  Zap,
  Server,
  Wrench,
  Layers,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Widget registry ──────────────────────────────────────────────────────

type WidgetKey =
  | "stats"
  | "usage-chart"
  | "service-health"
  | "recent-runs"
  | "providers";

interface WidgetDef {
  key: WidgetKey;
  title: string;
  icon: typeof Activity;
  defaultOn: boolean;
  w: "full" | "half" | "third";
}

const WIDGETS: WidgetDef[] = [
  {
    key: "stats",
    title: "dashboard.widget.stats",
    icon: Layers,
    defaultOn: true,
    w: "full",
  },
  {
    key: "usage-chart",
    title: "dashboard.widget.usage-chart",
    icon: Activity,
    defaultOn: true,
    w: "half",
  },
  {
    key: "service-health",
    title: "dashboard.widget.service-health",
    icon: Activity,
    defaultOn: true,
    w: "half",
  },
  {
    key: "recent-runs",
    title: "dashboard.widget.recent-runs",
    icon: PlayCircle,
    defaultOn: false,
    w: "half",
  },
  {
    key: "providers",
    title: "dashboard.widget.providers",
    icon: Server,
    defaultOn: false,
    w: "half",
  },
];

const STORAGE_KEY = "sven-dashboard-widgets";

function loadWidgets(): WidgetKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {}
  return WIDGETS.filter((w) => w.defaultOn).map((w) => w.key);
}

function saveWidgets(keys: WidgetKey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

// ── Card shell ───────────────────────────────────────────────────────────

function WidgetCard({
  title,
  icon: Icon,
  onRemove,
  children,
}: {
  title: string;
  icon: typeof Activity;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)] group/widget">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover/widget:opacity-100 transition-opacity"
            onClick={onRemove}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="p-5 pt-3">{children}</div>
    </div>
  );
}

// ── Widget: Stats ────────────────────────────────────────────────────────

function StatsWidget() {
  const { t } = useTranslation();

  const { data: overview } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => dashboardApi.overview().then((r) => r.data),
    refetchInterval: 30000,
  });
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => modelsApi.list().then((r) => r.data),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: () => providersApi.list().then((r) => r.data),
  });

  const stats = overview || {};
  const items = [
    {
      label: t("dashboard.total-runs"),
      value: stats.total_runs ?? "-",
      sub: t("dashboard.total-runs-sub"),
    },
    {
      label: t("dashboard.sessions"),
      value: stats.total_sessions ?? "-",
      sub: t("dashboard.sessions-sub", { count: stats.total_agents ?? 0 }),
    },
    {
      label: t("dashboard.total-agents"),
      value: stats.total_agents ?? "-",
      sub: t("dashboard.total-agents-sub", { count: (models as any[]).length }),
    },
    {
      label: t("dashboard.total-providers"),
      value: stats.active_providers ?? "-",
      sub: t("dashboard.total-providers-sub", {
        count: (providers as any[]).length,
      }),
    },
    {
      label: t("dashboard.today-tokens"),
      value: formatTokens(stats.total_tokens_today ?? 0),
      sub: formatCost(stats.total_cost_today ?? 0),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-background px-4 py-3"
        >
          <p className="text-[12px] text-muted-foreground leading-none">
            {item.label}
          </p>
          <p className="mt-2 text-2xl font-normal font-serif leading-none tracking-tight">
            {item.value}
          </p>
          {item.sub && (
            <p className="mt-1 text-[11px] text-muted-foreground">{item.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Widget: Usage Chart ──────────────────────────────────────────────────

function UsageChartWidget() {
  const { t } = useTranslation();
  const { data: activity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => dashboardApi.activity().then((r) => r.data),
  });

  const chartData: { day: string; tokens: number; runs: number }[] =
    useMemo(() => {
      if (activity?.daily_stats?.length) {
        return activity.daily_stats.map((item: any) => ({
          day: item.date?.slice(5) ?? "",
          tokens: item.total_tokens ?? 0,
          runs: item.total_runs ?? 0,
        }));
      }
      const now = new Date();
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return { day: `${mm}-${dd}`, tokens: 0, runs: 0 };
      });
    }, [activity]);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="hsl(var(--border))"
        />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "10px",
            border: "1px solid hsl(var(--border))",
            backgroundColor: "hsl(var(--card))",
            color: "hsl(var(--foreground))",
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          }}
        />
        <defs>
          <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0.12}
            />
            <stop
              offset="100%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <Line
          type="monotone"
          dataKey="tokens"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
          fill="url(#tokenGradient)"
          fillOpacity={1}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Widget: Service Health ───────────────────────────────────────────────

function ServiceHealthWidget() {
  const { t } = useTranslation();
  const { data: health, isLoading } = useQuery({
    queryKey: ["dashboard-health"],
    queryFn: () => dashboardApi.health().then((r) => r.data),
    refetchInterval: 60000,
  });

  if (isLoading || !health)
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg px-2 py-2"
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-0.5">
      {(health as any[]).map((item: any, i: number) => (
        <div
          key={i}
          className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`block h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                item.status === "healthy"
                  ? "bg-emerald-500"
                  : item.status === "unhealthy"
                    ? "bg-red-500"
                    : "bg-muted-foreground/30"
              }`}
            />
            <span className="text-sm">{item.service}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.latency_ms && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.latency_ms}ms
              </span>
            )}
            <span
              className={`text-[11px] ${item.status === "unhealthy" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
            >
              {t(item.status || "unknown")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Widget: Recent Runs ──────────────────────────────────────────────────

function RecentRunsWidget() {
  const { t } = useTranslation();
  const { data: activity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => dashboardApi.activity().then((r) => r.data),
    refetchInterval: 15000,
  });

  const runs = (activity?.runs ?? []).slice(0, 8);

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {t("dashboard.no-recent-runs")}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {runs.map((run: any) => (
        <div
          key={run.id}
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors text-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                run.status === "success"
                  ? "bg-emerald-500"
                  : run.status === "failed"
                    ? "bg-red-500"
                    : run.status === "running"
                      ? "bg-blue-500"
                      : "bg-muted-foreground/30"
              }`}
            />
            <span className="truncate text-xs font-mono text-muted-foreground">
              {run.id?.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{run.input_tokens + run.output_tokens} tokens</span>
            <span>
              {new Date(run.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Widget: Provider Status ──────────────────────────────────────────────

function ProviderStatusWidget() {
  const { t } = useTranslation();
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: () => providersApi.list().then((r) => r.data),
    refetchInterval: 30000,
  });

  if ((providers as any[]).length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {t("dashboard.no-providers")}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {(providers as any[]).map((p: any) => (
        <div
          key={p.id}
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`block h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                p.health_status === "healthy"
                  ? "bg-emerald-500"
                  : p.health_status === "unhealthy"
                    ? "bg-red-500"
                    : "bg-muted-foreground/30"
              }`}
            />
            <span className="text-sm">{p.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {p.provider_type}
            </span>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {p.health_status || "unknown"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ── Widget map ───────────────────────────────────────────────────────────

const WIDGET_COMPONENTS: Record<WidgetKey, React.FC> = {
  stats: StatsWidget,
  "usage-chart": UsageChartWidget,
  "service-health": ServiceHealthWidget,
  "recent-runs": RecentRunsWidget,
  providers: ProviderStatusWidget,
};

// ── Main Dashboard ───────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const [activeWidgets, setActiveWidgets] = useState<WidgetKey[]>(loadWidgets);

  const addWidget = useCallback((key: WidgetKey) => {
    setActiveWidgets((prev) => {
      const next = [...prev, key];
      saveWidgets(next);
      return next;
    });
  }, []);

  const removeWidget = useCallback((key: WidgetKey) => {
    setActiveWidgets((prev) => {
      const next = prev.filter((k) => k !== key);
      saveWidgets(next);
      return next;
    });
  }, []);

  const availableWidgets = WIDGETS.filter(
    (w) => !activeWidgets.includes(w.key),
  );

  return (
    <div className="p-6 space-y-6">
      {availableWidgets.length !== 0 && (
        <div className="flex items-center justify-between">
          <div></div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={availableWidgets.length === 0}
              >
                <Plus className="w-3.5 h-3.5" />
                {t("dashboard.add-widget")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {availableWidgets.map((w) => {
                const Icon = w.icon;
                return (
                  <DropdownMenuItem
                    key={w.key}
                    onClick={() => addWidget(w.key)}
                    className="gap-2 text-xs"
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    {t(w.title)}
                  </DropdownMenuItem>
                );
              })}
              {availableWidgets.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  {t("dashboard.all-widgets-added")}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {activeWidgets.map((key) => {
        const def = WIDGETS.find((w) => w.key === key);
        if (!def) return null;
        const WidgetComponent = WIDGET_COMPONENTS[key];
        return (
          <WidgetCard
            key={key}
            title={t(def.title)}
            icon={def.icon}
            onRemove={() => removeWidget(key)}
          >
            <WidgetComponent />
          </WidgetCard>
        );
      })}
    </div>
  );
}
