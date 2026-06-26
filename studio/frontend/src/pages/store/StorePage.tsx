import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CheckCircle,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { capabilitiesApi, settingsApi, storeApi } from "@/lib/api";
import { useToastStore } from "@/stores/toastStore";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SERVICE_CATEGORIES: Record<
  string,
  { labelKey: string; types: string[] }
> = {
  vector: {
    labelKey: "store.category.vector",
    types: ["milvus", "qdrant", "weaviate", "chroma", "pinecone"],
  },
  sql: {
    labelKey: "store.category.sql",
    types: ["sqlite", "postgresql", "mysql", "mongodb"],
  },
  cache: {
    labelKey: "store.category.cache",
    types: ["redis", "kafka", "rabbitmq", "elasticsearch"],
  },
};

function getCategoryKey(type: string): string {
  for (const [key, { types }] of Object.entries(SERVICE_CATEGORIES)) {
    if (types.includes(type)) return key;
  }
  return "sql";
}

function buildDefaultServices(t: (key: string) => string) {
  return [
    {
      name: t("store.default.sqlite"),
      service_type: "sqlite",
      health_status: "healthy",
      is_default: true,
    },
    {
      name: t("store.default.milvus"),
      service_type: "milvus",
      health_status: "healthy",
      is_default: true,
    },
  ];
}

type CapabilityOption = { value: string; label: string };

function categoryLabel(value: string, t: (key: string) => string) {
  if (value === "vector") return t("store.category.vector");
  if (value === "cache") return t("store.category.cache");
  if (value === "storage") return t("store.category.storage");
  return t("store.category.fallback");
}

function isDatabaseService(service: any): boolean {
  const st = String(service?.service_type || "").toLowerCase();
  const cat = String(service?.category || "").toLowerCase();
  return (
    cat === "database" ||
    ["sqlite", "postgresql", "mysql", "mongodb"].includes(st)
  );
}

function isVectorService(service: any): boolean {
  const cat = String(
    service?.category || getCategoryKey(service?.service_type || ""),
  ).toLowerCase();
  return cat === "vector";
}

function prettyDate(value?: string | null, locale?: string, fallback?: string) {
  if (!value) return fallback || "-";
  return new Date(value).toLocaleString(locale);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function inferHomeDirFromUserDataPath(userDataPath: string): string {
  const normalized = String(userDataPath || "").replace(/\\/g, "/");
  if (!normalized) return "";
  const macIndex = normalized.indexOf("/Library/");
  if (macIndex > 0) return normalized.slice(0, macIndex);
  const winIndex = normalized.indexOf("/AppData/");
  if (winIndex > 1) return normalized.slice(0, winIndex);
  const linuxIndex = normalized.indexOf("/.config/");
  if (linuxIndex > 0) return normalized.slice(0, linuxIndex);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return normalized;
  return normalized.startsWith("/")
    ? `/${parts.slice(0, -1).join("/")}`
    : parts.slice(0, -1).join("/");
}

function toAbsolutePath(value: string, fallbackBase: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const base = String(fallbackBase || "").trim();
  if (raw === "~") return base || "";
  if (raw.startsWith("~/")) {
    return base ? `${base.replace(/\/$/, "")}/${raw.slice(2)}` : raw;
  }
  if (raw.startsWith("file://")) {
    return decodeURIComponent(raw.replace(/^file:\/\//, ""));
  }
  if (isAbsolutePath(raw)) {
    return raw;
  }
  if (!base) return raw;
  return `${base.replace(/\/$/, "")}/${raw.replace(/^\.\//, "")}`;
}

function resolveStorageFilePath(
  svc: any,
  dataDir: string,
  sqlitePath: string,
  milvusPath: string,
): string {
  const serviceType = String(svc?.service_type || "").toLowerCase();
  const explicit = String(svc?.connection_url || "").trim();
  const isUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(explicit);

  if (explicit && !isUrl) {
    return toAbsolutePath(explicit, dataDir);
  }
  if (serviceType === "sqlite" && sqlitePath) {
    return toAbsolutePath(sqlitePath, dataDir);
  }
  if (serviceType === "milvus" && milvusPath) {
    return toAbsolutePath(milvusPath, dataDir);
  }

  const base = toAbsolutePath(dataDir, dataDir);
  if (!base) return "";
  const idPart = String(svc?.id || svc?.name || "service")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  return `${base.replace(/\/$/, "")}/store/${serviceType || "service"}/${idPart}.data`;
}

function AddServiceModal({
  storeTypes,
  onClose,
}: {
  storeTypes: CapabilityOption[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const defaultType = storeTypes[0]?.value || "sqlite";
  const [form, setForm] = useState({
    name: "",
    category: "database",
    service_type: defaultType,
    connection_url: "",
    config_json: "{}",
    enabled_capabilities_json: "[]",
  });
  const createMut = useMutation({
    mutationFn: (data: any) => storeApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-services"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base">
            {t("store.modal.add-service")}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            <Label>{t("store.name")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Store"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("store.category")}</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="database">
                    {t("store.category.sql")}
                  </SelectItem>
                  <SelectItem value="vector">
                    {t("store.category.vector")}
                  </SelectItem>
                  <SelectItem value="cache">
                    {t("store.category.cache")}
                  </SelectItem>
                  <SelectItem value="storage">
                    {t("store.category.storage")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("store.type")}</Label>
              <Select
                value={form.service_type}
                onValueChange={(v) => setForm({ ...form, service_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {storeTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("store.connection-url")}</Label>
            <Input
              className="font-mono text-sm"
              value={form.connection_url}
              onChange={(e) =>
                setForm({ ...form, connection_url: e.target.value })
              }
              placeholder="/path/to/service"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("store.enabled-capabilities-json")}</Label>
            <Input
              className="font-mono text-sm"
              value={form.enabled_capabilities_json}
              onChange={(e) =>
                setForm({ ...form, enabled_capabilities_json: e.target.value })
              }
              placeholder='["query","export","import"]'
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("store.config-json")}</Label>
            <Textarea
              className="min-h-[100px] font-mono text-xs"
              value={form.config_json}
              onChange={(e) =>
                setForm({ ...form, config_json: e.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!form.name || createMut.isPending}
            onClick={() => createMut.mutate(form)}
          >
            {createMut.isPending ? t("store.adding") : t("store.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceCard({
  svc,
  onHealthCheck,
  databaseServiceCount,
  storageFilePath,
}: {
  svc: any;
  onHealthCheck: (id: string) => void;
  databaseServiceCount: number;
  storageFilePath: string;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTextInput, setConfirmTextInput] = useState("");
  const deleteDisabled =
    isVectorService(svc) ||
    (isDatabaseService(svc) && databaseServiceCount <= 1);
  const deleteMut = useMutation({
    mutationFn: () => storeApi.delete(svc.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-services"] });
      addToast({
        type: "success",
        message: t("store.toast.deleted", { name: svc.name }),
      });
    },
    onError: (error: any) => {
      addToast({
        type: "error",
        message:
          error?.response?.data?.detail || t("store.toast.delete-failed"),
      });
    },
  });

  const statusIcon =
    svc.health_status === "healthy" ? (
      <CheckCircle className="w-4 h-4 text-emerald-500" />
    ) : svc.health_status === "unhealthy" ? (
      <XCircle className="w-4 h-4 text-red-500" />
    ) : svc.health_status === "checking" ? (
      <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
    ) : (
      <div className="w-4 h-4 rounded-full bg-muted-foreground/30" />
    );

  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Database className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-sm">{svc.name}</p>
              <Badge variant="secondary" className="text-[10px]">
                {svc.service_type}
              </Badge>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-0.5 break-all">
              {t("store.file-path")}: {storageFilePath}
            </p>
            {svc.last_checked_at && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("store.last-check")}:{" "}
                {prettyDate(svc.last_checked_at, i18n.language)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {statusIcon}
          {svc.id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onHealthCheck(svc.id)}
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Check health</TooltipContent>
            </Tooltip>
          )}
          {svc.id && !deleteDisabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setConfirmTextInput("");
                    setConfirmOpen(true);
                  }}
                >
                  <X className="w-3 h-3 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove service</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmTextInput("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("store.confirm-delete-title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("store.confirm-delete-description", { name: svc.name })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("store.confirm-input.description", { value: t("confirm") })}
            </p>
            <Input
              value={confirmTextInput}
              onChange={(e) => setConfirmTextInput(e.target.value)}
              placeholder={t("confirm")}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmTextInput("");
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={
                deleteMut.isPending || confirmTextInput.trim() !== t("confirm")
              }
              onClick={() => {
                deleteMut.mutate();
                setConfirmOpen(false);
                setConfirmTextInput("");
              }}
            >
              {deleteMut.isPending ? t("common.processing") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function StorePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [homeDir, setHomeDir] = useState("");
  const [desktopDataDir, setDesktopDataDir] = useState("");

  useEffect(() => {
    let active = true;
    const loadDesktopPaths = async () => {
      try {
        const info = await window.__electron__?.getInfo?.();
        if (active && info?.dataDir) {
          setDesktopDataDir(String(info.dataDir).trim());
        }
        const userDataPath = await window.__electron__?.getUserDataPath?.();
        if (!active || !userDataPath) return;
        const home = inferHomeDirFromUserDataPath(userDataPath);
        if (home) setHomeDir(home);
      } catch {
        // Ignore and keep runtime-derived paths.
      }
    };
    void loadDesktopPaths();
    return () => {
      active = false;
    };
  }, []);

  const { data: capabilities } = useQuery({
    queryKey: ["capabilities", "store"],
    queryFn: () => capabilitiesApi.registry().then((r) => r.data),
  });
  const { data: services = [] } = useQuery({
    queryKey: ["store-services"],
    queryFn: () => storeApi.list().then((r) => r.data),
  });
  const { data: runtimeInfo = {} } = useQuery({
    queryKey: ["settings-runtime"],
    queryFn: () => settingsApi.getRuntime().then((r) => r.data),
  });
  const { data: envInfo = [] } = useQuery({
    queryKey: ["settings-environment"],
    queryFn: () => settingsApi.getEnvironment().then((r) => r.data),
  });
  const healthMut = useMutation({
    mutationFn: (id: string) => storeApi.healthCheck(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-services"] }),
  });

  const defaultServices = buildDefaultServices(t);
  const displayServices: any[] =
    (services as any[]).length > 0 ? (services as any[]) : defaultServices;
  const storeTypes = (capabilities?.store_types || []) as CapabilityOption[];

  const getByCategory = (catKey: string) =>
    displayServices.filter(
      (s: any) => getCategoryKey(s.service_type) === catKey,
    );
  const total = displayServices.length;
  const databaseServiceCount = displayServices.filter(isDatabaseService).length;
  const runtime = runtimeInfo as any;
  const envMap = (envInfo as any[]).reduce(
    (acc, item) => {
      if (item?.key && item?.value_preview) acc[item.key] = item.value_preview;
      return acc;
    },
    {} as Record<string, string>,
  );
  const rawDataDir = String(
    desktopDataDir || envMap.APP_DATA_DIR || runtime.data_dir || "~/.sven",
  ).trim();
  const dataDir = toAbsolutePath(rawDataDir, homeDir);
  const baseDir = dataDir.replace(/\/$/, "");
  const sqlitePath = String(
    (baseDir ? `${baseDir}/sven_studio.db` : "") || runtime.sqlite_path || "",
  ).trim();
  const milvusPath = String(
    (baseDir ? `${baseDir}/vector_store/milvus_lite.db` : "") ||
      envMap.MILVUS_LITE_PATH ||
      "",
  ).trim();

  return (
    <div className="pt-4 px-6 pb-6 space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          {t("store.add-service")}
        </Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all" className="text-xs">
            {t("store.tab.all")} ({total})
          </TabsTrigger>
          {Object.entries(SERVICE_CATEGORIES).map(([key, { labelKey }]) => (
            <TabsTrigger key={key} value={key} className="text-xs">
              {t(labelKey)} ({getByCategory(key).length})
            </TabsTrigger>
          ))}
        </TabsList>

        {(["all", "vector", "sql", "cache"] as const).map((tab) => {
          const list = tab === "all" ? displayServices : getByCategory(tab);
          return (
            <TabsContent key={tab} value={tab} className="mt-3">
              {list.length === 0 ? (
                <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
                  <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {t("store.empty-category")}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-2">
                  {list.map((svc: any, i: number) => {
                    const storageFilePath = resolveStorageFilePath(
                      svc,
                      dataDir,
                      sqlitePath,
                      milvusPath,
                    );
                    return (
                      <ServiceCard
                        key={svc.id || i}
                        svc={svc}
                        onHealthCheck={(id) => healthMut.mutate(id)}
                        databaseServiceCount={databaseServiceCount}
                        storageFilePath={storageFilePath}
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {showAdd && (
        <AddServiceModal
          storeTypes={storeTypes}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
