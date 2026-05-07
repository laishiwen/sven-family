import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { statsApi } from "@/lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TIME_OPTIONS = [
  { label: "今天", value: "today" }, { label: "3天", value: "3d" }, { label: "7天", value: "7d" },
  { label: "本月", value: "month" }, { label: "季度", value: "quarter" }, { label: "年度", value: "year" }, { label: "全部", value: "all" },
];
const COLORS = ["#D97706", "#2563EB", "#059669", "#7C3AED", "#DC2626", "#0891B2"];

export default function StatsDesktopPage() {
  const [timeRange, setTimeRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_events: 0, unique_ips: 0, unique_sessions: 0 });
  const [trend, setTrend] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [details, setDetails] = useState<any[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { time_range: timeRange };
      const [s, t, p] = await Promise.all([statsApi.desktop.stats(params), statsApi.desktop.trend(params), statsApi.desktop.platforms(params)]);
      if (s.data?.data) setStats(s.data.data);
      if (t.data?.data) setTrend(t.data.data);
      if (p.data?.data) setPlatforms(p.data.data);
    } catch { /* silent */ }
    setLoading(false);
  }, [timeRange]);

  const fetchDetails = useCallback(async (page: number) => {
    setDetailsLoading(true);
    try {
      const res = await statsApi.desktop.details({ page, limit: pageSize });
      if (res.data?.data) setDetails(res.data.data);
      if (res.data?.pagination) setDetailTotal(res.data.pagination.total);
    } catch { /* silent */ }
    setDetailsLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchDetails(detailPage); }, [detailPage, fetchDetails]);

  const totalPages = Math.ceil(detailTotal / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">客户端统计</h1><p className="text-muted-foreground mt-1">Studio 桌面端使用数据</p></div>
        <div className="flex gap-1">{TIME_OPTIONS.map(o => (
          <Button key={o.value} variant={timeRange === o.value ? "default" : "outline"} size="sm" onClick={() => setTimeRange(o.value)}>{o.label}</Button>
        ))}</div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i}><CardHeader><Skeleton className="h-4 w-20" /></CardHeader><CardContent><Skeleton className="h-9 w-16" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">活跃用户数</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats.unique_ips.toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">活跃会话数</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats.unique_sessions.toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">总启动次数</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats.total_events.toLocaleString()}</div></CardContent></Card>
        </div>
      )}

      {loading ? <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card> : (
        <Card><CardHeader><CardTitle>每日活跃趋势</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={300}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={12} /><YAxis /><Tooltip /><Line type="monotone" dataKey="count" stroke="#2563EB" name="启动次数" /></LineChart></ResponsiveContainer></CardContent></Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card> : (
          <Card><CardHeader><CardTitle>平台分布</CardTitle></CardHeader>
            <CardContent><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={platforms} dataKey="count" nameKey="os" cx="50%" cy="50%" outerRadius={100} label={({ os, count }: any) => `${os}: ${count}`}>{platforms.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
        )}
        {loading ? <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card> : (
          <Card><CardHeader><CardTitle>平台详情</CardTitle></CardHeader>
            <CardContent><table className="w-full text-sm"><thead className="border-b"><tr><th className="text-left py-2">操作系统</th><th className="text-right py-2">用户数</th><th className="text-right py-2">占比</th></tr></thead>
              <tbody>{platforms.map((p: any, i: number) => { const total = platforms.reduce((s: number, x: any) => s + x.count, 0); return <tr key={i} className="border-b hover:bg-muted/30"><td className="py-2">{p.os || "unknown"}</td><td className="text-right">{p.count.toLocaleString()}</td><td className="text-right">{total ? ((p.count / total) * 100).toFixed(1) + "%" : "-"}</td></tr>; })}</tbody></table></CardContent></Card>
        )}
      </div>

      {/* Desktop user details table */}
      {detailsLoading ? (
        <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle>用户详情 ({detailTotal})</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={detailPage <= 1} onClick={() => setDetailPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm text-muted-foreground">{detailPage} / {totalPages || 1}</span>
              <Button variant="outline" size="sm" disabled={detailPage >= totalPages} onClick={() => setDetailPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30"><tr><th className="text-left py-2 px-2">IP</th><th className="text-left py-2 px-2">OS</th><th className="text-left py-2 px-2">CPU</th><th className="text-left py-2 px-2">版本</th><th className="text-left py-2 px-2">机器信息</th><th className="text-left py-2 px-2">UA</th><th className="text-left py-2 px-2">时间</th></tr></thead>
                <tbody>{details.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-mono text-xs">{r.user_ip}</td>
                    <td className="py-2 px-2 text-xs">{r.os_name || "-"} {r.os_version || ""}</td>
                    <td className="py-2 px-2 text-xs">{r.cpu_arch || "-"}</td>
                    <td className="py-2 px-2 text-xs">{r.app_version || "-"}</td>
                    <td className="py-2 px-2 text-xs max-w-[200px] truncate" title={JSON.stringify(r.machine_info)}>{r.machine_info ? `${r.machine_info.platform || ""} ${r.machine_info.screenSize || ""}`.trim() || "-" : "-"}</td>
                    <td className="py-2 px-2 text-xs max-w-[200px] truncate" title={r.user_ua}>{r.user_ua || "-"}</td>
                    <td className="py-2 px-2 text-xs whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
