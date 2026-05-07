import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBackendStatusStore } from "@/stores/backendStatusStore";
import { useTranslation } from "react-i18next";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const { t } = useTranslation();
  const { isReachable } = useBackendStatusStore();
  const offline = !isReachable;

  const resolvedIcon = offline ? <AlertTriangle className="w-5 h-5" /> : icon;
  const resolvedTitle = offline ? t("empty-state.offline.title") : title;
  const resolvedDescription = offline
    ? t("empty-state.offline.description")
    : description;

  return (
    <div
      className={cn(
        offline
          ? "flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/30 bg-destructive/5 py-16 px-8 text-center"
          : "flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 py-16 px-8 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "mb-6 inline-flex items-center justify-center rounded-full p-4",
          offline ? "bg-destructive/10" : "bg-muted",
        )}
      >
        <div className={offline ? "text-destructive" : "text-muted-foreground"}>
          {resolvedIcon}
        </div>
      </div>
      <h3 className="mb-2 text-lg font-normal font-serif tracking-tight text-foreground">
        {resolvedTitle}
      </h3>
      {resolvedDescription && (
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          {resolvedDescription}
        </p>
      )}
      {!offline && action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
