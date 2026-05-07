import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crawlerApi, communityApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search as SearchIcon,
  Plus,
  Edit3,
  Trash2,
  Play,
  Rss,
  Clock,
  BarChart3,
  CalendarDays,
  Tag,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  Minus,
  ExternalLink,
  Save,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CrawlerSource {
  id: string;
  name: string;
  site_url: string;
  rss_url: string;
  schedule_cron: string;
  enabled: boolean;
  tags: string | string[];
  auto_publish: boolean;
  last_run_at: string | null;
  last_status: string | null;
  created_at?: string;
}

interface CrawlerListResponse {
  items: CrawlerSource[];
  total: number;
  page: number;
  page_size: number;
}

interface CrawlerOverview {
  summary: {
    total_sources: number;
    enabled_sources: number;
    disabled_sources: number;
    auto_publish_sources: number;
    scheduled_in_next_24h: number;
  };
  status_counts: {
    running: number;
    success: number;
    failed: number;
    never: number;
    triggered?: number;
  };
  cron_stats: {
    valid: number;
    invalid: number;
    missing: number;
  };
  scheduler: {
    running: boolean;
    job_count: number;
  };
  upcoming_runs: Array<{
    source_id: string;
    source_name: string;
    next_run_at: string;
    schedule_cron: string;
  }>;
  recent_runs: Array<{
    source_id: string;
    source_name: string;
    last_run_at: string;
    last_status: string | null;
  }>;
  crawler_posts_total?: number;
  crawler_service_ok?: boolean;
}

interface CrawlerInjectedPost {
  id: string;
  title: string;
  source?: string;
  source_name?: string;
  section_name?: string;
  section_slug?: string;
  created_at?: string;
}

interface CrawlerInjectedPostList {
  items: CrawlerInjectedPost[];
  total: number;
  page: number;
  page_size: number;
}

interface CrawlerJob {
  id: string;
  job_key: string;
  name: string;
  description?: string | null;
  schedule_cron: string;
  enabled: boolean;
  auto_publish: boolean;
  posts_per_run?: number;
  last_run_at: string | null;
  last_status: string | null;
  last_post_id: string | null;
  target_sections?: string[];
}

interface CrawlerJobListResponse {
  items: CrawlerJob[];
}

interface Section {
  id: string;
  name: string;
  slug: string;
}

const emptyForm = {
  name: "",
  site_url: "",
  rss_url: "",
  schedule_cron: "0 */6 * * *",
  enabled: true,
  tags: "",
  auto_publish: true,
};

const cronPresets = [
  { label: "每30分钟", value: "*/30 * * * *" },
  { label: "每1小时", value: "0 * * * *" },
  { label: "每6小时", value: "0 */6 * * *" },
  { label: "每天凌晨2点", value: "0 2 * * *" },
];

export default function Crawler() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filterEnabled, setFilterEnabled] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<CrawlerSource | null>(
    null,
  );
  const [form, setForm] = useState(emptyForm);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [sourceRunAction, setSourceRunAction] = useState<"run" | "open" | null>(
    null,
  );
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [jobRunAction, setJobRunAction] = useState<"run" | "open" | null>(null);
  const [jobCronEdits, setJobCronEdits] = useState<Record<string, string>>({});
  const [jobSectionEdits, setJobSectionEdits] = useState<
    Record<string, string[]>
  >({});
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState<CrawlerJob | null>(null);
  const [jobForm, setJobForm] = useState({
    name: "",
    description: "",
    schedule_cron: "0 */6 * * *",
    enabled: true,
    auto_publish: true,
    posts_per_run: 1,
  });
  const [showDeleteJob, setShowDeleteJob] = useState<string | null>(null);

  const communityBaseUrl =
    import.meta.env.VITE_COMMUNITY_URL;

  const { data: overview, isLoading: isOverviewLoading } =
    useQuery<CrawlerOverview>({
      queryKey: ["crawler-overview"],
      queryFn: async () => {
        const res = await crawlerApi.overview();
        return res.data;
      },
      refetchInterval: 30000,
    });

  const { data, isLoading } = useQuery<CrawlerListResponse>({
    queryKey: ["crawler-sources", filterEnabled, searchTerm, page],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (filterEnabled !== "all") params.enabled = filterEnabled === "enabled";
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const res = await crawlerApi.list(params);
      return res.data;
    },
  });

  const { data: jobsData, isLoading: jobsLoading } =
    useQuery<CrawlerJobListResponse>({
      queryKey: ["crawler-jobs"],
      queryFn: async () => {
        const res = await crawlerApi.listJobs();
        return res.data;
      },
      refetchInterval: 30000,
    });

  const { data: injectedPostsData, isLoading: injectedLoading } =
    useQuery<CrawlerInjectedPostList>({
      queryKey: ["crawler-injected-posts"],
      queryFn: async () => {
        const res = await communityApi.listPosts({
          source: "crawler",
          page: 1,
          page_size: 8,
        });
        return res.data;
      },
      refetchInterval: 15000,
    });

  const { data: sectionsData } = useQuery<Section[]>({
    queryKey: ["community-sections-crawler"],
    queryFn: async () => {
      const res = await communityApi.getSections();
      return res.data;
    },
  });

  const patchCurrentSources = (
    updater: (old: CrawlerListResponse) => CrawlerListResponse,
  ) => {
    queryClient.setQueryData<CrawlerListResponse>(
      ["crawler-sources", filterEnabled],
      (old) => {
        if (!old) return old;
        return updater(old);
      },
    );
  };

  const patchJobs = (
    updater: (old: CrawlerJobListResponse) => CrawlerJobListResponse,
  ) => {
    queryClient.setQueryData<CrawlerJobListResponse>(
      ["crawler-jobs"],
      (old) => {
        if (!old) return old;
        return updater(old);
      },
    );
  };

  const createMutation = useMutation({
    mutationFn: (data: unknown) => crawlerApi.create(data),
    onSuccess: (resp) => {
      toast(t("crawler.created"), { variant: "success" });
      const created = resp?.data as CrawlerSource | undefined;
      if (created) {
        patchCurrentSources((old) => ({
          ...old,
          items: [created, ...old.items],
          total: old.total + 1,
        }));
      }
      closeForm();
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("crawler.create-failed"), {
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crawlerApi.delete(id),
    onSuccess: (_, deletedId) => {
      toast(t("crawler.deleted"), { variant: "success" });
      patchCurrentSources((old) => {
        const nextItems = old.items.filter((item) => item.id !== deletedId);
        return {
          ...old,
          items: nextItems,
          total: Math.max(0, old.total - (old.items.length - nextItems.length)),
        };
      });
      setShowDelete(null);
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("crawler.delete-failed"), {
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      crawlerApi.update(id, data),
    onSuccess: (resp) => {
      toast(t("crawler.updated"), { variant: "success" });
      const updated = resp?.data as CrawlerSource | undefined;
      if (updated) {
        patchCurrentSources((old) => ({
          ...old,
          items: old.items.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }));
      }
      closeForm();
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("crawler.update-failed"), {
        variant: "destructive",
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      crawlerApi.update(id, { enabled }),
    onSuccess: (resp) => {
      const updated = resp?.data as CrawlerSource | undefined;
      if (updated) {
        patchCurrentSources((old) => ({
          ...old,
          items: old.items.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }));
      }
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("crawler.toggle-failed"), {
        variant: "destructive",
      }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => crawlerApi.trigger(id),
    onMutate: (sourceId) => {
      // Optimistic update: instantly reflect last_run_at/last_status
      patchCurrentSources((old) => ({
        ...old,
        items: old.items.map((item) =>
          item.id === sourceId
            ? {
                ...item,
                last_run_at: new Date().toISOString(),
                last_status: "running",
              }
            : item,
        ),
      }));
    },
    onSuccess: (_resp, sourceId) => {
      toast(t("crawler.started"), { variant: "success" });

      patchCurrentSources((old) => ({
        ...old,
        items: old.items.map((item) =>
          item.id === sourceId
            ? {
                ...item,
                last_status: "triggered",
                last_run_at: new Date().toISOString(),
              }
            : item,
        ),
      }));

      queryClient.invalidateQueries({ queryKey: ["crawler-overview"] });
      setRunningSourceId(null);
      setSourceRunAction(null);
    },
    onError: (err: any, sourceId) => {
      patchCurrentSources((old) => ({
        ...old,
        items: old.items.map((item) =>
          item.id === sourceId ? { ...item, last_status: "failed" } : item,
        ),
      }));
      toast(err?.response?.data?.detail || t("crawler.start-failed"), {
        variant: "destructive",
      });
      setRunningSourceId(null);
      setSourceRunAction(null);
    },
  });

  const triggerJobMutation = useMutation({
    mutationFn: (id: string) => crawlerApi.triggerJob(id),
    onSuccess: (resp, jobId) => {
      toast(t("crawler.started"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["crawler-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["crawler-overview"] });
      queryClient.invalidateQueries({ queryKey: ["crawler-injected-posts"] });

      const postId = resp?.data?.post_id;
      if (jobRunAction === "open" && runningJobId === jobId && postId) {
        window.open(`${communityBaseUrl}/topics/${postId}`, "_blank");
      }
      setRunningJobId(null);
      setJobRunAction(null);
    },
    onError: (err: any) => {
      toast(err?.response?.data?.detail || t("crawler.start-failed"), {
        variant: "destructive",
      });
      setRunningJobId(null);
      setJobRunAction(null);
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      crawlerApi.updateJob(id, data),
    onSuccess: (resp) => {
      toast(t("crawler.updated"), { variant: "success" });
      const updated = resp?.data as CrawlerJob | undefined;
      if (updated) {
        patchJobs((old) => ({
          ...old,
          items: old.items.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }));
      }
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("crawler.update-failed"), {
        variant: "destructive",
      }),
  });

  const createJobMutation = useMutation({
    mutationFn: (data: unknown) => crawlerApi.createJob(data),
    onSuccess: (resp) => {
      toast(t("crawler.job-created"), { variant: "success" });
      const created = resp?.data as CrawlerJob | undefined;
      if (created) {
        patchJobs((old) => ({ ...old, items: [created, ...old.items] }));
      }
      setShowJobForm(false);
      setEditingJob(null);
      setJobForm({
        name: "",
        description: "",
        schedule_cron: "0 */6 * * *",
        enabled: true,
        auto_publish: true,
        posts_per_run: 1,
      });
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("crawler.job-create-failed"), {
        variant: "destructive",
      }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: string) => crawlerApi.deleteJob(id),
    onSuccess: (_, deletedId) => {
      toast(t("crawler.job-deleted"), { variant: "success" });
      patchJobs((old) => ({
        ...old,
        items: old.items.filter((item) => item.id !== deletedId),
      }));
      setShowDeleteJob(null);
    },
    onError: (err: any) =>
      toast(err?.response?.data?.detail || t("crawler.job-delete-failed"), {
        variant: "destructive",
      }),
  });

  const openNewForm = () => {
    setEditingSource(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (source: CrawlerSource) => {
    setEditingSource(source);
    setForm({
      name: source.name,
      site_url: source.site_url,
      rss_url: source.rss_url,
      schedule_cron: source.schedule_cron,
      enabled: source.enabled,
      tags: Array.isArray(source.tags) ? source.tags.join(",") : source.tags,
      auto_publish: source.auto_publish,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingSource(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast(t("crawler.name-required"), { variant: "destructive" });
      return;
    }
    const payload = { ...form };
    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleEnabled = (source: CrawlerSource) => {
    toggleMutation.mutate({ id: source.id, enabled: !source.enabled });
  };

  const sources = Array.isArray(data?.items) ? data.items : [];
  const jobs = Array.isArray(jobsData?.items) ? jobsData.items : [];
  const injectedPosts = Array.isArray(injectedPostsData?.items)
    ? injectedPostsData.items
    : [];
  const sections = Array.isArray(sectionsData) ? sectionsData : [];

  const sourceUsageRows = Object.values(
    injectedPosts.reduce(
      (acc, post) => {
        const key =
          (post.source_name || post.source || "").trim() || "__unknown";
        if (!acc[key]) {
          acc[key] = {
            key,
            name:
              (post.source_name || post.source || "").trim() ||
              t("crawler.source-unknown"),
            count: 0,
            latestAt: post.created_at || null,
          };
        }
        acc[key].count += 1;
        if (
          post.created_at &&
          (!acc[key].latestAt ||
            new Date(post.created_at).getTime() >
              new Date(acc[key].latestAt as string).getTime())
        ) {
          acc[key].latestAt = post.created_at;
        }
        return acc;
      },
      {} as Record<
        string,
        { key: string; name: string; count: number; latestAt: string | null }
      >,
    ),
  ).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  const sectionUsageRows = Object.values(
    injectedPosts.reduce(
      (acc, post) => {
        const key =
          (post.section_name || post.section_slug || "").trim() ||
          "__unassigned";
        if (!acc[key]) {
          acc[key] = {
            key,
            name:
              (post.section_name || post.section_slug || "").trim() ||
              t("crawler.section-unassigned"),
            count: 0,
            latestAt: post.created_at || null,
          };
        }
        acc[key].count += 1;
        if (
          post.created_at &&
          (!acc[key].latestAt ||
            new Date(post.created_at).getTime() >
              new Date(acc[key].latestAt as string).getTime())
        ) {
          acc[key].latestAt = post.created_at;
        }
        return acc;
      },
      {} as Record<
        string,
        { key: string; name: string; count: number; latestAt: string | null }
      >,
    ),
  ).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  const getJobSectionIds = (job: CrawlerJob) =>
    jobSectionEdits[job.id] ??
    (Array.isArray(job.target_sections) ? job.target_sections : []);

  const getSectionNameById = (sectionId: string) => {
    const section = sections.find((item) => item.id === sectionId);
    return section?.name || sectionId;
  };

  const toggleJobSection = (jobId: string, sectionId: string) => {
    setJobSectionEdits((prev) => {
      const current = prev[jobId] ?? [];
      const exists = current.includes(sectionId);
      const next = exists
        ? current.filter((item) => item !== sectionId)
        : [...current, sectionId];
      return {
        ...prev,
        [jobId]: next,
      };
    });
  };

  const saveJobSections = (job: CrawlerJob) => {
    updateJobMutation.mutate({
      id: job.id,
      data: {
        target_sections: getJobSectionIds(job),
      },
    });
  };

  const saveJobCron = (job: CrawlerJob) => {
    const cron = (jobCronEdits[job.id] ?? job.schedule_cron).trim();
    if (!cron) {
      toast(t("crawler.cron-required"), { variant: "destructive" });
      return;
    }
    updateJobMutation.mutate({
      id: job.id,
      data: {
        schedule_cron: cron,
      },
    });
  };
  const statusTotal =
    (overview?.status_counts.running ?? 0) +
    (overview?.status_counts.success ?? 0) +
    (overview?.status_counts.failed ?? 0) +
    (overview?.status_counts.never ?? 0);

  const statusRows = [
    {
      key: "success",
      label: t("crawler.status-success"),
      value: overview?.status_counts.success ?? 0,
      className: "bg-emerald-500",
    },
    {
      key: "running",
      label: t("crawler.status-running"),
      value: overview?.status_counts.running ?? 0,
      className: "bg-blue-500",
    },
    {
      key: "failed",
      label: t("crawler.status-failed"),
      value: overview?.status_counts.failed ?? 0,
      className: "bg-red-500",
    },
    {
      key: "triggered",
      label: "已触发",
      value: overview?.status_counts.triggered ?? 0,
      className: "bg-amber-400",
    },
    {
      key: "never",
      label: t("crawler.status-never"),
      value: overview?.status_counts.never ?? 0,
      className: "bg-slate-400",
    },
  ];

  const overviewCards = [
    {
      title: t("crawler.total-sources"),
      value: overview?.summary.total_sources ?? 0,
    },
    {
      title: "已采集帖子",
      value: overview?.crawler_posts_total ?? 0,
    },
    {
      title: "爬虫服务",
      value: overview?.crawler_service_ok ? "运行中" : "已停止",
      color: overview?.crawler_service_ok ? "text-emerald-600" : "text-red-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Business Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {overviewCards.map((item: any) => (
          <Card key={item.title}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{item.title}</p>
              <p className={`text-2xl font-semibold mt-1 ${item.color || ""}`}>
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div></div>
            {/* <CardTitle className="text-base">{t("crawler.biz-jobs")}</CardTitle> */}
            <Button
              size="sm"
              onClick={() => {
                setEditingJob(null);
                setJobForm({
                  name: "",
                  description: "",
                  schedule_cron: "0 */6 * * *",
                  enabled: true,
                  auto_publish: true,
                  posts_per_run: 1,
                });
                setShowJobForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              {t("crawler.add-job")}
            </Button>
          </div>
          {/* <p className="text-xs text-muted-foreground mt-1">
            {t("crawler.job-strategy-tip")}
          </p> */}
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-full bg-muted animate-pulse rounded" />
                  <div className="h-9 w-full bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crawler.no-jobs")}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`rounded-lg border p-4 space-y-3 transition-all ${
                    triggerJobMutation.isPending && runningJobId === job.id
                      ? "border-primary/40 ring-1 ring-primary/20 bg-primary/5 animate-pulse"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{job.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {job.description || "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingJob(job);
                          setJobForm({
                            name: job.name,
                            description: job.description || "",
                            schedule_cron: job.schedule_cron,
                            enabled: job.enabled,
                            auto_publish: job.auto_publish,
                            posts_per_run: job.posts_per_run ?? 1,
                          });
                          setShowJobForm(true);
                        }}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setShowDeleteJob(job.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Switch
                        checked={job.enabled}
                        onCheckedChange={(enabled) =>
                          updateJobMutation.mutate({
                            id: job.id,
                            data: { enabled },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={jobCronEdits[job.id] ?? job.schedule_cron}
                      onChange={(e) =>
                        setJobCronEdits((prev) => ({
                          ...prev,
                          [job.id]: e.target.value,
                        }))
                      }
                      placeholder={t("crawler.cron-placeholder")}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => saveJobCron(job)}
                      disabled={updateJobMutation.isPending}
                      title={t("crawler.save-schedule")}
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                    <div className="flex-1" />
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => triggerJobMutation.mutate(job.id)}
                      disabled={triggerJobMutation.isPending || !job.enabled}
                    >
                      {triggerJobMutation.isPending &&
                      runningJobId === job.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 mr-1" />
                      )}
                      立即采集
                    </Button>
                  </div>

                  <div className="space-y-2 rounded-md border border-border p-2">
                    <p className="text-xs text-muted-foreground">
                      {t("crawler.job-target-sections-edit")}
                    </p>
                    {sections.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {t("crawler.job-target-sections-loading")}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {sections.map((section) => {
                          const checked = getJobSectionIds(job).includes(
                            section.id,
                          );
                          return (
                            <button
                              key={section.id}
                              type="button"
                              onClick={() =>
                                toggleJobSection(job.id, section.id)
                              }
                              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                                checked
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                  : "bg-background text-muted-foreground border-border hover:border-primary/40"
                              }`}
                            >
                              {section.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveJobSections(job)}
                        disabled={updateJobMutation.isPending}
                      >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        {t("crawler.save-target-sections")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setJobSectionEdits((prev) => ({
                            ...prev,
                            [job.id]: sections.map((item) => item.id),
                          }))
                        }
                      >
                        {t("crawler.select-all-sections")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setJobSectionEdits((prev) => ({
                            ...prev,
                            [job.id]: [],
                          }))
                        }
                      >
                        {t("crawler.clear-sections")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Create/Edit Dialog */}
      <Dialog
        open={showJobForm}
        onOpenChange={(o) => {
          if (!o) {
            setShowJobForm(false);
            setEditingJob(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingJob ? t("crawler.edit-job") : t("crawler.add-job")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!jobForm.name.trim()) return;
              if (editingJob) {
                updateJobMutation.mutate({
                  id: editingJob.id,
                  data: {
                    name: jobForm.name,
                    description: jobForm.description,
                    schedule_cron: jobForm.schedule_cron,
                    enabled: jobForm.enabled,
                    auto_publish: jobForm.auto_publish,
                    posts_per_run: jobForm.posts_per_run,
                  },
                });
                setShowJobForm(false);
              } else {
                createJobMutation.mutate(jobForm);
              }
            }}
            className="space-y-4"
          >
            <div>
              <Label>{t("crawler.name")} *</Label>
              <Input
                className="mt-1"
                value={jobForm.name}
                onChange={(e) =>
                  setJobForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder={t("crawler.name-placeholder")}
              />
            </div>
            <div>
              <Label>{t("crawler.description")}</Label>
              <Input
                className="mt-1"
                value={jobForm.description}
                onChange={(e) =>
                  setJobForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder={t("crawler.description-placeholder")}
              />
            </div>
            <div>
              <Label>{t("crawler.schedule")}</Label>
              <Input
                className="mt-1 font-mono"
                value={jobForm.schedule_cron}
                onChange={(e) =>
                  setJobForm((f) => ({ ...f, schedule_cron: e.target.value }))
                }
                placeholder="0 */6 * * *"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {cronPresets.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="text-[11px] border rounded px-1.5 py-0.5 hover:bg-muted"
                    onClick={() =>
                      setJobForm((f) => ({ ...f, schedule_cron: p.value }))
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch
                  checked={jobForm.enabled}
                  onCheckedChange={(v) =>
                    setJobForm((f) => ({ ...f, enabled: v }))
                  }
                />
                {t("crawler.enabled")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch
                  checked={jobForm.auto_publish}
                  onCheckedChange={(v) =>
                    setJobForm((f) => ({ ...f, auto_publish: v }))
                  }
                />
                {t("crawler.auto-publish")}
              </label>
            </div>
            <div>
              <Label>每次发布数量 (1–5)</Label>
              <Input
                className="mt-1 w-24"
                type="number"
                min={1}
                max={5}
                value={jobForm.posts_per_run}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 1;
                  setJobForm((f) => ({
                    ...f,
                    posts_per_run: Math.max(1, Math.min(5, v)),
                  }));
                }}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowJobForm(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  createJobMutation.isPending || updateJobMutation.isPending
                }
              >
                {createJobMutation.isPending || updateJobMutation.isPending
                  ? t("saving")
                  : editingJob
                    ? t("save")
                    : t("crawler.add-job")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Job Delete Confirmation */}
      <Dialog
        open={!!showDeleteJob}
        onOpenChange={(o) => {
          if (!o) setShowDeleteJob(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              {t("crawler.delete-job-title")}
            </DialogTitle>
            <DialogDescription>
              {t("crawler.delete-job-desc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteJob(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showDeleteJob && deleteJobMutation.mutate(showDeleteJob)
              }
              disabled={deleteJobMutation.isPending}
            >
              {deleteJobMutation.isPending
                ? t("crawler.deleting")
                : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
