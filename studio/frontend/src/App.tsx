import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";
import axios from "axios";
import { useAppStore } from "@/stores/appStore";
import { API_BASE } from "@/lib/api";
import { initDesktopTracking } from "@/lib/analytics";
import { useBackendStatusStore } from "@/stores/backendStatusStore";
import Layout from "@/components/layout/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ToastContainer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StudioConfigProvider } from "@/components/providers/StudioConfigProvider";

// Pages — lazy loaded to isolate module-level errors per page
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const ChatPage = lazy(() => import("@/pages/chat/ChatPage"));
const AgentsPage = lazy(() => import("@/pages/agents/AgentsPage"));
const LLMPage = lazy(() => import("@/pages/llm/LLMPage"));
const PromptsPage = lazy(() => import("@/pages/prompts/PromptsPage"));
const ToolsPage = lazy(() => import("@/pages/tools/ToolsPage"));
const SkillsPage = lazy(() => import("@/pages/skills/SkillsPage"));
const MCPPage = lazy(() => import("@/pages/mcp/MCPPage"));
const DatasetsPage = lazy(() => import("@/pages/datasets/DatasetsPage"));
const RAGPage = lazy(() => import("@/pages/rag/RAGPage"));
const MemoryPage = lazy(() => import("@/pages/memory/MemoryPage"));
const StorePage = lazy(() => import("@/pages/store/StorePage"));
const SchedulerPage = lazy(() => import("@/pages/scheduler/SchedulerPage"));
const ObservabilityPage = lazy(
  () => import("@/pages/observability/ObservabilityPage"),
);
const LoRAPage = lazy(() => import("@/pages/lora/LoRAPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const CommunityPage = lazy(() => import("@/pages/community/CommunityPage"));
const ChannelsPage = lazy(() => import("@/pages/channels/ChannelsPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const { theme } = useAppStore();
  const { setReachable, setChecking } = useBackendStatusStore();

  useEffect(() => {
    const isDark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    let id: number;

    const checkBackend = async () => {
      if (cancelled) return false;
      setChecking(true);
      try {
        await axios.get(`${API_BASE}/health`, { timeout: 3000 });
        if (!cancelled) setReachable(true);
        return true;
      } catch {
        if (!cancelled) setReachable(false);
        return false;
      }
    };

    void checkBackend();
    id = window.setInterval(() => {
      void checkBackend();
    }, 30000);

    // Silent desktop analytics
    initDesktopTracking();

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []); // Zustand actions are stable — empty deps prevents HMR cascade

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <StudioConfigProvider>
          <TooltipProvider>
            <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route
                  path="dashboard"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <DashboardPage />
                    </Suspense>
                  }
                />
                <Route
                  path="chat"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ChatPage />
                    </Suspense>
                  }
                />
                <Route
                  path="chat/:sessionId"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ChatPage />
                    </Suspense>
                  }
                />
                <Route
                  path="agents"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AgentsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="llm"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <LLMPage />
                    </Suspense>
                  }
                />
                <Route
                  path="prompts"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <PromptsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="tools"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ToolsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="skills"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <SkillsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="mcp"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <MCPPage />
                    </Suspense>
                  }
                />
                <Route
                  path="datasets"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <DatasetsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="rag"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RAGPage />
                    </Suspense>
                  }
                />
                <Route
                  path="memory"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <MemoryPage />
                    </Suspense>
                  }
                />
                <Route
                  path="store"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <StorePage />
                    </Suspense>
                  }
                />
                <Route
                  path="scheduler"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <SchedulerPage />
                    </Suspense>
                  }
                />
                <Route
                  path="observability"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ObservabilityPage />
                    </Suspense>
                  }
                />
                <Route
                  path="observability/:runId"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ObservabilityPage />
                    </Suspense>
                  }
                />
                <Route
                  path="lora"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <LoRAPage />
                    </Suspense>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <SettingsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="community"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <CommunityPage />
                    </Suspense>
                  }
                />
                <Route
                  path="channels"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ChannelsPage />
                    </Suspense>
                  }
                />
              </Route>
            </Routes>
          </BrowserRouter>
          </TooltipProvider>
          <ToastContainer />
        </StudioConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
