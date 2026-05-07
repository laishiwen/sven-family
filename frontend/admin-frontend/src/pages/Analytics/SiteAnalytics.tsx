import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VisitStats {
  total_visits: number;
  unique_ips: number;
}

interface TopPage {
  page_path: string;
  visit_count: number;
  unique_ips: number;
}

interface DailyTrend {
  date: string;
  count: number;
}

export function SiteAnalytics() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [visitStats, setVisitStats] = useState<VisitStats | null>(null);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl =
        import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

      const [visitsRes, pagesRes, trendRes] = await Promise.all([
        fetch(
          `${baseUrl}/api/v1/site-stats/site/visits?start_date=${startDate}T00:00:00&end_date=${endDate}T23:59:59`,
        ),
        fetch(
          `${baseUrl}/api/v1/site-stats/site/visits?start_date=${startDate}T00:00:00&end_date=${endDate}T23:59:59`,
        ),
        fetch(
          `${baseUrl}/api/v1/site-stats/site/visits?start_date=${startDate}T00:00:00&end_date=${endDate}T23:59:59`,
        ),
      ]);

      const visitsData = await visitsRes.json();
      if (visitsData.status === "ok" && visitsData.data.summary) {
        setVisitStats(visitsData.data.summary);
        setTopPages(visitsData.data.top_pages || []);
        setDailyTrend(visitsData.data.daily_trend || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleDateChange = () => {
    fetchStats();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Site Analytics</h1>
        <p className="text-gray-600 mt-2">
          Track your website visits and downloads
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={handleDateChange} disabled={loading}>
              {loading ? "Loading..." : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {visitStats?.total_visits || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unique Visitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {visitStats?.unique_ips || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Visit Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#8884d8"
                name="Visits"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Pages */}
      <Card>
        <CardHeader>
          <CardTitle>Top Pages</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topPages}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="page_path" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="visit_count" fill="#8884d8" name="Visits" />
              <Bar dataKey="unique_ips" fill="#82ca9d" name="Unique IPs" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Pages Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2">Page Path</th>
                  <th className="text-right py-2">Visits</th>
                  <th className="text-right py-2">Unique IPs</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((page, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-2">{page.page_path}</td>
                    <td className="text-right">{page.visit_count}</td>
                    <td className="text-right">{page.unique_ips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
