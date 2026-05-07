import { useState } from "react";
import { AlertTriangle, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/api";
import { electron, isDesktop } from "@/lib/electron";
import { useBackendStatusStore } from "@/stores/backendStatusStore";
import { useTranslation } from "react-i18next";

type BackendStatusBannerProps = {
  onRefresh: () => Promise<boolean>;
};

export function BackendStatusBanner({ onRefresh }: BackendStatusBannerProps) {
  const { t } = useTranslation();
  const { isReachable, checkedAt, isChecking } = useBackendStatusStore();
  const [lastRetryFailed, setLastRetryFailed] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const desktopBridge = isDesktop ? electron : null;

  if (isReachable) {
    return null;
  }

  const lastCheckedText = checkedAt
    ? new Date(checkedAt).toLocaleTimeString()
    : t("backend-status.not-checked");

  return (
    <Card className="mx-6 mt-4 border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {t("backend-status.fetch-failed-title")}
              </p>
              <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
                <Server className="h-3 w-3" />
                {t("backend-status.load-failed")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("backend-status.reconnecting", {
                time: lastCheckedText,
              })}
            </p>
            {lastRetryFailed ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("backend-status.retry-failed")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {desktopBridge ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setIsRestarting(true);
                try {
                  await desktopBridge.restartSidecar();
                  const ok = await onRefresh();
                  setLastRetryFailed(!ok);
                } catch {
                  setLastRetryFailed(true);
                } finally {
                  setIsRestarting(false);
                }
              }}
              disabled={isRestarting || isChecking}
              className="gap-2"
            >
              <Server className="h-4 w-4" />
              {isRestarting
                ? t("common.processing")
                : t("backend-status.restart-service")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const ok = await onRefresh();
              setLastRetryFailed(!ok);
            }}
            disabled={isChecking}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`}
            />
            {isChecking
              ? t("backend-status.fetching")
              : t("backend-status.refetch")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
