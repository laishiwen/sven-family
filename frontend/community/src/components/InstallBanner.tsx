"use client";
import { useTranslation } from "react-i18next";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Download, X } from "lucide-react";
import { useState } from "react";

export function InstallBanner() {
  const { t } = useTranslation();
  const { canInstall, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 shadow-lg">
      <div>
        <p className="text-sm font-medium">{t("install.title")}</p>
        <p className="text-xs text-muted-foreground">{t("install.subtitle")}</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={install} className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium">
          <Download className="w-3.5 h-3.5" /> {t("install.button")}
        </button>
        <button onClick={() => setDismissed(true)} className="p-1.5 rounded-lg hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
