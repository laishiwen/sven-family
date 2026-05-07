import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { dashboardApi, communityApi, statsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  Users,
  FileText,
  Eye,
  CreditCard,
  Clock,
  ShoppingCart,
  Globe,
  Monitor,
  MessageSquare,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";

interface DashboardOverview {
  admin_count: number;
  membership_count: number;
  active_subscriptions: number;
  total_orders: number;
  pending_orders: number;
  orders_today: number;
  page_views_today: number;
  downloads_today: number;
  crawler_sources: number;
  audit_logs: number;
  telemetry_entries: number;
}

const getStatCards = (t: (key: string) => string) => [
  {
    key: "admin_count",
    label: t("dashboard.admin-count"),
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    key: "active_subscriptions",
    label: t("dashboard.active-subs"),
    icon: CreditCard,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    key: "total_orders",
    label: t("dashboard.total-orders"),
    icon: ShoppingCart,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    key: "pending_orders",
    label: t("dashboard.pending-orders"),
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    key: "page_views_today",
    label: t("dashboard.today-pv"),
    icon: Eye,
    color: "text-sky-600",
    bg: "bg-sky-50",
  },
  {
    key: "crawler_sources",
    label: t("dashboard.crawler-sources"),
    icon: FileText,
    color: "text-amber-700",
    bg: "bg-amber-50",
  },
];

export default function Dashboard() {
  const { t } = useTranslation();

  const { data: overview, isLoading: overviewLoading } =
    useQuery<DashboardOverview>({
      queryKey: ["dashboard-overview"],
      queryFn: async () => {
        const res = await dashboardApi.stats();
        return res.data;
      },
    });

  // Today's stats from 3 sources
  const { data: siteStats, isLoading: siteLoading } = useQuery({
    queryKey: ["dashboard-site-stats"],
    queryFn: async () => {
      const r = await statsApi.site.visits({ time_range: "today" });
      return r.data?.data;
    },
  });
  const { data: desktopStats, isLoading: desktopLoading } = useQuery({
    queryKey: ["dashboard-desktop-stats"],
    queryFn: async () => {
      const r = await statsApi.desktop.stats({ time_range: "today" });
      return r.data?.data;
    },
  });
  const { data: communityStats, isLoading: communityLoading } = useQuery({
    queryKey: ["dashboard-community-stats"],
    queryFn: async () => {
      const r = await statsApi.community.stats({ time_range: "today" });
      return r.data?.data;
    },
  });

  // Recent community posts
  const { data: recentPosts, isLoading: postsLoading } = useQuery({
    queryKey: ["dashboard-recent-posts"],
    queryFn: async () => {
      const res = await communityApi.listPosts({ page: 1, page_size: 5 });
      return res.data?.items || [];
    },
  });

  const getStatValue = (key: string): string | number => {
    if (!overview) return "—";
    return ((overview as any)[key] ?? 0).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {getStatCards(t).map((stat, idx) => (
          <Card
            key={stat.key}
            className="animate-card-enter"
            style={{ animationDelay: `${idx * 0.05}s` }}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <div
                className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}
              >
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold font-serif">
                  {getStatValue(stat.key)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform live overview + Recent community posts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Platform live overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-serif flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              {t("dashboard.platform-live-overview")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Site card */}
            <Link to="/stats/site" className="block group">
              <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-card hover:bg-accent/40 hover:border-sky-300/50 transition-all duration-200 hover:shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Globe className="w-5 h-5 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t("dashboard.site")}</p>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    {siteLoading ? (
                      <Skeleton className="h-7 w-12" />
                    ) : (
                      <span className="text-2xl font-bold font-serif tabular-nums">
                        {siteStats?.total_visits ?? 0}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.today-visits")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {siteStats?.unique_ips ?? "—"}
                      </span>{" "}
                      {t("dashboard.unique-ip")}
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Desktop card */}
            <Link to="/stats/desktop" className="block group">
              <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-card hover:bg-accent/40 hover:border-blue-300/50 transition-all duration-200 hover:shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Monitor className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {t("dashboard.desktop")}
                    </p>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    {desktopLoading ? (
                      <Skeleton className="h-7 w-12" />
                    ) : (
                      <span className="text-2xl font-bold font-serif tabular-nums">
                        {desktopStats?.unique_ips ?? 0}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.active-users")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {desktopStats?.total_events ?? "—"}
                      </span>{" "}
                      {t("dashboard.launch-count")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {desktopStats?.unique_sessions ?? "—"}
                      </span>{" "}
                      {t("dashboard.sessions")}
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Community card */}
            <Link to="/stats/community" className="block group">
              <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-card hover:bg-accent/40 hover:border-amber-300/50 transition-all duration-200 hover:shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <MessageSquare className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {t("dashboard.community")}
                    </p>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    {communityLoading ? (
                      <Skeleton className="h-7 w-12" />
                    ) : (
                      <span className="text-2xl font-bold font-serif tabular-nums">
                        {communityStats?.total_visits ?? 0}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.today-visits")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-blue-600">
                        {communityStats?.registered_visits ?? "—"}
                      </span>{" "}
                      {t("dashboard.registered")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-amber-600">
                        {communityStats?.anonymous_visits ?? "—"}
                      </span>{" "}
                      {t("dashboard.anonymous")}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* Recent community posts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                {t("dashboard.recent-community-posts")}
              </CardTitle>
              <Link
                to="/community/posts"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                {t("dashboard.view-all")} <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {postsLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2">
                    <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !recentPosts || recentPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <MessageSquare className="w-5 h-5 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.no-community-posts")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentPosts.map((post: any, idx: number) => (
                  <Link
                    key={post.id}
                    to={`/community/posts`}
                    className="flex items-start gap-3 px-5 py-3 hover:bg-accent/50 transition-colors group/item"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium text-muted-foreground group-hover/item:bg-amber-50 group-hover/item:text-amber-600 transition-colors">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate group-hover/item:text-foreground transition-colors">
                          {post.title || post.name || "Untitled"}
                        </p>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {post.created_at ? formatDate(post.created_at) : "—"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {post.description ||
                          post.excerpt ||
                          (typeof post.content === "string"
                            ? post.content.slice(0, 80)
                            : null) ||
                          "—"}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-muted-foreground/70">
                          {post.author_name ||
                            post.author ||
                            post.user_id ||
                            "—"}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
