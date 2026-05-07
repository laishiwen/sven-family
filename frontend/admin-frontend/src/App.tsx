import { Suspense, lazy, useEffect, useCallback } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import Layout from "@/components/layout/Layout";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { AUTH_EXPIRED_EVENT, resetAuthExpiredFlag } from "@/lib/api";

// Lazy-loaded pages
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const CommunityUsers = lazy(() => import("@/pages/CommunityUsers"));
const CommunityPosts = lazy(() => import("@/pages/CommunityPosts"));
const Memberships = lazy(() => import("@/pages/Memberships"));
const Orders = lazy(() => import("@/pages/Orders"));
const EngineManagement = lazy(() => import("@/pages/EngineManagement"));
const Crawler = lazy(() => import("@/pages/Crawler"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const StatsSite = lazy(() => import("@/pages/StatsSite"));
const StatsDesktop = lazy(() => import("@/pages/StatsDesktop"));
const StatsCommunity = lazy(() => import("@/pages/StatsCommunity"));
const Settings = lazy(() => import("@/pages/Settings"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const CommunitySections = lazy(() => import("@/pages/CommunitySections"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: (failureCount, error: any) => {
        // Don't retry 401 — let the auth expiry handler deal with it
        if (error?.response?.status === 401) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function AuthExpiredListener() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleAuthExpired = useCallback(() => {
    resetAuthExpiredFlag();
    toast("登录已过期", {
      description: "请重新登录后继续操作",
      variant: "destructive",
    });
    // Navigate via React Router instead of hard redirect
    navigate("/login", { state: { from: location }, replace: true });
  }, [navigate, location]);

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () =>
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [handleAuthExpired]);

  return null;
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthExpiredListener />
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* Protected routes with layout */}
        <Route
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/community/users" element={<CommunityUsers />} />
          <Route path="/community/posts" element={<CommunityPosts />} />
          <Route path="/community/sections" element={<CommunitySections />} />
          <Route path="/memberships" element={<Memberships />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/engines" element={<EngineManagement />} />
          <Route path="/crawler" element={<Crawler />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/stats/site" element={<StatsSite />} />
          <Route path="/stats/desktop" element={<StatsDesktop />} />
          <Route path="/stats/community" element={<StatsCommunity />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/system/admins" element={<AdminUsers />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </QueryClientProvider>
  );
}
