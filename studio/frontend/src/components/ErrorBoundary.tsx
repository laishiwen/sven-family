import { Component, type ReactNode } from "react";
import i18n from "@/i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 p-8">
          <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-800 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              {i18n.t("error-boundary.title")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {i18n.t("error-boundary.description")}
            </p>
            <pre className="text-xs bg-slate-100 dark:bg-slate-900 rounded-lg p-3 overflow-auto max-h-40 text-red-500">
              {this.state.error?.message}
            </pre>
            <button
              className="mt-4 btn-primary"
              onClick={() => window.location.reload()}
            >
              {i18n.t("error-boundary.reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
