import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

type SchedulerStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";
type SchedulerTask = {
  id: string;
  title: string;
  description?: string | null;
  trigger_time: string;
  status: SchedulerStatus;
  agent_name?: string | null;
};

const schedulerApi = {
  list: () => api.get("/scheduler/tasks"),
  pause: (id: string) => api.post("/scheduler/tasks/" + id + "/pause"),
  resume: (id: string) => api.post("/scheduler/tasks/" + id + "/resume"),
  delete: (id: string) => api.delete("/scheduler/tasks/" + id),
};

const STATUS_I18N_KEY: Record<SchedulerStatus, string> = {
  pending: "pending",
  running: "running",
  paused: "scheduler.status.paused",
  completed: "completed",
  failed: "failed",
};
const STATUS_BADGE_CLASS: Record<SchedulerStatus, string> = {
  pending: "border-amber-300 bg-amber-100 text-amber-800",
  running: "border-blue-300 bg-blue-100 text-blue-800",
  paused: "border-slate-300 bg-slate-100 text-slate-800",
  completed: "border-emerald-300 bg-emerald-100 text-emerald-800",
  failed: "border-rose-300 bg-rose-100 text-rose-800",
};

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function normalizeTasks(payload: unknown): SchedulerTask[] {
  if (Array.isArray(payload)) return payload as SchedulerTask[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown[] }).items)
  )
    return (payload as { items: SchedulerTask[] }).items;
  return [];
}

function TaskGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-3 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({
  task,
  isPausing,
  isResuming,
  isDeleting,
  onPause,
  onResume,
  onDelete,
}: {
  task: SchedulerTask;
  isPausing: boolean;
  isResuming: boolean;
  isDeleting: boolean;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onDelete: (task: SchedulerTask) => void;
}) {
  const { t, i18n } = useTranslation();
  const isActionDisabled = isPausing || isResuming || isDeleting;

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-accent/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-medium text-sm truncate">{task.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
            {task.description?.trim() || t("scheduler.no-description")}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[10px] capitalize",
            STATUS_BADGE_CLASS[task.status],
          )}
        >
          {t(STATUS_I18N_KEY[task.status])}
        </Badge>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3" />
          {formatTime(task.trigger_time, i18n.language)}
        </div>
        <div className="flex items-center gap-1.5">
          <Bot className="h-3 w-3" />
          {task.agent_name?.trim() || t("scheduler.unknown-agent")}
        </div>
      </div>
      <div className="flex gap-1.5">
        {task.status === "paused" ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={isActionDisabled}
            onClick={() => onResume(task.id)}
          >
            {isResuming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {t("scheduler.resume")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={
              isActionDisabled ||
              task.status === "completed" ||
              task.status === "failed"
            }
            onClick={() => onPause(task.id)}
          >
            {isPausing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
            {t("scheduler.pause")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          disabled={isActionDisabled}
          onClick={() => onDelete(task)}
        >
          {isDeleting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          {t("scheduler.delete")}
        </Button>
      </div>
    </div>
  );
}

export default function SchedulerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [pendingDeleteTask, setPendingDeleteTask] =
    useState<SchedulerTask | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["scheduler-tasks"],
    queryFn: async () => {
      const response = await schedulerApi.list();
      return normalizeTasks(response.data);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => schedulerApi.pause(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] });
      addToast({ type: "success", message: t("scheduler.toast.paused") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: String(
          error?.response?.data?.detail || t("scheduler.toast.pause-failed"),
        ),
      });
    },
  });
  const resumeMutation = useMutation({
    mutationFn: (id: string) => schedulerApi.resume(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] });
      addToast({ type: "success", message: t("scheduler.toast.resumed") });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: String(
          error?.response?.data?.detail || t("scheduler.toast.resume-failed"),
        ),
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => schedulerApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scheduler-tasks"] });
      addToast({ type: "success", message: t("scheduler.toast.deleted") });
      setPendingDeleteTask(null);
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message: String(
          error?.response?.data?.detail || t("scheduler.toast.delete-failed"),
        ),
      });
    },
  });

  const tasks = tasksQuery.data ?? [];
  const deletingTaskId = useMemo(
    () => (deleteMutation.variables as string | undefined) ?? "",
    [deleteMutation.variables],
  );
  const pausingTaskId = useMemo(
    () => (pauseMutation.variables as string | undefined) ?? "",
    [pauseMutation.variables],
  );
  const resumingTaskId = useMemo(
    () => (resumeMutation.variables as string | undefined) ?? "",
    [resumeMutation.variables],
  );

  return (
    <div className="p-6 space-y-4">
      {tasksQuery.isLoading ? (
        <TaskGridSkeleton />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-5 w-5" />}
          title={t("scheduler.empty.title")}
          description={t("scheduler.empty.description")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isPausing={pauseMutation.isPending && pausingTaskId === task.id}
              isResuming={
                resumeMutation.isPending && resumingTaskId === task.id
              }
              isDeleting={
                deleteMutation.isPending && deletingTaskId === task.id
              }
              onPause={(id) => pauseMutation.mutate(id)}
              onResume={(id) => resumeMutation.mutate(id)}
              onDelete={(t) => setPendingDeleteTask(t)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDeleteTask}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTask(null);
        }}
        title={t("scheduler.confirm-delete-title")}
        description={
          pendingDeleteTask
            ? t("scheduler.confirm-delete-description", {
                name: pendingDeleteTask.title,
              })
            : undefined
        }
        confirmText={t("scheduler.delete")}
        onConfirm={() => {
          if (!pendingDeleteTask) return;
          deleteMutation.mutate(pendingDeleteTask.id);
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
