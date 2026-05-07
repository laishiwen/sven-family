import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Eye,
  Download,
  TrendingUp,
  Globe,
  Monitor,
  Smartphone,
  Loader2,
  MousePointerClick,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface AnalyticsOverview {
  total_pv: number;
  total_downloads: number;
  pv_today: number;
  downloads_today: number;
}

interface PageViewsData {
  daily: Array<{ date: string; views: number }>;
  top_pages: Array<{ path: string; views: number }>;
  sources: Array<{ source: string; count: number }>;
}

interface DownloadsData {
  by_platform: Array<{ platform: string; downloads: number }>;
  by_day: Array<{ date: string; downloads: number }>;
}

type RawDownloadsData = {
  by_platform?:
    | Array<{ platform: string; downloads: number }>
    | Record<string, number>;
  by_day?: Array<{ date: string; downloads: number }>;
  items?: Array<{ created_at?: string | Date | null }>;
};

function normalizeDownloadsData(
  raw: RawDownloadsData | null | undefined,
): DownloadsData {
  const byPlatformRaw = raw?.by_platform;
  const by_platform = Array.isArray(byPlatformRaw)
    ? byPlatformRaw
    : Object.entries(byPlatformRaw || {}).map(([platform, downloads]) => ({
        platform,
        downloads: Number(downloads) || 0,
      }));

  const byDayRaw = raw?.by_day;
  if (Array.isArray(byDayRaw)) {
    return { by_platform, by_day: byDayRaw };
  }

  const bucket: Record<string, number> = {};
  for (const item of raw?.items || []) {
    if (!item?.created_at) continue;
    const parsed = new Date(item.created_at);
    if (Number.isNaN(parsed.getTime())) continue;
    const date = parsed.toISOString().slice(0, 10);
    bucket[date] = (bucket[date] || 0) + 1;
  }

  const by_day = Object.entries(bucket)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, downloads]) => ({ date, downloads }));

  return { by_platform, by_day };
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(38, 90%, 48%)",
  "hsl(45, 94%, 65%)",
  "hsl(42, 87%, 75%)",
  "hsl(40, 90%, 85%)",
  "hsl(38, 100%, 95%)",
];
const PLATFORM_COLORS: Record<string, string> = {
  "macos-arm64": "hsl(var(--primary))",
  "macos-x64": "hsl(38, 90%, 48%)",
  windows: "hsl(217, 91%, 60%)",
  linux: "hsl(263, 90%, 65%)",
};

export default function Analytics() {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState("7d");

  const { data: overview, isLoading: overviewLoading } =
    useQuery<AnalyticsOverview>({
      queryKey: ["analytics-overview"],
      queryFn: async () => {
        const res = await analyticsApi.overview();
        return res.data;
      },
    });

  const { data: pageViews, isLoading: pvLoading } = useQuery<PageViewsData>({
    queryKey: ["analytics-pageviews", dateRange],
    queryFn: async () => {
      const res = await analyticsApi.pageViews({ range: dateRange });
      return res.data;
    },
  });

  const { data: downloads, isLoading: dlLoading } = useQuery<DownloadsData>({
    queryKey: ["analytics-downloads", dateRange],
    queryFn: async () => {
      const res = await analyticsApi.downloads({ range: dateRange });
      return normalizeDownloadsData(res.data as RawDownloadsData);
    },
  });

  const statCards = [
    {
      label: t("analytics.total-pv"),
      value: overview?.total_pv ?? 0,
      icon: Eye,
      color: "text-blue-600",
    },
    {
      label: t("analytics.total-downloads"),
      value: overview?.total_downloads ?? 0,
      icon: Download,
      color: "text-emerald-600",
    },
    {
      label: t("analytics.pv-today"),
      value: overview?.pv_today ?? 0,
      icon: TrendingUp,
      color: "text-amber-600",
    },
    {
      label: t("analytics.downloads-today"),
      value: overview?.downloads_today ?? 0,
      icon: MousePointerClick,
      color: "text-purple-600",
    },
  ];

  const dailyData = pageViews?.daily || [];
  const topPages = pageViews?.top_pages || [];
  const sources = pageViews?.sources || [];
  const byPlatform = downloads?.by_platform || [];
  const byDay = downloads?.by_day || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {["7d", "30d", "90d"].map((range) => (
            <Button
              key={range}
              variant={dateRange === range ? "default" : "ghost"}
              size="sm"
              onClick={() => setDateRange(range)}
              className="text-xs h-8"
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <Card
            key={stat.label}
            className="animate-card-enter"
            style={{ animationDelay: `${idx * 0.05}s` }}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <div className="h-8 w-20 bg-muted animate-pulse rounded" />
              ) : (
                <p className="text-3xl font-bold font-serif">
                  {(stat.value ?? 0).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pageviews">
        <TabsList>
          <TabsTrigger value="pageviews" className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            {t("analytics.page-views")}
          </TabsTrigger>
          <TabsTrigger value="downloads" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            {t("analytics.downloads")}
          </TabsTrigger>
        </TabsList>

        {/* Page Views Tab */}
        <TabsContent value="pageviews" className="space-y-4">
          {/* Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-serif">
                {t("analytics.daily-pv")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pvLoading ? (
                <div className="h-72 bg-muted animate-pulse rounded-lg" />
              ) : dailyData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-72 text-center">
                  <BarChart3 className="w-10 h-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t("analytics.no-data")}
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                    />
                    <YAxis
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "13px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Pages */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">
                  {t("analytics.top-pages")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topPages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t("analytics.no-data")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {topPages.slice(0, 10).map((page, i) => (
                      <div key={page.path} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5">
                          {i + 1}.
                        </span>
                        <code className="flex-1 text-xs bg-muted px-2 py-1 rounded truncate">
                          {page.path}
                        </code>
                        <span className="text-sm font-medium">
                          {page.views.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Source Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">
                  {t("analytics.traffic-sources")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t("analytics.no-data")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sources.map((s, i) => {
                      const total = sources.reduce(
                        (sum, x) => sum + x.count,
                        0,
                      );
                      const pct =
                        total > 0 ? Math.round((s.count / total) * 100) : 0;
                      return (
                        <div key={s.source} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize">{s.source}</span>
                            <span className="font-medium">
                              {s.count.toLocaleString()} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: COLORS[i % COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Downloads Tab */}
        <TabsContent value="downloads" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Platform Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">
                  {t("analytics.downloads-by-platform")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dlLoading ? (
                  <div className="h-72 bg-muted animate-pulse rounded-lg" />
                ) : byPlatform.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-72 text-center">
                    <Download className="w-10 h-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {t("analytics.no-download-data")}
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={byPlatform}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="platform"
                        tick={{
                          fontSize: 11,
                          fill: "hsl(var(--muted-foreground))",
                        }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--muted-foreground))",
                        }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "13px",
                        }}
                      />
                      <Bar dataKey="downloads" radius={[4, 4, 0, 0]}>
                        {byPlatform.map((entry) => (
                          <Cell
                            key={entry.platform}
                            fill={
                              PLATFORM_COLORS[entry.platform] ||
                              "hsl(var(--primary))"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Daily Downloads Line Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">
                  {t("analytics.downloads-by-day")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dlLoading ? (
                  <div className="h-72 bg-muted animate-pulse rounded-lg" />
                ) : byDay.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-72 text-center">
                    <Download className="w-10 h-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {t("analytics.no-download-data")}
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={byDay}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--muted-foreground))",
                        }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--muted-foreground))",
                        }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "13px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="downloads"
                        stroke="hsl(217, 91%, 60%)"
                        strokeWidth={2}
                        dot={{ fill: "hsl(217, 91%, 60%)", r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
