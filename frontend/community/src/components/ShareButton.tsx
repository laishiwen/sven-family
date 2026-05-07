"use client";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import { useShare } from "@/hooks/useShare";

export function ShareButton({ title, url, text }: { title: string; url: string; text?: string }) {
  const { t } = useTranslation();
  const { share } = useShare();
  return (
    <button onClick={() => share({ title, url, text })} className="p-1.5 rounded-md hover:bg-muted transition-colors" title={t("share.title")}>
      <Share2 className="w-4 h-4" />
    </button>
  );
}
