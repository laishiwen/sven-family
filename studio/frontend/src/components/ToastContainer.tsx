import { useEffect } from "react";
import {
  type Toast as ToastItem,
  type ToastType,
  useToastStore,
} from "../stores/toastStore";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] space-y-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

interface ToastProps {
  toast: ToastItem;
  onClose: () => void;
}

function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(onClose, toast.duration ?? 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onClose]);

  const iconMap: Record<ToastType, JSX.Element> = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
  };

  const colorMap: Record<ToastType, string> = {
    success:
      "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400",
    error:
      "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400",
    warning:
      "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400",
    info: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400",
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg pointer-events-auto animate-in fade-in slide-in-from-top-2 ${colorMap[toast.type]}`}
    >
      <div className="flex-shrink-0 mt-0.5">{iconMap[toast.type]}</div>
      <div className="flex-1 min-w-0">
        {toast.title && <p className="font-semibold text-sm">{toast.title}</p>}
        <p className={`text-sm ${toast.title ? "mt-0.5" : ""} break-words`}>
          {toast.message}
        </p>
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
