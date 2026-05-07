import React, { useState, useEffect } from "react";
import {
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

interface DownloadStat {
  file_id: string;
  file_name: string;
  total_downloads: number;
  total_size?: number;
}

export function DownloadAnalytics() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [downloads, setDownloads] = useState<DownloadStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDownloads, setTotalDownloads] = useState(0);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl =
        import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(
        `${baseUrl}/api/v1/site-stats/site/downloads?start_date=${startDate}T00:00:00&end_date=${endDate}T23:59:59`,
      );

      const data = await response.json();
      if (data.status === "ok" && data.data.data) {
        setDownloads(data.data.data);
        const total = data.data.data.reduce(
          (sum: number, d: DownloadStat) => sum + d.total_downloads,
          0,
        );
        setTotalDownloads(total);
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

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "-";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Download Analytics</h1>
        <p className="text-gray-600 mt-2">Track file downloads</p>
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

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Total Downloads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{totalDownloads}</div>
          <p className="text-sm text-gray-600 mt-2">
            {downloads.length} unique files
          </p>
        </CardContent>
      </Card>

      {/* Downloads Chart */}
      <Card>
        <CardHeader>
          <CardTitle>File Download Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={downloads}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="file_name"
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_downloads" fill="#8884d8" name="Downloads" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Download Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2">File Name</th>
                  <th className="text-left py-2">File ID</th>
                  <th className="text-right py-2">Downloads</th>
                  <th className="text-right py-2">Total Size</th>
                </tr>
              </thead>
              <tbody>
                {downloads.map((d) => (
                  <tr key={d.file_id} className="border-b hover:bg-gray-50">
                    <td className="py-2">{d.file_name}</td>
                    <td className="py-2 text-xs font-mono">{d.file_id}</td>
                    <td className="text-right">{d.total_downloads}</td>
                    <td className="text-right">{formatBytes(d.total_size)}</td>
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
