import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { statsApi } from "@/lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TIME_OPTIONS = [
  { label: "今天", value: "today" }, { label: "3天", value: "3d" }, { label: "7天", value: "7d" },
  { label: "本月", value: "month" }, { label: "季度", value: "quarter" }, { label: "年度", value: "year" }, { label: "全部", value: "all" },
];

function CardSkeleton() {
  return <Card><CardHeader><Skeleton className="h-4 w-20" /></CardHeader><CardContent><Skeleton className="h-9 w-16" /></CardContent></Card>;
}

function ChartSkeleton() {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>;
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>;
}

export default function StatsSitePage() {
  const [timeRange, setTimeRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState({ total_visits: 0, unique_ips: 0 });
  const [trend, setTrend] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [details, setDetails] = useState<any[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { time_range: timeRange };
      const [v, t, p, d] = await Promise.all([
        statsApi.site.visits(params), statsApi.site.trend(params),
        statsApi.site.topPages({ ...params, limit: 10 }), statsApi.site.downloads(params),
      ]);
      if (v.data?.data) setVisits(v.data.data);
      if (t.data?.data) setTrend(t.data.data);
      if (p.data?.data) setTopPages(p.data.data);
      if (d.data?.data?.data) setDownloads(d.data.data.data);
    } catch { /* silent */ }
    setLoading(false);
  }, [timeRange]);

  const fetchDetails = useCallback(async (page: number) => {
    setDetailsLoading(true);
    try {
      const res = await statsApi.site.details({ page, limit: pageSize });
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
        <div><h1 className="text-3xl font-bold">官网统计</h1><p className="text-muted-foreground mt-1">页面访问与下载数据</p></div>
        <div className="flex gap-1">{TIME_OPTIONS.map(o => (
          <Button key={o.value} variant={timeRange === o.value ? "default" : "outline"} size="sm" onClick={() => setTimeRange(o.value)}>{o.label}</Button>
        ))}</div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">总访问量</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{visits.total_visits.toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">独立访客</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{visits.unique_ips.toLocaleString()}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">总下载</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{downloads.reduce((s: number, d: any) => s + (d.total_downloads || 0), 0).toLocaleString()}</div></CardContent></Card>
        </div>
      )}

      {loading ? <ChartSkeleton /> : (
        <Card><CardHeader><CardTitle>每日访问趋势</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={300}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={12} /><YAxis /><Tooltip /><Line type="monotone" dataKey="count" stroke="#D97706" name="访问量" /></LineChart></ResponsiveContainer></CardContent></Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? <ChartSkeleton /> : (
          <Card><CardHeader><CardTitle>热门页面 TOP10</CardTitle></CardHeader>
            <CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={topPages} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="page_path" width={120} fontSize={11} /><Tooltip /><Bar dataKey="visit_count" fill="#D97706" name="访问量" /></BarChart></ResponsiveContainer></CardContent></Card>
        )}
        {loading ? <ChartSkeleton /> : (
          <Card><CardHeader><CardTitle>下载统计</CardTitle></CardHeader>
            <CardContent>{downloads.length === 0 ? <p className="text-sm text-muted-foreground">暂无下载数据</p> : (
              <table className="w-full text-sm"><thead className="border-b"><tr><th className="text-left py-2">文件</th><th className="text-right py-2">下载次数</th><th className="text-right py-2">总大小</th></tr></thead>
                <tbody>{downloads.map((d: any, i: number) => (<tr key={i} className="border-b"><td className="py-2">{d.file_name}</td><td className="text-right">{d.total_downloads}</td><td className="text-right">{d.total_size ? `${(d.total_size / 1024 / 1024).toFixed(1)} MB` : "-"}</td></tr>))}</tbody></table>)}</CardContent></Card>
        )}
      </div>

      {/* Visitor details table */}
      {detailsLoading ? <TableSkeleton rows={8} /> : (
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
                <thead className="border-b bg-muted/30"><tr><th className="text-left py-2 px-2">IP</th><th className="text-left py-2 px-2">页面</th><th className="text-left py-2 px-2">UA</th><th className="text-left py-2 px-2">设备</th><th className="text-left py-2 px-2">来源</th><th className="text-left py-2 px-2">时间</th></tr></thead>
                <tbody>{details.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-mono text-xs">{r.user_ip}</td>
                    <td className="py-2 px-2 font-mono text-xs max-w-[200px] truncate" title={r.page_path}>{r.page_path}</td>
                    <td className="py-2 px-2 text-xs max-w-[250px] truncate" title={r.user_ua}>{r.user_ua || "-"}</td>
                    <td className="py-2 px-2 text-xs">{r.device_type || "-"}</td>
                    <td className="py-2 px-2 text-xs max-w-[150px] truncate" title={r.referrer}>{r.referrer || "-"}</td>
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
