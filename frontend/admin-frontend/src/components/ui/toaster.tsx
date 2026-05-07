import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border bg-card p-4 shadow-lg animate-card-enter",
            t.variant === "destructive" && "border-red-200 bg-red-50",
            t.variant === "success" && "border-emerald-200 bg-emerald-50",
          )}
        >
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm font-medium",
                t.variant === "destructive" && "text-red-800",
                t.variant === "success" && "text-emerald-800",
              )}
            >
              {t.title}
            </p>
            {t.description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.description}
              </p>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
