import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { statsApi } from "@/lib/api";
import { ChevronLeft, ChevronRight, Users, Eye, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TIME_OPTIONS = [
  { label: "今天", value: "today" }, { label: "3天", value: "3d" }, { label: "7天", value: "7d" },
  { label: "本月", value: "month" }, { label: "季度", value: "quarter" }, { label: "年度", value: "year" }, { label: "全部", value: "all" },
];

export default function StatsCommunityPage() {
  const [timeRange, setTimeRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_visits: 0, unique_ips: 0, unique_sessions: 0, anonymous_visits: 0, registered_visits: 0 });
  const [trend, setTrend] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [details, setDetails] = useState<any[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { time_range: timeRange };
      const [s, t, p] = await Promise.all([statsApi.community.stats(params), statsApi.community.trend(params), statsApi.community.topPages({ ...params, limit: 10 })]);
      if (s.data?.data) setStats(s.data.data);
      if (t.data?.data) setTrend(t.data.data);
      if (p.data?.data) setTopPages(p.data.data);
    } catch { /* silent */ }
    setLoading(false);
  }, [timeRange]);

  const fetchDetails = useCallback(async (page: number) => {
    setDetailsLoading(true);
    try {
      const res = await statsApi.community.details({ page, limit: pageSize });
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
        <div><h1 className="text-3xl font-bold">社区统计</h1><p className="text-muted-foreground mt-1">社区访问与用户数据</p></div>
        <div className="flex gap-1">{TIME_OPTIONS.map(o => (
          <Button key={o.value} variant={timeRange === o.value ? "default" : "outline"} size="sm" onClick={() => setTimeRange(o.value)}>{o.label}</Button>
        ))}</div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Card key={i}><CardHeader><Skeleton className="h-4 w-20" /></CardHeader><CardContent><Skeleton className="h-9 w-16" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">总访问量</CardTitle><Eye className="w-4 h-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-3xl font-bold">{stats.total_visits.toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">独立访客</CardTitle><Users className="w-4 h-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-3xl font-bold">{stats.unique_ips.toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">注册用户</CardTitle><UserCheck className="w-4 h-4 text-blue-500" /></CardHeader><CardContent><div className="text-3xl font-bold text-blue-600">{stats.registered_visits.toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">匿名访问</CardTitle><Eye className="w-4 h-4 text-amber-500" /></CardHeader><CardContent><div className="text-3xl font-bold text-amber-600">{stats.anonymous_visits.toLocaleString()}</div></CardContent></Card>
        </div>
      )}

      {loading ? <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card> : (
        <Card><CardHeader><CardTitle>每日访问趋势（注册 vs 匿名）</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={300}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={12} /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="count" stroke="#D97706" name="总访问" /><Line type="monotone" dataKey="registered" stroke="#2563EB" name="注册用户" /><Line type="monotone" dataKey="anonymous" stroke="#9CA3AF" name="匿名用户" strokeDasharray="4 4" /></LineChart></ResponsiveContainer></CardContent></Card>
      )}

      {loading ? <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card> : (
        <Card><CardHeader><CardTitle>热门页面 TOP10</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={topPages} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="page_path" width={140} fontSize={11} /><Tooltip /><Bar dataKey="visit_count" fill="#D97706" name="访问量" /></BarChart></ResponsiveContainer></CardContent></Card>
      )}

      {/* Community visitor details */}
      {detailsLoading ? (
        <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle>访问详情 ({detailTotal})</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={detailPage <= 1} onClick={() => setDetailPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm text-muted-foreground">{detailPage} / {totalPages || 1}</span>
              <Button variant="outline" size="sm" disabled={detailPage >= totalPages} onClick={() => setDetailPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30"><tr><th className="text-left py-2 px-2">IP</th><th className="text-left py-2 px-2">页面</th><th className="text-left py-2 px-2">用户类型</th><th className="text-left py-2 px-2">用户ID</th><th className="text-left py-2 px-2">UA</th><th className="text-left py-2 px-2">设备</th><th className="text-left py-2 px-2">时间</th></tr></thead>
                <tbody>{details.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-mono text-xs">{r.user_ip}</td>
                    <td className="py-2 px-2 font-mono text-xs max-w-[180px] truncate" title={r.page_path}>{r.page_path}</td>
                    <td className="py-2 px-2 text-xs">{r.community_user_id ? <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">注册</Badge> : <Badge variant="secondary" className="text-[10px]">匿名</Badge>}</td>
                    <td className="py-2 px-2 font-mono text-xs max-w-[100px] truncate" title={r.community_user_id}>{r.community_user_id || "-"}</td>
                    <td className="py-2 px-2 text-xs max-w-[200px] truncate" title={r.user_ua}>{r.user_ua || "-"}</td>
                    <td className="py-2 px-2 text-xs">{r.device_type || "-"}</td>
                    <td className="py-2 px-2 text-xs whitespace-nowrap">{r.visited_at ? new Date(r.visited_at).toLocaleString() : "-"}</td>
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
