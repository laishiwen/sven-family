import { useState, useCallback } from "react";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

let toastListeners: Array<(toast: Toast) => void> = [];
let toastCount = 0;

export function toast(
  title: string,
  opts?: { description?: string; variant?: Toast["variant"] },
) {
  const id = `toast-${++toastCount}`;
  const t: Toast = { id, title, description: opts?.description, variant: opts?.variant ?? "default" };
  toastListeners.forEach((fn) => fn(t));
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Toast) => {
    setToasts((prev) => [...prev, t]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 4500);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  useState(() => {
    toastListeners.push(addToast);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== addToast);
    };
  });

  return { toasts, dismiss, toast: addToast };
}
