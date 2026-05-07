import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { obsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  ChevronRight,
  Clock,
  Database,
  Download,
  DollarSign,
  FileText,
  Globe,
  Hash,
  Layers3,
  MessageSquare,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

type RunRecord = {
  id: string;
  status: string;
  trace_id?: string | null;
  trace_provider?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  total_cost?: number;
  latency_ms?: number;
  error_msg?: string | null;
  score_count?: number;
  artifact_count?: number;
  event_count?: number;
  completed_at?: string | null;
  created_at?: string;
};

function ObservabilityTimelineSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ObservabilityStepCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

type RunStepRecord = {
  id: string;
  parent_step_id?: string | null;
  step_index: number;
  step_type: string;
  name: string;
  input?: any;
  output?: any;
  metadata?: any;
  status: string;
  latency_ms?: number;
  created_at?: string;
  error?: string | null;
};

type RunScoreRecord = {
  id: string;
  name: string;
  score_type: string;
  value: string;
  comment?: string | null;
  source: string;
  created_at?: string;
};
type RunArtifactRecord = {
  id: string;
  artifact_type: string;
  name: string;
  content: string;
  content_type: string;
  created_at?: string;
};
type RunEventRecord = {
  id: string;
  event_type: string;
  content: string;
  created_at?: string;
};

function normalizeStatus(status?: string | null) {
  return status || "unknown";
}
function statusBadgeVariant(status?: string | null) {
  const n = normalizeStatus(status);
  if (n === "success" || n === "completed") return "default" as const;
  if (n === "failed") return "destructive" as const;
  if (n === "running") return "secondary" as const;
  return "outline" as const;
}

function stepTypeMeta(type: string, t?: (key: string) => string) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (type === "llm_call")
    return {
      label: tr("observability.step-type.llm", "LLM"),
      icon: BrainCircuit,
    };
  if (type === "web_search")
    return {
      label: tr("observability.step-type.web-search", "Web Search"),
      icon: Globe,
    };
  if (type === "retrieval")
    return {
      label: tr("observability.step-type.retrieval", "Retrieval"),
      icon: Search,
    };
  if (type === "tool_call")
    return { label: tr("observability.step-type.tool", "Tool"), icon: Wrench };
  if (type === "mcp_call")
    return { label: tr("observability.step-type.mcp", "MCP"), icon: Layers3 };
  return { label: type, icon: Layers3 };
}

function prettyJson(value: any) {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function RunStatusBadge({ status }: { status?: string | null }) {
  return (
    <Badge variant={statusBadgeVariant(status)}>
      {normalizeStatus(status)}
    </Badge>
  );
}
function shortId(id?: string) {
  if (!id) return "-";
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}
function formatNumber(value?: number) {
  return new Intl.NumberFormat().format(value || 0);
}
function statusDot(status?: string | null) {
  const n = normalizeStatus(status);
  if (n === "failed") return "bg-red-500";
  if (n === "running") return "bg-amber-500";
  if (n === "cancelled") return "bg-zinc-400";
  return "bg-emerald-500";
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{title}</p>
          <Icon className="w-4 h-4 text-muted-foreground/60" />
        </div>
        <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StepCard({
  step,
  maxLatency,
}: {
  step: RunStepRecord;
  maxLatency: number;
}) {
  const { t } = useTranslation();
  const meta = stepTypeMeta(step.step_type, t);
  const Icon = meta.icon;
  const width =
    maxLatency > 0
      ? Math.max(((step.latency_ms || 0) / maxLatency) * 100, 8)
      : 8;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-muted">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate font-medium text-sm">
                  {step.name || meta.label}
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {meta.label}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("observability.step-index", {
                  index: step.step_index + 1,
                  latency: step.latency_ms || 0,
                })}
              </p>
            </div>
          </div>
          <RunStatusBadge status={step.status} />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{t("observability.latency-ratio")}</span>
            <span>{Math.round(width)}%</span>
          </div>
          <Progress value={width} />
        </div>

        {step.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            {step.error}
          </div>
        )}

        <div className="grid gap-2 xl:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t("observability.input")}
            </p>
            <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted/30 p-2.5 text-xs whitespace-pre-wrap break-all">
              {prettyJson(step.input)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t("observability.output-metadata")}
            </p>
            <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted/30 p-2.5 text-xs whitespace-pre-wrap break-all">
              {step.output != null
                ? prettyJson(step.output)
                : prettyJson(step.metadata)}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TraceHeaderMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-r-0 sm:border-b-0 sm:border-r">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function RunDetailPage({ runId }: { runId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedbackPending, setFeedbackPending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["run-detail", runId],
    queryFn: () => obsApi.getRun(runId).then((r) => r.data),
  });
  const run = data?.run as RunRecord | undefined;
  const summary = data?.summary || {};
  const steps = (data?.steps || []) as RunStepRecord[];
  const scores = (data?.scores || []) as RunScoreRecord[];
  const artifacts = (data?.artifacts || []) as RunArtifactRecord[];
  const events = (data?.events || []) as RunEventRecord[];
  const maxLatency = Math.max(...steps.map((s) => s.latency_ms || 0), 1);

  const submitFeedback = async (value: "thumbs_up" | "thumbs_down") => {
    setFeedbackPending(true);
    try {
      await obsApi.feedback(runId, {
        name: "user_feedback",
        value,
        score_type: "categorical",
      });
      await queryClient.invalidateQueries({ queryKey: ["run-detail", runId] });
    } finally {
      setFeedbackPending(false);
    }
  };

  const exportCurrentRun = async () => {
    const response = await obsApi.exportRun(runId);
    const blob = new Blob([JSON.stringify(response.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="border border-border rounded-lg bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Button
              onClick={() => navigate("/observability")}
              variant="ghost"
              size="sm"
              className="mb-1 -ml-2 text-muted-foreground"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t("observability.back")}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${statusDot(summary.status || run?.status)}`}
              />
              <h1 className="text-lg font-semibold">
                {t("observability.trace-label")} {shortId(run?.id || runId)}
              </h1>
              <RunStatusBadge status={summary.status || run?.status} />
            </div>
            <p className="mt-1 truncate text-xs font-mono text-muted-foreground">
              {run?.id || runId}
            </p>
          </div>
          <Button onClick={exportCurrentRun} variant="outline" size="sm">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("observability.export-json")}
          </Button>
        </div>
        <div className="grid border-t border-border bg-muted/30 sm:grid-cols-3 lg:grid-cols-6">
          <TraceHeaderMetric
            label={t("observability.tokens")}
            value={formatNumber(summary.total_tokens || 0)}
          />
          <TraceHeaderMetric
            label={t("observability.latency")}
            value={`${summary.latency_ms || 0}ms`}
          />
          <TraceHeaderMetric
            label={t("observability.cost")}
            value={`$${(summary.total_cost || 0).toFixed(6)}`}
          />
          <TraceHeaderMetric
            label={t("observability.steps")}
            value={steps.length}
          />
          <TraceHeaderMetric
            label={t("observability.scores")}
            value={scores.length}
          />
          <TraceHeaderMetric
            label={t("observability.artifacts")}
            value={artifacts.length}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => submitFeedback("thumbs_up")}
                  disabled={feedbackPending}
                >
                  <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                  {t("observability.helpful")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => submitFeedback("thumbs_down")}
                  disabled={feedbackPending}
                >
                  <ThumbsDown className="mr-1.5 h-3.5 w-3.5" />
                  {t("observability.not-helpful")}
                </Button>
              </div>
              {summary.error_msg && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                  {summary.error_msg}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t("observability.timeline")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <ObservabilityTimelineSkeleton />}
              {!isLoading && steps.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("observability.no-step-data")}
                </p>
              )}
              {steps.map((step, i) => {
                const meta = stepTypeMeta(step.step_type, t);
                const Icon = meta.icon;
                return (
                  <div key={step.id} className="flex items-start gap-2.5">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      {i < steps.length - 1 && (
                        <div className="mt-1.5 h-6 w-px bg-border" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-medium">
                          {step.name || meta.label}
                        </p>
                        <RunStatusBadge status={step.status} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {stepTypeMeta(step.step_type, t).label} ·{" "}
                        {step.latency_ms || 0}ms
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t("observability.scores")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {scores.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("observability.no-scores")}
                </p>
              )}
              {scores.map((score) => (
                <div
                  key={score.id}
                  className="rounded-md border border-border bg-muted/20 p-2.5"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <p className="text-xs font-medium">{score.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {score.source}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs">{score.value}</p>
                  {score.comment && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {score.comment}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              <ObservabilityStepCardSkeleton />
              <ObservabilityStepCardSkeleton />
            </div>
          ) : (
            steps.map((step) => (
              <StepCard key={step.id} step={step} maxLatency={maxLatency} />
            ))
          )}

          {artifacts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t("observability.artifacts")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {artifacts.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-border bg-muted/20 p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-medium">{a.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {a.artifact_type}
                      </Badge>
                    </div>
                    <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-background p-2.5 text-xs">
                      {a.content}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {events.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t("observability.events")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-md border border-border bg-muted/20 p-2.5 text-xs"
                  >
                    <Badge variant="outline" className="text-[10px]">
                      {e.event_type}
                    </Badge>
                    <p className="mt-1.5 whitespace-pre-wrap break-all">
                      {e.content}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ObservabilityListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"runs" | "usage">("runs");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cleanupPending, setCleanupPending] = useState(false);

  const { data: runs = [] } = useQuery<RunRecord[]>({
    queryKey: ["runs", statusFilter],
    queryFn: () =>
      obsApi
        .listRuns({ status: statusFilter === "all" ? undefined : statusFilter })
        .then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["obs-stats"],
    queryFn: () => obsApi.getStats().then((r) => r.data),
    refetchInterval: 10000,
  });

  const refreshObservability = () => {
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
    void queryClient.invalidateQueries({ queryKey: ["obs-stats"] });
  };

  const cleanupOldRuns = async () => {
    setCleanupPending(true);
    try {
      await obsApi.cleanup({ retention_days: 30 });
      refreshObservability();
    } finally {
      setCleanupPending(false);
    }
  };

  const usageData: any[] = stats?.daily_usage || [];

  return (
    <TooltipProvider>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">
              {t("observability.traces-heading")}
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              {runs.length}
            </Badge>
          </div>
          <div className="flex gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshObservability}
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh traces</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cleanupOldRuns}
                  disabled={cleanupPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cleanup old runs</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title={t("observability.total-requests")}
            value={stats?.total_requests || 0}
            hint={t("observability.total-requests-hint")}
            icon={Activity}
          />
          <StatCard
            title={t("observability.tokens")}
            value={stats?.total_tokens || 0}
            hint={t("observability.tokens-hint")}
            icon={Hash}
          />
          <StatCard
            title={t("observability.total-cost")}
            value={`$${(stats?.total_cost || 0).toFixed(4)}`}
            hint={t("observability.total-cost-hint")}
            icon={DollarSign}
          />
          <StatCard
            title={t("observability.avg-latency")}
            value={`${stats?.avg_latency_ms || 0}ms`}
            hint={t("observability.avg-latency-hint")}
            icon={Clock}
          />
          <StatCard
            title={t("observability.success-rate")}
            value={`${stats?.success_rate || 0}%`}
            hint={t("observability.success-rate-hint", {
              count: stats?.failed_runs || 0,
            })}
            icon={ShieldCheck}
          />
          <StatCard
            title={t("observability.scores")}
            value={stats?.score_count || 0}
            hint={t("observability.scores-hint")}
            icon={Sparkles}
          />
          <StatCard
            title={t("observability.artifacts")}
            value={stats?.artifact_count || 0}
            hint={t("observability.artifacts-hint")}
            icon={FileText}
          />
          <StatCard
            title={t("observability.events")}
            value={stats?.event_count || 0}
            hint={t("observability.events-hint")}
            icon={MessageSquare}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-md bg-muted p-0.5">
            {(["runs", "usage"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={tab === v ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setTab(v)}
              >
                {v === "runs"
                  ? t("observability.runs-tab")
                  : t("observability.usage-tab")}
              </Button>
            ))}
          </div>
          {tab === "runs" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-7 text-xs">
                <SelectValue placeholder={t("observability.status-all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("observability.status-all")}
                </SelectItem>
                <SelectItem value="running">{t("running")}</SelectItem>
                <SelectItem value="failed">{t("failed")}</SelectItem>
                <SelectItem value="cancelled">{t("cancelled")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {tab === "runs" && (
          <Card className="overflow-hidden">
            {runs.length === 0 ? (
              <CardContent className="py-16 text-center text-muted-foreground text-sm">
                {t("observability.no-runs")}
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="grid grid-cols-[minmax(220px,1.6fr)_100px_100px_100px_140px_80px] border-b border-border bg-muted/40 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <div>{t("observability.trace-col")}</div>
                    <div>{t("status")}</div>
                    <div>{t("observability.tokens")}</div>
                    <div>{t("observability.latency")}</div>
                    <div>{t("observability.signals-col")}</div>
                    <div className="text-right">
                      {t("observability.open-col")}
                    </div>
                  </div>
                  {runs.map((run) => {
                    const totalTokens =
                      (run.input_tokens || 0) + (run.output_tokens || 0);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => navigate(`/observability/${run.id}`)}
                        className="grid w-full grid-cols-[minmax(220px,1.6fr)_100px_100px_100px_140px_80px] items-center border-b border-border px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full ${statusDot(run.status)}`}
                            />
                            <span className="font-mono text-xs font-medium">
                              {shortId(run.id)}
                            </span>
                            {run.error_msg && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1"
                              >
                                error
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {run.created_at
                              ? new Date(run.created_at).toLocaleString(
                                  i18n.language,
                                )
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <RunStatusBadge status={run.status} />
                        </div>
                        <div className="font-mono text-xs">
                          {formatNumber(totalTokens)}
                        </div>
                        <div className="font-mono text-xs">
                          {run.latency_ms || 0}ms
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                          <Badge variant="outline" className="text-[10px]">
                            {run.score_count || 0}S
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {run.artifact_count || 0}A
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {run.event_count || 0}E
                          </Badge>
                        </div>
                        <div className="flex justify-end">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        )}

        {tab === "usage" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t("observability.last14d-token")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usageData.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  {t("observability.no-stats")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={usageData}>
                    <defs>
                      <linearGradient id="usage-g" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#0f766e"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor="#0f766e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip />
                    <Area
                      type="monotone"
                      dataKey="total_tokens"
                      stroke="#0f766e"
                      fill="url(#usage-g)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}

export default function ObservabilityPage() {
  const { runId } = useParams();
  if (runId) return <RunDetailPage runId={runId} />;
  return <ObservabilityListPage />;
}
